import React, { useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { Mic, Square, Send, X, FileText } from 'lucide-react'
import { audioToText } from '../../utils/aiHelper'

const AudioRecorder = ({ onSendAudio, onCancel, mode }) => {
  const [isRecording, setIsRecording] = useState(false)
  const [audioBlob, setAudioBlob] = useState(null)
  const [recordingTime, setRecordingTime] = useState(0)
  const [transcribing, setTranscribing] = useState(false)
  const [transcript, setTranscript] = useState('')
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)

  const startRecording = async () => {
    try {
      // Check if mediaDevices is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Your browser does not support audio recording');
      }

      // Check if we're on HTTPS or localhost
      const isSecureContext = window.isSecureContext;
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      
      if (!isSecureContext && !isLocalhost) {
        alert('⚠️ Microphone access requires HTTPS when not on localhost.\n\nTo use audio recording:\n1. Access via localhost, OR\n2. Set up HTTPS for your server');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRecorderRef.current = new MediaRecorder(stream)
      chunksRef.current = []

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        setAudioBlob(blob)
        stream.getTracks().forEach(track => track.stop())
      }

      mediaRecorderRef.current.start()
      setIsRecording(true)

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1)
      }, 1000)
    } catch (error) {
      console.error('Error accessing microphone:', error)
      
      let errorMessage = 'Could not access microphone.\n\n';
      
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        errorMessage += '❌ Permission denied. Please:\n1. Click the 🔒 icon in your browser address bar\n2. Allow microphone access\n3. Refresh the page';
      } else if (error.name === 'NotFoundError') {
        errorMessage += '❌ No microphone found. Please connect a microphone and try again.';
      } else if (error.name === 'NotReadableError') {
        errorMessage += '❌ Microphone is already in use by another application.';
      } else {
        errorMessage += `❌ ${error.message || 'Unknown error'}`;
      }
      
      alert(errorMessage)
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      clearInterval(timerRef.current)
    }
  }

  const handleSend = () => {
    if (audioBlob) {
      onSendAudio(audioBlob, transcript)
      handleCancel()
    }
  }

  const handleTranscribe = async () => {
    if (!audioBlob) return;
    
    if (mode === 'secure') {
      alert('Audio transcription is only available in Normal Mode for privacy reasons');
      return;
    }
    
    setTranscribing(true);
    try {
      const text = await audioToText(audioBlob);
      setTranscript(text);
    } catch (error) {
      console.error('Transcription error:', error);
      alert('Failed to transcribe audio. You can still send the audio message.');
    } finally {
      setTranscribing(false);
    }
  }

  const handleCancel = () => {
    if (isRecording) {
      stopRecording()
    }
    setAudioBlob(null)
    setRecordingTime(0)
    setTranscript('')
    clearInterval(timerRef.current)
    onCancel()
  }

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="absolute bottom-full left-0 right-0 mb-2 bg-slate-800 border border-slate-700 rounded-lg p-4 shadow-lg"
    >
      <div className="flex items-center gap-4">
        {!isRecording && !audioBlob && (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={startRecording}
            className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg transition-colors"
          >
            <Mic className="w-5 h-5" />
            Start Recording
          </motion.button>
        )}

        {isRecording && (
          <>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
              <span className="text-white font-mono">{formatTime(recordingTime)}</span>
            </div>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={stopRecording}
              className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg transition-colors"
            >
              <Square className="w-5 h-5" />
              Stop
            </motion.button>
          </>
        )}

        {audioBlob && !isRecording && (
          <>
            <div className="flex-1 space-y-2">
              <audio controls src={URL.createObjectURL(audioBlob)} className="w-full" />
              {transcript && (
                <div className="bg-slate-700 p-2 rounded text-sm text-gray-300">
                  <span className="font-semibold">Transcript:</span> {transcript}
                </div>
              )}
            </div>
            {mode !== 'secure' && !transcript && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleTranscribe}
                disabled={transcribing}
                className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                <FileText className="w-5 h-5" />
                {transcribing ? 'Transcribing...' : 'To Text'}
              </motion.button>
            )}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleSend}
              className="flex items-center gap-2 bg-primary hover:bg-primary/80 text-white px-4 py-2 rounded-lg transition-colors"
            >
              <Send className="w-5 h-5" />
              Send
            </motion.button>
          </>
        )}

        <button
          onClick={handleCancel}
          className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
        >
          <X className="w-5 h-5 text-gray-400" />
        </button>
      </div>
    </motion.div>
  )
}

export default AudioRecorder
