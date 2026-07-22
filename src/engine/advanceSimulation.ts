import { distanceMetersBetween, pointOnCircle } from '../map/geo'
import type { LatLng } from '../map/geo'
import { INVESTIGATION_DURATION_SIM_SECONDS, investigatePositionFor } from './dispatch'
import type { Scenario, ScenarioEntry, ScenarioEvent, ScenarioFireIgnition } from '../scenario/types'
import type { BaseStation, DroneType, World } from '../world/types'
import type {
  DroneActivityState,
  DronePatrolState,
  EventRuntimeState,
  FireRuntimeState,
  SimulationState,
  TowerDetectionState,
} from './types'

/**
 * Per-Drone-type patrol loop parameters (ADR/PRD design guidance): a
 * Quadrocopter loops tightly near its home Base Station; a Fixed-Wing Drone
 * loops a much larger "long perimeter" at a visibly higher linear speed.
 * `linearSpeedMetersPerSecond` is the Drone's actual speed along the loop
 * (matches what's "visibly" faster on the map) — `angularSpeedRadiansPerSecond`
 * is derived from it and the radius, not authored directly.
 */
const PATROL_PARAMS_BY_DRONE_TYPE: Record<
  DroneType,
  { radiusMeters: number; linearSpeedMetersPerSecond: number }
> = {
  Quadrocopter: { radiusMeters: 250, linearSpeedMetersPerSecond: 8 },
  FixedWingDrone: { radiusMeters: 2500, linearSpeedMetersPerSecond: 25 },
}

/**
 * Per-Drone-type default detection radius (ADR-0003: a Drone detects any
 * Event type within its fixed radius). A World author can override this
 * per-Drone via the `detectionRadiusMeters` field, mirroring the patrol
 * parameter overrides above.
 */
const DETECTION_RADIUS_METERS_BY_DRONE_TYPE: Record<DroneType, number> = {
  Quadrocopter: 500,
  FixedWingDrone: 1500,
}

/**
 * Deterministic per-Drone phase offset so multiple Drones patrolling the
 * same Base Station don't sit exactly on top of each other at
 * `elapsedSimSeconds = 0`. Derived from the Drone's own id, not from array
 * position, so it's stable regardless of `world.drones` ordering.
 */
function phaseOffsetForDroneId(droneId: string): number {
  let charCodeSum = 0
  for (let i = 0; i < droneId.length; i += 1) {
    charCodeSum += droneId.charCodeAt(i)
  }
  return (charCodeSum % 360) * (Math.PI / 180)
}

function findHomeBaseStation(world: World, homeBaseStationId: string): BaseStation {
  const homeBaseStation = world.baseStations.find((baseStation) => baseStation.id === homeBaseStationId)
  if (!homeBaseStation) {
    throw new Error(`Drone references unknown home Base Station "${homeBaseStationId}"`)
  }
  return homeBaseStation
}

/**
 * Derives the set of currently-spawned Events for an absolute simulated
 * time: every {@link ScenarioEvent} whose `spawnAtSimSeconds` has been
 * reached, each as a fresh `'undetected'` {@link EventRuntimeState} (no
 * Detection logic exists yet — see `SimulationState.events`). Events whose
 * spawn time hasn't been reached are left out of the result entirely,
 * which is what "an Event does not appear before its spawn time" means at
 * this engine seam. Pure and total: the same `scenarioEvents` +
 * `elapsedSimSeconds` always produces the same result.
 */
function spawnedEventsAt(
  scenarioEvents: readonly ScenarioEvent[],
  elapsedSimSeconds: number,
): Record<string, EventRuntimeState> {
  const events: Record<string, EventRuntimeState> = {}

  for (const scenarioEvent of scenarioEvents) {
    if (scenarioEvent.spawnAtSimSeconds > elapsedSimSeconds) continue

    events[scenarioEvent.id] = {
      id: scenarioEvent.id,
      type: scenarioEvent.type,
      position: scenarioEvent.position,
      status: 'undetected',
      spawnAtSimSeconds: scenarioEvent.spawnAtSimSeconds,
      ...(scenarioEvent.durationSimSeconds !== undefined
        ? { durationSimSeconds: scenarioEvent.durationSimSeconds }
        : {}),
    }
  }

  return events
}

