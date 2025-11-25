// public/client.js (ODA SİSTEMİ VE KAMERA ÇEVİRME İÇİN NİHAİ DÜZELTME)

const socket = io();
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const toggleButton = document.getElementById('toggleButton');
const switchCameraButton = document.getElementById('switchCameraButton');
const statusMessage = document.getElementById('statusMessage');
const remoteStatusMessage = document.getElementById('remoteStatusMessage');
const roomSetup = document.getElementById('roomSetup');
const videoContainer = document.getElementById('videoContainer');
const joinButton = document.getElementById('joinButton');
const roomNameInput = document.getElementById('roomName');
const roomStatus = document.getElementById('roomStatus');

let peerConnection; 
let localStream;    
let isCameraOn = false; 
let sender; 
let isInitiator = false;
let currentDeviceId = 'default'; // Başlangıçta varsayılan kamerayı tutar

// WebRTC Ayarları (STUN sunucusu)
const configuration = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] 
};

// --- Oda Giriş Mantığı ---
joinButton.addEventListener('click', () => {
    const roomName = roomNameInput.value.trim();
    if (roomName) {
        joinButton.disabled = true;
        roomNameInput.disabled = true;
        roomStatus.innerText = "Odaya bağlanılıyor...";
        socket.emit('join', roomName);
    } else {
        alert("Lütfen bir Oda Adı girin.");
    }
});

// --- Kamera Akışı Yönetimi ---

async function getCameraStream(deviceId) {
    try {
        if (localStream) stopCameraStream(false); 
        
        // Yeni kamera kısıtlamaları (default veya belirlenen deviceId)
        const constraints = {
            video: { deviceId: deviceId ? { exact: deviceId } : currentDeviceId },
            audio: false 
        };

        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        localVideo.srcObject = localStream;
        isCameraOn = true;
        
        // Başarılıysa, güncel cihaz ID'sini kaydet
        if (!deviceId) {
            currentDeviceId = localStream.getVideoTracks()[0].getSettings().deviceId;
        } else {
             currentDeviceId = deviceId;
        }

        // Arayüzü güncelle
        toggleButton.innerText = "Kamerayı Kapat";
        toggleButton.style.backgroundColor = "#f44336";
        statusMessage.innerText = isInitiator ? "Partner bekleniyor..." : "Bağlantı kuruluyor...";
        switchCameraButton.classList.remove('hidden'); // Çevir butonunu göster

        // Eğer WebRTC bağlantısı zaten varsa, yeni akışı gönder.
        if (peerConnection && localStream) {
            const videoTrack = localStream.getVideoTracks()[0];
            
            if (sender) {
                // Sender zaten varsa, track'i değiştir
                sender.replaceTrack(videoTrack).catch(e => console.error("Track değiştirme hatası:", e));
            } else {
                 // Eğer sender yoksa, yeniden negotiator (Offer/Answer) sürecini başlat
                 peerConnection.addTrack(videoTrack, localStream);
            }
        }
        
        return true; 
    } catch (error) {
        console.error("Kamera erişimi başarısız:", error);
        alert("Kamera izni verin."); 
        statusMessage.innerText = "Kamera erişimi engellendi.";
        return false; 
    }
}

function stopCameraStream(sendSignal = true) {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localVideo.srcObject = null;
    }
    isCameraOn = false;
    toggleButton.innerText = "Kamerayı Aç";
    toggleButton.style.backgroundColor = "#4CAF50";
    statusMessage.innerText = "Kamera kapalı.";
    switchCameraButton.classList.add('hidden');
    
    if (sendSignal) {
        socket.emit('cameraToggle', { state: 'kapali' }); 
    }
}


// --- Kamera Çevirme Mantığı (YENİ EKLEME) ---
switchCameraButton.addEventListener('click', async () => {
    if (!isCameraOn) return;

    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(device => device.kind === 'videoinput');

    if (videoDevices.length > 1) {
        // Mevcut kamerayı bul
        let currentIndex = videoDevices.findIndex(device => device.deviceId === currentDeviceId);
        
        // Sonraki kameranın index'ini bul (döngüsel)
        let nextIndex = (currentIndex + 1) % videoDevices.length;
        let nextDeviceId = videoDevices[nextIndex].deviceId;

        // Yeni kamerayı başlat
        const ready = await getCameraStream(nextDeviceId);
        
        // Partner'a sinyal gönder (gerekirse)
        if (ready) {
             socket.emit('cameraSwitch'); // Partner'ı bilgilendir (Arayüz güncellemesi için)
        }
        
    } else {
        alert("Birden fazla kamera bulunamadı.");
    }
});


