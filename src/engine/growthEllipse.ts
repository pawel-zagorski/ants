import type { Wind } from '../scenario/types'

/**
 * A single cell in a Fire's local axial hex grid (`CONTEXT.md`'s **Fire
 * Footprint** entry: "50m cells, local axial grid centered on that Fire's
 * ignition point"). `q`/`r` are plain axial hex coordinates — `(0, 0)` is
 * always the ignition cell itself. Deliberately has no `LatLng`: this grid
 * is defined purely in local meters relative to the ignition point, so the
 * same `(q, r)` always means the same physical offset regardless of where
 * on the map a given Fire ignited. Real-world geo-referencing (turning a
 * cell into a `LatLng` polygon for rendering) is `map/hexGrid.ts`'s job,
 * not this pure math module's.
 */
export interface HexCoordinate {
  q: number
  r: number
}

/** A Fire Footprint hex cell's edge-to-edge size, per `CONTEXT.md`. */
export const HEX_CELL_SIZE_METERS = 50

/**
 * Head rate of spread (m/s) per unit of wind speed (m/s), per the PRD/issue
 * R spec: "head rate of spread ≈ 0.1x wind speed" (e.g. a 5 m/s wind gives
 * ~0.5 m/s head ROS). See {@link headRateOfSpreadMetersPerSecond}.
 */
const HEAD_ROS_WIND_FACTOR = 0.1

/**
 * The upwind back's (and, at zero wind, the *uniform* circular) rate of
 * spread in m/s. Nobody in the PRD/issue specified an exact number for
 * this, so here is the concrete reasoning behind picking `0.1`:
 *
 * The issue calls a 5 m/s wind "moderate" and states it should produce a
 * ~0.5 m/s head rate of spread (`5 * HEAD_ROS_WIND_FACTOR`). This constant
 * is defined as *roughly 1/5th of that moderate-wind head rate*:
 * `0.5 / 5 = 0.1` m/s. A real wildfire's back/flank spread is indeed much
 * slower than its head spread (the head is pushed by wind-driven
 * convective preheating of fuel ahead of it; the back has none of that
 * push), so "much slower, but not zero" is the real-world behavior this
 * approximates — 1/5th was chosen as a concrete, round, comfortably-slower
 * multiple rather than deriving a physically exact figure (out of scope for
 * this prototype). This same constant doubles as the zero-wind *uniform*
 * rate: with no wind there is no downwind/upwind distinction, so the head
 * and back rates should coincide — see {@link headRateOfSpreadMetersPerSecond},
 * which clamps the wind-driven head rate to never fall below this value,
 * making the two exactly equal at `speedMetersPerSecond = 0` (and for any
 * wind under 1 m/s, where `0.1x` would otherwise dip below it).
 */
export const BACK_ROS_METERS_PER_SECOND = 0.1

/**
 * The Growth Ellipse's downwind head rate of spread (m/s) for `wind` —
 * `HEAD_ROS_WIND_FACTOR * speedMetersPerSecond`, clamped to never fall
 * below {@link BACK_ROS_METERS_PER_SECOND} so the head is never slower
 * than the back (and the two are exactly equal at zero wind, producing
 * uniform circular growth — see that constant's doc comment).
 */
function headRateOfSpreadMetersPerSecond(wind: Wind): number {
  return Math.max(HEAD_ROS_WIND_FACTOR * wind.speedMetersPerSecond, BACK_ROS_METERS_PER_SECOND)
}

/**
 * The direction (compass bearing, degrees clockwise from north) the
 * Growth Ellipse's head grows *toward* — `wind.directionDegrees` is the
 * meteorological FROM-direction (see `Wind`'s doc comment in
 * `../scenario/types`), so this adds 180, same convention `WindIndicator`
 * uses for its arrow glyph.
 */
function downwindBearingDegrees(wind: Wind): number {
  return (wind.directionDegrees + 180) % 360
}

