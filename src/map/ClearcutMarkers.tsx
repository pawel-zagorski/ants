import { Marker } from 'react-leaflet'
import { iconForClearcut } from './clearcutIcons'
import type { ClearcutRuntimeState } from '../engine/types'

export interface ClearcutMarkersProps {
  clearcuts: Record<string, ClearcutRuntimeState>
  /**
   * Ground Truth View toggle (see `CONTEXT.md`): when disabled (the default
   * "fog of war" view), an `'undetected'` Clearcut is hidden entirely —
   * mirrors `FireMarkers`/`EventMarkers`. When enabled, every spawned
   * Clearcut renders, `'undetected'` ones faded/dashed via `iconForClearcut`.
   */
  groundTruthViewEnabled: boolean
  /**
   * Reports a click on a clickable (non-`'undetected'`) Clearcut marker
   * (issue X), opening `ClearcutPanel`'s read-only Detection Status
   * (mirrors `FireMarkers.onSelect`). Only `'detected'`/`'investigated'`
   * Clearcuts are clickable (see `isClickable`) — an `'undetected'`
   * Clearcut must never be clickable/visible per the fog-of-war rule, even
   * in Ground Truth View, where it's shown faded for demo purposes only.
   */
  onSelect: (clearcut: ClearcutRuntimeState) => void
}

/**
 * A Clearcut the read-only panel makes sense for: anything past
 * `'undetected'` (so there's an actual detecting Drone/time to show) —
 * mirrors `FireMarkers`' `isClickable`.
 */
function isClickable(clearcut: ClearcutRuntimeState): boolean {
  return clearcut.tier !== 'undetected'
}

/**
 * Renders every currently-spawned Clearcut (from
 * `SimulationState.clearcuts`, already filtered to "spawned by now" by
 * `advanceSimulation`) as a red-tree marker at its centroid — the
 * Clearcut-domain sibling of `FireMarkers` (ADR-0009: a Clearcut is not a
 * kind of Event/Fire, so it gets its own component reading its own
 * `SimulationState.clearcuts` map). Clicking a marker reports that Clearcut
 * via `onSelect`, but only when {@link isClickable} — mirrors
 * `FireMarkers`' click-to-select pattern.
 */
export function ClearcutMarkers({ clearcuts, groundTruthViewEnabled, onSelect }: ClearcutMarkersProps) {
  const visibleClearcuts = Object.values(clearcuts).filter(
    (clearcut) => groundTruthViewEnabled || clearcut.tier !== 'undetected',
  )

  return (
    <>
      {visibleClearcuts.map((clearcut) => (
        <Marker
          key={clearcut.id}
          position={[clearcut.position.lat, clearcut.position.lng]}
          icon={iconForClearcut(clearcut.tier)}
          eventHandlers={isClickable(clearcut) ? { click: () => onSelect(clearcut) } : undefined}
        />
      ))}
    </>
  )
}
