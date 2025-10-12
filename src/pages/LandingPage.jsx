import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Shield, MessageSquare, Wifi, Lock, Zap, Eye, EyeOff, Settings, HelpCircle, Moon, Sun } from 'lucide-react'
import SettingsDashboard from '../components/settings/SettingsDashboard'
import HelpPanel from '../components/help/HelpPanel'

const LandingPage = () => {
  const navigate = useNavigate()
  const [hoveredCard, setHoveredCard] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [settings, setSettings] = useState({
    language: 'en',
    theme: 'dark'
  })

  // Apply theme changes to document
  useEffect(() => {
    if (settings.theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [settings.theme])

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2,
        delayChildren: 0.3
      }
    }
  }

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        type: 'spring',
        stiffness: 100
      }
    }
  }

  const floatingVariants = {
    animate: {
      y: [0, -20, 0],
      transition: {
        duration: 4,
        repeat: Infinity,
        ease: 'easeInOut'
      }
    }
  }

  const pulseVariants = {
    animate: {
      scale: [1, 1.05, 1],
      opacity: [0.5, 0.8, 0.5],
      transition: {
        duration: 3,
        repeat: Infinity,
        ease: 'easeInOut'
      }
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-darker via-dark to-slate-900 dark:from-darker dark:via-dark dark:to-slate-900 from-blue-50 via-purple-50 to-pink-50 text-gray-900 dark:text-white overflow-hidden relative">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          variants={pulseVariants}
          animate="animate"
          className="absolute top-20 left-10 w-72 h-72 bg-primary rounded-full filter blur-3xl"
        />
        <motion.div
          variants={pulseVariants}
          animate="animate"
          className="absolute bottom-20 right-10 w-96 h-96 bg-secondary rounded-full filter blur-3xl"
          style={{ animationDelay: '1.5s' }}
        />
        <motion.div
          variants={pulseVariants}
          animate="animate"
          className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-purple-600 rounded-full filter blur-3xl"
          style={{ animationDelay: '3s' }}
        />
      </div>

      {/* Network Grid Animation */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0" style={{
          backgroundImage: `linear-gradient(rgba(99, 102, 241, 0.3) 1px, transparent 1px),
                           linear-gradient(90deg, rgba(99, 102, 241, 0.3) 1px, transparent 1px)`,
          backgroundSize: '50px 50px'
        }} />
      </div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="relative z-10 container mx-auto px-4 py-12 min-h-screen flex flex-col items-center justify-center"
      >
        {/* Header Controls - Top Right */}
        <div className="absolute top-8 right-8 flex items-center gap-3">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setSettings(prev => ({ ...prev, theme: prev.theme === 'dark' ? 'light' : 'dark' }))}
            className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors border border-slate-600"
            title={`Switch to ${settings.theme === 'dark' ? 'Light' : 'Dark'} Mode`}
          >
            {settings.theme === 'dark' ? (
              <Sun className="w-5 h-5 text-yellow-400" />
            ) : (
              <Moon className="w-5 h-5 text-slate-300" />
            )}
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowHelp(true)}
            className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors border border-slate-600"
            title="Help & Guide"
          >
            <HelpCircle className="w-5 h-5 text-gray-400" />
          </motion.button>
          
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowSettings(true)}
            className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors border border-slate-600"
            title="Settings"
          >
            <Settings className="w-5 h-5 text-gray-400" />
          </motion.button>
        </div>

        {/* Settings Dashboard */}
        <SettingsDashboard
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          mode="normal"
          settings={settings}
          onSettingsChange={setSettings}
        />

        {/* Help Panel */}
        <HelpPanel
          isOpen={showHelp}
          onClose={() => setShowHelp(false)}
        />

        {/* Logo and Title Section */}
        <motion.div variants={itemVariants} className="text-center mb-16">
          <motion.div
            variants={floatingVariants}
            animate="animate"
            className="inline-block mb-6"
          >
            <div className="relative">
              <Shield className="w-24 h-24 text-primary mx-auto animate-glow" />
              <Wifi className="w-12 h-12 text-secondary absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
            </div>
          </motion.div>

          <motion.h1
            variants={itemVariants}
            className="text-6xl md:text-7xl font-bold mb-4 text-gradient"
          >
            StealthLAN
          </motion.h1>

          <motion.p
            variants={itemVariants}
            className="text-xl md:text-2xl text-gray-300 mb-2"
          >
            AI-Powered Offline Chat System
          </motion.p>

          <motion.p
            variants={itemVariants}
            className="text-md text-gray-400 max-w-2xl mx-auto"
          >
            Secure, private, and intelligent communication over your local network.
            No internet required. Your data, your control.
          </motion.p>
        </motion.div>

        {/* Feature Highlights */}
        <motion.div
          variants={itemVariants}
          className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16 max-w-4xl w-full"
        >
          {[
            { icon: Zap, title: 'Lightning Fast', desc: 'Real-time messaging on LAN' },
            { icon: Lock, title: 'Ultra Secure', desc: 'End-to-end encryption' },
            { icon: MessageSquare, title: 'AI-Powered', desc: 'Smart chat assistance' }
          ].map((feature, idx) => (
            <motion.div
              key={idx}
              whileHover={{ scale: 1.05, y: -5 }}
              className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6 text-center"
            >
              <feature.icon className="w-12 h-12 text-primary mx-auto mb-3" />
              <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
              <p className="text-sm text-gray-400">{feature.desc}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* Mode Selection Cards */}
        <motion.div
          variants={itemVariants}
          className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl w-full"
        >
          {/* Normal Mode Card */}
          <motion.div
            whileHover={{ scale: 1.03 }}
            onHoverStart={() => setHoveredCard('normal')}
            onHoverEnd={() => setHoveredCard(null)}
            className="relative group cursor-pointer"
            onClick={() => navigate('/normal')}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-primary rounded-2xl opacity-0 group-hover:opacity-20 transition-opacity duration-300 blur-xl" />
            <div className="relative bg-slate-800/70 backdrop-blur-md border-2 border-slate-700 group-hover:border-primary rounded-2xl p-8 transition-all duration-300">
              <div className="flex items-center justify-between mb-4">
                <MessageSquare className="w-16 h-16 text-primary" />
                <Eye className="w-8 h-8 text-gray-400" />
              </div>

              <h2 className="text-3xl font-bold mb-3 text-white">Normal Mode</h2>

              <p className="text-gray-300 mb-6">
                Perfect for casual conversations and office communication. All messages,
                rooms, and preferences are stored locally in JSON format.
              </p>

              <ul className="space-y-2 mb-6">
                {[
                  'Persistent chat history',
                  'Create & manage rooms',
                  'Customizable preferences',
                  'File sharing & storage',
                  'AI chat assistance'
                ].map((feature, idx) => (
                  <li key={idx} className="flex items-center text-sm text-gray-400">
                    <div className="w-1.5 h-1.5 bg-primary rounded-full mr-2" />
                    {feature}
                  </li>
                ))}
              </ul>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="w-full bg-gradient-to-r from-primary to-blue-600 text-white font-semibold py-3 px-6 rounded-lg shadow-lg hover:shadow-primary/50 transition-all duration-300"
              >
                Enter Normal Mode
              </motion.button>
            </div>
          </motion.div>

          {/* Secure Mode Card */}
          <motion.div
            whileHover={{ scale: 1.03 }}
            onHoverStart={() => setHoveredCard('secure')}
            onHoverEnd={() => setHoveredCard(null)}
            className="relative group cursor-pointer"
            onClick={() => navigate('/secure')}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500 to-secondary rounded-2xl opacity-0 group-hover:opacity-20 transition-opacity duration-300 blur-xl" />
            <div className="relative bg-slate-800/70 backdrop-blur-md border-2 border-slate-700 group-hover:border-secondary rounded-2xl p-8 transition-all duration-300">
              <div className="flex items-center justify-between mb-4">
                <Shield className="w-16 h-16 text-secondary" />
                <EyeOff className="w-8 h-8 text-gray-400" />
              </div>

              <h2 className="text-3xl font-bold mb-3 text-white">Secure Mode</h2>

              <p className="text-gray-300 mb-6">
                Maximum privacy for sensitive communications. Messages and files
                vanish after viewing. Nothing is stored permanently.
              </p>

              <ul className="space-y-2 mb-6">
                {[
                  'Ephemeral messages',
                  'Self-destructing files',
                  'No storage or logs',
                  'View-once media',
                  'Anonymous sessions'
                ].map((feature, idx) => (
                  <li key={idx} className="flex items-center text-sm text-gray-400">
                    <div className="w-1.5 h-1.5 bg-secondary rounded-full mr-2" />
                    {feature}
                  </li>
                ))}
              </ul>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="w-full bg-gradient-to-r from-secondary to-purple-600 text-white font-semibold py-3 px-6 rounded-lg shadow-lg hover:shadow-secondary/50 transition-all duration-300"
              >
                Enter Secure Mode
              </motion.button>
            </div>
          </motion.div>
        </motion.div>

        {/* Footer */}
        <motion.div
          variants={itemVariants}
          className="mt-16 text-center text-gray-500 text-sm"
        >
          <p>🔒 All communication stays on your local network</p>
          <p className="mt-2">Built with React • Powered by AI • Secured by Design</p>
        </motion.div>
      </motion.div>
    </div>
  )
}

export default LandingPage
