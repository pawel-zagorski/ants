import { distanceMetersBetween, interpolateLatLng, pointOnCircle, tangentialSpeedMetersPerSecond } from '../map/geo'
import type { LatLng } from '../map/geo'
import { INVESTIGATION_DURATION_SIM_SECONDS, investigatePositionFor } from './dispatch'
import { appendLogEntry } from './eventLog'
import type { EventLogEntry } from './eventLog'
import { fireFootprintHexCells, fireOrbitRadiusMetersAt } from './growthEllipse'
import { orbitLapDurationSimSeconds, orbitPositionFor } from './orbit'
import { remainingEnduranceSimSecondsAt } from './telemetry'
import type { Scenario, ScenarioEntry, ScenarioEvent, ScenarioFireIgnition, Wind } from '../scenario/types'
import type { BaseStation, DroneType, World } from '../world/types'
import type {
  DroneActivityState,
  DronePatrolState,
  EventRuntimeState,
  FireMissionKind,
  FireRuntimeState,
  SimulationState,
  TowerDetectionState,
} from './types'

/**
 * A yet-to-be-identified {@link EventLogEntry} — everything the engine knows
 * about a transition at the moment it emits it, minus the deterministic `id`.
 * The `id` can only be assigned once every draft produced by a single
 * `advanceSimulation`/`withManual*` call is known, since it embeds that
 * draft's index among them (see {@link finalizeLogDrafts}) — so the emission
 * points below accumulate drafts and the top-level call stamps ids last.
 */
type LogEntryDraft = Omit<EventLogEntry, 'id'>

/**
 * Turns the ordered {@link LogEntryDraft}s produced during a single call into
 * fully-identified {@link EventLogEntry}s, assigning each the ADR-0008
 * deterministic id `${kind}:${droneId ?? eventId ?? fireId ?? 'x'}:${simSeconds}:${i}`
 * where `i` is its index among the drafts from THAT call — never `Math.random`
 * or `Date.now`, so replaying the same state along the same time points yields
 * byte-identical ids (and therefore logs).
 */
function finalizeLogDrafts(drafts: readonly LogEntryDraft[]): EventLogEntry[] {
  return drafts.map((draft, i) => ({
    id: `${draft.kind}:${draft.droneId ?? draft.eventId ?? draft.fireId ?? 'x'}:${draft.simSeconds}:${i}`,
    ...draft,
  }))
}

/** Appends every finalized {@link LogEntryDraft} to `log` in order, capped via {@link appendLogEntry}. */
function logWithDraftsAppended(log: readonly EventLogEntry[], drafts: readonly LogEntryDraft[]): EventLogEntry[] {
  return finalizeLogDrafts(drafts).reduce<EventLogEntry[]>((acc, entry) => appendLogEntry(acc, entry), [...log])
}

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
 * the only tier a fresh Detection can produce here is `'towerDetected'` —
 * `'investigated'` is a separate, later ratchet layered on top by {@link
 * fireWithConfirmedShapeApplied}, once a Drone actually orbits it.
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

/** Whether any Drone in `droneActivity` is, this tick, `'investigatingFire'` `fireId` specifically — see {@link fireWithConfirmedShapeApplied}. */
function isAnyDroneOrbitingFire(fireId: string, droneActivity: Record<string, DroneActivityState>): boolean {
  return Object.values(droneActivity).some(
    (activity) => activity.mode === 'investigatingFire' && activity.assignedFireId === fireId,
  )
}

/**
 * `fire`, with the real Fire Footprint (`growthEllipse.ts`'s
 * `fireFootprintHexCells`) captured as this Fire's Confirmed Shape
 * *right now* — the moment a Drone begins actively orbiting it (issue V,
 * `CONTEXT.md`'s Confirmed Shape entry) and every tick afterward while at
 * least one still is. Also ratchets `tier` to `'investigated'` (a Fire
 * reaching `'investigated'` and starting/continuing to be orbited are the
 * same event in this engine — see `DroneActivityState`'s doc comment: an
 * orbit begins the instant dispatch happens, with no separate travel-time
 * phase). Shared by both {@link fireWithConfirmedShapeApplied} (the
 * per-tick path) and `withManualFireDispatch` (the immediate,
 * user-triggered "Send" path, which needs this exact same snapshot without
 * waiting for the next `advanceSimulation` tick).
 */
function fireWithOrbitStarted(fire: FireRuntimeState, elapsedSimSeconds: number, wind: Wind): FireRuntimeState {
  const elapsedSecondsSinceIgnition = elapsedSimSeconds - fire.spawnAtSimSeconds

  return {
    ...fire,
    tier: 'investigated',
    confirmedFootprintHexCells: fireFootprintHexCells(elapsedSecondsSinceIgnition, wind),
    confirmedAtSimSeconds: elapsedSimSeconds,
  }
}

/**
 * Layers issue V's `'investigated'` tier and Confirmed Shape tracking on
 * top of `fire` (already run through {@link fireWithDetectionApplied}):
 *
 * - While {@link isAnyDroneOrbitingFire} this Fire this tick: ratchets to
 *   `'investigated'` and re-derives the Confirmed Shape to the *current*
 *   live Fire Footprint ({@link fireWithOrbitStarted}) — this is the "live
 *   Confirmed Shape updates every tick while a Drone actively orbits"
 *   acceptance criterion.
 * - Otherwise, if `previousFireState` already had a Confirmed Shape
 *   (`confirmedFootprintHexCells` set): carries `tier: 'investigated'` and
 *   both Confirmed Shape fields forward *unchanged* from
 *   `previousFireState` — this is the freeze: the instant the last
 *   orbiting Drone leaves, this function stops re-deriving the footprint
 *   and simply repeats whatever `previousFireState` already held, forever,
 *   same "carried forward unchanged" shape every other sticky field in
 *   this engine uses.
 * - Otherwise (never yet orbited): returns `fire` unchanged — still
 *   whichever of `'undetected'`/`'towerDetected'`
 *   {@link fireWithDetectionApplied} produced, no Confirmed Shape yet.
 */
