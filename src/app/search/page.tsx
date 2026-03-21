export default function SearchPage() {
  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-[var(--spacing-4)] px-[var(--spacing-4)] text-center">
      <h1
        style={{
          fontSize: 'var(--text-xl)',
          color: 'var(--text-primary)',
          fontWeight: 600,
        }}
      >
        Search
      </h1>
      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
        Coming in Story 5.2
      </p>
    </div>
  )
}
