import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Send, Paperclip, Image, Video, Mic, File, Smile, Pin,
  Trash2, AlertTriangle, Eye, Users, Settings, Clock, X, Upload
} from 'lucide-react'
import AudioRecorder from './AudioRecorder'
import MessageTimer from './MessageTimer'
import { uploadFile, formatFileSize, getFileIcon } from '../../utils/fileUpload'

const ChatWindow = ({ socket, room, user, mode }) => {
  const [messages, setMessages] = useState([])
  const [inputMessage, setInputMessage] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [typingUsers, setTypingUsers] = useState([])
  const [onlineUsers, setOnlineUsers] = useState([])
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showAudioRecorder, setShowAudioRecorder] = useState(false)
  const [selfDestructTimer, setSelfDestructTimer] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const messagesEndRef = useRef(null)
  const typingTimeoutRef = useRef(null)
  const fileInputRef = useRef(null)

  const emojis = ['😀', '😂', '❤️', '👍', '🎉', '🔥', '💯', '👏', '🙌', '✨']

  useEffect(() => {
    if (!socket || !room) return

    // Join room
    socket.emit('room:join', { roomId: room.id, password: '' }, ({ success, messages: roomMessages }) => {
      if (success) {
        setMessages(roomMessages || [])
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

    // Online users
    socket.on('users:online', (users) => {
      setOnlineUsers(users)
    })

    // Screenshot alert
    socket.on('screenshot:alert', ({ username, timestamp }) => {
      alert(`⚠️ ${username} took a screenshot!`)
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
      socket.off('screenshot:alert')
      socket.off('user:joined')
      socket.off('user:left')
    }
  }, [socket, room])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const handleSendMessage = () => {
    if (!inputMessage.trim()) return

    socket.emit('message:send', {
      roomId: room.id,
      content: inputMessage,
      type: 'text'
    }, ({ success }) => {
      if (success) {
        setInputMessage('')
        handleStopTyping()
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

    try {
      setUploading(true)
      setUploadProgress(0)

      const result = await uploadFile(file, mode)
      
      setUploadProgress(100)

      // Send message with file
      socket.emit('message:send', {
        roomId: room.id,
        content: `Sent ${result.file.category}: ${result.file.originalName}`,
        type: result.file.category,
        fileUrl: result.file.url,
        fileName: result.file.originalName
      }, ({ success }) => {
        if (success) {
          setUploading(false)
          setUploadProgress(0)
          event.target.value = '' // Reset input
        }
      })
    } catch (error) {
      console.error('File upload error:', error)
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

  const handleMessageExpire = (messageId) => {
    setMessages(prev => prev.filter(m => m.id !== messageId))
  }

  const handleSetSelfDestruct = (minutes) => {
    setSelfDestructTimer(minutes)
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
    <div className="flex-1 flex flex-col bg-slate-900">
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
          {messages.map((message) => (
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
                        src={`http://localhost:5000${message.fileUrl}`} 
                        alt={message.fileName}
                        className="max-w-sm rounded-lg mb-2"
                      />
                      <p className="text-sm">{message.content}</p>
                    </div>
                  ) : message.type === 'video' && message.fileUrl ? (
                    <div>
                      <video 
                        controls 
                        src={`http://localhost:5000${message.fileUrl}`}
                        className="max-w-sm rounded-lg mb-2"
                      />
                      <p className="text-sm">{message.content}</p>
                    </div>
                  ) : message.type === 'audio' && message.fileUrl ? (
                    <div>
                      <audio controls src={message.fileUrl} className="max-w-full mb-2" />
                      <p className="text-sm">{message.content}</p>
                    </div>
                  ) : message.type === 'document' && message.fileUrl ? (
                    <div className="flex items-center gap-2 bg-slate-700/50 p-2 rounded">
                      <File className="w-6 h-6" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">{message.fileName}</p>
                        <a 
                          href={`http://localhost:5000${message.fileUrl}`}
                          download={message.fileName}
                          className="text-xs text-blue-400 hover:underline"
                        >
                          Download
                        </a>
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
          ))}
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
              onClick={() => document.getElementById('video-input')?.click()}
              disabled={uploading}
              className="p-2 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50" 
              title="Send Video"
            >
              <Video className="w-5 h-5 text-gray-400" />
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
              handleTyping()
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
