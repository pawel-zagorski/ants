import { HEX_CELL_SIZE_METERS, hexCentroidOffsetMeters } from './growthEllipse'
import type { HexCoordinate } from './growthEllipse'

/**
 * The fixed, oriented shape of a Clearcut Footprint (`CONTEXT.md`): a
 * static ellipse centered on the Clearcut's centroid, with two half-axes
 * and a compass orientation. Unlike a Fire's Growth Ellipse
 * (`growthEllipse.ts`) this carries **no Wind term and no time term** — it
 * is constant for the whole run (ADR-0009). `orientationDegrees` is the
 * *major* axis' compass bearing (clockwise from north), so a road-aligned
 * logging site can be elongated along the road.
 */
export interface ClearcutFootprintSpec {
  semiMajorAxisMeters: number
  semiMinorAxisMeters: number
  orientationDegrees: number
}

/**
 * Whether the point `(eastMeters, northMeters)` (relative to the Clearcut's
 * centroid) falls inside the static, oriented Clearcut Footprint ellipse
 * described by `spec`. Projects the point onto the ellipse's major axis and
 * its perpendicular (minor) axis via plain dot products with the two axes'
 * unit vectors — equivalent to rotating the point into the ellipse's own
 * frame — then applies the standard
 * `(major/semiMajor)^2 + (minor/semiMinor)^2 <= 1` ellipse test. Mirrors
 * `growthEllipse.ts`'s `isInsideGrowthEllipse`, but with the ellipse
 * centered on the centroid itself (no downwind center-offset) and oriented
 * by `orientationDegrees` rather than a wind bearing.
 */
function isInsideClearcutEllipse(eastMeters: number, northMeters: number, spec: ClearcutFootprintSpec): boolean {
  if (spec.semiMajorAxisMeters <= 0 || spec.semiMinorAxisMeters <= 0) {
    return eastMeters === 0 && northMeters === 0
  }

  const bearingRadians = (spec.orientationDegrees * Math.PI) / 180
  // Major axis unit vector (compass bearing => east/north components).
  const majorEast = Math.sin(bearingRadians)
  const majorNorth = Math.cos(bearingRadians)
  // Minor axis is perpendicular to the major axis.
  const minorEast = -majorNorth
  const minorNorth = majorEast

  const alongMajorAxisMeters = eastMeters * majorEast + northMeters * majorNorth
  const alongMinorAxisMeters = eastMeters * minorEast + northMeters * minorNorth

  return (
    (alongMajorAxisMeters / spec.semiMajorAxisMeters) ** 2 + (alongMinorAxisMeters / spec.semiMinorAxisMeters) ** 2 <= 1
  )
}

/**
 * The Clearcut Footprint (`CONTEXT.md`): every hex cell, in the Clearcut's
 * local axial grid centered on its centroid, whose centroid falls inside
 * the static oriented ellipse described by `spec`. Pure and total: the same
 * `spec` always produces the exact same (deeply-equal) array, in the same
 * order — and, crucially, it takes **no elapsed-time argument at all**, so
 * a Clearcut Footprint is constant for the whole run by construction
 * (ADR-0009), the one way it differs from `growthEllipse.ts`'s
 * time-driven `fireFootprintHexCells`. Reuses the exact same axial-grid hex
 * math (`hexCentroidOffsetMeters`/`HEX_CELL_SIZE_METERS`) so the geographic
 * rendering in `map/hexGrid.ts` works identically for a Clearcut and a
 * Fire.
 *
 * A degenerate (zero-size) spec returns just the centroid cell `(0, 0)`,
 * mirroring `fireFootprintHexCells`' single-cell result at ignition.
 */
export function clearcutFootprintHexCells(spec: ClearcutFootprintSpec): HexCoordinate[] {
  if (spec.semiMajorAxisMeters <= 0 || spec.semiMinorAxisMeters <= 0) {
    return [{ q: 0, r: 0 }]
  }

  const maxReachMeters = Math.max(spec.semiMajorAxisMeters, spec.semiMinorAxisMeters)
  // Axial-grid steps span at least HEX_CELL_SIZE_METERS per step, so bounding
  // the search by reach/size (plus a small margin) safely over-covers the
  // ellipse — same bounding argument as `fireFootprintHexCells`.
  const searchRadiusSteps = Math.ceil(maxReachMeters / HEX_CELL_SIZE_METERS) + 2

  const cells: HexCoordinate[] = []
  for (let q = -searchRadiusSteps; q <= searchRadiusSteps; q += 1) {
    const rMin = Math.max(-searchRadiusSteps, -q - searchRadiusSteps)
    const rMax = Math.min(searchRadiusSteps, -q + searchRadiusSteps)
    for (let r = rMin; r <= rMax; r += 1) {
      const { eastMeters, northMeters } = hexCentroidOffsetMeters({ q, r })
      if (isInsideClearcutEllipse(eastMeters, northMeters, spec)) {
        cells.push({ q, r })
      }
    }
  }

  return cells
}
