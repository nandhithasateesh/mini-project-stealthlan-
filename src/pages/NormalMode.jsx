import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Moon, Sun, BarChart3 } from 'lucide-react'
import NormalLogin from '../components/auth/NormalLogin'
import NormalRegister from '../components/auth/NormalRegister'
import RoomList from '../components/chat/RoomList'
import ChatWindow from '../components/chat/ChatWindow'
import RoomDashboard from '../components/dashboard/RoomDashboard'
import { initializeSocket, disconnectSocket } from '../utils/socket'

const NormalMode = () => {
  const navigate = useNavigate()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [showRegister, setShowRegister] = useState(false)
  const [user, setUser] = useState(null)
  const [socket, setSocket] = useState(null)
  const [currentRoom, setCurrentRoom] = useState(null)
  const [showDashboard, setShowDashboard] = useState(false)
  const [theme, setTheme] = useState('dark')

  // Apply theme changes
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [theme])

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

  const handleRegisterSuccess = (userData, token) => {
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
    if (showRegister) {
      return (
        <NormalRegister 
          onRegisterSuccess={handleRegisterSuccess}
          onSwitchToLogin={() => setShowRegister(false)}
        />
      )
    }
    return (
      <NormalLogin 
        onLoginSuccess={handleLoginSuccess}
        onSwitchToRegister={() => setShowRegister(true)}
      />
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-darker via-dark to-slate-900 dark:from-darker dark:via-dark dark:to-slate-900 bg-white dark:bg-slate-900 text-gray-900 dark:text-white flex flex-col">
      {/* Header */}
      <div className="bg-gray-100 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 p-4">
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
            <button
              onClick={() => {
                setShowDashboard(!showDashboard);
                setCurrentRoom(null);
              }}
              className={`p-2 rounded-lg transition-colors border ${
                showDashboard 
                  ? 'bg-primary border-primary text-white' 
                  : 'bg-slate-700 hover:bg-slate-600 border-slate-600'
              }`}
              title="Dashboard"
            >
              <BarChart3 className="w-5 h-5" />
            </button>
            <button
              onClick={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
              className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors border border-slate-600"
              title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
            >
              {theme === 'dark' ? (
                <Sun className="w-5 h-5 text-yellow-400" />
              ) : (
                <Moon className="w-5 h-5 text-slate-300" />
              )}
            </button>
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
          onRoomSelect={(room) => {
            setCurrentRoom(room);
            setShowDashboard(false);
          }}
          currentRoom={currentRoom}
          mode="normal"
        />
        {showDashboard ? (
          <RoomDashboard socket={socket} user={user} />
        ) : (
          <ChatWindow 
            socket={socket} 
            room={currentRoom}
            user={user}
            mode="normal"
          />
        )}
      </div>
    </div>
  )
}

export default NormalMode
