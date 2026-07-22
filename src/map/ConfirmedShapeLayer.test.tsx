import { render } from '@testing-library/react'
import { MapContainer } from 'react-leaflet'
import { describe, expect, it } from 'vitest'
import { ConfirmedShapeLayer } from './ConfirmedShapeLayer'
import type { FireRuntimeState } from '../engine/types'

const investigatedFire: FireRuntimeState = {
  id: 'fire-1',
  position: { lat: 64.6, lng: 26.4 },
  tier: 'investigated',
  spawnAtSimSeconds: 0,
  detectedByAssetId: 'tower-1',
  detectedAtSimSeconds: 0,
  confirmedFootprintHexCells: [{ q: 0, r: 0 }, { q: 1, r: 0 }],
  confirmedAtSimSeconds: 120,
}

function renderLayer(fires: Record<string, FireRuntimeState>, groundTruthViewEnabled: boolean) {
  return render(
    <MapContainer center={[64.5644, 26.4947]} zoom={9}>
      <ConfirmedShapeLayer fires={fires} groundTruthViewEnabled={groundTruthViewEnabled} />
    </MapContainer>,
  )
}

describe('ConfirmedShapeLayer', () => {
  it('renders one hex tile per Confirmed Shape cell for an Investigated Fire in the default (non-Ground-Truth) view', () => {
    renderLayer({ 'fire-1': investigatedFire }, false)

    expect(document.querySelectorAll('.confirmed-shape-hex')).toHaveLength(2)
  })

  it('renders nothing when Ground Truth View is enabled (Ground Truth always shows the real live footprint via FireFootprintLayer instead)', () => {
    renderLayer({ 'fire-1': investigatedFire }, true)

    expect(document.querySelectorAll('.confirmed-shape-hex')).toHaveLength(0)
  })

  it('renders nothing for a towerDetected Fire (no Confirmed Shape yet — it renders the Uncertainty Ellipse instead)', () => {
    const towerDetectedFire: FireRuntimeState = {
      ...investigatedFire,
      tier: 'towerDetected',
      confirmedFootprintHexCells: undefined,
      confirmedAtSimSeconds: undefined,
    }

    renderLayer({ 'fire-1': towerDetectedFire }, false)

    expect(document.querySelectorAll('.confirmed-shape-hex')).toHaveLength(0)
  })

  it('renders nothing for an undetected Fire', () => {
    const undetectedFire: FireRuntimeState = {
      ...investigatedFire,
      tier: 'undetected',
      detectedByAssetId: undefined,
      detectedAtSimSeconds: undefined,
      confirmedFootprintHexCells: undefined,
      confirmedAtSimSeconds: undefined,
    }

    renderLayer({ 'fire-1': undetectedFire }, false)

    expect(document.querySelectorAll('.confirmed-shape-hex')).toHaveLength(0)
  })

  it('renders nothing for an Investigated Fire that defensively has no Confirmed Shape cells recorded (should not happen in practice)', () => {
    const shapelessFire: FireRuntimeState = { ...investigatedFire, confirmedFootprintHexCells: undefined }

    renderLayer({ 'fire-1': shapelessFire }, false)

    expect(document.querySelectorAll('.confirmed-shape-hex')).toHaveLength(0)
  })

  it('renders nothing when there are no spawned Fires', () => {
    renderLayer({}, false)

    expect(document.querySelectorAll('.confirmed-shape-hex')).toHaveLength(0)
  })
})
