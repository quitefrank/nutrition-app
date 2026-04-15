"use client"

import { Fragment } from "react"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import { SPRING_CARD_EXPAND } from "@/lib/springs"

interface MacroDisplayProps {
  proteinG: number | null
  carbsG: number | null
  fatG: number | null
  fibreG?: number | null
  /** When true, renders an "Est." label (compact: at end of row; expanded: below each value) */
  isEstimated?: boolean
  /** Drives the compact ↔ expanded morph */
  isExpanded: boolean
}

const MAIN_MACROS = [
  { key: "proteinG" as const, shortLabel: "P", fullLabel: "PROTEIN" },
  { key: "carbsG"   as const, shortLabel: "C", fullLabel: "CARBS"   },
  { key: "fatG"     as const, shortLabel: "F", fullLabel: "FAT"     },
] as const

export function MacroDisplay({
  proteinG,
  carbsG,
  fatG,
  fibreG,
  isEstimated = false,
  isExpanded,
}: MacroDisplayProps) {
  const reducedMotion = useReducedMotion()
  const springTransition = reducedMotion ? { duration: 0 } : SPRING_CARD_EXPAND
  const quickFade = reducedMotion ? { duration: 0 } : { duration: 0.12 }

  const values: Record<string, number | null> = { proteinG, carbsG, fatG }

  return (
    <motion.div
      layout
      animate={{
        background: isExpanded ? "rgba(244,242,238,0.5)" : "rgba(0,0,0,0)",
        borderRadius: isExpanded ? 11 : 0,
        paddingTop: isExpanded ? 10 : 0,
        paddingBottom: isExpanded ? 10 : 0,
      }}
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: isExpanded ? "stretch" : "center",
        // Transparent border in compact prevents layout shift when it appears in expanded
        border: isExpanded
          ? "1px solid rgba(180,170,158,0.22)"
          : "1px solid transparent",
        paddingLeft: 0,
        paddingRight: 0,
        overflow: "hidden",
      }}
      transition={springTransition}
    >
      {MAIN_MACROS.map((macro, i) => {
        const rawValue = values[macro.key]
        const hasValue = rawValue != null && Number.isFinite(rawValue)
        const displayValue = hasValue ? `${Math.round(rawValue!)}g` : "—"

        return (
          <Fragment key={macro.key}>
            <motion.div
              layout
              style={{
                flex: isExpanded ? 1 : "none",
                display: "flex",
                flexDirection: isExpanded ? "column" : "row",
                alignItems: "center",
                gap: 2,
                // Vertical dividers in expanded mode
                borderRight: isExpanded && i < MAIN_MACROS.length - 1
                  ? "1px solid rgba(180,170,158,0.14)"
                  : undefined,
              }}
              transition={springTransition}
            >
              {/* Label — crossfades between "P" and "PROTEIN" */}
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={isExpanded ? `${macro.key}-full` : `${macro.key}-short`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={quickFade}
                  style={{
                    fontSize: 9,
                    fontWeight: 600,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    color: "var(--color-text-tertiary)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {isExpanded ? macro.fullLabel : macro.shortLabel}
                </motion.span>
              </AnimatePresence>

              {/* Value — layout-animated so it physically moves between positions */}
              <motion.span
                layout
                transition={springTransition}
                style={{
                  fontSize: isExpanded ? 14 : 12,
                  fontWeight: 600,
                  lineHeight: 1,
                  color: isExpanded
                    ? "var(--color-text-primary)"
                    : "var(--color-text-secondary)",
                }}
              >
                {displayValue}
              </motion.span>

              {/* Per-value Est. label — expanded only */}
              {isExpanded && isEstimated && hasValue && (
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 500,
                    color: "var(--color-text-tertiary)",
                  }}
                >
                  Est.
                </span>
              )}
            </motion.div>

            {/* Dot separator between cells in compact mode */}
            {!isExpanded && i < MAIN_MACROS.length - 1 && (
              <span
                style={{
                  fontSize: 10,
                  color: "var(--color-text-tertiary)",
                  margin: "0 2px",
                  flexShrink: 0,
                }}
              >
                ·
              </span>
            )}
          </Fragment>
        )
      })}

      {/* Fibre — appears in expanded mode only */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            key="fibre"
            layout
            initial={{ opacity: 0, flex: 0, minWidth: 0 }}
            animate={{ opacity: 1, flex: 1, minWidth: 0 }}
            exit={{ opacity: 0, flex: 0, minWidth: 0 }}
            transition={springTransition}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
              overflow: "hidden",
            }}
          >
            <span
              style={{
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: "var(--color-text-tertiary)",
                whiteSpace: "nowrap",
              }}
            >
              FIBRE
            </span>
            <span
              style={{
                fontSize: 14,
                fontWeight: 600,
                lineHeight: 1,
                color: "var(--color-text-primary)",
              }}
            >
              {fibreG != null && Number.isFinite(fibreG) ? `${Math.round(fibreG)}g` : "—"}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Compact: Est. badge at end of row */}
      {!isExpanded && isEstimated && (
        <span
          style={{
            fontSize: 10,
            fontWeight: 500,
            color: "var(--color-text-tertiary)",
            marginLeft: 2,
          }}
        >
          Est.
        </span>
      )}
    </motion.div>
  )
}