/**
 * The single asset id (if any) in `assets` whose `detectionRadiusMeters`
 * currently reaches `position` — the shared scan loop behind both
 * {@link detectingAssetIdFor} and {@link detectingAssetIdForFire}. Iterates
 * `assets` in its own key order (stable, derived from `world.towers`/
 * `world.drones` array order — see `initializeSimulationState`), so which
 * asset "wins" when several are simultaneously in range is deterministic.
 */
function assetIdWithinRadius(
  position: LatLng,
  assets: Record<string, { position: LatLng; detectionRadiusMeters: number }>,
): string | undefined {
  for (const [assetId, asset] of Object.entries(assets)) {
    if (distanceMetersBetween(position, asset.position) <= asset.detectionRadiusMeters) {
      return assetId
    }
  }

  return undefined
}

/**
 * The single Drone id (if any) whose detection radius currently contains
 * `event`'s position, per ADR-0003's Detection rule: a Drone (either kind)
 * detects any Event type. Towers never detect a Person Sighting/Fallen
 * Tree Event — only a Fire (see {@link detectingAssetIdForFire}, ADR-0004)
 * — so this no longer needs a `towerDetection` check at all now that Fire
 * has moved off this path entirely.
 */
function detectingAssetIdFor(event: { position: LatLng }, dronePatrol: Record<string, DronePatrolState>): string | undefined {
  return assetIdWithinRadius(event.position, dronePatrol)
}

/**
 * The single Tower or Drone id (if any) whose detection radius currently
 * contains a Fire at `position`, per ADR-0003/ADR-0004's Detection rule: a
 * Tower detects a Fire; a Drone (either kind) also detects a Fire, same as
 * any Event type (`CONTEXT.md`'s Detection entry: "a Tower for a Fire, a
 * Drone for any Event type or a Fire"). Towers are checked first, so a Fire
 * simultaneously within both a Tower's and a Drone's range is attributed to
 * the Tower — the network's designated fire sensor.
 */
function detectingAssetIdForFire(
  position: LatLng,
  dronePatrol: Record<string, DronePatrolState>,
  towerDetection: Record<string, TowerDetectionState>,
): string | undefined {
  return assetIdWithinRadius(position, towerDetection) ?? assetIdWithinRadius(position, dronePatrol)
}

/**
 * Copies `detectedByAssetId`/`detectedAtSimSeconds` from `source` onto
 * `target` if present on `source` — the shared "sticky Detection fields"
 * shape both {@link eventWithDetectionApplied} and
 * {@link fireWithDetectionApplied} use when carrying a previous tick's
 * already-Detected state forward unchanged, rather than spreading these
 * two optional fields inline in each.
 */
function withStickyDetectionFields<Target>(
  target: Target,
  source: { detectedByAssetId?: string; detectedAtSimSeconds?: number },
): Target {
  return {
    ...target,
    ...(source.detectedByAssetId !== undefined ? { detectedByAssetId: source.detectedByAssetId } : {}),
    ...(source.detectedAtSimSeconds !== undefined ? { detectedAtSimSeconds: source.detectedAtSimSeconds } : {}),
  }
}

/**
 * Applies this tick's Resolution check (issue G) to an already-`'detected'`
 * `event`: per the PRD's Event model Implementation Decision, resolution
 * happens after an optional scenario-defined `durationSimSeconds` elapses
 * *post-Detection*, so the clock counted here starts at
 * `event.detectedAtSimSeconds`, not `event.spawnAtSimSeconds`. An Event
 * with no `durationSimSeconds` never resolves; an Event that isn't (yet)
 * `'detected'` — still `'undetected'`, or already `'resolved'` — passes
 * through unchanged, keeping this (like Detection) monotonic and
 * forward-only.
 */
function eventWithResolutionApplied(event: EventRuntimeState, elapsedSimSeconds: number): EventRuntimeState {
  if (
    event.status === 'detected' &&
    event.durationSimSeconds !== undefined &&
    event.detectedAtSimSeconds !== undefined &&
    elapsedSimSeconds - event.detectedAtSimSeconds >= event.durationSimSeconds
  ) {
    return { ...event, status: 'resolved' }
  }

  return event
}

