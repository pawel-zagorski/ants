import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AssetPanel } from './AssetPanel'
import type { EventRuntimeState } from '../engine/types'
import type { Drone, Tower } from '../world/types'

const tower: Tower = {
  id: 'tower-1',
  type: 'Tower',
  position: { lat: 64.7, lng: 26.2 },
  detectionRadiusMeters: 15000,
}

const drone: Drone = {
  id: 'drone-1',
  type: 'Quadrocopter',
  position: { lat: 64.502, lng: 26.252 },
  homeBaseStationId: 'base-1',
}

describe('AssetPanel', () => {
  it('shows the asset id, type, and position', () => {
    render(<AssetPanel asset={tower} events={{}} onClose={vi.fn()} />)

    expect(screen.getByText('tower-1')).toBeInTheDocument()
    expect(screen.getByText('Tower')).toBeInTheDocument()
    expect(screen.getByText('64.7000, 26.2000')).toBeInTheDocument()
  })

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn()
    render(<AssetPanel asset={tower} events={{}} onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(onClose).toHaveBeenCalledOnce()
  })
})

describe('AssetPanel Tower tracked Fire Event', () => {
  it('shows "no Fire Event" when the Tower has not Detected one', () => {
    render(<AssetPanel asset={tower} events={{}} onClose={vi.fn()} />)

    expect(screen.getByText('Tracking')).toBeInTheDocument()
    expect(screen.getByText(/no fire event/i)).toBeInTheDocument()
  })

  it('shows the Fire Event id the Tower is currently tracking', () => {
    const events: Record<string, EventRuntimeState> = {
      'fire-1': {
        id: 'fire-1',
        type: 'Fire',
        position: { lat: 64.701, lng: 26.201 },
        status: 'detected',
        spawnAtSimSeconds: 0,
        detectedByAssetId: 'tower-1',
      },
    }

    render(<AssetPanel asset={tower} events={events} onClose={vi.fn()} />)

    expect(screen.getByText(/fire-1/)).toBeInTheDocument()
  })

  it('does not show a Fire Event Detected by a different asset', () => {
    const events: Record<string, EventRuntimeState> = {
      'fire-1': {
        id: 'fire-1',
        type: 'Fire',
        position: { lat: 64.701, lng: 26.201 },
        status: 'detected',
        spawnAtSimSeconds: 0,
        detectedByAssetId: 'drone-1',
      },
    }

    render(<AssetPanel asset={tower} events={events} onClose={vi.fn()} />)

    expect(screen.getByText(/no fire event/i)).toBeInTheDocument()
  })

  it('does not show a Tracking field for a non-Tower asset', () => {
    render(<AssetPanel asset={drone} events={{}} onClose={vi.fn()} />)

    expect(screen.queryByText('Tracking')).toBeNull()
  })
})
