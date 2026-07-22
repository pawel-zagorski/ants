import type { LatLng } from '../map/geo'
import type { EventType, ScenarioEvent } from '../scenario/types'

/**
 * A single Drone's patrol loop and current derived position. `patrolCenter`,
 * `patrolRadiusMeters`, `angularSpeedRadiansPerSecond`, and
 * `phaseOffsetRadians` are fixed for the lifetime of a {@link SimulationState}
 * (derived once from the World in `initializeSimulationState`) — only
 * `position` changes as simulated time advances. Future slices (dispatch,
 * investigate) are expected to add sibling fields here without disturbing
 * these.
 */
export interface DronePatrolState {
  patrolCenter: LatLng
  patrolRadiusMeters: number
  angularSpeedRadiansPerSecond: number
  phaseOffsetRadians: number
  position: LatLng
}

/**
 * An Event's lifecycle, per `CONTEXT.md`: `Undetected → Detected →
 * Resolved`. This slice only ever produces `'undetected'` (no Detection
 * logic exists yet) — `'detected'`/`'resolved'` already exist here so
 * slices E/G can start setting them without a breaking change to this type.
 */
export type EventStatus = 'undetected' | 'detected' | 'resolved'

/**
 * A single spawned Event's live engine state: its scripted identity/position
 * (copied from the Scenario's {@link ScenarioEvent}) plus its current
 * lifecycle `status`. Only present in `SimulationState.events` once
 * `elapsedSimSeconds` has reached its `spawnAtSimSeconds` — see
 * `advanceSimulation`.
 */
export interface EventRuntimeState {
  id: string
  type: EventType
  position: LatLng
  status: EventStatus
  spawnAtSimSeconds: number
  durationSimSeconds?: number
}

/**
 * The engine's full serializable state: every Drone's patrol loop and
 * derived position keyed by Drone id, every currently-spawned Event keyed
 * by Event id, plus the simulated time it was last computed for.
 * `scenarioEvents` is the Scenario's full, unchanging Event script (carried
 * through unmodified from `initializeSimulationState`, mirroring how each
 * Drone's patrol parameters are carried through) — it's what
 * `advanceSimulation` re-derives `events` from on every call. Contains no
 * reference to React/Leaflet/wall-clock time — see `advanceSimulation`.
 */
export interface SimulationState {
  elapsedSimSeconds: number
  dronePatrol: Record<string, DronePatrolState>
  scenarioEvents: ScenarioEvent[]
  events: Record<string, EventRuntimeState>
}
