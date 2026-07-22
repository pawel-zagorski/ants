import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FirePanel } from './FirePanel'
import type { FireRuntimeState } from '../engine/types'

const towerDetectedFire: FireRuntimeState = {
  id: 'fire-1',
  position: { lat: 64.6, lng: 26.4 },
  tier: 'towerDetected',
  spawnAtSimSeconds: 0,
  detectedByAssetId: 'tower-1',
  detectedAtSimSeconds: 3725,
}

describe('FirePanel', () => {
  it('shows the Fire id, current tier, and Detection Status (detecting Tower id and calendar date/time)', () => {
    render(
      <FirePanel fire={towerDetectedFire} startDateTimeIso="2026-06-01T08:00:00.000Z" onClose={vi.fn()} />,
    )

    const panel = screen.getByRole('dialog')
    expect(panel).toHaveTextContent('fire-1')
    expect(panel).toHaveTextContent('Tower-Detected')
    expect(panel).toHaveTextContent('tower-1')
    // 3725s = 1h 2m 5s past the Epoch (2026-06-01T08:00:00Z) => 09:02:05.
    expect(panel).toHaveTextContent('2026-06-01 09:02:05')
  })

  it('falls back to a raw T+MM:SS display when no Scenario Epoch is available', () => {
    render(<FirePanel fire={towerDetectedFire} onClose={vi.fn()} />)

    expect(screen.getByRole('dialog')).toHaveTextContent('T+62:05')
  })

  it('shows "Unknown" for Detected By/Detected At when a Fire has neither (defensive; not reachable for a clickable Fire)', () => {
    const fireWithNoDetection: FireRuntimeState = {
      id: 'fire-2',
      position: { lat: 64.6, lng: 26.4 },
      tier: 'towerDetected',
      spawnAtSimSeconds: 0,
    }

    render(<FirePanel fire={fireWithNoDetection} onClose={vi.fn()} />)

    const panel = screen.getByRole('dialog')
    expect(panel).toHaveTextContent('Unknown')
  })

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn()
    render(<FirePanel fire={towerDetectedFire} onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(onClose).toHaveBeenCalledOnce()
  })
})