/**
 * Applies this tick's Detection check to a freshly-derived `event`, using
 * `previousEventState` — this same Event's entry in the *incoming*
 * `SimulationState.events`, if any — as memory. Detection is monotonic
 * (`CONTEXT.md`: Undetected -> Detected -> Resolved, never backward), so
 * once `previousEventState.status` has left `'undetected'` it's carried
 * forward (along with its sticky `detectedByAssetId`/`detectedAtSimSeconds`)
 * rather than re-derived from this tick's asset positions — this is what
 * keeps an Event Detected after the Drone that found it flies back out of
 * range. Only an Event that's still `'undetected'` (including
 * newly-spawned ones, which have no `previousEventState` yet) is checked
 * against the current tick's Tower and Drone positions. Either way, the
 * result is run through {@link eventWithResolutionApplied} before being
 * returned, so a newly-`'detected'` Event (whose `durationSimSeconds`
 * happens to be `0`) and a long-since-`'detected'` one are both checked for
 * resolution on the same tick.
 */
function eventWithDetectionApplied(
  event: EventRuntimeState,
  previousEventState: EventRuntimeState | undefined,
  elapsedSimSeconds: number,
  dronePatrol: Record<string, DronePatrolState>,
): EventRuntimeState {
  if (previousEventState && previousEventState.status !== 'undetected') {
    return eventWithResolutionApplied(
      withStickyDetectionFields({ ...event, status: previousEventState.status }, previousEventState),
      elapsedSimSeconds,
    )
  }

  const detectingAssetId = detectingAssetIdFor(event, dronePatrol)
  if (detectingAssetId === undefined) {
    return event
  }

  return eventWithResolutionApplied(
    { ...event, status: 'detected', detectedByAssetId: detectingAssetId, detectedAtSimSeconds: elapsedSimSeconds },
    elapsedSimSeconds,
  )
}

/**
 * Derives every currently-spawned Event's live state for this tick: starts
 * from {@link spawnedEventsAt}'s fresh (always-`'undetected'`) snapshot,
 * then runs each one through {@link eventWithDetectionApplied} against
 * `incomingEvents` (the previous tick's `SimulationState.events`, for
 * sticky status) and the current tick's `dronePatrol` positions.
 *
 * Tick-resolution caveat: this only checks each asset's position at the
 * discrete instants `advanceSimulation` is called for, not continuously
 * along its path — a Drone briefly sweeping through an Event's radius
 * between two calls (e.g. a fast Fixed-Wing pass during a coarse
 * wall-clock-to-simulated-time step) could be missed. `useSimulationClock`
 * drives this at animation-frame granularity, which keeps the gap small in
 * practice; a prototype-scale limitation, not fixed here.
 */
function eventsAt(
  scenarioEvents: readonly ScenarioEvent[],
  elapsedSimSeconds: number,
  incomingEvents: Record<string, EventRuntimeState>,
  dronePatrol: Record<string, DronePatrolState>,
): Record<string, EventRuntimeState> {
  const events: Record<string, EventRuntimeState> = {}

  for (const [id, event] of Object.entries(spawnedEventsAt(scenarioEvents, elapsedSimSeconds))) {
    events[id] = eventWithDetectionApplied(event, incomingEvents[id], elapsedSimSeconds, dronePatrol)
  }

  return events
}

/**
 * The Fire-ignition mirror of {@link spawnedEventsAt} (ADR-0004): every
 * {@link ScenarioFireIgnition} whose `spawnAtSimSeconds` has been reached,
 * each as a fresh `'undetected'` {@link FireRuntimeState}. Fire ignitions
 * whose spawn time hasn't been reached are left out entirely, same
 * "doesn't exist before spawn" rule as Events. Pure and total.
 */
function spawnedFiresAt(
  scenarioFireIgnitions: readonly ScenarioFireIgnition[],
  elapsedSimSeconds: number,
): Record<string, FireRuntimeState> {
  const fires: Record<string, FireRuntimeState> = {}

  for (const scenarioFireIgnition of scenarioFireIgnitions) {
    if (scenarioFireIgnition.spawnAtSimSeconds > elapsedSimSeconds) continue

    fires[scenarioFireIgnition.id] = {
      id: scenarioFireIgnition.id,
      position: scenarioFireIgnition.position,
      tier: 'undetected',
      spawnAtSimSeconds: scenarioFireIgnition.spawnAtSimSeconds,
    }
  }

  return fires
}

