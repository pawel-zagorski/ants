import { pointOnCircle, tangentialHeadingDegrees, tangentialSpeedMetersPerSecond } from '../map/geo'
import type { LatLng } from '../map/geo'

/**
 * A Drone's position while orbiting `center` (a Fire's ignition point —
 * `FireRuntimeState.position`) at `orbitRadiusMeters`,
 * `secondsSinceOrbitStarted` after it began orbiting — the Fire-investigate
 * counterpart of `dispatch.ts`'s `investigatePositionFor`, per issue V/
 * `CONTEXT.md`'s Confirmed Shape entry: "orbit the fire's current extent"
 * replaces the old hover-or-fixed-150m-circle behavior for *both* Drone
 * types (a Fire investigation never hovers, even for a Quadrocopter — see
 * this issue's PRD user story 31). `orbitRadiusMeters` is a fixed snapshot
 * for the whole investigation (taken once, at dispatch time — see
 * `advanceSimulation.ts`'s `withManualFireDispatch`), not recomputed
 * per-tick from the still-growing Fire Footprint, so the angle here stays a
 * simple closed-form function of elapsed time alone, exactly like every
 * other circular motion this engine models (`pointOnCircle`'s existing
 * "absolute angle" convention: 0 = due east of center, increasing
 * counter-clockwise).
 */
export function orbitPositionFor(
  center: LatLng,
  orbitRadiusMeters: number,
  linearSpeedMetersPerSecond: number,
  secondsSinceOrbitStarted: number,
): LatLng {
  const angleRadians = orbitAngleRadiansAt(orbitRadiusMeters, linearSpeedMetersPerSecond, secondsSinceOrbitStarted)
  return pointOnCircle(center, orbitRadiusMeters, angleRadians)
}

/**
 * The orbiting Drone's absolute angle (radians) around the orbit circle,
 * `secondsSinceOrbitStarted` after it began — shared by
 * {@link orbitPositionFor} and {@link orbitMotionFor} so both derive the
 * exact same angle. A degenerate `orbitRadiusMeters <= 0` (a Fire that
 * hasn't grown beyond its ignition point yet) has no well-defined angular
 * speed — treated as `0` (the Drone sits still at the center, same as a
 * hovering Quadrocopter used to for a fixed-point Event) rather than
 * dividing by zero.
 */
function orbitAngleRadiansAt(
  orbitRadiusMeters: number,
  linearSpeedMetersPerSecond: number,
  secondsSinceOrbitStarted: number,
): number {
  if (orbitRadiusMeters <= 0) return 0
  const angularSpeedRadiansPerSecond = linearSpeedMetersPerSecond / orbitRadiusMeters
  return angularSpeedRadiansPerSecond * secondsSinceOrbitStarted
}

/**
 * The orbiting Drone's speed/heading (issue G telemetry, mirroring
 * `dispatch.ts`'s `investigateMotionFor`) at `secondsSinceOrbitStarted` —
 * always moving (never hovering, unlike `investigateMotionFor`'s
 * Quadrocopter case), since both Drone types orbit a Fire. `headingDegrees`
 * is still omitted at a degenerate `orbitRadiusMeters <= 0`, where there's
 * no meaningful direction of travel (the Drone sits still at the center).
 */
export function orbitMotionFor(
  orbitRadiusMeters: number,
  linearSpeedMetersPerSecond: number,
  secondsSinceOrbitStarted: number,
): { speedMetersPerSecond: number; headingDegrees?: number } {
  if (orbitRadiusMeters <= 0) {
    return { speedMetersPerSecond: 0 }
  }

  const angularSpeedRadiansPerSecond = linearSpeedMetersPerSecond / orbitRadiusMeters
  const angleRadians = orbitAngleRadiansAt(orbitRadiusMeters, linearSpeedMetersPerSecond, secondsSinceOrbitStarted)

  return {
    speedMetersPerSecond: tangentialSpeedMetersPerSecond(angularSpeedRadiansPerSecond, orbitRadiusMeters),
    headingDegrees: tangentialHeadingDegrees(angleRadians, angularSpeedRadiansPerSecond),
  }
}

/**
 * How long (simulated seconds) one full orbit lap takes at
 * `orbitRadiusMeters`/`linearSpeedMetersPerSecond` — `CONTEXT.md`'s Bingo
 * Range entry ("complete one orbit lap") and this issue's roundTrip-mission
 * completion condition (`advanceSimulation.ts`'s
 * `activityAfterInvestigationExpiry`): circumference (`2 * PI *
 * orbitRadiusMeters`) divided by linear speed. `linearSpeedMetersPerSecond
 * <= 0` (a stalled/zero-speed Drone, never actually produced by this engine
 * today but kept defensive/total) returns `Infinity` — such a Drone can
 * never complete a lap, rather than this function dividing by zero.
 */
export function orbitLapDurationSimSeconds(orbitRadiusMeters: number, linearSpeedMetersPerSecond: number): number {
  if (linearSpeedMetersPerSecond <= 0) return Infinity
  const circumferenceMeters = 2 * Math.PI * orbitRadiusMeters
  return circumferenceMeters / linearSpeedMetersPerSecond
}
