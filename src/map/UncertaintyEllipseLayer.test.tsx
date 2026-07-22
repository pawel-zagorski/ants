import { render } from '@testing-library/react'
import { MapContainer } from 'react-leaflet'
import { describe, expect, it } from 'vitest'
import { UncertaintyEllipseLayer } from './UncertaintyEllipseLayer'
import type { FireRuntimeState } from '../engine/types'
import type { Tower } from '../world/types'

const tower: Tower = { id: 'tower-1', type: 'Tower', position: { lat: 64.7, lng: 26.2 }, detectionRadiusMeters: 15000 }

const towerDetectedFire: FireRuntimeState = {
  id: 'fire-1',
  position: { lat: 64.7, lng: 26.2 },
  tier: 'towerDetected',
  spawnAtSimSeconds: 0,
  detectedByAssetId: 'tower-1',
  detectedAtSimSeconds: 0,
}

function renderLayer(
  fires: Record<string, FireRuntimeState>,
  towers: readonly Tower[],
  elapsedSimSeconds: number,
  groundTruthViewEnabled: boolean,
) {
  return render(
    <MapContainer center={[64.5644, 26.4947]} zoom={9}>
      <UncertaintyEllipseLayer
        fires={fires}
        towers={towers}
        elapsedSimSeconds={elapsedSimSeconds}
        groundTruthViewEnabled={groundTruthViewEnabled}
      />
    </MapContainer>,
  )
}

describe('UncertaintyEllipseLayer', () => {
  it('renders an ellipse for a Tower-Detected Fire in the default (non-Ground-Truth) view', () => {
    renderLayer({ 'fire-1': towerDetectedFire }, [tower], 300, false)

    expect(document.querySelectorAll('.uncertainty-ellipse')).toHaveLength(1)
  })

  it('renders nothing when Ground Truth View is enabled', () => {
    renderLayer({ 'fire-1': towerDetectedFire }, [tower], 300, true)

    expect(document.querySelectorAll('.uncertainty-ellipse')).toHaveLength(0)
  })

  it('renders nothing for an Undetected Fire', () => {
    const undetectedFire: FireRuntimeState = { ...towerDetectedFire, tier: 'undetected', detectedByAssetId: undefined, detectedAtSimSeconds: undefined }

    renderLayer({ 'fire-1': undetectedFire }, [tower], 300, false)

    expect(document.querySelectorAll('.uncertainty-ellipse')).toHaveLength(0)
  })

  it('renders nothing for an Investigated Fire (Confirmed Shape is a later issue, not this one)', () => {
    const investigatedFire: FireRuntimeState = { ...towerDetectedFire, tier: 'investigated' }

    renderLayer({ 'fire-1': investigatedFire }, [tower], 300, false)

    expect(document.querySelectorAll('.uncertainty-ellipse')).toHaveLength(0)
  })

  it('renders nothing when there are no spawned Fires', () => {
    renderLayer({}, [tower], 300, false)

    expect(document.querySelectorAll('.uncertainty-ellipse')).toHaveLength(0)
  })

  it('renders nothing when no Tower matches the detecting-Tower id (defensive)', () => {
    const orphanedFire: FireRuntimeState = { ...towerDetectedFire, detectedByAssetId: 'tower-unknown' }

    renderLayer({ 'fire-1': orphanedFire }, [tower], 300, false)

    expect(document.querySelectorAll('.uncertainty-ellipse')).toHaveLength(0)
  })
})
