import Link from 'next/link'

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-[var(--spacing-8)] px-[var(--spacing-4)] text-center">
      <h1
        style={{
          fontSize: 'var(--text-xl)',
          color: 'var(--text-primary)',
          fontWeight: 600,
        }}
      >
        Eaten somewhere great recently?
      </h1>
      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
        Find the dish and save the recipe for next time.
      </p>
      <Link
        href="/search"
        className="glass-pill flex items-center justify-center w-full rounded-[var(--radius-xl)]"
        style={{
          height: '56px',
          fontSize: 'var(--text-base)',
          color: 'var(--text-primary)',
          fontWeight: 600,
        }}
      >
        Search for a dish
      </Link>
      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
        Or use the camera to scan a menu
      </p>
    </div>
  )
}
