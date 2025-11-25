// public/client.js (ODA KUR/KATIL MANTIKLI NİHAİ DÜZELTME)

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
const createButton = document.getElementById('createButton'); // Yeni
const roomNameInput = document.getElementById('roomName');
const roomStatus = document.getElementById('roomStatus');

let peerConnection; 
let localStream;    
let isCameraOn = false; 
let sender; 
let isInitiator = false;
let currentDeviceId = 'default';

// WebRTC Ayarları (STUN sunucusu)
const configuration = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] 
};

// --- Oda Giriş Mantığı ---
function disableRoomButtons(disabled) {
    createButton.disabled = disabled;
    joinButton.disabled = disabled;
    roomNameInput.disabled = disabled;
}

// Yeni: Odayı Kur butonu
createButton.addEventListener('click', () => {
    const roomName = roomNameInput.value.trim();
    if (roomName) {
        disableRoomButtons(true);
        roomStatus.innerText = `"${roomName}" odası kuruluyor...`;
        // Sunucuya "kurucu" olarak katılmak istediğini bildir.
        socket.emit('join', { roomName: roomName, role: 'creator' });
    } else {
        alert("Lütfen bir Oda Adı girin.");
    }
});

// Yeni: Odaya Katıl butonu
joinButton.addEventListener('click', () => {
    const roomName = roomNameInput.value.trim();
    if (roomName) {
        disableRoomButtons(true);
        roomStatus.innerText = `"${roomName}" odasına bağlanılıyor...`;
        // Sunucuya "katılımcı" olarak katılmak istediğini bildir.
        socket.emit('join', { roomName: roomName, role: 'joiner' });
    } else {
        alert("Lütfen bir Oda Adı girin.");
    }
});

// --- Kamera Akışı Yönetimi (Aynı Kalır) ---
async function getCameraStream(deviceId) {
    try {
        if (localStream) stopCameraStream(false); 
        
        const constraints = {
            video: { deviceId: deviceId ? { exact: deviceId } : currentDeviceId },
            audio: false 
        };

        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        localVideo.srcObject = localStream;
        isCameraOn = true;
        
        if (!deviceId) {
            currentDeviceId = localStream.getVideoTracks()[0].getSettings().deviceId;
        } else {
             currentDeviceId = deviceId;
        }

        toggleButton.innerText = "Kamerayı Kapat";
        toggleButton.style.backgroundColor = "#f44336";
        statusMessage.innerText = isInitiator ? "Partner bekleniyor..." : "Bağlantı kuruluyor...";
        switchCameraButton.classList.remove('hidden');

        if (peerConnection && localStream) {
            const videoTrack = localStream.getVideoTracks()[0];
            
            if (sender) {
                sender.replaceTrack(videoTrack).catch(e => console.error("Track değiştirme hatası:", e));
            } else {
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


// --- WebRTC Bağlantı Yönetimi (Aynı Kalır) ---
function createPeerConnection(initiator) {
    isInitiator = initiator; 
    peerConnection = new RTCPeerConnection(configuration);
    
    if (localStream) {
        localStream.getTracks().forEach(track => {
            sender = peerConnection.addTrack(track, localStream); 
        });
    }

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


// --- Sunucu Sinyalleri (Çok Kritik Değişiklikler Burada) ---

// Hatalı oda girişlerini işle
socket.on('joinError', (message) => {
    disableRoomButtons(false); // Butonları tekrar aktif et
    roomStatus.style.color = 'red';
    roomStatus.innerText = message;
    if(localStream) stopCameraStream(false); // Kamerayı kapat
});

// Kurucu bekliyor
socket.on('waitingForPartner', () => {
    roomStatus.innerText = "Partner bekleniyor... Sayfayı kapatmayın.";
    getCameraStream(); // Kurucu kamerayı açar, izleyiciyi bekler
    // Kurucu kamerayı açar ama videoContainer'ı göstermez, sadece lokal akış alır.
});

// Oda Kurucuya "İzleyici Katıldı" sinyali
socket.on('partnerJoined', () => {
    roomStatus.innerText = "Partner Odaya Katıldı. Bağlantı kuruluyor...";
    roomSetup.classList.add('hidden'); 
    videoContainer.classList.remove('hidden'); 
    statusMessage.innerText = "Partner bağlandı. İletişim başlatıldı.";
    // WebRTC connection will start via Offer/Answer now
});

// Katılımcıya "Oda Kuruldu" sinyali
socket.on('roomReady', (data) => {
    roomSetup.classList.add('hidden'); 
    videoContainer.classList.remove('hidden'); 
    
    // Kurucuya isInitiator = true, Katılımcıya isInitiator = false
    const initiator = data.isCreator ? true : false;
    
    getCameraStream(); // Kamerayı aç

    // WebRTC başlat
    createPeerConnection(initiator); 

    statusMessage.innerText = "Bağlantı kuruldu. Görüntü bekleniyor...";
});


// Partner ayrıldığında
socket.on('partnerDisconnected', () => {
    remoteStatusMessage.innerText = "Partneriniz bağlantıyı kesti! Odayı tekrar kurmanız/katılmanız gerekebilir.";
    remoteVideo.srcObject = null;
    remoteVideo.style.display = 'none';
    if(peerConnection) peerConnection.close();
    peerConnection = null;
    
    // Odayı sıfırla
    disableRoomButtons(false);
    roomSetup.classList.remove('hidden');
    videoContainer.classList.add('hidden');
    roomStatus.style.color = 'blue';
    roomStatus.innerText = "Lütfen yeni bir Oda Adı girin.";
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
