// public/client.js (ODADA KALMA MANTIĞI İLE GÜNCELLENMİŞ VERSİYON)

const socket = io();
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const toggleButton = document.getElementById('toggleButton');
const muteButton = document.getElementById('muteButton');
const switchCameraButton = document.getElementById('switchCameraButton');
const leaveButton = document.getElementById('leaveButton');
const statusMessage = document.getElementById('statusMessage');
const remoteStatusMessage = document.getElementById('remoteStatusMessage');
const roomSetup = document.getElementById('roomSetup');
const videoContainer = document.getElementById('videoContainer');
const joinButton = document.getElementById('joinButton');
const createButton = document.getElementById('createButton');
const roomNameInput = document.getElementById('roomName');
const roomStatus = document.getElementById('roomStatus');

let peerConnection; 
let localStream;    
let isCameraOn = false; 
let isMuted = false;
let isInitiator = false;
let currentDeviceId = 'default';

// WebRTC Ayarları
const configuration = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] 
};

// --- Arayüz Sıfırlama ---
function resetInterface() {
    disableRoomButtons(false);
    roomSetup.classList.remove('hidden');
    videoContainer.classList.add('hidden');
    roomStatus.style.color = 'blue';
    roomStatus.innerText = "Lütfen bir Oda Adı girin.";
}

// --- Oda Giriş ve Çıkış Yönetimi ---
function disableRoomButtons(disabled) {
    createButton.disabled = disabled;
    joinButton.disabled = disabled;
    roomNameInput.disabled = disabled;
}

createButton.addEventListener('click', () => {
    const roomName = roomNameInput.value.trim();
    if (roomName) {
        disableRoomButtons(true);
        roomStatus.innerText = `"${roomName}" odası kuruluyor...`;
        socket.emit('join', { roomName: roomName, role: 'creator' });
    } else {
        alert("Lütfen bir Oda Adı girin.");
    }
});

joinButton.addEventListener('click', () => {
    const roomName = roomNameInput.value.trim();
    if (roomName) {
        disableRoomButtons(true);
        roomStatus.innerText = `"${roomName}" odasına bağlanılıyor...`;
        socket.emit('join', { roomName: roomName, role: 'joiner' });
    } else {
        alert("Lütfen bir Oda Adı girin.");
    }
});

// Odadan Çık butonu
leaveButton.addEventListener('click', () => {
    // Tüm akışları kapat (sadece lokal akış kapatılır, WebRTC bağlantısı sonlandırılır)
    if (localStream) stopCameraStream(false);
    if (peerConnection) peerConnection.close();
    peerConnection = null;
    remoteVideo.srcObject = null;

    // Sunucuya odadan ayrılma sinyali gönder
    socket.emit('leaveRoom');

    // Arayüzü başlangıç durumuna döndür
    resetInterface();
    statusMessage.innerText = "Odadan başarıyla çıktınız.";
});


