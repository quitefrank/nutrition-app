'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { GlassTabBar, type TabId } from './glass-tab-bar'
import { CameraFab } from './camera-fab'
import { CameraModal } from '@/components/scan/camera-modal'
import { ProcessingStrip } from '@/components/scan/processing-strip'
import { ErrorState } from '@/components/ui/error-state'
import { useScan } from '@/hooks/use-scan'
import { useOnlineStatus } from '@/hooks/use-online-status'
import { useInstallPrompt } from '@/hooks/use-install-prompt'
import { InstallPromptBanner } from '@/components/pwa/install-prompt-banner'

function getActiveTab(pathname: string | null): TabId {
  if (!pathname) return 'home'
  if (pathname.startsWith('/search')) return 'search'
  if (pathname.startsWith('/grocery')) return 'grocery'
  return 'home'
}

function getTabPath(tab: TabId): string {
  const paths: Record<TabId, string> = {
    home: '/',
    search: '/search',
    grocery: '/grocery',
  }
  return paths[tab]
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false)
  const [showStrip, setShowStrip] = useState(false)
  const stripTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { status, scanId, thumbnailUrl, submitScan, cancelScan, retry } = useScan()
  const isOnline = useOnlineStatus()
  const { canInstall, promptInstall, dismiss } = useInstallPrompt()
  const [showInstallBanner, setShowInstallBanner] = useState(false)
  const canInstallRef = useRef(canInstall)
  useEffect(() => { canInstallRef.current = canInstall }, [canInstall])

  const activeTab = getActiveTab(pathname)

  // Show strip 300ms after modal closes (if scan was submitted)
  const handleCapture = (imageBase64: string, mimeType: string, thumbUrl: string) => {
    setIsCameraModalOpen(false)
    submitScan(imageBase64, mimeType, thumbUrl)
    stripTimerRef.current = setTimeout(() => {
      setShowStrip(true)
      // Request notification permission after strip renders (AC2, UX-DR9).
      // Deferred to next tick so React commits the strip state update before the OS dialog appears.
      setTimeout(() => {
        try {
          if (
            typeof window !== 'undefined' &&
            'Notification' in window &&
            Notification.permission === 'default' &&
            !sessionStorage.getItem('plately_notif_asked')
          ) {
            sessionStorage.setItem('plately_notif_asked', 'true')
            void Notification.requestPermission().catch(() => {})
          }
        } catch {
          // sessionStorage throws in Safari Private Browsing — skip permission request silently
        }
      }, 0)
    }, 300)
  }

  const handleTabChange = (tab: TabId) => {
    setIsCameraModalOpen(false)
    router.push(getTabPath(tab))
  }

  const handleStripTap = () => {
    if (status === 'ready' && scanId) {
      setShowStrip(false)
      router.push(`/scan/results?scanId=${scanId}`)
    }
  }

  const handleStripCancel = () => {
    if (stripTimerRef.current) clearTimeout(stripTimerRef.current)
    cancelScan()
    setShowStrip(false)
  }

  const handleUploadInstead = () => {
    cancelScan()
    setShowStrip(false)
    setIsCameraModalOpen(true)
  }

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (stripTimerRef.current) clearTimeout(stripTimerRef.current)
    }
  }, [])

  // Retake: results page dispatches 'plately:openCamera' after navigating home
  useEffect(() => {
    const handleOpenCamera = () => setIsCameraModalOpen(true)
    window.addEventListener('plately:openCamera', handleOpenCamera)
    return () => window.removeEventListener('plately:openCamera', handleOpenCamera)
  }, [])

  // Show install banner after first recipe save (if install is available)
  // P4: use ref so the listener is registered once — avoids a re-registration gap when
  //     canInstall transitions from false→true between the recipeSaved event and re-render
  useEffect(() => {
    const handleRecipeSaved = () => {
      if (canInstallRef.current) setShowInstallBanner(true)
    }
    window.addEventListener('plately:recipeSaved', handleRecipeSaved)
    return () => window.removeEventListener('plately:recipeSaved', handleRecipeSaved)
  }, [])

  return (
    <>
      <main className="flex flex-col flex-1 pb-[calc(49px+env(safe-area-inset-bottom,0px))]">
        {children}
      </main>
      <GlassTabBar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        fabSlot={<CameraFab onClick={() => setIsCameraModalOpen(true)} disabled={!isOnline} />}
      />
      {showStrip && (status === 'processing' || status === 'ready') && (
        <ProcessingStrip
          status={status}
          thumbnailUrl={thumbnailUrl}
          onTap={handleStripTap}
          onCancel={handleStripCancel}
        />
      )}
      {showStrip && status === 'error' && (
        <div
          style={{
            position: 'fixed',
            bottom: 'calc(49px + env(safe-area-inset-bottom, 0px) + 8px)',
            left: '16px',
            right: '16px',
            zIndex: 40,
          }}
        >
          <ErrorState
            message="Scan service is temporarily unavailable"
            onRetry={retry}
            onUploadInstead={handleUploadInstead}
          />
        </div>
      )}
      {showInstallBanner && canInstall && (
        <InstallPromptBanner
          onInstall={async () => {
            try {
              await promptInstall()
            } finally {
              setShowInstallBanner(false) // P3: always hide banner, even if prompt() throws
            }
          }}
          onDismiss={() => {
            dismiss()
            setShowInstallBanner(false)
          }}
        />
      )}
      {isCameraModalOpen && (
        <CameraModal
          onClose={() => setIsCameraModalOpen(false)}
          onCapture={handleCapture}
        />
      )}
    </>
  )
}
