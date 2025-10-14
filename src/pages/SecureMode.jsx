import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield, Moon, Sun, LogOut, Clock, Plus } from 'lucide-react'
import SecureRoomSelection from '../components/chat/SecureRoomSelection'
import ChatWindow from '../components/chat/ChatWindow'
import { initializeSocket, disconnectSocket } from '../utils/socket'

const SecureMode = () => {
  const navigate = useNavigate()
  const [socket, setSocket] = useState(null)
  const [currentRoom, setCurrentRoom] = useState(null)
  const [username, setUsername] = useState(null)
  const [theme, setTheme] = useState(() => {
    // Get initial theme from localStorage or default to dark
    return localStorage.getItem('theme') || 'dark'
  })
  const [inRoom, setInRoom] = useState(false)
  const [typingUsers, setTypingUsers] = useState([])
  const [recordingUsers, setRecordingUsers] = useState([])
  const [timeRemaining, setTimeRemaining] = useState(null)

  // Apply theme changes
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
      root.classList.remove('light')
    } else {
      root.classList.add('light')
      root.classList.remove('dark')
    }
    localStorage.setItem('theme', theme)
  }, [theme])

  // Initialize socket on mount
  useEffect(() => {
    const socketInstance = initializeSocket(Date.now().toString(), 'SecureUser', 'secure')
    setSocket(socketInstance)

    return () => {
      disconnectSocket()
    }
  }, [])

  // Listen for typing and recording indicators
  useEffect(() => {
    if (!socket || !currentRoom) return

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

    return () => {
      socket.off('user:typing')
      socket.off('user:stopped-typing')
      socket.off('user:recording')
      socket.off('user:stopped-recording')
    }
  }, [socket, currentRoom])

  // Handle room expiration
  const handleRoomExpired = useCallback(() => {
    alert('⏰ Room has expired!\n\nThe time limit has been reached and the room has been automatically deleted.')
    setCurrentRoom(null)
    setInRoom(false)
    setTimeRemaining(null)
  }, [])

  const handleExtendTime = useCallback((minutes) => {
    if (!socket || !currentRoom) return

    socket.emit('secure-room:extend-time', {
      roomId: currentRoom.id,
      minutesToAdd: minutes
    }, (response) => {
      if (response && response.success) {
        // Time extended successfully - server will broadcast to all users
        console.log(`[EXTEND-TIME] Room extended by ${minutes} minutes`)
      } else {
        alert(`Failed to extend time: ${response?.error || 'Unknown error'}`)
      }
    })
  }, [socket, currentRoom])

  // Room expiration timer
  useEffect(() => {
    if (!currentRoom || !currentRoom.expiresAt) return

    const updateTimer = () => {
      const now = new Date().getTime()
      const expiresAt = new Date(currentRoom.expiresAt).getTime()
      const remaining = expiresAt - now

      if (remaining <= 0) {
        setTimeRemaining('00:00:00')
        // Room has expired on client side too
        handleRoomExpired()
        return
      }

      const hours = Math.floor(remaining / (1000 * 60 * 60))
      const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60))
      const seconds = Math.floor((remaining % (1000 * 60)) / 1000)

      const formatted = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      setTimeRemaining(formatted)
    }

    updateTimer()
    const interval = setInterval(updateTimer, 1000)

    return () => clearInterval(interval)
  }, [currentRoom, handleRoomExpired])

  // Listen for room expiration from server
  useEffect(() => {
    if (!socket || !currentRoom) return

    socket.on('room:expired', ({ roomId }) => {
      if (roomId === currentRoom.id) {
        handleRoomExpired()
      }
    })

    socket.on('room:time-extended', ({ roomId, newExpiresAt, minutesAdded, extendedBy }) => {
      if (roomId === currentRoom.id) {
        setCurrentRoom(prev => ({ ...prev, expiresAt: newExpiresAt }))
        // Show notification to all users
        if (extendedBy !== username) {
          alert(`⏱️ Room time extended by ${minutesAdded} minute(s) by ${extendedBy}`)
        }
      }
    })

    socket.on('room:deleted-by-host', ({ roomId, hostName, message }) => {
      if (roomId === currentRoom.id) {
        alert(`🚪 Room Deleted!\n\nThe host "${hostName}" has left and the room has been deleted.\n\nYou will be returned to the secure mode landing page.`)
        setCurrentRoom(null)
        setInRoom(false)
        setTimeRemaining(null)
      }
    })

    return () => {
      socket.off('room:expired')
      socket.off('room:time-extended')
      socket.off('room:deleted-by-host')
    }
  }, [socket, currentRoom, handleRoomExpired, username])

  const handleRoomJoined = (room, userName) => {
    setCurrentRoom(room)
    setUsername(userName)
    setInRoom(true)

    // Emit user:join event
    if (socket) {
      socket.emit('user:join', {
        userId: userName,
        username: userName,
        mode: 'secure'
      })
    }
  }

  const handleLeaveRoom = () => {
    if (socket && currentRoom) {
      socket.emit('room:leave', { roomId: currentRoom.id })
    }
    setCurrentRoom(null)
    setUsername(null)
    setInRoom(false)
  }


  if (!inRoom) {
    return (
      <div className={theme === 'dark' ? 'dark' : ''}>
        <SecureRoomSelection socket={socket} onRoomJoined={handleRoomJoined} theme={theme} setTheme={setTheme} />
      </div>
    )
  }

  return (
    <div className={`min-h-screen flex flex-col ${theme === 'dark' ? 'dark bg-gradient-to-br from-darker via-dark to-slate-900 text-white' : 'bg-gradient-to-br from-gray-50 via-blue-50 to-gray-50 text-gray-900'}`}>
      {/* Header */}
      <div className={`border-b p-4 ${theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-purple-400" />
              <span className={`font-bold text-lg ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Secure Mode</span>
            </div>
            <div className="text-sm bg-purple-500/20 px-3 py-1 rounded-full border border-purple-500/30">
              <span className="text-purple-300">Room: {currentRoom?.id}</span>
            </div>

            {/* Room Expiration Timer */}
            {timeRemaining && (
              <div className="flex items-center gap-2">
                <div className="text-sm bg-orange-500/20 px-3 py-1 rounded-full border border-orange-500/30 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-orange-400" />
                  <span className={`font-mono font-bold ${
                    timeRemaining.startsWith('00:0') ? 'text-red-400 animate-pulse' : 'text-orange-300'
                  }`}>
                    {timeRemaining}
                  </span>
                </div>
                
                {/* Extend Time Buttons (Only for room creator) */}
                {currentRoom?.createdBy === username && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleExtendTime(1)}
                      className="text-xs bg-green-500/20 hover:bg-green-500/30 text-green-400 px-2 py-1 rounded border border-green-500/30 transition-colors flex items-center gap-1"
                      title="Extend by 1 minute"
                    >
                      <Plus className="w-3 h-3" />
                      1m
                    </button>
                    <button
                      onClick={() => handleExtendTime(2)}
                      className="text-xs bg-green-500/20 hover:bg-green-500/30 text-green-400 px-2 py-1 rounded border border-green-500/30 transition-colors flex items-center gap-1"
                      title="Extend by 2 minutes"
                    >
                      <Plus className="w-3 h-3" />
                      2m
                    </button>
                    <button
                      onClick={() => handleExtendTime(5)}
                      className="text-xs bg-green-500/20 hover:bg-green-500/30 text-green-400 px-2 py-1 rounded border border-green-500/30 transition-colors flex items-center gap-1"
                      title="Extend by 5 minutes"
                    >
                      <Plus className="w-3 h-3" />
                      5m
                    </button>
                  </div>
                )}
              </div>
            )}
            
            {/* Typing Indicator */}
            {typingUsers.length > 0 && (
              <div className="text-xs bg-blue-500/20 px-3 py-1 rounded-full border border-blue-500/30 flex items-center gap-2 animate-pulse">
                <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                <span className="text-blue-300">
                  {typingUsers.map(u => u.username).join(', ')} typing...
                </span>
              </div>
            )}

            {/* Recording Indicator */}
            {recordingUsers.length > 0 && (
              <div className="text-xs bg-red-500/20 px-3 py-1 rounded-full border border-red-500/30 flex items-center gap-2">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                <span className="text-red-300">
                  {recordingUsers.map(u => `${u.username} (${u.type})`).join(', ')}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="text-sm">
              <span className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>User: {username}</span>
              <p className="text-xs text-orange-400">🔥 Ephemeral - End-to-end encrypted</p>
            </div>
            <button
              onClick={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
              className={`p-2 rounded-lg transition-colors border ${
                theme === 'dark' 
                  ? 'bg-slate-700 hover:bg-slate-600 border-slate-600' 
                  : 'bg-gray-200 hover:bg-gray-300 border-gray-300'
              }`}
              title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
            >
              {theme === 'dark' ? (
                <Sun className="w-5 h-5 text-yellow-400" />
              ) : (
                <Moon className="w-5 h-5 text-slate-300" />
              )}
            </button>
            <button
              onClick={handleLeaveRoom}
              className="bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Leave Room
            </button>
          </div>
        </div>
      </div>

      {/* Chat Interface */}
      <div className="flex-1 flex overflow-hidden">
        <ChatWindow 
          socket={socket} 
          room={currentRoom}
          user={{ id: username, username: username }}
          mode="secure"
          theme={theme}
        />
      </div>
    </div>
  )
}

export default SecureMode
