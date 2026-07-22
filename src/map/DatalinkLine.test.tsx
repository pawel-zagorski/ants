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

function renderDatalinkLine(distanceMeters: number) {
  return render(
    <MapContainer center={[64.5644, 26.4947]} zoom={9}>
      <DatalinkLine drone={drone} relay={relay} distanceMeters={distanceMeters} />
    </MapContainer>,
  )
}

describe('DatalinkLine', () => {
  it('renders as an actual SVG path element carrying the marching-ants animation class, not just a React prop', () => {
    renderDatalinkLine(150)

    const path = document.querySelector('path.datalink-line')
    expect(path).not.toBeNull()
    expect(path?.tagName.toLowerCase()).toBe('path')
  })

  it('tags the rendered line with the Drone and Relay ids it connects', () => {
    renderDatalinkLine(150)

    const path = document.querySelector('path.datalink-line')
    expect(path).toHaveClass('datalink-line-drone-drone-1')
    expect(path).toHaveClass('datalink-line-relay-base-1')
  })

  it('stays in the normal animated dashed state when within datalinkRangeMeters (issue M)', () => {
    renderDatalinkLine(drone.datalinkRangeMeters - 1)

    const path = document.querySelector('path')
    expect(path).toHaveClass('datalink-line')
    expect(path).not.toHaveClass('datalink-line-out-of-range')
  })

  it('switches to a solid, non-animated out-of-range class when the distance exceeds datalinkRangeMeters (issue M)', () => {
    renderDatalinkLine(drone.datalinkRangeMeters + 1)

    const path = document.querySelector('path')
    expect(path).toHaveClass('datalink-line-out-of-range')
    expect(path).not.toHaveClass('datalink-line')
  })

  it('still tags the out-of-range line with the Drone and Relay ids it connects', () => {
    renderDatalinkLine(drone.datalinkRangeMeters + 1)

    const path = document.querySelector('path.datalink-line-out-of-range')
    expect(path).toHaveClass('datalink-line-drone-drone-1')
    expect(path).toHaveClass('datalink-line-relay-base-1')
  })
})
