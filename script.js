let testMode = 'quick';
let isTestRunning = false;
let latencyData = [];
let downloadSpeedData = [];
let uploadSpeedData = [];
let pingInterval = null;
let testResults = { download: 0, upload: 0, ping: 0, jitter: 0, packetLoss: 0 };
let recentPings = [];

const testConfig = {
    quick:    { duration: 10, pingInterval: 300 },
    normal:   { duration: 25, pingInterval: 250 },
    extended: { duration: 50, pingInterval: 200 }
};

document.addEventListener('DOMContentLoaded', () => {
    fetchIPInfo();
    initCanvas();
    document.getElementById('start-test').addEventListener('click', startTest);
    document.getElementById('toggle-stats').addEventListener('click', toggleStats);
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            testMode = e.currentTarget.dataset.mode;
        });
    });
});

async function fetchIPInfo() {
    try {
        const r = await fetch('https://api.ipify.org?format=json');
        const { ip } = await r.json();
        const d = await (await fetch(`https://ipapi.co/${ip}/json/`)).json();
        
        document.getElementById('ip-address').textContent = d.ip;
        let isp = (d.org || '').replace(/^AS\d+\s+/, '');
        document.getElementById('isp').textContent = isp.substring(0, 35) || 'Bilinmiyor';
        const loc = d.city && d.country_name ? `${d.city}, ${d.country_name}` : 'Bilinmiyor';
        document.getElementById('location').textContent = loc;
        document.getElementById('server-location').textContent = loc;

        const conn = navigator.connection;
        let cType = 'Ethernet/WiFi';
        if (conn) {
            if (conn.type === 'wifi') cType = 'WiFi';
            else if (conn.type === 'ethernet') cType = 'Ethernet';
            else if (conn.effectiveType === '4g') cType = '4G/LTE';
            else if (conn.effectiveType === '3g') cType = '3G';
            else if (conn.effectiveType === '2g') cType = '2G';
            else if (conn.downlink > 50) cType = 'Fiber';
        }
        document.getElementById('connection-type').textContent = cType;
    } catch {
        ['ip-address','isp','location','connection-type'].forEach(id => {
            document.getElementById(id).textContent = 'Bilinmiyor';
        });
        document.getElementById('server-location').textContent = 'Bilinmiyor';
    }
}

let speedCanvas, speedCtx;
function initCanvas() {
    speedCanvas = document.getElementById('speedometer');
    speedCtx = speedCanvas.getContext('2d');
    drawGauge(0, 500);
}

function drawGauge(speed, max) {
    const cx = speedCanvas.width / 2, cy = speedCanvas.height / 2, r = 160;
    speedCtx.clearRect(0, 0, speedCanvas.width, speedCanvas.height);

    speedCtx.strokeStyle = '#1e2d45';
    speedCtx.lineWidth = 22;
    speedCtx.lineCap = 'round';
    speedCtx.beginPath();
    speedCtx.arc(cx, cy, r, 0.75 * Math.PI, 2.25 * Math.PI);
    speedCtx.stroke();

    const angle = 0.75 * Math.PI + Math.min(speed / max, 1) * 1.5 * Math.PI;
    const g = speedCtx.createLinearGradient(0, 0, speedCanvas.width, 0);
    g.addColorStop(0, '#00f0ff');
    g.addColorStop(0.5, '#bf00ff');
    g.addColorStop(1, '#00ff88');
    speedCtx.strokeStyle = g;
    speedCtx.lineWidth = 22;
    speedCtx.shadowBlur = 25;
    speedCtx.shadowColor = '#00f0ff';
    speedCtx.beginPath();
    speedCtx.arc(cx, cy, r, 0.75 * Math.PI, angle);
    speedCtx.stroke();
    speedCtx.shadowBlur = 0;

    for (let i = 0; i <= 10; i++) {
        const a = 0.75 * Math.PI + (i / 10) * 1.5 * Math.PI;
        speedCtx.strokeStyle = '#3a4a60';
        speedCtx.lineWidth = 2;
        speedCtx.beginPath();
        speedCtx.moveTo(cx + Math.cos(a) * (r - 28), cy + Math.sin(a) * (r - 28));
        speedCtx.lineTo(cx + Math.cos(a) * (r - 15), cy + Math.sin(a) * (r - 15));
        speedCtx.stroke();
    }
}

