import { distanceMetersBetween, offsetLatLng } from '../map/geo'
import type { LatLng } from '../map/geo'
import type { EventType, Scenario, ScenarioEvent } from '../scenario/types'
import type { BaseStation, DroneType, World } from '../world/types'
import type { DronePatrolState, EventRuntimeState, SimulationState, TowerDetectionState } from './types'

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

/** The point on a circular patrol loop at the given absolute angle. */
function patrolPositionAtAngle(patrolCenter: LatLng, patrolRadiusMeters: number, angleRadians: number): LatLng {
  const dxMeters = patrolRadiusMeters * Math.cos(angleRadians)
  const dyMeters = patrolRadiusMeters * Math.sin(angleRadians)
  return offsetLatLng(patrolCenter, dxMeters, dyMeters)
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
 * The single Tower or Drone id (if any) whose detection radius currently
 * contains `event`'s position, per ADR-0003's Detection rule: a Tower only
 * detects Fire Events; a Drone (either kind) detects any Event type.
 * Towers are checked first, so a Fire Event simultaneously within both a
 * Tower's and a Drone's range is attributed to the Tower — the network's
 * designated fire sensor. Iterates `towerDetection`/`dronePatrol` in their
 * key order (stable, derived from `world.towers`/`world.drones` array
 * order — see `initializeSimulationState`), so which asset "wins" when
 * several are simultaneously in range is deterministic.
 */
function detectingAssetIdFor(
  event: { type: EventType; position: LatLng },
  dronePatrol: Record<string, DronePatrolState>,
  towerDetection: Record<string, TowerDetectionState>,
): string | undefined {
  if (event.type === 'Fire') {
    for (const [towerId, tower] of Object.entries(towerDetection)) {
      if (distanceMetersBetween(event.position, tower.position) <= tower.detectionRadiusMeters) {
        return towerId
      }
    }
  }

  for (const [droneId, drone] of Object.entries(dronePatrol)) {
    if (distanceMetersBetween(event.position, drone.position) <= drone.detectionRadiusMeters) {
      return droneId
    }
  }

  return undefined
}

/**
 * Applies this tick's Detection check to a freshly-derived `event`, using
 * `previousEventState` — this same Event's entry in the *incoming*
 * `SimulationState.events`, if any — as memory. Detection is monotonic
 * (`CONTEXT.md`: Undetected -> Detected -> Resolved, never backward), so
 * once `previousEventState.status` has left `'undetected'` it's carried
 * forward unchanged rather than re-derived from this tick's asset
 * positions — this is what keeps an Event Detected after the Drone that
 * found it flies back out of range. Only an Event that's still
 * `'undetected'` (including newly-spawned ones, which have no
 * `previousEventState` yet) is checked against the current tick's Tower
 * and Drone positions.
 */
function eventWithDetectionApplied(
  event: EventRuntimeState,
  previousEventState: EventRuntimeState | undefined,
  dronePatrol: Record<string, DronePatrolState>,
  towerDetection: Record<string, TowerDetectionState>,
): EventRuntimeState {
  if (previousEventState && previousEventState.status !== 'undetected') {
    return {
      ...event,
      status: previousEventState.status,
      ...(previousEventState.detectedByAssetId !== undefined
        ? { detectedByAssetId: previousEventState.detectedByAssetId }
        : {}),
    }
  }

  const detectingAssetId = detectingAssetIdFor(event, dronePatrol, towerDetection)
  if (detectingAssetId === undefined) {
    return event
  }

  return { ...event, status: 'detected', detectedByAssetId: detectingAssetId }
}

/**
 * Derives every currently-spawned Event's live state for this tick: starts
 * from {@link spawnedEventsAt}'s fresh (always-`'undetected'`) snapshot,
 * then runs each one through {@link eventWithDetectionApplied} against
 * `incomingEvents` (the previous tick's `SimulationState.events`, for
 * sticky status) and the current tick's `dronePatrol`/`towerDetection`
 * positions.
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
  towerDetection: Record<string, TowerDetectionState>,
): Record<string, EventRuntimeState> {
  const events: Record<string, EventRuntimeState> = {}

  for (const [id, event] of Object.entries(spawnedEventsAt(scenarioEvents, elapsedSimSeconds))) {
    events[id] = eventWithDetectionApplied(event, incomingEvents[id], dronePatrol, towerDetection)
  }

  return events
}

/**
 * Builds the initial {@link SimulationState} for `world` and `scenario`:
 * one patrol loop per Drone (centered on its home Base Station, sized/sped/
 * ranged per its `DroneType` — see `PATROL_PARAMS_BY_DRONE_TYPE` and
 * `DETECTION_RADIUS_METERS_BY_DRONE_TYPE`), one detection entry per Tower,
 * plus whichever of the Scenario's Events have already spawned (and been
 * Detection-checked) at `elapsedSimSeconds = 0`. Base Stations are static
 * in this slice and carry no simulation state.
 */
export function initializeSimulationState(world: World, scenario: Scenario): SimulationState {
  const dronePatrol: Record<string, DronePatrolState> = {}

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

    dronePatrol[drone.id] = {
      patrolCenter,
      patrolRadiusMeters: radiusMeters,
      angularSpeedRadiansPerSecond: linearSpeedMetersPerSecond / radiusMeters,
      phaseOffsetRadians,
      detectionRadiusMeters,
      position: patrolPositionAtAngle(patrolCenter, radiusMeters, phaseOffsetRadians),
    }
  }

  const towerDetection: Record<string, TowerDetectionState> = {}
  for (const tower of world.towers) {
    towerDetection[tower.id] = { position: tower.position, detectionRadiusMeters: tower.detectionRadiusMeters }
  }

  return {
    elapsedSimSeconds: 0,
    dronePatrol,
    towerDetection,
    scenarioEvents: scenario.events,
    events: eventsAt(scenario.events, 0, {}, dronePatrol, towerDetection),
  }
}

