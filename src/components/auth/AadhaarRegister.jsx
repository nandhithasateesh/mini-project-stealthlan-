import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { User, Lock, Upload, Shield, CheckCircle, XCircle, Loader, AlertCircle, Eye, EyeOff } from 'lucide-react'
import { API_ENDPOINTS } from '../../config/api'

const AadhaarRegister = ({ onRegisterSuccess, onBackToLogin }) => {
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    name: '',
    aadhaarImage: null
  })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState('')
  const [imagePreview, setImagePreview] = useState(null)

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
    setError('')
  }

  const handleImageChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      // Validate file type
      if (!['image/jpeg', 'image/jpg', 'image/png'].includes(file.type)) {
        setError('Only JPEG and PNG images are allowed')
        return
      }

      // Validate file size (5MB)
      if (file.size > 5 * 1024 * 1024) {
        setError('Image size must be less than 5MB')
        return
      }

      setFormData({ ...formData, aadhaarImage: file })
      
      // Create preview
      const reader = new FileReader()
      reader.onloadend = () => {
        setImagePreview(reader.result)
      }
      reader.readAsDataURL(file)
      setError('')
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    setProgress('Preparing...')

    try {
      // Validation
      if (!formData.username || !formData.password || !formData.name || !formData.aadhaarImage) {
        throw new Error('All fields are required including Aadhaar card image')
      }

      if (formData.username.length < 3) {
        throw new Error('Username must be at least 3 characters')
      }

      if (formData.password.length < 6) {
        throw new Error('Password must be at least 6 characters')
      }

      if (formData.name.length < 2) {
        throw new Error('Name must be at least 2 characters')
      }

      // Create FormData for file upload
      const data = new FormData()
      data.append('username', formData.username)
      data.append('password', formData.password)
      data.append('name', formData.name)
      data.append('aadhaarImage', formData.aadhaarImage)

      setProgress('Uploading Aadhaar card...')

      const response = await fetch(API_ENDPOINTS.AADHAAR_REGISTER, {
        method: 'POST',
        body: data
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Verification failed')
      }

      if (result.success) {
        setProgress('✅ Authorized and Registered Successfully!')
        
        // Store token and user data
        localStorage.setItem('authToken', result.token)
        localStorage.setItem('user', JSON.stringify(result.user))
        
        // Wait a moment to show success message
        setTimeout(() => {
          onRegisterSuccess(result.user, result.token)
        }, 1500)
      }
    } catch (err) {
      setError(err.message)
      setProgress('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-darker via-dark to-slate-900 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="bg-slate-800/70 backdrop-blur-md border-2 border-slate-700 rounded-2xl p-8 shadow-2xl">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/20 rounded-full mb-4">
              <Shield className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-3xl font-bold text-white mb-2">
              Aadhaar Verification
            </h2>
            <p className="text-gray-400 text-sm">
              Secure registration with Aadhaar authentication
            </p>
          </div>

          {/* Error Message */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-red-500/20 border border-red-500 rounded-lg p-3 mb-4 flex items-center gap-2"
              >
                <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                <p className="text-red-500 text-sm">{error}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Progress Message */}
          <AnimatePresence>
            {progress && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className={`border rounded-lg p-4 mb-4 flex items-center gap-3 ${
                  progress.includes('✅') 
                    ? 'bg-green-500/20 border-green-500' 
                    : 'bg-blue-500/20 border-blue-500'
                }`}
              >
                {progress.includes('✅') ? (
                  <CheckCircle className="w-6 h-6 text-green-500 flex-shrink-0" />
                ) : (
                  <Loader className="w-6 h-6 text-blue-500 animate-spin flex-shrink-0" />
                )}
                <p className={`text-sm font-medium ${
                  progress.includes('✅') ? 'text-green-400' : 'text-blue-400'
                }`}>
                  {progress}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Username
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  name="username"
                  value={formData.username}
                  onChange={handleChange}
                  className="w-full bg-slate-700/50 border border-slate-600 rounded-lg pl-10 pr-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:border-primary transition-colors"
                  placeholder="Choose a username"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            {/* Name (as on Aadhaar) */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Full Name (as on Aadhaar)
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  className="w-full bg-slate-700/50 border border-slate-600 rounded-lg pl-10 pr-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:border-primary transition-colors"
                  placeholder="Enter your full name"
                  required
                  disabled={loading}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Must match the name on your Aadhaar card
              </p>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  className="w-full bg-slate-700/50 border border-slate-600 rounded-lg pl-10 pr-12 py-3 text-white placeholder-gray-400 focus:outline-none focus:border-primary transition-colors"
                  placeholder="Create a password"
                  required
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-300"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Aadhaar Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Aadhaar Card (Front Side)
              </label>
              <div className="relative">
                <input
                  type="file"
                  id="aadhaar-upload"
                  accept="image/jpeg,image/jpg,image/png"
                  onChange={handleImageChange}
                  className="hidden"
                  disabled={loading}
                />
                <label
                  htmlFor="aadhaar-upload"
                  className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                    imagePreview 
                      ? 'border-green-500 bg-green-500/10' 
                      : 'border-slate-600 bg-slate-700/30 hover:bg-slate-700/50'
                  } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {imagePreview ? (
                    <div className="flex flex-col items-center">
                      <CheckCircle className="w-8 h-8 text-green-500 mb-2" />
                      <p className="text-sm text-green-400">Aadhaar card uploaded</p>
                      <p className="text-xs text-gray-400 mt-1">Click to change</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center">
                      <Upload className="w-8 h-8 text-gray-400 mb-2" />
                      <p className="text-sm text-gray-400">Click to upload Aadhaar</p>
                      <p className="text-xs text-gray-500 mt-1">JPEG or PNG (max 5MB)</p>
                    </div>
                  )}
                </label>
              </div>
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 mt-2">
                <div className="flex gap-2">
                  <AlertCircle className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-blue-300">
                    <p className="font-medium mb-1">Privacy Notice:</p>
                    <ul className="list-disc list-inside space-y-0.5 text-blue-300/80">
                      <li>Your Aadhaar is only used for verification</li>
                      <li>Image is deleted immediately after verification</li>
                      <li>Aadhaar number is never stored</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <motion.button
              whileHover={{ scale: loading ? 1 : 1.02 }}
              whileTap={{ scale: loading ? 1 : 0.98 }}
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-primary to-purple-600 text-white font-semibold py-3 px-6 rounded-lg shadow-lg hover:shadow-primary/50 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader className="w-5 h-5 animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  <Shield className="w-5 h-5" />
                  Verify & Register
                </>
              )}
            </motion.button>
          </form>

          {/* Back to Login */}
          <div className="mt-6 text-center">
            <button
              onClick={onBackToLogin}
              disabled={loading}
              className="text-sm text-gray-400 hover:text-primary transition-colors disabled:opacity-50"
            >
              Already have an account? <span className="font-semibold">Login</span>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

export default AadhaarRegister
