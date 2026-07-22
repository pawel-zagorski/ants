import type { LatLng } from '../map/geo'
import type { EventLogEntry } from './eventLog'
import type { HexCoordinate } from './growthEllipse'
import type { EventType, ScenarioEvent, ScenarioFireIgnition, Wind } from '../scenario/types'
import type { DroneType } from '../world/types'

/**
 * A single Drone's patrol loop and current derived position. `droneType`,
 * `patrolCenter`, `patrolRadiusMeters`, `angularSpeedRadiansPerSecond`,
 * `phaseOffsetRadians`, `detectionRadiusMeters`, and `maxEnduranceSimSeconds`
 * are fixed for the lifetime of a {@link SimulationState} (derived once
 * from the World in `initializeSimulationState`) — only `position` changes
 * as simulated time advances. `position` is a closed-form function of
 * `elapsedSimSeconds` alone *while patrolling*; once dispatched to
 * investigate (see `DroneActivityState`), `advanceSimulation` instead
 * derives it from the assigned Event's position and
 * time-since-investigation-started — see `investigatePositionFor` in
 * `advanceSimulation.ts`. `droneType` is what lets that investigate math
 * pick hover (Quadrocopter) vs. circle (Fixed-Wing Drone).
 * `maxEnduranceSimSeconds` (issue W) is this Drone's own
 * `Drone.maxEnduranceSimSeconds`, carried through here specifically so
 * `advanceSimulation.ts`'s `activityAfterInvestigationExpiry` can check a
 * `'oneWay'` `'investigatingFire'` Drone's *live* remaining endurance
 * (`telemetry.ts`'s `remainingEnduranceSimSecondsAt`) tick-over-tick without
 * needing the full `World` threaded through `advanceSimulation` itself —
 * mirrors why `detectionRadiusMeters` already lives here rather than being
 * re-looked-up from `World` on every tick.
 */
