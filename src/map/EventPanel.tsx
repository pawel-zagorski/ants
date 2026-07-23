import { eventTypeLabel } from '../scenario/eventTypeLabel'
import { withBase } from '../basePath'
import { MapOverlayPanel } from './MapOverlayPanel'
import type { EventRuntimeState, SimulationState } from '../engine/types'
import type { EventType } from '../scenario/types'
import type { Drone } from '../world/types'

export interface EventPanelProps {
  event: EventRuntimeState
  /**
   * The Simulation Clock's current `SimulationState` in full — `droneActivity`
   * is what decides which Drones are currently available to send (mirrors
   * `AssetPanel`'s single `simulationState` prop for the same reason: these
   * fields always travel together as one simulation snapshot).
   */
  simulationState: SimulationState
  /** The World's full Drone roster — every candidate row for the "Send" list, filtered by availability below. */
  drones: readonly Drone[]
  /** Issue O's manual dispatch trigger: sends `droneId` to investigate `event`, via `useSimulationClock.sendDrone`. */
  onSend: (droneId: string) => void
  onClose: () => void
}

/**
 * Renders `detectedAtSimSeconds` the same "T+MM:SS" style as
 * `SimulationClockPanel.tsx`'s own (also private) `formatElapsedSimTime` —
 * deliberately not extracted into a shared helper, since issue N is
 * replacing that panel's raw-seconds display with a calendar date/time
 * (Scenario Epoch) in a separate, concurrently-developed worktree; sharing
 * a helper would mean editing that same file/export for no benefit here
 * once N lands, just merge risk.
 */
function formatDetectedAt(detectedAtSimSeconds: number): string {
  const totalSeconds = Math.floor(detectedAtSimSeconds)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `T+${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

/**
 * The Drones eligible for this Event's "Send" list: every `drones` entry
 * that isn't currently `'investigating'` something (a Drone missing from
 * `droneActivity` — shouldn't happen once initialized, but kept total —
 * defaults to available, mirroring `activityAfterInvestigationExpiry`'s own
 * "missing means patrolling" fallback in the engine). Kept local to this
 * component rather than moved into `engine/telemetry.ts`, matching
 * `AssetPanel.tsx`'s own precedent of a small private
 * `SimulationState`-derived lookup (see its `trackedFireEventFor`) —
 * `telemetry.ts` is for live per-asset telemetry values, not this kind of
 * one-line availability filter. A `'lost'` Drone (issue W) needs no
 * separate exclusion here either: its mode is `'lost'`, not `'patrolling'`,
 * so it already fails this same `=== 'patrolling'` check, permanently.
 */
function availableDronesFor(drones: readonly Drone[], droneActivity: SimulationState['droneActivity']): Drone[] {
  return drones.filter((drone) => (droneActivity[drone.id]?.mode ?? 'patrolling') === 'patrolling')
}

/**
 * The full-bleed banner photo an Event's card shows (`src` resolved through
 * {@link withBase} at render, `alt` per kind) — a stock photo for the two
 * scripted Event kinds, using the shared `.asset-panel-photo` cover styling
 * (no margin variant, unlike a Drone's product shot in `AssetPanel`).
 */
function eventPhotoFor(type: EventType): { src: string; alt: string } {
  if (type === 'PersonSighting') return { src: '/img/people_sighted.jpeg', alt: 'Person Sighting' }
  return { src: '/img/fallen_tree.jpeg', alt: 'Fallen Tree' }
}

/**
 * Status panel opened by clicking a Detected, non-Fire Event marker (issue
 * O) — mirrors `AssetPanel`'s open/close pattern exactly (same close-button
 * placement/`role="dialog"` convention), but for an Event rather than an
 * Asset. Shows this Event's Detection Status (which asset detected it, and
 * when — the ADR-0005 replacement for the retired auto-dispatch's implicit
 * "already handled" signal) plus a simple list of currently-available
 * (non-investigating) Drones, each with a "Send" button that hands off to
 * `onSend` — `RokuaMap` wires that straight to `useSimulationClock.sendDrone`,
 * which applies the engine's `withManualDispatch` transition.
 */
export function EventPanel({ event, simulationState, drones, onSend, onClose }: EventPanelProps) {
  const availableDrones = availableDronesFor(drones, simulationState.droneActivity)
  const photo = eventPhotoFor(event.type)

  return (
    <MapOverlayPanel className="asset-panel event-panel" role="dialog" aria-label={`${eventTypeLabel(event.type)} ${event.id} status`}>
      <button type="button" className="asset-panel-close" onClick={onClose} aria-label="Close">
        &times;
      </button>
      <div className="asset-panel-body">
        <img className="asset-panel-photo" src={withBase(photo.src)} alt={photo.alt} />
        <h2 className="asset-panel-title">{event.id}</h2>
        <dl className="asset-panel-fields">
          <dt>Type</dt>
          <dd>{eventTypeLabel(event.type)}</dd>
          <dt>Detected By</dt>
          <dd>{event.detectedByAssetId ?? 'Unknown'}</dd>
          <dt>Detected At</dt>
          <dd>{event.detectedAtSimSeconds !== undefined ? formatDetectedAt(event.detectedAtSimSeconds) : 'Unknown'}</dd>
        </dl>
      </div>
      <div className="event-panel-drones">
        <h3 className="event-panel-drones-title">Available Drones</h3>
        {availableDrones.length === 0 ? (
          <p className="event-panel-no-drones">No Drones currently available</p>
        ) : (
          <ul className="event-panel-drone-list">
            {availableDrones.map((drone) => (
              <li key={drone.id} className="event-panel-drone-row">
                <span className="event-panel-drone-id">{drone.id}</span>
                <button type="button" onClick={() => onSend(drone.id)}>
                  Send
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </MapOverlayPanel>
  )
}
