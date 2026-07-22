import { render } from '@testing-library/react'
import { MapContainer } from 'react-leaflet'
import { describe, expect, it } from 'vitest'
import { FireFootprintLayer } from './FireFootprintLayer'
import type { FireRuntimeState } from '../engine/types'
import type { Wind } from '../scenario/types'

const WIND: Wind = { directionDegrees: 0, speedMetersPerSecond: 5 }

const fire: FireRuntimeState = {
  id: 'fire-1',
  position: { lat: 64.6, lng: 26.4 },
  tier: 'undetected',
  spawnAtSimSeconds: 0,
}

function renderLayer(fires: Record<string, FireRuntimeState>, elapsedSimSeconds: number, groundTruthViewEnabled: boolean) {
  return render(
    <MapContainer center={[64.5644, 26.4947]} zoom={9}>
      <FireFootprintLayer
        fires={fires}
        wind={WIND}
        elapsedSimSeconds={elapsedSimSeconds}
        groundTruthViewEnabled={groundTruthViewEnabled}
      />
    </MapContainer>,
  )
}

describe('FireFootprintLayer', () => {
  it('renders nothing when Ground Truth View is disabled, however long the Fire has been growing', () => {
    renderLayer({ 'fire-1': fire }, 600, false)

    expect(document.querySelectorAll('.fire-footprint-hex')).toHaveLength(0)
  })

  it('renders at least one hex tile per spawned Fire when Ground Truth View is enabled', () => {
    renderLayer({ 'fire-1': fire }, 600, true)

    expect(document.querySelectorAll('.fire-footprint-hex').length).toBeGreaterThan(0)
  })

  it('renders more hex tiles as more simulated time elapses since ignition', () => {
    renderLayer({ 'fire-1': fire }, 30, true)
    const earlyCount = document.querySelectorAll('.fire-footprint-hex').length

    document.body.innerHTML = ''

    renderLayer({ 'fire-1': fire }, 2000, true)
    const laterCount = document.querySelectorAll('.fire-footprint-hex').length

    expect(laterCount).toBeGreaterThan(earlyCount)
  })

  it('renders nothing when there are no spawned Fires', () => {
    renderLayer({}, 600, true)

    expect(document.querySelectorAll('.fire-footprint-hex')).toHaveLength(0)
  })
})
