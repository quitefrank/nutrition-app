'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { useOnlineStatus } from '@/hooks/use-online-status'

type PermissionState = 'unknown' | 'prompt' | 'granted' | 'denied'

export interface CameraModalProps {
  onClose: () => void
  onCapture: (imageBase64: string, mimeType: string, thumbnailUrl: string) => void
}

async function checkCameraPermission(): Promise<PermissionState> {
  if (!navigator.permissions) return 'unknown'
  try {
    const result = await navigator.permissions.query({ name: 'camera' as PermissionName })
    return result.state as PermissionState
  } catch {
    return 'unknown'
  }
}

function createThumbnailUrl(imageBase64: string, mimeType: string): string {
  const byteString = atob(imageBase64)
  const bytes = new Uint8Array(byteString.length)
  for (let i = 0; i < byteString.length; i++) bytes[i] = byteString.charCodeAt(i)
  const blob = new Blob([bytes], { type: mimeType })
  return URL.createObjectURL(blob)
}

export function CameraModal({ onClose, onCapture }: CameraModalProps) {
  const isOnline = useOnlineStatus()
  const shouldReduceMotion = useReducedMotion()
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [permissionState, setPermissionState] = useState<PermissionState>('unknown')
  const [showValueFraming, setShowValueFraming] = useState(false)
  const [bracketsVisible, setBracketsVisible] = useState(true)
  const [shutterVisible, setShutterVisible] = useState(false)

  // Stop camera tracks on unmount
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  // Stop camera stream when going offline mid-session to release hardware resources
  useEffect(() => {
    if (!isOnline && streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [isOnline])

  // Fade out corner brackets after 2 seconds
  useEffect(() => {
    const timer = setTimeout(() => setBracketsVisible(false), 2000)
    return () => clearTimeout(timer)
  }, [])

  // Check permission and start camera on mount
  useEffect(() => {
    async function init() {
      const perm = await checkCameraPermission()
      if (perm === 'denied') {
        setPermissionState('denied')
        return
      }
      if (perm === 'prompt') {
        setShowValueFraming(true)
        setPermissionState('prompt')
        return
      }
      // 'granted' or 'unknown' — try starting camera
      setPermissionState(perm)
      await startCamera()
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
      setPermissionState('granted')
      setShowValueFraming(false)
    } catch {
      setPermissionState('denied')
      setShowValueFraming(false)
    }
  }

  function handleAllowCamera() {
    startCamera()
  }

  function captureImage(): { imageBase64: string; mimeType: string } | null {
    if (!videoRef.current) return null
    const canvas = document.createElement('canvas')
    canvas.width = videoRef.current.videoWidth || 1280
    canvas.height = videoRef.current.videoHeight || 720
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(videoRef.current, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
    return {
      imageBase64: dataUrl.replace('data:image/jpeg;base64,', ''),
      mimeType: 'image/jpeg',
    }
  }

  function handleCapture() {
    const captured = captureImage()
    if (!captured) return
    const thumbUrl = createThumbnailUrl(captured.imageBase64, captured.mimeType)
    setShutterVisible(true)
    setTimeout(() => {
      setShutterVisible(false)
      onCapture(captured.imageBase64, captured.mimeType, thumbUrl)
    }, 150)
  }

  function handleUploadClick() {
    fileInputRef.current?.click()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      const img = new Image()
      img.onload = () => {
        // Resize to max 1920px on longest side, then export as JPEG to stay well
        // under Vercel's 4.5 MB body limit (raw HEIC/PNG from phones can be 4–8 MB)
        const MAX = 1920
        const scale = Math.min(1, MAX / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        const compressed = canvas.toDataURL('image/jpeg', 0.85)
        const base64 = compressed.split(',')[1]
        const mimeType = 'image/jpeg'
        const thumbUrl = createThumbnailUrl(base64, mimeType)
        onCapture(base64, mimeType, thumbUrl)
      }
      img.onerror = () => {
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
      img.src = dataUrl
    }
    reader.onerror = () => {
      // File read failed — reset input so the user can try again
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
    reader.readAsDataURL(file)
  }

  const springTransition = shouldReduceMotion
    ? { duration: 0.15 }
    : { type: 'spring' as const, mass: 1, stiffness: 300, damping: 30 }

  const isCaptureDisabled = permissionState === 'denied'

  if (!isOnline) {
    return (
      <div
        className="fixed inset-0 z-50 bg-black flex flex-col"
        data-testid="camera-modal-offline"
      >
        <div style={{ position: 'relative', zIndex: 20, display: 'flex', justifyContent: 'flex-end', padding: '16px' }}>
          <button
            onClick={onClose}
            aria-label="Close camera"
            className="glass-fab flex items-center justify-center rounded-[var(--radius-full)]"
            style={{ width: '44px', height: '44px' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="flex flex-col items-center justify-center flex-1 gap-4 text-center px-6">
          <p style={{ fontSize: 'var(--text-2xl)', color: 'var(--text-primary)' }}>No internet connection</p>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Scanning requires an internet connection. Your grocery list and saved recipes are still available offline.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black flex flex-col"
      data-testid="camera-modal"
    >
      {/* Live camera preview — full bleed */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        data-testid="camera-video"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
      />

      {/* Shutter flash overlay */}
      {shutterVisible && (
        <motion.div
          initial={{ opacity: 0.8 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          style={{ position: 'absolute', inset: 0, background: 'white', zIndex: 10 }}
          aria-hidden="true"
        />
      )}

      {/* Corner brackets — fade after 2s */}
      {/* Top-left */}
      <motion.div
        animate={{ opacity: bracketsVisible ? 0.4 : 0 }}
        transition={{ duration: 0.4 }}
        aria-hidden="true"
        style={{ position: 'absolute', top: '20%', left: '16px', zIndex: 5 }}
      >
        <div
          style={{
            width: '32px',
            height: '32px',
            borderTop: '2px solid white',
            borderLeft: '2px solid white',
            borderRadius: '2px 0 0 0',
          }}
        />
      </motion.div>
      {/* Top-right */}
      <motion.div
        animate={{ opacity: bracketsVisible ? 0.4 : 0 }}
        transition={{ duration: 0.4 }}
        aria-hidden="true"
        style={{ position: 'absolute', top: '20%', right: '16px', zIndex: 5 }}
      >
        <div
          style={{
            width: '32px',
            height: '32px',
            borderTop: '2px solid white',
            borderRight: '2px solid white',
            borderRadius: '0 2px 0 0',
          }}
        />
      </motion.div>
      {/* Bottom-left */}
      <motion.div
        animate={{ opacity: bracketsVisible ? 0.4 : 0 }}
        transition={{ duration: 0.4 }}
        aria-hidden="true"
        style={{ position: 'absolute', bottom: '35%', left: '16px', zIndex: 5 }}
      >
        <div
          style={{
            width: '32px',
            height: '32px',
            borderBottom: '2px solid white',
            borderLeft: '2px solid white',
            borderRadius: '0 0 0 2px',
          }}
        />
      </motion.div>
      {/* Bottom-right */}
      <motion.div
        animate={{ opacity: bracketsVisible ? 0.4 : 0 }}
        transition={{ duration: 0.4 }}
        aria-hidden="true"
        style={{ position: 'absolute', bottom: '35%', right: '16px', zIndex: 5 }}
      >
        <div
          style={{
            width: '32px',
            height: '32px',
            borderBottom: '2px solid white',
            borderRight: '2px solid white',
            borderRadius: '0 0 2px 0',
          }}
        />
      </motion.div>

      {/* Dismiss button — top right, above denied overlay (zIndex 30) */}
      <div style={{ position: 'relative', zIndex: 40, display: 'flex', justifyContent: 'flex-end', padding: '16px' }}>
        <button
          onClick={onClose}
          aria-label="Close camera"
          className="glass-fab flex items-center justify-center rounded-[var(--radius-full)]"
          style={{ width: '44px', height: '44px' }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Value-framing overlay (first-time permission prompt) */}
      {showValueFraming && (
        <motion.div
          initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 20 }}
          animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
          transition={springTransition}
          data-testid="value-framing"
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 30,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '32px',
            gap: '24px',
          }}
        >
          {/* Camera icon */}
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="rgba(255,255,255,0.9)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="2" y="7" width="20" height="15" rx="2" ry="2" />
            <path d="M16 3H8L5 7h14l-3-4z" />
            <circle cx="12" cy="14" r="3" />
          </svg>
          <p
            style={{
              fontSize: 'var(--text-base)',
              color: 'var(--text-primary)',
              textAlign: 'center',
              lineHeight: 1.5,
            }}
          >
            To scan menus and dishes, Plately needs camera access.
          </p>
          <button
            onClick={handleAllowCamera}
            aria-label="Allow camera access"
            style={{
              background: 'rgba(255,255,255,0.9)',
              color: '#000',
              border: 'none',
              borderRadius: 'var(--radius-xl)',
              padding: '14px 32px',
              fontSize: 'var(--text-base)',
              fontWeight: 600,
              cursor: 'pointer',
              width: '100%',
              maxWidth: '280px',
            }}
          >
            Allow Camera Access
          </button>
        </motion.div>
      )}

      {/* Denied state overlay */}
      {permissionState === 'denied' && !showValueFraming && (
        <div
          data-testid="denied-state"
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 30,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '32px',
            gap: '16px',
          }}
        >
          <p
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--text-secondary)',
              textAlign: 'center',
              lineHeight: 1.5,
            }}
          >
            Camera access was denied. You can still scan using a photo from your camera roll.
          </p>
        </div>
      )}

      {/* Bottom controls — zIndex 40 so they sit above the denied overlay (zIndex 30) */}
      <div
        style={{
          position: 'absolute',
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 40px)',
          left: 0,
          right: 0,
          zIndex: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '32px',
        }}
      >
        {/* Upload button */}
        <button
          onClick={handleUploadClick}
          aria-label="Upload photo"
          data-testid="upload-button"
          className="glass-fab flex items-center justify-center rounded-[var(--radius-full)]"
          style={{ width: '48px', height: '48px' }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        </button>

        {/* Capture button */}
        <button
          onClick={handleCapture}
          disabled={isCaptureDisabled}
          aria-label="Take photo"
          data-testid="capture-button"
          className="glass-fab flex items-center justify-center rounded-[var(--radius-full)]"
          style={{
            width: '72px',
            height: '72px',
            opacity: isCaptureDisabled ? 0.4 : 1,
            pointerEvents: isCaptureDisabled ? 'none' : 'auto',
          }}
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="2" y="7" width="20" height="15" rx="2" ry="2" />
            <path d="M16 3H8L5 7h14l-3-4z" />
            <circle cx="12" cy="14" r="3" />
          </svg>
        </button>

        {/* Spacer to balance the upload button visually */}
        <div style={{ width: '48px', height: '48px' }} aria-hidden="true" />
      </div>

      {/* Hidden file input for upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        style={{ display: 'none' }}
        aria-hidden="true"
        data-testid="file-input"
      />
    </div>
  )
}
