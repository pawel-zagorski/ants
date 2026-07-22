import type { LatLng } from '../map/geo'

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
 * The engine's full serializable state: every Drone's patrol loop and
 * derived position, keyed by Drone id, plus the simulated time it was last
 * computed for. Contains no reference to React/Leaflet/wall-clock time —
 * see `advanceSimulation`.
 */
export interface SimulationState {
  elapsedSimSeconds: number
  dronePatrol: Record<string, DronePatrolState>
}
