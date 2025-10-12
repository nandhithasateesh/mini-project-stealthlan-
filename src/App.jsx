import React from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import NormalMode from './pages/NormalMode'
import SecureMode from './pages/SecureMode'
import AadhaarRegister from './components/auth/AadhaarRegister'
import { useNavigate } from 'react-router-dom'

// Wrapper component for Aadhaar registration
const AadhaarRegisterPage = () => {
  const navigate = useNavigate()
  
  const handleRegisterSuccess = (user, token) => {
    // Navigate to normal mode after successful registration
    navigate('/normal')
  }
  
  const handleBackToLogin = () => {
    navigate('/normal')
  }
  
  return (
    <AadhaarRegister 
      onRegisterSuccess={handleRegisterSuccess}
      onBackToLogin={handleBackToLogin}
    />
  )
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/normal" element={<NormalMode />} />
        <Route path="/secure" element={<SecureMode />} />
        <Route path="/register-aadhaar" element={<AadhaarRegisterPage />} />
      </Routes>
    </Router>
  )
}

export default App