async function startTest() {
    if (isTestRunning) { stopTest(); return; }

    isTestRunning = true;
    latencyData = [];
    downloadSpeedData = [];
    uploadSpeedData = [];
    recentPings = [];
    testResults = { download: 0, upload: 0, ping: 0, jitter: 0, packetLoss: 0 };

    document.getElementById('start-test').classList.add('testing');
    document.getElementById('start-test').querySelector('.btn-text').textContent = 'Durdur';

    ['download-speed','upload-speed','ping-value','jitter-value'].forEach(id => {
        document.getElementById(id).textContent = id.includes('speed') ? '-- Mbps' : '-- ms';
    });
    document.getElementById('current-speed').textContent = '0';
    drawGauge(0, 500);
    clearCanvas('speed-canvas');
    clearCanvas('latency-canvas');
    updateStatus('Test başlıyor...');

    const config = testConfig[testMode];
    const startTime = Date.now();

    startPingLoop(config.pingInterval);

    await Promise.all([
        runDownloadTest(config.duration),
        runUploadTest(config.duration)
    ]);

    stopPingLoop();
    finalizeStats();
    document.getElementById('test-duration').textContent = `${((Date.now() - startTime) / 1000).toFixed(1)} sn`;
    stopTest();

    const statsContent = document.getElementById('stats-content');
    const statsBtn = document.getElementById('toggle-stats');
    if (!statsContent.classList.contains('active')) {
        statsContent.classList.add('active');
        statsBtn.textContent = '▲';
    }
}

function stopTest() {
    isTestRunning = false;
    stopPingLoop();
    document.getElementById('start-test').classList.remove('testing');
    document.getElementById('start-test').querySelector('.btn-text').textContent = 'Testi Başlat';
    updateStatus('Test tamamlandı');
}

function startPingLoop(interval) {
    let errors = 0;
    let total = 0;

    async function doPing() {
        if (!isTestRunning) return;

        const start = performance.now();
        try {
            await fetch('https://1.1.1.1/cdn-cgi/trace?t=' + Date.now(), { cache: 'no-cache' });
            const ping = performance.now() - start;
            total++;

            if (ping < 2000) {
                recentPings.push(ping);
                if (recentPings.length > 60) recentPings.shift();
                latencyData.push(ping);

                const avg = recentPings.reduce((a, b) => a + b, 0) / recentPings.length;
                testResults.ping = avg;
                document.getElementById('ping-value').textContent = `${avg.toFixed(0)} ms`;

                if (recentPings.length > 1) {
                    let diff = 0;
                    for (let i = 1; i < recentPings.length; i++) diff += Math.abs(recentPings[i] - recentPings[i - 1]);
                    const jitter = diff / (recentPings.length - 1);
                    testResults.jitter = jitter;
                    document.getElementById('jitter-value').textContent = `${jitter.toFixed(1)} ms`;
                }

                drawLatencyGraph();
            } else {
                errors++;
                total++;
                latencyData.push(ping);
                drawLatencyGraph();
            }

            testResults.packetLoss = total > 0 ? (errors / total) * 100 : 0;

        } catch {
            errors++;
            total++;
            latencyData.push(999);
            testResults.packetLoss = total > 0 ? (errors / total) * 100 : 0;
        }

        if (isTestRunning) {
            pingInterval = setTimeout(doPing, interval);
        }
    }

    doPing();
}

function stopPingLoop() {
    if (pingInterval) {
        clearTimeout(pingInterval);
        pingInterval = null;
    }
}

