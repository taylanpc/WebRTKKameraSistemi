// server.js (Uzaktan Erişim ve Oda Mantığı İçin Nihai Versiyon)

const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

// ÖNEMLİ: Render gibi platformlar PORT'u otomatik verir, bu yüzden process.env.PORT kullanıyoruz.
const PORT = process.env.PORT || 3000;
const ROOM_NAME = 'kamera_odasi_123'; // Sabit Oda Adı

// Statik dosyaları (public klasörünü) sun
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

io.on('connection', (socket) => {
    console.log(`Yeni bir kullanıcı bağlandı: ${socket.id}`);
    
    // Her kullanıcıyı odaya dahil et
    socket.join(ROOM_NAME);
    
    const room = io.sockets.adapter.rooms.get(ROOM_NAME);
    const numClients = room ? room.size : 0;
    
    console.log(`Oda (${ROOM_NAME}) üye sayısı: ${numClients}`);

    // YENİ MANTIK: İlk giren cihaz (Kamera) hemen kamerayı açsın
    if (numClients === 1) {
        console.log("Odadaki ilk cihaz. Kamerayı açması için sinyal gönderiliyor.");
        // isOnlyCamera: true, sadece kamerayı aç, WebRTC Offer oluşturma.
        socket.emit('startCommunication', { isInitiator: true, isOnlyCamera: true }); 
    }

    // İKİNCİ MANTIK: İki cihaz olduğunda WebRTC iletişimini başlat
    if (numClients === 2) {
        const clients = Array.from(room);
        const senderId = clients[0]; 
        const receiverId = clients[1];

        console.log(`İki cihaz hazır: WebRTC İletişimi Başlatılıyor.`);
        
        // İlk cihaza (Kamera), Offer oluşturmasını söyle
        io.to(senderId).emit('startCommunication', { isInitiator: true, isOnlyCamera: false });
        
        // İkinci cihaza (İzleyici), Answer oluşturmasını söyle
        io.to(receiverId).emit('startCommunication', { isInitiator: false, isOnlyCamera: false });
    }
    
    // WebRTC sinyalleşme mesajlarını oda içinde yayınla
    socket.on('offer', (offer) => { socket.to(ROOM_NAME).emit('offer', offer); });
    socket.on('answer', (answer) => { socket.to(ROOM_NAME).emit('answer', answer); });
    socket.on('candidate', (candidate) => { socket.to(ROOM_NAME).emit('candidate', candidate); });

    // Kamera Kapatma/Açma Sinyali
    socket.on('cameraToggle', (state) => {
        // Oda içindeki herkese kapatma/açma durumunu bildir
        socket.to(ROOM_NAME).emit('cameraToggle', state); 
    });


    socket.on('disconnect', () => {
        console.log(`Kullanıcı ayrıldı: ${socket.id}`);
    });
});

http.listen(PORT, () => {
  console.log(`Sunucu http://localhost:${PORT} adresinde çalışıyor`);
});