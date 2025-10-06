import {
  createRoom,
  getRooms,
  getRoom,
  deleteRoom,
  addMemberToRoom,
  removeMemberFromRoom,
  isHost,
  addMessage,
  getMessages,
  deleteMessage,
  addReaction,
  togglePinMessage,
  markMessageAsRead,
  readRooms,
  writeRooms
} from '../utils/roomManager.js';
import { validateSocketData } from '../middleware/validation.js';

// Track online users
const onlineUsers = new Map();
const typingUsers = new Map();

export const setupChatHandlers = (io) => {
  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // User joins with their info
    socket.on('user:join', ({ userId, username, mode }) => {
      socket.userId = userId;
      socket.username = username;
      socket.mode = mode;
      
      onlineUsers.set(userId, {
        socketId: socket.id,
        username,
        mode,
        status: 'online'
      });

      io.emit('users:online', Array.from(onlineUsers.values()));
    });

    // Create room
    socket.on('room:create', (roomData, callback) => {
      try {
        // Validate input
        const validation = validateSocketData.roomCreate(roomData);
        if (!validation.isValid) {
          return callback({ success: false, error: validation.errors.join(', ') });
        }

        // Add creator info
        const roomWithCreator = {
          ...validation.sanitized,
          createdBy: socket.userId
        };

        const room = createRoom(roomWithCreator, socket.mode);
        socket.join(room.id);
        
        io.emit('room:created', room);
        callback({ success: true, room });
      } catch (error) {
        callback({ success: false, error: error.message });
      }
    });

    // Get all rooms
    socket.on('rooms:get', (callback) => {
      try {
        const rooms = getRooms(socket.mode);
        callback({ success: true, rooms });
      } catch (error) {
        callback({ success: false, error: error.message });
      }
    });

    // Join room
    socket.on('room:join', (data, callback) => {
      try {
        // Validate input
        const validation = validateSocketData.roomJoin(data);
        if (!validation.isValid) {
          return callback({ success: false, error: validation.errors.join(', ') });
        }

        const { roomId, password } = validation.sanitized;
        const room = getRoom(roomId, socket.mode);
        
        if (!room) {
          return callback({ success: false, error: 'Room not found' });
        }

        // Check if room mode matches user mode
        if (room.mode && room.mode !== socket.mode) {
          return callback({ success: false, error: 'Cannot access this room from different mode' });
        }

        // Check password if required
        if (room.password && room.password !== password) {
          return callback({ success: false, error: 'Invalid password' });
        }

        // Check if room expired
        if (room.expiresAt && new Date(room.expiresAt) < new Date()) {
          deleteRoom(roomId, socket.mode);
          return callback({ success: false, error: 'Room has expired' });
        }

        socket.join(roomId);
        addMemberToRoom(roomId, socket.userId, socket.mode);

        // Get messages
        const messages = getMessages(roomId, socket.mode);

        // Notify room
        io.to(roomId).emit('user:joined', {
          userId: socket.userId,
          username: socket.username
        });

        callback({ success: true, room, messages });
      } catch (error) {
        callback({ success: false, error: error.message });
      }
    });

    // Leave room
    socket.on('room:leave', ({ roomId }, callback) => {
      try {
        const room = getRoom(roomId, socket.mode);
        
        if (!room) {
          return callback({ success: false, error: 'Room not found' });
        }

        // Remove user from room members
        removeMemberFromRoom(roomId, socket.userId, socket.mode);
        socket.leave(roomId);
        
        // Notify others
        io.to(roomId).emit('user:left', {
          userId: socket.userId,
          username: socket.username
        });

        // Don't delete room when members leave - rooms persist until expiry time

        callback({ success: true });
      } catch (error) {
        callback({ success: false, error: error.message });
      }
    });

    // Delete room
    socket.on('room:delete', ({ roomId }, callback) => {
      try {
        const room = getRoom(roomId, socket.mode);
        
        if (!room) {
          return callback({ success: false, error: 'Room not found' });
        }

        if (room.createdBy !== socket.userId) {
          return callback({ success: false, error: 'Only room creator can delete' });
        }

        deleteRoom(roomId, socket.mode);
        io.to(roomId).emit('room:deleted', { roomId });
        io.emit('room:removed', { roomId });
        
        callback({ success: true });
      } catch (error) {
        callback({ success: false, error: error.message });
      }
    });

    // Rename room
    socket.on('room:rename', ({ roomId, newName }, callback) => {
      try {
        const room = getRoom(roomId, socket.mode);
        
        if (!room) {
          return callback({ success: false, error: 'Room not found' });
        }

        if (room.createdBy !== socket.userId) {
          return callback({ success: false, error: 'Only room creator can rename' });
        }

        if (!newName || newName.length < 3 || newName.length > 50) {
          return callback({ success: false, error: 'Room name must be 3-50 characters' });
        }

        // Update room name
        room.name = newName;
        
        if (socket.mode === 'normal') {
          const rooms = readRooms();
          const roomIndex = rooms.findIndex(r => r.id === roomId);
          if (roomIndex !== -1) {
            rooms[roomIndex] = room;
            writeRooms(rooms);
          }
        }

        io.to(roomId).emit('room:renamed', { roomId, newName });
        io.emit('room:updated', room);
        
        callback({ success: true, room });
      } catch (error) {
        callback({ success: false, error: error.message });
      }
    });

    // Send message
    socket.on('message:send', (data, callback) => {
      try {
        // Validate input
        const validation = validateSocketData.messageSend(data);
        if (!validation.isValid) {
          return callback({ success: false, error: validation.errors.join(', ') });
        }

        const { roomId, content, type, fileUrl, fileName } = validation.sanitized;
        const room = getRoom(roomId, socket.mode);
        
        if (!room) {
          return callback({ success: false, error: 'Room not found' });
        }

        // Calculate expiry for burn-after-reading or time-limited rooms
        let expiresAt = null;
        if (room.burnAfterReading && socket.mode === 'secure') {
          // For burn-after-reading, set a reasonable timeout (30 seconds)
          expiresAt = new Date(Date.now() + 30000).toISOString();
        } else if (room.timeLimit && room.expiresAt) {
          // Messages expire when room expires
          expiresAt = room.expiresAt;
        }

        const message = addMessage(roomId, {
          userId: socket.userId,
          username: socket.username,
          content,
          type,
          fileUrl,
          fileName,
          burnAfterReading: room.burnAfterReading,
          expiresAt
        }, socket.mode);

        io.to(roomId).emit('message:new', message);

        callback({ success: true, message });
      } catch (error) {
        callback({ success: false, error: error.message });
      }
    });

    // Delete message
    socket.on('message:delete', ({ roomId, messageId }, callback) => {
      try {
        deleteMessage(roomId, messageId, socket.mode);
        io.to(roomId).emit('message:deleted', { messageId });
        callback({ success: true });
      } catch (error) {
        callback({ success: false, error: error.message });
      }
    });

    // Mark message as read (for burn-after-reading)
    socket.on('message:read', ({ roomId, messageId }, callback) => {
      try {
        const room = getRoom(roomId, socket.mode);
        if (room && room.burnAfterReading && socket.mode === 'secure') {
          // Mark as read and schedule deletion
          markMessageAsRead(roomId, messageId, socket.userId, socket.mode);
          
          // Delete after 5 seconds of being read
          setTimeout(() => {
            deleteMessage(roomId, messageId, socket.mode);
            io.to(roomId).emit('message:deleted', { messageId });
          }, 5000);
        }
        callback({ success: true });
      } catch (error) {
        callback({ success: false, error: error.message });
      }
    });

    // Add reaction
    socket.on('message:react', (data, callback) => {
      try {
        // Validate input
        const validation = validateSocketData.messageReact(data);
        if (!validation.isValid) {
          return callback({ success: false, error: validation.errors.join(', ') });
        }

        const { roomId, messageId, emoji } = validation.sanitized;
        addReaction(roomId, messageId, socket.userId, emoji, socket.mode);
        io.to(roomId).emit('message:reaction', { messageId, emoji, userId: socket.userId });
        callback({ success: true });
      } catch (error) {
        callback({ success: false, error: error.message });
      }
    });

    // Pin message
    socket.on('message:pin', ({ roomId, messageId }, callback) => {
      try {
        if (socket.mode === 'normal') {
          togglePinMessage(roomId, messageId, socket.mode);
          io.to(roomId).emit('message:pinned', { messageId });
          callback({ success: true });
        } else {
          callback({ success: false, error: 'Pinning not available in secure mode' });
        }
      } catch (error) {
        callback({ success: false, error: error.message });
      }
    });

    // Typing indicator
    socket.on('typing:start', ({ roomId }) => {
      const key = `${roomId}:${socket.userId}`;
      typingUsers.set(key, { username: socket.username, roomId });
      socket.to(roomId).emit('user:typing', { userId: socket.userId, username: socket.username });
    });

    socket.on('typing:stop', ({ roomId }) => {
      const key = `${roomId}:${socket.userId}`;
      typingUsers.delete(key);
      socket.to(roomId).emit('user:stopped-typing', { userId: socket.userId });
    });

    // Screenshot alert
    socket.on('screenshot:taken', ({ roomId }) => {
      io.to(roomId).emit('screenshot:alert', {
        username: socket.username,
        timestamp: new Date().toISOString()
      });
    });

    // Disconnect
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.id}`);
      
      if (socket.userId) {
        onlineUsers.delete(socket.userId);
        io.emit('users:online', Array.from(onlineUsers.values()));
        
        // Clear typing indicators
        for (const [key, value] of typingUsers.entries()) {
          if (key.includes(socket.userId)) {
            typingUsers.delete(key);
            io.to(value.roomId).emit('user:stopped-typing', { userId: socket.userId });
          }
        }

        // Delete all secure mode rooms created by this user
        if (socket.mode === 'secure') {
          const rooms = getRooms('secure');
          rooms.forEach(room => {
            if (room.createdBy === socket.userId) {
              deleteRoom(room.id, 'secure');
              io.emit('room:removed', { roomId: room.id });
              console.log(`Deleted secure room: ${room.name} (${room.id})`);
            }
          });
        }
      }
    });
  });
};
