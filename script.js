let testMode = 'quick';
let isTestRunning = false;
let latencyData = [];
let downloadSpeedData = [];
let uploadSpeedData = [];
let testResults = {
    download: 0,
    upload: 0,
    ping: 0,
    jitter: 0,
    packetLoss: 0
};

const testConfig = {
    quick: { duration: 8, samples: 15 },
    normal: { duration: 20, samples: 40 },
    extended: { duration: 45, samples: 80 }
};

document.addEventListener('DOMContentLoaded', () => {
    fetchIPInfo();
    initializeCanvas();
    setupEventListeners();
});

function setupEventListeners() {
    document.getElementById('start-test').addEventListener('click', startTest);
    document.getElementById('toggle-stats').addEventListener('click', toggleStats);
    
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            testMode = e.currentTarget.dataset.mode;
        });
    });
}

async function fetchIPInfo() {
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const ipData = await response.json();
        
        const detailResponse = await fetch(`https://ipapi.co/${ipData.ip}/json/`);
        const data = await detailResponse.json();
        
        document.getElementById('ip-address').textContent = data.ip || 'Bilinmiyor';
        
        let ispName = data.org || 'Bilinmiyor';
        if (ispName.includes('AS')) {
            ispName = ispName.replace(/^AS\d+\s+/, '');
        }
        document.getElementById('isp').textContent = ispName.substring(0, 35);
        
        const location = data.city && data.country_name ? `${data.city}, ${data.country_name}` : 'Bilinmiyor';
        document.getElementById('location').textContent = location;
        document.getElementById('server-location').textContent = location;
        
        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        let connectionType = 'WiFi/Ethernet';
        
        if (connection) {
            const effType = connection.effectiveType;
            const type = connection.type;
            
            if (type === 'wifi') connectionType = 'WiFi';
            else if (type === 'ethernet') connectionType = 'Ethernet';
            else if (effType === '4g') connectionType = '4G';
            else if (effType === '3g') connectionType = '3G';
            else if (effType === '2g') connectionType = '2G';
            else if (connection.downlink > 50) connectionType = 'Fiber';
            else if (connection.downlink > 10) connectionType = 'ADSL/Cable';
        }
        
        document.getElementById('connection-type').textContent = connectionType;
    } catch (error) {
        document.getElementById('ip-address').textContent = 'Tespit edilemedi';
        document.getElementById('isp').textContent = 'Bilinmiyor';
        document.getElementById('location').textContent = 'Bilinmiyor';
        document.getElementById('connection-type').textContent = 'Bilinmiyor';
    }
}

let canvas, ctx;
function initializeCanvas() {
    canvas = document.getElementById('speedometer');
    ctx = canvas.getContext('2d');
    drawSpeedometer(0, 0);
}

function drawSpeedometer(speed, maxSpeed = 1000) {
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = 160;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const gradient = ctx.createRadialGradient(centerX, centerY, radius - 20, centerX, centerY, radius + 20);
    gradient.addColorStop(0, 'rgba(0, 240, 255, 0.1)');
    gradient.addColorStop(1, 'rgba(0, 240, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius + 20, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.strokeStyle = '#2a3547';
    ctx.lineWidth = 20;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0.75 * Math.PI, 2.25 * Math.PI);
    ctx.stroke();
    
    const speedAngle = 0.75 * Math.PI + (speed / maxSpeed) * 1.5 * Math.PI;
    const speedGradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
    speedGradient.addColorStop(0, '#00f0ff');
    speedGradient.addColorStop(0.5, '#ff00ff');
    speedGradient.addColorStop(1, '#00ff88');
    
    ctx.strokeStyle = speedGradient;
    ctx.lineWidth = 20;
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#00f0ff';
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0.75 * Math.PI, speedAngle);
    ctx.stroke();
    ctx.shadowBlur = 0;
    
    ctx.strokeStyle = '#8892a6';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 10; i++) {
        const angle = 0.75 * Math.PI + (i / 10) * 1.5 * Math.PI;
        const startX = centerX + Math.cos(angle) * (radius - 25);
        const startY = centerY + Math.sin(angle) * (radius - 25);
        const endX = centerX + Math.cos(angle) * (radius - 15);
        const endY = centerY + Math.sin(angle) * (radius - 15);
        
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
    }
}