// --- Düğme Olayı Yöneticisi ---
if (toggleButton) {
    toggleButton.addEventListener('click', () => {
        if (localStream && isCameraOn) {
            stopCameraStream(true); // Sinyal gönderir
        } else if (!isCameraOn) {
            getCameraStream().then(ready => {
                if (ready) {
                    socket.emit('cameraToggle', { state: 'acik' });
                }
            });
        }
    });
}


// --- WebRTC Bağlantı Yönetimi ---

function createPeerConnection(initiator) {
    isInitiator = initiator; 
    peerConnection = new RTCPeerConnection(configuration);
    
    // SENDER'I KUR
    if (localStream) {
        localStream.getTracks().forEach(track => {
            sender = peerConnection.addTrack(track, localStream); 
        });
    }

    // Akış geldiğinde (UZAK GÖRÜNTÜ ALINDIĞINDA)
    peerConnection.ontrack = (event) => {
        if (remoteVideo.srcObject !== event.streams[0]) {
            remoteVideo.srcObject = event.streams[0];
            remoteVideo.style.display = 'block'; 
            remoteStatusMessage.innerText = "Uzaktan bağlantı başarılı!";
            console.log('Uzaktan gelen akış (Kamera) bağlandı.');
        }
    };
    
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('candidate', event.candidate);
        }
    };
    
    peerConnection.onnegotiationneeded = () => {
        if (isInitiator) {
            peerConnection.createOffer()
                .then(offer => peerConnection.setLocalDescription(offer))
                .then(() => {
                    socket.emit('offer', peerConnection.localDescription);
                })
                .catch(e => console.error("Negotiation Offer hatası:", e));
        }
    };
}


// --- Sunucu Sinyalleri ---

// Odaya katılma sinyalleri
socket.on('waitingForPartner', () => {
    roomStatus.innerText = "Partner bekleniyor... Sayfayı kapatmayın.";
    getCameraStream(); // İlk giren cihaz kamerayı açar
});

socket.on('roomFull', () => {
    alert("Bu oda zaten dolu. Lütfen başka bir oda adı deneyin.");
    joinButton.disabled = false;
    roomNameInput.disabled = false;
    roomStatus.innerText = "Bağlantı kesildi.";
});

// İletişimi Başlatma
socket.on('startCommunication', async (data) => {
    roomSetup.classList.add('hidden'); // Formu gizle
    videoContainer.classList.remove('hidden'); // Video alanını göster
    
    // Oda adı başarılı, artık iletişime hazırız.
    roomStatus.innerText = `Odaya başarıyla katıldınız: ${data.roomName}`;
    
    // Cihaz 1 (Gönderici)
    if (data.isInitiator) {
        const cameraReady = await getCameraStream(); 
        if (cameraReady) {
            createPeerConnection(true); 
            statusMessage.innerText = "Partner bağlandı. İletişim başlatıldı.";
        }
    } else {
        // Cihaz 2 (İzleyici)
        getCameraStream(); // Sadece lokal kamerayı açar
        createPeerConnection(false); 
        statusMessage.innerText = "Partner bağlandı. İletişim başlatıldı.";
    }
});

// Partner ayrıldığında
socket.on('partnerDisconnected', () => {
    remoteStatusMessage.innerText = "Partneriniz bağlantıyı kesti!";
    remoteVideo.srcObject = null;
    remoteVideo.style.display = 'none';
    if(peerConnection) peerConnection.close();
    peerConnection = null;
});

// WebRTC Sinyalleme olayları
socket.on('offer', async (offer) => {
    if (!peerConnection) { createPeerConnection(false); }
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('answer', answer);
});

socket.on('answer', async (answer) => {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
});

socket.on('candidate', async (candidate) => {
    if (peerConnection) {
        try {
            await peerConnection.addIceCandidate(candidate);
        } catch (e) {
            console.error('ICE adayı eklenirken hata:', e);
        }
    }
});

// Kamera açma/kapama sinyali
socket.on('cameraToggle', (data) => {
    if (data.state === 'kapali') {
        remoteStatusMessage.innerText = "Kullanıcı kamerasını kapattı.";
        remoteVideo.style.display = 'none'; 
    } else if (data.state === 'acik') {
        remoteStatusMessage.innerText = "Görüntü bekleniyor...";
        remoteVideo.style.display = 'block'; 
    }
});

// Kamera çevirme sinyali
socket.on('cameraSwitch', () => {
     remoteStatusMessage.innerText = "Partner kamera değiştirdi. Görüntü bekleniyor...";
});
