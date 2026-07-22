import { fireEvent, render } from '@testing-library/react'
import { MapContainer } from 'react-leaflet'
import { describe, expect, it, vi } from 'vitest'
import { FireMarkers } from './FireMarkers'
import type { FireRuntimeState } from '../engine/types'

const undetectedFire: FireRuntimeState = {
  id: 'fire-1',
  position: { lat: 64.6, lng: 26.4 },
  tier: 'undetected',
  spawnAtSimSeconds: 0,
}

const towerDetectedFire: FireRuntimeState = {
  id: 'fire-2',
  position: { lat: 64.7, lng: 26.2 },
  tier: 'towerDetected',
  spawnAtSimSeconds: 0,
  detectedByAssetId: 'tower-1',
  detectedAtSimSeconds: 0,
}

function renderMarkers(
  fires: Record<string, FireRuntimeState>,
  groundTruthViewEnabled: boolean,
  onSelect: (fire: FireRuntimeState) => void = vi.fn(),
) {
  return render(
    <MapContainer center={[64.5644, 26.4947]} zoom={9}>
      <FireMarkers fires={fires} groundTruthViewEnabled={groundTruthViewEnabled} onSelect={onSelect} />
    </MapContainer>,
  )
}

describe('FireMarkers', () => {
  it('renders nothing when Ground Truth View is disabled, even with a spawned Undetected Fire', () => {
    renderMarkers({ 'fire-1': undetectedFire }, false)

    expect(document.querySelectorAll('.event-icon')).toHaveLength(0)
  })

  it('renders an Undetected Fire, faded/dashed, when Ground Truth View is enabled', () => {
    renderMarkers({ 'fire-1': undetectedFire }, true)

    const markers = document.querySelectorAll('.event-icon')
    expect(markers).toHaveLength(1)
    expect(markers[0]).toHaveClass('event-icon-undetected')
  })

  it('renders no markers at all when there are no spawned Fires', () => {
    renderMarkers({}, true)

    expect(document.querySelectorAll('.event-icon')).toHaveLength(0)
  })

  it('gives every Fire marker the Fire marker class', () => {
    renderMarkers({ 'fire-1': undetectedFire }, true)

    expect(document.querySelectorAll('.event-icon-fire')).toHaveLength(1)
  })

  it('renders a Tower-Detected Fire even when Ground Truth View is disabled (the default fog-of-war view)', () => {
    renderMarkers({ 'fire-2': towerDetectedFire }, false)

    const markers = document.querySelectorAll('.event-icon')
    expect(markers).toHaveLength(1)
    expect(markers[0]).not.toHaveClass('event-icon-undetected')
  })

  it('hides an Undetected Fire but shows a Tower-Detected one, in the same default view', () => {
    renderMarkers({ 'fire-1': undetectedFire, 'fire-2': towerDetectedFire }, false)

    expect(document.querySelectorAll('.event-icon')).toHaveLength(1)
    expect(document.querySelector('.event-icon-fire')).not.toBeNull()
  })

  it('keeps showing a Tower-Detected Fire in Ground Truth View too', () => {
    renderMarkers({ 'fire-2': towerDetectedFire }, true)

    expect(document.querySelectorAll('.event-icon')).toHaveLength(1)
  })
})

describe('FireMarkers click handling (issue T)', () => {
  it('reports the clicked Fire via onSelect for a Tower-Detected Fire', () => {
    const onSelect = vi.fn()
    renderMarkers({ 'fire-2': towerDetectedFire }, false, onSelect)

    fireEvent.click(document.querySelector('.event-icon-fire') as Element)

    expect(onSelect).toHaveBeenCalledExactlyOnceWith(towerDetectedFire)
  })

  it('does not call onSelect when an Undetected Fire (visible only in Ground Truth View) is clicked', () => {
    const onSelect = vi.fn()
    renderMarkers({ 'fire-1': undetectedFire }, true, onSelect)

    fireEvent.click(document.querySelector('.event-icon-fire') as Element)

    expect(onSelect).not.toHaveBeenCalled()
  })
})
