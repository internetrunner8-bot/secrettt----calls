let socket;
let localStream;
let peers = {};
let currentRoom = null;
let currentUsername = null;
let isVideoEnabled = true;
let isAudioEnabled = true;

// ICE servers configuration (using free STUN servers)
const iceServers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ]
};

// Join Room Function
async function joinRoom() {
    const roomId = document.getElementById('roomId').value.trim();
    const password = document.getElementById('roomPassword').value.trim();
    const username = document.getElementById('username').value.trim();

    if (!roomId || !password || !username) {
        alert('Please fill in all fields');
        return;
    }

    currentRoom = roomId;
    currentUsername = username;

    try {
        // Get user media
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });

        document.getElementById('localVideo').srcObject = localStream;

        // Initialize Socket.io
        socket = io();

        // Socket event listeners
        socket.on('room-joined', handleRoomJoined);
        socket.on('user-connected', handleUserConnected);
        socket.on('user-disconnected', handleUserDisconnected);
        socket.on('offer', handleOffer);
        socket.on('answer', handleAnswer);
        socket.on('ice-candidate', handleIceCandidate);
        socket.on('chat-message', handleChatMessage);
        socket.on('room-error', handleRoomError);

        // Join room
        socket.emit('join-room', { roomId, password, username });

    } catch (error) {
        alert('Could not access camera/microphone: ' + error.message);
    }
}

function handleRoomJoined(data) {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('videoScreen').classList.remove('hidden');
    document.getElementById('roomIdDisplay').textContent = `Room: ${currentRoom}`;
    updateParticipantCount(data.userCount);
    
    addSystemMessage(`Welcome to the room! ${data.userCount} participant(s) online`);
}

function handleRoomError(data) {
    alert(data.message);
}

async function handleUserConnected(data) {
    console.log('User connected:', data.userId);
    addSystemMessage(`${data.username} joined the room`);
    
    // Create peer connection
    const peer = createPeerConnection(data.userId);
    peers[data.userId] = { connection: peer, username: data.username };

    // Create and send offer
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    socket.emit('offer', { offer, to: data.userId, roomId: currentRoom });

    // Add remote video element
    addRemoteVideo(data.userId, data.username);
}

function handleUserDisconnected(data) {
    console.log('User disconnected:', data.userId);
    addSystemMessage(`${data.username} left the room`);
    
    if (peers[data.userId]) {
        peers[data.userId].connection.close();
        delete peers[data.userId];
    }
    
    removeRemoteVideo(data.userId);
    updateParticipantCount(data.userCount);
}

async function handleOffer(data) {
    console.log('Received offer from:', data.from);
    
    const peer = createPeerConnection(data.from);
    peers[data.from] = { connection: peer, username: data.username };
    
    await peer.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    
    socket.emit('answer', { answer, to: data.from, roomId: currentRoom });
    
    addRemoteVideo(data.from, data.username);
}

async function handleAnswer(data) {
    console.log('Received answer from:', data.from);
    const peer = peers[data.from].connection;
    await peer.setRemoteDescription(new RTCSessionDescription(data.answer));
}

async function handleIceCandidate(data) {
    console.log('Received ICE candidate from:', data.from);
    const peer = peers[data.from]?.connection;
    if (peer) {
        await peer.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
}

function createPeerConnection(userId) {
    const peer = new RTCPeerConnection(iceServers);

    // Add local stream tracks
    localStream.getTracks().forEach(track => {
        peer.addTrack(track, localStream);
    });

    // Handle incoming stream
    peer.ontrack = (event) => {
        console.log('Received remote track from:', userId);
        const remoteVideo = document.getElementById(`video-${userId}`);
        if (remoteVideo && event.streams[0]) {
            remoteVideo.srcObject = event.streams[0];
        }
    };

    // Handle ICE candidates
    peer.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', {
                candidate: event.candidate,
                to: userId,
                roomId: currentRoom
            });
        }
    };

    return peer;
}

function addRemoteVideo(userId, username) {
    const videoGrid = document.getElementById('videoGrid');
    
    const wrapper = document.createElement('div');
    wrapper.className = 'video-wrapper';
    wrapper.id = `wrapper-${userId}`;
    
    const video = document.createElement('video');
    video.id = `video-${userId}`;
    video.autoplay = true;
    video.playsInline = true;
    
    const label = document.createElement('div');
    label.className = 'video-label';
    label.textContent = username;
    
    wrapper.appendChild(video);
    wrapper.appendChild(label);
    videoGrid.appendChild(wrapper);
}

function removeRemoteVideo(userId) {
    const wrapper = document.getElementById(`wrapper-${userId}`);
    if (wrapper) {
        wrapper.remove();
    }
}

function toggleVideo() {
    isVideoEnabled = !isVideoEnabled;
    localStream.getVideoTracks()[0].enabled = isVideoEnabled;
    
    const btn = document.getElementById('videoBtn');
    const icon = document.getElementById('videoIcon');
    
    if (isVideoEnabled) {
        btn.classList.remove('off');
        icon.textContent = '📹';
    } else {
        btn.classList.add('off');
        icon.textContent = '📹';
    }
}

function toggleAudio() {
    isAudioEnabled = !isAudioEnabled;
    localStream.getAudioTracks()[0].enabled = isAudioEnabled;
    
    const btn = document.getElementById('audioBtn');
    const icon = document.getElementById('audioIcon');
    
    if (isAudioEnabled) {
        btn.classList.remove('off');
        icon.textContent = '🎤';
    } else {
        btn.classList.add('off');
        icon.textContent = '🔇';
    }
}

function sendMessage() {
    const input = document.getElementById('messageInput');
    const message = input.value.trim();
    
    if (message && socket) {
        socket.emit('chat-message', {
            roomId: currentRoom,
            message: message,
            username: currentUsername
        });
        input.value = '';
    }
}

function handleKeyPress(event) {
    if (event.key === 'Enter') {
        sendMessage();
    }
}

function handleChatMessage(data) {
    const messagesDiv = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';
    
    if (data.username === currentUsername) {
        messageDiv.classList.add('own');
    }
    
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    messageDiv.innerHTML = `
        <div class="message-sender">${data.username}</div>
        <div class="message-text">${escapeHtml(data.message)}</div>
        <div class="message-time">${time}</div>
    `;
    
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function addSystemMessage(message) {
    const messagesDiv = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message system';
    messageDiv.textContent = message;
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function updateParticipantCount(count) {
    document.getElementById('participantCount').textContent = `👥 ${count} participant(s)`;
}

function leaveRoom() {
    if (socket) {
        socket.disconnect();
    }
    
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    
    Object.values(peers).forEach(peer => {
        peer.connection.close();
    });
    
    peers = {};
    
    document.getElementById('videoScreen').classList.add('hidden');
    document.getElementById('loginScreen').classList.remove('hidden');
    
    // Clear video grid except local video
    const videoGrid = document.getElementById('videoGrid');
    const remoteVideos = videoGrid.querySelectorAll('.video-wrapper:not(.local)');
    remoteVideos.forEach(video => video.remove());
    
    // Clear chat
    document.getElementById('chatMessages').innerHTML = '';
    
    // Reset form
    document.getElementById('roomId').value = '';
    document.getElementById('roomPassword').value = '';
    document.getElementById('username').value = '';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}