/**
 * The Fire-tier mirror of {@link eventWithDetectionApplied} (ADR-0004): once
 * `previousFireState.tier` has left `'undetected'` it's carried forward
 * (sticky, monotonic — same rule as `EventRuntimeState.status`) rather than
 * re-derived from this tick's asset positions. Only a still-`'undetected'`
 * Fire is checked against the current tick's Tower/Drone positions via
 * {@link detectingAssetIdForFire}. Unlike `eventWithDetectionApplied`,
 * there is no resolution step afterward — a Fire never auto-resolves — and
 * the only tier a fresh Detection can produce here is `'towerDetected'`;
 * `'investigated'` is not yet reachable in this slice (issues U/V).
 */
function fireWithDetectionApplied(
  fire: FireRuntimeState,
  previousFireState: FireRuntimeState | undefined,
  elapsedSimSeconds: number,
  dronePatrol: Record<string, DronePatrolState>,
  towerDetection: Record<string, TowerDetectionState>,
): FireRuntimeState {
  if (previousFireState && previousFireState.tier !== 'undetected') {
    return withStickyDetectionFields({ ...fire, tier: previousFireState.tier }, previousFireState)
  }

  const detectingAssetId = detectingAssetIdForFire(fire.position, dronePatrol, towerDetection)
  if (detectingAssetId === undefined) {
    return fire
  }

  return { ...fire, tier: 'towerDetected', detectedByAssetId: detectingAssetId, detectedAtSimSeconds: elapsedSimSeconds }
}

/**
 * The Fire mirror of {@link eventsAt} (ADR-0004): starts from {@link
 * spawnedFiresAt}'s fresh snapshot, then runs each Fire through {@link
 * fireWithDetectionApplied} against `incomingFires` (the previous tick's
 * `SimulationState.fires`, for sticky tier) and the current tick's
 * `dronePatrol`/`towerDetection` positions. Same tick-resolution caveat as
 * `eventsAt` applies.
 */
function firesAt(
  scenarioFireIgnitions: readonly ScenarioFireIgnition[],
  elapsedSimSeconds: number,
  incomingFires: Record<string, FireRuntimeState>,
  dronePatrol: Record<string, DronePatrolState>,
  towerDetection: Record<string, TowerDetectionState>,
): Record<string, FireRuntimeState> {
  const fires: Record<string, FireRuntimeState> = {}

  for (const [id, fire] of Object.entries(spawnedFiresAt(scenarioFireIgnitions, elapsedSimSeconds))) {
    fires[id] = fireWithDetectionApplied(fire, incomingFires[id], elapsedSimSeconds, dronePatrol, towerDetection)
  }

  return fires
}

/**
 * A Drone's `DroneActivityState` after checking whether an ongoing
 * investigation's duration has elapsed by `elapsedSimSeconds` — the
 * dispatch-side mirror of `eventWithDetectionApplied`'s sticky-status
 * merge: `'investigating'` is carried forward from `incomingActivity`
 * unless `INVESTIGATION_DURATION_SIM_SECONDS` has passed since it started,
 * in which case the Drone reverts to `'patrolling'` (issue F: "After the
 * investigation interval elapses, the Drone's mode flips back to
 * patrolling"). Missing/`'patrolling'` input passes through unchanged.
 */
function activityAfterInvestigationExpiry(
  incomingActivity: DroneActivityState | undefined,
  elapsedSimSeconds: number,
): DroneActivityState {
  if (!incomingActivity || incomingActivity.mode === 'patrolling') {
    return { mode: 'patrolling' }
  }

  const secondsSinceInvestigationStarted = elapsedSimSeconds - incomingActivity.investigationStartedAtSimSeconds
  if (secondsSinceInvestigationStarted >= INVESTIGATION_DURATION_SIM_SECONDS) {
    return { mode: 'patrolling' }
  }

  return incomingActivity
}

/**
 * A patrolling Drone's absolute angle (radians) around its patrol loop at
 * `elapsedSimSeconds` — the closed-form `phaseOffsetRadians +
 * angularSpeedRadiansPerSecond * elapsedSimSeconds` shared by
 * `positionForActivity` (this file) and the issue G telemetry helpers in
 * `engine/telemetry.ts` (speed/heading are both derived from this same
 * angle), so the two stay in agreement rather than re-deriving it
 * separately.
 */