function runDownloadTest(duration) {
    return new Promise(resolve => {
        updateStatus('Download + Upload + Ping ölçülüyor...');
        let measurements = [];
        const startTime = Date.now();
        const sizes = [10, 25, 50, 100];
        let sizeIdx = 0;
        let active = 0;

        function doDownload() {
            if (!isTestRunning || Date.now() - startTime > duration * 1000) {
                if (active === 0) {
                    if (measurements.length > 0) {
                        const sorted = [...measurements].sort((a, b) => b - a);
                        const top = sorted.slice(0, Math.min(15, sorted.length));
                        testResults.download = top.reduce((a, b) => a + b, 0) / top.length;
                        document.getElementById('download-speed').textContent = `${testResults.download.toFixed(2)} Mbps`;
                    }
                    resolve();
                }
                return;
            }

            active++;
            const size = sizes[Math.min(sizeIdx, sizes.length - 1)];
            const xhr = new XMLHttpRequest();
            let lastLoaded = 0;
            let lastTime = Date.now();

            xhr.open('GET', `https://speed.cloudflare.com/__down?bytes=${size * 1000000}&r=${Math.random()}`, true);
            xhr.responseType = 'arraybuffer';

            xhr.onprogress = e => {
                if (!isTestRunning) { xhr.abort(); return; }
                const now = Date.now();
                const dt = (now - lastTime) / 1000;
                if (dt > 0.08 && e.loaded > lastLoaded) {
                    const speed = ((e.loaded - lastLoaded) * 8) / (dt * 1000000);
                    if (speed > 0.5 && speed < 3000) {
                        measurements.push(speed);
                        downloadSpeedData.push(speed);
                        const recent = measurements.slice(-10);
                        const peak = recent.reduce((a, b) => a + b, 0) / recent.length;
                        testResults.download = peak;
                        document.getElementById('download-speed').textContent = `${peak.toFixed(2)} Mbps`;
                        document.getElementById('current-speed').textContent = peak.toFixed(0);
                        drawGauge(peak, 500);
                        drawSpeedViz();
                    }
                    lastLoaded = e.loaded;
                    lastTime = now;
                }
            };

            xhr.onload = xhr.onerror = xhr.onabort = () => {
                active--;
                if (measurements.length > 5) {
                    const avg = measurements.slice(-5).reduce((a, b) => a + b, 0) / 5;
                    if (avg > 40 && sizeIdx < sizes.length - 1) sizeIdx++;
                }
                setTimeout(doDownload, 30);
            };

            xhr.send();
        }

        doDownload();
        setTimeout(doDownload, 200);
    });
}

function runUploadTest(duration) {
    return new Promise(resolve => {
        let measurements = [];
        const startTime = Date.now();
        const sizes = [1, 2, 4, 8];
        let sizeIdx = 0;
        let active = 0;

        function doUpload() {
            if (!isTestRunning || Date.now() - startTime > duration * 1000) {
                if (active === 0) {
                    if (measurements.length > 0) {
                        const sorted = [...measurements].sort((a, b) => b - a);
                        const top = sorted.slice(0, Math.min(10, sorted.length));
                        testResults.upload = top.reduce((a, b) => a + b, 0) / top.length;
                        document.getElementById('upload-speed').textContent = `${testResults.upload.toFixed(2)} Mbps`;
                    }
                    resolve();
                }
                return;
            }

            active++;
            const size = sizes[Math.min(sizeIdx, sizes.length - 1)] * 1000000;
            const data = new Uint8Array(size);
            crypto.getRandomValues(data);

            const xhr = new XMLHttpRequest();
            let lastLoaded = 0;
            let lastTime = Date.now();
            const reqStart = Date.now();

            xhr.open('POST', 'https://speed.cloudflare.com/__up', true);
            xhr.timeout = 12000;

            xhr.upload.onprogress = e => {
                if (!isTestRunning) { xhr.abort(); return; }
                const now = Date.now();
                const dt = (now - lastTime) / 1000;
                if (dt > 0.08 && e.loaded > lastLoaded) {
                    const speed = ((e.loaded - lastLoaded) * 8) / (dt * 1000000);
                    if (speed > 0.3 && speed < 2000) {
                        measurements.push(speed);
                        uploadSpeedData.push(speed);
                        const recent = measurements.slice(-8);
                        const peak = recent.reduce((a, b) => a + b, 0) / recent.length;
                        testResults.upload = peak;
                        document.getElementById('upload-speed').textContent = `${peak.toFixed(2)} Mbps`;
                        drawSpeedViz();
                    }
                    lastLoaded = e.loaded;
                    lastTime = now;
                }
            };

            xhr.onload = () => {
                if (measurements.length === 0) {
                    const elapsed = (Date.now() - reqStart) / 1000;
                    if (elapsed > 0.5) {
                        const speed = (size * 8) / (elapsed * 1000000);
                        if (speed > 0.1) {
                            measurements.push(speed);
                            uploadSpeedData.push(speed);
                            testResults.upload = speed;
                            document.getElementById('upload-speed').textContent = `${speed.toFixed(2)} Mbps`;
                            drawSpeedViz();
                        }
                    }
                }
                active--;
                if (measurements.length > 5) {
                    const avg = measurements.slice(-5).reduce((a, b) => a + b, 0) / 5;
                    if (avg > 15 && sizeIdx < sizes.length - 1) sizeIdx++;
                }
                setTimeout(doUpload, 30);
            };

            xhr.onerror = xhr.ontimeout = xhr.onabort = () => {
                active--;
                setTimeout(doUpload, 200);
            };

            xhr.send(data);
        }

        setTimeout(() => {
            doUpload();
            setTimeout(doUpload, 300);
        }, 500);
    });
}

