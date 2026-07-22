import type { World } from '../world/types'
import type { SimulationState } from './types'

/**
 * Returns a new `World` with every Drone's `position` replaced by its
 * current simulated position from `state`, leaving Towers and Base Stations
 * (static in this slice) untouched. This is the seam that lets the map
 * rendering built in slice B (`AssetMarkers`) stay unaware of the
 * simulation engine — it just renders whatever `World` it's given.
 */
export function withDronePositions(world: World, state: SimulationState): World {
  return {
    ...world,
    drones: world.drones.map((drone) => ({
      ...drone,
      position: state.dronePatrol[drone.id]?.position ?? drone.position,
    })),
  }
}