export function patrolAngleRadiansAt(patrol: DronePatrolState, elapsedSimSeconds: number): number {
  return patrol.phaseOffsetRadians + patrol.angularSpeedRadiansPerSecond * elapsedSimSeconds
}

/**
 * A Drone's position at `elapsedSimSeconds` given its current `activity`:
 * its normal closed-form patrol-loop position while `'patrolling'` (slice
 * C, unchanged), or — while `'investigating'` — a hover/circle position
 * around the assigned Event, looked up from `incomingEvents` (the Event's
 * position never changes once spawned, so the previous tick's copy is a
 * safe, stable source). Falls back to the patrol position if the assigned
 * Event is somehow missing from `incomingEvents`, which should not happen
 * in practice (dispatch only ever assigns an Event id already present in
 * that tick's `events`) but keeps this function total rather than throwing.
 */
function positionForActivity(
  patrol: DronePatrolState,
  activity: DroneActivityState,
  elapsedSimSeconds: number,
  incomingEvents: Record<string, EventRuntimeState>,
): LatLng {
  if (activity.mode === 'investigating') {
    const assignedEvent = incomingEvents[activity.assignedEventId]
    if (assignedEvent) {
      return investigatePositionFor(
        patrol.droneType,
        assignedEvent.position,
        elapsedSimSeconds - activity.investigationStartedAtSimSeconds,
      )
    }
  }

  const angleRadians = patrolAngleRadiansAt(patrol, elapsedSimSeconds)
  return pointOnCircle(patrol.patrolCenter, patrol.patrolRadiusMeters, angleRadians)
}

/**
 * Splits a Scenario's single timed `events` list (ADR-0004: Fire ignitions
 * and Person Sighting/Fallen Tree Events share one JSON array, told apart
 * by `type`) into the two separate arrays `SimulationState` carries
 * (`scenarioEvents`/`scenarioFireIgnitions`) — done once, here, rather than
 * re-filtered on every tick.
 */
function partitionScenarioEntries(
  entries: readonly ScenarioEntry[],
): { scenarioEvents: ScenarioEvent[]; scenarioFireIgnitions: ScenarioFireIgnition[] } {
  const scenarioEvents: ScenarioEvent[] = []
  const scenarioFireIgnitions: ScenarioFireIgnition[] = []

  for (const entry of entries) {
    if (entry.type === 'Fire') {
      scenarioFireIgnitions.push(entry)
    } else {
      scenarioEvents.push(entry)
    }
  }

  return { scenarioEvents, scenarioFireIgnitions }
}

/**
 * The shared derivation behind both `initializeSimulationState` (called
 * with `incomingDroneActivity`/`incomingEvents`/`incomingFires` all empty)
 * and `advanceSimulation` (called with the previous tick's
 * `droneActivity`/`events`/`fires` as memory). Order matters: (1) let any
 * in-progress investigation expire back to `'patrolling'` first, (2)
 * derive every Drone's position from its (possibly just-expired) activity,
 * (3) run Event and Fire Detection using those positions. There is
 * deliberately no automatic-dispatch step here (ADR-0004/ADR-0005, issues
 * O/Q): a newly-Detected Fire never dispatches a Drone at all in this
 * slice (Fire's own dispatch mechanism is a later issue, U/V), and a
 * newly-Detected Person Sighting/Fallen Tree Event no longer does either —
 * dispatching a Drone to an Event is now exclusively a user-driven action
 * via `withManualDispatch` (see `EventPanel`'s "Send" button), applied on
 * top of whatever this function returns, not from within it.
 */