/**
 * The Growth Ellipse's current geometry, `elapsedSecondsSinceIgnition`
 * after a Fire's ignition, for `wind` — the analytic model behind the Fire
 * Footprint (`CONTEXT.md`'s **Growth Ellipse** entry). Modeled as a
 * "double ellipse": the ignition point sits *on* the major axis (not at
 * the ellipse's center), `headDistanceMeters` ahead of it (downwind) and
 * `backDistanceMeters` behind it (upwind), each growing linearly at its
 * own fixed rate (see {@link headRateOfSpreadMetersPerSecond}/
 * {@link BACK_ROS_METERS_PER_SECOND}) — this is what produces "fastest at
 * the downwind head, slowest at the upwind back" (`CONTEXT.md`) rather
 * than a single circle/ellipse expanding uniformly from the ignition
 * point. From those two distances:
 *
 * - `semiMajorAxisMeters` = their average (half the total head-to-back
 *   span)
 * - `centerOffsetMeters` = half their *difference* — how far the ellipse's
 *   true center has drifted downwind from the ignition point (zero when
 *   `headDistanceMeters === backDistanceMeters`, i.e. zero wind)
 * - `semiMinorAxisMeters` = `semiMajorAxisMeters` divided by the
 *   length-to-breadth ratio `headRate / backRate` — this ratio is exactly
 *   `1` at zero wind (head and back rates coincide, so `semiMinorAxisMeters
 *   === semiMajorAxisMeters`: a true circle), and grows with wind speed
 *   since `headRate` alone scales with it while `backRate` stays fixed,
 *   giving "intermediate on the flanks" between the fast head and slow
 *   back for free, with no separate/arbitrary eccentricity formula needed.
 *
 * `elapsedSecondsSinceIgnition <= 0` (not yet ignited, or a defensive
 * negative input) clamps every distance to `0` — a degenerate ellipse
 * (both axes zero) rather than a negative or `NaN` shape.
 */
export interface FireFootprintExtentMeters {
  semiMajorAxisMeters: number
  semiMinorAxisMeters: number
  /** How far the ellipse's center has drifted downwind from the ignition point. */
  centerOffsetMeters: number
  /** Compass bearing (degrees clockwise from north) the ellipse's major axis points downwind along. */
  downwindBearingDegrees: number
}

export function fireFootprintExtentMetersAt(
  elapsedSecondsSinceIgnition: number,
  wind: Wind,
): FireFootprintExtentMeters {
  const elapsedSeconds = Math.max(0, elapsedSecondsSinceIgnition)
  const headRateMetersPerSecond = headRateOfSpreadMetersPerSecond(wind)
  const backRateMetersPerSecond = BACK_ROS_METERS_PER_SECOND

  const headDistanceMeters = headRateMetersPerSecond * elapsedSeconds
  const backDistanceMeters = backRateMetersPerSecond * elapsedSeconds

  const semiMajorAxisMeters = (headDistanceMeters + backDistanceMeters) / 2
  const lengthToBreadthRatio = headRateMetersPerSecond / backRateMetersPerSecond

  return {
    semiMajorAxisMeters,
    semiMinorAxisMeters: semiMajorAxisMeters / lengthToBreadthRatio,
    centerOffsetMeters: (headDistanceMeters - backDistanceMeters) / 2,
    downwindBearingDegrees: downwindBearingDegrees(wind),
  }
}

/**
 * The local (east, north) meters offset of hex cell `(q, r)`'s centroid
 * from the grid's origin — the standard pointy-top axial-to-pixel formula
 * (hex "size" = circumradius, center-to-vertex distance), with `(0, 0)`
 * mapping to the origin itself. Exported (rather than kept private) so
 * `map/hexGrid.ts`'s `hexCornersLatLng` can reuse this exact same formula
 * to turn a cell into a real geographic polygon, the same way
 * `engine/advanceSimulation.ts` already imports pure math (`pointOnCircle`,
 * `distanceMetersBetween`) from `map/geo.ts` — this module still has no
 * dependency of its own on `LatLng`/React/Leaflet; it's the map layer that
 * depends on the engine's math here, not the reverse.
 */
export function hexCentroidOffsetMeters(hex: HexCoordinate): { eastMeters: number; northMeters: number } {
  return {
    eastMeters: HEX_CELL_SIZE_METERS * Math.sqrt(3) * (hex.q + hex.r / 2),
    northMeters: HEX_CELL_SIZE_METERS * 1.5 * hex.r,
  }
}

/**
 * Whether the point `(eastMeters, northMeters)` (relative to the ignition
 * point) falls inside the Growth Ellipse described by `extent`. Projects
 * the point onto the ellipse's downwind axis and its perpendicular
 * (flank) axis via plain dot products with the two axes' unit vectors —
 * equivalent to rotating the point into the ellipse's own frame, but
 * without needing an explicit rotation matrix — then applies the standard
 * `(along/semiMajor)^2 + (across/semiMinor)^2 <= 1` ellipse test, after
 * first re-centering on the ellipse's true center (`extent.centerOffsetMeters`
 * downwind of the ignition point — see {@link fireFootprintExtentMetersAt}),
 * not the ignition point itself.
 */
