'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'

export type TabId = 'home' | 'search' | 'grocery'


interface Tab {
  id: TabId
  label: string
  icon: React.ReactNode
}

export interface GlassTabBarProps {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
  /** Optional camera FAB — rendered to the right of the tab items */
  fabSlot?: React.ReactNode
  className?: string
}

const TABS: Tab[] = [
  { id: 'home', label: 'Home', icon: <HomeIcon /> },
  { id: 'search', label: 'Search', icon: <SearchIcon /> },
  { id: 'grocery', label: 'Grocery', icon: <GroceryIcon /> },
]

export function GlassTabBar({ activeTab, onTabChange, fabSlot, className }: GlassTabBarProps) {
  const shouldReduceMotion = useReducedMotion()

  const initial = shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 20 }
  const transition = shouldReduceMotion
    ? { duration: 0.15 }
    : { type: 'spring' as const, mass: 1, stiffness: 300, damping: 30 }

  return (
    <motion.nav
      data-testid="glass-tab-bar"
      initial={initial}
      animate={{ opacity: 1, y: 0 }}
      transition={transition}
      className={cn(
        'glass-tab',
        'fixed bottom-0 left-0 right-0 z-30',
        'pb-[env(safe-area-inset-bottom,0px)]',
        className
      )}
      aria-label="Main navigation"
    >
      <div className="flex items-center justify-around h-[49px] px-[var(--spacing-4)]">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            data-testid={`tab-${tab.id}`}
            onClick={() => onTabChange(tab.id)}
            aria-label={tab.label}
            aria-current={activeTab === tab.id ? 'page' : undefined}
            className="flex flex-col items-center gap-[2px] transition-colors duration-200 min-w-[44px] min-h-[44px] justify-center active:opacity-70"
            style={{
              color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-tertiary)',
              background: activeTab === tab.id ? 'rgba(255,255,255,0.10)' : 'transparent',
              borderRadius: 'var(--radius-full)',
              border: activeTab === tab.id ? '0.5px solid rgba(255,255,255,0.12)' : '0.5px solid transparent',
              padding: '4px 10px',
              transition: 'background 0.2s ease, color 0.2s ease',
            }}
          >
            <span className="text-[22px] leading-none" aria-hidden="true">
              {tab.icon}
            </span>
            <span style={{ fontSize: 'var(--text-2xs)', fontWeight: 500 }}>
              {tab.label}
            </span>
          </button>
        ))}


        {fabSlot && (
          <div className="flex items-center justify-center" data-testid="tab-bar-fab">
            {fabSlot}
          </div>
        )}
      </div>
    </motion.nav>
  )
}

/* ─── Placeholder icons — replaced with proper icon library in Story 1.4 ── */

function HomeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

function GroceryIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  )
}