// --- Kamera, Ses ve WebRTC Mantığı (Aynı Kalır) ---
async function getCameraStream(deviceId) {
    try {
        if (localStream) stopCameraStream(false); 
        const constraints = {
            video: { deviceId: deviceId ? { exact: deviceId } : currentDeviceId },
            audio: true 
        };
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        localVideo.srcObject = localStream;
        isCameraOn = true;
        
        localStream.getAudioTracks().forEach(track => track.enabled = true); 
        muteButton.innerText = "Sesi Kapat";
        isMuted = false;

        if (!deviceId) {
            currentDeviceId = localStream.getVideoTracks()[0].getSettings().deviceId;
        } else {
             currentDeviceId = deviceId;
        }

        toggleButton.innerText = "Kamerayı Kapat";
        toggleButton.style.backgroundColor = "#f44336";
        statusMessage.innerText = "Bağlantı kuruluyor...";
        switchCameraButton.classList.remove('hidden');

        if (peerConnection && localStream) {
            localStream.getTracks().forEach(track => {
                const existingSender = peerConnection.getSenders().find(s => s.track && s.isCreator.kind === track.kind);
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
    if (sendSignal) { socket.emit('cameraToggle', { state: 'kapali' }); }
}

muteButton.addEventListener('click', () => {
    if (!localStream) return;
    const audioTracks = localStream.getAudioTracks();
    if (audioTracks.length === 0) return;
    isMuted = !isMuted;
    audioTracks.forEach(track => { track.enabled = !isMuted; });
    muteButton.innerText = isMuted ? "Sesi Aç" : "Sesi Kapat";
    muteButton.style.backgroundColor = isMuted ? "#4CAF50" : "#FF9800";
});

// Diğer kamera, çevirme ve WebRTC mantıkları aynı kalır.

function createPeerConnection(initiator) {
    isInitiator = initiator; 
    peerConnection = new RTCPeerConnection(configuration);
    
    if (localStream) {
        localStream.getTracks().forEach(track => { peerConnection.addTrack(track, localStream); });
    }

    peerConnection.ontrack = (event) => {
        if (remoteVideo.srcObject !== event.streams[0]) {
            remoteVideo.srcObject = event.streams[0];
            remoteVideo.style.display = 'block'; 
            remoteStatusMessage.innerText = "Uzaktan bağlantı başarılı!";
            console.log('Uzaktan gelen akış (Kamera ve Ses) bağlandı.');
        }
    };
    
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) { socket.emit('candidate', event.candidate); }
    };
    
    peerConnection.onnegotiationneeded = () => {
        if (isInitiator) {
            peerConnection.createOffer()
                .then(offer => peerConnection.setLocalDescription(offer))
                .then(() => { socket.emit('offer', peerConnection.localDescription); })
                .catch(e => console.error("Negotiation Offer hatası:", e));
        }
    };
}


// --- Sunucu Sinyalleri (ÖNEMLİ DEĞİŞİKLİKLER BURADA) ---

socket.on('joinError', (message) => {
    disableRoomButtons(false);
    roomStatus.style.color = 'red';
    roomStatus.innerText = message;
    if(localStream) stopCameraStream(false);
});

socket.on('waitingForPartner', () => {
    roomStatus.innerText = "Partner bekleniyor... Sayfayı kapatmayın.";
    getCameraStream();
});

socket.on('partnerJoined', () => {
    roomStatus.innerText = "Partner Odaya Katıldı. Bağlantı kuruluyor...";
    roomSetup.classList.add('hidden'); 
    videoContainer.classList.remove('hidden'); 
    statusMessage.innerText = "Partner bağlandı. İletişim başlatıldı.";
});

socket.on('roomReady', (data) => {
    roomSetup.classList.add('hidden'); 
    videoContainer.classList.remove('hidden'); 
    
    const initiator = data.isCreator ? true : false;
    getCameraStream(); 

    createPeerConnection(initiator); 
    statusMessage.innerText = "Bağlantı kuruldu. Görüntü bekleniyor...";
});

// Partner ayrıldığında VEYA Kurucu Odadan Çıktığında (ODA TEMİZLENDİ)
socket.on('partnerDisconnected', () => {
    remoteStatusMessage.innerText = "Partneriniz bağlantıyı kesti! Oda temizlendi. Yeniden kurun/katılın.";
    remoteVideo.srcObject = null;
    remoteVideo.style.display = 'none';
    if(peerConnection) peerConnection.close();
    peerConnection = null;
    
    // Kurucu ayrıldığı için arayüzü sıfırla
    resetInterface();
    statusMessage.innerText = "Partner ayrıldı. Oda temizlendi.";
});

// Partner ayrıldığında VEYA Koptuğunda (ODA AKTİF KALDI) - YENİ SİNYAL
socket.on('partnerLeft', () => {
    remoteStatusMessage.innerText = "Partneriniz bağlantıyı kesti! Odayı tekrar kurmasını/katılmasını bekleyin.";
    remoteVideo.srcObject = null;
    remoteVideo.style.display = 'none';
    
    // WebRTC bağlantısını kapat, ancak yerel akışı ve oda arayüzünü AÇIK TUT.
    if(peerConnection) peerConnection.close();
    peerConnection = null;
    
    // Yeni bir peer connection oluşturmaya hazır ol (Rejoining için)
    statusMessage.innerText = "Partner ayrıldı, yeniden bağlanmayı bekliyor...";
    
    // Not: Kurucuysan ve katılımcı koptuysa, isInitiator = true kalır.
    // Tekrar join sinyali göndermeden, yeni bir bağlantı için hazırız.
});


// WebRTC ve Kamera Sinyalleri (Aynı Kalır)
socket.on('offer', async (offer) => {
    if (!peerConnection) { 
        createPeerConnection(false); // Yeni bir katılımcı gelmiş olabilir, false ile oluştur.
    }
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
