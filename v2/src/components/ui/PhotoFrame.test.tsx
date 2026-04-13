import { vi, describe, it, expect } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { PhotoFrame } from './PhotoFrame'

vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    onError,
    fill: _fill,
    className,
    unoptimized: _unoptimized,
  }: {
    src: string
    alt: string
    onError?: () => void
    fill?: boolean
    className?: string
    unoptimized?: boolean
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} onError={onError} className={className} data-testid="dish-image" />
  ),
}))

const defaultProps = {
  dishName: 'Pad Thai',
  className: 'w-[72px] h-[72px]',
}

describe('PhotoFrame', () => {
  it('confirmed state: renders img with correct src and alt', () => {
    render(
      <PhotoFrame
        {...defaultProps}
        photoStatus="confirmed"
        dishImageUrl="https://example.com/photo.jpg"
      />
    )
    const img = screen.getByTestId('dish-image')
    expect(img.getAttribute('src')).toBe('https://example.com/photo.jpg')
    expect(img.getAttribute('alt')).toBe('Pad Thai')
  })

  it('confirmed state: no placeholder label rendered', () => {
    render(
      <PhotoFrame
        {...defaultProps}
        photoStatus="confirmed"
        dishImageUrl="https://example.com/photo.jpg"
      />
    )
    expect(screen.queryByText('No photo available')).toBeNull()
  })

  it('placeholder state: renders "No photo available" text', () => {
    render(
      <PhotoFrame
        {...defaultProps}
        photoStatus="placeholder"
        dishImageUrl={null}
      />
    )
    expect(screen.getByText('No photo available')).toBeTruthy()
  })

  it('placeholder state: does NOT render an img element', () => {
    render(
      <PhotoFrame
        {...defaultProps}
        photoStatus="placeholder"
        dishImageUrl={null}
      />
    )
    expect(screen.queryByTestId('dish-image')).toBeNull()
  })

  it('placeholder state: aria-label does not contain "loading"', () => {
    render(
      <PhotoFrame
        {...defaultProps}
        photoStatus="placeholder"
        dishImageUrl={null}
      />
    )
    const tile = screen.getByLabelText(/no photo for/i)
    expect(tile).toBeTruthy()
    expect(tile.getAttribute('aria-label')?.toLowerCase()).not.toContain('loading')
  })

  it('suppressed state: renders nothing (returns null)', () => {
    const { container } = render(
      <PhotoFrame
        {...defaultProps}
        photoStatus="suppressed"
        dishImageUrl={null}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('error fallback: when confirmed img fires onError, shows placeholder label', () => {
    render(
      <PhotoFrame
        {...defaultProps}
        photoStatus="confirmed"
        dishImageUrl="https://example.com/photo.jpg"
      />
    )
    fireEvent.error(screen.getByTestId('dish-image'))
    expect(screen.getByText('No photo available')).toBeTruthy()
  })

  it('error fallback: after onError, no img element visible', () => {
    render(
      <PhotoFrame
        {...defaultProps}
        photoStatus="confirmed"
        dishImageUrl="https://example.com/photo.jpg"
      />
    )
    fireEvent.error(screen.getByTestId('dish-image'))
    expect(screen.queryByTestId('dish-image')).toBeNull()
  })

  it('error fallback: placeholder aria-label present after onError', () => {
    render(
      <PhotoFrame
        {...defaultProps}
        photoStatus="confirmed"
        dishImageUrl="https://example.com/photo.jpg"
      />
    )
    fireEvent.error(screen.getByTestId('dish-image'))
    expect(screen.getByLabelText(/no photo for/i)).toBeTruthy()
  })

  it('confirmed state with null URL: renders placeholder, no img', () => {
    render(
      <PhotoFrame
        {...defaultProps}
        photoStatus="confirmed"
        dishImageUrl={null}
      />
    )
    expect(screen.queryByTestId('dish-image')).toBeNull()
    expect(screen.getByText('No photo available')).toBeTruthy()
  })

  it('imageError resets when dishImageUrl prop changes', () => {
    const { rerender } = render(
      <PhotoFrame
        {...defaultProps}
        photoStatus="confirmed"
        dishImageUrl="https://example.com/broken.jpg"
      />
    )
    fireEvent.error(screen.getByTestId('dish-image'))
    expect(screen.getByText('No photo available')).toBeTruthy()

    act(() => {
      rerender(
        <PhotoFrame
          {...defaultProps}
          photoStatus="confirmed"
          dishImageUrl="https://example.com/new.jpg"
        />
      )
    })
    expect(screen.getByTestId('dish-image')).toBeTruthy()
    expect(screen.queryByText('No photo available')).toBeNull()
  })
})
