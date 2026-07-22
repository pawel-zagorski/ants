import { tangentialHeadingDegrees, tangentialSpeedMetersPerSecond } from '../map/geo'
import type { LatLng } from '../map/geo'
import { patrolAngleRadiansAt } from './advanceSimulation'
import { investigateMotionFor } from './dispatch'
import type { DroneActivityState, DronePatrolState } from './types'
import type { Drone } from '../world/types'

/**
 * A Drone's fixed "battery capacity" for the cosmetic endurance model below
 * (issue G design guidance): 7200 simulated seconds = 2 simulated hours.
 * There is no real energy-consumption simulation anywhere in this engine,
 * and issue F deliberately kept dispatch eligibility free of battery
 * gating ("available" = "not investigating", full stop) — this constant
 * and {@link remainingEnduranceSimSecondsAt}/{@link batteryPercentAt} exist
 * *only* to give the Drone status panel something plausible to display.
 * They are a closed-form function of `elapsedSimSeconds` alone (every
 * Drone "starts full" at `elapsedSimSeconds = 0` and drains at the same
 * fixed rate, regardless of patrol/investigate activity) and must never be
 * read by `advanceSimulation.ts`/`dispatch.ts` — doing so would silently
 * reintroduce battery-gated behavior that issue F explicitly deferred.
 */
export const DRONE_MAX_ENDURANCE_SIM_SECONDS = 7200

/** See {@link DRONE_MAX_ENDURANCE_SIM_SECONDS} — display-only, not behavior-gating. */
export function remainingEnduranceSimSecondsAt(elapsedSimSeconds: number): number {
  return Math.max(0, DRONE_MAX_ENDURANCE_SIM_SECONDS - elapsedSimSeconds)
}

/** See {@link DRONE_MAX_ENDURANCE_SIM_SECONDS} — display-only, not behavior-gating. */
export function batteryPercentAt(elapsedSimSeconds: number): number {
  return (remainingEnduranceSimSecondsAt(elapsedSimSeconds) / DRONE_MAX_ENDURANCE_SIM_SECONDS) * 100
}

/**
 * The PRD's Drone `state` telemetry field ("Asset status panels"
 * Implementation Decision) names six possible values, but this engine has
 * never modeled idle/returning/charging/fault — no other issue introduces
 * battery-gated or return-to-base behavior. Kept as a 6-value union for
 * forward-compatibility (the same "type supports more than the engine
 * currently produces" pattern `EventStatus` already used ahead of issue
 * G's `'resolved'`), but {@link droneTelemetryFor} only ever actually
 * produces `'patrolling'`/`'investigating'`, mapped 1:1 from
 * `DroneActivityState.mode`.
 */
export type DroneTelemetryState = 'idle' | 'patrolling' | 'investigating' | 'returning' | 'charging' | 'fault'

/**
 * Full status-panel telemetry for a single Drone (issue G): everything the
 * PRD's "Asset status panels" Implementation Decision lists for a Drone.
 * `headingDegrees` is omitted while hovering (an investigating
 * Quadrocopter) — a stationary craft has no heading.
 */
export interface DroneTelemetry {
  state: DroneTelemetryState
  position: LatLng
  batteryPercent: number
  remainingEnduranceSimSeconds: number
  speedMetersPerSecond: number
  headingDegrees?: number
  assignedEventId?: string
}

/**
 * Derives a Drone's full status-panel telemetry from its `DronePatrolState`
 * and `DroneActivityState` at `elapsedSimSeconds` alone — no new engine
 * state needed (issue G design guidance: speed/heading are closed-form
 * functions of existing patrol/investigate motion; battery/endurance are
 * closed-form functions of `elapsedSimSeconds` alone). While
 * `'investigating'`, speed/heading/position come from
 * {@link investigateMotionFor} and `patrol.position` (already the
 * investigate hover/circle position — see `advanceSimulation.ts`'s
 * `positionForActivity`); while `'patrolling'`, they come from the patrol
 * loop's tangential motion at the current angle ({@link patrolAngleRadiansAt}).
 */
export function droneTelemetryFor(
  patrol: DronePatrolState,
  activity: DroneActivityState,
  elapsedSimSeconds: number,
): DroneTelemetry {
  const batteryPercent = batteryPercentAt(elapsedSimSeconds)
  const remainingEnduranceSimSeconds = remainingEnduranceSimSecondsAt(elapsedSimSeconds)

  if (activity.mode === 'investigating') {
    const secondsSinceInvestigationStarted = elapsedSimSeconds - activity.investigationStartedAtSimSeconds
    const motion = investigateMotionFor(patrol.droneType, secondsSinceInvestigationStarted)

    return {
      state: 'investigating',
      position: patrol.position,
      batteryPercent,
      remainingEnduranceSimSeconds,
      speedMetersPerSecond: motion.speedMetersPerSecond,
      ...(motion.headingDegrees !== undefined ? { headingDegrees: motion.headingDegrees } : {}),
      assignedEventId: activity.assignedEventId,
    }
  }

  const angleRadians = patrolAngleRadiansAt(patrol, elapsedSimSeconds)

  return {
    state: 'patrolling',
    position: patrol.position,
    batteryPercent,
    remainingEnduranceSimSeconds,
    speedMetersPerSecond: tangentialSpeedMetersPerSecond(patrol.angularSpeedRadiansPerSecond, patrol.patrolRadiusMeters),
    headingDegrees: tangentialHeadingDegrees(angleRadians, patrol.angularSpeedRadiansPerSecond),
  }
}

/** Docked vs. deployed Drone counts for a single Base Station — see {@link baseStationCountsFor}. */
export interface BaseStationDroneCounts {
  docked: number
  deployed: number
}

/**
 * Docked vs. deployed Drone counts for `baseStationId` (issue G design
 * guidance). This prototype's Drones never literally return to sit at
 * their Base Station — they patrol continuously forever (the hybrid
 * patrol/dispatch model) — so "docked" can't mean "physically parked".
 * Defined instead as: **docked** = Drones homed here (`homeBaseStationId
 * === baseStationId`) currently `'patrolling'`; **deployed** = Drones
 * homed here currently `'investigating'`. Every homed Drone lands in
 * exactly one bucket (a missing `droneActivity` entry — which shouldn't
 * happen in practice — defaults to docked, since `'patrolling'` is this
 * engine's default/steady state).
 */
export function baseStationCountsFor(
  baseStationId: string,
  drones: readonly Drone[],
  droneActivity: Record<string, DroneActivityState>,
): BaseStationDroneCounts {
  let docked = 0
  let deployed = 0

  for (const drone of drones) {
    if (drone.homeBaseStationId !== baseStationId) continue

    if (droneActivity[drone.id]?.mode === 'investigating') {
      deployed += 1
    } else {
      docked += 1
    }
  }

  return { docked, deployed }
}
