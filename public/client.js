// public/client.js (KAMERA/MİKROFON İZNİ TEKRARLAMA SORUNU DÜZELTİLMİŞ VERSİYON)

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
    if (localStream) stopCameraStream(false);
    if (peerConnection) peerConnection.close();
    peerConnection = null;
    remoteVideo.srcObject = null;

    socket.emit('leaveRoom');

    resetInterface();
    statusMessage.innerText = "Odadan başarıyla çıktınız.";
});


// --- Kamera ve Ses Akışı Yönetimi ---
async function getCameraStream(deviceId) {
    try {
        // Yeni: Eğer akış zaten varsa ve kamera kapalıysa durdurma (Bu, izin döngüsünü engeller)
        if (localStream) {
             // Eğer akış varsa ama kamera kapalıysa, akışı sıfırla.
             if (!isCameraOn) stopCameraStream(false);
             // Akış açıksa ve sadece cihaz değiştirmiyorsak, tekrar isteme.
        }
        
        // Yeni: Eğer zaten localStream varsa ve sadece cihaz değiştirmiyorsak (deviceId yoksa), tekrar isteme.
        if (localStream && !deviceId) {
            localVideo.srcObject = localStream;
            return true;
        }
        
        const constraints = {
            video: { deviceId: deviceId ? { exact: deviceId } : currentDeviceId },
            audio: true 
        };
        
        // Eğer localStream zaten varsa, eski akışı durdur
        if (localStream) localStream.getTracks().forEach(track => track.stop());
        
        // KRİTİK İZİN İSTEME ADIMI
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        localVideo.srcObject = localStream;
        isCameraOn = true;
        
        // Diğer kontrol ve arayüz güncellemeleri aynı kalır...
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

        // Eğer WebRTC bağlantısı varsa, yeni akışı gönder.
        if (peerConnection && localStream) {
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
        localStream = null; // Akışı tamamen temizle
    }
    isCameraOn = false;
    toggleButton.innerText = "Kamerayı Aç";
    toggleButton.style.backgroundColor = "#4CAF50";
    statusMessage.innerText = "Kamera kapalı.";
    switchCameraButton.classList.add('hidden');
    
    if (sendSignal) { socket.emit('cameraToggle', { state: 'kapali' }); }
}

// ... Diğer mikrofon, çevirme ve Düğme Olayı Yöneticisi aynı kalır ...

// --- WebRTC Bağlantı Yönetimi ---

function createPeerConnection(initiator) {
    isInitiator = initiator; 
    
    // YENİ: Eğer zaten bir peerConnection varsa kapat ve sıfırla
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    peerConnection = new RTCPeerConnection(configuration);
    
    // Akış gönderiliyor
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


// --- Sunucu Sinyalleri ---
// ... Diğer sinyaller aynı kalır ...

socket.on('roomReady', (data) => {
    roomSetup.classList.add('hidden'); 
    videoContainer.classList.remove('hidden'); 
    
    const initiator = data.isCreator ? true : false;
    
    // YENİ: Başarılı join işleminde önce kamerayı al, sonra bağlantıyı kur
    getCameraStream().then(ready => {
        if (ready) {
            createPeerConnection(initiator); 
            statusMessage.innerText = "Bağlantı kuruldu. Görüntü bekleniyor...";
        }
    });
});

socket.on('partnerDisconnected', () => {
    remoteStatusMessage.innerText = "Partneriniz bağlantıyı kesti! Oda temizlendi. Yeniden kurun/katılın.";
    remoteVideo.srcObject = null;
    remoteVideo.style.display = 'none';
    if(peerConnection) peerConnection.close();
    peerConnection = null;
    
    resetInterface();
    statusMessage.innerText = "Partner ayrıldı. Oda temizlendi.";
});

socket.on('partnerLeft', () => {
    remoteStatusMessage.innerText = "Partneriniz bağlantıyı kesti! Odayı tekrar kurmasını/katılmasını bekleyin.";
    remoteVideo.srcObject = null;
    remoteVideo.style.display = 'none';
    
    // YENİ: Eski peerConnection'ı kapat ve sıfırla
    if(peerConnection) peerConnection.close();
    peerConnection = null;
    
    statusMessage.innerText = "Partner ayrıldı, yeniden bağlanmayı bekliyor...";
});


// WebRTC ve Kamera Sinyalleri
socket.on('offer', async (offer) => {
    // YENİ: Offer geldiğinde eski bağlantıyı temizle ve yeni bağlantıyı kur
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    createPeerConnection(false); // Yeni bir katılımcı gelmiş olabilir, false ile oluştur.
    
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('answer', answer);
});

// ... Diğer WebRTC sinyalleri aynı kalır ...
