import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ClearcutPanel } from './ClearcutPanel'
import type { ClearcutRuntimeState } from '../engine/types'

const detectedClearcut: ClearcutRuntimeState = {
  id: 'clearcut-1',
  position: { lat: 64.52, lng: 26.25 },
  tier: 'detected',
  spawnAtSimSeconds: 0,
  semiMajorAxisMeters: 400,
  semiMinorAxisMeters: 120,
  orientationDegrees: 40,
  detectedByAssetId: 'drone-2',
  detectedAtSimSeconds: 3725,
  detectedFromDistanceMeters: 900,
}

describe('ClearcutPanel', () => {
  it('shows the Clearcut id, Type, detecting Drone, calendar date/time, and tier', () => {
    render(
      <ClearcutPanel clearcut={detectedClearcut} startDateTimeIso="2026-06-01T08:00:00.000Z" onClose={vi.fn()} />,
    )

    const panel = screen.getByRole('dialog')
    expect(panel).toHaveTextContent('clearcut-1')
    expect(panel).toHaveTextContent('Illegal Deforestation')
    expect(panel).toHaveTextContent('drone-2')
    expect(panel).toHaveTextContent('Detected')
    // 3725s = 1h 2m 5s past the Epoch (2026-06-01T08:00:00Z) => 09:02:05.
    expect(panel).toHaveTextContent('2026-06-01 09:02:05')
  })

  it('shows the logging.jpg banner photo', () => {
    render(<ClearcutPanel clearcut={detectedClearcut} onClose={vi.fn()} />)

    const photo = screen.getByRole('img', { name: 'Illegal Deforestation' })
    expect(photo).toHaveAttribute('src', '/img/logging.jpg')
    expect(photo).toHaveClass('asset-panel-photo')
  })

  it('falls back to a raw T+MM:SS display when no Scenario Epoch is available', () => {
    render(<ClearcutPanel clearcut={detectedClearcut} onClose={vi.fn()} />)

    expect(screen.getByRole('dialog')).toHaveTextContent('T+62:05')
  })

  it('shows "Unknown" for Detected By/At when a Clearcut has neither (defensive)', () => {
    const undetectedFields: ClearcutRuntimeState = {
      ...detectedClearcut,
      detectedByAssetId: undefined,
      detectedAtSimSeconds: undefined,
    }
    render(<ClearcutPanel clearcut={undetectedFields} onClose={vi.fn()} />)

    expect(screen.getByRole('dialog')).toHaveTextContent('Unknown')
  })

  it('has NO dispatch UI in this slice (no Send button)', () => {
    render(<ClearcutPanel clearcut={detectedClearcut} onClose={vi.fn()} />)

    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull()
  })

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn()
    render(<ClearcutPanel clearcut={detectedClearcut} onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(onClose).toHaveBeenCalledOnce()
  })
})
