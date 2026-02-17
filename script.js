const CFG = {
    quick:    { duration: 10,  pingMs: 400 },
    normal:   { duration: 30,  pingMs: 300 },
    extended: { duration: 60,  pingMs: 250 },
    tenmin:   { duration: 600, pingMs: 500 }
};

const UL_BUF = (() => {
    const b = new Uint8Array(256 * 1024);
    crypto.getRandomValues(b);
    return b;
})();

let mode = 'quick';
let running = false;
let pingTimer = null;

let dlData = [], ulData = [], pingData = [];
let recentPings = [];
let res = { dl: 0, ul: 0, ping: 0, jitter: 0, loss: 0 };

document.addEventListener('DOMContentLoaded', () => {
    fetchInfo();
    drawGauge(0, 500);

    document.getElementById('start-btn').addEventListener('click', onStart);
    document.getElementById('toggle-stats').addEventListener('click', () => {
        const b = document.getElementById('stats-body');
        const btn = document.getElementById('toggle-stats');
        const open = b.classList.toggle('open');
        btn.textContent = open ? '▲' : '▼';
    });
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            mode = e.currentTarget.dataset.mode;
        });
    });
});

async function fetchInfo() {
    try {
        const { ip } = await fetch('https://api.ipify.org?format=json').then(r => r.json());
        const d = await fetch(`https://ipapi.co/${ip}/json/`).then(r => r.json());
        document.getElementById('ip-address').textContent = d.ip || '?';
        document.getElementById('isp').textContent = (d.org || '').replace(/^AS\d+\s+/, '').substring(0, 35) || '?';
        const loc = [d.city, d.country_name].filter(Boolean).join(', ') || '?';
        document.getElementById('location').textContent = loc;
        document.getElementById('server-location').textContent = loc;
        const conn = navigator.connection;
        let ct = 'Ethernet/WiFi';
        if (conn) {
            if (conn.type === 'wifi') ct = 'WiFi';
            else if (conn.type === 'ethernet') ct = 'Ethernet';
            else if (conn.effectiveType === '4g') ct = '4G/LTE';
            else if (conn.effectiveType === '3g') ct = '3G';
            else if (conn.effectiveType === '2g') ct = '2G';
            if (ct === 'Ethernet/WiFi' && conn.downlink > 80) ct = 'Fiber';
            else if (ct === 'Ethernet/WiFi' && conn.downlink > 10) ct = 'ADSL/Cable';
        }
        document.getElementById('connection-type').textContent = ct;
    } catch {
        ['ip-address','isp','location','connection-type'].forEach(id =>
            document.getElementById(id).textContent = '?'
        );
        document.getElementById('server-location').textContent = '?';
    }
}

async function onStart() {
    if (running) { running = false; stopPing(); setStatus('Durduruldu'); return; }

    running = true;
    dlData = []; ulData = []; pingData = []; recentPings = [];
    res = { dl: 0, ul: 0, ping: 0, jitter: 0, loss: 0 };

    document.getElementById('start-btn').classList.add('running');
    document.getElementById('btn-text').textContent = 'Durdur';
    document.getElementById('download-speed').textContent = '-- Mbps';
    document.getElementById('upload-speed').textContent = '-- Mbps';
    document.getElementById('ping-value').textContent = '-- ms';
    document.getElementById('jitter-value').textContent = '-- ms';
    document.getElementById('current-speed').textContent = '0';
    drawGauge(0, 500);
    clearCvs('latency-canvas');
    clearCvs('speed-canvas');
    setStatus('Başlıyor...');

    const cfg = CFG[mode];
    const t0 = Date.now();

    startPing(cfg.pingMs);
    tickProgress(t0, cfg.duration);

    await Promise.all([
        testDownload(cfg.duration),
        testUpload(cfg.duration)
    ]);

    stopPing();
    finalize(t0);

    running = false;
    document.getElementById('start-btn').classList.remove('running');
    document.getElementById('btn-text').textContent = 'Testi Başlat';
    setStatus('Test tamamlandı');

    const body = document.getElementById('stats-body');
    if (!body.classList.contains('open')) {
        body.classList.add('open');
        document.getElementById('toggle-stats').textContent = '▲';
    }
}

