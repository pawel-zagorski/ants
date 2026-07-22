import type { LatLng } from '../map/geo'
import type { EventType, ScenarioEvent } from '../scenario/types'

/**
 * A single Drone's patrol loop and current derived position. `patrolCenter`,
 * `patrolRadiusMeters`, `angularSpeedRadiansPerSecond`,
 * `phaseOffsetRadians`, and `detectionRadiusMeters` are fixed for the
 * lifetime of a {@link SimulationState} (derived once from the World in
 * `initializeSimulationState`) — only `position` changes as simulated time
 * advances. Future slices (dispatch, investigate) are expected to add
 * sibling fields here without disturbing these.
 */
export interface DronePatrolState {
  patrolCenter: LatLng
  patrolRadiusMeters: number
  angularSpeedRadiansPerSecond: number
  phaseOffsetRadians: number
  detectionRadiusMeters: number
  position: LatLng
}

/**
 * A Tower's fixed position and detection radius, carried through
 * `SimulationState` so `advanceSimulation` can check Fire Events against it
 * without needing the full `World` on every call (mirrors how each Drone's
 * patrol parameters are carried through in {@link DronePatrolState}).
 * Towers are static in this slice, so this never changes after
 * `initializeSimulationState`.
 */
export interface TowerDetectionState {
  position: LatLng
  detectionRadiusMeters: number
}

/**
 * An Event's lifecycle, per `CONTEXT.md`: `Undetected → Detected →
 * Resolved`. Detection (issue E) is monotonic — once `'detected'`, an Event
 * never reverts to `'undetected'`, even if the detecting asset later moves
 * out of range (see `advanceSimulation`'s sticky-status merge). `'resolved'`
 * is not produced yet — that's issue G's concern; this type already
 * supports it so G won't need a breaking change here.
 */
export type EventStatus = 'undetected' | 'detected' | 'resolved'

/**
 * A single spawned Event's live engine state: its scripted identity/position
 * (copied from the Scenario's {@link ScenarioEvent}) plus its current
 * lifecycle `status`. Only present in `SimulationState.events` once
 * `elapsedSimSeconds` has reached its `spawnAtSimSeconds` — see
 * `advanceSimulation`. `detectedByAssetId` is set the tick an Event first
 * flips to `'detected'` (the Tower or Drone id whose radius it fell within)
 * and then carried forward unchanged — it's what lets a Tower's status
 * panel show "which Fire Event am I currently tracking".
 */
export interface EventRuntimeState {
  id: string
  type: EventType
  position: LatLng
  status: EventStatus
  spawnAtSimSeconds: number
  durationSimSeconds?: number
  detectedByAssetId?: string
}

/**
 * The engine's full serializable state: every Drone's patrol loop and
 * derived position keyed by Drone id, every Tower's fixed detection data
 * keyed by Tower id, every currently-spawned Event keyed by Event id, plus
 * the simulated time it was last computed for. `scenarioEvents` is the
 * Scenario's full, unchanging Event script (carried through unmodified from
 * `initializeSimulationState`, mirroring how each Drone's patrol parameters
 * are carried through) — it's what `advanceSimulation` re-derives `events`
 * from on every call. Unlike Drone position (a closed-form function of
 * absolute `elapsedSimSeconds` alone), an Event's `status` legitimately
 * depends on history: `advanceSimulation` reads the incoming `events[id]`
 * from this same state as memory for its sticky-status merge, so it never
 * un-detects an Event a Drone has since flown away from. Contains no
 * reference to React/Leaflet/wall-clock time — see `advanceSimulation`.
 */
export interface SimulationState {
  elapsedSimSeconds: number
  dronePatrol: Record<string, DronePatrolState>
  towerDetection: Record<string, TowerDetectionState>
  scenarioEvents: ScenarioEvent[]
  events: Record<string, EventRuntimeState>
}
