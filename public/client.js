// public/client.js (SELF-VIEW AÇIK, SES/MİKROFON KONTROLÜ EKLENMİŞ SON VERSİYON)

const socket = io();
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const toggleButton = document.getElementById('toggleButton');
const muteButton = document.getElementById('muteButton'); // Yeni
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
let isMuted = false; // Mikrofon durumu
let sender; 
let isInitiator = false;
let currentDeviceId = 'default';

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
        // Basit katılım sinyali gönderiliyor
        socket.emit('join', roomName);
    } else {
        alert("Lütfen bir Oda Adı girin.");
    }
});


// --- Kamera ve Ses Akışı Yönetimi ---

async function getCameraStream(deviceId) {
    try {
        if (localStream) stopCameraStream(false); 
        
        // SES İLETİMİ İÇİN audio: true YAPILDI (KRİTİK)
        const constraints = {
            video: { deviceId: deviceId ? { exact: deviceId } : currentDeviceId },
            audio: true // SESİ AÇTIK
        };

        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        localVideo.srcObject = localStream;
        isCameraOn = true;
        
        // Ses varsayılan olarak açıktır (isMuted = false)
        localStream.getAudioTracks().forEach(track => track.enabled = true); 
        muteButton.innerText = "Sesi Kapat";
        isMuted = false;

        // Cihaz ID'sini kaydet
        if (!deviceId) {
            currentDeviceId = localStream.getVideoTracks()[0].getSettings().deviceId;
        } else {
             currentDeviceId = deviceId;
        }

        // Arayüzü güncelle
        toggleButton.innerText = "Kamerayı Kapat";
        toggleButton.style.backgroundColor = "#f44336";
        statusMessage.innerText = "Bağlantı kuruluyor...";
        switchCameraButton.classList.remove('hidden');

        // Eğer WebRTC bağlantısı zaten varsa, yeni akışı gönder.
        if (peerConnection && localStream) {
            // Tüm track'leri (ses ve video) tek tek değiştir veya ekle
            localStream.getTracks().forEach(track => {
                const existingSender = peerConnection.getSenders().find(s => s.track && s.track.kind === track.kind);
                
                if (existingSender) {
                    existingSender.replaceTrack(track).catch(e => console.error(`Track değiştirme hatası (${track.kind}):`, e));
                } else {
                    peerConnection.addTrack(track, localStream);
                }
            });
        }
        
        return true; 
    } catch (error) {
        console.error("Kamera/Mikrofon erişimi başarısız:", error);
        alert("Kamera ve Mikrofon izni verin."); 
        statusMessage.innerText = "Kamera/Mikrofon erişimi engellendi.";
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

// --- Mikrofon Kontrolü Mantığı (YENİ) ---
muteButton.addEventListener('click', () => {
    if (!localStream) return;

    const audioTracks = localStream.getAudioTracks();
    if (audioTracks.length === 0) return;

    isMuted = !isMuted;
    
    audioTracks.forEach(track => {
        track.enabled = !isMuted; // Sesi açar/kapatır
    });

    muteButton.innerText = isMuted ? "Sesi Aç" : "Sesi Kapat";
    muteButton.style.backgroundColor = isMuted ? "#4CAF50" : "#FF9800";
});


// --- Kamera Çevirme Mantığı (Aynı Kalır) ---
switchCameraButton.addEventListener('click', async () => {
    if (!isCameraOn) return;

    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(device => device.kind === 'videoinput');

    if (videoDevices.length > 1) {
        let currentIndex = videoDevices.findIndex(device => device.deviceId === currentDeviceId);
        let nextIndex = (currentIndex + 1) % videoDevices.length;
        let nextDeviceId = videoDevices[nextIndex].deviceId;

        const ready = await getCameraStream(nextDeviceId);
        
        if (ready) {
             socket.emit('cameraSwitch'); 
        }
    } else {
        alert("Birden fazla kamera bulunamadı.");
    }
});


// --- Düğme Olayı Yöneticisi (Aynı Kalır) ---
if (toggleButton) {
    toggleButton.addEventListener('click', () => {
        if (localStream && isCameraOn) {
            stopCameraStream(true);
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
    
    // SENDER'I KUR: Tüm track'leri (ses ve video) ekle
    if (localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream); 
        });
    }

    // Akış geldiğinde (UZAK GÖRÜNTÜ VE SES ALINDIĞINDA)
    peerConnection.ontrack = (event) => {
        if (remoteVideo.srcObject !== event.streams[0]) {
            remoteVideo.srcObject = event.streams[0];
            remoteVideo.style.display = 'block'; 
            remoteStatusMessage.innerText = "Uzaktan bağlantı başarılı!";
            console.log('Uzaktan gelen akış (Kamera ve Ses) bağlandı.');
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


// --- Sunucu Sinyalleri (Basit Oda Sistemi Sinyalleri) ---

socket.on('waitingForPartner', () => {
    roomStatus.innerText = "Partner bekleniyor... Sayfayı kapatmayın.";
    getCameraStream(); // İlk giren cihaz kamerayı ve mikrofonu açar
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
        getCameraStream(); // Lokal kamera ve mikrofonu açar
        createPeerConnection(false); 
        statusMessage.innerText = "Partner bağlandı. İletişim başlatıldı.";
    }
});

// Partner ayrıldığında (Aynı Kalır)
socket.on('partnerDisconnected', () => {
    remoteStatusMessage.innerText = "Partneriniz bağlantıyı kesti!";
    remoteVideo.srcObject = null;
    remoteVideo.style.display = 'none';
    if(peerConnection) peerConnection.close();
    peerConnection = null;
    
    // Oda girişini tekrar aç
    joinButton.disabled = false;
    roomNameInput.disabled = false;
    roomSetup.classList.remove('hidden');
    videoContainer.classList.add('hidden');
    statusMessage.innerText = "Bağlantı bekleniyor...";
    roomStatus.innerText = "Partner ayrıldı. Yeniden bağlanmak için Oda Adı girin.";
});

// WebRTC ve diğer sinyaller aynı kalır...
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

socket.on('cameraToggle', (data) => {
    if (data.state === 'kapali') {
        remoteStatusMessage.innerText = "Kullanıcı kamerasını kapattı.";
        remoteVideo.style.display = 'none'; 
    } else if (data.state === 'acik') {
        remoteStatusMessage.innerText = "Görüntü bekleniyor...";
        remoteVideo.style.display = 'block'; 
    }
});

socket.on('cameraSwitch', () => {
     remoteStatusMessage.innerText = "Partner kamera değiştirdi. Görüntü bekleniyor...";
});
