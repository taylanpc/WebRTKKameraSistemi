// public/client.js (YATAY/DİKEY VE ÇIK-GİR SORUNU İÇİN SON DÜZELTME)

const socket = io();
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

// Kapsayıcı Elementler (index.html'deki localVideoWrapper ve remoteVideoWrapper)
const localVideoWrapper = document.getElementById('localVideoWrapper');
const remoteVideoWrapper = document.getElementById('remoteVideoWrapper');

// Başlangıçta DOM'dan referansları al
let localVideo = document.getElementById('localVideo'); 
let remoteVideo = document.getElementById('remoteVideo'); 

let peerConnection; 
let localStream;    
let isCameraOn = false; 
let isMuted = false; 
let isInitiator = false;
let currentDeviceId = 'default';

// WebRTC Ayarları (GÜÇLÜ ICE SUNUCULARI)
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        { 
            urls: 'turn:openrelay.metered.ca:80', 
            username: 'openrelayproject', 
            credential: 'openrelayproject' 
        }
    ] 
};


// --- Kökten Video Elementi Yenileme (ÖN BELLEK ÇÖZÜMÜ) ---
function recreateVideoElements() {
    // 1. Eski elementleri kaldırma
    if (localVideo) localVideo.remove();
    if (remoteVideo) remoteVideo.remove();

    // 2. Yeni Video Elementlerini Oluşturma
    localVideo = document.createElement('video');
    localVideo.id = 'localVideo';
    localVideo.autoplay = true;
    localVideo.muted = true; // Kendi sesimizi duymamak için sessize al
    
    remoteVideo = document.createElement('video');
    remoteVideo.id = 'remoteVideo';
    remoteVideo.autoplay = true;
    remoteVideo.controls = false; 
    
    // 3. Kapsayıcılara Ekleme
    localVideoWrapper.appendChild(localVideo);
    remoteVideoWrapper.insertBefore(remoteVideo, remoteStatusMessage); 

    console.log("Video elementleri DOM'da yeniden oluşturuldu.");
}


// --- Arayüz ve Bağlantı Güçlü Sıfırlama ---
function resetInterface() {
    disableRoomButtons(false);
    roomSetup.classList.remove('hidden');
    videoContainer.classList.add('hidden');
    roomStatus.style.color = 'blue';
    roomStatus.innerText = "Lütfen bir Oda Adı girin.";

    // 1. KRİTİK TEMİZLİK: Akışı tamamen durdur ve serbest bırak
    if (localStream) stopCameraStream(false);
    
    // 2. PeerConnection'ı Kapat
    if (peerConnection) peerConnection.close();
    peerConnection = null;
    
    // 3. KRİTİK: Video elementlerini DOM'dan kaldırıp yeniden oluştur
    recreateVideoElements();

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
        // Eğer akış açıksa ve cihaz değiştirmeyeceksek, videoyu sadece yerel olarak göster.
        if (localStream && isCameraOn && !deviceId) {
            localVideo.srcObject = null; // Eski referansı temizle
            localVideo.srcObject = localStream; // Yeniden zorla bağla
            return true;
        }
        
        // Önceki akışı kapat
        if (localStream) localStream.getTracks().forEach(track => track.stop());
        
        const constraints = {
            video: { deviceId: deviceId ? { exact: deviceId } : currentDeviceId },
            audio: true 
        };
        
        // KRİTİK: Yeni akışı al
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // VİDEO YENİDEN BAĞLAMA ZORLAMASI
        localVideo.srcObject = null; 
        localVideo.srcObject = localStream;
        // ----------------------------------------
        
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

        // KRİTİK DÜZELTME: Akım kesilmesini engellemek için, eski sender'ları kaldırıp akışı baştan ekle
        if (peerConnection && localStream) {
             // Tüm göndericileri temizle
            peerConnection.getSenders().forEach(sender => {
                if (sender.track) {
                    peerConnection.removeTrack(sender);
                }
            });

            // Akışları baştan ekle (garantili yeniden ekleme)
            localStream.getTracks().forEach(track => { 
                peerConnection.addTrack(track, localStream); 
                console.log(`[STREAM EKLEME] Yeni ${track.kind} track'i eklendi.`);
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
        // KRİTİK KISIM: Her bir track'i durdurmaya zorla
        localStream.getTracks().forEach(track => {
            track.stop();
        });
        localVideo.srcObject = null;
        localStream = null; // Akış nesnesini temizle
    }
    isCameraOn = false;
    toggleButton.innerText = "Kamerayı Aç";
    toggleButton.style.backgroundColor = "#4CAF50";
    statusMessage.innerText = "Kamera kapalı.";
    switchCameraButton.classList.add('hidden');
    
    if (sendSignal) { socket.emit('cameraToggle', { state: 'kapali' }); }
}


// --- Mikrofon Kontrolü, Kamera Çevirme ve Düğme Olayları ---

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
    
    // Her yeni PeerConnection kurulumunda eskisini kapat
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    peerConnection = new RTCPeerConnection(configuration);
    
    // KRİTİK: PeerConnection kurulur kurulmaz, localStream'deki track'leri ekle
    if (localStream) {
        localStream.getTracks().forEach(track => { peerConnection.addTrack(track, localStream); });
        console.log("[PEER OLUŞTURMA] Mevcut akışlar PeerConnection'a eklendi.");
    }

    // KRİTİK DÜZELTME: Akışı video etiketine bağlarken play() ile oynatmayı zorla
    peerConnection.ontrack = (event) => {
        const [remoteStream] = event.streams;
        
        if (remoteVideo.srcObject !== remoteStream) {
            
            // 1. Akışı bağla (SRC'yi ayarla)
            remoteVideo.srcObject = null; // Eski referansı temizle
            remoteVideo.srcObject = remoteStream;
            
            // 2. Akışın yüklenmesini bekle ve sonra oynatmayı zorla
            remoteVideo.onloadedmetadata = () => {
                 remoteVideo.play()
                    .then(() => {
                        remoteVideo.style.display = 'block'; 
                        remoteStatusMessage.innerText = "Uzaktan bağlantı başarılı!";
                        console.log('Uzaktan gelen akış (Kamera ve Ses) bağlandı ve oynatılıyor.');
                    })
                    .catch(e => {
                        console.error("Video oynatma (autoplay) engellendi:", e);
                        remoteStatusMessage.innerText = "Bağlantı başarılı, ancak oynatma engellendi. Video alanına tıklayın.";
                    });
            };
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
    
    resetInterface();
    statusMessage.innerText = "Partner ayrıldı. Oda temizlendi.";
});

// Partner Ayrıldığında VEYA Koptuğunda (ODA AKTİF KALDI) 
socket.on('partnerLeft', () => {
    remoteStatusMessage.innerText = "Partneriniz bağlantıyı kesti! Yeni bir bağlantı bekleniyor...";
    
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