function tickProgress(t0, dur) {
    if (!running) return;
    const elapsed = (Date.now() - t0) / 1000;
    const pct = Math.min(99, Math.floor(elapsed / dur * 100));
    if (dur >= 60) {
        const m = Math.floor(elapsed / 60), s = Math.floor(elapsed % 60);
        const rm = Math.floor(Math.max(0, dur - elapsed) / 60);
        const rs = Math.floor(Math.max(0, dur - elapsed) % 60);
        setStatus(`%${pct} · ${m}:${pad(s)} / kalan ${rm}:${pad(rs)}`);
    } else {
        setStatus(`Test sürüyor... %${pct}`);
    }
    if (elapsed < dur) setTimeout(() => tickProgress(t0, dur), 400);
}

function startPing(interval) {
    let errors = 0, total = 0;
    let spikeThreshold = 500;

    async function doPing() {
        if (!running) return;
        const t = performance.now();
        let ms;
        try {
            await fetch('https://1.1.1.1/cdn-cgi/trace?_=' + Date.now(), { cache: 'no-cache', signal: AbortSignal.timeout(4000) });
            ms = performance.now() - t;
        } catch {
            ms = 4000;
        }
        total++;

        if (ms < 4000) {
            recentPings.push(ms);
            if (recentPings.length > 100) recentPings.shift();
            pingData.push(ms);

            const avg = recentPings.reduce((a, b) => a + b) / recentPings.length;
            res.ping = avg;
            document.getElementById('ping-value').textContent = avg.toFixed(0) + ' ms';

            if (recentPings.length > 2) {
                let s = 0;
                for (let i = 1; i < recentPings.length; i++)
                    s += Math.abs(recentPings[i] - recentPings[i - 1]);
                const j = s / (recentPings.length - 1);
                res.jitter = j;
                document.getElementById('jitter-value').textContent = j.toFixed(1) + ' ms';
            }

            if (recentPings.length > 5) {
                const variance = recentPings.reduce((s, p) => s + (p - res.ping) ** 2, 0) / recentPings.length;
                spikeThreshold = Math.max(res.ping + 3 * Math.sqrt(variance), res.ping * 2.5, 100);
            }

            drawLatency();
        } else {
            errors++;
            pingData.push(ms);
            drawLatency();
        }

        res.loss = total > 0 ? (errors / total) * 100 : 0;
        if (!running) return;

        const isSpike = ms > spikeThreshold;
        const nextDelay = isSpike ? 50 : interval;
        pingTimer = setTimeout(doPing, nextDelay);
    }

    doPing();
}

function stopPing() {
    if (pingTimer) { clearTimeout(pingTimer); pingTimer = null; }
}

function testDownload(dur) {
    return new Promise(ok => {
        const t0 = Date.now();
        const meas = [];
        let done = false;

        const finish = () => {
            if (done) return; done = true;
            if (meas.length > 0) {
                const s = [...meas].sort((a, b) => b - a);
                res.dl = s.slice(0, Math.min(20, s.length)).reduce((a, b) => a + b) / Math.min(20, s.length);
                document.getElementById('download-speed').textContent = res.dl.toFixed(2) + ' Mbps';
            }
            ok();
        };

        setTimeout(finish, (dur + 3) * 1000);

        let sizeIdx = 0;
        const sizes = [10, 25, 50, 100];

        function go() {
            if (!running || Date.now() - t0 > dur * 1000) { finish(); return; }

            const bytes = sizes[Math.min(sizeIdx, sizes.length - 1)] * 1e6;
            const xhr = new XMLHttpRequest();
            let lastBytes = 0, lastT = Date.now();

            xhr.open('GET', `https://speed.cloudflare.com/__down?bytes=${bytes}&r=${Math.random()}`, true);
            xhr.responseType = 'arraybuffer';
            xhr.timeout = 20000;

            xhr.onprogress = e => {
                if (!running) { xhr.abort(); return; }
                const now = Date.now(), dt = (now - lastT) / 1000;
                if (dt > 0.06 && e.loaded > lastBytes) {
                    const spd = ((e.loaded - lastBytes) * 8) / (dt * 1e6);
                    if (spd > 0.3 && spd < 5000) {
                        meas.push(spd);
                        dlData.push(spd);
                        const recent = meas.slice(-12);
                        const avg = recent.reduce((a, b) => a + b) / recent.length;
                        res.dl = avg;
                        document.getElementById('download-speed').textContent = avg.toFixed(2) + ' Mbps';
                        document.getElementById('current-speed').textContent = avg.toFixed(0);
                        drawGauge(avg, 500);
                        drawSpeed();
                    }
                    lastBytes = e.loaded; lastT = now;
                }
            };

            xhr.onload = xhr.onerror = xhr.ontimeout = () => {
                if (meas.length > 4) {
                    const avg5 = meas.slice(-5).reduce((a, b) => a + b) / 5;
                    if (avg5 > 40 && sizeIdx < sizes.length - 1) sizeIdx++;
                }
                if (running && Date.now() - t0 < dur * 1000) setTimeout(go, 30);
                else finish();
            };

            xhr.send();
        }

        go();
        setTimeout(go, 400);
    });
}