/**
 * Advances the simulation to the given *absolute* simulated time and
 * returns a new state — it never mutates `state`. Each Drone's position is
 * a closed-form, memoryless function of `elapsedSimSeconds` alone (patrol
 * parameters, unchanging), so calling this with the same `state` and
 * `elapsedSimSeconds` always returns identical Drone positions no matter
 * how many times or in what order it's called (see the determinism tests
 * in `advanceSimulation.test.ts`). Event `status`, however, is genuinely
 * history-dependent — Detection is monotonic (see `eventWithDetectionApplied`)
 * — so this reads `state.events` as its memory of what's already been
 * Detected; the same `state` + `elapsedSimSeconds` pair still always
 * produces the same output (it's a pure function of both), it's just that
 * unlike Drone position, this output legitimately depends on `state`, not
 * on `elapsedSimSeconds` alone. Has no dependency on React, Leaflet, or
 * wall-clock time — see `useSimulationClock` for that layer, which is
 * responsible for actually feeding each tick's result back in as the next
 * tick's `state` so this memory persists.
 */
export function advanceSimulation(state: SimulationState, elapsedSimSeconds: number): SimulationState {
  const dronePatrol: Record<string, DronePatrolState> = {}

  for (const [droneId, patrol] of Object.entries(state.dronePatrol)) {
    const angleRadians = patrol.phaseOffsetRadians + patrol.angularSpeedRadiansPerSecond * elapsedSimSeconds
    dronePatrol[droneId] = {
      ...patrol,
      position: patrolPositionAtAngle(patrol.patrolCenter, patrol.patrolRadiusMeters, angleRadians),
    }
  }

  return {
    elapsedSimSeconds,
    dronePatrol,
    towerDetection: state.towerDetection,
    scenarioEvents: state.scenarioEvents,
    events: eventsAt(state.scenarioEvents, elapsedSimSeconds, state.events, dronePatrol, state.towerDetection),
  }
}
