import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import NormalLogin from '../components/auth/NormalLogin'
import RoomList from '../components/chat/RoomList'
import ChatWindow from '../components/chat/ChatWindow'
import LanguageSelector from '../components/settings/LanguageSelector'
import { initializeSocket, disconnectSocket } from '../utils/socket'

const NormalMode = () => {
  const navigate = useNavigate()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [user, setUser] = useState(null)
  const [socket, setSocket] = useState(null)
  const [currentRoom, setCurrentRoom] = useState(null)
  const [language, setLanguage] = useState('en')

  useEffect(() => {
    // Check if user is already logged in
    const token = localStorage.getItem('authToken')
    const savedUser = localStorage.getItem('user')
    if (token && savedUser) {
      const userData = JSON.parse(savedUser)
      setIsAuthenticated(true)
      setUser(userData)
      
      // Initialize socket
      const socketInstance = initializeSocket(userData.id, userData.username, 'normal')
      setSocket(socketInstance)
    }

    return () => {
      disconnectSocket()
    }
  }, [])

  const handleLoginSuccess = (userData, token) => {
    setIsAuthenticated(true)
    setUser(userData)
    
    // Initialize socket
    const socketInstance = initializeSocket(userData.id, userData.username, 'normal')
    setSocket(socketInstance)
  }

  const handleLogout = () => {
    localStorage.removeItem('authToken')
    localStorage.removeItem('user')
    disconnectSocket()
    setIsAuthenticated(false)
    setUser(null)
    setSocket(null)
  }

  if (!isAuthenticated) {
    return <NormalLogin onLoginSuccess={handleLoginSuccess} />
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
            <span className="font-semibold">Normal Mode</span>
          </button>
          <div className="flex items-center gap-4">
            <span className="text-gray-400">Welcome, {user?.username}</span>
            <LanguageSelector currentLanguage={language} onLanguageChange={setLanguage} />
            <button
              onClick={handleLogout}
              className="bg-red-500/20 hover:bg-red-500/30 text-red-400 px-4 py-2 rounded-lg transition-colors"
            >
              Logout
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
          mode="normal"
        />
        <ChatWindow 
          socket={socket} 
          room={currentRoom}
          user={user}
          mode="normal"
        />
      </div>
    </div>
  )
}

export default NormalMode
