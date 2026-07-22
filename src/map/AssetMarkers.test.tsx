import { render } from '@testing-library/react'
import { MapContainer } from 'react-leaflet'
import { describe, expect, it, vi } from 'vitest'
import { AssetMarkers } from './AssetMarkers'
import type { DroneActivityState } from '../engine/types'
import { createWorldFixture, droneSpecFixture } from '../test/worldFixtures'
import type { World } from '../world/types'

function renderAssetMarkers(world: World, droneActivity?: Record<string, DroneActivityState>) {
  return render(
    <MapContainer center={[64.5644, 26.4947]} zoom={9}>
      <AssetMarkers world={world} droneActivity={droneActivity} onSelect={vi.fn()} />
    </MapContainer>,
  )
}

describe('AssetMarkers Lost Drone treatment (issue W)', () => {
  const world: World = createWorldFixture({
    baseStations: [{ id: 'base-1', type: 'BaseStation', position: { lat: 64.5, lng: 26.25 } }],
    drones: [
      {
        id: 'drone-1',
        type: 'Quadrocopter',
        position: { lat: 64.501, lng: 26.251 },
        homeBaseStationId: 'base-1',
        ...droneSpecFixture,
      },
      {
        id: 'drone-2',
        type: 'FixedWingDrone',
        position: { lat: 64.51, lng: 26.24 },
        homeBaseStationId: 'base-1',
        ...droneSpecFixture,
      },
    ],
  })

  it('renders a Lost Drone marker with the asset-icon-lost class', () => {
    const droneActivity: Record<string, DroneActivityState> = {
      'drone-1': { mode: 'lost', position: { lat: 64.501, lng: 26.251 }, lostAtSimSeconds: 100 },
      'drone-2': { mode: 'patrolling' },
    }

    renderAssetMarkers(world, droneActivity)

    expect(document.querySelector('.asset-icon-quadrocopter')).toHaveClass('asset-icon-lost')
    expect(document.querySelector('.asset-icon-fixed-wing-drone')).not.toHaveClass('asset-icon-lost')
  })

  it('renders no asset-icon-lost class for any Drone when none is Lost', () => {
    const droneActivity: Record<string, DroneActivityState> = {
      'drone-1': { mode: 'patrolling' },
      'drone-2': { mode: 'patrolling' },
    }

    renderAssetMarkers(world, droneActivity)

    expect(document.querySelectorAll('.asset-icon-lost')).toHaveLength(0)
  })

  it('defaults to no Lost Drones when droneActivity is omitted entirely', () => {
    renderAssetMarkers(world)

    expect(document.querySelectorAll('.asset-icon-lost')).toHaveLength(0)
  })

  it('never applies the Lost treatment to a Tower or Base Station', () => {
    const worldWithTower: World = { ...world, towers: [{ id: 'tower-1', type: 'Tower', position: { lat: 64.7, lng: 26.2 }, detectionRadiusMeters: 15000 }] }
    const droneActivity: Record<string, DroneActivityState> = {
      'drone-1': { mode: 'lost', position: { lat: 64.501, lng: 26.251 }, lostAtSimSeconds: 100 },
      'drone-2': { mode: 'patrolling' },
    }

    renderAssetMarkers(worldWithTower, droneActivity)

    expect(document.querySelector('.asset-icon-tower')).not.toHaveClass('asset-icon-lost')
    expect(document.querySelector('.asset-icon-base-station')).not.toHaveClass('asset-icon-lost')
  })
})