function fireWithConfirmedShapeApplied(
  fire: FireRuntimeState,
  previousFireState: FireRuntimeState | undefined,
  elapsedSimSeconds: number,
  droneActivity: Record<string, DroneActivityState>,
  wind: Wind,
): FireRuntimeState {
  if (isAnyDroneOrbitingFire(fire.id, droneActivity)) {
    return fireWithOrbitStarted(fire, elapsedSimSeconds, wind)
  }

  if (previousFireState?.confirmedFootprintHexCells) {
    return {
      ...fire,
      tier: 'investigated',
      confirmedFootprintHexCells: previousFireState.confirmedFootprintHexCells,
      confirmedAtSimSeconds: previousFireState.confirmedAtSimSeconds,
    }
  }

  return fire
}

/**
 * The Fire mirror of {@link eventsAt} (ADR-0004): starts from {@link
 * spawnedFiresAt}'s fresh snapshot, runs each Fire through {@link
 * fireWithDetectionApplied} against `incomingFires` (the previous tick's
 * `SimulationState.fires`, for sticky tier) and the current tick's
 * `dronePatrol`/`towerDetection` positions, then layers {@link
 * fireWithConfirmedShapeApplied} (issue V) on top using this tick's
 * already-derived `droneActivity` (post-expiry-check — see
 * `deriveDronesEventsAndFires`'s call order) and the Scenario's `wind`.
 * Same tick-resolution caveat as `eventsAt` applies.
 */
function firesAt(
  scenarioFireIgnitions: readonly ScenarioFireIgnition[],
  elapsedSimSeconds: number,
  incomingFires: Record<string, FireRuntimeState>,
  dronePatrol: Record<string, DronePatrolState>,
  towerDetection: Record<string, TowerDetectionState>,
  droneActivity: Record<string, DroneActivityState>,
  wind: Wind,
): Record<string, FireRuntimeState> {
  const fires: Record<string, FireRuntimeState> = {}

  for (const [id, fire] of Object.entries(spawnedFiresAt(scenarioFireIgnitions, elapsedSimSeconds))) {
    const detected = fireWithDetectionApplied(fire, incomingFires[id], elapsedSimSeconds, dronePatrol, towerDetection)
    fires[id] = fireWithConfirmedShapeApplied(detected, incomingFires[id], elapsedSimSeconds, droneActivity, wind)
  }

  return fires
}

/**
 * A Drone's steady, visible-animation linear speed (meters/second) along
 * whatever circle it's currently moving on — its own resolved patrol-loop
 * tangential speed (`patrolRadiusMeters`/`angularSpeedRadiansPerSecond`,
 * already folding in any per-Drone `patrolSpeedMetersPerSecond` override —
 * see `initializeSimulationState`). Issue V reuses this same speed to
 * govern a Fire-investigating Drone's orbit (see `orbitPositionFor`/
 * `orbitMotionFor` callers below) rather than `cruiseSpeedMetersPerSecond`
 * (which drives only the Return Envelope/Bingo Range *distance* budget
 * math — a representative range-planning figure, not a per-Drone-type
 * visible animation rate — see `world/types.ts`'s `Drone.cruiseSpeedMetersPerSecond`
 * doc comment) — the orbit is exactly as visible on the map as the
 * patrol loop it interrupts, so it should move at that same visible rate,
 * not silently speed up or slow down when a Drone switches from patrolling
 * to orbiting a Fire.
 */
function patrolLinearSpeedMetersPerSecond(patrol: DronePatrolState): number {
  return tangentialSpeedMetersPerSecond(patrol.angularSpeedRadiansPerSecond, patrol.patrolRadiusMeters)
}

/**
 * A Drone's `DroneActivityState` after checking whether an ongoing
 * investigation's duration has elapsed by `elapsedSimSeconds` — the
 * dispatch-side mirror of `eventWithDetectionApplied`'s sticky-status
 * merge: `'investigating'` is carried forward from `incomingActivity`
 * unless `INVESTIGATION_DURATION_SIM_SECONDS` has passed since it started,
 * in which case the Drone reverts to `'patrolling'` (issue F: "After the
 * investigation interval elapses, the Drone's mode flips back to
 * patrolling"). `'investigatingFire'` (issue U/V) has its own, different
 * completion condition, keyed by `missionKind`:
 *
 * - `'roundTrip'` (Bingo Range): completes after exactly one full orbit
 *   lap (`orbit.ts`'s `orbitLapDurationSimSeconds`, using the snapshot
 *   `orbitRadiusMeters` taken at dispatch time and this Drone's own patrol
 *   linear speed — see `patrolLinearSpeedMetersPerSecond`), then reverts to
 *   `'patrolling'` — mirroring the Event-investigation pattern above, just
 *   with a lap-based condition instead of a fixed timer (PRD user story
 *   33).
 * - `'oneWay'` (One-Way Mission): ends the instant its Drone's *live*
 *   `remainingEnduranceSimSeconds` (`telemetry.ts`'s
 *   `remainingEnduranceSimSecondsAt`, fed this Drone's own
 *   `patrol.maxEnduranceSimSeconds`) reaches zero — issue W, ADR-0006 —
 *   transitioning permanently to `'lost'` (see {@link droneActivityAfterLostCheck}
 *   for exactly how the frozen position/instant are computed). Before
 *   that instant, stays `'investigatingFire'` (sticky, carried forward
 *   unchanged), same "no ending yet" treatment `eventWithDetectionApplied`
 *   gives an already-`'detected'` Event awaiting resolution.
 * - `'lost'`: terminal — always carried forward unchanged, never
 *   re-derived, same monotonic spirit as an already-`'resolved'` Event.
 *
 * Missing/`'patrolling'` input passes through unchanged. `incomingFires` is
 * needed only for the `'oneWay'`-exhaustion case above, to look up the
 * assigned Fire's (fixed, never-moving) ignition point for that frozen
 * position.
 */
