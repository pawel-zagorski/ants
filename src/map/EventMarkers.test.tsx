import { fireEvent, render } from '@testing-library/react'
import { MapContainer } from 'react-leaflet'
import { describe, expect, it, vi } from 'vitest'
import { EventMarkers } from './EventMarkers'
import type { EventRuntimeState } from '../engine/types'

const undetectedFire: EventRuntimeState = {
  id: 'event-1',
  type: 'Fire',
  position: { lat: 64.6, lng: 26.4 },
  status: 'undetected',
  spawnAtSimSeconds: 0,
}

const undetectedFallenTree: EventRuntimeState = {
  id: 'event-2',
  type: 'FallenTree',
  position: { lat: 64.55, lng: 26.3 },
  status: 'undetected',
  spawnAtSimSeconds: 0,
}

const detectedFire: EventRuntimeState = {
  id: 'event-3',
  type: 'Fire',
  position: { lat: 64.7, lng: 26.2 },
  status: 'detected',
  spawnAtSimSeconds: 0,
  detectedByAssetId: 'tower-1',
}

const resolvedFire: EventRuntimeState = {
  id: 'event-4',
  type: 'Fire',
  position: { lat: 64.7, lng: 26.2 },
  status: 'resolved',
  spawnAtSimSeconds: 0,
  durationSimSeconds: 600,
  detectedByAssetId: 'tower-1',
  detectedAtSimSeconds: 0,
}

function renderMarkers(
  events: Record<string, EventRuntimeState>,
  groundTruthViewEnabled: boolean,
  onSelect: (event: EventRuntimeState) => void = vi.fn(),
) {
  return render(
    <MapContainer center={[64.5644, 26.4947]} zoom={9}>
      <EventMarkers events={events} groundTruthViewEnabled={groundTruthViewEnabled} onSelect={onSelect} />
    </MapContainer>,
  )
}

describe('EventMarkers', () => {
  it('renders nothing when Ground Truth View is disabled, even with spawned Undetected Events', () => {
    renderMarkers({ 'event-1': undetectedFire, 'event-2': undetectedFallenTree }, false)

    expect(document.querySelectorAll('.event-icon')).toHaveLength(0)
  })

  it('renders every Undetected Event, faded/dashed, when Ground Truth View is enabled', () => {
    renderMarkers({ 'event-1': undetectedFire, 'event-2': undetectedFallenTree }, true)

    const markers = document.querySelectorAll('.event-icon')
    expect(markers).toHaveLength(2)
    markers.forEach((marker) => expect(marker).toHaveClass('event-icon-undetected'))
  })

  it('renders no markers at all when there are no spawned Events', () => {
    renderMarkers({}, true)

    expect(document.querySelectorAll('.event-icon')).toHaveLength(0)
  })

  it('gives distinct marker classes per Event type', () => {
    renderMarkers({ 'event-1': undetectedFire, 'event-2': undetectedFallenTree }, true)

    expect(document.querySelectorAll('.event-icon-fire')).toHaveLength(1)
    expect(document.querySelectorAll('.event-icon-fallentree')).toHaveLength(1)
  })

  it('renders a Detected Event even when Ground Truth View is disabled (the default fog-of-war view)', () => {
    renderMarkers({ 'event-3': detectedFire }, false)

    const markers = document.querySelectorAll('.event-icon')
    expect(markers).toHaveLength(1)
    expect(markers[0]).not.toHaveClass('event-icon-undetected')
  })

  it('hides an Undetected Event but shows a Detected one, in the same default view', () => {
    renderMarkers({ 'event-1': undetectedFire, 'event-3': detectedFire }, false)

    expect(document.querySelectorAll('.event-icon')).toHaveLength(1)
    expect(document.querySelector('.event-icon-fire')).not.toBeNull()
  })
})

const detectedFallenTree: EventRuntimeState = {
  id: 'event-5',
  type: 'FallenTree',
  position: { lat: 64.55, lng: 26.3 },
  status: 'detected',
  spawnAtSimSeconds: 0,
  detectedByAssetId: 'drone-1',
  detectedAtSimSeconds: 0,
}

describe('EventMarkers click handling (issue O)', () => {
  it('reports the clicked Event via onSelect for a Detected Person Sighting/Fallen Tree', () => {
    const onSelect = vi.fn()
    renderMarkers({ 'event-5': detectedFallenTree }, false, onSelect)

    fireEvent.click(document.querySelector('.event-icon-fallentree') as Element)

    expect(onSelect).toHaveBeenCalledExactlyOnceWith(detectedFallenTree)
  })

  it('does not call onSelect when a Detected Fire is clicked (Fire gets its own panel in a later issue)', () => {
    const onSelect = vi.fn()
    renderMarkers({ 'event-3': detectedFire }, false, onSelect)

    fireEvent.click(document.querySelector('.event-icon-fire') as Element)

    expect(onSelect).not.toHaveBeenCalled()
  })

  it('does not call onSelect when an Undetected Event (visible only in Ground Truth View) is clicked', () => {
    const onSelect = vi.fn()
    renderMarkers({ 'event-2': undetectedFallenTree }, true, onSelect)

    fireEvent.click(document.querySelector('.event-icon-fallentree') as Element)

    expect(onSelect).not.toHaveBeenCalled()
  })

  it('does not call onSelect when a Resolved Event is clicked', () => {
    const onSelect = vi.fn()
    renderMarkers({ 'event-4': resolvedFire }, false, onSelect)

    fireEvent.click(document.querySelector('.event-icon-fire') as Element)

    expect(onSelect).not.toHaveBeenCalled()
  })
})

describe('EventMarkers Resolved Events (issue G)', () => {
  it('renders a Resolved Event, visually distinct from Detected, in the default view', () => {
    renderMarkers({ 'event-4': resolvedFire }, false)

    const markers = document.querySelectorAll('.event-icon')
    expect(markers).toHaveLength(1)
    expect(markers[0]).toHaveClass('event-icon-resolved')
    expect(markers[0]).not.toHaveClass('event-icon-detected')
  })

  it('keeps a Resolved Event visible (not removed) in Ground Truth View too', () => {
    renderMarkers({ 'event-4': resolvedFire }, true)

    expect(document.querySelectorAll('.event-icon')).toHaveLength(1)
  })

  it('gives Detected and Resolved Events distinct marker classes from each other', () => {
    renderMarkers({ 'event-3': detectedFire, 'event-4': resolvedFire }, false)

    expect(document.querySelectorAll('.event-icon-detected')).toHaveLength(1)
    expect(document.querySelectorAll('.event-icon-resolved')).toHaveLength(1)
  })
})
