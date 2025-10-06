import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Shield } from 'lucide-react'
import SecureLogin from '../components/auth/SecureLogin'
import RoomList from '../components/chat/RoomList'
import ChatWindow from '../components/chat/ChatWindow'
import LanguageSelector from '../components/settings/LanguageSelector'
import { initializeSocket, disconnectSocket } from '../utils/socket'

const SecureMode = () => {
  const navigate = useNavigate()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [session, setSession] = useState(null)
  const [socket, setSocket] = useState(null)
  const [currentRoom, setCurrentRoom] = useState(null)
  const [language, setLanguage] = useState('en')

  useEffect(() => {
    // Check if session exists
    const sessionToken = sessionStorage.getItem('sessionToken')
    const sessionId = sessionStorage.getItem('sessionId')
    const username = sessionStorage.getItem('username')
    if (sessionToken && sessionId && username) {
      const sessionData = { sessionId, username, sessionToken }
      setIsAuthenticated(true)
      setSession(sessionData)
      
      // Initialize socket
      const socketInstance = initializeSocket(sessionId, username, 'secure')
      setSocket(socketInstance)
    }

    return () => {
      disconnectSocket()
    }
  }, [])

  const handleLoginSuccess = (sessionData) => {
    setIsAuthenticated(true)
    setSession(sessionData)
    
    // Initialize socket
    const socketInstance = initializeSocket(sessionData.sessionId, sessionData.username, 'secure')
    setSocket(socketInstance)
  }

  const handleEndSession = async () => {
    try {
      await fetch('http://localhost:5000/api/auth/secure/end-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionToken: session.sessionToken })
      })
    } catch (error) {
      console.error('Error ending session:', error)
    } finally {
      sessionStorage.clear()
      disconnectSocket()
      setIsAuthenticated(false)
      setSession(null)
      setSocket(null)
    }
  }

  if (!isAuthenticated) {
    return <SecureLogin onLoginSuccess={handleLoginSuccess} />
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-darker via-dark to-slate-900 text-white flex flex-col">
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700 p-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-semibold flex items-center gap-2">
              <Shield className="w-5 h-5 text-secondary" />
              Secure Mode
            </span>
          </button>
          <div className="flex items-center gap-4">
            <div className="text-sm">
              <span className="text-gray-400">Session: {session?.username}</span>
              <p className="text-xs text-orange-400">🔥 Ephemeral - No data stored</p>
            </div>
            <LanguageSelector currentLanguage={language} onLanguageChange={setLanguage} />
            <button
              onClick={handleEndSession}
              className="bg-red-500/20 hover:bg-red-500/30 text-red-400 px-4 py-2 rounded-lg transition-colors"
            >
              End Session
            </button>
          </div>
        </div>
      </div>

      {/* Chat Interface */}
      <div className="flex-1 flex overflow-hidden">
        <RoomList 
          socket={socket} 
          onRoomSelect={setCurrentRoom}
          currentRoom={currentRoom}
          mode="secure"
        />
        <ChatWindow 
          socket={socket} 
          room={currentRoom}
          user={{ id: session?.sessionId, username: session?.username }}
          mode="secure"
        />
      </div>
    </div>
  )
}

export default SecureMode
