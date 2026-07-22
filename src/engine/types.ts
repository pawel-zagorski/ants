import type { LatLng } from '../map/geo'
import type { EventType, ScenarioEvent, ScenarioFireIgnition } from '../scenario/types'
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
 * Which kind of Fire dispatch a Drone is currently flying, per ADR-0006 and
 * `CONTEXT.md`'s **Bingo Range** and **One-Way Mission** entries — set once, at
 * `withManualFireDispatch` time (see `advanceSimulation.ts`), from whichever
 * of `FirePanel`'s two lists the operator picked the Drone from.
 * `'roundTrip'` (Bingo Range) means the Drone's `remainingEnduranceSimSeconds`
 * covered the full fly-out/orbit/fly-back budget at send time; `'oneWay'`
 * (One-Way Mission) means it only covered reaching the Fire, and the
 * operator knowingly accepted the Drone won't return to any Base Station.
 * This distinction doesn't change anything by itself in this slice — it
 * exists purely so future issues can key different ending behavior off it:
 * issue V's "complete one orbit lap, then resume patrol" only applies to
 * `'roundTrip'`; issue W's "keep orbiting until endurance hits zero, then
 * become Lost in place" only applies to `'oneWay'`.
 */
export type FireMissionKind = 'roundTrip' | 'oneWay'

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
 * hover/circle position. `'investigatingFire'` (issue U) is the Fire-dispatch
 * sibling of `'investigating'`: same shape, but keyed by `assignedFireId`
 * rather than `assignedEventId`, plus a {@link FireMissionKind} recording
 * which of `FirePanel`'s two lists the Drone was sent from. It is
 * deliberately kept as its own variant rather than a generic
 * `assignedTargetId` on `'investigating'` (ADR-0004: Fire is not a kind of
 * Event, so its dispatch state stays its own variant too, mirroring
 * `FireRuntimeState` vs. `EventRuntimeState`), and deliberately has no
 * expiry timer of its own yet — unlike `'investigating'`'s fixed
 * `INVESTIGATION_DURATION_SIM_SECONDS`, a Fire investigation's end
 * condition depends on `missionKind` (one orbit lap vs. endurance
 * exhaustion) and is issue V/W's job to compute; `advanceSimulation` treats
 * it as sticky (carried forward unchanged) until then. Deliberately an
 * extensible union rather than a boolean flag: issue G's battery/endurance
 * telemetry already added `'investigating'`'s sibling modes this way, and
 * future issues (V/W) are expected to add further ones (e.g. `'lost'`)
 * without a breaking change here.
 */
export type DroneActivityState =
  | { mode: 'patrolling' }
  | { mode: 'investigating'; assignedEventId: string; investigationStartedAtSimSeconds: number }
  | {
      mode: 'investigatingFire'
      assignedFireId: string
      investigationStartedAtSimSeconds: number
      missionKind: FireMissionKind
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
 * `detectedByAssetId` is what lets a Drone's status panel show which Event
 * it's currently assigned to; `detectedAtSimSeconds` is what lets
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
 * A Fire's lifecycle, per `CONTEXT.md`/ADR-0004: `Undetected →
 * Tower-Detected → Investigated` — deliberately not `EventStatus`'s
 * `Undetected → Detected → Resolved`, since a Fire never auto-resolves and
 * has a distinct middle tier name (a Tower, specifically, is what first
 * moves it out of `'undetected'` — see `detectingAssetIdForFire` in
 * `advanceSimulation.ts`). `'investigated'` is not yet reachable in this
 * slice (issue Q is a pure data-model split; the orbit/investigate
 * mechanics that would ever produce it are issues U/V) but is carried in
 * the type now so those later issues are additive, not a breaking change
 * here.
 */
export type FireTier = 'undetected' | 'towerDetected' | 'investigated'

/**
 * A single spawned Fire's live engine state: its scripted identity/position
 * (copied from the Scenario's {@link ScenarioFireIgnition}) plus its
 * current `tier`. Only present in `SimulationState.fires` once
 * `elapsedSimSeconds` has reached its `spawnAtSimSeconds` — mirrors
 * `EventRuntimeState`, but kept as a wholly separate interface (ADR-0004:
 * Fire is not a kind of Event) rather than folding optional
 * Fire-only fields onto `EventRuntimeState`. `detectedByAssetId`/
 * `detectedAtSimSeconds` are set once, the tick a Fire first flips out of
 * `'undetected'` (the Tower or Drone id whose radius it fell within, per
 * `CONTEXT.md`'s Detection rule — a Drone can also detect a Fire, not only
 * a Tower), and then carried forward unchanged, same sticky/monotonic
 * pattern as `EventRuntimeState`. Deliberately has no `durationSimSeconds`
 * and no resolved-equivalent tier — a Fire never auto-resolves.
 */
export interface FireRuntimeState {
  id: string
  position: LatLng
  tier: FireTier
  spawnAtSimSeconds: number
  detectedByAssetId?: string
  detectedAtSimSeconds?: number
}

/**
 * The engine's full serializable state: every Drone's patrol loop and
 * derived position keyed by Drone id, every Drone's dispatch/investigate
 * activity keyed by Drone id, every Tower's fixed detection data keyed by
 * Tower id, every currently-spawned Event keyed by Event id, every
 * currently-spawned Fire keyed by Fire id, plus the simulated time it was
 * last computed for. `scenarioEvents`/`scenarioFireIgnitions` are the
 * Scenario's full, unchanging Event/Fire-ignition scripts (carried through
 * unmodified from `initializeSimulationState`, mirroring how each Drone's
 * patrol parameters are carried through) — they're what `advanceSimulation`
 * re-derives `events`/`fires` from on every call. `fires` is a sibling map
 * to `events`, not folded into it (ADR-0004: Fire is not a kind of Event).
 * Unlike Drone position while patrolling (a closed-form function of
 * absolute `elapsedSimSeconds` alone), an Event's `status`, a Fire's
 * `tier`, and a Drone's `droneActivity` legitimately depend on history:
 * `advanceSimulation` reads the incoming `events[id]`/`fires[id]`/
 * `droneActivity[id]` from this same state as memory — for Events/Fires, so
 * neither ever un-detects one a Drone/Tower has since moved out of range of
 * (sticky status/tier); for Drones, so "how long has this Drone been
 * investigating" and "which Drone is already unavailable" can be computed
 * tick-over-tick. Contains no reference to React/Leaflet/wall-clock time —
 * see `advanceSimulation`.
 */
export interface SimulationState {
  elapsedSimSeconds: number
  dronePatrol: Record<string, DronePatrolState>
  droneActivity: Record<string, DroneActivityState>
  towerDetection: Record<string, TowerDetectionState>
  scenarioEvents: ScenarioEvent[]
  scenarioFireIgnitions: ScenarioFireIgnition[]
  events: Record<string, EventRuntimeState>
  fires: Record<string, FireRuntimeState>
}
