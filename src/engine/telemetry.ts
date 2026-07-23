import { tangentialHeadingDegrees, tangentialSpeedMetersPerSecond } from '../map/geo'
import type { LatLng } from '../map/geo'
import { patrolAngleRadiansAt } from './advanceSimulation'
import { investigateMotionFor } from './dispatch'
import { orbitMotionFor } from './orbit'
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
 * never modeled idle/charging/fault. Kept as a union for
 * forward-compatibility (the same "type supports more than the engine
 * currently produces" pattern `EventStatus` already used ahead of issue G's
 * `'resolved'`), but {@link droneTelemetryFor} only ever actually produces
 * `'patrolling'`/`'investigating'`/`'returning'`/`'lost'`/`'grounded'`,
 * mapped from `DroneActivityState.mode`. `'lost'` (issue W, `CONTEXT.md`'s
 * **Lost** entry) and `'grounded'` (ADR-0007, `CONTEXT.md`'s **Grounded**
 * entry) are the two telemetry-state values not drawn from the PRD's
 * original six — they name this engine's own terminal states (field
 * endurance-exhaustion, and manual/endurance return-to-base), which the
 * PRD's list predates. `'returning'` is produced by a manual
 * `'returningToStation'` recall (the post-orbit `'returningToBase'`
 * round-trip return still reports `'investigating'`, unchanged).
 */
export type DroneTelemetryState =
  | 'idle'
  | 'patrolling'
  | 'investigating'
  | 'returning'
  | 'charging'
  | 'fault'
  | 'lost'
  | 'grounded'

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
  /** The Clearcut this Drone is traveling to/orbiting (issue Y) — the Clearcut sibling of `assignedFireId`, set only while `state === 'investigating'` and the underlying mode is `'travelingToClearcut'`/`'investigatingClearcut'`. */
  assignedClearcutId?: string
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
 * `'investigatingFire'` (issue U/V) reports the same telemetry `state`
 * (`'investigating'`) as an Event investigation — from a status-panel
 * telemetry point of view a Drone orbiting/circling/hovering something
 * looks the same, and `DroneTelemetryState` already has no separate value
 * for it — but additionally carries `assignedFireId`/`missionKind` instead
 * of `assignedEventId` (see `DroneTelemetry`'s doc comment), and derives
 * speed/heading from {@link orbitMotionFor} (issue V: both Drone types
 * orbit a Fire's current extent, at this Drone's own
 * `patrolLinearSpeedMetersPerSecond` — see `advanceSimulation.ts`'s
 * doc comment for why that speed, not `cruiseSpeedMetersPerSecond`,
 * governs it) rather than `dispatch.ts`'s `investigateMotionFor` (which
 * still governs Event investigation only, unchanged: hover for a
 * Quadrocopter, fixed-150m-circle for a Fixed-Wing Drone). `'lost'` (issue
 * W) reports its own dedicated telemetry `state` (`'lost'`, unlike
 * `'investigatingFire'`'s shared-with-Event-investigation `'investigating'`
 * label — a Lost Drone is not investigating anything anymore) and its
 * frozen `activity.position` verbatim, with zero speed and no heading (a
 * Drone that has run out of endurance and stopped moving has no direction
 * of travel, same "stationary craft has no heading" rationale as a
 * hovering Quadrocopter) — `batteryPercent`/`remainingEnduranceSimSeconds`
 * need no special-casing at all here since a Drone can only ever reach
 * `'lost'` once `elapsedSimSeconds >= maxEnduranceSimSeconds`, at which
 * point the battery/endurance helpers above have already floored both to
 * `0` on their own.
 * `maxEnduranceSimSeconds` is this specific Drone's own value (issue I —
 * `Drone.maxEnduranceSimSeconds`), not a shared constant, so two Drones
 * with different max endurances drain at different rates.
 */
