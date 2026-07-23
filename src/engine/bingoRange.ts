import { distanceMetersBetween } from '../map/geo'
import type { LatLng } from '../map/geo'
import type { BaseStation } from '../world/types'

/**
 * The three-way outcome of {@link classifyFireDispatch} — see its doc
 * comment (mirrors `CONTEXT.md`'s **Bingo Range** and **One-Way Mission**
 * entries, plus the "unreachable" case those entries exclude entirely).
 */
export type FireDispatchClassification = 'bingoRange' | 'oneWayMission' | 'unreachable'

/**
 * A Drone candidate for Fire-dispatch classification: just the facts
 * {@link classifyFireDispatch} needs, decoupled from the full engine
 * `SimulationState`/`Drone` shapes so this stays a small, easily-tested
 * pure function (mirrors `dispatch.ts`'s `DispatchCandidate` for the same
 * reason). `position` and `remainingEnduranceSimSeconds` are the Drone's
 * *live*, current-tick values (not its static `world.json` position or
 * `maxEnduranceSimSeconds`) — callers derive both the same way
 * `ReturnEnvelope`/`droneTelemetryFor` already do.
 */
export interface FireDispatchCandidate {
  id: string
  position: LatLng
  remainingEnduranceSimSeconds: number
  cruiseSpeedMetersPerSecond: number
}

/** The nearest Base Station's distance from `firePosition`, or `Infinity` if `baseStations` is empty. */
function nearestBaseStationDistanceMeters(firePosition: LatLng, baseStations: readonly BaseStation[]): number {
  let nearestMeters = Infinity

  for (const baseStation of baseStations) {
    const distanceMeters = distanceMetersBetween(firePosition, baseStation.position)
    if (distanceMeters < nearestMeters) {
      nearestMeters = distanceMeters
    }
  }

  return nearestMeters
}

/**
 * Classifies a single Drone candidate for Fire dispatch, per ADR-0006 and
 * `CONTEXT.md`'s **Bingo Range** and **One-Way Mission** entries — reusing the
 * same distance/speed math as the Return Envelope (`map/geo.ts`'s
 * `distanceMetersBetween`), but as a real eligibility gate rather than a
 * display-only overlay. The Drone's flight budget in meters is
 * `remainingEnduranceSimSeconds * cruiseSpeedMetersPerSecond` (identical to
 * `ReturnEnvelope`'s own `focalDistanceBudgetMeters`). Three outcomes:
 *
 * - `'bingoRange'`: the budget covers the full round trip — flying out to
 *   the Fire, completing one orbit lap of it (`2 * PI * orbitRadiusMeters`
 *   — issue V: `orbitRadiusMeters` is the Fire's *real* current orbit
 *   radius, `growthEllipse.ts`'s `fireOrbitRadiusMetersAt`, computed by the
 *   caller — this module stays decoupled from `growthEllipse.ts`/`Wind`,
 *   the same "just the facts this function needs" rationale as
 *   `FireDispatchCandidate`'s own doc comment), and reaching the *nearest*
 *   Base Station afterward (not necessarily the Drone's own home Base
 *   Station — any Base Station will do, same "everywhere it could still go
 *   and make it back to *some* Base Station" framing as the Return
 *   Envelope).
 * - `'oneWayMission'`: the budget falls short of that round trip, but still
 *   covers just reaching the Fire itself (the one-way leg alone) — the
 *   Drone can physically get there but the operator must accept it won't
 *   return to any Base Station.
 * - `'unreachable'`: the budget doesn't even cover reaching the Fire
 *   one-way. Callers (`FirePanel`) exclude this outcome entirely rather
 *   than rendering it in either list.
 *
 * `baseStations` empty (or all unreachable) can never yield `'bingoRange'`
 * (there's no "nearest Base Station" distance to add, so the round-trip
 * distance is treated as infinite) — it can still yield `'oneWayMission'`
 * or `'unreachable'` based on the Fire-only leg. Pure and total: the same
 * inputs always produce the same classification.
 */
export function classifyFireDispatch(
  candidate: FireDispatchCandidate,
  firePosition: LatLng,
  baseStations: readonly BaseStation[],
  orbitRadiusMeters: number,
): FireDispatchClassification {
  const flightBudgetMeters = candidate.remainingEnduranceSimSeconds * candidate.cruiseSpeedMetersPerSecond
  const distanceToFireMeters = distanceMetersBetween(candidate.position, firePosition)
  const orbitLapMeters = 2 * Math.PI * orbitRadiusMeters
  const returnLegMeters = nearestBaseStationDistanceMeters(firePosition, baseStations)
  const roundTripMeters = distanceToFireMeters + orbitLapMeters + returnLegMeters

  if (flightBudgetMeters >= roundTripMeters) return 'bingoRange'
  if (flightBudgetMeters >= distanceToFireMeters) return 'oneWayMission'
  return 'unreachable'
}

/**
 * The Clearcut sibling of {@link classifyFireDispatch} (issue Y): reuses
 * the exact same distance/speed math — a Clearcut position stands in for
 * `firePosition`, and the caller supplies its own (static, wind/time-free)
 * orbit radius (`clearcutFootprint.ts`'s `clearcutOrbitRadiusMeters`)
 * instead of a Fire's live one — but collapses the three-way
 * `FireDispatchClassification` down to a single boolean gate: `true` only
 * for `'bingoRange'`. `CONTEXT.md`/this issue's spec: a Clearcut is a
 * static, non-urgent target that never justifies a One-Way Mission, so
 * `ClearcutPanel` needs no second list and no `'oneWayMission'`/
 * `'unreachable'` distinction at all — both simply mean "not listed" here.
 */
export function isClearcutBingoRangeEligible(
  candidate: FireDispatchCandidate,
  clearcutPosition: LatLng,
  baseStations: readonly BaseStation[],
  orbitRadiusMeters: number,
): boolean {
  return classifyFireDispatch(candidate, clearcutPosition, baseStations, orbitRadiusMeters) === 'bingoRange'
}