function finalizeStats() {
    document.getElementById('packet-loss').textContent = `${testResults.packetLoss.toFixed(2)}%`;
    const minPing = latencyData.filter(p => p < 500);
    document.getElementById('gaming-latency').textContent = minPing.length > 0 ? `${Math.min(...minPing).toFixed(0)} ms` : '-- ms';

    let bb = 'İyi';
    if (testResults.jitter > 50 || testResults.packetLoss > 3) bb = 'Kötü';
    else if (testResults.jitter > 20 || testResults.packetLoss > 1) bb = 'Orta';
    document.getElementById('bufferbloat').textContent = bb;

    const dl = testResults.download;
    const ul = testResults.upload;
    const pg = testResults.ping;
    const jt = testResults.jitter;

    const ratings = [
        ['web-rating',       dl < 1 ? 'poor' : dl < 5 ? 'fair' : dl < 10 ? 'good' : 'excellent',   dl < 1 ? 'Zayıf' : dl < 5 ? 'Orta' : dl < 10 ? 'İyi' : 'Mükemmel'],
        ['video-rating',     dl < 3 ? 'poor' : dl < 8 ? 'fair' : dl < 15 ? 'good' : 'excellent',    dl < 3 ? 'Zayıf' : dl < 8 ? 'Orta' : dl < 15 ? 'İyi' : 'Mükemmel'],
        ['gaming-rating',    pg > 100 || jt > 40 ? 'poor' : pg > 60 || jt > 20 ? 'fair' : pg > 40 || jt > 10 ? 'good' : 'excellent', pg > 100 || jt > 40 ? 'Zayıf' : pg > 60 || jt > 20 ? 'Orta' : pg > 40 || jt > 10 ? 'İyi' : 'Mükemmel'],
        ['streaming-rating', dl < 15 ? 'poor' : dl < 25 ? 'fair' : dl < 40 ? 'good' : 'excellent',  dl < 15 ? 'Zayıf' : dl < 25 ? 'Orta' : dl < 40 ? 'İyi' : 'Mükemmel'],
        ['call-rating',      pg > 150 || ul < 1 ? 'poor' : pg > 100 || ul < 2 ? 'fair' : pg > 80 || ul < 3 ? 'good' : 'excellent', pg > 150 || ul < 1 ? 'Zayıf' : pg > 100 || ul < 2 ? 'Orta' : pg > 80 || ul < 3 ? 'İyi' : 'Mükemmel'],
        ['download-rating',  dl < 5 ? 'poor' : dl < 20 ? 'fair' : dl < 50 ? 'good' : 'excellent',   dl < 5 ? 'Çok Yavaş' : dl < 20 ? 'Yavaş' : dl < 50 ? 'Normal' : 'Hızlı'],
    ];

    ratings.forEach(([id, cls, txt]) => {
        const el = document.getElementById(id);
        if (el) {
            el.parentElement.className = `game-stat ${cls}`;
            el.querySelector('.rating-text').textContent = txt;
        }
    });

    if (latencyData.length >= 5) {
        const valid = latencyData.filter(p => p < 2000);
        const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
        const variance = valid.reduce((s, p) => s + Math.pow(p - avg, 2), 0) / valid.length;
        const threshold = Math.max(avg + 2 * Math.sqrt(variance), avg * 1.5);
        const spikes = valid.filter(p => p > threshold).length;
        document.getElementById('spike-count').textContent = spikes;
        document.getElementById('max-ping').textContent = `${Math.max(...valid).toFixed(0)} ms`;
        document.getElementById('min-ping').textContent = `${Math.min(...valid).toFixed(0)} ms`;
    }
}

