'use client'

/**
 * CameraContext — provides `openCamera()` to any descendant of AppShell.
 *
 * AppShell is the sole provider. Consumers (e.g. RestaurantCollectionScreen's
 * empty-state CTA) call openCamera() without needing to thread props through
 * the page layer.
 */

import { createContext, useContext } from 'react'

interface CameraContextValue {
  /** Open the camera modal. No-op when AppShell has a scan in progress. */
  openCamera: () => void
}

export const CameraContext = createContext<CameraContextValue>({
  openCamera: () => {},
})

export function useCameraContext(): CameraContextValue {
  return useContext(CameraContext)
}
