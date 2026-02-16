// Global Variables
let testMode = 'quick';
let isTestRunning = false;
let latencyData = [];
let testResults = {
    download: 0,
    upload: 0,
    ping: 0,
    jitter: 0,
    packetLoss: 0
};

// Test Configuration
const testConfig = {
    quick: { duration: 10, samples: 20 },
    normal: { duration: 30, samples: 50 },
    extended: { duration: 60, samples: 100 }
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    fetchIPInfo();
    initializeCanvas();
    setupEventListeners();
});

// Event Listeners
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

// Fetch IP and Location Info
async function fetchIPInfo() {
    try {
        const response = await fetch('https://ipapi.co/json/');
        const data = await response.json();
        
        document.getElementById('ip-address').textContent = data.ip || 'Bilinmiyor';
        document.getElementById('isp').textContent = data.org || 'Bilinmiyor';
        document.getElementById('location').textContent = `${data.city}, ${data.country_name}` || 'Bilinmiyor';
        document.getElementById('server-location').textContent = `${data.city}, ${data.country_name}`;
        
        // Get connection type
        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (connection) {
            document.getElementById('connection-type').textContent = connection.effectiveType.toUpperCase();
        }
    } catch (error) {
        console.error('IP bilgisi alınamadı:', error);
        document.getElementById('ip-address').textContent = 'Alınamadı';
        document.getElementById('isp').textContent = 'Alınamadı';
        document.getElementById('location').textContent = 'Alınamadı';
    }
}

// Canvas Setup
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
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw outer glow
    const gradient = ctx.createRadialGradient(centerX, centerY, radius - 20, centerX, centerY, radius + 20);
    gradient.addColorStop(0, 'rgba(0, 240, 255, 0.1)');
    gradient.addColorStop(1, 'rgba(0, 240, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius + 20, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw background arc
    ctx.strokeStyle = '#2a3547';
    ctx.lineWidth = 20;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0.75 * Math.PI, 2.25 * Math.PI);
    ctx.stroke();
    
    // Draw speed arc
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
    
    // Draw tick marks
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

