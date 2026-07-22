import type { LatLng } from '../map/geo'
import type { EventType, ScenarioEvent } from '../scenario/types'
import type { DroneType } from '../world/types'

/**
 * A single Drone's patrol loop and current derived position. `droneType`,
 * `patrolCenter`, `patrolRadiusMeters`, `angularSpeedRadiansPerSecond`,
 * `phaseOffsetRadians`, and `detectionRadiusMeters` are fixed for the
 * lifetime of a {@link SimulationState} (derived once from the World in
 * `initializeSimulationState`) — only `position` changes as simulated time
 * advances. `position` is a closed-form function of `elapsedSimSeconds`
 * alone *while patrolling*; once dispatched to investigate (see
 * `DroneActivityState`), `advanceSimulation` instead derives it from the
 * assigned Event's position and time-since-investigation-started — see
 * `investigatePositionFor` in `advanceSimulation.ts`. `droneType` is what
 * lets that investigate math pick hover (Quadrocopter) vs. circle
 * (Fixed-Wing Drone).
 */
export interface DronePatrolState {
  droneType: DroneType
  patrolCenter: LatLng
  patrolRadiusMeters: number
  angularSpeedRadiansPerSecond: number
  phaseOffsetRadians: number
  detectionRadiusMeters: number
  position: LatLng
}

/**
 * A single Drone's current dispatch/investigate activity (issue F), kept as
 * a sibling `Record<droneId, DroneActivityState>` on {@link SimulationState}
 * rather than folded into {@link DronePatrolState}, since it's
 * history-dependent (like `EventRuntimeState.status`) rather than a
 * closed-form function of absolute time alone. `'patrolling'` is the
 * default/steady state. `'investigating'` additionally carries which Event
 * it was dispatched to (`assignedEventId`) and when that investigation
 * began (`investigationStartedAtSimSeconds`, an absolute
 * `elapsedSimSeconds` value) — together these are enough for
 * `advanceSimulation` to compute both "how long has this Drone been
 * investigating" (to know when to revert to `'patrolling'`) and its
 * hover/circle position. Deliberately an extensible union rather than a
 * boolean flag: issue G's battery/endurance telemetry is expected to add
 * further modes (e.g. `'returningToBase'`, `'charging'`) without a breaking
 * change here.
 */
export type DroneActivityState =
  | { mode: 'patrolling' }
  | { mode: 'investigating'; assignedEventId: string; investigationStartedAtSimSeconds: number }

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
 * out of range (see `advanceSimulation`'s sticky-status merge). Resolution
 * (issue G) is likewise monotonic and forward-only — once `'resolved'`, an
 * Event never reverts to `'detected'`.
 */
export type EventStatus = 'undetected' | 'detected' | 'resolved'

/**
 * A single spawned Event's live engine state: its scripted identity/position
 * (copied from the Scenario's {@link ScenarioEvent}) plus its current
 * lifecycle `status`. Only present in `SimulationState.events` once
 * `elapsedSimSeconds` has reached its `spawnAtSimSeconds` — see
 * `advanceSimulation`. `detectedByAssetId` and `detectedAtSimSeconds` are
 * both set once, the tick an Event first flips to `'detected'` (the Tower
 * or Drone id whose radius it fell within, and the absolute
 * `elapsedSimSeconds` at that moment), and then carried forward unchanged —
 * `detectedByAssetId` is what lets a Tower's status panel show "which Fire
 * Event am I currently tracking"; `detectedAtSimSeconds` is what lets
 * `advanceSimulation` know when `durationSimSeconds` (counted from
 * Detection, not from spawn — see PRD "Event model" Implementation
 * Decisions) has elapsed, flipping `status` to `'resolved'`. An Event with
 * no `durationSimSeconds` never resolves; an `'undetected'` Event never
 * resolves either (resolution only makes sense once something has actually
 * Detected it).
 */
export interface EventRuntimeState {
  id: string
  type: EventType
  position: LatLng
  status: EventStatus
  spawnAtSimSeconds: number
  durationSimSeconds?: number
  detectedByAssetId?: string
  detectedAtSimSeconds?: number
}

/**
 * The engine's full serializable state: every Drone's patrol loop and
 * derived position keyed by Drone id, every Drone's dispatch/investigate
 * activity keyed by Drone id, every Tower's fixed detection data keyed by
 * Tower id, every currently-spawned Event keyed by Event id, plus the
 * simulated time it was last computed for. `scenarioEvents` is the
 * Scenario's full, unchanging Event script (carried through unmodified from
 * `initializeSimulationState`, mirroring how each Drone's patrol parameters
 * are carried through) — it's what `advanceSimulation` re-derives `events`
 * from on every call. Unlike Drone position while patrolling (a closed-form
 * function of absolute `elapsedSimSeconds` alone), an Event's `status` and
 * a Drone's `droneActivity` legitimately depend on history:
 * `advanceSimulation` reads the incoming `events[id]`/`droneActivity[id]`
 * from this same state as memory — for Events, so it never un-detects one a
 * Drone has since flown away from (sticky status); for Drones, so
 * "how long has this Drone been investigating" and "which Drone is already
 * unavailable" can be computed tick-over-tick. Contains no reference to
 * React/Leaflet/wall-clock time — see `advanceSimulation`.
 */
export interface SimulationState {
  elapsedSimSeconds: number
  dronePatrol: Record<string, DronePatrolState>
  droneActivity: Record<string, DroneActivityState>
  towerDetection: Record<string, TowerDetectionState>
  scenarioEvents: ScenarioEvent[]
  events: Record<string, EventRuntimeState>
}