function drawLatencyGraph() {
    const c = document.getElementById('latency-canvas');
    const ctx = c.getContext('2d');
    const W = c.width, H = c.height, P = 45;

    ctx.clearRect(0, 0, W, H);
    if (latencyData.length < 2) return;

    const valid = latencyData.filter(p => p < 2000);
    if (valid.length < 2) return;

    const maxP = Math.max(...valid);
    const minP = Math.min(...valid);
    const avgP = valid.reduce((a, b) => a + b, 0) / valid.length;
    const range = maxP - minP || 1;
    const variance = valid.reduce((s, p) => s + Math.pow(p - avgP, 2), 0) / valid.length;
    const threshold = Math.max(avgP + 2 * Math.sqrt(variance), avgP * 1.5);

    ctx.strokeStyle = '#1e2d45';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = P + (H - 2 * P) * i / 4;
        ctx.beginPath();
        ctx.moveTo(P, y);
        ctx.lineTo(W - P, y);
        ctx.stroke();
        ctx.fillStyle = '#4a5568';
        ctx.font = '10px JetBrains Mono';
        ctx.textAlign = 'right';
        ctx.fillText(`${(maxP - range * i / 4).toFixed(0)}`, P - 8, y + 4);
    }

    const avgY = P + (H - 2 * P) * (1 - (avgP - minP) / range);
    ctx.strokeStyle = '#ffcc00';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(P, avgY);
    ctx.lineTo(W - P, avgY);
    ctx.stroke();

    if (threshold <= maxP) {
        const ty = P + (H - 2 * P) * (1 - (threshold - minP) / range);
        ctx.strokeStyle = '#ff0055';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(P, ty);
        ctx.lineTo(W - P, ty);
        ctx.stroke();
    }
    ctx.setLineDash([]);

    const step = (W - 2 * P) / (latencyData.length - 1);

    const grad = ctx.createLinearGradient(P, 0, W - P, 0);
    grad.addColorStop(0, '#00f0ff');
    grad.addColorStop(1, '#00f0ff');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2;
    ctx.shadowBlur = 6;
    ctx.shadowColor = '#00f0ff';
    ctx.beginPath();
    latencyData.forEach((p, i) => {
        const clampedP = Math.min(p, maxP);
        const x = P + i * step;
        const y = P + (H - 2 * P) * (1 - (clampedP - minP) / range);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#ff0055';
    latencyData.forEach((p, i) => {
        if (p > threshold) {
            const x = P + i * step;
            const y = P + (H - 2 * P) * (1 - (Math.min(p, maxP) - minP) / range);
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, Math.PI * 2);
            ctx.fill();
        }
    });
}

function drawSpeedViz() {
    const c = document.getElementById('speed-canvas');
    if (!c) return;
    const ctx = c.getContext('2d');
    const W = c.width, H = c.height, P = 50;

    ctx.clearRect(0, 0, W, H);

    const all = [...downloadSpeedData, ...uploadSpeedData];
    if (all.length === 0) return;

    const maxS = Math.max(...all, 10);
    const gW = W - 2 * P, gH = H - 2 * P;
    const maxPts = Math.max(downloadSpeedData.length, uploadSpeedData.length, 1);

    ctx.strokeStyle = '#1e2d45';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = P + gH * i / 4;
        ctx.beginPath();
        ctx.moveTo(P, y);
        ctx.lineTo(W - P, y);
        ctx.stroke();
        ctx.fillStyle = '#4a5568';
        ctx.font = '11px JetBrains Mono';
        ctx.textAlign = 'right';
        ctx.fillText(`${(maxS - maxS * i / 4).toFixed(0)}`, P - 8, y + 4);
    }

    function drawLine(data, color, glow) {
        if (data.length < 2) return;
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.shadowBlur = 12;
        ctx.shadowColor = glow;
        ctx.beginPath();
        data.forEach((s, i) => {
            const x = P + gW * i / (maxPts - 1);
            const y = P + gH - gH * s / maxS;
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.shadowBlur = 0;
    }

    drawLine(downloadSpeedData, '#00f0ff', '#00f0ff');
    drawLine(uploadSpeedData, '#ff00ff', '#ff00ff');
}

function toggleStats() {
    const c = document.getElementById('stats-content');
    const b = document.getElementById('toggle-stats');
    c.classList.toggle('active');
    b.textContent = c.classList.contains('active') ? '▲' : '▼';
}

function updateStatus(msg) {
    document.getElementById('test-status').textContent = msg;
}

function clearCanvas(id) {
    const c = document.getElementById(id);
    if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height);
}
