import { Circle, Polyline } from 'react-leaflet'
import { droneFlightPathFor } from './droneFlightPath'
import type { SimulationState } from '../engine/types'

export interface DroneFlightPathsProps {
  /**
   * The Simulation Clock's current state — this layer reads each Drone's
   * `droneActivity`/`dronePatrol` entries (plus the `events`/`fires` a mode
   * references) via {@link droneFlightPathFor}, rather than the live
   * `World`, since a flight path needs the Drone's destination/orbit data,
   * not just its rendered marker position.
   */
  simulationState: SimulationState
}

/**
 * Solid black, no fill — a plain "this is where the Drone is headed / the
 * ring it is flying" overlay, deliberately distinct from every colored
 * layer (`DatalinkLine`'s blue, `ReturnEnvelope`'s amber, the Fire layers'
 * reds/violet). `color`/`weight`/`opacity`/`fillOpacity` are passed as
 * direct Leaflet path props (presentation attributes) — see
 * `DatalinkLine.tsx`'s note on why the CSS class alone can't be relied on
 * for stroke styling on this renderer; the class is only a DOM query hook.
 */
const TRAJECTORY_PATH_OPTIONS = { color: '#000000', weight: 2, opacity: 0.85 }
const ORBIT_PATH_OPTIONS = { color: '#000000', weight: 2, opacity: 0.85, fillOpacity: 0.05, fillColor: '#000000' }

/**
 * Always-on map layer (like `DatalinkLines`, unlike the selection-gated
 * `ReturnEnvelope`) drawing every Drone's current flight visualization:
 *
 * - a straight black {@link Polyline} from the Drone to its destination
 *   while it is flying somewhere — `'investigating'` (to its Event),
 *   `'travelingToFire'` (to the fire's orbit-entry point), or
 *   `'returningToBase'` (to its home Base Station); and
 * - a black {@link Circle} tracing the actual orbit (fire center + the
 *   snapshotted orbit radius the engine flies) while `'investigatingFire'`.
 *
 * A `'patrolling'` or `'lost'` Drone (or one whose target Event/Fire has
 * gone missing) draws nothing — see {@link droneFlightPathFor}. Recomputed
 * fresh every render from `simulationState`, so each Drone's line/circle
 * tracks its live position and destination as the Simulation Clock advances.
 */
export function DroneFlightPaths({ simulationState }: DroneFlightPathsProps) {
  return (
    <>
      {Object.keys(simulationState.dronePatrol).flatMap((droneId) => {
        const path = droneFlightPathFor(droneId, simulationState)
        if (!path) return []

        if (path.kind === 'orbit') {
          return [
            <Circle
              key={droneId}
              className={`drone-orbit drone-orbit-${droneId}`}
              center={[path.center.lat, path.center.lng]}
              radius={path.radiusMeters}
              {...ORBIT_PATH_OPTIONS}
            />,
          ]
        }

        return [
          <Polyline
            key={droneId}
            className={`drone-trajectory drone-trajectory-${droneId}`}
            positions={[
              [path.from.lat, path.from.lng],
              [path.to.lat, path.to.lng],
            ]}
            {...TRAJECTORY_PATH_OPTIONS}
          />,
        ]
      })}
    </>
  )
}
