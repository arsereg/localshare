/**
 * Voice Chat Hook
 * Manages WebRTC peer connections for voice communication
 */
import { useCallback, useRef, useEffect } from 'react'
import { useAppStore } from '@stores/appStore'
import { VoiceParticipant } from '@shared/types'

interface PeerConnection {
  pc: RTCPeerConnection
  username: string
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
]

export function useVoiceChat() {
  const {
    voiceChat,
    joinVoiceChat,
    leaveVoiceChat,
    setMuted,
    addVoiceParticipant,
    removeVoiceParticipant,
    updateVoiceParticipant,
    connectedUsers
  } = useAppStore()

  const localStreamRef = useRef<MediaStream | null>(null)
  const peerConnectionsRef = useRef<Map<string, PeerConnection>>(new Map())
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<Map<string, AnalyserNode>>(new Map())

  // Initialize audio context for speech detection
  const initAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext()
    }
    return audioContextRef.current
  }, [])

  // Create peer connection for a specific user
  const createPeerConnection = useCallback((targetUsername: string): RTCPeerConnection => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        // Send ICE candidate to the target user via WebSocket
        // This will be implemented through IPC to main process
        console.log('[VoiceChat] ICE candidate for', targetUsername, event.candidate)
      }
    }

    pc.ontrack = (event) => {
      console.log('[VoiceChat] Received track from', targetUsername)
      const [stream] = event.streams

      // Create audio element to play remote audio
      const audio = new Audio()
      audio.srcObject = stream
      audio.autoplay = true
      audio.play().catch(console.error)

      // Set up speech detection for remote user
      const audioContext = initAudioContext()
      const source = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      analyserRef.current.set(targetUsername, analyser)
    }

    pc.onconnectionstatechange = () => {
      console.log('[VoiceChat] Connection state with', targetUsername, ':', pc.connectionState)
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        removeVoiceParticipant(targetUsername)
        peerConnectionsRef.current.delete(targetUsername)
      }
    }

    peerConnectionsRef.current.set(targetUsername, { pc, username: targetUsername })
    return pc
  }, [initAudioContext, removeVoiceParticipant])

  // Start voice chat
  const startVoiceChat = useCallback(async () => {
    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      localStreamRef.current = stream

      // Set up local speech detection
      const audioContext = initAudioContext()
      const source = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      analyserRef.current.set('local', analyser)

      joinVoiceChat()

      // Notify others that we joined voice chat (via IPC to main process)
      console.log('[VoiceChat] Started voice chat')

      return true
    } catch (error) {
      console.error('[VoiceChat] Failed to start:', error)
      return false
    }
  }, [initAudioContext, joinVoiceChat])

  // Stop voice chat
  const stopVoiceChat = useCallback(() => {
    // Stop local stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop())
      localStreamRef.current = null
    }

    // Close all peer connections
    peerConnectionsRef.current.forEach(({ pc }) => pc.close())
    peerConnectionsRef.current.clear()

    // Clean up analysers
    analyserRef.current.clear()

    leaveVoiceChat()
    console.log('[VoiceChat] Stopped voice chat')
  }, [leaveVoiceChat])

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0]
      if (audioTrack) {
        audioTrack.enabled = voiceChat.isMuted // Toggle
        setMuted(!voiceChat.isMuted)
      }
    }
  }, [voiceChat.isMuted, setMuted])

  // Handle incoming WebRTC offer
  const handleOffer = useCallback(async (fromUsername: string, offer: RTCSessionDescriptionInit) => {
    const pc = createPeerConnection(fromUsername)

    // Add local stream tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!)
      })
    }

    await pc.setRemoteDescription(offer)
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)

    // Send answer back via WebSocket (IPC to main process)
    console.log('[VoiceChat] Sending answer to', fromUsername)

    addVoiceParticipant({
      username: fromUsername,
      color: connectedUsers.find(u => u.username === fromUsername)?.color || '#888',
      isMuted: false,
      isSpeaking: false
    })

    return answer
  }, [createPeerConnection, addVoiceParticipant, connectedUsers])

  // Handle incoming WebRTC answer
  const handleAnswer = useCallback(async (fromUsername: string, answer: RTCSessionDescriptionInit) => {
    const connection = peerConnectionsRef.current.get(fromUsername)
    if (connection) {
      await connection.pc.setRemoteDescription(answer)
    }
  }, [])

  // Handle incoming ICE candidate
  const handleIceCandidate = useCallback(async (fromUsername: string, candidate: RTCIceCandidateInit) => {
    const connection = peerConnectionsRef.current.get(fromUsername)
    if (connection) {
      await connection.pc.addIceCandidate(candidate)
    }
  }, [])

  // Initiate call to a user
  const callUser = useCallback(async (targetUsername: string) => {
    const pc = createPeerConnection(targetUsername)

    // Add local stream tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!)
      })
    }

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    // Send offer via WebSocket (IPC to main process)
    console.log('[VoiceChat] Sending offer to', targetUsername)

    addVoiceParticipant({
      username: targetUsername,
      color: connectedUsers.find(u => u.username === targetUsername)?.color || '#888',
      isMuted: false,
      isSpeaking: false
    })

    return offer
  }, [createPeerConnection, addVoiceParticipant, connectedUsers])

  // Speech detection loop
  useEffect(() => {
    if (!voiceChat.isActive) return

    const checkSpeaking = () => {
      analyserRef.current.forEach((analyser, username) => {
        const dataArray = new Uint8Array(analyser.frequencyBinCount)
        analyser.getByteFrequencyData(dataArray)

        // Calculate average volume
        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length
        const isSpeaking = average > 30 // Threshold

        if (username === 'local') {
          // Update local speaking state if needed
        } else {
          updateVoiceParticipant(username, { isSpeaking })
        }
      })
    }

    const interval = setInterval(checkSpeaking, 100)
    return () => clearInterval(interval)
  }, [voiceChat.isActive, updateVoiceParticipant])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopVoiceChat()
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
    }
  }, [stopVoiceChat])

  return {
    isActive: voiceChat.isActive,
    isMuted: voiceChat.isMuted,
    participants: voiceChat.participants,
    startVoiceChat,
    stopVoiceChat,
    toggleMute,
    callUser,
    handleOffer,
    handleAnswer,
    handleIceCandidate
  }
}