function testUpload(dur) {
    return new Promise(ok => {
        const t0 = Date.now();
        const meas = [];
        let done = false;

        const finish = () => {
            if (done) return; done = true;
            if (meas.length > 0) {
                const s = [...meas].sort((a, b) => b - a);
                res.ul = s.slice(0, Math.min(12, s.length)).reduce((a, b) => a + b) / Math.min(12, s.length);
                document.getElementById('upload-speed').textContent = res.ul.toFixed(2) + ' Mbps';
            }
            ok();
        };

        setTimeout(finish, (dur + 4) * 1000);

        function getChunkSize() {
            if (meas.length === 0) return 512 * 1024;
            const avg = meas.slice(-4).reduce((a, b) => a + b) / Math.min(4, meas.length);
            if (avg > 100) return 8 * 1024 * 1024;
            if (avg > 50)  return 4 * 1024 * 1024;
            if (avg > 20)  return 2 * 1024 * 1024;
            if (avg > 5)   return 1 * 1024 * 1024;
            return 512 * 1024;
        }

        function sendOne() {
            if (!running || Date.now() - t0 > dur * 1000) { finish(); return; }

            const size = getChunkSize();
            const buf = new Uint8Array(size);
            for (let i = 0; i < size; i += UL_BUF.length)
                buf.set(UL_BUF.subarray(0, Math.min(UL_BUF.length, size - i)), i);

            const xhr = new XMLHttpRequest();
            const req0 = performance.now();
            let lastBytes = 0, lastT = req0;

            xhr.open('POST', 'https://speed.cloudflare.com/__up', true);
            xhr.timeout = 12000;

            xhr.upload.onprogress = e => {
                if (!running) { xhr.abort(); return; }
                const now = performance.now(), dt = (now - lastT) / 1000;
                if (dt > 0.05 && e.loaded > lastBytes) {
                    const spd = ((e.loaded - lastBytes) * 8) / (dt * 1e6);
                    if (spd > 0.5 && spd < 3000) {
                        meas.push(spd);
                        ulData.push(spd);
                        const avg = meas.slice(-6).reduce((a, b) => a + b) / Math.min(6, meas.length);
                        res.ul = avg;
                        document.getElementById('upload-speed').textContent = avg.toFixed(2) + ' Mbps';
                        drawSpeed();
                    }
                    lastBytes = e.loaded; lastT = now;
                }
            };

            xhr.onload = () => {
                const elapsed = (performance.now() - req0) / 1000;
                if (elapsed > 0.1) {
                    const spd = (size * 8) / (elapsed * 1e6);
                    if (spd > 0.1 && spd < 3000) {
                        meas.push(spd);
                        ulData.push(spd);
                        const avg = meas.slice(-6).reduce((a, b) => a + b) / Math.min(6, meas.length);
                        res.ul = avg;
                        document.getElementById('upload-speed').textContent = avg.toFixed(2) + ' Mbps';
                        drawSpeed();
                    }
                }
                if (running && Date.now() - t0 < dur * 1000) setTimeout(sendOne, 10);
                else finish();
            };

            xhr.onerror = xhr.ontimeout = () => {
                if (running && Date.now() - t0 < dur * 1000) setTimeout(sendOne, 200);
                else finish();
            };

            xhr.send(buf);
        }

        setTimeout(sendOne, 200);
        setTimeout(sendOne, 500);
        setTimeout(sendOne, 800);
    });
}

