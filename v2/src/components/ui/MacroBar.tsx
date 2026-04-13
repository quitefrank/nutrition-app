"use client"

interface MacroBarProps {
  proteinG: number | null
  carbsG: number | null
  fatG: number | null
  fibreG: number | null
  /** When true, renders an "Est." label below each non-null macro value (USDA enrichment failed). Defaults to false. */
  isEstimated?: boolean
  className?: string
}

const MACRO_CELLS = [
  { label: "PROTEIN", key: "proteinG" as const },
  { label: "CARBS",   key: "carbsG" as const },
  { label: "FAT",     key: "fatG" as const },
  { label: "FIBRE",   key: "fibreG" as const },
] as const

export function MacroBar({ proteinG, carbsG, fatG, fibreG, isEstimated = false, className }: MacroBarProps) {
  const values: Record<string, number | null> = { proteinG, carbsG, fatG, fibreG }

  return (
    <div
      className={`flex ${className ?? ""}`}
      style={{
        background: "rgba(244,242,238,0.5)",
        borderRadius: 11,
        border: "var(--border-glass)",
        padding: "10px 0",
      }}
    >
      {MACRO_CELLS.map((cell, i) => (
        <div
          key={cell.label}
          className="flex-1 flex flex-col items-center"
          style={{
            borderRight: i < MACRO_CELLS.length - 1
              ? "1px solid rgba(180,170,158,0.14)"
              : undefined,
          }}
        >
          <span
            style={{
              fontSize: 9,
              textTransform: "uppercase",
              fontWeight: 600,
              color: "var(--color-text-tertiary)",
            }}
          >
            {cell.label}
          </span>
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--color-text-primary)",
              marginTop: 2,
            }}
          >
            {values[cell.key] != null && Number.isFinite(values[cell.key]) ? `${Math.round(values[cell.key]!)}g` : "—"}
          </span>
          {isEstimated && values[cell.key] != null && (
            <span
              style={{
                fontSize: 9,
                color: "var(--color-text-tertiary)",
                fontWeight: 500,
                marginTop: 1,
              }}
              aria-label="estimated value"
            >
              Est.
            </span>
          )}
        </div>
      ))}
    </div>
  )
}
