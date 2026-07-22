import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MapLegend } from './MapLegend'

describe('MapLegend', () => {
  it('always explains the amber Return Envelope ellipses in CONTEXT.md vocabulary', () => {
    render(<MapLegend />)

    expect(screen.getByText(/Return Envelope/i)).toBeInTheDocument()
    expect(screen.getByText(/reach and get back to a Base Station/i)).toBeInTheDocument()
    expect(screen.getByText(/while a Drone's status panel is open/i)).toBeInTheDocument()
  })

  it("avoids the terms CONTEXT.md says not to use (no 'fuel')", () => {
    const { container } = render(<MapLegend />)

    expect(container.textContent ?? '').not.toMatch(/fuel/i)
  })

  it('shows an amber dashed swatch matching the ellipse style', () => {
    const { container } = render(<MapLegend />)

    expect(container.querySelector('.map-legend-swatch-return-envelope')).not.toBeNull()
  })
})