function deriveDronesEventsAndFires(
  dronePatrolParams: Record<string, DronePatrolState>,
  towerDetection: Record<string, TowerDetectionState>,
  scenarioEvents: readonly ScenarioEvent[],
  scenarioFireIgnitions: readonly ScenarioFireIgnition[],
  elapsedSimSeconds: number,
  incomingDroneActivity: Record<string, DroneActivityState>,
  incomingEvents: Record<string, EventRuntimeState>,
  incomingFires: Record<string, FireRuntimeState>,
): {
  dronePatrol: Record<string, DronePatrolState>
  droneActivity: Record<string, DroneActivityState>
  events: Record<string, EventRuntimeState>
  fires: Record<string, FireRuntimeState>
} {
  const droneActivity: Record<string, DroneActivityState> = {}
  for (const droneId of Object.keys(dronePatrolParams)) {
    droneActivity[droneId] = activityAfterInvestigationExpiry(incomingDroneActivity[droneId], elapsedSimSeconds)
  }

  const dronePatrol: Record<string, DronePatrolState> = {}
  for (const [droneId, patrol] of Object.entries(dronePatrolParams)) {
    dronePatrol[droneId] = {
      ...patrol,
      position: positionForActivity(patrol, droneActivity[droneId], elapsedSimSeconds, incomingEvents),
    }
  }

  const events = eventsAt(scenarioEvents, elapsedSimSeconds, incomingEvents, dronePatrol)
  const fires = firesAt(scenarioFireIgnitions, elapsedSimSeconds, incomingFires, dronePatrol, towerDetection)

  return { dronePatrol, droneActivity, events, fires }
}

/**
 * Builds the initial {@link SimulationState} for `world` and `scenario`:
 * one patrol loop per Drone (centered on its home Base Station, sized/sped/
 * ranged per its `DroneType` — see `PATROL_PARAMS_BY_DRONE_TYPE` and
 * `DETECTION_RADIUS_METERS_BY_DRONE_TYPE`), one detection entry per Tower,
 * plus whichever of the Scenario's Events/Fire ignitions have already
 * spawned and been Detection-checked at `elapsedSimSeconds = 0`. Every
 * Drone starts `'patrolling'` (issue F) — none is auto-dispatched even if
 * an Event/Fire is Detected right away (see `deriveDronesEventsAndFires`).
 * Base Stations are static in this slice and carry no simulation state.
 */
export function initializeSimulationState(world: World, scenario: Scenario): SimulationState {
  const dronePatrolParams: Record<string, DronePatrolState> = {}
  const initialDroneActivity: Record<string, DroneActivityState> = {}

  for (const drone of world.drones) {
    const homeBaseStation = findHomeBaseStation(world, drone.homeBaseStationId)
    const typeDefaults = PATROL_PARAMS_BY_DRONE_TYPE[drone.type]
    // A World author can override any of these per-Drone (the PRD's
    // documented Drone "patrol parameters" plus detection radius fields);
    // an omitted field falls back to the DroneType default below.
    const radiusMeters = drone.patrolRadiusMeters ?? typeDefaults.radiusMeters
    const linearSpeedMetersPerSecond = drone.patrolSpeedMetersPerSecond ?? typeDefaults.linearSpeedMetersPerSecond
    const detectionRadiusMeters = drone.detectionRadiusMeters ?? DETECTION_RADIUS_METERS_BY_DRONE_TYPE[drone.type]
    const phaseOffsetRadians = phaseOffsetForDroneId(drone.id)
    const patrolCenter = homeBaseStation.position

    dronePatrolParams[drone.id] = {
      droneType: drone.type,
      patrolCenter,
      patrolRadiusMeters: radiusMeters,
      angularSpeedRadiansPerSecond: linearSpeedMetersPerSecond / radiusMeters,
      phaseOffsetRadians,
      detectionRadiusMeters,
      position: pointOnCircle(patrolCenter, radiusMeters, phaseOffsetRadians),
    }
    initialDroneActivity[drone.id] = { mode: 'patrolling' }
  }

  const towerDetection: Record<string, TowerDetectionState> = {}
  for (const tower of world.towers) {
    towerDetection[tower.id] = { position: tower.position, detectionRadiusMeters: tower.detectionRadiusMeters }
  }

  const { scenarioEvents, scenarioFireIgnitions } = partitionScenarioEntries(scenario.events)

  const derived = deriveDronesEventsAndFires(
    dronePatrolParams,
    towerDetection,
    scenarioEvents,
    scenarioFireIgnitions,
    0,
    initialDroneActivity,
    {},
    {},
  )

  return {
    elapsedSimSeconds: 0,
    dronePatrol: derived.dronePatrol,
    droneActivity: derived.droneActivity,
    towerDetection,
    scenarioEvents,
    scenarioFireIgnitions,
    events: derived.events,
    fires: derived.fires,
  }
}