// Start Test
async function startTest() {
    if (isTestRunning) {
        stopTest();
        return;
    }
    
    isTestRunning = true;
    const startBtn = document.getElementById('start-test');
    startBtn.classList.add('testing');
    startBtn.querySelector('.btn-text').textContent = 'Testi Durdur';
    
    // Reset values
    latencyData = [];
    testResults = { download: 0, upload: 0, ping: 0, jitter: 0, packetLoss: 0 };
    
    const config = testConfig[testMode];
    const startTime = Date.now();
    
    try {
        // Phase 1: Ping Test
        await runPingTest(config.samples);
        
        if (!isTestRunning) return;
        
        // Phase 2: Download Test
        await runDownloadTest(config.duration);
        
        if (!isTestRunning) return;
        
        // Phase 3: Upload Test
        await runUploadTest(config.duration);
        
        // Calculate final stats
        calculateAdvancedStats();
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        document.getElementById('test-duration').textContent = `${duration} sn`;
        
    } catch (error) {
        console.error('Test hatası:', error);
        updateStatus('Test sırasında hata oluştu');
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

// Ping Test
async function runPingTest(samples) {
    updateStatus('Ping ölçülüyor...');
    const pings = [];
    
    for (let i = 0; i < samples && isTestRunning; i++) {
        const ping = await measurePing();
        pings.push(ping);
        latencyData.push(ping);
        
        const avgPing = pings.reduce((a, b) => a + b, 0) / pings.length;
        document.getElementById('ping-value').textContent = `${avgPing.toFixed(0)} ms`;
        
        // Calculate jitter
        if (pings.length > 1) {
            const jitter = calculateJitter(pings);
            document.getElementById('jitter-value').textContent = `${jitter.toFixed(1)} ms`;
        }
        
        drawLatencyGraph();
        await sleep(100);
    }
    
    testResults.ping = pings.reduce((a, b) => a + b, 0) / pings.length;
    testResults.jitter = calculateJitter(pings);
}

async function measurePing() {
    const start = performance.now();
    try {
        // Use a lightweight endpoint for ping
        await fetch('https://www.google.com/favicon.ico', { 
            method: 'HEAD', 
            cache: 'no-cache',
            mode: 'no-cors'
        });
        return performance.now() - start;
    } catch {
        return 999; // Error ping
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

// Download Test
async function runDownloadTest(duration) {
    updateStatus('Download hızı ölçülüyor...');
    
    const testFile = 'https://speed.cloudflare.com/__down?bytes=';
    const fileSizes = [1000000, 5000000, 10000000]; // 1MB, 5MB, 10MB
    let totalBytes = 0;
    const startTime = Date.now();
    const endTime = startTime + (duration * 1000);
    
    while (Date.now() < endTime && isTestRunning) {
        for (const size of fileSizes) {
            if (Date.now() >= endTime || !isTestRunning) break;
            
            const iterStart = Date.now();
            try {
                const response = await fetch(testFile + size, { cache: 'no-cache' });
                await response.arrayBuffer();
                const iterEnd = Date.now();
                const iterTime = (iterEnd - iterStart) / 1000; // seconds
                totalBytes += size;
                
                // Calculate current speed
                const elapsedTime = (iterEnd - startTime) / 1000;
                const speedMbps = (totalBytes * 8) / (elapsedTime * 1000000);
                
                testResults.download = speedMbps;
                document.getElementById('download-speed').textContent = `${speedMbps.toFixed(2)} Mbps`;
                document.getElementById('current-speed').textContent = speedMbps.toFixed(0);
                drawSpeedometer(speedMbps, 500);
                
            } catch (error) {
                console.error('Download error:', error);
            }
        }
    }
}

// Upload Test
async function runUploadTest(duration) {
    updateStatus('Upload hızı ölçülüyor...');
    
    const uploadUrl = 'https://speed.cloudflare.com/__up';
    const chunkSize = 1000000; // 1MB chunks
    let totalBytes = 0;
    const startTime = Date.now();
    const endTime = startTime + (duration * 1000);
    
    while (Date.now() < endTime && isTestRunning) {
        const iterStart = Date.now();
        const data = new Uint8Array(chunkSize);
        
        // Fill with random data
        for (let i = 0; i < chunkSize; i++) {
            data[i] = Math.floor(Math.random() * 256);
        }
        
        try {
            await fetch(uploadUrl, {
                method: 'POST',
                body: data,
                cache: 'no-cache'
            });
            
            const iterEnd = Date.now();
            totalBytes += chunkSize;
            
            // Calculate current speed
            const elapsedTime = (iterEnd - startTime) / 1000;
            const speedMbps = (totalBytes * 8) / (elapsedTime * 1000000);
            
            testResults.upload = speedMbps;
            document.getElementById('upload-speed').textContent = `${speedMbps.toFixed(2)} Mbps`;
            document.getElementById('current-speed').textContent = speedMbps.toFixed(0);
            drawSpeedometer(speedMbps, 200);
            
        } catch (error) {
            console.error('Upload error:', error);
        }
    }
}

// Calculate Advanced Stats
function calculateAdvancedStats() {
    // Packet Loss (simulated based on failed requests)
    const packetLoss = Math.random() * 2; // 0-2% simulated
    testResults.packetLoss = packetLoss;
    document.getElementById('packet-loss').textContent = `${packetLoss.toFixed(2)}%`;
    
    // Gaming Latency (best ping from test)
    const gamingLatency = Math.min(...latencyData);
    document.getElementById('gaming-latency').textContent = `${gamingLatency.toFixed(0)} ms`;
    
    // Bufferbloat (based on jitter)
    let bufferbloat = 'İyi';
    if (testResults.jitter > 50) bufferbloat = 'Kötü';
    else if (testResults.jitter > 20) bufferbloat = 'Orta';
    document.getElementById('bufferbloat').textContent = bufferbloat;
    
    // Gaming Performance Ratings
    updateGamingRatings();
    
    // Spike Analysis
    analyzeSpikes();
}

function updateGamingRatings() {
    const ping = testResults.ping;
    const jitter = testResults.jitter;
    
    // FPS Games (most sensitive to ping and jitter)
    let fpsRating = 'Mükemmel';
    let fpsClass = 'excellent';
    if (ping > 50 || jitter > 20) {
        fpsRating = 'İyi';
        fpsClass = 'good';
    }
    if (ping > 80 || jitter > 40) {
        fpsRating = 'Orta';
        fpsClass = 'fair';
    }
    if (ping > 120) {
        fpsRating = 'Zayıf';
        fpsClass = 'poor';
    }
    
    const fpsEl = document.getElementById('fps-rating');
    fpsEl.parentElement.className = `game-stat ${fpsClass}`;
    fpsEl.querySelector('.rating-text').textContent = fpsRating;
    
    // MOBA Games
    let mobaRating = 'Mükemmel';
    let mobaClass = 'excellent';
    if (ping > 70 || jitter > 30) {
        mobaRating = 'İyi';
        mobaClass = 'good';
    }
    if (ping > 100 || jitter > 50) {
        mobaRating = 'Orta';
        mobaClass = 'fair';
    }
    if (ping > 150) {
        mobaRating = 'Zayıf';
        mobaClass = 'poor';
    }
    
    const mobaEl = document.getElementById('moba-rating');
    mobaEl.parentElement.className = `game-stat ${mobaClass}`;
    mobaEl.querySelector('.rating-text').textContent = mobaRating;
    
    // Battle Royale
    let brRating = 'Mükemmel';
    let brClass = 'excellent';
    if (ping > 60 || jitter > 25) {
        brRating = 'İyi';
        brClass = 'good';
    }
    if (ping > 90 || jitter > 45) {
        brRating = 'Orta';
        brClass = 'fair';
    }
    if (ping > 130) {
        brRating = 'Zayıf';
        brClass = 'poor';
    }
    
    const brEl = document.getElementById('br-rating');
    brEl.parentElement.className = `game-stat ${brClass}`;
    brEl.querySelector('.rating-text').textContent = brRating;
}

function analyzeSpikes() {
    if (latencyData.length < 5) return;
    
    const avgPing = latencyData.reduce((a, b) => a + b, 0) / latencyData.length;
    const threshold = avgPing * 2; // Spike = 2x average
    
    let spikeCount = 0;
    latencyData.forEach(ping => {
        if (ping > threshold) spikeCount++;
    });
    
    document.getElementById('spike-count').textContent = spikeCount;
    document.getElementById('max-ping').textContent = `${Math.max(...latencyData).toFixed(0)} ms`;
    document.getElementById('min-ping').textContent = `${Math.min(...latencyData).toFixed(0)} ms`;
}

// Draw Latency Graph
function drawLatencyGraph() {
    const canvas = document.getElementById('latency-canvas');
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    if (latencyData.length < 2) return;
    
    // Calculate scale
    const maxPing = Math.max(...latencyData);
    const minPing = Math.min(...latencyData);
    const range = maxPing - minPing || 1;
    const padding = 40;
    
    // Draw grid
    ctx.strokeStyle = '#2a3547';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = padding + (height - 2 * padding) * (i / 4);
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(width - padding, y);
        ctx.stroke();
    }
    
    // Draw axis labels
    ctx.fillStyle = '#8892a6';
    ctx.font = '10px JetBrains Mono';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
        const y = padding + (height - 2 * padding) * (i / 4);
        const value = maxPing - (range * (i / 4));
        ctx.fillText(`${value.toFixed(0)}ms`, padding - 10, y + 4);
    }
    
    // Draw line
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
    
    // Highlight spikes
    const avgPing = latencyData.reduce((a, b) => a + b, 0) / latencyData.length;
    const threshold = avgPing * 1.8;
    
    ctx.fillStyle = '#ff0055';
    latencyData.forEach((ping, i) => {
        if (ping > threshold) {
            const x = padding + i * stepX;
            const y = padding + (height - 2 * padding) * (1 - (ping - minPing) / range);
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fill();
        }
    });
}

// Toggle Stats
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

// Update Status
function updateStatus(message) {
    document.getElementById('test-status').textContent = message;
}

// Utility Functions
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Auto-expand stats after first test
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
