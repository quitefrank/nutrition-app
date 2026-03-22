'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'
import type { AtmosphericState } from '@/types/domain'

type AtmosphericContextValue = {
  state: AtmosphericState | undefined
  setState: (state: AtmosphericState | undefined) => void
}

const AtmosphericContext = createContext<AtmosphericContextValue | null>(null)

export function AtmosphericProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AtmosphericState | undefined>(undefined)
  return (
    <AtmosphericContext.Provider value={{ state, setState }}>
      {children}
    </AtmosphericContext.Provider>
  )
}

export function useAtmosphericState() {
  const ctx = useContext(AtmosphericContext)
  if (!ctx) throw new Error('useAtmosphericState must be used within AtmosphericProvider')
  return ctx.state
}

export function useSetAtmospheric() {
  const ctx = useContext(AtmosphericContext)
  if (!ctx) throw new Error('useSetAtmospheric must be used within AtmosphericProvider')
  return ctx.setState
}
