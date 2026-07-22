import { distanceMetersBetween, pointOnCircle, tangentialHeadingDegrees, tangentialSpeedMetersPerSecond } from '../map/geo'
import type { LatLng } from '../map/geo'
import type { DroneType } from '../world/types'

/**
 * How long (in simulated seconds) a dispatched Drone spends investigating an
 * Event before resuming its normal patrol loop. The PRD doesn't specify an
 * exact number, so this is a documented, reasonable prototype constant
 * (issue F design guidance suggested "e.g. 30 simulated seconds").
 */
export const INVESTIGATION_DURATION_SIM_SECONDS = 30

/**
 * A Fixed-Wing Drone cannot hover, so while investigating it circles the
 * Event at a small fixed radius/speed instead — constants chosen to be
 * "small" relative to its patrol loop (hundreds, not thousands, of meters)
 * and to keep visibly moving (see `investigatePositionFor`).
 */
const FIXED_WING_CIRCLE_RADIUS_METERS = 150
const FIXED_WING_CIRCLE_ANGULAR_SPEED_RADIANS_PER_SECOND = 0.3

/**
 * A Drone candidate for dispatch selection: just the two facts
 * {@link selectNearestAvailableDrone} needs, decoupled from the full engine
 * `SimulationState` shape so this stays a small, easily-tested pure
 * function (see `.agents/skills/tdd/SKILL.md` seams).
 */
export interface DispatchCandidate {
  id: string
  position: LatLng
}

/**
 * Picks the nearest of `candidates` to `eventPosition`, per issue F's
 * "nearest-available selection must be deterministic" guidance: distance is
 * computed via {@link distanceMetersBetween} from each candidate's given
 * (already-current-tick) `position`, the minimum wins, and exact ties are
 * broken by `id`, lexicographically, so results are reproducible regardless
 * of `candidates`' input order. Callers are responsible for having already
 * filtered `candidates` down to Drones that are actually available (not
 * already investigating another Event) — this function has no opinion on
 * availability. Returns `undefined` when `candidates` is empty (no Drone
 * available to dispatch).
 */
export function selectNearestAvailableDrone(eventPosition: LatLng, candidates: readonly DispatchCandidate[]): string | undefined {
  let best: DispatchCandidate | undefined
  let bestDistanceMeters = Infinity

  for (const candidate of candidates) {
    const distanceMeters = distanceMetersBetween(eventPosition, candidate.position)
    const isCloser = distanceMeters < bestDistanceMeters
    const isExactTieBrokenByLowerId = distanceMeters === bestDistanceMeters && best !== undefined && candidate.id < best.id

    if (isCloser || isExactTieBrokenByLowerId) {
      best = candidate
      bestDistanceMeters = distanceMeters
    }
  }

  return best?.id
}

/**
 * A Drone's position while investigating `eventPosition`, `secondsSinceInvestigationStarted`
 * after dispatch — per CONTEXT.md/PRD: a Quadrocopter can hover, so it
 * holds exactly at `eventPosition`; a Fixed-Wing Drone cannot, so it
 * perpetually circles `eventPosition` at a small fixed radius, its angle a
 * closed-form function of `secondsSinceInvestigationStarted` alone (same
 * style as the patrol loop math it mirrors) — it never stops moving.
 */
export function investigatePositionFor(
  droneType: DroneType,
  eventPosition: LatLng,
  secondsSinceInvestigationStarted: number,
): LatLng {
  if (droneType === 'Quadrocopter') {
    return eventPosition
  }

  const angleRadians = FIXED_WING_CIRCLE_ANGULAR_SPEED_RADIANS_PER_SECOND * secondsSinceInvestigationStarted
  return pointOnCircle(eventPosition, FIXED_WING_CIRCLE_RADIUS_METERS, angleRadians)
}

/**
 * A Drone's speed and heading while investigating (issue G telemetry),
 * mirroring the hover-vs-circle split in {@link investigatePositionFor}: a
 * hovering Quadrocopter has zero speed and no heading (a stationary craft
 * has no direction of travel — `headingDegrees` is simply omitted rather
 * than given an arbitrary value); a circling Fixed-Wing Drone's speed and
 * heading are the same tangent-of-circle math as its investigate position,
 * using this file's fixed circle radius/angular speed constants. Purely
 * derived from `droneType` and `secondsSinceInvestigationStarted` — no new
 * engine state.
 */
export function investigateMotionFor(
  droneType: DroneType,
  secondsSinceInvestigationStarted: number,
): { speedMetersPerSecond: number; headingDegrees?: number } {
  if (droneType === 'Quadrocopter') {
    return { speedMetersPerSecond: 0 }
  }

  const angleRadians = FIXED_WING_CIRCLE_ANGULAR_SPEED_RADIANS_PER_SECOND * secondsSinceInvestigationStarted
  return {
    speedMetersPerSecond: tangentialSpeedMetersPerSecond(
      FIXED_WING_CIRCLE_ANGULAR_SPEED_RADIANS_PER_SECOND,
      FIXED_WING_CIRCLE_RADIUS_METERS,
    ),
    headingDegrees: tangentialHeadingDegrees(angleRadians, FIXED_WING_CIRCLE_ANGULAR_SPEED_RADIANS_PER_SECOND),
  }
}
