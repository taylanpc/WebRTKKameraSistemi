// server.js (ODA SİSTEMİ İÇİN GÜNCELLENMİŞ VERSİYON)
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// Statik dosyaları public klasöründen sun
app.use(express.static('public'));

io.on('connection', (socket) => {
    let currentRoom = null;
    console.log('Yeni bir kullanıcı bağlandı:', socket.id);

    // Yeni: Kullanıcıdan oda adını alarak odaya katılmasını sağla
    socket.on('join', (roomName) => {
        if (!roomName) {
            console.log(`[${socket.id}] Geçersiz oda adı denemesi.`);
            return;
        }
        
        // Önceki odadan ayrıl (eğer varsa)
        if (currentRoom) {
            socket.leave(currentRoom);
        }

        currentRoom = roomName;
        socket.join(currentRoom);
        
        const room = io.sockets.adapter.rooms.get(currentRoom);
        const userCount = room ? room.size : 0;
        
        console.log(`[${socket.id}] '${currentRoom}' odasına katıldı. Üye sayısı: ${userCount}`);

        // Odanın üye sayısı 2 olduğunda iletişimi başlat
        if (userCount === 2) {
            console.log(`[${currentRoom}] İki cihaz hazır: WebRTC İletişimi Başlatılıyor.`);
            
            // Odadaki soketleri al
            const socketsInRoom = Array.from(room);
            const initiatorSocketId = socketsInRoom[0];
            const receiverSocketId = socketsInRoom[1];

            // 1. Cihaza (Initiator) Offer başlatmasını söyle
            io.to(initiatorSocketId).emit('startCommunication', { isInitiator: true, roomName: currentRoom });
            
            // 2. Cihaza (Receiver) Answer beklemesini söyle
            io.to(receiverSocketId).emit('startCommunication', { isInitiator: false, roomName: currentRoom });
        } else if (userCount > 2) {
            // İkiden fazla kullanıcı varsa, üçüncü kullanıcıya doluluk sinyali gönder
            socket.emit('roomFull');
            socket.leave(currentRoom);
            currentRoom = null;
            console.log(`[${socket.id}] '${currentRoom}' odası dolu. Ayrıldı.`);
        } else {
            // İlk kullanıcı ise beklediğini bildir
            socket.emit('waitingForPartner');
        }
    });

    // WebRTC Sinyalleme: Gelen sinyali odadaki diğer kişiye ilet
    const forwardSignal = (type) => (data) => {
        if (currentRoom) {
            // Gönderici haricindeki diğer kişiye gönder
            socket.to(currentRoom).emit(type, data);
        }
    };
    
    // WebRTC Sinyalleme olayları
    socket.on('offer', forwardSignal('offer'));
    socket.on('answer', forwardSignal('answer'));
    socket.on('candidate', forwardSignal('candidate'));

    // Kamera açma/kapama sinyali (Sadece diğer cihaza ilet)
    socket.on('cameraToggle', forwardSignal('cameraToggle'));
    
    // Yeni: Kamera çevirme sinyali
    socket.on('cameraSwitch', forwardSignal('cameraSwitch'));

    // Kullanıcı bağlantısı kesildiğinde
    socket.on('disconnect', () => {
        if (currentRoom) {
            const room = io.sockets.adapter.rooms.get(currentRoom);
            const userCount = room ? room.size : 0;
            
            console.log(`[${socket.id}] '${currentRoom}' odasından ayrıldı. Kalan üye: ${userCount - 1}`);
            
            // Odadaki diğer kişiye ortağının ayrıldığını bildir
            socket.to(currentRoom).emit('partnerDisconnected');
            
            // Eğer odada kimse kalmadıysa, odayı temizle
            if (userCount === 1) {
                // Bu adım gerekli değildir, socket.io otomatik yapar, log için tutulabilir.
            }
        }
        console.log('Kullanıcı ayrıldı:', socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`Sunucu http://localhost:${PORT} adresinde çalışıyor`);
});
