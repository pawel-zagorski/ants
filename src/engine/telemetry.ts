import { tangentialHeadingDegrees, tangentialSpeedMetersPerSecond } from '../map/geo'
import type { LatLng } from '../map/geo'
import { patrolAngleRadiansAt } from './advanceSimulation'
import { investigateMotionFor } from './dispatch'
import type { DroneActivityState, DronePatrolState, FireMissionKind } from './types'
import type { Drone } from '../world/types'

/**
 * The cosmetic endurance model below (issue G design guidance, updated by
 * issue I to drain at a per-Drone rate instead of one shared constant)
 * takes each Drone's own `maxEnduranceSimSeconds` (from `world.json`, e.g.
 * 7200 simulated seconds = 2 simulated hours) as an explicit parameter.
 * There is no real energy-consumption simulation anywhere in this engine,
 * and issue F deliberately kept dispatch eligibility free of battery
 * gating ("available" = "not investigating", full stop) —
 * {@link remainingEnduranceSimSecondsAt}/{@link batteryPercentAt} exist
 * *only* to give the Drone status panel something plausible to display.
 * They are a closed-form function of `elapsedSimSeconds` and
 * `maxEnduranceSimSeconds` alone (every Drone "starts full" at
 * `elapsedSimSeconds = 0` and drains at its own fixed rate, regardless of
 * patrol/investigate activity) and must never be read by
 * `advanceSimulation.ts`/`dispatch.ts` — doing so would silently
 * reintroduce battery-gated behavior that issue F explicitly deferred.
 */
export function remainingEnduranceSimSecondsAt(elapsedSimSeconds: number, maxEnduranceSimSeconds: number): number {
  return Math.max(0, maxEnduranceSimSeconds - elapsedSimSeconds)
}

/** See {@link remainingEnduranceSimSecondsAt} — display-only, not behavior-gating. */
export function batteryPercentAt(elapsedSimSeconds: number, maxEnduranceSimSeconds: number): number {
  return (remainingEnduranceSimSecondsAt(elapsedSimSeconds, maxEnduranceSimSeconds) / maxEnduranceSimSeconds) * 100
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
 * Quadrocopter) — a stationary craft has no heading. `assignedFireId`/
 * `missionKind` (issue U) are the Fire-dispatch siblings of
 * `assignedEventId`, both only set while `state === 'investigating'` and
 * the underlying `DroneActivityState.mode` is specifically
 * `'investigatingFire'` — a Drone investigating an Event has
 * `assignedEventId` set and `assignedFireId`/`missionKind` both undefined,
 * and vice versa; never both at once, mirroring `FireRuntimeState`/
 * `EventRuntimeState` staying disjoint (ADR-0004).
 */
export interface DroneTelemetry {
  state: DroneTelemetryState
  position: LatLng
  batteryPercent: number
  remainingEnduranceSimSeconds: number
  speedMetersPerSecond: number
  headingDegrees?: number
  assignedEventId?: string
  assignedFireId?: string
  missionKind?: FireMissionKind
}

/**
 * Derives a Drone's full status-panel telemetry from its `DronePatrolState`
 * and `DroneActivityState` at `elapsedSimSeconds` alone — no new engine
 * state needed (issue G design guidance: speed/heading are closed-form
 * functions of existing patrol/investigate motion; battery/endurance are
 * closed-form functions of `elapsedSimSeconds` alone). While
 * `'investigating'`/`'investigatingFire'`, speed/heading/position come from
 * {@link investigateMotionFor} and `patrol.position` (already the
 * investigate hover/circle position — see `advanceSimulation.ts`'s
 * `positionForActivity`); while `'patrolling'`, they come from the patrol
 * loop's tangential motion at the current angle ({@link patrolAngleRadiansAt}).
 * `'investigatingFire'` (issue U) reports the same telemetry `state`
 * (`'investigating'`) as an Event investigation — from a status-panel
 * telemetry point of view a Drone circling/hovering a Fire looks the same
 * as one circling/hovering an Event, and `DroneTelemetryState` already has
 * no separate value for it — but additionally carries `assignedFireId`/
 * `missionKind` instead of `assignedEventId` (see `DroneTelemetry`'s doc
 * comment). `maxEnduranceSimSeconds` is this specific Drone's own value
 * (issue I — `Drone.maxEnduranceSimSeconds`), not a shared constant, so two
 * Drones with different max endurances drain at different rates.
 */
export function droneTelemetryFor(
  patrol: DronePatrolState,
  activity: DroneActivityState,
  elapsedSimSeconds: number,
  maxEnduranceSimSeconds: number,
): DroneTelemetry {
  const batteryPercent = batteryPercentAt(elapsedSimSeconds, maxEnduranceSimSeconds)
  const remainingEnduranceSimSeconds = remainingEnduranceSimSecondsAt(elapsedSimSeconds, maxEnduranceSimSeconds)

  if (activity.mode === 'investigating' || activity.mode === 'investigatingFire') {
    const secondsSinceInvestigationStarted = elapsedSimSeconds - activity.investigationStartedAtSimSeconds
    const motion = investigateMotionFor(patrol.droneType, secondsSinceInvestigationStarted)

    return {
      state: 'investigating',
      position: patrol.position,
      batteryPercent,
      remainingEnduranceSimSeconds,
      speedMetersPerSecond: motion.speedMetersPerSecond,
      ...(motion.headingDegrees !== undefined ? { headingDegrees: motion.headingDegrees } : {}),
      ...(activity.mode === 'investigating'
        ? { assignedEventId: activity.assignedEventId }
        : { assignedFireId: activity.assignedFireId, missionKind: activity.missionKind }),
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
 * homed here currently anything other than `'patrolling'` — `'investigating'`
 * or, since issue U, `'investigatingFire'` alike, and any further
 * dispatch mode a future issue adds. Checking `!== 'patrolling'` rather
 * than enumerating every non-patrolling mode by name keeps this in sync
 * with `DroneActivityState`'s union without needing an edit here every
 * time that union grows (it already needed exactly this update once, for
 * `'investigatingFire'`). Every homed Drone lands in exactly one bucket (a
 * missing `droneActivity` entry — which shouldn't happen in practice —
 * defaults to docked, since `'patrolling'` is this engine's default/steady
 * state).
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

    if ((droneActivity[drone.id]?.mode ?? 'patrolling') !== 'patrolling') {
      deployed += 1
    } else {
      docked += 1
    }
  }

  return { docked, deployed }
}
