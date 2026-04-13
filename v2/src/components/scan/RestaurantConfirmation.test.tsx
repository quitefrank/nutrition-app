import { vi, describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RestaurantConfirmation } from './RestaurantConfirmation'

// Mock fetch for Places API calls
global.fetch = vi.fn()

describe('RestaurantConfirmation — name-confirm mode (scanKey provided)', () => {
  const onConfirm = vi.fn()
  const onSkip = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders pre-filled name from extractedName prop', () => {
    render(
      <RestaurantConfirmation
        scanKey="plately:scan:test-uuid"
        extractedName="Sala Thai"
        onConfirm={onConfirm}
        onSkip={onSkip}
      />
    )
    const input = screen.getByDisplayValue('Sala Thai')
    expect(input).toBeTruthy()
  })

  it('empty extractedName shows placeholder prompt', () => {
    render(
      <RestaurantConfirmation
        scanKey="plately:scan:test-uuid"
        extractedName={null}
        onConfirm={onConfirm}
        onSkip={onSkip}
      />
    )
    const input = screen.getByPlaceholderText(/restaurant name/i)
    expect(input).toBeTruthy()
  })

  it('confirm button calls onConfirm with current input value', () => {
    render(
      <RestaurantConfirmation
        scanKey="plately:scan:test-uuid"
        extractedName="Sala Thai"
        onConfirm={onConfirm}
        onSkip={onSkip}
      />
    )
    const confirmBtn = screen.getByRole('button', { name: /confirm/i })
    fireEvent.click(confirmBtn)
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Sala Thai' })
    )
  })

  it('confirm button passes edited name', () => {
    render(
      <RestaurantConfirmation
        scanKey="plately:scan:test-uuid"
        extractedName="Sala Thai"
        onConfirm={onConfirm}
        onSkip={onSkip}
      />
    )
    const input = screen.getByDisplayValue('Sala Thai')
    fireEvent.change(input, { target: { value: 'Sala Thai Restaurant' } })
    const confirmBtn = screen.getByRole('button', { name: /confirm/i })
    fireEvent.click(confirmBtn)
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Sala Thai Restaurant' })
    )
  })

  it('skip button calls onSkip', () => {
    render(
      <RestaurantConfirmation
        scanKey="plately:scan:test-uuid"
        extractedName="Sala Thai"
        onConfirm={onConfirm}
        onSkip={onSkip}
      />
    )
    const skipBtn = screen.getByRole('button', { name: /skip/i })
    fireEvent.click(skipBtn)
    expect(onSkip).toHaveBeenCalledTimes(1)
  })

  it('"Search instead" button switches to search mode', () => {
    render(
      <RestaurantConfirmation
        scanKey="plately:scan:test-uuid"
        extractedName="Sala Thai"
        onConfirm={onConfirm}
        onSkip={onSkip}
      />
    )
    const searchBtn = screen.getByRole('button', { name: /search instead/i })
    fireEvent.click(searchBtn)
    // After switching, the search-by-name / location UI should appear
    expect(screen.getByRole('button', { name: /use my location/i })).toBeTruthy()
  })
})

describe('RestaurantConfirmation — search mode (no scanKey)', () => {
  const onConfirm = vi.fn()
  const onSkip = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders GPS and text search buttons in idle mode', () => {
    render(
      <RestaurantConfirmation
        onConfirm={onConfirm}
        onSkip={onSkip}
      />
    )
    expect(screen.getByRole('button', { name: /use my location/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /search by restaurant name/i })).toBeTruthy()
  })

  it('skip button calls onSkip in search mode', () => {
    render(
      <RestaurantConfirmation
        onConfirm={onConfirm}
        onSkip={onSkip}
      />
    )
    const skipBtn = screen.getByRole('button', { name: /skip restaurant identification/i })
    fireEvent.click(skipBtn)
    expect(onSkip).toHaveBeenCalledTimes(1)
  })
})
