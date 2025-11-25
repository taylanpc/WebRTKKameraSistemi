// server.js (ReferenceError düzeltilmiş versiyon)
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server); // io objesi tüm sunucuyu temsil eder

const PORT = process.env.PORT || 3000;

// Odayı kuran cihazın ID'sini tutmak için harita (roomName -> creatorSocketId)
const activeRooms = new Map();

app.use(express.static('public'));

// Oda Temizleme Fonksiyonu (Düzeltildi: Artık 'socket' yerine 'io' kullanılıyor)
// Bu fonksiyon, global io objesini kullanarak odadaki herkese ulaşabilir.
function cleanupRoom(roomName, socketId) {
    if (!roomName) return;

    // Ayrılan kişi kurucu ise, odayı aktif odalar listesinden temizle
    if (activeRooms.get(roomName) === socketId) {
        activeRooms.delete(roomName);
        console.log(`[${socketId}] KURUCU AYRILDI. "${roomName}" odası temizlendi.`);
    }

    // Odadaki diğer kişiye ayrıldığını bildir
    // io.to(roomName) odadaki TÜM cihazlara (ayrılan hariç) sinyal gönderir.
    io.to(roomName).emit('partnerDisconnected');
    console.log(`"${roomName}" odasındaki partnerlere bağlantı kesildi sinyali gönderildi.`);
}


io.on('connection', (socket) => {
    let currentRoom = null;
    console.log('Yeni bir kullanıcı bağlandı:', socket.id);

    // Yeni: Odaya Katılma sinyali
    socket.on('join', ({ roomName, role }) => {
        if (!roomName) return socket.emit('joinError', "Oda Adı boş bırakılamaz.");

        if (currentRoom) socket.leave(currentRoom);

        const room = io.sockets.adapter.rooms.get(roomName);
        const userCount = room ? room.size : 0;
        
        // --- ODA KURUCU MANTIĞI ---
        if (role === 'creator') {
            if (activeRooms.has(roomName)) {
                return socket.emit('joinError', `"${roomName}" odası zaten kurulmuş. Katıl'ı deneyin.`);
            }
            if (userCount >= 1) { 
                 return socket.emit('joinError', `"${roomName}" odasında zaten bir kullanıcı var. Katıl'ı deneyin.`);
            }

            socket.join(roomName);
            currentRoom = roomName;
            activeRooms.set(roomName, socket.id);
            console.log(`[${socket.id}] "${roomName}" odasını KURDU.`);
            socket.emit('waitingForPartner');

        } 
        
        // --- ODA KATILIMCI MANTIĞI ---
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
            io.to(creatorId).emit('partnerJoined');

            socket.emit('roomReady', { roomName: currentRoom, isCreator: false });
            io.to(creatorId).emit('roomReady', { roomName: currentRoom, isCreator: true });
        }
    });
    
    // Yeni: Odadan Çık sinyali (Manuel)
    socket.on('leaveRoom', () => {
        if (currentRoom) {
            socket.leave(currentRoom);
            // Manuel çıkışta partnerDisconnected sinyalini odadaki diğer kişiye gönder
            socket.to(currentRoom).emit('partnerDisconnected'); 

            // Oda Temizliğini yap
            if (activeRooms.get(currentRoom) === socket.id) {
                activeRooms.delete(currentRoom);
                console.log(`[${socket.id}] KURUCU Manuel ayrıldı. "${currentRoom}" odası temizlendi.`);
            }
            
            currentRoom = null;
            console.log(`[${socket.id}] Manuel olarak odadan ayrıldı.`);
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

    // Kullanıcı bağlantısı kesildiğinde (Tarayıcı kapatma/Yenileme)
    socket.on('disconnect', () => {
        if (currentRoom) {
            // Bağlantı kesildiğinde manuel çıkıştaki gibi cleanupRoom fonksiyonunu çağır
            // cleanupRoom(currentRoom, socket.id); // <-- Bu fonksiyonu kaldırıp içeriğini buraya alalım, çünkü socket.to artık çalışmayacak
            
            // Eğer ayrılan kişi kurucu ise, odayı aktif odalar listesinden temizle
            if (activeRooms.get(currentRoom) === socket.id) {
                activeRooms.delete(currentRoom);
                console.log(`[${socket.id}] KURUCU BAĞLANTISI KESİLDİ. "${currentRoom}" odası temizlendi.`);
            }
            
            // Odadaki diğer kişiye ayrıldığını bildir
            socket.to(currentRoom).emit('partnerDisconnected');

            console.log(`[${socket.id}] Bağlantı kesildi. Partner bildirildi.`);
        }
        console.log('Kullanıcı ayrıldı:', socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`Sunucu http://localhost:${PORT} adresinde çalışıyor`);
});