export function droneTelemetryFor(
  patrol: DronePatrolState,
  activity: DroneActivityState,
  elapsedSimSeconds: number,
  maxEnduranceSimSeconds: number,
): DroneTelemetry {
  const batteryPercent = batteryPercentAt(elapsedSimSeconds, maxEnduranceSimSeconds)
  const remainingEnduranceSimSeconds = remainingEnduranceSimSecondsAt(elapsedSimSeconds, maxEnduranceSimSeconds)

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

  if (activity.mode === 'travelingToFire') {
    return {
      state: 'investigating',
      position: patrol.position,
      batteryPercent,
      remainingEnduranceSimSeconds,
      speedMetersPerSecond: patrol.cruiseSpeedMetersPerSecond,
      assignedFireId: activity.assignedFireId,
      missionKind: activity.missionKind,
    }
  }

  if (activity.mode === 'returningToBase') {
    // A returning Drone is no longer investigating any Fire, so it carries
    // neither `assignedFireId` nor `missionKind` (see the DroneActivity
    // 'returningToBase' variant, which omits both).
    return {
      state: 'investigating',
      position: patrol.position,
      batteryPercent,
      remainingEnduranceSimSeconds,
      speedMetersPerSecond: patrol.cruiseSpeedMetersPerSecond,
    }
  }

  if (activity.mode === 'investigatingFire') {
    const secondsSinceOrbitStarted = elapsedSimSeconds - activity.investigationStartedAtSimSeconds
    const patrolLinearSpeedMetersPerSecond = tangentialSpeedMetersPerSecond(
      patrol.angularSpeedRadiansPerSecond,
      patrol.patrolRadiusMeters,
    )
    const motion = orbitMotionFor(activity.orbitRadiusMeters, patrolLinearSpeedMetersPerSecond, secondsSinceOrbitStarted)

    return {
      state: 'investigating',
      position: patrol.position,
      batteryPercent,
      remainingEnduranceSimSeconds,
      speedMetersPerSecond: motion.speedMetersPerSecond,
      ...(motion.headingDegrees !== undefined ? { headingDegrees: motion.headingDegrees } : {}),
      assignedFireId: activity.assignedFireId,
      missionKind: activity.missionKind,
    }
  }

  if (activity.mode === 'travelingToClearcut') {
    return {
      state: 'investigating',
      position: patrol.position,
      batteryPercent,
      remainingEnduranceSimSeconds,
      speedMetersPerSecond: patrol.cruiseSpeedMetersPerSecond,
      assignedClearcutId: activity.assignedClearcutId,
    }
  }

  if (activity.mode === 'investigatingClearcut') {
    const secondsSinceOrbitStarted = elapsedSimSeconds - activity.investigationStartedAtSimSeconds
    const patrolLinearSpeedMetersPerSecond = tangentialSpeedMetersPerSecond(
      patrol.angularSpeedRadiansPerSecond,
      patrol.patrolRadiusMeters,
    )
    const motion = orbitMotionFor(activity.orbitRadiusMeters, patrolLinearSpeedMetersPerSecond, secondsSinceOrbitStarted)

    return {
      state: 'investigating',
      position: patrol.position,
      batteryPercent,
      remainingEnduranceSimSeconds,
      speedMetersPerSecond: motion.speedMetersPerSecond,
      ...(motion.headingDegrees !== undefined ? { headingDegrees: motion.headingDegrees } : {}),
      assignedClearcutId: activity.assignedClearcutId,
    }
  }

  if (activity.mode === 'returningToStation') {
    // A manually-recalled Drone flying home to Ground (ADR-0007) reports the
    // dedicated `'returning'` telemetry state and its cruise speed — it is no
    // longer investigating anything, so it carries no assigned Event/Fire.
    return {
      state: 'returning',
      position: patrol.position,
      batteryPercent,
      remainingEnduranceSimSeconds,
      speedMetersPerSecond: patrol.cruiseSpeedMetersPerSecond,
    }
  }

  if (activity.mode === 'grounded') {
    // A Grounded Drone (ADR-0007) is parked at its Base Station, terminal and
    // stationary — its own dedicated `'grounded'` telemetry state, its frozen
    // `activity.position`, zero speed and no heading (same "stationary craft
    // has no heading" rationale as a hovering Quadrocopter / a Lost Drone).
    return {
      state: 'grounded',
      position: activity.position,
      batteryPercent,
      remainingEnduranceSimSeconds,
      speedMetersPerSecond: 0,
    }
  }

  if (activity.mode === 'lost') {
    return {
      state: 'lost',
      position: activity.position,
      batteryPercent,
      remainingEnduranceSimSeconds,
      speedMetersPerSecond: 0,
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