/**
 * Advances the simulation to the given *absolute* simulated time and
 * returns a new state — it never mutates `state`. Each Drone's position is
 * a closed-form, memoryless function of `elapsedSimSeconds` alone while
 * `'patrolling'` (patrol parameters, unchanging), so calling this with the
 * same `state` and `elapsedSimSeconds` always returns identical positions
 * no matter how many times or in what order it's called for a Drone that
 * stays `'patrolling'` throughout (see the determinism tests in
 * `advanceSimulation.test.ts`). Event `status`, Fire `tier`, and Drone
 * `droneActivity` are, however, genuinely history-dependent — Detection is
 * monotonic for both Events and Fires (see `eventWithDetectionApplied`/
 * `fireWithDetectionApplied`) and a dispatched Drone's investigation has a
 * start time and duration (see `activityAfterInvestigationExpiry`) — so
 * this reads `state.events`/`state.fires`/`state.droneActivity` as memory;
 * the same `state` + `elapsedSimSeconds` pair still always produces the
 * same output (it's a pure function of both), it's just that this output
 * legitimately depends on `state`, not on `elapsedSimSeconds` alone. Has no
 * dependency on React, Leaflet, or wall-clock time — see
 * `useSimulationClock` for that layer, which is responsible for actually
 * feeding each tick's result back in as the next tick's `state` so this
 * memory persists.
 */
export function advanceSimulation(state: SimulationState, elapsedSimSeconds: number): SimulationState {
  const derived = deriveDronesEventsAndFires(
    state.dronePatrol,
    state.towerDetection,
    state.scenarioEvents,
    state.scenarioFireIgnitions,
    elapsedSimSeconds,
    state.droneActivity,
    state.events,
    state.fires,
  )

  return {
    elapsedSimSeconds,
    dronePatrol: derived.dronePatrol,
    droneActivity: derived.droneActivity,
    towerDetection: state.towerDetection,
    scenarioEvents: state.scenarioEvents,
    scenarioFireIgnitions: state.scenarioFireIgnitions,
    events: derived.events,
    fires: derived.fires,
  }
}

/**
 * Applies an explicit user "send this Drone" action (ADR-0005: manual
 * dispatch replaces auto-dispatch for Person Sighting/Fallen Tree — see
 * `EventPanel`'s "Send" button) on top of `state`, as of `state`'s own
 * `elapsedSimSeconds`. This is the pure state-transition counterpart to
 * `initializeSimulationState`/`advanceSimulation` for a user-driven action
 * rather than a time-driven one: `useSimulationClock`'s `sendDrone` calls
 * this directly (rather than queueing something for the next
 * `advanceSimulation` tick) precisely so a "Send" click takes effect
 * immediately, whether the Simulation Clock is playing, paused, or
 * mid-step. `droneId` switches to `'investigating'` `eventId` starting
 * now, and its position is re-derived immediately via
 * `investigatePositionFor` (hover for a Quadrocopter, circle for a
 * Fixed-Wing Drone) so it appears there without waiting a tick — from that
 * point on, `advanceSimulation`'s existing `activityAfterInvestigationExpiry`
 * reverts it to `'patrolling'` after `INVESTIGATION_DURATION_SIM_SECONDS`,
 * the same investigation lifecycle issue F originally gave an
 * auto-dispatched Drone. A no-op (returns `state` unchanged, same object
 * identity) if
 * `droneId` isn't currently `'patrolling'` or `eventId` isn't a
 * currently-`'detected'` Event — `EventPanel` only ever offers "Send" for
 * an eligible combination, but this stays defensive/total rather than
 * throwing on a stale click.
 */
export function withManualDispatch(state: SimulationState, droneId: string, eventId: string): SimulationState {
  const patrol = state.dronePatrol[droneId]
  const activity = state.droneActivity[droneId]
  const event = state.events[eventId]

  if (!patrol || activity?.mode !== 'patrolling' || !event || event.status !== 'detected') {
    return state
  }

  const investigationStartedAtSimSeconds = state.elapsedSimSeconds

  return {
    ...state,
    dronePatrol: {
      ...state.dronePatrol,
      [droneId]: { ...patrol, position: investigatePositionFor(patrol.droneType, event.position, 0) },
    },
    droneActivity: {
      ...state.droneActivity,
      [droneId]: { mode: 'investigating', assignedEventId: eventId, investigationStartedAtSimSeconds },
    },
  }
}
