import React from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import NormalMode from './pages/NormalMode'
import SecureMode from './pages/SecureMode'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/normal" element={<NormalMode />} />
        <Route path="/secure" element={<SecureMode />} />
      </Routes>
    </Router>
  )
}

export default App