/**
 * The outcome of a single {@link activityAfterOneTransition} hop: the Drone's
 * next `DroneActivityState`, plus (when that hop is an operator-observable
 * transition) the {@link LogEntryDraft} it emits. `entry` is left undefined
 * for a no-op hop (still-in-progress, terminal-and-unchanged, or the
 * already-`'patrolling'` default) and for the purely-defensive Fire-missing
 * fallback, neither of which the operator would see in the Event Log.
 */
interface OneTransitionResult {
  activity: DroneActivityState
  entry?: LogEntryDraft
}

/** The shared Drone-identity fields every Drone-lifecycle {@link LogEntryDraft} carries. */
function droneEntryFields(droneId: string, patrol: DronePatrolState): { droneId: string; droneType: DroneType } {
  return { droneId, droneType: patrol.droneType }
}

function activityAfterInvestigationExpiry(
  droneId: string,
  incomingActivity: DroneActivityState | undefined,
  elapsedSimSeconds: number,
  patrol: DronePatrolState,
  incomingFires: Record<string, FireRuntimeState>,
): { activity: DroneActivityState; entries: LogEntryDraft[] } {
  const entries: LogEntryDraft[] = []
  let current = incomingActivity

  // A large time jump can skip multiple phases in one tick (e.g. travelling →
  // arrived → orbit complete → returned). Keep applying transitions until the
  // state stabilises (same reference = no change, or a terminal state),
  // accumulating a Log Entry for every intermediate hop (ADR-0008) so none is
  // missed even when several collapse into a single `advanceSimulation` call.
  for (;;) {
    const { activity: next, entry } = activityAfterOneTransition(droneId, current, elapsedSimSeconds, patrol, incomingFires)
    if (entry) entries.push(entry)

    if (next !== current && next.mode !== 'patrolling' && next.mode !== 'lost' && next.mode !== 'grounded') {
      current = next
      continue
    }

    return { activity: next, entries }
  }
}

