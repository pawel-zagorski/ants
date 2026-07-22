import { Marker } from 'react-leaflet'
import { iconForFire } from './fireIcons'
import type { FireRuntimeState } from '../engine/types'

export interface FireMarkersProps {
  fires: Record<string, FireRuntimeState>
  /**
   * Ground Truth View toggle (see `CONTEXT.md`): when disabled (the
   * default "fog of war" view), an `'undetected'` Fire is hidden entirely
   * — mirrors `EventMarkers`. When enabled, every spawned Fire renders,
   * `'undetected'` ones faded/dashed via `iconForFire`.
   */
  groundTruthViewEnabled: boolean
  /**
   * Reports a click on a clickable (non-`'undetected'`) Fire marker (issue
   * T), opening `FirePanel`'s read-only Detection Status (mirrors
   * `EventMarkers.onSelect`). Only `'towerDetected'`/`'investigated'` Fires
   * are clickable (see `isClickable`) — an `'undetected'` Fire must never
   * be clickable/visible per the fog-of-war rule, even in Ground Truth
   * View, where it's shown faded/dashed for demo purposes only.
   */
  onSelect: (fire: FireRuntimeState) => void
}

/**
 * A Fire this issue's read-only Detection Status panel makes sense for:
 * anything past `'undetected'` (so there's an actual detecting Tower/time
 * to show) — mirrors `EventMarkers`' `isManuallyDispatchable`, just gated
 * on tier rather than status.
 */
function isClickable(fire: FireRuntimeState): boolean {
  return fire.tier !== 'undetected'
}

/**
 * Renders every currently-spawned Fire (from `SimulationState.fires`,
 * already filtered to "spawned by now" by `advanceSimulation`) as a
 * marker — the Fire-domain sibling of `EventMarkers` (ADR-0004: Fire is
 * not a kind of Event, so it gets its own component reading its own
 * `SimulationState.fires` map rather than being folded into
 * `EventMarkers`'s `events` prop). Still just a single point marker at the
 * Fire's ignition position, same as before this slice — spread/hex-grid/
 * ellipse rendering is a later issue (R onward), not this one. Clicking a
 * marker reports that Fire via `onSelect`, but only when {@link
 * isClickable} — mirrors `EventMarkers`' click-to-select pattern.
 */
export function FireMarkers({ fires, groundTruthViewEnabled, onSelect }: FireMarkersProps) {
  const visibleFires = Object.values(fires).filter((fire) => groundTruthViewEnabled || fire.tier !== 'undetected')

  return (
    <>
      {visibleFires.map((fire) => (
        <Marker
          key={fire.id}
          position={[fire.position.lat, fire.position.lng]}
          icon={iconForFire(fire.tier)}
          eventHandlers={isClickable(fire) ? { click: () => onSelect(fire) } : undefined}
        />
      ))}
    </>
  )
}
