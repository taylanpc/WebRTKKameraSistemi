// public/client.js (SES, MİKROFON KONTROLÜ VE KENDİNİ GÖRMEME DÜZELTMESİ)

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
const createButton = document.getElementById('createButton');
const roomNameInput = document.getElementById('roomName');
const roomStatus = document.getElementById('roomStatus');

let peerConnection; 
let localStream;    
let isCameraOn = false; 
let isMuted = false; // Yeni
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
        
        // KENDİNİ GÖRMEME: localVideo'yu gizledik ama akış hala peerConnection'a gidiyor.
        // muted=true'yu tutuyoruz.

        // Ses varsayılan olarak açıktır (isMuted = false)
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

        // Eğer WebRTC bağlantısı zaten varsa, yeni akışı gönder.
        if (peerConnection && localStream) {
            // Video ve Ses akışlarını tek tek gönderiyoruz
            localStream.getTracks().forEach(track => {
                // Eğer bu track için sender yoksa ekle, varsa replace et
                const existingSender = peerConnection.getSenders().find(s => s.track && s.track.kind === track.kind);
                
                if (existingSender) {
                    existingSender.replaceTrack(track).catch(e => console.error("Track değiştirme hatası:", e));
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
    
    // Partner'a mute durumunu bildirebiliriz, ama şimdilik sadece lokal kontrol yeterli.
});


// --- Kamera Çevirme Mantığı, Düğme Olayı Yöneticisi ve WebRTC Bağlantı Yönetimi aynı kalır (Sender hariç) ---

// Sadece createPeerConnection'da ufak bir düzeltme:
function createPeerConnection(initiator) {
    isInitiator = initiator; 
    peerConnection = new RTCPeerConnection(configuration);
    
    // SENDER'I KUR: Tüm track'leri ekle (Hem video hem ses)
    if (localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream); 
        });
    }

    // ... diğer ontrack, onicecandidate, onnegotiationneeded kısımları aynı kalır.
    
    peerConnection.ontrack = (event) => {
        // ... (Uzaktan gelen akış alındığında)
        if (remoteVideo.srcObject !== event.streams[0]) {
            remoteVideo.srcObject = event.streams[0];
            remoteVideo.style.display = 'block'; 
            remoteStatusMessage.innerText = "Uzaktan bağlantı başarılı!";
            console.log('Uzaktan gelen akış (Kamera ve Ses) bağlandı.');
        }
    };
}

// ... Diğer tüm socket.on fonksiyonları, kamera çevirme ve toggleButton event'leri aynı kalır.
