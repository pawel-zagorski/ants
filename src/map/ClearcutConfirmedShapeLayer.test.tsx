import { render } from '@testing-library/react'
import { MapContainer } from 'react-leaflet'
import { describe, expect, it } from 'vitest'
import { ClearcutConfirmedShapeLayer } from './ClearcutConfirmedShapeLayer'
import { clearcutFootprintHexCells } from '../engine/clearcutFootprint'
import type { ClearcutRuntimeState } from '../engine/types'

const investigatedClearcut: ClearcutRuntimeState = {
  id: 'clearcut-1',
  position: { lat: 64.6, lng: 26.4 },
  tier: 'investigated',
  spawnAtSimSeconds: 0,
  semiMajorAxisMeters: 400,
  semiMinorAxisMeters: 120,
  orientationDegrees: 40,
  detectedByAssetId: 'drone-1',
  detectedAtSimSeconds: 0,
  detectedFromDistanceMeters: 900,
}

function renderLayer(clearcuts: Record<string, ClearcutRuntimeState>, groundTruthViewEnabled: boolean) {
  return render(
    <MapContainer center={[64.5644, 26.4947]} zoom={9}>
      <ClearcutConfirmedShapeLayer clearcuts={clearcuts} groundTruthViewEnabled={groundTruthViewEnabled} />
    </MapContainer>,
  )
}

describe('ClearcutConfirmedShapeLayer', () => {
  it('renders one hex tile per real Clearcut Footprint cell for an Investigated Clearcut in the default (non-Ground-Truth) view', () => {
    renderLayer({ 'clearcut-1': investigatedClearcut }, false)

    const expectedHexCellCount = clearcutFootprintHexCells(investigatedClearcut).length
    expect(document.querySelectorAll('.confirmed-shape-hex')).toHaveLength(expectedHexCellCount)
    expect(expectedHexCellCount).toBeGreaterThan(0)
  })

  it('renders nothing when Ground Truth View is enabled (Ground Truth always shows the real static footprint via ClearcutFootprintLayer instead)', () => {
    renderLayer({ 'clearcut-1': investigatedClearcut }, true)

    expect(document.querySelectorAll('.confirmed-shape-hex')).toHaveLength(0)
  })

  it('renders nothing for a detected (not yet investigated) Clearcut — it renders the Uncertainty Ellipse estimate instead', () => {
    const detectedClearcut: ClearcutRuntimeState = { ...investigatedClearcut, tier: 'detected' }

    renderLayer({ 'clearcut-1': detectedClearcut }, false)

    expect(document.querySelectorAll('.confirmed-shape-hex')).toHaveLength(0)
  })

  it('renders nothing for an undetected Clearcut', () => {
    const undetectedClearcut: ClearcutRuntimeState = {
      ...investigatedClearcut,
      tier: 'undetected',
      detectedByAssetId: undefined,
      detectedAtSimSeconds: undefined,
      detectedFromDistanceMeters: undefined,
    }

    renderLayer({ 'clearcut-1': undetectedClearcut }, false)

    expect(document.querySelectorAll('.confirmed-shape-hex')).toHaveLength(0)
  })

  it('renders nothing when there are no spawned Clearcuts', () => {
    renderLayer({}, false)

    expect(document.querySelectorAll('.confirmed-shape-hex')).toHaveLength(0)
  })

  it('renders the exact same permanent shape regardless of which Drone investigated it or when (no staleness/freeze concept, unlike Fire)', () => {
    const differentlyDetectedButSameShape: ClearcutRuntimeState = {
      ...investigatedClearcut,
      detectedByAssetId: 'some-other-drone',
      detectedAtSimSeconds: 99999,
      detectedFromDistanceMeters: 42,
    }

    const first = renderLayer({ 'clearcut-1': investigatedClearcut }, false)
    const firstRenderCount = first.container.querySelectorAll('.confirmed-shape-hex').length
    first.unmount()

    const second = renderLayer({ 'clearcut-1': differentlyDetectedButSameShape }, false)
    const secondRenderCount = second.container.querySelectorAll('.confirmed-shape-hex').length

    expect(secondRenderCount).toBe(firstRenderCount)
  })
})
