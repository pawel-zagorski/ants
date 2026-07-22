import { render } from '@testing-library/react'
import { MapContainer } from 'react-leaflet'
import { describe, expect, it } from 'vitest'
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

function renderMarkers(events: Record<string, EventRuntimeState>, groundTruthViewEnabled: boolean) {
  return render(
    <MapContainer center={[64.5644, 26.4947]} zoom={9}>
      <EventMarkers events={events} groundTruthViewEnabled={groundTruthViewEnabled} />
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
})
