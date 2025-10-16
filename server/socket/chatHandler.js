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
  writeRooms,
  readMessages,
  deleteMessagesForUser,
  secureRooms
} from '../utils/roomManager.js';
import { validateSocketData } from '../middleware/validation.js';

// Track online users
const onlineUsers = new Map();
const typingUsers = new Map();
// Track rooms with timers for auto-deletion when all users go offline
const roomOfflineTimers = new Map();
// Track left users and failed attempts per room
const roomLeftUsers = new Map(); // { roomId: [{ username, leftAt }] }
const roomFailedAttempts = new Map(); // { roomId: [{ username, count, lastAttempt, reason }] }

export const setupChatHandlers = (io) => {
  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // User joins with their info
    socket.on('user:join', ({ userId, username, mode }, callback) => {
      socket.userId = userId;
      socket.username = username;
      socket.mode = mode;
      
      console.log(`[USER:JOIN] User ${username} joined with mode: ${mode}`);
      
      onlineUsers.set(userId, {
        socketId: socket.id,
        username,
        mode,
        status: 'online'
      });

      io.emit('users:online', Array.from(onlineUsers.values()));
      
      // Acknowledge that user:join is complete
      if (callback) {
        callback({ success: true, userId, username, mode });
      }
    });

    // Secure Room: Create
    socket.on('secure-room:create', (data, callback) => {
      try {
        const { roomId, username, password, timeLimit, burnAfterReading } = data;

        // Validate all mandatory fields
        if (!roomId || !username || !password || !timeLimit) {
          return callback({ success: false, error: 'All fields are required' });
        }

        if (password.length < 6) {
          return callback({ success: false, error: 'Password must be at least 6 characters' });
        }

        if (timeLimit <= 0) {
          return callback({ success: false, error: 'Time limit must be greater than 0' });
        }

        // Check if room ID already exists
        const existingRoom = getRoom(roomId, 'secure');
        if (existingRoom) {
          return callback({ success: false, error: 'Room ID already exists. Please choose a different ID.' });
        }

        // Create secure room
        const roomData = {
          id: roomId, // Use custom room ID
          name: `Secure-${roomId}`,
          createdBy: username,
          password: password,
          timeLimit: parseInt(timeLimit),
          burnAfterReading: burnAfterReading || false
        };

        const room = createRoom(roomData, 'secure');
        
        // Set socket info
        socket.userId = username;
        socket.username = username;
        socket.mode = 'secure';
        
        // Join the room
        socket.join(room.id);
        
        // Add creator as a member automatically
        addMemberToRoom(room.id, username, 'secure');
        
        // Initialize attendance log
        if (!room.attendanceLog) {
          room.attendanceLog = [];
        }
        room.attendanceLog.push({
          username: username,
          action: 'joined',
          timestamp: new Date().toISOString()
        });
        
        // Add system message: Room created
        const creationMessage = addMessage(room.id, {
          userId: 'system',
          username: 'System',
          content: `🎉 Room created by ${username}`,
          type: 'system',
          isRoomCreation: true
        }, 'secure');
        
        // Emit initial online users count (just the creator)
        io.to(room.id).emit('room:online-users', [{
          userId: username,
          username: username,
          socketId: socket.id
        }]);
        
        // Start room expiry timer
        setTimeout(() => {
          const roomStillExists = getRoom(room.id, 'secure');
          if (roomStillExists) {
            deleteRoom(room.id, 'secure');
            io.to(room.id).emit('room:expired', { roomId: room.id });
            io.emit('room:removed', { roomId: room.id });
            console.log(`[SECURE] Room ${room.id} expired after ${timeLimit} minutes`);
          }
        }, timeLimit * 60000);

        console.log(`[SECURE-CREATE] Room created: ${room.name} (ID: ${room.id}) by ${username}`);
        
        callback({ success: true, room });
      } catch (error) {
        console.error('[SECURE-CREATE ERROR]', error);
        callback({ success: false, error: error.message });
      }
    });

    // Secure Room: Join
    socket.on('secure-room:join', async (data, callback) => {
      try {
        console.log('[SECURE-JOIN] Received join request:', data);

        if (!callback || typeof callback !== 'function') {
          console.error('[SECURE-JOIN ERROR] Callback is not a function');
          return;
        }

        const { roomId, username, password } = data;

        // Validate all mandatory fields
        if (!roomId || !username || !password) {
          console.log('[SECURE-JOIN ERROR] Missing required fields');
          return callback({ success: false, error: 'All fields are required' });
        }

        console.log(`[SECURE-JOIN] User ${username} trying to join room ${roomId}`);
        
        const room = getRoom(roomId, 'secure');
        
        if (!room) {
          console.log(`[SECURE-JOIN ERROR] Room ${roomId} not found in secure rooms`);
          console.log(`[SECURE-JOIN] Available secure rooms:`, Array.from(secureRooms.keys()));
          return callback({ success: false, error: `Room "${roomId}" not found` });
        }

        console.log(`[SECURE-JOIN] Room found:`, { id: room.id, name: room.name, hasPassword: !!room.password });

        // Verify password
        if (room.password !== password) {
          console.log(`[SECURE-JOIN ERROR] Invalid password for room ${roomId}`);
          
          // Track failed attempt
          if (!roomFailedAttempts.has(roomId)) {
            roomFailedAttempts.set(roomId, []);
          }
          const attempts = roomFailedAttempts.get(roomId);
          const existing = attempts.find(a => a.username === username);
          
          if (existing) {
            existing.count++;
            existing.lastAttempt = new Date();
            existing.reason = 'Invalid password';
          } else {
            attempts.push({
              username,
              count: 1,
              lastAttempt: new Date(),
              reason: 'Invalid password'
            });
          }
          
          // Emit dashboard update to all users in room
          io.to(roomId).emit('dashboard:update', {
            activeUsers: [],
            leftUsers: roomLeftUsers.get(roomId) || [],
            failedAttempts: attempts
          });
          
          return callback({ success: false, error: 'Invalid password' });
        }

        console.log(`[SECURE-JOIN] Password verified for room ${roomId}`);

        // Check if room expired
        if (room.expiresAt && new Date(room.expiresAt) < new Date()) {
          deleteRoom(roomId, 'secure');
          return callback({ success: false, error: 'Room has expired' });
        }

        // Cancel offline deletion timer if it exists
        if (roomOfflineTimers.has(roomId)) {
          clearTimeout(roomOfflineTimers.get(roomId));
          roomOfflineTimers.delete(roomId);
          console.log(`[SECURE-JOIN] Cancelled offline timer for room ${roomId}`);
        }

        // Cancel host-disconnect timer if host is reconnecting
        if (roomOfflineTimers.has(`host-disconnect-${roomId}`)) {
          clearTimeout(roomOfflineTimers.get(`host-disconnect-${roomId}`));
          roomOfflineTimers.delete(`host-disconnect-${roomId}`);
          console.log(`[SECURE-JOIN] Host ${username} reconnected. Cancelled host-disconnect timer for room ${roomId}`);
        }

        // Set socket info
        socket.userId = username;
        socket.username = username;
        socket.mode = 'secure';

        // Join the room
        socket.join(roomId);
        addMemberToRoom(roomId, username, 'secure');

        // Add system message for user joining (visible to everyone)
        const joinMessage = addMessage(roomId, {
          userId: 'system',
          username: 'System',
          content: `👋 ${username} joined the room`,
          type: 'system',
          isUserJoin: true
        }, 'secure');

        // Get messages AFTER adding the join message (so joining user gets it)
        const messages = getMessages(roomId, 'secure');

        // Notify OTHERS about the join (not the joining user - they get it in messages array)
        socket.broadcast.to(roomId).emit('user:joined', {
          userId: username,
          username: username,
          message: joinMessage
        });

        // Get online users in this room
        const socketsInRoom = await io.in(roomId).fetchSockets();
        const roomOnlineUsers = socketsInRoom.map(s => ({
          userId: s.userId,
          username: s.username,
          socketId: s.id
        })).filter(u => u.userId);

        io.to(roomId).emit('room:online-users', roomOnlineUsers);

        console.log(`[SECURE-JOIN SUCCESS] User ${username} joined room ${room.name}. ${roomOnlineUsers.length} users online`);
        callback({ success: true, room, messages });
      } catch (error) {
        console.error('[SECURE-JOIN ERROR]', error);
        callback({ success: false, error: error.message });
      }
    });

    // Extend room time (Secure mode only)
    socket.on('secure-room:extend-time', (data, callback) => {
      try {
        const { roomId, minutesToAdd } = data;

        if (!roomId || !minutesToAdd) {
          return callback({ success: false, error: 'Room ID and minutes to add are required' });
        }

        if (minutesToAdd <= 0 || minutesToAdd > 60) {
          return callback({ success: false, error: 'Minutes must be between 1 and 60' });
        }

        const room = getRoom(roomId, 'secure');
        
        if (!room) {
          return callback({ success: false, error: 'Room not found' });
        }

        // Only room creator can extend time
        if (room.createdBy !== socket.username) {
          return callback({ success: false, error: 'Only the room creator can extend time' });
        }

        // Extend the expiration time
        const currentExpiry = new Date(room.expiresAt).getTime();
        const newExpiry = new Date(currentExpiry + (minutesToAdd * 60000));
        room.expiresAt = newExpiry.toISOString();
        room.timeLimit = room.timeLimit + minutesToAdd;

        // Notify all users in the room
        io.to(roomId).emit('room:time-extended', {
          roomId,
          newExpiresAt: room.expiresAt,
          minutesAdded: minutesToAdd,
          extendedBy: socket.username
        });

        console.log(`[SECURE-EXTEND] Room ${roomId} extended by ${minutesToAdd} minutes by ${socket.username}`);
        callback({ success: true, newExpiresAt: room.expiresAt });
      } catch (error) {
        console.error('[SECURE-EXTEND ERROR]', error);
        callback({ success: false, error: error.message });
      }
    });

    // Create room
    socket.on('room:create', (roomData, callback) => {
      try {
        // Validate input (pass mode for secure mode password validation)
        const validation = validateSocketData.roomCreate(roomData, socket.mode);
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
        
        // Add creator as a member automatically
        addMemberToRoom(room.id, socket.userId, socket.mode);
        
        // Initialize attendance log
        if (!room.attendanceLog) {
          room.attendanceLog = [];
        }
        room.attendanceLog.push({
          username: socket.username,
          action: 'joined',
          timestamp: new Date().toISOString()
        });
        
        // Emit initial online users count (just the creator)
        io.to(room.id).emit('room:online-users', [{
          userId: socket.userId,
          username: socket.username,
          socketId: socket.id
        }]);
        
        console.log(`[CREATE] Room created: ${room.name} (ID: ${room.id}, mode: ${room.mode}) by ${socket.username}`);
        
        io.emit('room:created', room);
        callback({ success: true, room });
      } catch (error) {
        callback({ success: false, error: error.message });
      }
    });

    // Get all rooms
    socket.on('rooms:get', (callback) => {
      try {
        console.log(`[ROOMS:GET] User ${socket.username} requesting rooms for ${socket.mode} mode`);
        const rooms = getRooms(socket.mode);
        console.log(`[ROOMS:GET] Returning ${rooms.length} rooms`);
        callback({ success: true, rooms });
      } catch (error) {
        callback({ success: false, error: error.message });
      }
    });

    // Join room
    socket.on('room:join', async (data, callback) => {
      try {
        // Validate input
        const validation = validateSocketData.roomJoin(data);
        if (!validation.isValid) {
          return callback({ success: false, error: validation.errors.join(', ') });
        }

        const { roomId, password } = validation.sanitized;
        console.log(`[JOIN] User ${socket.userId} (${socket.mode}) trying to join room ${roomId}`);
        
        const room = getRoom(roomId, socket.mode);
        
        if (!room) {
          console.log(`[JOIN ERROR] Room ${roomId} not found in ${socket.mode} mode`);
          // Try to find in the other mode for better error message
          const otherMode = socket.mode === 'secure' ? 'normal' : 'secure';
          const roomInOtherMode = getRoom(roomId, otherMode);
          if (roomInOtherMode) {
            return callback({ success: false, error: `This room exists in ${otherMode} mode. Please switch modes to access it.` });
          }
          return callback({ success: false, error: 'Room not found' });
        }
        
        console.log(`[JOIN] Room found: ${room.name} (mode: ${room.mode})`);

        // Check if room mode matches user mode
        if (room.mode && room.mode !== socket.mode) {
          return callback({ success: false, error: 'Cannot access this room from different mode' });
        }

        // Check password if required
        if (room.password && room.password !== password) {
          // Track failed attempt
          if (!room.failedAttempts) {
            room.failedAttempts = [];
          }
          room.failedAttempts.push({
            username: socket.username,
            reason: 'Invalid password',
            timestamp: new Date().toISOString()
          });
          
          return callback({ success: false, error: 'Invalid password' });
        }

        // Check if room expired
        if (room.expiresAt && new Date(room.expiresAt) < new Date()) {
          deleteRoom(roomId, socket.mode);
          return callback({ success: false, error: 'Room has expired' });
        }

        socket.join(roomId);
        addMemberToRoom(roomId, socket.userId, socket.mode);

        // Add to attendance log
        if (!room.attendanceLog) {
          room.attendanceLog = [];
        }
        room.attendanceLog.push({
          username: socket.username,
          action: 'joined',
          timestamp: new Date().toISOString()
        });

        // Get messages
        const messages = getMessages(roomId, socket.mode);

        // Notify room
        io.to(roomId).emit('user:joined', {
          userId: socket.userId,
          username: socket.username
        });

        // Get online users in this room
        const socketsInRoom = await io.in(roomId).fetchSockets();
        const roomOnlineUsers = socketsInRoom.map(s => ({
          userId: s.userId,
          username: s.username,
          socketId: s.id
        })).filter(u => u.userId); // Filter out undefined users

        // Emit to room
        io.to(roomId).emit('room:online-users', roomOnlineUsers);

        console.log(`[JOIN SUCCESS] User ${socket.username} joined room ${room.name}. ${roomOnlineUsers.length} users online in room`);
        callback({ success: true, room, messages });
      } catch (error) {
        callback({ success: false, error: error.message });
      }
    });

    // Leave room
    socket.on('room:leave', async ({ roomId }, callback) => {
      try {
        const room = getRoom(roomId, socket.mode);
        
        if (!room) {
          if (callback && typeof callback === 'function') {
            return callback({ success: false, error: 'Room not found' });
          }
          return;
        }

        // Check if the leaving user is the host/creator
        const isHost = room.createdBy === socket.username || room.createdBy === socket.userId;

        if (isHost) {
          // Host is leaving - delete room and kick everyone out
          console.log(`[HOST-LEAVE] Host ${socket.username} leaving room ${roomId}. Deleting room...`);
          
          // Notify all members in the room BEFORE they leave
          io.to(roomId).emit('room:deleted-by-host', {
            roomId: roomId,
            hostName: socket.username,
            message: 'Room has been deleted because the host left'
          });

          // Cancel any existing timers
          if (roomOfflineTimers.has(roomId)) {
            clearTimeout(roomOfflineTimers.get(roomId));
            roomOfflineTimers.delete(roomId);
          }

          // Delete the room
          deleteRoom(roomId, socket.mode);
          io.emit('room:removed', { roomId });

          console.log(`[HOST-LEAVE] Room ${roomId} deleted by host ${socket.username}`);
          
          if (callback && typeof callback === 'function') {
            callback({ success: true, hostLeft: true });
          }
          return;
        }

        // Normal member leaving (not host)
        // Track left user (secure mode only)
        if (socket.mode === 'secure') {
          if (!roomLeftUsers.has(roomId)) {
            roomLeftUsers.set(roomId, []);
          }
          roomLeftUsers.get(roomId).push({
            username: socket.username,
            leftAt: new Date(),
            reason: 'Left voluntarily'
          });
        }
        
        // Add to attendance log
        if (!room.attendanceLog) {
          room.attendanceLog = [];
        }
        room.attendanceLog.push({
          username: socket.username,
          action: 'left',
          timestamp: new Date().toISOString()
        });
        
        // Add system message for user leaving
        const leaveMessage = addMessage(roomId, {
          userId: 'system',
          username: 'System',
          content: `👋 ${socket.username} left the room`,
          type: 'system',
          isUserLeave: true
        }, socket.mode);

        // Notify others BEFORE removing user
        // Use io.to instead of socket.broadcast because user needs to leave first
        socket.to(roomId).emit('user:left', {
          userId: socket.userId,
          username: socket.username,
          message: leaveMessage
        });

        // Remove user from room members
        removeMemberFromRoom(roomId, socket.userId, socket.mode);
        socket.leave(roomId);

        // Update online users count
        const socketsInRoom = await io.in(roomId).fetchSockets();
        const roomOnlineUsers = socketsInRoom.map(s => ({
          userId: s.userId,
          username: s.username,
          socketId: s.id
        })).filter(u => u.userId);
        io.to(roomId).emit('room:online-users', roomOnlineUsers);

        // In SECURE mode: If all users leave, start 10-minute deletion timer
        if (socket.mode === 'secure' && roomOnlineUsers.length === 0) {
          console.log(`[SECURE] Room ${roomId} is now empty. Starting 10-minute deletion timer...`);
          
          const timerId = setTimeout(() => {
            // Check again if room still exists and is still empty
            const socketsInRoomNow = io.sockets.adapter.rooms.get(roomId);
            if (!socketsInRoomNow || socketsInRoomNow.size === 0) {
              const roomStillExists = getRoom(roomId, 'secure');
              if (roomStillExists) {
                deleteRoom(roomId, 'secure');
                io.emit('room:removed', { roomId });
                console.log(`[SECURE] Room ${roomId} deleted after 10 minutes of inactivity`);
              }
            }
            roomOfflineTimers.delete(roomId);
          }, 10 * 60 * 1000); // 10 minutes
          
          roomOfflineTimers.set(roomId, timerId);
        }

        if (callback && typeof callback === 'function') {
          callback({ success: true });
        }
      } catch (error) {
        if (callback && typeof callback === 'function') {
          callback({ success: false, error: error.message });
        }
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
        // Validate callback
        if (!callback || typeof callback !== 'function') {
          console.error('[MESSAGE:SEND] No callback provided');
          return;
        }

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

        console.log(`[MESSAGE:SEND] Message sent to room ${roomId} by ${socket.username}`);
        callback({ success: true, message });
      } catch (error) {
        console.error('[MESSAGE:SEND ERROR]', error);
        if (callback && typeof callback === 'function') {
          callback({ success: false, error: error.message });
        }
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

    // Recording indicator
    socket.on('recording:start', ({ roomId, type }) => {
      socket.to(roomId).emit('user:recording', { 
        userId: socket.userId, 
        username: socket.username, 
        type: type 
      });
    });

    socket.on('recording:stop', ({ roomId }) => {
      socket.to(roomId).emit('user:stopped-recording', { userId: socket.userId });
    });

    // Screenshot alert
    socket.on('screenshot:taken', ({ roomId }) => {
      io.to(roomId).emit('screenshot:alert', {
        username: socket.username,
        timestamp: new Date().toISOString()
      });
    });

    // File download notification
    socket.on('file:downloaded', ({ roomId, fileName }) => {
      console.log(`[FILE:DOWNLOAD] ${socket.username} downloaded ${fileName} in room ${roomId}`);
      io.to(roomId).emit('file:download-alert', {
        username: socket.username,
        fileName: fileName,
        timestamp: new Date().toISOString()
      });
    });

    // Dashboard: Request room data (Secure Mode - HOST ONLY)
    socket.on('dashboard:request', async ({ roomId }, callback) => {
      try {
        console.log(`[DASHBOARD] Request for room ${roomId} by ${socket.username}`);
        
        const room = getRoom(roomId, 'secure');
        if (!room) {
          return callback({ success: false, error: 'Room not found' });
        }
        
        // Check if requester is the host
        if (room.createdBy !== socket.username && room.createdBy !== socket.userId) {
          console.log(`[DASHBOARD] Access denied for ${socket.username} - not the host`);
          return callback({ success: false, error: 'Only the host can access the dashboard' });
        }
        
        // Get active users in room
        const socketsInRoom = await io.in(roomId).fetchSockets();
        const activeUsers = socketsInRoom.map(s => ({
          userId: s.userId,
          username: s.username,
          socketId: s.id
        })).filter(u => u.userId);
        
        // Get left users
        const leftUsers = roomLeftUsers.get(roomId) || [];
        
        // Get failed attempts
        const failedAttempts = roomFailedAttempts.get(roomId) || [];
        
        console.log(`[DASHBOARD] Sending data to host ${socket.username}`);
        callback({
          success: true,
          data: {
            activeUsers,
            leftUsers,
            failedAttempts
          }
        });
      } catch (error) {
        console.error('[DASHBOARD] Error:', error);
        callback({ success: false, error: error.message });
      }
    });

    // User: Kick (Secure Mode - Host only)
    socket.on('user:kick', async ({ roomId, userId, username }, callback) => {
      try {
        console.log(`[KICK] ${socket.username} trying to kick ${username} from room ${roomId}`);
        
        const room = getRoom(roomId, 'secure');
        if (!room) {
          return callback({ success: false, error: 'Room not found' });
        }
        
        // Check if requester is the host
        if (room.createdBy !== socket.username && room.createdBy !== socket.userId) {
          return callback({ success: false, error: 'Only the host can kick members' });
        }
        
        // Find the user's socket
        const socketsInRoom = await io.in(roomId).fetchSockets();
        const targetSocket = socketsInRoom.find(s => s.userId === userId || s.username === username);
        
        if (!targetSocket) {
          return callback({ success: false, error: 'User not found in room' });
        }
        
        // Remove user from room
        removeMemberFromRoom(roomId, userId, 'secure');
        
        // Add to attendance log
        if (!room.attendanceLog) {
          room.attendanceLog = [];
        }
        room.attendanceLog.push({
          username: username,
          action: 'kicked',
          kickedBy: socket.username,
          timestamp: new Date().toISOString()
        });
        
        // Notify the kicked user
        targetSocket.emit('user:kicked', {
          reason: `You were kicked by ${socket.username}`
        });
        
        // Force disconnect from room
        targetSocket.leave(roomId);
        
        // Track as left user
        if (!roomLeftUsers.has(roomId)) {
          roomLeftUsers.set(roomId, []);
        }
        roomLeftUsers.get(roomId).push({
          username: username,
          leftAt: new Date(),
          reason: 'Kicked by host'
        });
        
        // Notify others in room
        io.to(roomId).emit('user:left', {
          userId: userId,
          username: username,
          message: {
            id: `kick-${Date.now()}`,
            type: 'system',
            content: `⚠️ ${username} was kicked by ${socket.username}`,
            timestamp: new Date().toISOString()
          }
        });
        
        // Update dashboard for all users in room
        const socketsAfter = await io.in(roomId).fetchSockets();
        const activeUsers = socketsAfter.map(s => ({
          userId: s.userId,
          username: s.username,
          socketId: s.id
        })).filter(u => u.userId);
        
        // Update online users count in chat window
        io.to(roomId).emit('room:online-users', activeUsers);
        
        io.to(roomId).emit('dashboard:update', {
          activeUsers,
          leftUsers: roomLeftUsers.get(roomId) || [],
          failedAttempts: roomFailedAttempts.get(roomId) || []
        });
        
        console.log(`[KICK] ${username} kicked from room ${roomId} by ${socket.username}`);
        callback({ success: true });
      } catch (error) {
        console.error('[KICK] Error:', error);
        callback({ success: false, error: error.message });
      }
    });

    // Dashboard statistics (Normal Mode only)
    socket.on('dashboard:get-stats', (callback) => {
      try {
        const rooms = readRooms();
        const messages = readMessages();
        
        // Count total messages
        let totalMessages = 0;
        let filesShared = {
          images: 0,
          videos: 0,
          documents: 0,
          total: 0
        };
        
        Object.values(messages).forEach(roomMessages => {
          totalMessages += roomMessages.length;
          
          roomMessages.forEach(msg => {
            if (msg.type === 'image') filesShared.images++;
            else if (msg.type === 'video') filesShared.videos++;
            else if (msg.type === 'document' || msg.type === 'file') filesShared.documents++;
          });
        });
        
        filesShared.total = filesShared.images + filesShared.videos + filesShared.documents;
        
        // Count active rooms (rooms with messages in last 24 hours)
        const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
        const activeRooms = rooms.filter(room => {
          const roomMessages = messages[room.id] || [];
          return roomMessages.some(msg => new Date(msg.timestamp).getTime() > oneDayAgo);
        }).length;
        
        // Count user's rooms
        const userRooms = rooms.filter(room => 
          room.members && room.members.includes(socket.userId)
        ).length;
        
        const stats = {
          totalRooms: rooms.length,
          activeRooms: activeRooms,
          totalMessages: totalMessages,
          filesShared: filesShared,
          userRooms: userRooms,
          recentActivity: []
        };
        
        callback({ success: true, stats });
      } catch (error) {
        console.error('Dashboard stats error:', error);
        callback({ success: false, error: 'Failed to get statistics' });
      }
    });

    // Dashboard: Get all rooms user has joined
    socket.on('dashboard:get-rooms', async () => {
      try {
        console.log(`[DASHBOARD] Getting rooms for ${socket.username}`);
        
        const allRooms = getRooms(socket.mode);
        const userRooms = [];

        for (const room of allRooms) {
          // Check if user is a member
          if (room.members && room.members.includes(socket.username)) {
            // Get active users in room
            const socketsInRoom = await io.in(room.id).fetchSockets();
            const onlineUsers = socketsInRoom.map(s => ({
              id: s.userId,
              username: s.username
            })).filter(u => u.id);

            // Calculate remaining time
            let expiryTime = null;
            if (room.timeLimit && room.createdAt) {
              const created = new Date(room.createdAt);
              const expiry = new Date(created.getTime() + room.timeLimit * 60 * 1000);
              expiryTime = expiry.toISOString();
            }

            // Prepare room data
            const roomData = {
              id: room.id,
              name: room.name,
              description: room.description,
              createdBy: room.createdBy,
              createdAt: room.createdAt,
              expiryTime,
              members: room.members || [],
              onlineUsers,
              failedAttempts: room.failedAttempts || [],
              attendanceLog: room.attendanceLog || []
            };

            userRooms.push(roomData);
          }
        }

        socket.emit('dashboard:rooms-data', userRooms);
      } catch (error) {
        console.error('Dashboard get-rooms error:', error);
      }
    });

    // Dashboard: Rejoin room without password
    socket.on('room:rejoin', ({ roomId }, callback) => {
      try {
        const room = getRoom(roomId, socket.mode);
        
        if (!room) {
          return callback({ success: false, error: 'Room not found' });
        }

        // Check if user is already a member
        if (!room.members || !room.members.includes(socket.username)) {
          return callback({ success: false, error: 'You are not a member of this room' });
        }

        // Join the socket room
        socket.join(roomId);
        console.log(`[REJOIN] ${socket.username} rejoined room ${room.name}`);

        // Add to attendance log
        if (!room.attendanceLog) {
          room.attendanceLog = [];
        }
        room.attendanceLog.push({
          username: socket.username,
          action: 'joined',
          timestamp: new Date().toISOString()
        });

        // Notify others in room
        socket.to(roomId).emit('user:joined', {
          userId: socket.userId,
          username: socket.username,
          timestamp: new Date().toISOString()
        });

        // Update online users
        io.in(roomId).fetchSockets().then(socketsInRoom => {
          const onlineUsers = socketsInRoom.map(s => ({
            userId: s.userId,
            username: s.username,
            socketId: s.id
          })).filter(u => u.userId);
          io.to(roomId).emit('room:online-users', onlineUsers);
        });

        callback({ success: true, room });
      } catch (error) {
        console.error('Rejoin error:', error);
        callback({ success: false, error: 'Failed to rejoin room' });
      }
    });

    // Disconnect
    socket.on('disconnect', async () => {
      console.log(`User disconnected: ${socket.id}`);
      
      if (socket.userId) {
        onlineUsers.delete(socket.userId);
        io.emit('users:online', Array.from(onlineUsers.values()));
        
        // NOTE: Host disconnect auto-delete is DISABLED to prevent false triggers
        // Room will only be deleted when host explicitly clicks "Leave Room" button
        // or when the time limit expires
        
        // This prevents issues with:
        // - Page refreshes triggering deletion
        // - Component re-renders causing brief disconnects
        // - Members seeing "room deleted" when host is still there
        
        // Clear typing indicators and update room online counts
        for (const [key, value] of typingUsers.entries()) {
          if (key.includes(socket.userId)) {
            typingUsers.delete(key);
            io.to(value.roomId).emit('user:stopped-typing', { userId: socket.userId });
            
            // Update online users for this room
            try {
              const socketsInRoom = await io.in(value.roomId).fetchSockets();
              const roomOnlineUsers = socketsInRoom.map(s => ({
                userId: s.userId,
                username: s.username,
                socketId: s.id
              })).filter(u => u.userId);
              io.to(value.roomId).emit('room:online-users', roomOnlineUsers);
              
              // In SECURE mode: If room becomes empty, start 10-minute deletion timer
              // (Only if room still exists and wasn't deleted by host disconnect)
              const roomStillExists = getRoom(value.roomId, socket.mode);
              if (socket.mode === 'secure' && roomOnlineUsers.length === 0 && roomStillExists) {
                console.log(`[SECURE] Room ${value.roomId} is now empty after disconnect. Starting 10-minute deletion timer...`);
                
                const timerId = setTimeout(() => {
                  // Check again if room still exists and is still empty
                  const socketsInRoomNow = io.sockets.adapter.rooms.get(value.roomId);
                  if (!socketsInRoomNow || socketsInRoomNow.size === 0) {
                    const roomStillExists = getRoom(value.roomId, 'secure');
                    if (roomStillExists) {
                      deleteRoom(value.roomId, 'secure');
                      io.emit('room:removed', { roomId: value.roomId });
                      console.log(`[SECURE] Room ${value.roomId} deleted after 10 minutes of inactivity`);
                    }
                  }
                  roomOfflineTimers.delete(value.roomId);
                }, 10 * 60 * 1000); // 10 minutes
                
                roomOfflineTimers.set(value.roomId, timerId);
              }
            } catch (err) {
              console.error('Error updating room online users:', err);
            }
          }
        }
      }
    });
  });
};