function activityAfterOneTransition(
  droneId: string,
  incomingActivity: DroneActivityState | undefined,
  elapsedSimSeconds: number,
  patrol: DronePatrolState,
  incomingFires: Record<string, FireRuntimeState>,
): OneTransitionResult {
  if (!incomingActivity || incomingActivity.mode === 'patrolling') {
    return { activity: { mode: 'patrolling' } }
  }

  if (incomingActivity.mode === 'lost') {
    return { activity: incomingActivity }
  }

  if (incomingActivity.mode === 'grounded') {
    return { activity: incomingActivity }
  }

  if (incomingActivity.mode === 'returningToStation') {
    const activity = activityAfterManualReturnTransition(incomingActivity, elapsedSimSeconds, patrol)
    if (activity.mode === 'grounded') {
      return {
        activity,
        entry: {
          simSeconds: activity.groundedAtSimSeconds,
          kind: 'droneGrounded',
          severity: 'info',
          ...droneEntryFields(droneId, patrol),
          position: activity.position,
        },
      }
    }
    if (activity.mode === 'lost') {
      return {
        activity,
        entry: {
          simSeconds: activity.lostAtSimSeconds,
          kind: 'droneLost',
          severity: 'warning',
          ...droneEntryFields(droneId, patrol),
          position: activity.position,
        },
      }
    }
    return { activity }
  }

  if (incomingActivity.mode === 'travelingToFire') {
    // For a One-Way Mission, check whether this Drone has exhausted its
    // endurance before even reaching the Fire — same terminal condition as
    // `droneActivityAfterLostCheck`, just applied during transit rather than
    // during orbit.
    if (incomingActivity.missionKind === 'oneWay') {
      const remaining = remainingEnduranceSimSecondsAt(elapsedSimSeconds, patrol.maxEnduranceSimSeconds)
      if (remaining <= 0) {
        const lostAtSimSeconds = patrol.maxEnduranceSimSeconds
        const assignedFire = incomingFires[incomingActivity.assignedFireId]
        const orbitEntryPosition = assignedFire
          ? orbitPositionFor(assignedFire.position, incomingActivity.orbitRadiusMeters, patrolLinearSpeedMetersPerSecond(patrol), 0)
          : incomingActivity.departurePosition
        const travelDistance = distanceMetersBetween(incomingActivity.departurePosition, orbitEntryPosition)
        const travelDuration =
          travelDistance > 0 && patrol.cruiseSpeedMetersPerSecond > 0
            ? travelDistance / patrol.cruiseSpeedMetersPerSecond
            : 0
        const secondsSinceDeparture = lostAtSimSeconds - incomingActivity.departureSimSeconds
        const progress = travelDuration > 0 ? Math.min(1, secondsSinceDeparture / travelDuration) : 1
        const position = interpolateLatLng(incomingActivity.departurePosition, orbitEntryPosition, progress)
        return {
          activity: { mode: 'lost', position, lostAtSimSeconds },
          entry: {
            simSeconds: lostAtSimSeconds,
            kind: 'droneLost',
            severity: 'warning',
            ...droneEntryFields(droneId, patrol),
            fireId: incomingActivity.assignedFireId,
            position,
          },
        }
      }
    }

    const assignedFire = incomingFires[incomingActivity.assignedFireId]
    if (!assignedFire) {
      // Defensive fallback: assigned Fire no longer exists (should not happen
      // once spawned, but keep this total rather than throwing). Emits no Log
      // Entry — it is not an operator-observable transition.
      return { activity: { mode: 'patrolling' } }
    }

    const orbitEntryPosition = orbitPositionFor(
      assignedFire.position,
      incomingActivity.orbitRadiusMeters,
      patrolLinearSpeedMetersPerSecond(patrol),
      0,
    )
    const travelDistance = distanceMetersBetween(incomingActivity.departurePosition, orbitEntryPosition)

    if (travelDistance <= 0 || patrol.cruiseSpeedMetersPerSecond <= 0) {
      // Already at orbit entry (zero-distance travel or zero cruise speed):
      // begin orbit immediately.
      return {
        activity: {
          mode: 'investigatingFire',
          assignedFireId: incomingActivity.assignedFireId,
          investigationStartedAtSimSeconds: incomingActivity.departureSimSeconds,
          missionKind: incomingActivity.missionKind,
          orbitRadiusMeters: incomingActivity.orbitRadiusMeters,
        },
        entry: {
          simSeconds: incomingActivity.departureSimSeconds,
          kind: 'droneBeganFireOrbit',
          severity: 'info',
          ...droneEntryFields(droneId, patrol),
          fireId: incomingActivity.assignedFireId,
          position: assignedFire.position,
        },
      }
    }

    const travelDuration = travelDistance / patrol.cruiseSpeedMetersPerSecond
    const secondsSinceDeparture = elapsedSimSeconds - incomingActivity.departureSimSeconds

    if (secondsSinceDeparture >= travelDuration) {
      const arrivalSimSeconds = incomingActivity.departureSimSeconds + travelDuration
      return {
        activity: {
          mode: 'investigatingFire',
          assignedFireId: incomingActivity.assignedFireId,
          investigationStartedAtSimSeconds: arrivalSimSeconds,
          missionKind: incomingActivity.missionKind,
          orbitRadiusMeters: incomingActivity.orbitRadiusMeters,
        },
        entry: {
          simSeconds: arrivalSimSeconds,
          kind: 'droneBeganFireOrbit',
          severity: 'info',
          ...droneEntryFields(droneId, patrol),
          fireId: incomingActivity.assignedFireId,
          position: assignedFire.position,
        },
      }
    }

    return { activity: incomingActivity }
  }

  if (incomingActivity.mode === 'returningToBase') {
    const returnDistance = distanceMetersBetween(incomingActivity.departurePosition, patrol.patrolCenter)

    if (returnDistance <= 0 || patrol.cruiseSpeedMetersPerSecond <= 0) {
      return {
        activity: { mode: 'patrolling' },
        entry: {
          simSeconds: incomingActivity.returnStartedAtSimSeconds,
          kind: 'droneResumedPatrol',
          severity: 'info',
          ...droneEntryFields(droneId, patrol),
          position: patrol.patrolCenter,
        },
      }
    }

    const returnDuration = returnDistance / patrol.cruiseSpeedMetersPerSecond
    const secondsSinceReturn = elapsedSimSeconds - incomingActivity.returnStartedAtSimSeconds

    if (secondsSinceReturn >= returnDuration) {
      return {
        activity: { mode: 'patrolling' },
        entry: {
          simSeconds: incomingActivity.returnStartedAtSimSeconds + returnDuration,
          kind: 'droneResumedPatrol',
          severity: 'info',
          ...droneEntryFields(droneId, patrol),
          position: patrol.patrolCenter,
        },
      }
    }

    return { activity: incomingActivity }
  }

  if (incomingActivity.mode === 'investigatingFire') {
    if (incomingActivity.missionKind === 'oneWay') {
      const activity = droneActivityAfterLostCheck(incomingActivity, elapsedSimSeconds, patrol, incomingFires)
      if (activity.mode === 'lost') {
        return {
          activity,
          entry: {
            simSeconds: activity.lostAtSimSeconds,
            kind: 'droneLost',
            severity: 'warning',
            ...droneEntryFields(droneId, patrol),
            fireId: incomingActivity.assignedFireId,
            position: activity.position,
          },
        }
      }
      return { activity }
    }

    const secondsSinceOrbitStarted = elapsedSimSeconds - incomingActivity.investigationStartedAtSimSeconds
    const lapDurationSimSeconds = orbitLapDurationSimSeconds(
      incomingActivity.orbitRadiusMeters,
      patrolLinearSpeedMetersPerSecond(patrol),
    )
    if (secondsSinceOrbitStarted >= lapDurationSimSeconds) {
      const orbitExitPosition = orbitPositionFor(
        incomingFires[incomingActivity.assignedFireId]?.position ?? patrol.patrolCenter,
        incomingActivity.orbitRadiusMeters,
        patrolLinearSpeedMetersPerSecond(patrol),
        lapDurationSimSeconds,
      )
      // Use the exact lap-completion instant so that the chained-transition
      // loop in `activityAfterInvestigationExpiry` can correctly measure
      // how far into the return trip we are on the same tick.
      const returnStartedAtSimSeconds =
        incomingActivity.investigationStartedAtSimSeconds + lapDurationSimSeconds
      return {
        activity: {
          mode: 'returningToBase',
          departurePosition: orbitExitPosition,
          returnStartedAtSimSeconds,
        },
        entry: {
          simSeconds: returnStartedAtSimSeconds,
          kind: 'droneReturningAfterOrbit',
          severity: 'info',
          ...droneEntryFields(droneId, patrol),
          fireId: incomingActivity.assignedFireId,
          position: orbitExitPosition,
        },
      }
    }

    return { activity: incomingActivity }
  }

  const secondsSinceInvestigationStarted = elapsedSimSeconds - incomingActivity.investigationStartedAtSimSeconds
  if (secondsSinceInvestigationStarted >= INVESTIGATION_DURATION_SIM_SECONDS) {
    return {
      activity: { mode: 'patrolling' },
      entry: {
        simSeconds: incomingActivity.investigationStartedAtSimSeconds + INVESTIGATION_DURATION_SIM_SECONDS,
        kind: 'droneResumedPatrol',
        severity: 'info',
        ...droneEntryFields(droneId, patrol),
        position: patrol.patrolCenter,
      },
    }
  }

  return { activity: incomingActivity }
}

