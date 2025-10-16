import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Send, Paperclip, Image, Video, Mic, File, Smile, Pin,
  Trash2, AlertTriangle, Eye, Users, Settings, Clock, X, Upload, BarChart3
} from 'lucide-react'
import AudioRecorder from './AudioRecorder'
import VideoRecorder from './VideoRecorder'
import MessageTimer from './MessageTimer'
import RoomDashboard from './RoomDashboard'
import { uploadFile, formatFileSize, getFileIcon } from '../../utils/fileUpload'

const ChatWindow = ({ socket, room, user, mode, theme = 'dark' }) => {
  const [messages, setMessages] = useState([])
  const [inputMessage, setInputMessage] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [typingUsers, setTypingUsers] = useState([])
  const [recordingUsers, setRecordingUsers] = useState([])
  const [onlineUsers, setOnlineUsers] = useState([])
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showAudioRecorder, setShowAudioRecorder] = useState(false)
  const [showVideoRecorder, setShowVideoRecorder] = useState(false)
  const [selfDestructTimer, setSelfDestructTimer] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [selectedFile, setSelectedFile] = useState(null)
  const [filePreview, setFilePreview] = useState(null)
  const [previewModal, setPreviewModal] = useState(null) // { fileUrl, fileName, fileType, mimeType }
  const [showDashboard, setShowDashboard] = useState(false)
  const [dashboardData, setDashboardData] = useState({
    activeUsers: [],
    leftUsers: [],
    failedAttempts: []
  })
  const messagesEndRef = useRef(null)
  const typingTimeoutRef = useRef(null)
  const fileInputRef = useRef(null)

  const emojis = ['😀', '😂', '❤️', '👍', '🎉', '🔥', '💯', '👏', '🙌', '✨']

  useEffect(() => {
    if (!socket || !room) return

    // Join room with password (if available)
    const roomPassword = room._password || room.password || '';
    socket.emit('room:join', { roomId: room.id, password: roomPassword }, ({ success, messages: roomMessages, error }) => {
      if (success) {
        setMessages(roomMessages || [])
      } else {
        console.error('Failed to join room:', error);
        alert(`Failed to join room: ${error || 'Unknown error'}`);
      }
    })

    // Listen for new messages
    socket.on('message:new', (message) => {
      setMessages(prev => [...prev, message])
      scrollToBottom()
    })

    // Listen for deleted messages
    socket.on('message:deleted', ({ messageId }) => {
      setMessages(prev => prev.filter(m => m.id !== messageId))
    })

    // Listen for reactions
    socket.on('message:reaction', ({ messageId, emoji, userId }) => {
      setMessages(prev => prev.map(msg => {
        if (msg.id === messageId) {
          const reactions = { ...msg.reactions }
          if (!reactions[emoji]) reactions[emoji] = []
          if (!reactions[emoji].includes(userId)) {
            reactions[emoji].push(userId)
          }
          return { ...msg, reactions }
        }
        return msg
      }))
    })

    // Typing indicators
    socket.on('user:typing', ({ userId, username }) => {
      setTypingUsers(prev => {
        const filtered = prev.filter(u => u.userId !== userId)
        return [...filtered, { userId, username }]
      })
    })

    socket.on('user:stopped-typing', ({ userId }) => {
      setTypingUsers(prev => prev.filter(u => u.userId !== userId))
    })

    // Recording indicators
    socket.on('user:recording', ({ userId, username, type }) => {
      setRecordingUsers(prev => {
        const filtered = prev.filter(u => u.userId !== userId)
        return [...filtered, { userId, username, type }]
      })
    })

    socket.on('user:stopped-recording', ({ userId }) => {
      setRecordingUsers(prev => prev.filter(u => u.userId !== userId))
    })

    // Room-specific online users (ONLY use this in chat window, ignore global)
    socket.on('room:online-users', (users) => {
      console.log(`[ChatWindow] Room has ${users.length} users online:`, users);
      setOnlineUsers(users)
    })

    // Screenshot alert - show in chat as system message
    socket.on('screenshot:alert', ({ username, timestamp }) => {
      const screenshotMessage = {
        id: `screenshot-${Date.now()}`,
        type: 'system',
        content: `📸 ${username} took a screenshot`,
        timestamp: timestamp,
        isScreenshotAlert: true
      }
      setMessages(prev => [...prev, screenshotMessage])
    })

    // File download notification
    socket.on('file:download-alert', ({ username, fileName, timestamp }) => {
      const downloadMessage = {
        id: `download-${Date.now()}`,
        type: 'system',
        content: `📥 ${username} downloaded ${fileName}`,
        timestamp: timestamp,
        isDownloadAlert: true
      }
      setMessages(prev => [...prev, downloadMessage])
    })

    // User joined/left
    socket.on('user:joined', ({ username, message }) => {
      console.log(`${username} joined the room`)
      // Server provides the message - just use it
      if (message) {
        setMessages(prev => [...prev, message])
      }
    })

    socket.on('user:left', ({ username, message }) => {
      console.log(`${username} left the room`)
      // Server provides the message - just use it
      if (message) {
        setMessages(prev => [...prev, message])
      }
    })

    // Room expired
    socket.on('room:expired', ({ roomId: expiredRoomId }) => {
      if (room.id === expiredRoomId) {
        alert('⏰ Room has expired and been deleted.')
        window.location.reload()
      }
    })

    // Dashboard data updates
    socket.on('dashboard:update', (data) => {
      setDashboardData(data)
    })

    // User kicked event
    socket.on('user:kicked', ({ reason }) => {
      alert(`🚫 You have been kicked from the room.\n\nReason: ${reason}`)
      window.location.reload()
    })

    return () => {
      // Don't emit room:leave on cleanup - this causes issues with host-leave detection
      // The disconnect handler on server will handle cleanup properly
      // socket.emit('room:leave', { roomId: room.id })
      
      socket.off('message:new')
      socket.off('message:deleted')
      socket.off('message:reaction')
      socket.off('user:typing')
      socket.off('user:stopped-typing')
      socket.off('user:recording')
      socket.off('user:stopped-recording')
      socket.off('room:online-users')
      socket.off('screenshot:alert')
      socket.off('file:download-alert')
      socket.off('user:joined')
      socket.off('user:left')
      socket.off('room:expired')
      socket.off('dashboard:update')
      socket.off('user:kicked')
    }
  }, [socket, room])

  // Screenshot detection removed from secure mode

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const handleSendMessage = () => {
    if (!inputMessage.trim()) return

    // Stop typing indicator immediately
    handleStopTyping()

    socket.emit('message:send', {
      roomId: room.id,
      content: inputMessage,
      type: 'text'
    }, ({ success }) => {
      if (success) {
        setInputMessage('')
      }
    })
  }

  const handleTyping = () => {
    if (!isTyping) {
      setIsTyping(true)
      socket.emit('typing:start', { roomId: room.id })
    }

    clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => {
      handleStopTyping()
    }, 2000)
  }

  const handleStopTyping = () => {
    clearTimeout(typingTimeoutRef.current)
    setIsTyping(false)
    socket.emit('typing:stop', { roomId: room.id })
  }

  const handleReaction = (messageId, emoji) => {
    socket.emit('message:react', {
      roomId: room.id,
      messageId,
      emoji
    })
  }

  const handleDeleteMessage = (messageId) => {
    socket.emit('message:delete', {
      roomId: room.id,
      messageId
    })
  }

  const handlePinMessage = (messageId) => {
    if (mode === 'normal') {
      socket.emit('message:pin', {
        roomId: room.id,
        messageId
      })
    }
  }

  const handleFileSelect = (event, fileType = 'file') => {
    const file = event.target.files[0]
    if (!file) return

    console.log('[FileSelect] File selected:', file.name, 'Type:', file.type, 'Size:', file.size);

    // Store the selected file
    setSelectedFile(file)

    // Create preview for images
    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (e) => {
        setFilePreview(e.target.result)
      }
      reader.readAsDataURL(file)
    } else {
      setFilePreview(null)
    }

    // Reset input
    event.target.value = ''
  }

  const handleSendFile = async () => {
    if (!selectedFile) return

    console.log('[FileUpload] Starting upload:', selectedFile.name);

    try {
      setUploading(true)
      setUploadProgress(0)

      console.log('[FileUpload] Uploading to server...');
      const result = await uploadFile(selectedFile, mode)
      console.log('[FileUpload] Upload successful:', result);
      
      setUploadProgress(100)

      // Send message with file
      console.log('[FileUpload] Sending message with file...');
      
      // Add timeout to handle cases where callback isn't called
      const timeoutId = setTimeout(() => {
        console.warn('[FileUpload] Callback timeout - assuming success');
        setUploading(false)
        setUploadProgress(0)
        setSelectedFile(null)
        setFilePreview(null)
      }, 5000);

      socket.emit('message:send', {
        roomId: room.id,
        content: `Sent ${result.file.category}: ${result.file.originalName}`,
        type: result.file.category,
        fileUrl: result.file.url,
        fileName: result.file.originalName,
        fileSize: selectedFile.size,
        mimeType: selectedFile.type
      }, (response) => {
        clearTimeout(timeoutId);
        
        if (response && response.success) {
          console.log('[FileUpload] Message sent successfully');
          setUploading(false)
          setUploadProgress(0)
          setSelectedFile(null)
          setFilePreview(null)
        } else {
          console.error('[FileUpload] Failed to send message:', response?.error);
          alert('Failed to send file message: ' + (response?.error || 'Unknown error'));
          setUploading(false)
          setUploadProgress(0)
        }
      })
    } catch (error) {
      console.error('[FileUpload] Upload error:', error)
      alert('Failed to upload file: ' + error.message)
      setUploading(false)
      setUploadProgress(0)
    }
  }

  const handleCancelFile = () => {
    setSelectedFile(null)
    setFilePreview(null)
  }

  const handleSendAudio = (audioBlob) => {
    // Convert blob to base64 for transmission
    const reader = new FileReader()
    reader.onloadend = () => {
      const base64Audio = reader.result
      socket.emit('message:send', {
        roomId: room.id,
        content: 'Audio message',
        type: 'audio',
        fileUrl: base64Audio
      }, ({ success }) => {
        if (success) {
          setShowAudioRecorder(false)
        }
      })
    }
    reader.readAsDataURL(audioBlob)
  }

  const handleSendVideo = async (videoBlob) => {
    try {
      console.log('[VideoUpload] Starting video upload:', videoBlob.size, 'bytes');
      setUploading(true)
      setUploadProgress(0)

      // Pass the blob directly with a custom filename
      const fileName = `video-${Date.now()}.webm`
      const result = await uploadFile(videoBlob, mode, fileName)
      console.log('[VideoUpload] Upload successful:', result);
      
      setUploadProgress(100)

      // Send message with video
      socket.emit('message:send', {
        roomId: room.id,
        content: 'Sent video recording',
        type: 'video',
        fileUrl: result.file.url,
        fileName: result.file.originalName
      }, ({ success, error }) => {
        if (success) {
          console.log('[VideoUpload] Message sent successfully');
          setUploading(false)
          setUploadProgress(0)
          setShowVideoRecorder(false)
        } else {
          console.error('[VideoUpload] Failed to send message:', error);
          alert('Failed to send video: ' + (error || 'Unknown error'));
          setUploading(false)
          setUploadProgress(0)
        }
      })
    } catch (error) {
      console.error('[VideoUpload] Upload error:', error)
      alert('Failed to upload video: ' + error.message)
      setUploading(false)
      setUploadProgress(0)
    }
  }

  const handleMessageExpire = (messageId) => {
    setMessages(prev => prev.filter(m => m.id !== messageId))
  }

  const handleSetSelfDestruct = (minutes) => {
    setSelfDestructTimer(minutes)
  }

  const handleDownload = (fileName, fileUrl) => {
    console.log('[Download] User downloading:', fileName);
    
    // Notify server about download
    socket.emit('file:downloaded', {
      roomId: room.id,
      fileName: fileName
    });
    
    // Trigger download
    const link = document.createElement('a');
    // Handle both base64 and file path URLs
    link.href = fileUrl.startsWith('data:') ? fileUrl : `${window.location.protocol}//${window.location.hostname}:5000${fileUrl}`;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const handleOpenDashboard = () => {
    // Request latest dashboard data from server
    socket.emit('dashboard:request', { roomId: room.id }, (response) => {
      if (response.success) {
        setDashboardData(response.data)
        setShowDashboard(true)
      }
    })
  }

  const handleKickUser = (userId, username) => {
    if (confirm(`Are you sure you want to kick "${username}" from the room?`)) {
      socket.emit('user:kick', {
        roomId: room.id,
        userId: userId,
        username: username
      }, (response) => {
        if (response.success) {
          alert(`✅ ${username} has been kicked from the room`)
        } else {
          alert(`❌ Failed to kick user: ${response.error}`)
        }
      })
    }
  }

  const formatTime = (timestamp) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  }

  if (!room) {
    return (
      <div className={`flex-1 flex items-center justify-center ${theme === 'dark' ? 'bg-slate-900' : 'bg-gray-100'}`}>
        <div className={`text-center ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
          <Users className="w-16 h-16 mx-auto mb-4 opacity-50" />
          <p className="text-lg">Select a room to start chatting</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex-1 flex flex-col relative ${theme === 'dark' ? 'bg-slate-900' : 'bg-white'}`}>
      {/* Room Header */}
      <div className="bg-slate-800 border-b border-slate-700 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">
              {room.name}
            </h2>
            <p className="text-sm text-gray-400">
              {room.members?.length || 0} members
              {room.burnAfterReading && <span className="ml-2">🔥 Burn After Reading</span>}
              {room.timeLimit && <span className="ml-2">⏱️ {room.timeLimit}min limit</span>}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 text-sm text-gray-400">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span>{onlineUsers.length} online</span>
            </div>
            {mode === 'secure' && room.createdBy === user.username && (
              <button
                onClick={handleOpenDashboard}
                className="flex items-center gap-2 px-4 py-2 bg-primary/20 hover:bg-primary/30 text-primary rounded-lg transition-colors"
                title="View Room Dashboard (Host Only)"
              >
                <BarChart3 className="w-4 h-4" />
                <span className="hidden sm:inline">Details</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <AnimatePresence>
          {messages.map((message) => {
            // System messages (screenshot alerts, etc.)
            if (message.type === 'system') {
              return (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="flex justify-center my-2"
                >
                  <div className={`px-4 py-2 rounded-full text-xs font-medium ${
                    message.isScreenshotAlert 
                      ? 'bg-red-500/20 text-red-400 border border-red-500/30' 
                      : message.isDownloadAlert
                      ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                      : message.isRoomCreation
                      ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                      : message.isUserJoin
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : message.isUserLeave
                      ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                      : 'bg-slate-700/50 text-gray-400'
                  }`}>
                    {message.content}
                  </div>
                </motion.div>
              )
            }

            // Regular messages
            return (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className={`flex ${message.userId === user.id ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[90%] sm:max-w-md ${message.userId === user.id ? 'items-end' : 'items-start'} flex flex-col`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-gray-400">{message.username}</span>
                    <span className="text-xs text-gray-500">{formatTime(message.timestamp)}</span>
                  </div>
                  
                  <div className={`relative group rounded-lg p-3 ${
                    message.userId === user.id
                      ? 'bg-primary text-white'
                      : 'bg-slate-800 text-gray-200'
                  }`}>
                    {message.pinned && <Pin className="w-3 h-3 absolute -top-1 -right-1 text-yellow-500" />}
                    
                    {/* Render different message types */}
                  {(message.fileUrl && ['image', 'video', 'audio', 'document', 'file'].includes(message.type)) ? (
                    <div className="bg-slate-700/50 p-3 rounded">
                      <div className="flex items-center gap-3 mb-2">
                        {message.type === 'image' ? (
                          <img 
                            src={message.fileUrl.startsWith('data:') ? message.fileUrl : `${window.location.protocol}//${window.location.hostname}:5000${message.fileUrl}`}
                            alt={message.fileName}
                            className="w-16 h-16 object-cover rounded"
                          />
                        ) : message.type === 'video' ? (
                          <Video className="w-8 h-8 text-purple-400" />
                        ) : message.type === 'audio' ? (
                          <Mic className="w-8 h-8 text-green-400" />
                        ) : (
                          <File className="w-8 h-8 text-blue-400" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{message.fileName}</p>
                          <p className="text-xs text-gray-400">{formatFileSize(message.fileSize || 0)}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => setPreviewModal({
                            fileUrl: message.fileUrl,
                            fileName: message.fileName,
                            fileType: message.type,
                            mimeType: message.mimeType
                          })}
                          className="flex-1 text-center text-xs bg-slate-600 hover:bg-slate-500 text-white px-3 py-2 rounded transition-colors flex items-center justify-center gap-1"
                        >
                          <Eye className="w-3 h-3" />
                          Preview
                        </button>
                        <button 
                          onClick={() => handleDownload(message.fileName, message.fileUrl)}
                          className="flex-1 text-center text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded transition-colors flex items-center justify-center gap-1"
                        >
                          <File className="w-3 h-3" />
                          Download
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="break-words">{message.content}</p>
                  )}

                  {/* Self-Destruct Timer */}
                  <MessageTimer message={message} onExpire={handleMessageExpire} />

                  {/* Reactions */}
                  {Object.keys(message.reactions || {}).length > 0 && (
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {Object.entries(message.reactions).map(([emoji, users]) => (
                        <button
                          key={emoji}
                          onClick={() => handleReaction(message.id, emoji)}
                          className="bg-slate-700 px-2 py-1 rounded text-xs flex items-center gap-1 hover:bg-slate-600"
                        >
                          <span>{emoji}</span>
                          <span>{users.length}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Message Actions */}
                  <div className="absolute -top-8 right-0 hidden group-hover:flex gap-1 bg-slate-700 rounded-lg p-1">
                    <button
                      onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                      className="p-3 sm:p-2 hover:bg-slate-700 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                      title="Emoji"
                    >
                      <Smile className="w-5 h-5 text-gray-400" />
                    </button>
                    {mode === 'normal' && (
                      <button
                        onClick={() => handlePinMessage(message.id)}
                        className="p-1 hover:bg-slate-600 rounded"
                        title="Pin"
                      >
                        <Pin className="w-4 h-4 text-gray-300" />
                      </button>
                    )}
                    {message.userId === user.id && (
                      <button
                        onClick={() => handleDeleteMessage(message.id)}
                        className="p-1 hover:bg-red-600 rounded"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4 text-gray-300" />
                      </button>
                    )}
                  </div>

                  {/* Emoji Picker */}
                  {showEmojiPicker === message.id && (
                    <div className="absolute bottom-full mb-2 bg-slate-700 rounded-lg p-2 flex gap-1 shadow-lg z-10">
                      {emojis.map(emoji => (
                        <button
                          key={emoji}
                          onClick={() => {
                            handleReaction(message.id, emoji)
                            setShowEmojiPicker(null)
                          }}
                          className="hover:bg-slate-600 p-1 rounded text-lg"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
            )
          })}
        </AnimatePresence>

        {/* Typing Indicator */}
        {typingUsers.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-sm text-gray-400 italic"
          >
            {typingUsers.map(u => u.username).join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
          </motion.div>
        )}

        {/* Recording Indicator */}
        {recordingUsers.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-sm text-red-400 italic flex items-center gap-2"
          >
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            {recordingUsers.map(u => `${u.username} (${u.type})`).join(', ')}
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className={`border-t p-4 relative ${theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-gray-50 border-gray-200'}`}>
        {mode === 'secure' && room.burnAfterReading && (
          <div className="mb-2 flex items-center gap-2 text-xs text-orange-400">
            <AlertTriangle className="w-4 h-4" />
            <span>Messages will self-destruct after viewing</span>
          </div>
        )}

        {/* File Preview */}
        {selectedFile && !uploading && (
          <div className="mb-2 bg-slate-700 rounded-lg p-3">
            <div className="flex items-start gap-3">
              {/* Preview */}
              <div className="flex-shrink-0">
                {filePreview ? (
                  <img src={filePreview} alt="Preview" className="w-16 h-16 object-cover rounded" />
                ) : (
                  <div className="w-16 h-16 bg-slate-600 rounded flex items-center justify-center">
                    <Paperclip className="w-8 h-8 text-gray-400" />
                  </div>
                )}
              </div>
              
              {/* File Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-300 font-medium truncate">{selectedFile.name}</p>
                <p className="text-xs text-gray-400">{formatFileSize(selectedFile.size)}</p>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={handleSendFile}
                  className="px-4 py-2 bg-primary hover:bg-primary/80 text-white rounded-lg transition-colors flex items-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  Send
                </button>
                <button
                  onClick={handleCancelFile}
                  className="px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Upload Progress */}
        {uploading && (
          <div className="mb-2 bg-slate-700 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-300">Uploading {selectedFile?.name}...</span>
              <span className="text-sm text-gray-400">{uploadProgress}%</span>
            </div>
            <div className="w-full bg-slate-600 rounded-full h-2">
              <div 
                className="bg-primary h-2 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Audio Recorder */}
        {showAudioRecorder && (
          <AudioRecorder
            onSendAudio={handleSendAudio}
            onCancel={() => setShowAudioRecorder(false)}
            mode={mode}
            socket={socket}
            roomId={room.id}
          />
        )}

        {/* Video Recorder */}
        {showVideoRecorder && (
          <VideoRecorder
            onSendVideo={handleSendVideo}
            onCancel={() => setShowVideoRecorder(false)}
            mode={mode}
            socket={socket}
            roomId={room.id}
          />
        )}

        {/* Hidden file inputs */}
        <input
          ref={fileInputRef}
          type="file"
          accept="*/*"
          onChange={(e) => handleFileSelect(e, 'file')}
          className="hidden"
        />
        <input
          type="file"
          id="image-input"
          accept="image/*"
          onChange={(e) => handleFileSelect(e, 'image')}
          className="hidden"
        />
        <input
          type="file"
          id="video-input"
          accept="video/*"
          onChange={(e) => handleFileSelect(e, 'video')}
          className="hidden"
        />

        <div className="flex items-center gap-2">
          <div className="flex gap-2 sm:gap-1">
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="p-3 sm:p-2 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50 min-w-[44px] min-h-[44px] flex items-center justify-center" 
              title="Attach File"
            >
              <Paperclip className="w-5 h-5 text-gray-400" />
            </button>
            <button 
              onClick={() => document.getElementById('image-input')?.click()}
              disabled={uploading}
              className="p-3 sm:p-2 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50 min-w-[44px] min-h-[44px] flex items-center justify-center" 
              title="Upload Image"
            >
              <Image className="w-5 h-5 text-gray-400" />
            </button>
            <button 
              onClick={() => setShowVideoRecorder(!showVideoRecorder)}
              disabled={uploading}
              className="p-3 sm:p-2 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50 min-w-[44px] min-h-[44px] flex items-center justify-center" 
              title="Record Video"
            >
              <Video className={`w-5 h-5 ${showVideoRecorder ? 'text-red-500' : 'text-gray-400'}`} />
            </button>
            <button 
              onClick={() => setShowAudioRecorder(!showAudioRecorder)}
              disabled={uploading}
              className="p-3 sm:p-2 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50 min-w-[44px] min-h-[44px] flex items-center justify-center" 
              title="Record Audio"
            >
              <Mic className={`w-5 h-5 ${showAudioRecorder ? 'text-red-500' : 'text-gray-400'}`} />
            </button>
          </div>

          <input
            type="text"
            value={inputMessage}
            onChange={(e) => {
              setInputMessage(e.target.value)
              if (e.target.value.trim()) {
                handleTyping()
              } else {
                handleStopTyping()
              }
            }}
            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
            placeholder="Type a message..."
            className={`flex-1 rounded-lg px-4 py-2 focus:outline-none focus:border-primary ${
              theme === 'dark' 
                ? 'bg-slate-700 border border-slate-600 text-white placeholder-gray-400' 
                : 'bg-white border border-gray-300 text-gray-900 placeholder-gray-500'
            }`}
          />

          <button
            onClick={handleSendMessage}
            disabled={!inputMessage.trim()}
            className="bg-primary hover:bg-primary/80 text-white p-3 sm:p-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-w-[44px] min-h-[44px] flex items-center justify-center"
            title="Send"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* File Preview Modal */}
      {previewModal && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={() => setPreviewModal(null)}>
          <div className="max-w-4xl w-full bg-slate-800 rounded-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-white truncate">{previewModal.fileName}</h3>
                <p className="text-sm text-gray-400">{previewModal.fileType}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDownload(previewModal.fileName, previewModal.fileUrl)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors flex items-center gap-2"
                >
                  <File className="w-4 h-4" />
                  Download
                </button>
                <button
                  onClick={() => setPreviewModal(null)}
                  className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
                >
                  <X className="w-6 h-6 text-gray-400" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-4 max-h-[70vh] overflow-auto">
              {previewModal.fileType === 'image' ? (
                <img
                  src={previewModal.fileUrl.startsWith('data:') ? previewModal.fileUrl : `${window.location.protocol}//${window.location.hostname}:5000${previewModal.fileUrl}`}
                  alt={previewModal.fileName}
                  className="max-w-full mx-auto rounded"
                />
              ) : previewModal.fileType === 'video' ? (
                <video
                  controls
                  src={previewModal.fileUrl.startsWith('data:') ? previewModal.fileUrl : `${window.location.protocol}//${window.location.hostname}:5000${previewModal.fileUrl}`}
                  className="max-w-full mx-auto rounded"
                />
              ) : previewModal.fileType === 'audio' ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Mic className="w-16 h-16 text-green-400 mb-4" />
                  <audio
                    controls
                    src={previewModal.fileUrl.startsWith('data:') ? previewModal.fileUrl : `${window.location.protocol}//${window.location.hostname}:5000${previewModal.fileUrl}`}
                    className="w-full max-w-md"
                  />
                </div>
              ) : (
                // All other file types - use iframe for preview
                <div className="space-y-4">
                  {/* Try to preview using iframe (works for PDF, TXT, and some documents) */}
                  <iframe
                    src={previewModal.fileUrl.startsWith('data:') 
                      ? previewModal.fileUrl 
                      : `${window.location.protocol}//${window.location.hostname}:5000${previewModal.fileUrl}`}
                    className="w-full h-[500px] bg-white rounded"
                    title={previewModal.fileName}
                    onError={(e) => {
                      console.log('Iframe preview failed, showing fallback');
                      e.target.style.display = 'none';
                    }}
                  />
                  
                  {/* Fallback options if iframe fails */}
                  <div className="flex flex-col items-center justify-center py-8 text-center bg-slate-700/50 rounded">
                    <File className="w-12 h-12 text-blue-400 mb-3" />
                    <p className="text-gray-300 text-sm mb-1">{previewModal.fileName}</p>
                    <p className="text-xs text-gray-400 mb-4">
                      {previewModal.fileType === 'document' ? 'Document' : 'File'} • 
                      {previewModal.fileName.split('.').pop().toUpperCase()}
                    </p>
                    
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          const fullUrl = previewModal.fileUrl.startsWith('data:') 
                            ? previewModal.fileUrl 
                            : `${window.location.protocol}//${window.location.hostname}:5000${previewModal.fileUrl}`;
                          window.open(fullUrl, '_blank');
                        }}
                        className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg transition-colors flex items-center gap-2"
                      >
                        <Eye className="w-4 h-4" />
                        Open in New Tab
                      </button>
                      <button
                        onClick={() => handleDownload(previewModal.fileName, previewModal.fileUrl)}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors flex items-center gap-2"
                      >
                        <File className="w-4 h-4" />
                        Download
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Room Dashboard Modal */}
      {showDashboard && mode === 'secure' && (
        <RoomDashboard
          room={room}
          activeUsers={dashboardData.activeUsers}
          leftUsers={dashboardData.leftUsers}
          failedAttempts={dashboardData.failedAttempts}
          currentUser={user.username}
          onKickUser={handleKickUser}
          onClose={() => setShowDashboard(false)}
        />
      )}
    </div>
  )
}

export default ChatWindow