function finalize(t0) {
    document.getElementById('test-duration').textContent = ((Date.now() - t0) / 1000).toFixed(1) + ' sn';
    document.getElementById('packet-loss').textContent = res.loss.toFixed(2) + '%';

    const valid = pingData.filter(p => p < 2000);
    document.getElementById('gaming-latency').textContent = valid.length ? Math.min(...valid).toFixed(0) + ' ms' : '--';

    const bb = res.jitter > 50 || res.loss > 3 ? 'Kötü' : res.jitter > 20 || res.loss > 1 ? 'Orta' : 'İyi';
    document.getElementById('bufferbloat').textContent = bb;

    const dl = res.dl, ul = res.ul, pg = res.ping, jt = res.jitter;

    setPerf('perf-web',     dl < 1 ? [0,'poor','Zayıf'] : dl < 5 ? [40,'fair','Orta'] : dl < 10 ? [70,'good','İyi'] : [95,'excellent','Mükemmel']);
    setPerf('perf-video',   dl < 3 ? [0,'poor','Zayıf'] : dl < 8 ? [40,'fair','Orta'] : dl < 15 ? [70,'good','İyi'] : [95,'excellent','Mükemmel']);
    setPerf('perf-gaming',  pg > 100 || jt > 40 ? [15,'poor','Zayıf'] : pg > 60 || jt > 20 ? [45,'fair','Orta'] : pg > 40 || jt > 10 ? [72,'good','İyi'] : [95,'excellent','Mükemmel']);
    setPerf('perf-4k',      dl < 15 ? [10,'poor','Zayıf'] : dl < 25 ? [40,'fair','Orta'] : dl < 40 ? [70,'good','İyi'] : [95,'excellent','Mükemmel']);
    setPerf('perf-call',    pg > 150 || ul < 1 ? [10,'poor','Zayıf'] : pg > 100 || ul < 2 ? [40,'fair','Orta'] : pg > 80 || ul < 3 ? [70,'good','İyi'] : [95,'excellent','Mükemmel']);
    setPerf('perf-dl',      dl < 5 ? [10,'poor','Çok Yavaş'] : dl < 20 ? [40,'fair','Yavaş'] : dl < 50 ? [70,'good','Normal'] : [95,'excellent','Hızlı']);

    if (valid.length >= 3) {
        const avg = valid.reduce((a, b) => a + b) / valid.length;
        const variance = valid.reduce((s, p) => s + (p - avg) ** 2, 0) / valid.length;
        const thr = Math.max(avg + 3 * Math.sqrt(variance), avg * 2.5);
        const spikes = valid.filter(p => p > thr).length;
        document.getElementById('spike-count').textContent = spikes;
        document.getElementById('max-ping').textContent = Math.max(...valid).toFixed(0) + ' ms';
        document.getElementById('min-ping').textContent = Math.min(...valid).toFixed(0) + ' ms';
    }
}

function setPerf(id, [pct, cls, txt]) {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = 'perf-card ' + cls;
    el.querySelector('.perf-fill').style.width = pct + '%';
    el.querySelector('.perf-text').textContent = txt;
}

function drawGauge(speed, max) {
    const c = document.getElementById('gauge');
    const ctx = c.getContext('2d');
    const cx = c.width / 2, cy = c.height / 2, r = 148;

    ctx.clearRect(0, 0, c.width, c.height);

    ctx.strokeStyle = '#1a2a3e';
    ctx.lineWidth = 22;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0.75 * Math.PI, 2.25 * Math.PI);
    ctx.stroke();

    if (speed > 0) {
        const a = 0.75 * Math.PI + Math.min(speed / max, 1) * 1.5 * Math.PI;
        const g = ctx.createLinearGradient(0, 0, c.width, 0);
        g.addColorStop(0, '#00f0ff');
        g.addColorStop(0.5, '#cc00ff');
        g.addColorStop(1, '#00ff88');
        ctx.strokeStyle = g;
        ctx.lineWidth = 22;
        ctx.shadowBlur = 28;
        ctx.shadowColor = '#00f0ff';
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0.75 * Math.PI, a);
        ctx.stroke();
        ctx.shadowBlur = 0;
    }

    ctx.strokeStyle = '#2a3d55';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 10; i++) {
        const a = 0.75 * Math.PI + (i / 10) * 1.5 * Math.PI;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * (r - 30), cy + Math.sin(a) * (r - 30));
        ctx.lineTo(cx + Math.cos(a) * (r - 16), cy + Math.sin(a) * (r - 16));
        ctx.stroke();
    }
}