/**
 * A `'oneWay'` `'investigatingFire'` Drone's activity after checking
 * whether its live endurance has run out by `elapsedSimSeconds` — issue W,
 * ADR-0006's "the only place endurance is allowed to gate/end a Drone's
 * behavior". While `remainingEnduranceSimSecondsAt(elapsedSimSeconds,
 * patrol.maxEnduranceSimSeconds)` is still positive, `activity` is carried
 * forward unchanged (same sticky treatment as a still-orbiting
 * `'roundTrip'` mission). The instant it reaches zero, transitions to
 * `'lost'`, frozen at exactly where the orbit put this Drone at
 * `lostAtSimSeconds = patrol.maxEnduranceSimSeconds` — deliberately that
 * exact absolute instant, not whatever (possibly later/overshot)
 * `elapsedSimSeconds` this call happens to be for, mirroring how
 * `orbitRadiusMeters` is itself a fixed dispatch-time snapshot rather than
 * a live recompute: "wherever it was on its orbit at the moment it ran
 * out" (issue W) means evaluating the same closed-form orbit position
 * function at that precise moment, not at the tick that happened to
 * *detect* it. Falls back to this Drone's last-known `patrol.position` if
 * the assigned Fire is somehow missing from `incomingFires` (shouldn't
 * happen — a Fire's own id never disappears once spawned — but keeps this
 * total rather than throwing, same defensive spirit as
 * `positionForActivity`'s own fallback).
 */
function droneActivityAfterLostCheck(
  activity: Extract<DroneActivityState, { mode: 'investigatingFire' }>,
  elapsedSimSeconds: number,
  patrol: DronePatrolState,
  incomingFires: Record<string, FireRuntimeState>,
): DroneActivityState {
  const remainingEnduranceSimSeconds = remainingEnduranceSimSecondsAt(elapsedSimSeconds, patrol.maxEnduranceSimSeconds)
  if (remainingEnduranceSimSeconds > 0) {
    return activity
  }

  const lostAtSimSeconds = patrol.maxEnduranceSimSeconds
  const assignedFire = incomingFires[activity.assignedFireId]
  const position = assignedFire
    ? orbitPositionFor(
        assignedFire.position,
        activity.orbitRadiusMeters,
        patrolLinearSpeedMetersPerSecond(patrol),
        lostAtSimSeconds - activity.investigationStartedAtSimSeconds,
      )
    : patrol.position

  return { mode: 'lost', position, lostAtSimSeconds }
}

/**
 * A manually-recalled (`'returningToStation'`) Drone's activity after
 * advancing to `elapsedSimSeconds` — the return-to-base sibling of
 * {@link droneActivityAfterLostCheck}, resolving the three outcomes of a
 * recall flight toward `activity.targetPosition` (its nearest Base Station):
 *
 * - **Grounded on arrival**: once the elapsed return time meets or exceeds
 *   the straight-line distance ÷ `cruiseSpeedMetersPerSecond` duration (or
 *   immediately, for the degenerate already-at-base / zero-speed case), the
 *   Drone parks at `targetPosition` and enters the terminal `'grounded'`
 *   state — ADR-0007's "flies to that nearest Base Station, and enters a new
 *   terminal Grounded state".
 * - **Lost en route**: if the flight would finish after this Drone's
 *   `maxEnduranceSimSeconds` (it cannot actually make it home) and its live
 *   `remainingEnduranceSimSeconds` has already hit zero, it becomes `'lost'`
 *   frozen exactly where it ran out — same closed-form
 *   `lostAtSimSeconds = maxEnduranceSimSeconds` snapshot as
 *   {@link droneActivityAfterLostCheck}.
 * - **Still en route**: otherwise carried forward unchanged (sticky), same
 *   treatment as a still-in-transit `'travelingToFire'`.
 */
