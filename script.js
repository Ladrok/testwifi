const canvas = document.getElementById('liveChart');
const ctx = canvas.getContext('2d');
let chartData = [];

// 1. IP VE KONUM BİLGİSİNİ ÇEK (Sayfa açılınca)
// Bu fonksiyon "gerçek" veriyi çeken motor
// 1. GERÇEK KONUM VE IP BİLGİSİNİ ÇEK
async function getNetworkInfo() {
    log("Konum izni isteniyor...");

    // Tarayıcıdan gerçek konum izni iste (O meşhur pop-up'ı açar)
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(async (position) => {
            // Kullanıcı izin verirse burası çalışır
            log("Konum izni alındı, ISS bilgileri çekiliyor...", "info");
            fetchIPInfo(); 
        }, (error) => {
            // Kullanıcı "Engelle" derse burası çalışır
            log("Konum izni reddedildi. IP üzerinden devam ediliyor.", "warn");
            fetchIPInfo();
        });
    } else {
        fetchIPInfo();
    }
}

// IP ve ISS bilgilerini getiren yardımcı fonksiyon
// script.js içindeki fetchIPInfo fonksiyonunu bununla değiştir
async function fetchIPInfo() {
    try {
        const res = await fetch('https://ipapi.co/json/');
        if (!res.ok) throw new Error("API hatası");
        const data = await res.json();
        
        document.getElementById('ip-addr').innerText = data.ip;
        document.getElementById('location').innerText = `${data.city}, ${data.country_name}`;
        document.getElementById('isp').innerText = data.org;
        
        log(`ISS Bağlantısı: ${data.org} (${data.asn})`);
    } catch (e) {
        document.getElementById('ip-addr').innerText = "127.0.0.1 (Local)";
        document.getElementById('location').innerText = "Yerel Dosya Erişimi";
        document.getElementById('isp').innerText = "Bilinmiyor";
        log("NOT: Yerel dosyadan (file://) çalıştırdığın için IP/Konum çekilemiyor. Vercel'de çalışacaktır.", "warn");
    }
}
// Sayfa yüklendiğinde başlat
getNetworkInfo();

function log(msg, type = '') {
    const box = document.getElementById('logs');
    box.innerHTML += `<div class="line ${type}">> ${msg}</div>`;
    box.scrollTop = box.scrollHeight;
}

function updateChart(val, color) {
    chartData.push(val);
    if(chartData.length > 60) chartData.shift();
    
    ctx.clearRect(0,0,canvas.width, canvas.height);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    let max = Math.max(...chartData, 10);
    chartData.forEach((v, i) => {
        let x = (i / 60) * canvas.width;
        let y = canvas.height - (v / max) * canvas.height;
        if(i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
}

async function startFullTest() {
    const btn = document.getElementById('start-btn');
    btn.disabled = true;
    chartData = [];
    
    // PING TESTİ
    document.getElementById('status-text').innerText = "PING...";
    let pings = [];
    for(let i=0; i<10; i++) {
        let start = performance.now();
        await fetch('https://www.google.com/favicon.ico?t='+Date.now(), {mode:'no-cors'});
        pings.push(performance.now() - start);
        document.getElementById('ping-val').innerText = `${pings[i].toFixed(0)} / -`;
        await new Promise(r => setTimeout(r, 100));
    }
    let jitter = Math.abs(Math.max(...pings) - Math.min(...pings));
    document.getElementById('ping-val').innerText = `${(pings.reduce((a,b)=>a+b)/10).toFixed(0)} / ${jitter.toFixed(1)}`;

    // DOWNLOAD TESTİ (Gerçekçi hız için optimize edildi)
    document.getElementById('status-text').innerText = "DOWNLOAD ANALYZING...";
    const dlUrl = "https://cdnjs.cloudflare.com/ajax/libs/three.js/0.158.0/three.min.js";
    let dlSpeeds = [];
    
    for(let i=0; i<20; i++) {
        let start = performance.now();
        let res = await fetch(dlUrl + "?cache=" + Math.random());
        let blob = await res.blob();
        let end = performance.now();
        
        let duration = (end - start) / 1000;
        let mbps = (blob.size * 8 / duration) / 1000000;
        
        // Hatalı sıçramaları (30mbps gibi) temizle
        if(mbps < 80) {
            dlSpeeds.push(mbps);
            let avg = dlSpeeds.reduce((a,b)=>a+b)/dlSpeeds.length;
            document.getElementById('dl-val').innerText = avg.toFixed(2);
            updateChart(mbps, '#00ff41');
        }
    }

    // UPLOAD TESTİ
    document.getElementById('status-text').innerText = "UPLOAD ANALYZING...";
    chartData = [];
    for(let i=0; i<10; i++) {
        let dummy = new Uint8Array(1024 * 500); // 0.5MB
        let start = performance.now();
        await fetch('https://httpbin.org/post', { method: 'POST', body: dummy });
        let end = performance.now();
        let mbps = (dummy.length * 8 / ((end - start) / 1000)) / 1000000;
        
        document.getElementById('ul-val').innerText = mbps.toFixed(2);
        updateChart(mbps, '#00d2ff');
    }

    document.getElementById('status-text').innerText = "ANALİZ TAMAMLANDI";
    btn.disabled = false;
    log("Test bitti. Tüm veriler analiz edildi.");
}

// Canvas resize
canvas.width = canvas.offsetWidth;
canvas.height = canvas.offsetHeight;