// public/client.js (GÜÇLÜ SIFIRLAMA MANTIĞI İLE GÜNCELLENMİŞ VERSİYON)

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

// --- Arayüz ve Bağlantı Güçlü Sıfırlama ---
function resetInterface() {
    disableRoomButtons(false);
    roomSetup.classList.remove('hidden');
    videoContainer.classList.add('hidden');
    roomStatus.style.color = 'blue';
    roomStatus.innerText = "Lütfen bir Oda Adı girin.";

    // KRİTİK TEMİZLİK: Akışları ve video elementlerini sıfırla
    if (localStream) stopCameraStream(false);
    if (peerConnection) peerConnection.close();
    peerConnection = null;
    remoteVideo.srcObject = null;
    localVideo.srcObject = null; // Local video elementini de temizle
    remoteVideo.style.display = 'block'; // Varsayılana döndür

    // Geri kalan durum değişkenlerini sıfırla
    isCameraOn = false;
    isMuted = false;
    isInitiator = false;
    currentDeviceId = 'default';
    
    // Buton ve mesajları sıfırla
    muteButton.innerText = "Sesi Kapat";
    muteButton.style.backgroundColor = "#FF9800";
    toggleButton.innerText = "Kamerayı Aç";
    toggleButton.style.backgroundColor = "#4CAF50";
    switchCameraButton.classList.add('hidden');
    remoteStatusMessage.innerText = "";
    statusMessage.innerText = "Bağlantı bekleniyor...";
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
    socket.emit('leaveRoom');
    resetInterface();
    statusMessage.innerText = "Odadan başarıyla çıktınız.";
});


// --- Kamera ve Ses Akışı Yönetimi ---
async function getCameraStream(deviceId) {
    try {
        if (localStream && isCameraOn && !deviceId) {
            localVideo.srcObject = localStream;
            return true;
        }
        
        if (localStream) localStream.getTracks().forEach(track => track.stop());
        
        const constraints = {
            video: { deviceId: deviceId ? { exact: deviceId } : currentDeviceId },
            audio: true 
        };
        
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        localVideo.srcObject = localStream;
        isCameraOn = true;
        
        localStream.getAudioTracks().forEach(track => track.enabled = !isMuted); 

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
        localStream = null; 
    }
    isCameraOn = false;
    toggleButton.innerText = "Kamerayı Aç";
    toggleButton.style.backgroundColor = "#4CAF50";
    statusMessage.innerText = "Kamera kapalı.";
    switchCameraButton.classList.add('hidden');
    
    if (sendSignal) { socket.emit('cameraToggle', { state: 'kapali' }); }
}


// --- Mikrofon Kontrolü Mantığı ---
muteButton.addEventListener('click', () => {
    if (!localStream) return;
    const audioTracks = localStream.getAudioTracks();
    if (audioTracks.length === 0) return; 

    isMuted = !isMuted;
    audioTracks.forEach(track => { 
        track.enabled = !isMuted;
    });

    muteButton.innerText = isMuted ? "Sesi Aç" : "Sesi Kapat";
    muteButton.style.backgroundColor = isMuted ? "#4CAF50" : "#FF9800";
});


// --- Kamera Çevirme Mantığı ---
switchCameraButton.addEventListener('click', async () => {
    if (!isCameraOn) return;
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(device => device.kind === 'videoinput');

    if (videoDevices.length > 1) {
        let currentIndex = videoDevices.findIndex(device => device.deviceId === currentDeviceId);
        let nextIndex = (currentIndex + 1) % videoDevices.length;
        let nextDeviceId = videoDevices[nextIndex].deviceId;
        const ready = await getCameraStream(nextDeviceId);
        
        if (ready) { socket.emit('cameraSwitch'); }
    } else {
        alert("Birden fazla kamera bulunamadı.");
    }
});

// --- Düğme Olayı Yöneticisi ---
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
    
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
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


// --- Sunucu Sinyalleri ---

socket.on('joinError', (message) => {
    disableRoomButtons(false);
    roomStatus.style.color = 'red';
    roomStatus.innerText = message;
    // Hata durumunda da güçlü temizlik yap
    if(localStream) stopCameraStream(false);
    if(peerConnection) peerConnection.close();
    peerConnection = null;
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
    
    getCameraStream().then(ready => {
        if (ready) {
            createPeerConnection(initiator); 
            statusMessage.innerText = "Bağlantı kuruldu. Görüntü bekleniyor...";
        }
    });
});

// Partner Ayrıldığında VEYA Kurucu Odadan Çıktığında (ODA TEMİZLENDİ)
socket.on('partnerDisconnected', () => {
    remoteStatusMessage.innerText = "Partneriniz bağlantıyı kesti! Oda temizlendi. Yeniden kurun/katılın.";
    
    // GÜÇLÜ SIFIRLAMA
    resetInterface();
    statusMessage.innerText = "Partner ayrıldı. Oda temizlendi.";
});

// Partner Ayrıldığında VEYA Koptuğunda (ODA AKTİF KALDI) 
socket.on('partnerLeft', () => {
    remoteStatusMessage.innerText = "Partneriniz bağlantıyı kesti! Odayı tekrar kurmasını/katılmasını bekleyin.";
    remoteVideo.srcObject = null;
    remoteVideo.style.display = 'none';
    
    if(peerConnection) peerConnection.close();
    peerConnection = null;
    
    statusMessage.innerText = "Partner ayrıldı, yeniden bağlanmayı bekliyor...";
});


// WebRTC Sinyalleri
socket.on('offer', async (offer) => {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    createPeerConnection(false); 
    
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
    if (data.state === 'kapali') { remoteStatusMessage.innerText = "Kullanıcı kamerasını kapattı."; remoteVideo.style.display = 'none'; } 
    else if (data.state === 'acik') { remoteStatusMessage.innerText = "Görüntü bekleniyor..."; remoteVideo.style.display = 'block'; }
});

socket.on('cameraSwitch', () => {
     remoteStatusMessage.innerText = "Partner kamera değiştirdi. Görüntü bekleniyor...";
});
