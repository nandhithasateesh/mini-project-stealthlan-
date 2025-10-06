import { io } from 'socket.io-client';

const SOCKET_URL = 'http://localhost:5000';

let socket = null;
let messageQueue = [];
let isConnected = false;

export const initializeSocket = (userId, username, mode) => {
  if (socket) {
    socket.disconnect();
  }

  socket = io(SOCKET_URL, {
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
    transports: ['websocket', 'polling']
  });

  socket.on('connect', () => {
    console.log('✅ Socket connected:', socket.id);
    isConnected = true;
    socket.emit('user:join', { userId, username, mode });
    
    // Send queued messages
    if (messageQueue.length > 0) {
      console.log(`📤 Sending ${messageQueue.length} queued messages`);
      messageQueue.forEach(({ event, data, callback }) => {
        socket.emit(event, data, callback);
      });
      messageQueue = [];
    }
  });

  socket.on('disconnect', (reason) => {
    console.log('❌ Socket disconnected:', reason);
    isConnected = false;
  });

  socket.on('connect_error', (error) => {
    console.error('🔴 Connection error:', error.message);
    isConnected = false;
  });

  socket.on('reconnect', (attemptNumber) => {
    console.log(`🔄 Reconnected after ${attemptNumber} attempts`);
    isConnected = true;
  });

  socket.on('reconnect_attempt', (attemptNumber) => {
    console.log(`🔄 Reconnection attempt ${attemptNumber}...`);
  });

  socket.on('reconnect_failed', () => {
    console.error('❌ Reconnection failed after all attempts');
    isConnected = false;
  });

  return socket;
};

export const getSocket = () => {
  if (!socket) {
    throw new Error('Socket not initialized. Call initializeSocket first.');
  }
  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
    isConnected = false;
    messageQueue = [];
  }
};

export const emitWithQueue = (event, data, callback) => {
  if (socket && isConnected) {
    socket.emit(event, data, callback);
  } else {
    console.log(`📥 Queuing message: ${event}`);
    messageQueue.push({ event, data, callback });
  }
};

export const getConnectionStatus = () => isConnected;
