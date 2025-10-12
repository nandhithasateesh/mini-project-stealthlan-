import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Send, Paperclip, Image, Video, Mic, File, Smile, Pin,
  Trash2, AlertTriangle, Eye, Users, Settings, Clock, X, Upload
} from 'lucide-react'
import AudioRecorder from './AudioRecorder'
import VideoRecorder from './VideoRecorder'
import MessageTimer from './MessageTimer'
import { uploadFile, formatFileSize, getFileIcon } from '../../utils/fileUpload'
import { detectScreenshot } from '../../utils/encryption'

const ChatWindow = ({ socket, room, user, mode }) => {
  const [messages, setMessages] = useState([])
  const [inputMessage, setInputMessage] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [typingUsers, setTypingUsers] = useState([])
  const [onlineUsers, setOnlineUsers] = useState([])
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showAudioRecorder, setShowAudioRecorder] = useState(false)
  const [showVideoRecorder, setShowVideoRecorder] = useState(false)
  const [selfDestructTimer, setSelfDestructTimer] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [screenBlocked, setScreenBlocked] = useState(false)
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
    socket.on('user:typing', ({ username }) => {
      setTypingUsers(prev => [...new Set([...prev, username])])
    })

    socket.on('user:stopped-typing', ({ userId }) => {
      setTypingUsers(prev => prev.filter(u => u !== userId))
    })

    // Online users (global - kept for compatibility)
    socket.on('users:online', (users) => {
      setOnlineUsers(users)
    })

    // Room-specific online users
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
    socket.on('user:joined', ({ username }) => {
      console.log(`${username} joined the room`)
    })

    socket.on('user:left', ({ username }) => {
      console.log(`${username} left the room`)
    })

    return () => {
      socket.emit('room:leave', { roomId: room.id })
      socket.off('message:new')
      socket.off('message:deleted')
      socket.off('message:reaction')
      socket.off('user:typing')
      socket.off('user:stopped-typing')
      socket.off('users:online')
      socket.off('room:online-users')
      socket.off('screenshot:alert')
      socket.off('file:download-alert')
      socket.off('user:joined')
      socket.off('user:left')
    }
  }, [socket, room])

  // Screenshot detection
  useEffect(() => {
    if (!socket || !room) return

    const handleScreenshot = () => {
      console.log('[Screenshot] Detected screenshot attempt!')
      
      // Black out screen immediately
      setScreenBlocked(true)
      
      // Notify server
      socket.emit('screenshot:taken', { roomId: room.id })
      
      // Remove black screen after 1 second
      setTimeout(() => {
        setScreenBlocked(false)
      }, 1000)
    }

    // Set up screenshot detection
    const cleanup = detectScreenshot(handleScreenshot)

    return cleanup
  }, [socket, room])

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

  const handleFileSelect = async (event, fileType = 'file') => {
    const file = event.target.files[0]
    if (!file) return

    console.log('[FileUpload] Starting upload:', file.name, 'Type:', file.type, 'Size:', file.size);

    try {
      setUploading(true)
      setUploadProgress(0)

      console.log('[FileUpload] Uploading to server...');
      const result = await uploadFile(file, mode)
      console.log('[FileUpload] Upload successful:', result);
      
      setUploadProgress(100)

      // Send message with file
      console.log('[FileUpload] Sending message with file...');
      socket.emit('message:send', {
        roomId: room.id,
        content: `Sent ${result.file.category}: ${result.file.originalName}`,
        type: result.file.category,
        fileUrl: result.file.url,
        fileName: result.file.originalName
      }, ({ success, error }) => {
        if (success) {
          console.log('[FileUpload] Message sent successfully');
          setUploading(false)
          setUploadProgress(0)
          event.target.value = '' // Reset input
        } else {
          console.error('[FileUpload] Failed to send message:', error);
          alert('Failed to send file message: ' + (error || 'Unknown error'));
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

      // Create a File object from the blob
      const videoFile = new File([videoBlob], `video-${Date.now()}.webm`, { type: 'video/webm' })
      
      const result = await uploadFile(videoFile, mode)
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

  const formatTime = (timestamp) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  }

  if (!room) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-900">
        <div className="text-center text-gray-400">
          <Users className="w-16 h-16 mx-auto mb-4 opacity-50" />
          <p className="text-lg">Select a room to start chatting</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col bg-slate-900 relative">
      {/* Black Screen Overlay (Screenshot Protection) */}
      {screenBlocked && (
        <div className="absolute inset-0 bg-black z-50 flex items-center justify-center">
          <div className="text-white text-2xl font-bold animate-pulse">
            🚫 Screenshot Blocked
          </div>
        </div>
      )}

      {/* Room Header */}
      <div className="bg-slate-800 border-b border-slate-700 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">{room.name}</h2>
            <p className="text-sm text-gray-400">
              {room.members?.length || 0} members
              {room.burnAfterReading && <span className="ml-2">🔥 Burn After Reading</span>}
              {room.timeLimit && <span className="ml-2">⏱️ {room.timeLimit}min limit</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-sm text-gray-400">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span>{onlineUsers.length} online</span>
            </div>
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
                <div className={`max-w-md ${message.userId === user.id ? 'items-end' : 'items-start'} flex flex-col`}>
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
                  {message.type === 'image' && message.fileUrl ? (
                    <div>
                      <img 
                        src={message.fileUrl.startsWith('data:') ? message.fileUrl : `${window.location.protocol}//${window.location.hostname}:5000${message.fileUrl}`} 
                        alt={message.fileName}
                        className="max-w-sm rounded-lg mb-2 cursor-pointer"
                        onClick={() => {
                          if (message.fileUrl.startsWith('data:')) {
                            // Base64 image - open in new tab
                            const win = window.open();
                            win.document.write(`<img src="${message.fileUrl}" />`);
                          } else {
                            window.open(`${window.location.protocol}//${window.location.hostname}:5000${message.fileUrl}`, '_blank');
                          }
                        }}
                        onError={(e) => {
                          console.error('Image load error:', message.fileUrl);
                          e.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><text x="50%" y="50%" text-anchor="middle" fill="gray">Image not found</text></svg>';
                        }}
                      />
                      <div className="flex items-center gap-2">
                        <p className="text-sm flex-1">{message.content}</p>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(message.fileName, message.fileUrl);
                          }}
                          className="text-xs text-blue-400 hover:underline flex items-center gap-1"
                        >
                          <File className="w-3 h-3" />
                          Download
                        </button>
                      </div>
                    </div>
                  ) : message.type === 'video' && message.fileUrl ? (
                    <div>
                      <video 
                        controls 
                        src={message.fileUrl.startsWith('data:') ? message.fileUrl : `${window.location.protocol}//${window.location.hostname}:5000${message.fileUrl}`}
                        className="max-w-sm rounded-lg mb-2"
                      />
                      <div className="flex items-center gap-2">
                        <p className="text-sm flex-1">{message.content}</p>
                        <button 
                          onClick={() => handleDownload(message.fileName, message.fileUrl)}
                          className="text-xs text-blue-400 hover:underline flex items-center gap-1"
                        >
                          <File className="w-3 h-3" />
                          Download
                        </button>
                      </div>
                    </div>
                  ) : message.type === 'audio' && message.fileUrl ? (
                    <div>
                      <audio controls src={message.fileUrl} className="max-w-full mb-2" />
                      <div className="flex items-center gap-2">
                        <p className="text-sm flex-1">{message.content}</p>
                        <button 
                          onClick={() => handleDownload(message.fileName, message.fileUrl)}
                          className="text-xs text-blue-400 hover:underline flex items-center gap-1"
                        >
                          <File className="w-3 h-3" />
                          Download
                        </button>
                      </div>
                    </div>
                  ) : message.type === 'document' && message.fileUrl ? (
                    <div className="bg-slate-700/50 p-3 rounded">
                      <div className="flex items-center gap-3 mb-2">
                        <File className="w-8 h-8 text-blue-400" />
                        <div className="flex-1">
                          <p className="text-sm font-medium">{message.fileName}</p>
                          <p className="text-xs text-gray-400">{message.content}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <a 
                          href={`${window.location.protocol}//${window.location.hostname}:5000${message.fileUrl}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 text-center text-xs bg-slate-600 hover:bg-slate-500 text-white px-3 py-2 rounded transition-colors"
                        >
                          <Eye className="w-3 h-3 inline mr-1" />
                          Preview
                        </a>
                        <button 
                          onClick={() => handleDownload(message.fileName, message.fileUrl)}
                          className="flex-1 text-center text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded transition-colors"
                        >
                          <File className="w-3 h-3 inline mr-1" />
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
                      onClick={() => setShowEmojiPicker(message.id)}
                      className="p-1 hover:bg-slate-600 rounded"
                      title="React"
                    >
                      <Smile className="w-4 h-4 text-gray-300" />
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
            {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="bg-slate-800 border-t border-slate-700 p-4 relative">
        {mode === 'secure' && room.burnAfterReading && (
          <div className="mb-2 flex items-center gap-2 text-xs text-orange-400">
            <AlertTriangle className="w-4 h-4" />
            <span>Messages will self-destruct after viewing</span>
          </div>
        )}

        {/* Upload Progress */}
        {uploading && (
          <div className="mb-2 bg-slate-700 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-300">Uploading file...</span>
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
          />
        )}

        {/* Video Recorder */}
        {showVideoRecorder && (
          <VideoRecorder
            onSendVideo={handleSendVideo}
            onCancel={() => setShowVideoRecorder(false)}
            mode={mode}
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
          <div className="flex gap-1">
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="p-2 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50" 
              title="Attach File"
            >
              <Paperclip className="w-5 h-5 text-gray-400" />
            </button>
            <button 
              onClick={() => document.getElementById('image-input')?.click()}
              disabled={uploading}
              className="p-2 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50" 
              title="Send Image"
            >
              <Image className="w-5 h-5 text-gray-400" />
            </button>
            <button 
              onClick={() => setShowVideoRecorder(!showVideoRecorder)}
              disabled={uploading}
              className="p-2 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50" 
              title="Record Video"
            >
              <Video className={`w-5 h-5 ${showVideoRecorder ? 'text-red-500' : 'text-gray-400'}`} />
            </button>
            <button 
              onClick={() => setShowAudioRecorder(!showAudioRecorder)}
              disabled={uploading}
              className="p-2 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50" 
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
            className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-primary"
          />

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleSendMessage}
            disabled={!inputMessage.trim()}
            className="p-2 bg-primary rounded-lg hover:bg-primary/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-5 h-5 text-white" />
          </motion.button>
        </div>
      </div>
    </div>
  )
}

export default ChatWindow