function drawLatency() {
    const c = document.getElementById('latency-canvas');
    const ctx = c.getContext('2d');
    const W = c.width, H = c.height, P = 40;

    ctx.clearRect(0, 0, W, H);

    const raw = pingData.filter(p => p < 2000);
    if (raw.length < 2) return;
    const pts = raw.slice(-300);

    const maxP = Math.max(...pts);
    const minP = Math.min(...pts);
    const avgP = pts.reduce((a, b) => a + b) / pts.length;
    const range = Math.max(maxP - minP, 10);
    const variance = pts.reduce((s, p) => s + (p - avgP) ** 2, 0) / pts.length;
    const thr = Math.max(avgP + 3 * Math.sqrt(variance), avgP * 2.5);

    const gW = W - 2 * P, gH = H - 2 * P;

    ctx.strokeStyle = '#1a2a3e';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 3; i++) {
        const y = P + gH * i / 3;
        ctx.beginPath(); ctx.moveTo(P, y); ctx.lineTo(W - P, y); ctx.stroke();
        ctx.fillStyle = '#3a4a5e';
        ctx.font = '9px JetBrains Mono';
        ctx.textAlign = 'right';
        ctx.fillText((maxP - range * i / 3).toFixed(0) + 'ms', P - 5, y + 3);
    }

    const py = v => P + gH * (1 - (Math.min(v, maxP) - minP) / range);
    const px = i => P + gW * i / Math.max(pts.length - 1, 1);

    const avgY = py(avgP);
    ctx.strokeStyle = '#ffcc00'; ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(P, avgY); ctx.lineTo(W - P, avgY); ctx.stroke();

    if (thr < maxP * 1.1) {
        const thrY = py(thr);
        ctx.strokeStyle = '#ff0044'; ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(P, thrY); ctx.lineTo(W - P, thrY); ctx.stroke();
    }
    ctx.setLineDash([]);

    ctx.strokeStyle = '#00f0ff'; ctx.lineWidth = 2;
    ctx.shadowBlur = 6; ctx.shadowColor = '#00f0ff';
    ctx.beginPath();
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(px(i), py(p)) : ctx.lineTo(px(i), py(p)));
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#ff0044';
    pts.forEach((p, i) => {
        if (p > thr) {
            ctx.beginPath(); ctx.arc(px(i), py(p), 4, 0, Math.PI * 2); ctx.fill();
        }
    });
}

function drawSpeed() {
    const c = document.getElementById('speed-canvas');
    if (!c) return;
    const ctx = c.getContext('2d');
    const W = c.width, H = c.height, P = 40;

    ctx.clearRect(0, 0, W, H);

    const dl = dlData.slice(-300);
    const ul = ulData.slice(-300);
    const all = [...dl, ...ul];
    if (all.length === 0) return;

    const maxS = Math.max(...all, 5);
    const gW = W - 2 * P, gH = H - 2 * P;
    const maxPts = Math.max(dl.length, ul.length, 1);

    ctx.strokeStyle = '#1a2a3e'; ctx.lineWidth = 1;
    for (let i = 0; i <= 3; i++) {
        const y = P + gH * i / 3;
        ctx.beginPath(); ctx.moveTo(P, y); ctx.lineTo(W - P, y); ctx.stroke();
        ctx.fillStyle = '#3a4a5e'; ctx.font = '9px JetBrains Mono'; ctx.textAlign = 'right';
        ctx.fillText((maxS - maxS * i / 3).toFixed(0), P - 5, y + 3);
    }

    function line(data, color, glow) {
        if (data.length < 2) return;
        ctx.strokeStyle = color; ctx.lineWidth = 2.5;
        ctx.shadowBlur = 10; ctx.shadowColor = glow;
        ctx.beginPath();
        data.forEach((v, i) => {
            const x = P + gW * i / (maxPts - 1);
            const y = P + gH * (1 - v / maxS);
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.stroke(); ctx.shadowBlur = 0;
    }

    line(dl, '#00f0ff', '#00f0ff');
    line(ul, '#cc00ff', '#cc00ff');
}

function setStatus(msg) { document.getElementById('test-status').textContent = msg; }
function clearCvs(id) { const c = document.getElementById(id); if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height); }
function pad(n) { return String(n).padStart(2, '0'); }
