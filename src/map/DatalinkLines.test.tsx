import { render } from '@testing-library/react'
import { MapContainer } from 'react-leaflet'
import { describe, expect, it } from 'vitest'
import { DatalinkLines } from './DatalinkLines'
import { createWorldFixture, droneSpecFixture } from '../test/worldFixtures'
import type { World } from '../world/types'

function renderDatalinkLines(world: World) {
  return render(
    <MapContainer center={[64.5644, 26.4947]} zoom={9}>
      <DatalinkLines world={world} />
    </MapContainer>,
  )
}

describe('DatalinkLines', () => {
  it('renders exactly one animated Datalink line per Drone', () => {
    const world = createWorldFixture({
      towers: [{ id: 'tower-1', type: 'Tower', position: { lat: 64.7, lng: 26.2 }, detectionRadiusMeters: 15000 }],
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
          position: { lat: 64.699, lng: 26.201 },
          homeBaseStationId: 'base-1',
          ...droneSpecFixture,
        },
      ],
    })

    renderDatalinkLines(world)

    expect(document.querySelectorAll('path.datalink-line')).toHaveLength(2)
  })

  it("connects each Drone's line to its own nearest Relay, not just the World's first Relay", () => {
    const world = createWorldFixture({
      towers: [{ id: 'tower-1', type: 'Tower', position: { lat: 64.7, lng: 26.2 }, detectionRadiusMeters: 15000 }],
      baseStations: [
        { id: 'base-1', type: 'BaseStation', position: { lat: 64.5, lng: 26.25 } },
        { id: 'base-2', type: 'BaseStation', position: { lat: 64.62, lng: 26.7 } },
      ],
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
          type: 'Quadrocopter',
          position: { lat: 64.619, lng: 26.699 },
          homeBaseStationId: 'base-2',
          ...droneSpecFixture,
        },
      ],
    })

    renderDatalinkLines(world)

    expect(document.querySelector('.datalink-line-drone-drone-1.datalink-line-relay-base-1')).not.toBeNull()
    expect(document.querySelector('.datalink-line-drone-drone-2.datalink-line-relay-base-2')).not.toBeNull()
  })

  it('renders nothing when the World has no Drones', () => {
    const world = createWorldFixture({ drones: [] })

    renderDatalinkLines(world)

    expect(document.querySelectorAll('path.datalink-line')).toHaveLength(0)
  })
})

describe('DatalinkLines nearest-Relay retargeting', () => {
  const baseStations = [
    { id: 'base-1', type: 'BaseStation' as const, position: { lat: 64.5, lng: 26.25 } },
    { id: 'base-2', type: 'BaseStation' as const, position: { lat: 64.62, lng: 26.7 } },
  ]

  it('targets the nearer Base Station when the Drone patrols near it', () => {
    const world = createWorldFixture({
      baseStations,
      drones: [
        {
          id: 'drone-1',
          type: 'Quadrocopter',
          position: { lat: 64.501, lng: 26.251 },
          homeBaseStationId: 'base-1',
          ...droneSpecFixture,
        },
      ],
    })

    renderDatalinkLines(world)

    expect(document.querySelector('.datalink-line-relay-base-1')).not.toBeNull()
    expect(document.querySelector('.datalink-line-relay-base-2')).toBeNull()
  })

  it('retargets to the other Base Station once the Drone patrols closer to it instead', () => {
    const world = createWorldFixture({
      baseStations,
      drones: [
        {
          id: 'drone-1',
          type: 'Quadrocopter',
          position: { lat: 64.619, lng: 26.699 },
          homeBaseStationId: 'base-1',
          ...droneSpecFixture,
        },
      ],
    })

    renderDatalinkLines(world)

    expect(document.querySelector('.datalink-line-relay-base-2')).not.toBeNull()
    expect(document.querySelector('.datalink-line-relay-base-1')).toBeNull()
  })
})
