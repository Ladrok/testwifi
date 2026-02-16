// Global Variables
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
        
        // Try multiple IP services
        let data;
        try {
            const response = await fetch('https://api.ipify.org?format=json');
            const ipData = await response.json();
            
            // Get detailed info from ipapi
            const detailResponse = await fetch(`https://ipapi.co/${ipData.ip}/json/`);
            data = await detailResponse.json();
        } catch (e) {
            // Fallback to cloudflare
            const response = await fetch('https://cloudflare.com/cdn-cgi/trace');
            const text = await response.text();
            const lines = text.split('\n');
            const ipLine = lines.find(l => l.startsWith('ip='));
            const ip = ipLine ? ipLine.split('=')[1] : 'Unknown';
            
            const detailResponse = await fetch(`https://ipapi.co/${ip}/json/`);
            data = await detailResponse.json();
        }
        
        console.log('IP info received:', data);
        
        // Display IP address clearly
        const ipAddress = data.ip || 'Bilinmiyor';
        document.getElementById('ip-address').textContent = ipAddress;
        console.log('Your IP:', ipAddress);
        
        // ISP name (remove AS number if present)
        let ispName = data.org || data.isp || 'Bilinmiyor';
        if (ispName.includes('AS')) {
            ispName = ispName.replace(/^AS\d+\s+/, '');
        }
        document.getElementById('isp').textContent = ispName.substring(0, 35);
        
        // Location
        const location = data.city && data.country_name 
            ? `${data.city}, ${data.country_name}` 
            : 'Bilinmiyor';
        document.getElementById('location').textContent = location;
        document.getElementById('server-location').textContent = location;
        
        // Get connection type - improved detection
        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        let connectionType = 'Bilinmiyor';
        
        if (connection) {
            // Check effective type first
            const effType = connection.effectiveType;
            const type = connection.type;
            
            console.log('Connection info:', { effectiveType: effType, type: type, downlink: connection.downlink });
            
            // Determine connection type
            if (type === 'wifi' || type === 'ethernet') {
                connectionType = type === 'wifi' ? 'WiFi' : 'Ethernet';
            } else if (effType) {
                // Use effective type for mobile
                if (effType === 'slow-2g') connectionType = '2G (Çok Yavaş)';
                else if (effType === '2g') connectionType = '2G';
                else if (effType === '3g') connectionType = '3G';
                else if (effType === '4g') connectionType = '4G/LTE';
                else connectionType = 'Genişbant';
            } else if (type) {
                // Fallback to type
                if (type === 'cellular') connectionType = 'Mobil Veri';
                else if (type === 'bluetooth') connectionType = 'Bluetooth';
                else connectionType = type.toUpperCase();
            }
            
            // Additional check based on downlink speed
            if (connection.downlink) {
                const downlink = connection.downlink;
                if (downlink > 50 && connectionType === 'Genişbant') {
                    connectionType = 'Fiber/Yüksek Hızlı';
                } else if (downlink > 10 && connectionType === 'Genişbant') {
                    connectionType = 'ADSL/Cable';
                }
            }
        } else {
            // No connection API, try to guess from user agent
            const ua = navigator.userAgent.toLowerCase();
            if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
                connectionType = 'Mobil (Bilinmiyor)';
            } else {
                connectionType = 'Kablolu/WiFi';
            }
        }
        
        document.getElementById('connection-type').textContent = connectionType;
        console.log('Connection type detected:', connectionType);
        
    } catch (error) {
        console.error('IP bilgisi alınamadı:', error);
        document.getElementById('ip-address').textContent = 'Tespit edilemedi';
        document.getElementById('isp').textContent = 'Bilinmiyor';
        document.getElementById('location').textContent = 'Bilinmiyor';
        document.getElementById('connection-type').textContent = 'Bilinmiyor';
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
    downloadSpeedData = [];
    uploadSpeedData = [];
    testResults = { download: 0, upload: 0, ping: 0, jitter: 0, packetLoss: 0 };
    
    // Reset UI
    document.getElementById('download-speed').textContent = '-- Mbps';
    document.getElementById('upload-speed').textContent = '-- Mbps';
    document.getElementById('ping-value').textContent = '-- ms';
    document.getElementById('jitter-value').textContent = '-- ms';
    document.getElementById('current-speed').textContent = '0';
    drawSpeedometer(0, 500);
    
    // Clear visualizer
    const canvas = document.getElementById('speed-canvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    
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
    let consecutiveErrors = 0;
    let totalErrors = 0;
    
    for (let i = 0; i < samples && isTestRunning; i++) {
        const ping = await measurePing();
        
        // Check for connection issues
        if (ping >= 500) {
            consecutiveErrors++;
            totalErrors++;
            
            // If too many consecutive errors, warn user
            if (consecutiveErrors >= 3) {
                updateStatus('⚠️ Bağlantı problemi tespit edildi!');
                console.warn('Connection issue detected: multiple high ping measurements');
            }
        } else {
            consecutiveErrors = 0; // Reset on successful ping
        }
        
        // Filter out obvious errors but keep high pings
        if (ping < 500) {
            pings.push(ping);
            latencyData.push(ping);
            
            const avgPing = pings.reduce((a, b) => a + b, 0) / pings.length;
            document.getElementById('ping-value').textContent = `${avgPing.toFixed(0)} ms`;
            
            // Calculate jitter
            if (pings.length > 1) {
                const jitter = calculateJitter(pings);
                document.getElementById('jitter-value').textContent = `${jitter.toFixed(1)} ms`;
                
                // Warn if jitter is very high
                if (jitter > 100) {
                    updateStatus('⚠️ Yüksek jitter - bağlantı kararsız!');
                }
            }
            
            drawLatencyGraph();
        }
        
        await sleep(50); // Faster ping interval
    }
    
    if (pings.length > 0) {
        testResults.ping = pings.reduce((a, b) => a + b, 0) / pings.length;
        testResults.jitter = calculateJitter(pings);
        testResults.packetLoss = (totalErrors / samples) * 100;
        
        // Log connection quality
        console.log(`Ping test completed: avg=${testResults.ping.toFixed(0)}ms, jitter=${testResults.jitter.toFixed(1)}ms, loss=${testResults.packetLoss.toFixed(1)}%`);
        
        // Warn if packet loss is high
        if (testResults.packetLoss > 5) {
            console.warn(`High packet loss detected: ${testResults.packetLoss.toFixed(1)}%`);
        }
    } else {
        updateStatus('❌ Bağlantı kurulamadı!');
        console.error('No successful ping measurements');
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
        
        // Larger test sizes for more accurate results
        const testSizes = [10, 25, 50, 100]; // MB
        let currentSizeIndex = 0;
        
        function downloadIteration() {
            if (Date.now() - startTime > duration * 1000 || !isTestRunning) {
                // Calculate final result - use median of best measurements
                if (measurements.length > 0) {
                    const sortedMeasurements = measurements.sort((a, b) => b - a);
                    const topMeasurements = sortedMeasurements.slice(0, Math.min(10, sortedMeasurements.length));
                    const avgSpeed = topMeasurements.reduce((a, b) => a + b, 0) / topMeasurements.length;
                    testResults.download = avgSpeed;
                    document.getElementById('download-speed').textContent = `${avgSpeed.toFixed(2)} Mbps`;
                    console.log(`Final Download: ${avgSpeed.toFixed(2)} Mbps`);
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
            let chunkMeasurements = [];
            
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
                
                if (timeDiff > 0.05 && e.loaded > lastLoaded) {
                    const bytesDiff = e.loaded - lastLoaded;
                    const speedMbps = (bytesDiff * 8) / (timeDiff * 1000000);
                    
                    if (speedMbps > 0.5 && speedMbps < 2000) {
                        chunkMeasurements.push(speedMbps);
                        measurements.push(speedMbps);
                        
                        // Get peak speed from recent measurements
                        const recent = measurements.slice(-8);
                        const peakSpeed = Math.max(...recent);
                        
                        testResults.download = peakSpeed;
                        document.getElementById('download-speed').textContent = `${peakSpeed.toFixed(2)} Mbps`;
                        document.getElementById('current-speed').textContent = peakSpeed.toFixed(0);
                        drawSpeedometer(peakSpeed, 500);
                        updateVisualizer('download', peakSpeed);
                    }
                    
                    lastLoaded = e.loaded;
                    lastTime = now;
                }
            };
            
            xhr.onload = () => {
                iteration++;
                // Increase file size if getting good speeds
                if (measurements.length > 5) {
                    const recentAvg = measurements.slice(-5).reduce((a, b) => a + b, 0) / 5;
                    if (recentAvg > 30 && currentSizeIndex < testSizes.length - 1) {
                        currentSizeIndex++;
                    }
                }
                setTimeout(downloadIteration, 50);
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

// Upload Test with XMLHttpRequest and multiple endpoints
function runUploadTest(duration) {
    return new Promise((resolve) => {
        updateStatus('Upload hızı ölçülüyor...');
        
        let measurements = [];
        const startTime = Date.now();
        let iteration = 0;
        let currentEndpoint = 0;
        
        // Multiple upload endpoints to try
        const uploadEndpoints = [
            'https://speed.cloudflare.com/__up',
            'https://www.google.com/upload',
            'https://httpbin.org/post',
            'https://api.github.com/markdown'
        ];
        
        // Test sizes
        const testSizes = [1, 2, 5, 10]; // MB
        let currentSizeIndex = 0;
        
        function uploadIteration() {
            if (Date.now() - startTime > duration * 1000 || !isTestRunning) {
                // Calculate final result
                if (measurements.length > 0) {
                    const sortedMeasurements = measurements.sort((a, b) => b - a);
                    const topMeasurements = sortedMeasurements.slice(0, Math.min(8, sortedMeasurements.length));
                    const avgSpeed = topMeasurements.reduce((a, b) => a + b, 0) / topMeasurements.length;
                    testResults.upload = avgSpeed;
                    document.getElementById('upload-speed').textContent = `${avgSpeed.toFixed(2)} Mbps`;
                    console.log(`Final Upload: ${avgSpeed.toFixed(2)} Mbps`);
                } else {
                    // If no measurements, show error
                    console.warn('No upload measurements recorded');
                    document.getElementById('upload-speed').textContent = 'Test edilemedi';
                    testResults.upload = 0;
                }
                resolve();
                return;
            }
            
            const size = testSizes[Math.min(currentSizeIndex, testSizes.length - 1)];
            const url = uploadEndpoints[currentEndpoint % uploadEndpoints.length];
            
            // Generate random data
            const data = new Uint8Array(size * 1000000);
            crypto.getRandomValues(data);
            
            const xhr = new XMLHttpRequest();
            const ulStart = Date.now();
            let lastLoaded = 0;
            let lastTime = ulStart;
            let hasProgress = false;
            
            xhr.open('POST', url, true);
            xhr.setRequestHeader('Content-Type', 'application/octet-stream');
            
            // Set timeout
            xhr.timeout = 10000; // 10 second timeout
            
            xhr.upload.onprogress = (e) => {
                if (!isTestRunning) {
                    xhr.abort();
                    resolve();
                    return;
                }
                
                hasProgress = true;
                const now = Date.now();
                const timeDiff = (now - lastTime) / 1000;
                
                if (timeDiff > 0.05 && e.loaded > lastLoaded) {
                    const bytesDiff = e.loaded - lastLoaded;
                    const speedMbps = (bytesDiff * 8) / (timeDiff * 1000000);
                    
                    if (speedMbps > 0.5 && speedMbps < 1000) {
                        measurements.push(speedMbps);
                        
                        // Get peak speed from recent measurements
                        const recent = measurements.slice(-8);
                        const peakSpeed = Math.max(...recent);
                        
                        testResults.upload = peakSpeed;
                        document.getElementById('upload-speed').textContent = `${peakSpeed.toFixed(2)} Mbps`;
                        document.getElementById('current-speed').textContent = peakSpeed.toFixed(0);
                        drawSpeedometer(peakSpeed, 200);
                        updateVisualizer('upload', peakSpeed);
                        
                        console.log(`Upload: ${peakSpeed.toFixed(2)} Mbps (endpoint ${currentEndpoint})`);
                    }
                    
                    lastLoaded = e.loaded;
                    lastTime = now;
                }
            };
            
            xhr.onload = () => {
                iteration++;
                console.log(`Upload iteration ${iteration} completed (endpoint ${currentEndpoint})`);
                
                // Increase file size if getting good speeds
                if (measurements.length > 5) {
                    const recentAvg = measurements.slice(-5).reduce((a, b) => a + b, 0) / 5;
                    if (recentAvg > 20 && currentSizeIndex < testSizes.length - 1) {
                        currentSizeIndex++;
                    }
                }
                
                setTimeout(uploadIteration, 50);
            };
            
            xhr.onerror = () => {
                console.error(`Upload XHR error on endpoint ${currentEndpoint}: ${url}`);
                // Try next endpoint
                currentEndpoint++;
                setTimeout(uploadIteration, 100);
            };
            
            xhr.ontimeout = () => {
                console.error(`Upload timeout on endpoint ${currentEndpoint}`);
                currentEndpoint++;
                setTimeout(uploadIteration, 100);
            };
            
            xhr.send(data);
            
            // Fallback: if no progress after 2 seconds, try next endpoint
            setTimeout(() => {
                if (!hasProgress) {
                    console.warn(`No progress on endpoint ${currentEndpoint}, switching...`);
                    xhr.abort();
                    currentEndpoint++;
                    uploadIteration();
                }
            }, 2000);
        }
        
        uploadIteration();
    });
}

// Calculate Advanced Stats
function calculateAdvancedStats() {
    // Packet Loss (from ping test)
    const packetLoss = testResults.packetLoss || 0;
    document.getElementById('packet-loss').textContent = `${packetLoss.toFixed(2)}%`;
    
    // Gaming Latency (best ping from test)
    const gamingLatency = latencyData.length > 0 ? Math.min(...latencyData) : 0;
    document.getElementById('gaming-latency').textContent = `${gamingLatency.toFixed(0)} ms`;
    
    // Bufferbloat (based on jitter and packet loss)
    let bufferbloat = 'İyi';
    if (testResults.jitter > 50 || packetLoss > 3) {
        bufferbloat = 'Kötü';
    } else if (testResults.jitter > 20 || packetLoss > 1) {
        bufferbloat = 'Orta';
    }
    document.getElementById('bufferbloat').textContent = bufferbloat;
    
    // Gaming Performance Ratings
    updateGamingRatings();
    
    // Spike Analysis
    analyzeSpikes();
    
    // Log summary
    console.log('Advanced stats calculated:', {
        packetLoss: `${packetLoss.toFixed(2)}%`,
        gamingLatency: `${gamingLatency.toFixed(0)}ms`,
        bufferbloat,
        download: `${testResults.download.toFixed(2)} Mbps`,
        upload: `${testResults.upload.toFixed(2)} Mbps`,
        ping: `${testResults.ping.toFixed(0)} ms`,
        jitter: `${testResults.jitter.toFixed(1)} ms`
    });
}

function updateGamingRatings() {
    const ping = testResults.ping;
    const jitter = testResults.jitter;
    const download = testResults.download;
    const upload = testResults.upload;
    
    // Web Tarama (only needs low download)
    let webRating = 'Mükemmel';
    let webClass = 'excellent';
    if (download < 1) {
        webRating = 'Zayıf';
        webClass = 'poor';
    } else if (download < 5) {
        webRating = 'Orta';
        webClass = 'fair';
    } else if (download < 10) {
        webRating = 'İyi';
        webClass = 'good';
    }
    
    const webEl = document.getElementById('web-rating');
    if (webEl) {
        webEl.parentElement.className = `game-stat ${webClass}`;
        webEl.querySelector('.rating-text').textContent = webRating;
    }
    
    // Video İzleme HD (needs ~5-10 Mbps)
    let videoRating = 'Mükemmel';
    let videoClass = 'excellent';
    if (download < 3) {
        videoRating = 'Zayıf';
        videoClass = 'poor';
    } else if (download < 8) {
        videoRating = 'Orta';
        videoClass = 'fair';
    } else if (download < 15) {
        videoRating = 'İyi';
        videoClass = 'good';
    }
    
    const videoEl = document.getElementById('video-rating');
    if (videoEl) {
        videoEl.parentElement.className = `game-stat ${videoClass}`;
        videoEl.querySelector('.rating-text').textContent = videoRating;
    }
    
    // Online Oyun (ping and jitter critical)
    let gamingRating = 'Mükemmel';
    let gamingClass = 'excellent';
    if (ping > 100 || jitter > 40) {
        gamingRating = 'Zayıf';
        gamingClass = 'poor';
    } else if (ping > 60 || jitter > 20) {
        gamingRating = 'Orta';
        gamingClass = 'fair';
    } else if (ping > 40 || jitter > 10) {
        gamingRating = 'İyi';
        gamingClass = 'good';
    }
    
    const gamingEl = document.getElementById('gaming-rating');
    if (gamingEl) {
        gamingEl.parentElement.className = `game-stat ${gamingClass}`;
        gamingEl.querySelector('.rating-text').textContent = gamingRating;
    }
    
    // 4K Streaming (needs 25+ Mbps)
    let streamingRating = 'Mükemmel';
    let streamingClass = 'excellent';
    if (download < 15) {
        streamingRating = 'Zayıf';
        streamingClass = 'poor';
    } else if (download < 25) {
        streamingRating = 'Orta';
        streamingClass = 'fair';
    } else if (download < 40) {
        streamingRating = 'İyi';
        streamingClass = 'good';
    }
    
    const streamingEl = document.getElementById('streaming-rating');
    if (streamingEl) {
        streamingEl.parentElement.className = `game-stat ${streamingClass}`;
        streamingEl.querySelector('.rating-text').textContent = streamingRating;
    }
    
    // Video Call (needs low ping, some upload)
    let callRating = 'Mükemmel';
    let callClass = 'excellent';
    if (ping > 150 || upload < 1 || download < 2) {
        callRating = 'Zayıf';
        callClass = 'poor';
    } else if (ping > 100 || upload < 2 || download < 5) {
        callRating = 'Orta';
        callClass = 'fair';
    } else if (ping > 80 || upload < 3 || download < 8) {
        callRating = 'İyi';
        callClass = 'good';
    }
    
    const callEl = document.getElementById('call-rating');
    if (callEl) {
        callEl.parentElement.className = `game-stat ${callClass}`;
        callEl.querySelector('.rating-text').textContent = callRating;
    }
    
    // Dosya İndirme (just download speed)
    let downloadRating = 'Mükemmel';
    let downloadClass = 'excellent';
    if (download < 5) {
        downloadRating = 'Çok Yavaş';
        downloadClass = 'poor';
    } else if (download < 20) {
        downloadRating = 'Yavaş';
        downloadClass = 'fair';
    } else if (download < 50) {
        downloadRating = 'Normal';
        downloadClass = 'good';
    }
    
    const downloadEl = document.getElementById('download-rating');
    if (downloadEl) {
        downloadEl.parentElement.className = `game-stat ${downloadClass}`;
        downloadEl.querySelector('.rating-text').textContent = downloadRating;
    }
}

function analyzeSpikes() {
    if (latencyData.length < 5) return;
    
    const avgPing = latencyData.reduce((a, b) => a + b, 0) / latencyData.length;
    const minPing = Math.min(...latencyData);
    const maxPing = Math.max(...latencyData);
    
    // Calculate standard deviation
    const variance = latencyData.reduce((sum, ping) => sum + Math.pow(ping - avgPing, 2), 0) / latencyData.length;
    const stdDev = Math.sqrt(variance);
    
    // Spike threshold: average + 2 standard deviations OR 1.5x average (whichever is stricter)
    const spikeThreshold = Math.max(avgPing + (2 * stdDev), avgPing * 1.5);
    
    let spikeCount = 0;
    let spikeIndices = [];
    latencyData.forEach((ping, index) => {
        if (ping > spikeThreshold) {
            spikeCount++;
            spikeIndices.push(index);
        }
    });
    
    document.getElementById('spike-count').textContent = spikeCount;
    document.getElementById('max-ping').textContent = `${maxPing.toFixed(0)} ms`;
    document.getElementById('min-ping').textContent = `${minPing.toFixed(0)} ms`;
    
    // Log spike analysis
    console.log(`Spike analysis: ${spikeCount} spikes detected (threshold: ${spikeThreshold.toFixed(0)}ms)`);
    
    // Warn if many spikes
    if (spikeCount > latencyData.length * 0.15) {
        console.warn(`High spike rate detected: ${((spikeCount / latencyData.length) * 100).toFixed(1)}%`);
    }
    
    return { spikeCount, spikeIndices, avgPing, minPing, maxPing, spikeThreshold };
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
    const avgPing = latencyData.reduce((a, b) => a + b, 0) / latencyData.length;
    const range = maxPing - minPing || 1;
    const padding = 40;
    
    // Calculate spike threshold
    const variance = latencyData.reduce((sum, ping) => sum + Math.pow(ping - avgPing, 2), 0) / latencyData.length;
    const stdDev = Math.sqrt(variance);
    const spikeThreshold = Math.max(avgPing + (2 * stdDev), avgPing * 1.5);
    
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
    
    // Draw average line
    const avgY = padding + (height - 2 * padding) * (1 - (avgPing - minPing) / range);
    ctx.strokeStyle = '#ffcc00';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(padding, avgY);
    ctx.lineTo(width - padding, avgY);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Label for average
    ctx.fillStyle = '#ffcc00';
    ctx.textAlign = 'left';
    ctx.fillText(`Avg: ${avgPing.toFixed(0)}ms`, width - padding + 10, avgY + 4);
    
    // Draw spike threshold line
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
        
        // Label for threshold
        ctx.fillStyle = '#ff0055';
        ctx.fillText(`Spike: ${spikeThreshold.toFixed(0)}ms`, width - padding + 10, thresholdY + 4);
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

// Update Speed Visualizer
function updateVisualizer(type, speed) {
    if (type === 'download') {
        downloadSpeedData.push(speed);
    } else if (type === 'upload') {
        uploadSpeedData.push(speed);
    }
    
    drawSpeedVisualizer();
}

// Draw Speed Visualizer
function drawSpeedVisualizer() {
    const canvas = document.getElementById('speed-canvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    const padding = 50;
    const graphWidth = width - 2 * padding;
    const graphHeight = height - 2 * padding;
    
    // Combine all data to find max
    const allData = [...downloadSpeedData, ...uploadSpeedData];
    if (allData.length === 0) return;
    
    const maxSpeed = Math.max(...allData, 10);
    const maxDataPoints = Math.max(downloadSpeedData.length, uploadSpeedData.length);
    
    // Draw grid
    ctx.strokeStyle = '#2a3547';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = padding + (graphHeight * i / 4);
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(width - padding, y);
        ctx.stroke();
    }
    
    // Draw Y-axis labels
    ctx.fillStyle = '#8892a6';
    ctx.font = '11px JetBrains Mono';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
        const y = padding + (graphHeight * i / 4);
        const value = maxSpeed - (maxSpeed * i / 4);
        ctx.fillText(`${value.toFixed(0)}`, padding - 10, y + 4);
    }
    
    // Draw X-axis label
    ctx.textAlign = 'center';
    ctx.fillText('Zaman (sn)', width / 2, height - 10);
    
    // Draw Y-axis label
    ctx.save();
    ctx.translate(15, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Hız (Mbps)', 0, 0);
    ctx.restore();
    
    // Draw download line
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
    
    // Draw upload line
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
