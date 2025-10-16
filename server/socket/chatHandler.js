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
        
        console.log(`[SECURE-CREATE] Room created successfully:`, {
          id: room.id,
          name: room.name,
          password: room.password,
          passwordLength: room.password ? room.password.length : 0,
          createdBy: room.createdBy
        });
        
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
          console.log('[SECURE-JOIN ERROR] Missing required fields:', { roomId: !!roomId, username: !!username, password: !!password });
          return callback({ success: false, error: 'All fields are required' });
        }

        // Additional validation to prevent empty strings
        if (roomId.trim() === '' || username.trim() === '' || password.trim() === '') {
          console.log('[SECURE-JOIN ERROR] Empty field values detected');
          return callback({ success: false, error: 'All fields must have valid values' });
        }

        console.log(`[SECURE-JOIN] User ${username} trying to join room ${roomId}`);
        
        const room = getRoom(roomId, 'secure');
        
        if (!room) {
          console.log(`[SECURE-JOIN ERROR] Room ${roomId} not found in secure rooms`);
          console.log(`[SECURE-JOIN] Available secure rooms:`, Array.from(secureRooms.keys()));
          return callback({ success: false, error: `Room "${roomId}" not found` });
        }

        console.log(`[SECURE-JOIN] Room found:`, { 
          id: room.id, 
          name: room.name, 
          hasPassword: !!room.password,
          password: room.password,
          passwordLength: room.password ? room.password.length : 0,
          createdBy: room.createdBy
        });

        // Verify password with better validation
        const roomPassword = room.password ? room.password.toString().trim() : '';
        const userPassword = password ? password.toString().trim() : '';
        
        console.log(`[SECURE-JOIN] Password comparison for room ${roomId}:`);
        console.log(`  Room password: "${roomPassword}" (length: ${roomPassword.length})`);
        console.log(`  User password: "${userPassword}" (length: ${userPassword.length})`);
        console.log(`  Passwords match: ${roomPassword === userPassword}`);
        console.log(`  Is room creator: ${room.createdBy === username}`);
        
        // Room creator should always be allowed to join (they created the room)
        if (room.createdBy === username) {
          console.log(`[SECURE-JOIN] Room creator ${username} joining their own room - skipping password check`);
        } else if (roomPassword !== userPassword) {
          console.log(`[SECURE-JOIN ERROR] Password mismatch for room ${roomId}`);
          
          // Track failed attempt in room's failedAttempts array
          if (!room.failedAttempts) {
            room.failedAttempts = [];
          }
          
          // Add failed attempt with proper username
          room.failedAttempts.push({
            username: username,
            reason: 'Incorrect password',
            timestamp: new Date().toISOString()
          });
          
          // Also track in global failed attempts for compatibility
          if (!roomFailedAttempts.has(roomId)) {
            roomFailedAttempts.set(roomId, []);
          }
          const attempts = roomFailedAttempts.get(roomId);
          attempts.push({
            username: username,
            reason: 'Incorrect password',
            timestamp: new Date().toISOString()
          });
          
          console.log(`[SECURE-JOIN] Failed attempt recorded for user ${username}`);
          
          return callback({ success: false, error: 'Incorrect password. Please check your password and try again.' });
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

        // Remove user from left users list if they were there (prevent duplicates)
        if (roomLeftUsers.has(roomId)) {
          const leftUsers = roomLeftUsers.get(roomId);
          const updatedLeftUsers = leftUsers.filter(leftUser => leftUser.username !== username);
          roomLeftUsers.set(roomId, updatedLeftUsers);
          console.log(`[SECURE-JOIN] Removed ${username} from left users list`);
        }

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

    // Get messages for a room (used by secure mode)
    socket.on('messages:get', ({ roomId }, callback) => {
      try {
        console.log(`[MESSAGES:GET] Getting messages for room ${roomId}`);
        
        const room = getRoom(roomId, socket.mode);
        if (!room) {
          return callback({ success: false, error: 'Room not found' });
        }
        
        const messages = getMessages(roomId, socket.mode);
        console.log(`[MESSAGES:GET] Found ${messages.length} messages for room ${roomId}`);
        
        callback({ success: true, messages });
      } catch (error) {
        console.error('[MESSAGES:GET ERROR]', error);
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
        addMemberToRoom(room.id, socket.username, socket.mode);
        
        // Ensure room.members only contains the creator (clean start)
        room.members = [socket.username];
        console.log(`[CREATE] Room ${room.id} initialized with clean members:`, room.members);
        
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
        if (room.password && room.password.trim() !== password.trim()) {
          console.log(`[JOIN] Password mismatch for room ${roomId}:`);
          console.log(`  Expected: "${room.password}" (length: ${room.password.length})`);
          console.log(`  Received: "${password}" (length: ${password.length})`);
          
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
        addMemberToRoom(roomId, socket.username, socket.mode);
        
        // Clean up any old random IDs from room members (data cleanup)
        const roomToClean = getRoom(roomId, socket.mode);
        if (roomToClean && roomToClean.members) {
          // Remove any members that look like random IDs (contain random characters)
          const cleanMembers = roomToClean.members.filter(member => {
            // Keep if it's a normal username (not a random ID like "hfwugfkuw")
            return member.length < 20 && !/^[a-z0-9]{8,}$/.test(member);
          });
          
          // Add current user if not already present
          if (!cleanMembers.includes(socket.username)) {
            cleanMembers.push(socket.username);
          }
          
          roomToClean.members = cleanMembers;
          console.log(`[JOIN] Cleaned room members for ${roomId}:`, cleanMembers);
        }

        // Remove user from left users list if they were there (prevent duplicates)
        if (roomLeftUsers.has(roomId)) {
          const leftUsers = roomLeftUsers.get(roomId);
          const updatedLeftUsers = leftUsers.filter(leftUser => leftUser.username !== socket.username);
          roomLeftUsers.set(roomId, updatedLeftUsers);
          console.log(`[JOIN] Removed ${socket.username} from left users list`);
        }

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
        console.error('[DISCONNECT ERROR]', error);
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
          
          // Check if user is already in left users list to prevent duplicates
          const leftUsers = roomLeftUsers.get(roomId);
          const alreadyInLeftUsers = leftUsers.some(leftUser => leftUser.username === socket.username);
          
          if (!alreadyInLeftUsers) {
            leftUsers.push({
              username: socket.username,
              leftAt: new Date(),
              reason: 'Left voluntarily'
            });
            console.log(`[LEAVE] Added ${socket.username} to left users list`);
          } else {
            console.log(`[LEAVE] ${socket.username} already in left users list, skipping duplicate`);
          }
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
        removeMemberFromRoom(roomId, socket.username, socket.mode);
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
          if (callback && typeof callback === 'function') {
            callback({ success: true });
          }
        } else {
          if (callback && typeof callback === 'function') {
            callback({ success: false, error: 'Pinning not available in secure mode' });
          }
        }
      } catch (error) {
        if (callback && typeof callback === 'function') {
          callback({ success: false, error: error.message });
        }
      }
    });


    // Typing indicators
    socket.on('user:typing', ({ roomId, userId, username }) => {
      console.log(`[TYPING] ${username || socket.username} started typing in room ${roomId}`);
      socket.to(roomId).emit('user:typing', { 
        userId: socket.username, 
        username: socket.username 
      });
    });

    socket.on('user:stopped-typing', ({ roomId, userId }) => {
      console.log(`[TYPING] ${socket.username} stopped typing in room ${roomId}`);
      socket.to(roomId).emit('user:stopped-typing', { 
        userId: socket.username 
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

    // User: Kick (Host only - Both modes)
    socket.on('user:kick', async ({ roomId, userId, username }, callback) => {
      try {
        console.log(`[KICK] ${socket.username} trying to kick ${username} from room ${roomId} (${socket.mode} mode)`);
        
        const room = getRoom(roomId, socket.mode);
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
        removeMemberFromRoom(roomId, username, socket.mode);
        
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
        
        // Check if user is already in left users list to prevent duplicates
        const leftUsers = roomLeftUsers.get(roomId);
        const alreadyInLeftUsers = leftUsers.some(leftUser => leftUser.username === username);
        
        if (!alreadyInLeftUsers) {
          leftUsers.push({
            username: username,
            leftAt: new Date(),
            reason: 'Kicked by host'
          });
          console.log(`[KICK] Added ${username} to left users list`);
        } else {
          console.log(`[KICK] ${username} already in left users list, skipping duplicate`);
        }
        
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

        // Remove user from left users list if they were there (prevent duplicates)
        if (roomLeftUsers.has(roomId)) {
          const leftUsers = roomLeftUsers.get(roomId);
          const updatedLeftUsers = leftUsers.filter(leftUser => leftUser.username !== socket.username);
          roomLeftUsers.set(roomId, updatedLeftUsers);
          console.log(`[REJOIN] Removed ${socket.username} from left users list`);
        }

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
        console.error('Room rejoin error:', error);
        callback({ success: false, error: error.message });
      }
    });

    // Screenshot Detection Alert
    socket.on('screenshot:detected', async ({ roomId, username, method, timestamp }) => {
      try {
        console.log(`[SCREENSHOT ALERT] ${username} attempted screenshot in room ${roomId} using ${method}`);
        
        const room = getRoom(roomId, socket.mode);
        if (!room) {
          console.error('[SCREENSHOT ALERT] Room not found:', roomId);
          return;
        }

        // Log the screenshot attempt
        if (!room.screenshotAttempts) {
          room.screenshotAttempts = [];
        }
        
        room.screenshotAttempts.push({
          username,
          method,
          timestamp,
          roomId
        });

        // Create system message for chat
        const alertMessage = {
          id: `screenshot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: 'system',
          content: `🚨 ${username} took screenshot`,
          timestamp: timestamp,
          isScreenshotAlert: true,
          method: method,
          username: username
        };

        // Check how many users are in the room
        const socketsInRoom = await io.in(roomId).fetchSockets();
        console.log(`[SCREENSHOT ALERT] Users in room ${roomId}:`, socketsInRoom.length);
        console.log(`[SCREENSHOT ALERT] User details:`, socketsInRoom.map(s => ({ id: s.id, username: s.username })));

        // Send alert to all users in the room (single broadcast)
        io.to(roomId).emit('screenshot:alert', {
          username,
          method,
          timestamp,
          message: alertMessage
        });

        // Send as a regular message to chat (single broadcast)
        io.to(roomId).emit('message:new', alertMessage);

        console.log(`[SCREENSHOT ALERT] Alert sent to ${socketsInRoom.length} users in room ${roomId}`);
        console.log(`[SCREENSHOT ALERT] Message content:`, alertMessage);
        
      } catch (error) {
        console.error('[SCREENSHOT ALERT ERROR]', error);
      }
    });

    // Get room members
    socket.on('room:get-members', async ({ roomId }, callback) => {
      try {
        const room = getRoom(roomId, socket.mode);
        if (!room) {
          return callback({ success: false, error: 'Room not found' });
        }

        // Get all sockets in the room
        const socketsInRoom = await io.in(roomId).fetchSockets();
        console.log(`[GET-MEMBERS] Found ${socketsInRoom.length} sockets in room ${roomId}`);
        
        // Debug: Log socket info
        socketsInRoom.forEach((s, index) => {
          console.log(`[GET-MEMBERS] Socket ${index}: username="${s.username}", userId="${s.userId}"`);
        });
        
        const members = socketsInRoom
          .filter(s => s.username) // Only include sockets with valid usernames
          .map(s => ({
            username: s.username,
            userId: s.username, // Use username as userId for consistency
            status: 'online'
          }));
          
        console.log(`[GET-MEMBERS] Processed ${members.length} online members:`, members.map(m => m.username));

        // Add offline members from room.members if they exist
        if (room.members) {
          console.log(`[GET-MEMBERS] Room.members array:`, room.members);
          room.members.forEach(memberUsername => {
            if (!members.find(m => m.username === memberUsername)) {
              console.log(`[GET-MEMBERS] Adding offline member: ${memberUsername}`);
              members.push({
                username: memberUsername,
                userId: memberUsername,
                status: 'offline'
              });
            }
          });
        }

        callback({ success: true, members });
      } catch (error) {
        console.error('[GET-MEMBERS ERROR]', error);
        callback({ success: false, error: error.message });
      }
    });

    // Get secure room dashboard details
    socket.on('dashboard:get-secure-room-details', ({ roomId }, callback) => {
      try {
        const room = getRoom(roomId, socket.mode);
        if (!room) {
          return callback({ success: false, error: 'Room not found' });
        }

        // Only allow room creator to access dashboard
        if (room.createdBy !== socket.username) {
          console.log(`[SECURE-DASHBOARD] Access denied for ${socket.username} to room ${roomId} (creator: ${room.createdBy})`);
          return callback({ success: false, error: 'Access denied. Only room creator can view dashboard.' });
        }

        // Clean up failed attempts data to ensure proper usernames
        const cleanFailedAttempts = (room.failedAttempts || [])
          .filter(attempt => attempt && attempt.username) // Filter out invalid entries
          .map(attempt => ({
            username: attempt.username,
            reason: attempt.reason || 'Invalid password',
            timestamp: attempt.timestamp || new Date().toISOString()
          }))
          .slice(-50); // Limit to last 50 attempts to prevent memory issues

        // Clean up attendance log
        const cleanAttendanceLog = (room.attendanceLog || [])
          .filter(log => log && log.username) // Filter out invalid entries
          .map(log => ({
            username: log.username,
            action: log.action || 'unknown',
            timestamp: log.timestamp || new Date().toISOString(),
            kickedBy: log.kickedBy || null
          }))
          .slice(-100); // Limit to last 100 log entries

        // Clean members list to ensure only valid usernames
        const cleanMembers = (room.members || [])
          .filter(member => member && typeof member === 'string' && member.length > 0)
          .filter(member => member.length < 50 && !/^[a-z0-9]{8,}$/.test(member)); // Filter out random IDs

        const roomData = {
          id: room.id,
          createdBy: room.createdBy,
          createdAt: room.createdAt,
          expiresAt: room.expiresAt,
          members: cleanMembers,
          failedAttempts: cleanFailedAttempts,
          attendanceLog: cleanAttendanceLog
        };

        console.log(`[SECURE-DASHBOARD] Room ${roomId} details provided to ${socket.username} (${cleanMembers.length} members, ${cleanFailedAttempts.length} failed attempts)`);
        callback({ success: true, room: roomData });
      } catch (error) {
        console.error('[SECURE-DASHBOARD ERROR]', error);
        callback({ success: false, error: error.message });
      }
    });

    // Handle file download notifications
    socket.on('file:downloaded', ({ roomId, messageId, fileName, fileType, downloaderUsername }, callback) => {
      try {
        console.log(`[DOWNLOAD] Received download event:`, { roomId, messageId, fileName, fileType, downloaderUsername });
        
        // Validate required data
        if (!roomId || !downloaderUsername || !fileName) {
          const error = 'Missing required download data';
          console.error(`[DOWNLOAD ERROR] ${error}:`, { roomId, downloaderUsername, fileName });
          if (callback) callback({ success: false, error });
          return;
        }

        // Create download notification message with appropriate icon
        let icon = '📥'; // Default download icon
        if (fileType === 'audio') {
          icon = '🎵';
        } else if (fileType === 'video') {
          icon = '🎬';
        } else if (fileType === 'image') {
          icon = '🖼️';
        } else if (fileType === 'document' || fileType === 'pdf') {
          icon = '📄';
        }

        const downloadMessage = {
          id: `download-${Date.now()}`,
          type: 'system',
          content: `${icon} ${downloaderUsername} downloaded ${fileName}`,
          timestamp: new Date().toISOString(),
          isDownloadNotification: true,
          fileName: fileName,
          fileType: fileType,
          downloaderUsername: downloaderUsername
        };

        console.log(`[DOWNLOAD] Created download message:`, downloadMessage);

        // Broadcast download notification to all users in the room
        io.to(roomId).emit('message:new', downloadMessage);
        console.log(`[DOWNLOAD] Broadcasted to room ${roomId} - message sent to all clients`);
        
        // Send success response back to client
        if (callback) callback({ success: true, message: 'Download notification sent' });
      } catch (error) {
        console.error('[DOWNLOAD ERROR]', error);
        if (callback) callback({ success: false, error: error.message });
      }
    });
  });
};