async function startTest() {
    if (isTestRunning) {
        stopTest();
        return;
    }
    
    isTestRunning = true;
    const startBtn = document.getElementById('start-test');
    startBtn.classList.add('testing');
    startBtn.querySelector('.btn-text').textContent = 'Testi Durdur';
    
    latencyData = [];
    downloadSpeedData = [];
    uploadSpeedData = [];
    testResults = { download: 0, upload: 0, ping: 0, jitter: 0, packetLoss: 0 };
    
    document.getElementById('download-speed').textContent = '-- Mbps';
    document.getElementById('upload-speed').textContent = '-- Mbps';
    document.getElementById('ping-value').textContent = '-- ms';
    document.getElementById('jitter-value').textContent = '-- ms';
    document.getElementById('current-speed').textContent = '0';
    drawSpeedometer(0, 500);
    
    clearCanvas('speed-canvas');
    clearCanvas('latency-canvas');
    
    const config = testConfig[testMode];
    const startTime = Date.now();
    
    try {
        await runPingTest(config.samples);
        if (!isTestRunning) return;
        
        await runDownloadTest(config.duration);
        if (!isTestRunning) return;
        
        await runUploadTest(config.duration);
        
        calculateAdvancedStats();
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        document.getElementById('test-duration').textContent = `${duration} sn`;
        
    } catch (error) {
        updateStatus('Hata oluştu');
    } finally {
        stopTest();
    }
}

function stopTest() {
    isTestRunning = false;
    const startBtn = document.getElementById('start-test');
    startBtn.classList.remove('testing');
    startBtn.querySelector('.btn-text').textContent = 'Testi Başlat';
    updateStatus('Test tamamlandı');
}

async function runPingTest(samples) {
    updateStatus('Ping ölçülüyor...');
    const pings = [];
    let errors = 0;
    
    for (let i = 0; i < samples && isTestRunning; i++) {
        const ping = await measurePing();
        
        if (ping < 500) {
            pings.push(ping);
            latencyData.push(ping);
            
            const avgPing = pings.reduce((a, b) => a + b, 0) / pings.length;
            document.getElementById('ping-value').textContent = `${avgPing.toFixed(0)} ms`;
            
            if (pings.length > 1) {
                const jitter = calculateJitter(pings);
                document.getElementById('jitter-value').textContent = `${jitter.toFixed(1)} ms`;
                testResults.jitter = jitter;
            }
            
            drawLatencyGraph();
        } else {
            errors++;
        }
        
        await sleep(50);
    }
    
    if (pings.length > 0) {
        testResults.ping = pings.reduce((a, b) => a + b, 0) / pings.length;
        testResults.packetLoss = (errors / samples) * 100;
    }
}

async function measurePing() {
    const start = performance.now();
    try {
        await fetch('https://www.google.com/favicon.ico?t=' + Date.now(), { 
            cache: 'no-cache',
            mode: 'no-cors'
        });
        return performance.now() - start;
    } catch {
        return 999;
    }
}

function calculateJitter(pings) {
    if (pings.length < 2) return 0;
    let totalDiff = 0;
    for (let i = 1; i < pings.length; i++) {
        totalDiff += Math.abs(pings[i] - pings[i - 1]);
    }
    return totalDiff / (pings.length - 1);
}

function runDownloadTest(duration) {
    return new Promise((resolve) => {
        updateStatus('Download ölçülüyor...');
        
        let measurements = [];
        const startTime = Date.now();
        const testSizes = [10, 25, 50, 100];
        let currentSizeIndex = 0;
        
        function downloadIteration() {
            if (Date.now() - startTime > duration * 1000 || !isTestRunning) {
                if (measurements.length > 0) {
                    const sorted = measurements.sort((a, b) => b - a);
                    const top = sorted.slice(0, Math.min(10, sorted.length));
                    const avgSpeed = top.reduce((a, b) => a + b, 0) / top.length;
                    testResults.download = avgSpeed;
                    document.getElementById('download-speed').textContent = `${avgSpeed.toFixed(2)} Mbps`;
                }
                resolve();
                return;
            }
            
            const size = testSizes[Math.min(currentSizeIndex, testSizes.length - 1)];
            const xhr = new XMLHttpRequest();
            let lastLoaded = 0;
            let lastTime = Date.now();
            
            xhr.open('GET', `https://speed.cloudflare.com/__down?bytes=${size * 1000000}&r=${Math.random()}`, true);
            xhr.responseType = 'arraybuffer';
            
            xhr.onprogress = (e) => {
                if (!isTestRunning) {
                    xhr.abort();
                    resolve();
                    return;
                }
                
                const now = Date.now();
                const timeDiff = (now - lastTime) / 1000;
                
                if (timeDiff > 0.05 && e.loaded > lastLoaded) {
                    const bytesDiff = e.loaded - lastLoaded;
                    const speedMbps = (bytesDiff * 8) / (timeDiff * 1000000);
                    
                    if (speedMbps > 0.5 && speedMbps < 2000) {
                        measurements.push(speedMbps);
                        downloadSpeedData.push(speedMbps);
                        
                        const recent = measurements.slice(-8);
                        const peakSpeed = Math.max(...recent);
                        
                        testResults.download = peakSpeed;
                        document.getElementById('download-speed').textContent = `${peakSpeed.toFixed(2)} Mbps`;
                        document.getElementById('current-speed').textContent = peakSpeed.toFixed(0);
                        drawSpeedometer(peakSpeed, 500);
                        drawSpeedVisualizer();
                    }
                    
                    lastLoaded = e.loaded;
                    lastTime = now;
                }
            };
            
            xhr.onload = () => {
                if (measurements.length > 5) {
                    const recent = measurements.slice(-5).reduce((a, b) => a + b, 0) / 5;
                    if (recent > 30 && currentSizeIndex < testSizes.length - 1) {
                        currentSizeIndex++;
                    }
                }
                setTimeout(downloadIteration, 50);
            };
            
            xhr.onerror = () => {
                setTimeout(downloadIteration, 200);
            };
            
            xhr.send();
        }
        
        downloadIteration();
    });
}

