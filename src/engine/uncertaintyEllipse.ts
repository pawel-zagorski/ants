import { distanceMetersBetween } from '../map/geo'
import type { ClearcutRuntimeState, FireRuntimeState } from './types'
import type { Tower } from '../world/types'

/**
 * The Uncertainty Ellipse's radius (meters) at the instant of Detection
 * (zero elapsed time, zero detecting-Tower distance) — `CONTEXT.md`: "an
 * ellipse standing in for the Fire's true position/size". Never a
 * degenerate point, even for a Tower right on top of the Fire, since a
 * Tower sighting is never perfectly precise. Chosen as a small multiple of
 * `HEX_CELL_SIZE_METERS` (`growthEllipse.ts`) so a freshly-detected Fire's
 * ellipse is visibly larger than a single Fire Footprint hex tile on the
 * map, without being so large it swamps the viewport.
 */
export const UNCERTAINTY_ELLIPSE_BASE_RADIUS_METERS = 150

/**
 * How much of the detecting Tower's distance to the Fire (meters) folds
 * into the ellipse's radius (meters) — `CONTEXT.md`: "further [Tower] =
 * blurrier [ellipse]". Nobody in the PRD/issue specified an exact number,
 * so here is the concrete reasoning behind `0.05`: Towers in the bundled
 * `world.json` have a 15,000m detection radius, so a Fire detected right
 * at the edge of a Tower's range is already about as uncertain as this
 * model gets — `0.05` (5%) turns that worst-case 15,000m distance into a
 * +750m radius contribution, comfortably larger than the ~150m base
 * radius above but still a small fraction of the Tower's own range, not a
 * shape that swamps the map.
 */
export const UNCERTAINTY_ELLIPSE_DISTANCE_FACTOR_METERS_PER_METER = 0.05

/**
 * How fast the ellipse's radius grows (meters/second) with elapsed
 * simulated time since Detection — `CONTEXT.md`: "growing further with
 * elapsed time since Detection, since an uninvestigated Fire may have
 * spread beyond what the Tower last implied". Nobody specified an exact
 * number, so here is the concrete reasoning behind `0.15`: picked a bit
 * faster than `growthEllipse.ts`'s `BACK_ROS_METERS_PER_SECOND` (0.1 m/s —
 * the real Fire Footprint's *slowest* growth direction, its upwind back),
 * since the Uncertainty Ellipse has to cover the worst case of how far the
 * real (possibly wind-driven, faster-growing) footprint might have spread
 * in *every* direction, not just its slowest edge.
 */
export const UNCERTAINTY_ELLIPSE_TIME_GROWTH_METERS_PER_SECOND = 0.15

/**
 * The Uncertainty Ellipse's radius (meters) for a Tower-Detected Fire
 * (`CONTEXT.md`), `detectingTowerDistanceMeters` from the Tower that
 * detected it and `elapsedSimSecondsSinceDetection` after that Detection —
 * a base radius plus a distance-scaled term plus a time-scaled term (see
 * the three constants above for the concrete reasoning behind each).
 * Deliberately a simple, roughly-circular "blur radius" rather than a
 * wind-directional shape like the real Growth Ellipse (`growthEllipse.ts`)
 * — Tower-detection uncertainty is about *where/how big*, not *which way
 * it's spreading* (`CONTEXT.md`'s Uncertainty Ellipse entry explicitly
 * distinguishes this from the wind-biased Growth Ellipse). Both inputs are
 * clamped to zero first, so a defensive negative distance or elapsed time
 * never produces a smaller-than-base or negative radius.
 */
export function uncertaintyEllipseRadiusMeters(
  detectingTowerDistanceMeters: number,
  elapsedSimSecondsSinceDetection: number,
): number {
  const distanceMeters = Math.max(0, detectingTowerDistanceMeters)
  const elapsedSeconds = Math.max(0, elapsedSimSecondsSinceDetection)

  return (
    UNCERTAINTY_ELLIPSE_BASE_RADIUS_METERS +
    UNCERTAINTY_ELLIPSE_DISTANCE_FACTOR_METERS_PER_METER * distanceMeters +
    UNCERTAINTY_ELLIPSE_TIME_GROWTH_METERS_PER_SECOND * elapsedSeconds
  )
}

/**
 * {@link uncertaintyEllipseRadiusMeters}, but starting from a Fire's own
 * runtime state and the World's `towers` roster rather than pre-computed
 * distance/elapsed-time numbers — looks up the detecting Tower via
 * `fire.detectedByAssetId` (per `CONTEXT.md`'s Fire entry: a Tower is
 * specifically what first moves a Fire out of `'undetected'`) and derives
 * both inputs from there: `distanceMetersBetween` (`map/geo.ts`, the same
 * pure geometry `advanceSimulation.ts` already imports from this module)
 * for the Tower-to-Fire distance, and `elapsedSimSeconds -
 * fire.detectedAtSimSeconds` for the elapsed time since Detection.
 * Returns `undefined` if no Tower in `towers` matches
 * `fire.detectedByAssetId` — defensively, since that should never happen
 * for a real `'towerDetected'` Fire, but callers (map rendering) should
 * simply skip rendering rather than crash if it somehow does. Falls back
 * to treating elapsed time as zero when `fire.detectedAtSimSeconds` is
 * absent, mirroring `FirePanel`'s own "Unknown"-style defensive handling
 * of that same optional field.
 */
export function uncertaintyEllipseRadiusMetersForFire(
  fire: FireRuntimeState,
  towers: readonly Tower[],
  elapsedSimSeconds: number,
): number | undefined {
  const detectingTower = towers.find((tower) => tower.id === fire.detectedByAssetId)
  if (!detectingTower) return undefined

  const detectingTowerDistanceMeters = distanceMetersBetween(detectingTower.position, fire.position)
  const elapsedSimSecondsSinceDetection = elapsedSimSeconds - (fire.detectedAtSimSeconds ?? elapsedSimSeconds)

  return uncertaintyEllipseRadiusMeters(detectingTowerDistanceMeters, elapsedSimSecondsSinceDetection)
}

/**
 * The Uncertainty Ellipse radius (meters) for a `detected`-tier Clearcut
 * (ADR-0009, `CONTEXT.md`'s updated Uncertainty Ellipse entry) — the
 * distance-only sibling of {@link uncertaintyEllipseRadiusMetersForFire}.
 * Reuses the very same {@link uncertaintyEllipseRadiusMeters} blur formula,
 * but with the **time-growth term hard-zeroed**: a Clearcut never spreads,
 * so its estimate is a fixed, distance-only blur that does not grow while
 * it sits un-Investigated (contrast a Fire, whose ellipse grows the longer
 * it goes un-Investigated). The distance term is `detectedFromDistanceMeters`
 * — the straight-line distance from the detecting Drone to the Clearcut
 * centroid captured *once*, at Detection time (`advanceSimulation.ts`'s
 * `clearcutWithDetectionApplied`) — not a live per-tick distance, so the
 * blur is stable even as the detecting Drone flies on. Falls back to a pure
 * base-radius blur when `detectedFromDistanceMeters` is absent (defensive;
 * a real `detected` Clearcut always has one).
 */
export function uncertaintyEllipseRadiusMetersForClearcut(clearcut: ClearcutRuntimeState): number {
  return uncertaintyEllipseRadiusMeters(clearcut.detectedFromDistanceMeters ?? 0, 0)
}
