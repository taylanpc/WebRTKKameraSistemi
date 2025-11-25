// public/client.js (NİHAİ DÜZELTME VE TÜM ÖZELLİKLER)

const socket = io();
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const toggleButton = document.getElementById('toggleButton');
const statusMessage = document.getElementById('statusMessage');
const remoteStatusMessage = document.getElementById('remoteStatusMessage');

let peerConnection; 
let localStream;    
let isCameraOn = false; 
let sender; // WebRTC'de akış göndericisini tutmak için
let isInitiator = false; // Bu cihazın Offer oluşturup oluşturmadığını tutar

// WebRTC Ayarları (STUN sunucusu)
const configuration = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] 
};

// --- Kamera Akışı Yönetimi ---

async function getCameraStream() {
    try {
        if (localStream) stopCameraStream(false); 
        
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        localVideo.srcObject = localStream;
        isCameraOn = true;
        
        // Arayüzü güncelle
        toggleButton.innerText = "Kamerayı Kapat";
        toggleButton.style.backgroundColor = "#f44336";
        statusMessage.innerText = "Kamera açık. Bağlantı kuruluyor...";

        // Eğer WebRTC bağlantısı zaten varsa, yeni akışı gönder.
        if (peerConnection && localStream) {
            const videoTrack = localStream.getVideoTracks()[0];
            
            if (sender) {
                // Sender zaten varsa, track'i değiştir (Bu, Offer/Answer sürecini yeniden başlatır)
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
    
    // Eğer sinyal gönderme gerekiyorsa (düğmeye basıldıysa)
    if (sendSignal) {
        // İzleyiciye kamera kapandı sinyali gönder
        socket.emit('cameraToggle', { state: 'kapali' }); 
    }
}


// --- Düğme ve Sinyal Olayları ---

// Düğme Olayı Yöneticisi
if (toggleButton) {
    toggleButton.addEventListener('click', () => {
        if (localStream && isCameraOn) {
            stopCameraStream(true); // Sinyal gönder
        } else if (!isCameraOn) {
            getCameraStream().then(ready => {
                if (ready) {
                    socket.emit('cameraToggle', { state: 'acik' });
                }
            });
        }
    });
}

// İzleyici cihazdan gelen açma/kapama sinyalini dinle (Düzeltildi)
socket.on('cameraToggle', (data) => {
    if (data.state === 'kapali') {
        remoteStatusMessage.innerText = "Kullanıcı kamerasını kapattı.";
        remoteVideo.style.display = 'none'; 
    } else if (data.state === 'acik') {
        remoteStatusMessage.innerText = "";
        remoteVideo.style.display = 'block'; 
        // Not: replaceTrack zaten negotiation'ı tetiklediği için, bu sinyal sadece mesajı temizlemeye yarar.
    }
});


// --- WebRTC Bağlantı Yönetimi ---

function createPeerConnection(initiator) {
    isInitiator = initiator; // Initiator durumunu kaydet
    peerConnection = new RTCPeerConnection(configuration);
    
    // SENDER'I KUR
    if (localStream) {
        localStream.getTracks().forEach(track => {
            // Eğer isInitiator ise, akışı ekler ve sender'ı kaydeder
            if (initiator) {
                sender = peerConnection.addTrack(track, localStream); 
            }
        });
    }

    // Akış geldiğinde
    peerConnection.ontrack = (event) => {
        if (remoteVideo.srcObject !== event.streams[0]) {
            remoteVideo.srcObject = event.streams[0];
            remoteVideo.style.display = 'block'; 
            remoteStatusMessage.innerText = "";
            console.log('Uzaktan gelen akış (Kamera) bağlandı.');
        }
    };
    
    // ICE Adayı sinyali
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('candidate', event.candidate);
        }
    };
    
    // İletişim yeniden başlatılmalı sinyali
    peerConnection.onnegotiationneeded = () => {
        if (isInitiator) {
            peerConnection.createOffer()
                .then(offer => peerConnection.setLocalDescription(offer))
                .then(() => {
                    socket.emit('offer', peerConnection.localDescription);
                });
        }
    };


    if (initiator) {
        // Eğer initiator ise, ilk Offer'ı oluştur (onnegotiationneeded event'i yakalayacaktır)
        // Eğer localStream yoksa, ilk Offer'ı oluşturmak gerekmez (Çünkü sadece kamera akışını başlatmıştır)
    }
}


// --- Sunucu Sinyalleri ---

socket.on('startCommunication', async (data) => {
    
    if (data.isInitiator) {
        // Cihaz 1: Kamera Akışını Başlatan (Gönderici)
        const cameraReady = await getCameraStream(); 
        
        if (data.isOnlyCamera) {
            // Sadece kamerayı aç, WebRTC'ye başlama.
            return; 
        }

        // İkinci cihaz girdi: WebRTC başlat
        if (cameraReady && !data.isOnlyCamera) {
            createPeerConnection(true); // Bağlantıyı kur, Offer oluşturma onnegotiationneeded'da olacak
        } 
        
    } else {
        // Cihaz 2: İzleyici
        createPeerConnection(false); 
    }
});

// Offer/Answer sinyal alışverişi aynı kalır
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