function runUploadTest(duration) {
    return new Promise((resolve) => {
        updateStatus('Upload ölçülüyor...');
        
        let measurements = [];
        const startTime = Date.now();
        const testSizes = [2, 5, 10];
        let currentSizeIndex = 0;
        
        function uploadIteration() {
            if (Date.now() - startTime > duration * 1000 || !isTestRunning) {
                if (measurements.length > 0) {
                    const sorted = measurements.sort((a, b) => b - a);
                    const top = sorted.slice(0, Math.min(8, sorted.length));
                    const avgSpeed = top.reduce((a, b) => a + b, 0) / top.length;
                    testResults.upload = avgSpeed;
                    document.getElementById('upload-speed').textContent = `${avgSpeed.toFixed(2)} Mbps`;
                }
                resolve();
                return;
            }
            
            const size = testSizes[Math.min(currentSizeIndex, testSizes.length - 1)];
            const data = new Uint8Array(size * 1000000);
            crypto.getRandomValues(data);
            
            const xhr = new XMLHttpRequest();
            let lastLoaded = 0;
            let lastTime = Date.now();
            
            xhr.open('POST', 'https://speed.cloudflare.com/__up', true);
            xhr.timeout = 10000;
            
            xhr.upload.onprogress = (e) => {
                if (!isTestRunning) {
                    xhr.abort();
                    resolve();
                    return;
                }
                
                const now = Date.now();
                const timeDiff = (now - lastTime) / 1000;
                
                if (timeDiff > 0.05 && e.loaded > lastLoaded) {
                    const bytesDiff = e.loaded - lastLoaded;
                    const speedMbps = (bytesDiff * 8) / (timeDiff * 1000000);
                    
                    if (speedMbps > 0.5 && speedMbps < 1000) {
                        measurements.push(speedMbps);
                        uploadSpeedData.push(speedMbps);
                        
                        const recent = measurements.slice(-8);
                        const peakSpeed = Math.max(...recent);
                        
                        testResults.upload = peakSpeed;
                        document.getElementById('upload-speed').textContent = `${peakSpeed.toFixed(2)} Mbps`;
                        document.getElementById('current-speed').textContent = peakSpeed.toFixed(0);
                        drawSpeedometer(peakSpeed, 200);
                        drawSpeedVisualizer();
                    }
                    
                    lastLoaded = e.loaded;
                    lastTime = now;
                }
            };
            
            xhr.onload = () => {
                if (measurements.length > 5) {
                    const recent = measurements.slice(-5).reduce((a, b) => a + b, 0) / 5;
                    if (recent > 20 && currentSizeIndex < testSizes.length - 1) {
                        currentSizeIndex++;
                    }
                }
                setTimeout(uploadIteration, 50);
            };
            
            xhr.onerror = () => {
                setTimeout(uploadIteration, 200);
            };
            
            xhr.ontimeout = () => {
                setTimeout(uploadIteration, 200);
            };
            
            xhr.send(data);
        }
        
        uploadIteration();
    });
}