function activityAfterManualReturnTransition(
  activity: Extract<DroneActivityState, { mode: 'returningToStation' }>,
  elapsedSimSeconds: number,
  patrol: DronePatrolState,
): DroneActivityState {
  const { departurePosition, targetPosition, returnStartedAtSimSeconds } = activity
  const returnDistance = distanceMetersBetween(departurePosition, targetPosition)

  if (returnDistance <= 0 || patrol.cruiseSpeedMetersPerSecond <= 0) {
    return { mode: 'grounded', position: targetPosition, groundedAtSimSeconds: returnStartedAtSimSeconds }
  }

  const returnDuration = returnDistance / patrol.cruiseSpeedMetersPerSecond
  const arrivalSimSeconds = returnStartedAtSimSeconds + returnDuration

  // Endurance gate (ADR-0007 / issue W spirit): if this Drone cannot reach
  // its nearest Base Station before its endurance runs out, it becomes Lost
  // exactly where and when it ran out — never Grounded.
  if (arrivalSimSeconds > patrol.maxEnduranceSimSeconds) {
    if (remainingEnduranceSimSecondsAt(elapsedSimSeconds, patrol.maxEnduranceSimSeconds) > 0) {
      return activity
    }
    const lostAtSimSeconds = patrol.maxEnduranceSimSeconds
    const progress = (lostAtSimSeconds - returnStartedAtSimSeconds) / returnDuration
    const position = interpolateLatLng(departurePosition, targetPosition, Math.min(1, Math.max(0, progress)))
    return { mode: 'lost', position, lostAtSimSeconds }
  }

  if (elapsedSimSeconds - returnStartedAtSimSeconds >= returnDuration) {
    return { mode: 'grounded', position: targetPosition, groundedAtSimSeconds: arrivalSimSeconds }
  }

  return activity
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
 * C, unchanged); a hover/circle position around the assigned Event while
 * `'investigating'` (issue F, unchanged — Person Sighting/Fallen Tree
 * investigation behavior is untouched by issue V); or, while
 * `'investigatingFire'` (issue V), a position on the orbit circle around
 * the assigned Fire's (fixed, never-moving) ignition point — *both* Drone
 * types orbit a Fire, neither hovers nor uses the old fixed-150m circle
 * (`orbitPositionFor`, `activity.orbitRadiusMeters`'s dispatch-time
 * snapshot, and this Drone's own `patrolLinearSpeedMetersPerSecond`).
 * `incomingFires`/`incomingEvents` are looked up from the previous tick's
 * state (an Event's position never changes once spawned; a Fire's position
 * is likewise fixed at its ignition point, only its Footprint grows around
 * it — see `FireRuntimeState`/`growthEllipse.ts` — so the previous tick's
 * copy is a safe, stable source either way). Falls back to the patrol
 * position if the assigned Event/Fire is somehow missing from
 * `incomingEvents`/`incomingFires`, which should not happen in practice
 * (dispatch only ever assigns an id already present in that tick's
 * `events`/`fires`) but keeps this function total rather than throwing.
 * `'lost'` (issue W) is a frozen snapshot, not a closed-form function of
 * `elapsedSimSeconds` at all — its `activity.position` was already
 * computed once, the tick it transitioned into `'lost'` (see
 * `droneActivityAfterLostCheck`), and is simply read back verbatim on
 * every subsequent tick, never recomputed — this is what "stops moving,
 * wherever it currently is" actually means at this engine seam.
 */
function positionForActivity(
  patrol: DronePatrolState,
  activity: DroneActivityState,
  elapsedSimSeconds: number,
  incomingEvents: Record<string, EventRuntimeState>,
  incomingFires: Record<string, FireRuntimeState>,
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

  if (activity.mode === 'travelingToFire') {
    const assignedFire = incomingFires[activity.assignedFireId]
    const orbitEntryPosition = assignedFire
      ? orbitPositionFor(assignedFire.position, activity.orbitRadiusMeters, patrolLinearSpeedMetersPerSecond(patrol), 0)
      : activity.departurePosition
    const travelDistance = distanceMetersBetween(activity.departurePosition, orbitEntryPosition)
    if (travelDistance <= 0 || patrol.cruiseSpeedMetersPerSecond <= 0) return orbitEntryPosition
    const travelDuration = travelDistance / patrol.cruiseSpeedMetersPerSecond
    const secondsSinceDeparture = elapsedSimSeconds - activity.departureSimSeconds
    const progress = Math.min(1, secondsSinceDeparture / travelDuration)
    return interpolateLatLng(activity.departurePosition, orbitEntryPosition, progress)
  }

  if (activity.mode === 'investigatingFire') {
    const assignedFire = incomingFires[activity.assignedFireId]
    if (assignedFire) {
      return orbitPositionFor(
        assignedFire.position,
        activity.orbitRadiusMeters,
        patrolLinearSpeedMetersPerSecond(patrol),
        elapsedSimSeconds - activity.investigationStartedAtSimSeconds,
      )
    }
  }

  if (activity.mode === 'returningToBase') {
    const returnDistance = distanceMetersBetween(activity.departurePosition, patrol.patrolCenter)
    if (returnDistance <= 0 || patrol.cruiseSpeedMetersPerSecond <= 0) return patrol.patrolCenter
    const returnDuration = returnDistance / patrol.cruiseSpeedMetersPerSecond
    const secondsSinceReturn = elapsedSimSeconds - activity.returnStartedAtSimSeconds
    const progress = Math.min(1, secondsSinceReturn / returnDuration)
    return interpolateLatLng(activity.departurePosition, patrol.patrolCenter, progress)
  }

  if (activity.mode === 'returningToStation') {
    const returnDistance = distanceMetersBetween(activity.departurePosition, activity.targetPosition)
    if (returnDistance <= 0 || patrol.cruiseSpeedMetersPerSecond <= 0) return activity.targetPosition
    const returnDuration = returnDistance / patrol.cruiseSpeedMetersPerSecond
    const secondsSinceReturn = elapsedSimSeconds - activity.returnStartedAtSimSeconds
    const progress = Math.min(1, secondsSinceReturn / returnDuration)
    return interpolateLatLng(activity.departurePosition, activity.targetPosition, progress)
  }

  if (activity.mode === 'grounded') {
    return activity.position
  }

  if (activity.mode === 'lost') {
    return activity.position
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
 * O/Q): a newly-Detected Fire never auto-dispatches a Drone at all in this
 * slice — dispatching a Drone to an Event or a Fire is exclusively a
 * user-driven action via `withManualDispatch`/`withManualFireDispatch` (see
 * `EventPanel`/`FirePanel`'s "Send" buttons), applied on top of whatever
 * this function returns, not from within it.
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
  wind: Wind,
): {
  dronePatrol: Record<string, DronePatrolState>
  droneActivity: Record<string, DroneActivityState>
  events: Record<string, EventRuntimeState>
  fires: Record<string, FireRuntimeState>
  logDrafts: LogEntryDraft[]
} {
  const logDrafts: LogEntryDraft[] = []

  const droneActivity: Record<string, DroneActivityState> = {}
  for (const [droneId, patrol] of Object.entries(dronePatrolParams)) {
    const { activity, entries } = activityAfterInvestigationExpiry(
      droneId,
      incomingDroneActivity[droneId],
      elapsedSimSeconds,
      patrol,
      incomingFires,
    )
    droneActivity[droneId] = activity
    for (const entry of entries) logDrafts.push(entry)
  }

  const dronePatrol: Record<string, DronePatrolState> = {}
  for (const [droneId, patrol] of Object.entries(dronePatrolParams)) {
    dronePatrol[droneId] = {
      ...patrol,
      position: positionForActivity(patrol, droneActivity[droneId], elapsedSimSeconds, incomingEvents, incomingFires),
    }
  }

  const events = eventsAt(scenarioEvents, elapsedSimSeconds, incomingEvents, dronePatrol)
  const fires = firesAt(scenarioFireIgnitions, elapsedSimSeconds, incomingFires, dronePatrol, towerDetection, droneActivity, wind)

  // Detection Log Entries (fog-of-war, ADR-0008): an Event/Fire that has just
  // left `'undetected'` this call — i.e. it now carries a
  // `detectedAtSimSeconds` its incoming copy had no record of — is logged
  // exactly once, stamped with that embedded Detection instant (not this
  // call's `elapsedSimSeconds`). Sticky thereafter: an already-Detected
  // Event/Fire carried forward has an incoming copy already out of
  // `'undetected'`, so it never re-emits.
  for (const [id, event] of Object.entries(events)) {
    const previous = incomingEvents[id]
    if (event.detectedAtSimSeconds !== undefined && (previous === undefined || previous.status === 'undetected')) {
      const detectingDrone = event.detectedByAssetId !== undefined ? dronePatrol[event.detectedByAssetId] : undefined
      logDrafts.push({
        simSeconds: event.detectedAtSimSeconds,
        kind: 'eventDetected',
        severity: 'info',
        // Events are only ever Detected by a Drone (never a Tower — see
        // `detectingAssetIdFor`), so `detectedByAssetId` is a Drone id.
        ...(event.detectedByAssetId !== undefined ? { droneId: event.detectedByAssetId } : {}),
        ...(detectingDrone ? { droneType: detectingDrone.droneType } : {}),
        eventId: event.id,
        eventType: event.type,
        position: event.position,
      })
    }
  }
  for (const [id, fire] of Object.entries(fires)) {
    const previous = incomingFires[id]
    if (fire.detectedAtSimSeconds !== undefined && (previous === undefined || previous.tier === 'undetected')) {
      // A Fire discovery is a non-nominal (WARNING) line per CONTEXT.md's
      // Event Log entry. It can be first Detected by either a Tower or a
      // Drone, so no Drone id is attributed here — the UI derives the label
      // from the Fire itself.
      logDrafts.push({
        simSeconds: fire.detectedAtSimSeconds,
        kind: 'fireDetected',
        severity: 'warning',
        fireId: fire.id,
        position: fire.position,
      })
    }
  }

  return { dronePatrol, droneActivity, events, fires, logDrafts }
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
      maxEnduranceSimSeconds: drone.maxEnduranceSimSeconds,
      cruiseSpeedMetersPerSecond: drone.cruiseSpeedMetersPerSecond,
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
    scenario.wind,
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
    wind: scenario.wind,
    // The Event Log starts empty (ADR-0008): it accumulates only as
    // transitions occur during subsequent `advanceSimulation`/`withManual*`
    // calls, so any Detection resolved at `elapsedSimSeconds = 0` here is part
    // of the initial picture, not a logged transition. `derived.logDrafts` is
    // deliberately discarded for this reason.
    log: [],
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
    state.wind,
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
    wind: state.wind,
    // Carry the incoming log forward and append every transition/Detection
    // Log Entry emitted this tick, capped oldest-first (ADR-0008). Each
    // draft's deterministic id embeds its index among this call's drafts, so
    // replaying the same state along the same time points yields an identical
    // log.
    log: logWithDraftsAppended(state.log, derived.logDrafts),
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

  const entry: LogEntryDraft = {
    simSeconds: state.elapsedSimSeconds,
    kind: 'droneDispatchedToEvent',
    severity: 'info',
    droneId,
    droneType: patrol.droneType,
    eventId,
    eventType: event.type,
    position: event.position,
  }

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
    log: logWithDraftsAppended(state.log, [entry]),
  }
}

/**
 * The Fire-dispatch sibling of {@link withManualDispatch} (issue U,
 * ADR-0006): applies an explicit user "send this Drone to this Fire"
 * action, immediately, the same way `withManualDispatch` does for an
 * Event — `useSimulationClock`'s `sendDroneToFire` calls this directly
 * rather than queueing it for the next tick, for the same "a Send click
 * takes effect right away, whatever the Simulation Clock's play/pause/step
 * state" reason. `droneId` switches to `'investigatingFire'` `fireId`
 * starting now, carrying the given `missionKind` (which of `FirePanel`'s
 * two lists — Bingo Range or One-Way Mission — the Drone was sent from;
 * `FirePanel` itself decides this via `bingoRange.ts`'s
 * `classifyFireDispatch`, not this function, since classification depends
 * on live telemetry this pure state-transition has no need to recompute).
 *
 * Issue V: dispatch *is* the instant orbiting begins in this engine (no
 * separate travel-time phase — mirrors `withManualDispatch`'s own
 * immediate-hover/circle convention), so this function does the same two
 * things {@link fireWithOrbitStarted}/`positionForActivity` would do on
 * the very next `advanceSimulation` tick, just immediately: (1) snapshots
 * the Fire's real current orbit radius (`growthEllipse.ts`'s
 * `fireOrbitRadiusMetersAt`, using `state.wind`) into the new
 * `'investigatingFire'` activity's `orbitRadiusMeters` — fixed for this
 * whole investigation, per that field's own doc comment — and re-derives
 * the Drone's position onto that orbit circle via `orbitPositionFor`
 * (replacing `withManualDispatch`'s hover/circle-at-the-target math: both
 * Drone types orbit a Fire, neither hovers); (2) ratchets the Fire itself
 * straight to `'investigated'` with its first Confirmed Shape snapshot
 * (`fireWithOrbitStarted`), so the map reflects "this Fire is now being
 * orbited" the instant "Send" is clicked, not one tick later. Unlike
 * `'investigating'`, there is still no fixed-duration expiry to hand off
 * to here — `activityAfterInvestigationExpiry` gives a `'roundTrip'`
 * mission a one-orbit-lap ending and deliberately leaves `'oneWay'` sticky
 * until issue W's endurance-exhaustion ending. A no-op (returns `state`
 * unchanged, same object identity) if `droneId` isn't currently
 * `'patrolling'` or `fireId` isn't a currently-non-`'undetected'` Fire
 * (i.e. at least Tower-Detected, so it has an open, clickable `FirePanel`
 * to send from) — `FirePanel` only ever offers "Send" for an eligible
 * combination, but this stays defensive/total rather than throwing on a
 * stale click.
 */
export function withManualFireDispatch(
  state: SimulationState,
  droneId: string,
  fireId: string,
  missionKind: FireMissionKind,
): SimulationState {
  const patrol = state.dronePatrol[droneId]
  const activity = state.droneActivity[droneId]
  const fire = state.fires[fireId]

  if (!patrol || activity?.mode !== 'patrolling' || !fire || fire.tier === 'undetected') {
    return state
  }

  const departureSimSeconds = state.elapsedSimSeconds
  const orbitRadiusMeters = fireOrbitRadiusMetersAt(departureSimSeconds - fire.spawnAtSimSeconds, state.wind)

  // A One-Way Mission is a non-nominal (WARNING) dispatch (CONTEXT.md's Event
  // Log entry); a round-trip Bingo-Range send is an ordinary info line.
  const entry: LogEntryDraft = {
    simSeconds: state.elapsedSimSeconds,
    kind: missionKind === 'roundTrip' ? 'droneDispatchedToFire' : 'droneDispatchedOneWay',
    severity: missionKind === 'roundTrip' ? 'info' : 'warning',
    droneId,
    droneType: patrol.droneType,
    fireId,
    missionKind,
    position: fire.position,
  }

  // The Drone begins flying toward the Fire at cruise speed; its position is
  // unchanged on this tick. The fire tier and Confirmed Shape are updated on
  // the first tick the Drone transitions into 'investigatingFire' (via
  // fireWithConfirmedShapeApplied / isAnyDroneOrbitingFire).
  return {
    ...state,
    droneActivity: {
      ...state.droneActivity,
      [droneId]: {
        mode: 'travelingToFire',
        assignedFireId: fireId,
        departurePosition: patrol.position,
        departureSimSeconds,
        missionKind,
        orbitRadiusMeters,
      },
    },
    log: logWithDraftsAppended(state.log, [entry]),
  }
}

/**
 * Whether a Drone in `activity` is eligible for a manual "Return to Nearest
 * Base" recall (ADR-0007): any *active* Drone — `'patrolling'`,
 * `'investigating'` an Event, or on a *round-trip* Fire mission
 * (`'travelingToFire'`/`'investigatingFire'` with `missionKind ===
 * 'roundTrip'`) — may be recalled, abandoning whatever it was doing. A
 * `'oneWay'` Fire mission is deliberately excluded (it is intentionally
 * sacrificial — see `FireMissionKind`), as are Drones already heading home
 * (`'returningToBase'`/`'returningToStation'`) or in a terminal state
 * (`'grounded'`/`'lost'`). A missing entry defaults to eligible, mirroring
 * the engine's "missing means patrolling" fallback elsewhere. Exported so
 * both the engine guard in {@link withManualReturnToBase} and the status
 * panel's button visibility read the exact same rule.
 */
export function canReturnDroneToBase(activity: DroneActivityState | undefined): boolean {
  if (!activity || activity.mode === 'patrolling' || activity.mode === 'investigating') {
    return true
  }
  if (activity.mode === 'travelingToFire' || activity.mode === 'investigatingFire') {
    return activity.missionKind === 'roundTrip'
  }
  return false
}

/**
 * Applies an explicit user "Return to Nearest Base" recall (ADR-0007,
 * `CONTEXT.md`'s **Grounded** entry) on top of `state`, as of its own
 * `elapsedSimSeconds` — the recall counterpart to
 * {@link withManualDispatch}/{@link withManualFireDispatch}, applied
 * immediately (rather than queued for the next tick) for the same "a button
 * click takes effect right away, whatever the Simulation Clock's
 * play/pause/step state" reason. `droneId` abandons whatever it was doing
 * and switches to `'returningToStation'` starting now, flying from its
 * current live position toward `targetPosition` (its nearest Base Station,
 * chosen by the caller — `useSimulationClock.returnDroneToNearestBase` — from
 * the live `World.baseStations`, kept there rather than here so this pure
 * transition needs no `World`). From there `advanceSimulation`'s
 * `activityAfterInvestigationExpiry` flies it home and Grounds it on arrival,
 * or marks it Lost if its endurance runs out en route (see
 * {@link activityAfterManualReturnTransition}). A no-op (returns `state`
 * unchanged, same object identity) if `droneId` has no patrol state or isn't
 * currently eligible per {@link canReturnDroneToBase} — the panel only offers
 * the button for an eligible Drone, but this stays defensive/total rather
 * than throwing on a stale click. The Drone's position is unchanged on this
 * tick (it departs from exactly where it is).
 */
export function withManualReturnToBase(state: SimulationState, droneId: string, targetPosition: LatLng): SimulationState {
  const patrol = state.dronePatrol[droneId]
  const activity = state.droneActivity[droneId]

  if (!patrol || !canReturnDroneToBase(activity)) {
    return state
  }

  // The recall order itself is an ordinary (info) operator action; the
  // eventual Grounded/Lost outcome is logged later, from the tick the return
  // flight actually completes. `baseStationId` is left undefined — this pure
  // transition is given only `targetPosition`, and the UI derives the base
  // label from it.
  const entry: LogEntryDraft = {
    simSeconds: state.elapsedSimSeconds,
    kind: 'droneRecalledToBase',
    severity: 'info',
    droneId,
    droneType: patrol.droneType,
    position: targetPosition,
  }

  return {
    ...state,
    droneActivity: {
      ...state.droneActivity,
      [droneId]: {
        mode: 'returningToStation',
        targetPosition,
        departurePosition: patrol.position,
        returnStartedAtSimSeconds: state.elapsedSimSeconds,
      },
    },
    log: logWithDraftsAppended(state.log, [entry]),
  }
}
