import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { CameraModal } from './camera-modal'

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({
      children,
      initial,
      animate,
      exit,
      transition,
      ...props
    }: React.PropsWithChildren<{ initial?: unknown; animate?: unknown; exit?: unknown; transition?: unknown }>) =>
      React.createElement('div', props, children),
  },
  useReducedMotion: () => false,
  AnimatePresence: ({ children }: React.PropsWithChildren) => children,
}))

// Mock navigator.mediaDevices
function mockMediaDevicesGranted() {
  const mockTrack = { stop: vi.fn() }
  const mockStream = { getTracks: () => [mockTrack] }
  Object.defineProperty(navigator, 'mediaDevices', {
    value: {
      getUserMedia: vi.fn().mockResolvedValue(mockStream),
    },
    writable: true,
    configurable: true,
  })
}

function mockMediaDevicesDenied() {
  Object.defineProperty(navigator, 'mediaDevices', {
    value: {
      getUserMedia: vi.fn().mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError')),
    },
    writable: true,
    configurable: true,
  })
}

function mockPermissions(state: 'granted' | 'denied' | 'prompt') {
  Object.defineProperty(navigator, 'permissions', {
    value: {
      query: vi.fn().mockResolvedValue({ state }),
    },
    writable: true,
    configurable: true,
  })
}

const defaultProps = {
  onClose: vi.fn(),
  onCapture: vi.fn(),
}

describe('CameraModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: camera granted
    mockPermissions('granted')
    mockMediaDevicesGranted()
  })

  it('renders dismiss button with correct aria-label', async () => {
    render(<CameraModal {...defaultProps} />)
    expect(screen.getByLabelText('Close camera')).toBeDefined()
  })

  it('renders capture button', () => {
    render(<CameraModal {...defaultProps} />)
    expect(screen.getByLabelText('Take photo')).toBeDefined()
  })

  it('renders upload button', () => {
    render(<CameraModal {...defaultProps} />)
    expect(screen.getByLabelText('Upload photo')).toBeDefined()
  })

  it('renders hidden file input', () => {
    render(<CameraModal {...defaultProps} />)
    expect(screen.getByTestId('file-input')).toBeDefined()
  })

  it('calls onClose when dismiss button is clicked', () => {
    const onClose = vi.fn()
    render(<CameraModal {...defaultProps} onClose={onClose} />)
    fireEvent.click(screen.getByLabelText('Close camera'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does NOT call onCapture when dismissed without taking a photo', () => {
    const onCapture = vi.fn()
    render(<CameraModal {...defaultProps} onCapture={onCapture} />)
    fireEvent.click(screen.getByLabelText('Close camera'))
    expect(onCapture).not.toHaveBeenCalled()
  })

  it('shows value-framing copy when permission state is prompt', async () => {
    mockPermissions('prompt')
    render(<CameraModal {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByTestId('value-framing')).toBeDefined()
    })
    expect(
      screen.getByText(/To scan menus and dishes, Plately needs camera access/)
    ).toBeDefined()
  })

  it('shows denied state when permission is denied', async () => {
    mockPermissions('denied')
    render(<CameraModal {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByTestId('denied-state')).toBeDefined()
    })
    expect(
      screen.getByText(/Camera access was denied/)
    ).toBeDefined()
  })

  it('capture button is visually disabled when permission is denied', async () => {
    mockPermissions('denied')
    render(<CameraModal {...defaultProps} />)
    await waitFor(() => {
      screen.getByTestId('denied-state')
    })
    const captureBtn = screen.getByLabelText('Take photo') as HTMLButtonElement
    expect(captureBtn.disabled).toBe(true)
  })

  it('upload button remains active when camera is denied', async () => {
    mockPermissions('denied')
    render(<CameraModal {...defaultProps} />)
    await waitFor(() => {
      screen.getByTestId('denied-state')
    })
    const uploadBtn = screen.getByLabelText('Upload photo') as HTMLButtonElement
    expect(uploadBtn.disabled).toBeFalsy()
  })

  it('calls onCapture via file upload with base64 and mimeType', async () => {
    const onCapture = vi.fn()

    // Mock URL.createObjectURL and atob for thumbnail creation
    global.URL.createObjectURL = vi.fn().mockReturnValue('blob:thumb-url')
    global.atob = vi.fn().mockReturnValue('\x00\x01')

    // Mock FileReader constructor — must use function (not arrow) to support `new`
    const mockReadAsDataURL = vi.fn()
    const MockFileReader = vi.fn().mockImplementation(function (this: {
      readAsDataURL: typeof mockReadAsDataURL
      onload: ((e: ProgressEvent<FileReader>) => void) | null
      result: string | null
    }) {
      this.readAsDataURL = vi.fn().mockImplementation(() => {
        this.result = 'data:image/jpeg;base64,/9j/testbase64'
        this.onload?.({} as ProgressEvent<FileReader>)
      })
      this.onload = null
      this.result = null
    })
    vi.stubGlobal('FileReader', MockFileReader)

    render(<CameraModal {...defaultProps} onCapture={onCapture} />)

    const fileInput = screen.getByTestId('file-input') as HTMLInputElement
    const file = new File(['fakeimage'], 'test.jpg', { type: 'image/jpeg' })

    fireEvent.change(fileInput, { target: { files: [file] } })

    expect(onCapture).toHaveBeenCalledWith('/9j/testbase64', 'image/jpeg', 'blob:thumb-url')
  })

  it('stops media tracks on unmount to prevent camera light staying on', async () => {
    const mockStop = vi.fn()
    const mockTrack = { stop: mockStop }
    const mockStream = { getTracks: () => [mockTrack] }
    mockPermissions('granted')
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn().mockResolvedValue(mockStream) },
      writable: true,
      configurable: true,
    })

    const { unmount } = render(<CameraModal {...defaultProps} />)

    // Allow useEffect to run
    await waitFor(() => {
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled()
    })

    unmount()
    expect(mockStop).toHaveBeenCalled()
  })

  it('calls getUserMedia with environment facing mode', async () => {
    mockPermissions('granted')
    render(<CameraModal {...defaultProps} />)
    await waitFor(() => {
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
        expect.objectContaining({
          video: expect.objectContaining({ facingMode: 'environment' }),
        })
      )
    })
  })
})