function calculateAdvancedStats() {
    document.getElementById('packet-loss').textContent = `${testResults.packetLoss.toFixed(2)}%`;
    
    const gamingLatency = latencyData.length > 0 ? Math.min(...latencyData) : 0;
    document.getElementById('gaming-latency').textContent = `${gamingLatency.toFixed(0)} ms`;
    
    let bufferbloat = 'İyi';
    if (testResults.jitter > 50 || testResults.packetLoss > 3) {
        bufferbloat = 'Kötü';
    } else if (testResults.jitter > 20 || testResults.packetLoss > 1) {
        bufferbloat = 'Orta';
    }
    document.getElementById('bufferbloat').textContent = bufferbloat;
    
    updatePerformanceRatings();
    analyzeSpikes();
}

function updatePerformanceRatings() {
    const ping = testResults.ping;
    const jitter = testResults.jitter;
    const download = testResults.download;
    const upload = testResults.upload;
    
    setRating('web-rating', download < 1 ? 'poor' : download < 5 ? 'fair' : download < 10 ? 'good' : 'excellent',
        download < 1 ? 'Zayıf' : download < 5 ? 'Orta' : download < 10 ? 'İyi' : 'Mükemmel');
    
    setRating('video-rating', download < 3 ? 'poor' : download < 8 ? 'fair' : download < 15 ? 'good' : 'excellent',
        download < 3 ? 'Zayıf' : download < 8 ? 'Orta' : download < 15 ? 'İyi' : 'Mükemmel');
    
    setRating('gaming-rating', ping > 100 || jitter > 40 ? 'poor' : ping > 60 || jitter > 20 ? 'fair' : ping > 40 || jitter > 10 ? 'good' : 'excellent',
        ping > 100 || jitter > 40 ? 'Zayıf' : ping > 60 || jitter > 20 ? 'Orta' : ping > 40 || jitter > 10 ? 'İyi' : 'Mükemmel');
    
    setRating('streaming-rating', download < 15 ? 'poor' : download < 25 ? 'fair' : download < 40 ? 'good' : 'excellent',
        download < 15 ? 'Zayıf' : download < 25 ? 'Orta' : download < 40 ? 'İyi' : 'Mükemmel');
    
    setRating('call-rating', ping > 150 || upload < 1 ? 'poor' : ping > 100 || upload < 2 ? 'fair' : ping > 80 || upload < 3 ? 'good' : 'excellent',
        ping > 150 || upload < 1 ? 'Zayıf' : ping > 100 || upload < 2 ? 'Orta' : ping > 80 || upload < 3 ? 'İyi' : 'Mükemmel');
    
    setRating('download-rating', download < 5 ? 'poor' : download < 20 ? 'fair' : download < 50 ? 'good' : 'excellent',
        download < 5 ? 'Çok Yavaş' : download < 20 ? 'Yavaş' : download < 50 ? 'Normal' : 'Hızlı');
}

function setRating(id, ratingClass, ratingText) {
    const el = document.getElementById(id);
    if (el) {
        el.parentElement.className = `game-stat ${ratingClass}`;
        el.querySelector('.rating-text').textContent = ratingText;
    }
}

function analyzeSpikes() {
    if (latencyData.length < 5) return;
    
    const avgPing = latencyData.reduce((a, b) => a + b, 0) / latencyData.length;
    const variance = latencyData.reduce((sum, ping) => sum + Math.pow(ping - avgPing, 2), 0) / latencyData.length;
    const stdDev = Math.sqrt(variance);
    const spikeThreshold = Math.max(avgPing + (2 * stdDev), avgPing * 1.5);
    
    let spikeCount = 0;
    latencyData.forEach(ping => {
        if (ping > spikeThreshold) spikeCount++;
    });
    
    document.getElementById('spike-count').textContent = spikeCount;
    document.getElementById('max-ping').textContent = `${Math.max(...latencyData).toFixed(0)} ms`;
    document.getElementById('min-ping').textContent = `${Math.min(...latencyData).toFixed(0)} ms`;
}

