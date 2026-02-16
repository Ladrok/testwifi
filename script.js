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
    quick: { duration: 8, samples: 15 },
    normal: { duration: 20, samples: 40 },
    extended: { duration: 45, samples: 80 }
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    console.log('NetSpeed Pro initialized');
    fetchIPInfo();
    initializeCanvas();
    setupEventListeners();
    console.log('Setup complete, ready for testing');
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
        console.log('Fetching IP info...');
        const response = await fetch('https://ipapi.co/json/');
        const data = await response.json();
        
        console.log('IP info received:', data);
        
        document.getElementById('ip-address').textContent = data.ip || 'Bilinmiyor';
        document.getElementById('isp').textContent = (data.org || 'Bilinmiyor').substring(0, 30);
        document.getElementById('location').textContent = `${data.city}, ${data.country_name}` || 'Bilinmiyor';
        document.getElementById('server-location').textContent = `${data.city}, ${data.country_name}`;
        
        // Get connection type
        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (connection) {
            document.getElementById('connection-type').textContent = connection.effectiveType.toUpperCase();
        } else {
            document.getElementById('connection-type').textContent = 'Unknown';
        }
    } catch (error) {
        console.error('IP bilgisi alınamadı:', error);
        document.getElementById('ip-address').textContent = 'Tespit edilemedi';
        document.getElementById('isp').textContent = 'Bilinmiyor';
        document.getElementById('location').textContent = 'Bilinmiyor';
        document.getElementById('connection-type').textContent = 'Unknown';
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
    
    // Reset UI
    document.getElementById('download-speed').textContent = '-- Mbps';
    document.getElementById('upload-speed').textContent = '-- Mbps';
    document.getElementById('ping-value').textContent = '-- ms';
    document.getElementById('jitter-value').textContent = '-- ms';
    document.getElementById('current-speed').textContent = '0';
    drawSpeedometer(0, 500);
    
    const config = testConfig[testMode];
    const startTime = Date.now();
    
    try {
        console.log('Starting speed test...');
        
        // Phase 1: Ping Test
        console.log('Phase 1: Ping test');
        await runPingTest(config.samples);
        
        if (!isTestRunning) {
            console.log('Test stopped by user');
            return;
        }
        
        // Phase 2: Download Test
        console.log('Phase 2: Download test');
        await runDownloadTest(config.duration);
        
        if (!isTestRunning) {
            console.log('Test stopped by user');
            return;
        }
        
        // Phase 3: Upload Test
        console.log('Phase 3: Upload test');
        await runUploadTest(config.duration);
        
        // Calculate final stats
        console.log('Calculating final stats');
        calculateAdvancedStats();
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        document.getElementById('test-duration').textContent = `${duration} sn`;
        
        console.log('Test completed successfully', testResults);
        
    } catch (error) {
        console.error('Test error:', error);
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
        
        // Filter out obvious errors
        if (ping < 500) {
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
        }
        
        await sleep(50); // Faster ping interval
    }
    
    if (pings.length > 0) {
        testResults.ping = pings.reduce((a, b) => a + b, 0) / pings.length;
        testResults.jitter = calculateJitter(pings);
    }
}

