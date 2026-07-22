import { Marker } from 'react-leaflet'
import { iconForEvent } from './eventIcons'
import type { EventRuntimeState } from '../engine/types'

export interface EventMarkersProps {
  events: Record<string, EventRuntimeState>
  /**
   * Ground Truth View toggle (see `CONTEXT.md`): when disabled (the
   * default "fog of war" view), Undetected Events are hidden entirely —
   * this slice has no Detection logic, so that means no Events render at
   * all until a later slice starts marking some `'detected'`. When
   * enabled, every spawned Event renders, Undetected ones faded/dashed.
   */
  groundTruthViewEnabled: boolean
}

/**
 * Renders every currently-spawned Event (from `SimulationState.events`,
 * already filtered to "spawned by now" by `advanceSimulation`) as a marker,
 * subject to the Ground Truth View toggle: the default view shows only
 * Detected/Resolved Events (none exist yet in this slice); Ground Truth
 * View additionally reveals Undetected ones, styled faded/dashed via the
 * `event-icon-undetected` class from `eventIcons.ts`.
 */
export function EventMarkers({ events, groundTruthViewEnabled }: EventMarkersProps) {
  const visibleEvents = Object.values(events).filter(
    (event) => groundTruthViewEnabled || event.status === 'detected' || event.status === 'resolved',
  )

  return (
    <>
      {visibleEvents.map((event) => (
        <Marker
          key={event.id}
          position={[event.position.lat, event.position.lng]}
          icon={iconForEvent(event.type, event.status)}
        />
      ))}
    </>
  )
}
