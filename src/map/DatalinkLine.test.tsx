import { render } from '@testing-library/react'
import { MapContainer } from 'react-leaflet'
import { describe, expect, it } from 'vitest'
import { DatalinkLine } from './DatalinkLine'
import { droneSpecFixture } from '../test/worldFixtures'
import type { Drone, Relay } from '../world/types'

const drone: Drone = {
  id: 'drone-1',
  type: 'Quadrocopter',
  position: { lat: 64.501, lng: 26.251 },
  homeBaseStationId: 'base-1',
  ...droneSpecFixture,
}
const relay: Relay = { id: 'base-1', type: 'BaseStation', position: { lat: 64.5, lng: 26.25 } }

function renderDatalinkLine() {
  return render(
    <MapContainer center={[64.5644, 26.4947]} zoom={9}>
      <DatalinkLine drone={drone} relay={relay} distanceMeters={150} />
    </MapContainer>,
  )
}

describe('DatalinkLine', () => {
  it('renders as an actual SVG path element carrying the marching-ants animation class, not just a React prop', () => {
    renderDatalinkLine()

    const path = document.querySelector('path.datalink-line')
    expect(path).not.toBeNull()
    expect(path?.tagName.toLowerCase()).toBe('path')
  })

  it('tags the rendered line with the Drone and Relay ids it connects', () => {
    renderDatalinkLine()

    const path = document.querySelector('path.datalink-line')
    expect(path).toHaveClass('datalink-line-drone-drone-1')
    expect(path).toHaveClass('datalink-line-relay-base-1')
  })
})
