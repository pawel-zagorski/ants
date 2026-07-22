import { offsetLatLng } from '../map/geo'
import type { LatLng } from '../map/geo'
import type { Scenario, ScenarioEvent } from '../scenario/types'
import type { BaseStation, DroneType, World } from '../world/types'
import type { DronePatrolState, EventRuntimeState, SimulationState } from './types'

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
 * Builds the initial {@link SimulationState} for `world` and `scenario`:
 * one patrol loop per Drone (centered on its home Base Station, sized/sped
 * per its `DroneType` — see `PATROL_PARAMS_BY_DRONE_TYPE`), plus whichever
 * of the Scenario's Events have already spawned at `elapsedSimSeconds = 0`.
 * Towers and Base Stations are static in this slice and carry no
 * simulation state.
 */
export function initializeSimulationState(world: World, scenario: Scenario): SimulationState {
  const dronePatrol: Record<string, DronePatrolState> = {}

  for (const drone of world.drones) {
    const homeBaseStation = findHomeBaseStation(world, drone.homeBaseStationId)
    const typeDefaults = PATROL_PARAMS_BY_DRONE_TYPE[drone.type]
    // A World author can override either patrol parameter per-Drone (the PRD's
    // documented Drone "patrol parameters" field); an omitted field falls back
    // to the DroneType default below.
    const radiusMeters = drone.patrolRadiusMeters ?? typeDefaults.radiusMeters
    const linearSpeedMetersPerSecond = drone.patrolSpeedMetersPerSecond ?? typeDefaults.linearSpeedMetersPerSecond
    const phaseOffsetRadians = phaseOffsetForDroneId(drone.id)
    const patrolCenter = homeBaseStation.position

    dronePatrol[drone.id] = {
      patrolCenter,
      patrolRadiusMeters: radiusMeters,
      angularSpeedRadiansPerSecond: linearSpeedMetersPerSecond / radiusMeters,
      phaseOffsetRadians,
      position: patrolPositionAtAngle(patrolCenter, radiusMeters, phaseOffsetRadians),
    }
  }

  return {
    elapsedSimSeconds: 0,
    dronePatrol,
    scenarioEvents: scenario.events,
    events: spawnedEventsAt(scenario.events, 0),
  }
}

/**
 * Advances the simulation to the given *absolute* simulated time and
 * returns a new state — it never mutates `state`. Pure and side-effect-free:
 * each Drone's position, and the set of spawned Events, is computed
 * directly from unchanging inputs (patrol parameters, `state.scenarioEvents`)
 * and `elapsedSimSeconds`, so calling this with the same `state` and
 * `elapsedSimSeconds` always returns an identical result, no matter how
 * many times or in what order it's called (see the determinism tests in
 * `advanceSimulation.test.ts`). Has no dependency on React, Leaflet, or
 * wall-clock time — see `useSimulationClock` for that layer.
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
    scenarioEvents: state.scenarioEvents,
    events: spawnedEventsAt(state.scenarioEvents, elapsedSimSeconds),
  }
}