export interface DronePatrolState {
  droneType: DroneType
  patrolCenter: LatLng
  patrolRadiusMeters: number
  angularSpeedRadiansPerSecond: number
  phaseOffsetRadians: number
  detectionRadiusMeters: number
  maxEnduranceSimSeconds: number
  /**
   * Representative cruise speed (m/s) carried through from
   * `Drone.cruiseSpeedMetersPerSecond` — the same value used by the Return
   * Envelope and Bingo Range distance-budget math — now also used to govern
   * the `'travelingToFire'` and `'returningToBase'` transit phases. Kept here
   * (mirroring `maxEnduranceSimSeconds`/`detectionRadiusMeters`) so
   * `advanceSimulation.ts` never needs the full `World` to compute travel
   * positions or durations.
   */
  cruiseSpeedMetersPerSecond: number
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
 * `FireRuntimeState` vs. `EventRuntimeState`). `orbitRadiusMeters` (issue V)
 * is a one-time snapshot of the Fire's real orbit radius
 * (`growthEllipse.ts`'s `fireOrbitRadiusMetersAt`), taken the instant
 * `withManualFireDispatch` starts this investigation — *not* recomputed
 * per-tick from the still-growing Fire Footprint, so the orbit itself
 * stays a simple, deterministic circle for the investigation's whole
 * duration (see `engine/orbit.ts`) even though the separately-tracked
 * Confirmed Shape (`FireRuntimeState.confirmedFootprintHexCells`) keeps
 * live-updating every tick. There is deliberately still no fixed expiry
 * timer here (unlike `'investigating'`'s fixed
 * `INVESTIGATION_DURATION_SIM_SECONDS`): a `'roundTrip'`
 * (`FireMissionKind`) investigation ends after one full orbit lap
 * (`engine/orbit.ts`'s `orbitLapDurationSimSeconds`, checked in
 * `advanceSimulation.ts`'s `activityAfterInvestigationExpiry`), while a
 * `'oneWay'` investigation instead ends the instant its Drone's *live*
 * `remainingEnduranceSimSeconds` (`telemetry.ts`'s
 * `remainingEnduranceSimSecondsAt`) reaches zero (issue W, ADR-0006's "the
 * only place endurance is allowed to gate/end a Drone's behavior") — see
 * `'lost'` below. `'lost'` is deliberately its own terminal variant rather
 * than a flag on `'investigatingFire'`: issue G's battery/endurance
 * telemetry already grew `'investigating'`'s sibling modes this same
 * extensible-union way, and once `'lost'`, a Drone carries no
 * `assignedFireId`/`missionKind` at all — it is no longer investigating
 * anything, permanently.
 */
export type DroneActivityState =
  | { mode: 'patrolling' }
  | { mode: 'investigating'; assignedEventId: string; investigationStartedAtSimSeconds: number }
  /**
   * Transit state entered the instant the operator dispatches a Drone to a
   * Fire (`withManualFireDispatch`): the Drone flies straight toward the
   * Fire's orbit-entry point at `DronePatrolState.cruiseSpeedMetersPerSecond`,
   * linearly interpolating from `departurePosition` (its position at dispatch
   * time) to the orbit-entry point. `orbitRadiusMeters` is snapshotted at
   * dispatch (same as the `'investigatingFire'` variant below, for the same
   * "fixed for this investigation's whole duration" reason). Transitions to
   * `'investigatingFire'` (via `activityAfterInvestigationExpiry`) the tick
   * the elapsed travel time meets or exceeds the distance ÷ cruise-speed
   * travel duration. `missionKind` is carried through so the correct ending
   * condition is applied once the orbit begins.
   */
  | {
      mode: 'travelingToFire'
      assignedFireId: string
      departurePosition: LatLng
      departureSimSeconds: number
      missionKind: FireMissionKind
      orbitRadiusMeters: number
    }
  | {
      mode: 'investigatingFire'
      assignedFireId: string
      investigationStartedAtSimSeconds: number
      missionKind: FireMissionKind
      orbitRadiusMeters: number
    }
  /**
   * Return-flight state entered once a `'roundTrip'` Drone's single orbit lap
   * completes: the Drone flies straight from the orbit-exit point back toward
   * its `DronePatrolState.patrolCenter` at `cruiseSpeedMetersPerSecond`,
   * linearly interpolating from `departurePosition` (the orbit-exit point).
   * Transitions to `'patrolling'` (via `activityAfterInvestigationExpiry`)
   * the tick the elapsed return time meets or exceeds the distance ÷ cruise-
   * speed return duration.
   */
  | {
      mode: 'returningToBase'
      departurePosition: LatLng
      returnStartedAtSimSeconds: number
    }
  /**
   * Transit state entered the instant the operator manually recalls a Drone
   * via the status panel's "Return to Nearest Base" button
   * (`withManualReturnToBase`): the Drone abandons whatever it was doing and
   * flies straight toward `targetPosition` (its *nearest* Base Station's
   * position, chosen at recall time from its live position) at
   * `DronePatrolState.cruiseSpeedMetersPerSecond`, linearly interpolating from
   * `departurePosition` (its position at recall). Deliberately kept separate
   * from `'returningToBase'` (the post-orbit round-trip return that reverts to
   * `'patrolling'` at `patrolCenter`): this one targets a real Base Station
   * and ends in the terminal `'grounded'` state instead — see ADR-0007 /
   * `CONTEXT.md`'s **Grounded** entry. Transitions (via
   * `activityAfterInvestigationExpiry`) to `'grounded'` the tick the elapsed
   * return time meets or exceeds the distance ÷ cruise-speed return duration,
   * or to `'lost'` if this Drone's live `remainingEnduranceSimSeconds` reaches
   * zero before it arrives (honoring endurance, same "just enough to make it
   * back" framing as the One-Way Mission's Lost check).
   */
  | {
      mode: 'returningToStation'
      targetPosition: LatLng
      departurePosition: LatLng
      returnStartedAtSimSeconds: number
    }
  /**
   * Terminal state (ADR-0007, `CONTEXT.md`'s **Grounded** entry) a Drone
   * enters once it completes a manual return-to-base flight
   * (`'returningToStation'`): parked at its nearest Base Station's
   * `position`, permanently out of service for the rest of the run and
   * excluded from dispatch (the `'patrolling'`-only dispatch guards in
   * `withManualDispatch`/`withManualFireDispatch` and the panels' available-
   * Drone filters already exclude it, since its mode is not `'patrolling'`).
   * There is no recharge/relaunch (ADR-0007): endurance stays the closed-form
   * drain from t=0, so a Grounded Drone stays Grounded. Distinct from
   * `'lost'` (sacrificed in the field on a One-Way Mission, or run out mid-
   * return): Grounded made it safely home. Once `'grounded'`, a Drone never
   * leaves this mode — same monotonic/sticky spirit as `'lost'`.
   */
  | { mode: 'grounded'; position: LatLng; groundedAtSimSeconds: number }
  /**
   * Terminal state (issue W, `CONTEXT.md`'s **Lost** entry) a `'oneWay'`
   * Drone falls into the instant its live `remainingEnduranceSimSeconds` hits
   * zero — whether it was still `'travelingToFire'` or already
   * `'investigatingFire'` at that moment. `position` is a frozen snapshot of
   * exactly where the Drone was at `lostAtSimSeconds` (= its own
   * `maxEnduranceSimSeconds`) — not whatever later tick `advanceSimulation`
   * happened to next be called for, which may have overshot it. Once `'lost'`,
   * a Drone never leaves this mode — same monotonic/sticky spirit as
   * `EventStatus`'s `'resolved'`/`FireTier`'s `'investigated'`.
   */
  | { mode: 'lost'; position: LatLng; lostAtSimSeconds: number }

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
 * `advanceSimulation.ts`). `'investigated'` (issue V) is reached the instant
 * any Drone begins actively orbiting the Fire (see
 * `FireRuntimeState.confirmedFootprintHexCells`) — a one-way ratchet, same
 * monotonic-forward-only spirit as `EventStatus`: once `'investigated'`, a
 * Fire's tier never reverts to `'towerDetected'`, even after every
 * orbiting Drone leaves or is lost.
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
 *
 * `confirmedFootprintHexCells`/`confirmedAtSimSeconds` (issue V,
 * `CONTEXT.md`'s **Confirmed Shape** entry) together hold that Fire's
 * Confirmed Shape: the real Fire Footprint (`growthEllipse.ts`'s
 * `fireFootprintHexCells`) as last observed by an orbiting Drone.
 * `advanceSimulation.ts` re-derives both, every tick, to the *current* live
 * footprint while at least one Drone is actively orbiting this Fire
 * (`droneActivity` has a `'investigatingFire'` entry with this
 * `id` as its `assignedFireId`) — the instant the last such Drone stops
 * (investigation complete, back to patrol; or, in a future issue, Lost),
 * both fields simply stop being touched, freezing whatever they held on
 * that last tick as a stale snapshot (`confirmedAtSimSeconds` records
 * exactly when that snapshot was taken). Both are `undefined` until a Fire
 * has been orbited at least once — i.e. exactly while `tier !==
 * 'investigated'`.
 */
export interface FireRuntimeState {
  id: string
  position: LatLng
  tier: FireTier
  spawnAtSimSeconds: number
  detectedByAssetId?: string
  detectedAtSimSeconds?: number
  confirmedFootprintHexCells?: HexCoordinate[]
  confirmedAtSimSeconds?: number
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
 * see `advanceSimulation`. `wind` (issue V) is the Scenario's own `Wind`,
 * copied through unchanged from `initializeSimulationState` (mirrors
 * `scenarioEvents`/`scenarioFireIgnitions`: scenario-fixed, never
 * recomputed) — needed here, rather than only at the map-rendering layer
 * like before, now that Fire Footprint math
 * (`growthEllipse.ts`'s `fireFootprintHexCells`/`fireOrbitRadiusMetersAt`)
 * feeds real engine behavior (orbit radius, Confirmed Shape), not just
 * `FireFootprintLayer`'s Ground-Truth-View rendering.
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
  wind: Wind
  /**
   * The engine-emitted Event Log (ADR-0008, `CONTEXT.md`'s **Event Log** /
   * **Log Entry** entries): an append-only, chronological (oldest-first)
   * feed of structured {@link EventLogEntry} records, stamped with the exact
   * sim-second each transition occurred. Emitted by `advanceSimulation` and
   * the `withManual*` command functions (never diffed from snapshots — see
   * ADR-0008: `activityAfterInvestigationExpiry` can collapse several
   * transitions into one tick at high speed, so each is logged the moment it
   * happens rather than reconstructed after the fact). Capped at
   * `EVENT_LOG_CAP` entries, dropping oldest (see `appendLogEntry`). The UI
   * reverses this for its newest-at-top display and formats each entry's
   * human-readable line/timestamp — the engine keeps only typed payloads,
   * never pre-rendered strings.
   */
  log: EventLogEntry[]
}
