// server.js (EN STABİL VE GÜNCEL ODA YÖNETİMİ MANTIĞI)
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
    let currentRole = null;
    console.log('Yeni bir kullanıcı bağlandı:', socket.id);

    // --- Odaya Katılma sinyali (Kur/Katıl) ---
    socket.on('join', ({ roomName, role }) => {
        if (!roomName) return socket.emit('joinError', "Oda Adı boş bırakılamaz.");

        if (currentRoom) socket.leave(currentRoom);

        const room = io.sockets.adapter.rooms.get(roomName);
        const userCount = room ? room.size : 0;
        
        currentRole = role;

        // --- ODA KURUCU MANTIĞI ---
        if (role === 'creator') {
            if (activeRooms.has(roomName)) {
                return socket.emit('joinError', `"${roomName}" odası zaten kurulmuş. Katıl'ı deneyin.`);
            }
            if (userCount >= 2) { 
                 return socket.emit('joinError', `"${roomName}" odası dolu. Katıl'ı deneyin.`);
            }

            socket.join(roomName);
            currentRoom = roomName;
            activeRooms.set(roomName, socket.id);
            console.log(`[${socket.id}] "${roomName}" odasını KURDU.`);
            socket.emit('waitingForPartner');

        } 
        
        // --- ODA KATILIMCI MANTIĞI (Joiner) ---
        else if (role === 'joiner') {
            if (!activeRooms.has(roomName)) {
                return socket.emit('joinError', `"${roomName}" odası kurulmamış. Önce Kur'u deneyin.`);
            }
            if (userCount >= 2) {
                return socket.emit('joinError', `"${roomName}" odası dolu.`);
            }

            socket.join(roomName);
            currentRoom = roomName;
            console.log(`[${socket.id}] "${roomName}" odasına KATILDI.`);

            const creatorId = activeRooms.get(roomName);
            
            if (io.sockets.sockets.has(creatorId)) {
                io.to(creatorId).emit('partnerJoined'); 
                socket.emit('roomReady', { roomName: currentRoom, isCreator: false });
                io.to(creatorId).emit('roomReady', { roomName: currentRoom, isCreator: true });
            } else {
                socket.emit('joinError', `"${roomName}" odası kurulmuş ancak kurucu şu an aktif değil.`);
                socket.leave(currentRoom);
                currentRoom = null;
            }
        }
    });
    
    // --- Odadan Çık sinyali (Manuel) ---
    socket.on('leaveRoom', () => {
        if (currentRoom) {
            const isCreator = activeRooms.get(currentRoom) === socket.id;
            const roomToLeave = currentRoom;
            
            socket.leave(roomToLeave);
            
            if (isCreator) {
                activeRooms.delete(roomToLeave);
                socket.to(roomToLeave).emit('partnerDisconnected'); 
                console.log(`[${socket.id}] KURUCU Manuel ayrıldı. "${roomToLeave}" odası TEMİZLENDİ.`);
            } else {
                socket.to(roomToLeave).emit('partnerLeft', { socketId: socket.id });
                console.log(`[${socket.id}] Katılımcı Manuel ayrıldı. "${roomToLeave}" odası AKTİF KALDI.`);
            }

            currentRoom = null;
            currentRole = null;
        }
    });


    // --- WebRTC Sinyalleme ---
    const forwardSignal = (type) => (data) => {
        if (currentRoom) {
            socket.to(currentRoom).emit(type, data);
        }
    };
    
    socket.on('offer', forwardSignal('offer'));
    socket.on('answer', forwardSignal('answer'));
    socket.on('candidate', forwardSignal('candidate'));
    socket.on('cameraToggle', forwardSignal('cameraToggle'));
    socket.on('cameraSwitch', forwardSignal('cameraSwitch'));

    // --- Bağlantı Kesilmesi (Tarayıcı Kapatma) ---
    socket.on('disconnect', () => {
        if (currentRoom) {
            const isCreator = activeRooms.get(currentRoom) === socket.id;
            const roomToLeave = currentRoom;
            
            if (isCreator) {
                activeRooms.delete(roomToLeave);
                socket.to(roomToLeave).emit('partnerDisconnected'); 
                console.log(`[${socket.id}] KURUCU KOPTU. "${roomToLeave}" odası TEMİZLENDİ.`);
            } else {
                socket.to(roomToLeave).emit('partnerLeft', { socketId: socket.id });
                console.log(`[${socket.id}] Katılımcı KOPTU. "${roomToLeave}" odası AKTİF KALDI.`);
            }
        }
        console.log('Kullanıcı ayrıldı:', socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`Sunucu http://localhost:${PORT} adresinde çalışıyor`);
});