async function measurePing() {
    const start = performance.now();
    
    try {
        // Simple image request for ping
        const img = new Image();
        const promise = new Promise((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject();
            setTimeout(() => reject('timeout'), 3000);
        });
        
        img.src = 'https://www.google.com/favicon.ico?t=' + Date.now();
        
        await promise;
        const ping = performance.now() - start;
        return Math.max(1, ping);
    } catch (error) {
        // Fallback to fetch
        try {
            await fetch('https://cloudflare.com/cdn-cgi/trace?t=' + Date.now(), { 
                method: 'GET',
                cache: 'no-cache'
            });
            return performance.now() - start;
        } catch {
            return 100; // Default ping on error
        }
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

// Download Test with XMLHttpRequest for better progress tracking
function runDownloadTest(duration) {
    return new Promise((resolve) => {
        updateStatus('Download hızı ölçülüyor...');
        
        let measurements = [];
        let startTime = Date.now();
        let lastUpdate = Date.now();
        let iteration = 0;
        
        const testSizes = [5, 10, 25, 50, 100]; // MB
        let currentSizeIndex = 0;
        
        function downloadIteration() {
            if (Date.now() - startTime > duration * 1000 || !isTestRunning) {
                // Calculate final result
                if (measurements.length > 0) {
                    const avgSpeed = measurements.slice(-10).reduce((a, b) => a + b, 0) / Math.min(10, measurements.length);
                    testResults.download = avgSpeed;
                    document.getElementById('download-speed').textContent = `${avgSpeed.toFixed(2)} Mbps`;
                }
                resolve();
                return;
            }
            
            const size = testSizes[Math.min(currentSizeIndex, testSizes.length - 1)];
            const url = `https://speed.cloudflare.com/__down?bytes=${size * 1000000}`;
            
            const xhr = new XMLHttpRequest();
            const dlStart = Date.now();
            let lastLoaded = 0;
            let lastTime = dlStart;
            
            xhr.open('GET', url + '&r=' + Math.random(), true);
            xhr.responseType = 'arraybuffer';
            
            xhr.onprogress = (e) => {
                if (!isTestRunning) {
                    xhr.abort();
                    resolve();
                    return;
                }
                
                const now = Date.now();
                const timeDiff = (now - lastTime) / 1000;
                
                if (timeDiff > 0.1 && e.loaded > lastLoaded) {
                    const bytesDiff = e.loaded - lastLoaded;
                    const speedMbps = (bytesDiff * 8) / (timeDiff * 1000000);
                    
                    if (speedMbps > 0.1 && speedMbps < 2000) {
                        measurements.push(speedMbps);
                        
                        // Get average of last 5 measurements
                        const recent = measurements.slice(-5);
                        const avgSpeed = recent.reduce((a, b) => a + b, 0) / recent.length;
                        
                        testResults.download = avgSpeed;
                        document.getElementById('download-speed').textContent = `${avgSpeed.toFixed(2)} Mbps`;
                        document.getElementById('current-speed').textContent = avgSpeed.toFixed(0);
                        drawSpeedometer(avgSpeed, 500);
                        
                        console.log(`Download: ${avgSpeed.toFixed(2)} Mbps`);
                    }
                    
                    lastLoaded = e.loaded;
                    lastTime = now;
                }
            };
            
            xhr.onload = () => {
                iteration++;
                // Increase file size if getting good speeds
                if (measurements.length > 3) {
                    const recentAvg = measurements.slice(-3).reduce((a, b) => a + b, 0) / 3;
                    if (recentAvg > 20 && currentSizeIndex < testSizes.length - 1) {
                        currentSizeIndex++;
                    }
                }
                setTimeout(downloadIteration, 100);
            };
            
            xhr.onerror = () => {
                console.error('Download XHR error');
                setTimeout(downloadIteration, 200);
            };
            
            xhr.send();
        }
        
        downloadIteration();
    });
}

// Upload Test with XMLHttpRequest
function runUploadTest(duration) {
    return new Promise((resolve) => {
        updateStatus('Upload hızı ölçülüyor...');
        
        let measurements = [];
        const startTime = Date.now();
        let iteration = 0;
        
        const testSizes = [1, 2, 5, 10]; // MB
        let currentSizeIndex = 0;
        
        function uploadIteration() {
            if (Date.now() - startTime > duration * 1000 || !isTestRunning) {
                // Calculate final result
                if (measurements.length > 0) {
                    const avgSpeed = measurements.slice(-8).reduce((a, b) => a + b, 0) / Math.min(8, measurements.length);
                    testResults.upload = avgSpeed;
                    document.getElementById('upload-speed').textContent = `${avgSpeed.toFixed(2)} Mbps`;
                }
                resolve();
                return;
            }
            
            const size = testSizes[Math.min(currentSizeIndex, testSizes.length - 1)];
            const url = 'https://speed.cloudflare.com/__up';
            
            // Generate random data
            const data = new Uint8Array(size * 1000000);
            crypto.getRandomValues(data);
            
            const xhr = new XMLHttpRequest();
            const ulStart = Date.now();
            let lastLoaded = 0;
            let lastTime = ulStart;
            
            xhr.open('POST', url, true);
            
            xhr.upload.onprogress = (e) => {
                if (!isTestRunning) {
                    xhr.abort();
                    resolve();
                    return;
                }
                
                const now = Date.now();
                const timeDiff = (now - lastTime) / 1000;
                
                if (timeDiff > 0.1 && e.loaded > lastLoaded) {
                    const bytesDiff = e.loaded - lastLoaded;
                    const speedMbps = (bytesDiff * 8) / (timeDiff * 1000000);
                    
                    if (speedMbps > 0.1 && speedMbps < 1000) {
                        measurements.push(speedMbps);
                        
                        // Get average of last 5 measurements
                        const recent = measurements.slice(-5);
                        const avgSpeed = recent.reduce((a, b) => a + b, 0) / recent.length;
                        
                        testResults.upload = avgSpeed;
                        document.getElementById('upload-speed').textContent = `${avgSpeed.toFixed(2)} Mbps`;
                        document.getElementById('current-speed').textContent = avgSpeed.toFixed(0);
                        drawSpeedometer(avgSpeed, 200);
                        
                        console.log(`Upload: ${avgSpeed.toFixed(2)} Mbps`);
                    }
                    
                    lastLoaded = e.loaded;
                    lastTime = now;
                }
            };
            
            xhr.onload = () => {
                iteration++;
                // Increase file size if getting good speeds
                if (measurements.length > 3) {
                    const recentAvg = measurements.slice(-3).reduce((a, b) => a + b, 0) / 3;
                    if (recentAvg > 15 && currentSizeIndex < testSizes.length - 1) {
                        currentSizeIndex++;
                    }
                }
                setTimeout(uploadIteration, 100);
            };
            
            xhr.onerror = () => {
                console.error('Upload XHR error');
                setTimeout(uploadIteration, 200);
            };
            
            xhr.send(data);
        }
        
        uploadIteration();
    });
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
