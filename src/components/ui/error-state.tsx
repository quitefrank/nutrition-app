'use client'

interface ErrorStateProps {
  message: string
  onRetry: () => void
  onUploadInstead?: () => void
}

export function ErrorState({ message, onRetry, onUploadInstead }: ErrorStateProps) {
  return (
    <div
      role="alert"
      data-testid="error-state"
      style={{
        background: 'var(--glass-strip-bg)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderRadius: 'var(--radius-md)',
        padding: '12px 16px',
      }}
    >
      {/* Plain-language message — no raw errors */}
      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)', margin: '0 0 12px' }}>
        {message}
      </p>

      {/* Retry button */}
      <button
        onClick={onRetry}
        style={{
          width: '100%',
          height: '56px',
          borderRadius: 'var(--radius-xl)',
          background: 'rgba(255,255,255,0.90)',
          color: 'var(--text-on-button)',
          fontWeight: 600,
          fontSize: 'var(--text-base)',
          border: 'none',
          cursor: 'pointer',
          marginBottom: onUploadInstead ? '8px' : '0',
        }}
        aria-label="Retry scan"
      >
        Try again
      </button>

      {/* Upload alternative — only shown when handler provided */}
      {onUploadInstead && (
        <button
          onClick={onUploadInstead}
          style={{
            width: '100%',
            height: '44px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-secondary)',
            fontSize: 'var(--text-sm)',
          }}
          aria-label="Try uploading a photo instead"
        >
          Try uploading a photo instead
        </button>
      )}
    </div>
  )
}
