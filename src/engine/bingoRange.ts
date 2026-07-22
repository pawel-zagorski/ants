import { distanceMetersBetween } from '../map/geo'
import type { LatLng } from '../map/geo'
import type { BaseStation } from '../world/types'

/**
 * Placeholder radius (meters) standing in for "one orbit lap of the Fire's
 * current extent" (ADR-0006/`CONTEXT.md`'s **Bingo Range** entry) until
 * issue V implements the real orbit-radius logic (scaled to the Fire
 * Footprint/Uncertainty Ellipse's actual current size, which isn't wired up
 * to this module yet). A real Fire's Uncertainty Ellipse/Footprint size
 * genuinely varies (grows with elapsed time, Wind, Tower distance — see
 * `engine/growthEllipse.ts`), but threading that through the Bingo
 * Range/dispatch seam here — and thus into `FirePanel`, `advanceSimulation`,
 * and every classification test — is exactly the "real orbit-radius logic"
 * this issue explicitly defers to issue V. `300` is a fixed, documented,
 * conservative-but-plausible prototype constant instead: comfortably larger
 * than a fresh ignition's single-hex footprint (`HEX_CELL_SIZE_METERS` =
 * 50m), but well short of a long-uninvestigated Fire's eventual real
 * extent — i.e. this under-counts the orbit cost for an old, large Fire
 * (making Bingo Range *more* permissive than it should be for one), which
 * issue V is expected to correct once it has real extent data to work with.
 */
export const FIRE_ORBIT_RADIUS_METERS = 300

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
 *   the Fire, completing one orbit lap of it (`2 * PI * orbitRadiusMeters`,
 *   a placeholder extent — see {@link FIRE_ORBIT_RADIUS_METERS}), and
 *   reaching the *nearest* Base Station afterward (not necessarily the
 *   Drone's own home Base Station — any Base Station will do, same
 *   "everywhere it could still go and make it back to *some* Base Station"
 *   framing as the Return Envelope).
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
  orbitRadiusMeters: number = FIRE_ORBIT_RADIUS_METERS,
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
