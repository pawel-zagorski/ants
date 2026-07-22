import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { WindIndicator } from './WindIndicator'
import type { Wind } from '../scenario/types'

function renderWindIndicator(wind: Wind) {
  return render(<WindIndicator wind={wind} />)
}

describe('WindIndicator', () => {
  it('labels the Scenario\'s wind speed', () => {
    renderWindIndicator({ directionDegrees: 90, speedMetersPerSecond: 6 })

    expect(screen.getByText('6 m/s')).toBeInTheDocument()
  })

  it('shows a different speed label for a different Scenario\'s wind (reflects per-scenario data, not a hardcoded default)', () => {
    renderWindIndicator({ directionDegrees: 90, speedMetersPerSecond: 11 })

    expect(screen.getByText('11 m/s')).toBeInTheDocument()
    expect(screen.queryByText('6 m/s')).toBeNull()
  })

  // A 0deg (northerly, from-North) wind blows TOWARD the south — the
  // up-pointing arrow glyph must rotate a full 180deg to point south, per
  // the meteorological FROM-convention documented on `Wind` in
  // `../scenario/types` and applied in `WindIndicator.tsx`.
  it('rotates the arrow 180deg from a due-north (0deg) FROM-direction, so it points due south (the direction blowing TOWARD)', () => {
    renderWindIndicator({ directionDegrees: 0, speedMetersPerSecond: 5 })

    const arrow = document.querySelector('.wind-indicator-arrow') as HTMLElement
    expect(arrow.style.transform).toBe('rotate(180deg)')
  })

  // A due-east (90deg) FROM-direction blows TOWARD the west (270deg) —
  // confirms the +180 offset isn't a coincidence of the 0deg case above.
  it('rotates the arrow to 270deg from a due-east (90deg) FROM-direction, so it points due west', () => {
    renderWindIndicator({ directionDegrees: 90, speedMetersPerSecond: 5 })

    const arrow = document.querySelector('.wind-indicator-arrow') as HTMLElement
    expect(arrow.style.transform).toBe('rotate(270deg)')
  })

  it('wraps the rotation back into [0, 360) rather than exceeding 360deg', () => {
    renderWindIndicator({ directionDegrees: 270, speedMetersPerSecond: 5 })

    const arrow = document.querySelector('.wind-indicator-arrow') as HTMLElement
    expect(arrow.style.transform).toBe('rotate(90deg)')
  })
})
