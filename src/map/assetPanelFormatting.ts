import type { DroneTelemetryState } from '../engine/telemetry'
import type { ClearcutTier, FireMissionKind, FireTier } from '../engine/types'

/** Renders a battery telemetry value (0-100) as a rounded whole-percent string, e.g. "84%". */
export function formatBatteryPercent(batteryPercent: number): string {
  return `${Math.round(batteryPercent)}%`
}

/** Renders a speed telemetry value (meters/second) to one decimal place, e.g. "8.0 m/s". */
export function formatSpeedMetersPerSecond(speedMetersPerSecond: number): string {
  return `${speedMetersPerSecond.toFixed(1)} m/s`
}

/**
 * Renders a heading telemetry value (degrees) as a rounded whole-degree
 * compass bearing, e.g. "90°" — or a hovering-specific label when
 * `headingDegrees` is `undefined` (an investigating Quadrocopter hovers,
 * so it has no heading at all — see `DroneTelemetry.headingDegrees`).
 */
export function formatHeadingDegrees(headingDegrees: number | undefined): string {
  return headingDegrees === undefined ? 'N/A (hovering)' : `${Math.round(headingDegrees)}°`
}

/**
 * Renders a remaining-flight-endurance telemetry value (simulated seconds)
 * as "<hours>h <minutes>m", omitting the hours part entirely once under an
 * hour remains (e.g. "5m" rather than "0h 5m").
 */
export function formatRemainingEndurance(remainingEnduranceSimSeconds: number): string {
  const totalMinutes = Math.round(remainingEnduranceSimSeconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
}

const DRONE_TELEMETRY_STATE_LABELS: Record<DroneTelemetryState, string> = {
  idle: 'Idle',
  patrolling: 'Patrolling',
  investigating: 'Investigating',
  returning: 'Returning',
  charging: 'Charging',
  fault: 'Fault',
  lost: 'Lost',
  grounded: 'Grounded',
}

/** Renders a {@link DroneTelemetryState} discriminant as a title-cased display label. */
export function droneTelemetryStateLabel(state: DroneTelemetryState): string {
  return DRONE_TELEMETRY_STATE_LABELS[state]
}

const FIRE_TIER_LABELS: Record<FireTier, string> = {
  undetected: 'Undetected',
  towerDetected: 'Tower-Detected',
  investigated: 'Investigated',
}

/** Renders a {@link FireTier} discriminant as its exact `CONTEXT.md` display term, mirroring `eventTypeLabel`'s Event-side equivalent. */
export function fireTierLabel(tier: FireTier): string {
  return FIRE_TIER_LABELS[tier]
}

const CLEARCUT_TIER_LABELS: Record<ClearcutTier, string> = {
  undetected: 'Undetected',
  detected: 'Detected',
  investigated: 'Investigated',
}

/** Renders a {@link ClearcutTier} discriminant (ADR-0009) as a display label, the Clearcut sibling of {@link fireTierLabel}. */
export function clearcutTierLabel(tier: ClearcutTier): string {
  return CLEARCUT_TIER_LABELS[tier]
}

const FIRE_MISSION_KIND_LABELS: Record<FireMissionKind, string> = {
  roundTrip: 'Round Trip (Bingo Range)',
  oneWay: 'One-Way Mission',
}

/** Renders a {@link FireMissionKind} discriminant (issue U) as a display label, naming the `CONTEXT.md` term it corresponds to. */
export function fireMissionKindLabel(missionKind: FireMissionKind): string {
  return FIRE_MISSION_KIND_LABELS[missionKind]
}
