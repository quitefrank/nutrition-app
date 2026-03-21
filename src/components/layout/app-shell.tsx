'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { GlassTabBar, type TabId } from './glass-tab-bar'
import { CameraFab } from './camera-fab'
import { CameraModal } from '@/components/scan/camera-modal'
import { ProcessingStrip } from '@/components/scan/processing-strip'
import { useScan } from '@/hooks/use-scan'

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
  const { status, scanId, thumbnailUrl, submitScan, cancelScan } = useScan()

  const activeTab = getActiveTab(pathname)

  // Show strip 300ms after modal closes (if scan was submitted)
  const handleCapture = (imageBase64: string, mimeType: string, thumbUrl: string) => {
    setIsCameraModalOpen(false)
    submitScan(imageBase64, mimeType, thumbUrl)
    stripTimerRef.current = setTimeout(() => setShowStrip(true), 300)
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

  return (
    <>
      <main className="flex flex-col flex-1 pb-[calc(49px+env(safe-area-inset-bottom,0px))]">
        {children}
      </main>
      <GlassTabBar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        fabSlot={<CameraFab onClick={() => setIsCameraModalOpen(true)} />}
      />
      {showStrip && (status === 'processing' || status === 'ready') && (
        <ProcessingStrip
          status={status}
          thumbnailUrl={thumbnailUrl}
          onTap={handleStripTap}
          onCancel={handleStripCancel}
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
