import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RokuaMap } from './RokuaMap'
import type { World } from '../world/types'

const world: World = {
  bounds: { southWest: { lat: 64.3398, lng: 25.9718 }, northEast: { lat: 64.789, lng: 27.0176 } },
  towers: [
    { id: 'tower-1', type: 'Tower', position: { lat: 64.7, lng: 26.2 }, detectionRadiusMeters: 15000 },
  ],
  baseStations: [{ id: 'base-1', type: 'BaseStation', position: { lat: 64.5, lng: 26.25 } }],
  drones: [
    {
      id: 'drone-1',
      type: 'Quadrocopter',
      position: { lat: 64.502, lng: 26.252 },
      homeBaseStationId: 'base-1',
    },
    {
      id: 'drone-2',
      type: 'FixedWingDrone',
      position: { lat: 64.51, lng: 26.24 },
      homeBaseStationId: 'base-1',
    },
  ],
}

describe('RokuaMap', () => {
  it('renders a distinct marker per asset kind and no panel until one is clicked', () => {
    render(<RokuaMap world={world} />)

    expect(document.querySelectorAll('.asset-icon-tower')).toHaveLength(1)
    expect(document.querySelectorAll('.asset-icon-base-station')).toHaveLength(1)
    expect(document.querySelectorAll('.asset-icon-quadrocopter')).toHaveLength(1)
    expect(document.querySelectorAll('.asset-icon-fixed-wing-drone')).toHaveLength(1)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens a status panel with id/type/position when a marker is clicked', () => {
    render(<RokuaMap world={world} />)

    const droneMarker = document.querySelector('.asset-icon-quadrocopter')
    expect(droneMarker).not.toBeNull()
    fireEvent.click(droneMarker as Element)

    const panel = screen.getByRole('dialog')
    expect(panel).toHaveTextContent('drone-1')
    expect(panel).toHaveTextContent('Quadrocopter')
    expect(panel).toHaveTextContent('64.5020, 26.2520')
  })

  it('displays Base Station and Fixed-Wing Drone using their exact CONTEXT.md vocabulary', () => {
    render(<RokuaMap world={world} />)

    fireEvent.click(document.querySelector('.asset-icon-base-station') as Element)
    expect(screen.getByRole('dialog')).toHaveTextContent('Base Station')

    fireEvent.click(document.querySelector('.asset-icon-fixed-wing-drone') as Element)
    expect(screen.getByRole('dialog')).toHaveTextContent('Fixed-Wing Drone')
  })

  it('switches the panel to the newly clicked asset', () => {
    render(<RokuaMap world={world} />)

    fireEvent.click(document.querySelector('.asset-icon-quadrocopter') as Element)
    fireEvent.click(document.querySelector('.asset-icon-tower') as Element)

    const panel = screen.getByRole('dialog')
    expect(panel).toHaveTextContent('tower-1')
    expect(screen.queryByText('drone-1')).toBeNull()
  })

  it('closes the panel when its close button is clicked', () => {
    render(<RokuaMap world={world} />)

    fireEvent.click(document.querySelector('.asset-icon-tower') as Element)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
