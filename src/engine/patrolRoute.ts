import { distanceMetersBetween, interpolateLatLng } from '../map/geo'
import type { LatLng } from '../map/geo'

/**
 * The total length (meters) of the *closed* polyline through `waypoints` —
 * every consecutive segment plus the closing leg from the last waypoint back
 * to the first (a Patrol Route is always flown as a loop; see
 * `CONTEXT.md`'s **Patrol Route** entry and `Drone.patrolRoute`). Uses the
 * same flat-earth {@link distanceMetersBetween} approximation as every other
 * position the engine computes. Returns `0` for a degenerate route of fewer
 * than two waypoints (nothing to fly).
 */
export function patrolRoutePerimeterMeters(waypoints: readonly LatLng[]): number {
  if (waypoints.length < 2) return 0

  let total = 0
  for (let i = 0; i < waypoints.length; i += 1) {
    total += distanceMetersBetween(waypoints[i], waypoints[(i + 1) % waypoints.length])
  }
  return total
}

/**
 * The closed-form position of a Drone flying the closed `waypoints` polyline
 * (issue AA, `CONTEXT.md`'s **Patrol Route** entry) at `elapsedSimSeconds`,
 * moving at a constant `speedMetersPerSecond`. Deterministic and memoryless —
 * a pure function of its arguments alone, exactly like the circular patrol
 * loop it replaces (see `engine/advanceSimulation.ts`'s `positionForActivity`)
 * — so the same inputs always yield the same point, preserving slice C's
 * determinism guarantee.
 *
 * The distance travelled is `phaseOffsetMeters + speedMetersPerSecond *
 * elapsedSimSeconds`, taken modulo the loop perimeter so the Drone laps the
 * route forever; `phaseOffsetMeters` (a per-Drone offset is acceptable per
 * the issue) simply shifts where along the loop the Drone sits at
 * `elapsedSimSeconds = 0`. The resulting arc-length is walked segment by
 * segment and linearly interpolated ({@link interpolateLatLng}) within the
 * segment it lands in, so the returned point always lies on the polyline.
 *
 * Total/defensive at the edges: a single-waypoint route returns that
 * waypoint (nothing to fly); a zero-length route (all waypoints coincident)
 * returns the first; an empty route throws, since there is no position to
 * report at all.
 */
export function patrolRoutePositionAt(
  waypoints: readonly LatLng[],
  speedMetersPerSecond: number,
  elapsedSimSeconds: number,
  phaseOffsetMeters = 0,
): LatLng {
  if (waypoints.length === 0) {
    throw new Error('patrolRoutePositionAt requires at least one waypoint')
  }
  if (waypoints.length === 1) return waypoints[0]

  const perimeterMeters = patrolRoutePerimeterMeters(waypoints)
  if (perimeterMeters === 0) return waypoints[0]

  const rawDistanceMeters = phaseOffsetMeters + speedMetersPerSecond * elapsedSimSeconds
  // Normalize into [0, perimeter): JS `%` keeps the sign of the dividend, so
  // add one perimeter and take the modulus again to handle negative offsets.
  let remainingMeters = ((rawDistanceMeters % perimeterMeters) + perimeterMeters) % perimeterMeters

  for (let i = 0; i < waypoints.length; i += 1) {
    const from = waypoints[i]
    const to = waypoints[(i + 1) % waypoints.length]
    const segmentMeters = distanceMetersBetween(from, to)
    if (segmentMeters === 0) continue
    if (remainingMeters <= segmentMeters) {
      return interpolateLatLng(from, to, remainingMeters / segmentMeters)
    }
    remainingMeters -= segmentMeters
  }

  // Floating-point drift can leave a sub-meter remainder after the final
  // segment; the loop is closed, so snap back to the start.
  return waypoints[0]
}
