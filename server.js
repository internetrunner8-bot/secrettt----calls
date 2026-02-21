const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files
app.use(express.static(__dirname));

// Store rooms and their passwords
const rooms = new Map();

io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    socket.on('join-room', ({ roomId, password, username }) => {
        console.log(`${username} attempting to join room: ${roomId}`);

        // Check if room exists
        if (rooms.has(roomId)) {
            const room = rooms.get(roomId);
            
            // Verify password
            if (room.password !== password) {
                socket.emit('room-error', { message: 'Incorrect password' });
                return;
            }
            
            // Add user to room
            socket.join(roomId);
            room.users.set(socket.id, { username, socketId: socket.id });
            
            // Notify user they joined
            socket.emit('room-joined', { userCount: room.users.size });
            
            // Notify existing users about new user
            socket.to(roomId).emit('user-connected', {
                userId: socket.id,
                username: username
            });
            
            // Send existing users to new user
            room.users.forEach((user, userId) => {
                if (userId !== socket.id) {
                    socket.emit('user-connected', {
                        userId: userId,
                        username: user.username
                    });
                }
            });
            
        } else {
            // Create new room
            const newRoom = {
                password: password,
                users: new Map([[socket.id, { username, socketId: socket.id }]]),
                createdAt: Date.now()
            };
            
            rooms.set(roomId, newRoom);
            socket.join(roomId);
            
            socket.emit('room-joined', { userCount: 1 });
        }
        
        // Store room info in socket
        socket.roomId = roomId;
        socket.username = username;
    });

    // WebRTC signaling
    socket.on('offer', ({ offer, to, roomId }) => {
        socket.to(to).emit('offer', {
            offer: offer,
            from: socket.id,
            username: socket.username
        });
    });

    socket.on('answer', ({ answer, to, roomId }) => {
        socket.to(to).emit('answer', {
            answer: answer,
            from: socket.id
        });
    });

    socket.on('ice-candidate', ({ candidate, to, roomId }) => {
        socket.to(to).emit('ice-candidate', {
            candidate: candidate,
            from: socket.id
        });
    });

    // Chat messages
    socket.on('chat-message', ({ roomId, message, username }) => {
        io.to(roomId).emit('chat-message', {
            message: message,
            username: username,
            timestamp: Date.now()
        });
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        
        if (socket.roomId && rooms.has(socket.roomId)) {
            const room = rooms.get(socket.roomId);
            room.users.delete(socket.id);
            
            // Notify others in room
            socket.to(socket.roomId).emit('user-disconnected', {
                userId: socket.id,
                username: socket.username,
                userCount: room.users.size
            });
            
            // Delete room if empty
            if (room.users.size === 0) {
                rooms.delete(socket.roomId);
                console.log(`Room ${socket.roomId} deleted (empty)`);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

server.listen(PORT, HOST, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser`);
});