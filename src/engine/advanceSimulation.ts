import { offsetLatLng } from '../map/geo'
import type { LatLng } from '../map/geo'
import type { BaseStation, DroneType, World } from '../world/types'
import type { DronePatrolState, SimulationState } from './types'

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
 * Builds the initial {@link SimulationState} for `world`: one patrol loop
 * per Drone, centered on its home Base Station, sized/sped per its
 * `DroneType` (see `PATROL_PARAMS_BY_DRONE_TYPE`). Towers and Base Stations
 * are static in this slice and carry no simulation state.
 */
export function initializeSimulationState(world: World): SimulationState {
  const dronePatrol: Record<string, DronePatrolState> = {}

  for (const drone of world.drones) {
    const homeBaseStation = findHomeBaseStation(world, drone.homeBaseStationId)
    const { radiusMeters, linearSpeedMetersPerSecond } = PATROL_PARAMS_BY_DRONE_TYPE[drone.type]
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

  return { elapsedSimSeconds: 0, dronePatrol }
}

/**
 * Advances the simulation to the given *absolute* simulated time and
 * returns a new state — it never mutates `state`. Pure and side-effect-free:
 * each Drone's position is computed directly from its (unchanging) patrol
 * parameters and `elapsedSimSeconds`, so calling this with the same `state`
 * and `elapsedSimSeconds` always returns identical positions, no matter how
 * many times or in what order it's called (see the determinism test in
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

  return { elapsedSimSeconds, dronePatrol }
}
