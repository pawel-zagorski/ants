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
  /**
   * Reports a click on a Detected Event — issue O's manual dispatch
   * trigger, opening `EventPanel`'s "Detection Status" + available Drones
   * list (mirrors `AssetMarkers.onSelect`). Only `'detected'` markers are
   * clickable (see `isManuallyDispatchable`) — clicking an
   * Undetected/Resolved Event has nothing useful for this panel to show.
   * Fire is not one of the `EventType`s this component ever renders
   * (ADR-0004: Fire is its own domain concept — see the sibling
   * `FireMarkers`), so there is no Fire-exclusion check needed here at all.
   */
  onSelect: (event: EventRuntimeState) => void
}

/**
 * An Event this issue's manual-dispatch panel makes sense for: `'detected'`
 * (so there's a Detection Status and, potentially, still-available Drones
 * to show) — an Undetected/Resolved Event has nothing useful for the panel
 * to show instead.
 */
function isManuallyDispatchable(event: EventRuntimeState): boolean {
  return event.status === 'detected'
}

/**
 * Renders every currently-spawned Event (from `SimulationState.events`,
 * already filtered to "spawned by now" by `advanceSimulation`) as a marker,
 * subject to the Ground Truth View toggle: the default view shows only
 * Detected/Resolved Events; Ground Truth View additionally reveals
 * Undetected ones, styled faded/dashed via the `event-icon-undetected`
 * class from `eventIcons.ts`. Clicking a marker reports that Event via
 * `onSelect`, but only when {@link isManuallyDispatchable} — mirrors
 * `AssetMarkers`' click-to-select pattern, just conditional on eligibility
 * rather than unconditional (every asset is always clickable).
 */
export function EventMarkers({ events, groundTruthViewEnabled, onSelect }: EventMarkersProps) {
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
          eventHandlers={isManuallyDispatchable(event) ? { click: () => onSelect(event) } : undefined}
        />
      ))}
    </>
  )
}