function drawLatencyGraph() {
    const canvas = document.getElementById('latency-canvas');
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    ctx.clearRect(0, 0, width, height);
    
    if (latencyData.length < 2) return;
    
    const maxPing = Math.max(...latencyData);
    const minPing = Math.min(...latencyData);
    const avgPing = latencyData.reduce((a, b) => a + b, 0) / latencyData.length;
    const range = maxPing - minPing || 1;
    const padding = 40;
    
    const variance = latencyData.reduce((sum, ping) => sum + Math.pow(ping - avgPing, 2), 0) / latencyData.length;
    const stdDev = Math.sqrt(variance);
    const spikeThreshold = Math.max(avgPing + (2 * stdDev), avgPing * 1.5);
    
    ctx.strokeStyle = '#2a3547';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = padding + (height - 2 * padding) * (i / 4);
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(width - padding, y);
        ctx.stroke();
    }
    
    ctx.fillStyle = '#8892a6';
    ctx.font = '10px JetBrains Mono';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
        const y = padding + (height - 2 * padding) * (i / 4);
        const value = maxPing - (range * (i / 4));
        ctx.fillText(`${value.toFixed(0)}ms`, padding - 10, y + 4);
    }
    
    const avgY = padding + (height - 2 * padding) * (1 - (avgPing - minPing) / range);
    ctx.strokeStyle = '#ffcc00';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(padding, avgY);
    ctx.lineTo(width - padding, avgY);
    ctx.stroke();
    ctx.setLineDash([]);
    
    if (spikeThreshold <= maxPing) {
        const thresholdY = padding + (height - 2 * padding) * (1 - (spikeThreshold - minPing) / range);
        ctx.strokeStyle = '#ff0055';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(padding, thresholdY);
        ctx.lineTo(width - padding, thresholdY);
        ctx.stroke();
        ctx.setLineDash([]);
    }
    
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2;
    ctx.shadowBlur = 5;
    ctx.shadowColor = '#00f0ff';
    ctx.beginPath();
    
    const stepX = (width - 2 * padding) / (latencyData.length - 1);
    latencyData.forEach((ping, i) => {
        const x = padding + i * stepX;
        const y = padding + (height - 2 * padding) * (1 - (ping - minPing) / range);
        
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });
    ctx.stroke();
    ctx.shadowBlur = 0;
    
    ctx.fillStyle = '#ff0055';
    latencyData.forEach((ping, i) => {
        if (ping > spikeThreshold) {
            const x = padding + i * stepX;
            const y = padding + (height - 2 * padding) * (1 - (ping - minPing) / range);
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, Math.PI * 2);
            ctx.fill();
        }
    });
}

function drawSpeedVisualizer() {
    const canvas = document.getElementById('speed-canvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    ctx.clearRect(0, 0, width, height);
    
    const padding = 50;
    const graphWidth = width - 2 * padding;
    const graphHeight = height - 2 * padding;
    
    const allData = [...downloadSpeedData, ...uploadSpeedData];
    if (allData.length === 0) return;
    
    const maxSpeed = Math.max(...allData, 10);
    const maxDataPoints = Math.max(downloadSpeedData.length, uploadSpeedData.length);
    
    ctx.strokeStyle = '#2a3547';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = padding + (graphHeight * i / 4);
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(width - padding, y);
        ctx.stroke();
    }
    
    ctx.fillStyle = '#8892a6';
    ctx.font = '11px JetBrains Mono';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
        const y = padding + (graphHeight * i / 4);
        const value = maxSpeed - (maxSpeed * i / 4);
        ctx.fillText(`${value.toFixed(0)}`, padding - 10, y + 4);
    }
    
    if (downloadSpeedData.length > 1) {
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 3;
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#00f0ff';
        ctx.beginPath();
        
        downloadSpeedData.forEach((speed, i) => {
            const x = padding + (graphWidth * i / Math.max(maxDataPoints - 1, 1));
            const y = padding + graphHeight - (graphHeight * speed / maxSpeed);
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        ctx.stroke();
        ctx.shadowBlur = 0;
    }
    
    if (uploadSpeedData.length > 1) {
        ctx.strokeStyle = '#ff00ff';
        ctx.lineWidth = 3;
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#ff00ff';
        ctx.beginPath();
        
        uploadSpeedData.forEach((speed, i) => {
            const x = padding + (graphWidth * i / Math.max(maxDataPoints - 1, 1));
            const y = padding + graphHeight - (graphHeight * speed / maxSpeed);
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        ctx.stroke();
        ctx.shadowBlur = 0;
    }
}

function toggleStats() {
    const content = document.getElementById('stats-content');
    const btn = document.getElementById('toggle-stats');
    
    if (content.classList.contains('active')) {
        content.classList.remove('active');
        btn.textContent = '▼';
    } else {
        content.classList.add('active');
        btn.textContent = '▲';
    }
}

function updateStatus(message) {
    document.getElementById('test-status').textContent = message;
}

function clearCanvas(id) {
    const canvas = document.getElementById(id);
    if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

let firstTestCompleted = false;
const originalStopTest = stopTest;
stopTest = function() {
    originalStopTest();
    if (!firstTestCompleted && testResults.download > 0) {
        firstTestCompleted = true;
        setTimeout(() => {
            const content = document.getElementById('stats-content');
            const btn = document.getElementById('toggle-stats');
            if (!content.classList.contains('active')) {
                content.classList.add('active');
                btn.textContent = '▲';
            }
        }, 500);
    }
};
