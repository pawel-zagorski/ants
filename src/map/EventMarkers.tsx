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
   * Reports a click on a Detected, non-Fire Event — issue O's manual
   * dispatch trigger, opening `EventPanel`'s "Detection Status" + available
   * Drones list (mirrors `AssetMarkers.onSelect`). Only markers that are
   * both `'detected'` and not `type: 'Fire'` are clickable (see
   * `isManuallyDispatchable`): a Fire's own click/panel is a later issue's
   * concern (T), and clicking an Undetected/Resolved Event has nothing
   * useful for this panel to show.
   */
  onSelect: (event: EventRuntimeState) => void
}

/**
 * An Event this issue's manual-dispatch panel makes sense for: `'detected'`
 * (so there's a Detection Status and, potentially, still-available Drones
 * to show) and not a Fire — a Fire gets its own read-only click/panel
 * (issue T) and, later, its own Bingo-Range-aware dispatch UI on top of
 * that same panel (ADR-0006/issue U); this simple list is neither of those.
 */
function isManuallyDispatchable(event: EventRuntimeState): boolean {
  return event.type !== 'Fire' && event.status === 'detected'
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