function isInsideGrowthEllipse(
  eastMeters: number,
  northMeters: number,
  extent: FireFootprintExtentMeters,
): boolean {
  if (extent.semiMajorAxisMeters <= 0) {
    return eastMeters === 0 && northMeters === 0
  }

  const bearingRadians = (extent.downwindBearingDegrees * Math.PI) / 180
  const downwindEast = Math.sin(bearingRadians)
  const downwindNorth = Math.cos(bearingRadians)
  // Perpendicular to the downwind axis (rotate it 90deg) — either
  // perpendicular direction works, since the ellipse is symmetric across
  // its own minor axis.
  const flankEast = -downwindNorth
  const flankNorth = downwindEast

  const centerEast = downwindEast * extent.centerOffsetMeters
  const centerNorth = downwindNorth * extent.centerOffsetMeters
  const relativeEast = eastMeters - centerEast
  const relativeNorth = northMeters - centerNorth

  const alongMajorAxisMeters = relativeEast * downwindEast + relativeNorth * downwindNorth
  const alongMinorAxisMeters = relativeEast * flankEast + relativeNorth * flankNorth

  return (
    (alongMajorAxisMeters / extent.semiMajorAxisMeters) ** 2 +
      (alongMinorAxisMeters / extent.semiMinorAxisMeters) ** 2 <=
    1
  )
}

/**
 * The Fire Footprint (`CONTEXT.md`): every hex cell, in the Fire's local
 * axial grid centered on its ignition point, whose centroid currently
 * falls inside the Growth Ellipse — "a hex cell joins the footprint once
 * the analytic growth ellipse covers its centroid" (issue R). Pure and
 * total: the same `elapsedSecondsSinceIgnition` + `wind` always produce
 * the exact same (deeply-equal) array, in the same order, with no
 * dependency on `LatLng`, React, or Leaflet (mirrors `advanceSimulation`/
 * `map/geo.ts`'s existing pure-function conventions) — real geo-referencing
 * for rendering happens one layer up, in `map/hexGrid.ts`.
 *
 * At `elapsedSecondsSinceIgnition <= 0` the ellipse is a single degenerate
 * point at the ignition point itself (see {@link fireFootprintExtentMetersAt}),
 * so this returns just the ignition cell `(0, 0)` — a Fire is visible (as
 * its own single cell) the instant it ignites, rather than invisible until
 * some minimum growth has occurred.
 *
 * Searches a generously-sized hexagonal region of the axial grid (bounded
 * by the ellipse's downwind reach, `headDistanceMeters`, plus a
 * `HEX_CELL_SIZE_METERS` margin — no cell centroid can fall inside the
 * ellipse beyond that, since the head is always its furthest point from
 * the ignition point) rather than growing the search outward ring-by-ring;
 * simpler, and fast enough at this prototype's scale (footprints span at
 * most a few thousand cells even after a ~45 simulated-minute burn).
 */
export function fireFootprintHexCells(elapsedSecondsSinceIgnition: number, wind: Wind): HexCoordinate[] {
  const extent = fireFootprintExtentMetersAt(elapsedSecondsSinceIgnition, wind)

  if (extent.semiMajorAxisMeters <= 0) {
    return [{ q: 0, r: 0 }]
  }

  const maxReachMeters = extent.centerOffsetMeters + extent.semiMajorAxisMeters
  // Axial-grid steps span at least HEX_CELL_SIZE_METERS per step (in fact
  // sqrt(3)x that, for a pointy-top layout), so bounding the search by
  // reach/size (plus a small margin) safely over-covers the ellipse.
  const searchRadiusSteps = Math.ceil(maxReachMeters / HEX_CELL_SIZE_METERS) + 2

  const cells: HexCoordinate[] = []
  for (let q = -searchRadiusSteps; q <= searchRadiusSteps; q += 1) {
    const rMin = Math.max(-searchRadiusSteps, -q - searchRadiusSteps)
    const rMax = Math.min(searchRadiusSteps, -q + searchRadiusSteps)
    for (let r = rMin; r <= rMax; r += 1) {
      const { eastMeters, northMeters } = hexCentroidOffsetMeters({ q, r })
      if (isInsideGrowthEllipse(eastMeters, northMeters, extent)) {
        cells.push({ q, r })
      }
    }
  }

  return cells
}
