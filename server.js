// server.js (ODA KUR/KATIL MANTIKLI NİHAİ DÜZELTME)
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// Odayı kuran cihazın ID'sini tutmak için harita (roomName -> creatorSocketId)
const activeRooms = new Map();

app.use(express.static('public'));

io.on('connection', (socket) => {
    let currentRoom = null;
    console.log('Yeni bir kullanıcı bağlandı:', socket.id);

    // Yeni: Kullanıcıdan oda adını ve rolünü (kurucu/katılımcı) alarak odaya katılmasını sağla
    socket.on('join', ({ roomName, role }) => {
        if (!roomName) return socket.emit('joinError', "Oda Adı boş bırakılamaz.");

        // Önceki odadan ayrıl
        if (currentRoom) socket.leave(currentRoom);

        const room = io.sockets.adapter.rooms.get(roomName);
        const userCount = room ? room.size : 0;
        
        // --- ODA KURUCU MANTIĞI ---
        if (role === 'creator') {
            if (activeRooms.has(roomName)) {
                return socket.emit('joinError', `"${roomName}" odası zaten kurulmuş.`);
            }
            if (userCount >= 1) { // Normalde 0 olmalı ama emin olmak için
                 return socket.emit('joinError', `"${roomName}" odasında zaten bir kullanıcı var. Katıl'ı deneyin.`);
            }

            // Odayı kur ve kaydet
            socket.join(roomName);
            currentRoom = roomName;
            activeRooms.set(roomName, socket.id);
            console.log(`[${socket.id}] "${roomName}" odasını KURDU.`);
            socket.emit('waitingForPartner'); // İzleyici beklemesini bildir

        } 
        
        // --- ODA KATILIMCI MANTIĞI ---
        else if (role === 'joiner') {
            if (!activeRooms.has(roomName)) {
                return socket.emit('joinError', `"${roomName}" odası kurulmamış. Önce Kur'u deneyin.`);
            }
            if (userCount >= 2) {
                return socket.emit('joinError', `"${roomName}" odası dolu.`);
            }

            // Odaya katıl ve iletişimi başlat
            socket.join(roomName);
            currentRoom = roomName;
            console.log(`[${socket.id}] "${roomName}" odasına KATILDI.`);

            // Kurucuya partnerin geldiğini bildir
            const creatorId = activeRooms.get(roomName);
            io.to(creatorId).emit('partnerJoined');

            // İletişimi başlat
            // Katılımcı Offer beklemesi için isInitiator: false
            socket.emit('roomReady', { roomName: currentRoom, isCreator: false });
            // Kurucu Offer başlatması için isInitiator: true
            io.to(creatorId).emit('roomReady', { roomName: currentRoom, isCreator: true });
        }
    });

    // WebRTC Sinyalleme: Gelen sinyali odadaki diğer kişiye ilet
    const forwardSignal = (type) => (data) => {
        if (currentRoom) {
            socket.to(currentRoom).emit(type, data);
        }
    };
    
    // WebRTC Sinyalleme olayları
    socket.on('offer', forwardSignal('offer'));
    socket.on('answer', forwardSignal('answer'));
    socket.on('candidate', forwardSignal('candidate'));
    socket.on('cameraToggle', forwardSignal('cameraToggle'));
    socket.on('cameraSwitch', forwardSignal('cameraSwitch'));

    // Kullanıcı bağlantısı kesildiğinde
    socket.on('disconnect', () => {
        if (currentRoom) {
            // Eğer ayrılan kişi kurucu ise, odayı temizle
            if (activeRooms.get(currentRoom) === socket.id) {
                activeRooms.delete(currentRoom);
                console.log(`[${socket.id}] KURUCU AYRILDI. "${currentRoom}" odası kapandı.`);
            }

            // Odadaki diğer kişiye ortağının ayrıldığını bildir
            socket.to(currentRoom).emit('partnerDisconnected');
        }
        console.log('Kullanıcı ayrıldı:', socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`Sunucu http://localhost:${PORT} adresinde çalışıyor`);
});
