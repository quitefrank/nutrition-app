import { describe, it, expect } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import React, { useEffect } from 'react'
import {
  AtmosphericProvider,
  useAtmosphericState,
  useSetAtmospheric,
} from './atmospheric-context'
import type { AtmosphericState } from '@/types/domain'

const testState: AtmosphericState = {
  imageUrl: 'https://example.com/image.jpg',
  palette: null,
  tier: 'restaurant',
  backgroundColorFallback: '#0a0a0a',
}

function StateReader() {
  const state = useAtmosphericState()
  return <div data-testid="state">{state ? state.imageUrl : 'undefined'}</div>
}

function StateSetter({ value }: { value: AtmosphericState | undefined }) {
  const setState = useSetAtmospheric()
  useEffect(() => { setState(value) }, [setState, value])
  return null
}

describe('AtmosphericContext', () => {
  it('renders without error with default undefined state', () => {
    render(
      <AtmosphericProvider>
        <StateReader />
      </AtmosphericProvider>
    )
    expect(screen.getByTestId('state').textContent).toBe('undefined')
  })

  it('useSetAtmospheric updates state accessible via useAtmosphericState', async () => {
    render(
      <AtmosphericProvider>
        <StateSetter value={testState} />
        <StateReader />
      </AtmosphericProvider>
    )
    expect(screen.getByTestId('state').textContent).toBe(testState.imageUrl)
  })

  it('multiple consumers see same state (context propagation)', () => {
    render(
      <AtmosphericProvider>
        <StateSetter value={testState} />
        <div>
          <StateReader />
          <div data-testid="state2">
            <StateReader />
          </div>
        </div>
      </AtmosphericProvider>
    )
    const readers = screen.getAllByTestId('state')
    readers.forEach(r => expect(r.textContent).toBe(testState.imageUrl))
  })

  it('setState with undefined reverts to neutral', () => {
    const { rerender } = render(
      <AtmosphericProvider>
        <StateSetter value={testState} />
        <StateReader />
      </AtmosphericProvider>
    )
    expect(screen.getByTestId('state').textContent).toBe(testState.imageUrl)

    rerender(
      <AtmosphericProvider>
        <StateSetter value={undefined} />
        <StateReader />
      </AtmosphericProvider>
    )
    expect(screen.getByTestId('state').textContent).toBe('undefined')
  })
})
