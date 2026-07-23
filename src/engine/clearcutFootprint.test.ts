import { describe, expect, it } from 'vitest'
import { clearcutFootprintHexCells, clearcutOrbitRadiusMeters } from './clearcutFootprint'
import { hexCentroidOffsetMeters } from './growthEllipse'
import type { HexCoordinate } from './growthEllipse'

/** A moderate, clearly-elongated footprint spec (major axis 4x the minor). */
const ELONGATED = { semiMajorAxisMeters: 400, semiMinorAxisMeters: 100, orientationDegrees: 0 }

function keyOf(cells: HexCoordinate[]): Set<string> {
  return new Set(cells.map((hex) => `${hex.q},${hex.r}`))
}

function maxExtentAlong(cells: HexCoordinate[], axis: 'east' | 'north'): number {
  return Math.max(
    0,
    ...cells.map((hex) => {
      const { eastMeters, northMeters } = hexCentroidOffsetMeters(hex)
      return Math.abs(axis === 'east' ? eastMeters : northMeters)
    }),
  )
}

describe('clearcutFootprintHexCells', () => {
  it('always includes the centroid cell (0,0)', () => {
    expect(clearcutFootprintHexCells(ELONGATED)).toContainEqual({ q: 0, r: 0 })
  })

  it('is deterministic: the same spec produces byte-identical (deeply equal) cell sets every time', () => {
    expect(clearcutFootprintHexCells(ELONGATED)).toEqual(clearcutFootprintHexCells(ELONGATED))
  })

  it('does NOT depend on elapsed time — it has no time parameter, so it is constant for the whole run by construction', () => {
    // A Clearcut Footprint is static; this test documents that the function
    // signature itself carries no time term (contrast with fireFootprintHexCells).
    const early = clearcutFootprintHexCells(ELONGATED)
    const late = clearcutFootprintHexCells(ELONGATED)
    expect(late).toEqual(early)
  })

  it('produces no duplicate cells', () => {
    const cells = clearcutFootprintHexCells(ELONGATED)
    expect(new Set(cells.map((hex) => `${hex.q},${hex.r}`)).size).toBe(cells.length)
  })

  it('elongates along the major axis: at orientation 0 (north) it reaches much further north/south than east/west', () => {
    const cells = clearcutFootprintHexCells(ELONGATED)
    // orientationDegrees 0 => major axis points due north (bearing 0), so the
    // north extent (major, 400m) should far exceed the east extent (minor, 100m).
    expect(maxExtentAlong(cells, 'north')).toBeGreaterThan(maxExtentAlong(cells, 'east') * 2)
  })

  it('rotates the cell set when orientation changes: a 90-degree turn swaps the long axis from north to east', () => {
    const alongNorth = clearcutFootprintHexCells({ ...ELONGATED, orientationDegrees: 0 })
    const alongEast = clearcutFootprintHexCells({ ...ELONGATED, orientationDegrees: 90 })

    expect(maxExtentAlong(alongNorth, 'north')).toBeGreaterThan(maxExtentAlong(alongNorth, 'east') * 2)
    // Rotated 90deg, the long axis is now east-west.
    expect(maxExtentAlong(alongEast, 'east')).toBeGreaterThan(maxExtentAlong(alongEast, 'north') * 2)
    // A genuine rotation, so the two cell sets are not identical.
    expect(keyOf(alongEast)).not.toEqual(keyOf(alongNorth))
  })

  it('a circular spec (equal axes) is orientation-invariant', () => {
    const spec = { semiMajorAxisMeters: 200, semiMinorAxisMeters: 200, orientationDegrees: 0 }
    const rotated = { ...spec, orientationDegrees: 37 }
    expect(keyOf(clearcutFootprintHexCells(rotated))).toEqual(keyOf(clearcutFootprintHexCells(spec)))
  })

  it('returns only the centroid cell for a degenerate (zero-size) spec', () => {
    expect(clearcutFootprintHexCells({ semiMajorAxisMeters: 0, semiMinorAxisMeters: 0, orientationDegrees: 0 })).toEqual([
      { q: 0, r: 0 },
    ])
  })
})

describe('clearcutOrbitRadiusMeters', () => {
  it('equals the semi-major axis when it is the longer of the two axes (the ellipse is centered exactly on the centroid, so its furthest reach is the major axis length)', () => {
    expect(clearcutOrbitRadiusMeters(ELONGATED)).toBe(ELONGATED.semiMajorAxisMeters)
  })

  it('equals the semi-minor axis when it is (unusually) the longer of the two — always the larger of the two half-axes', () => {
    const spec = { semiMajorAxisMeters: 100, semiMinorAxisMeters: 400, orientationDegrees: 0 }
    expect(clearcutOrbitRadiusMeters(spec)).toBe(400)
  })

  it('is orientation-independent (rotating the footprint does not change its bounding-circle radius)', () => {
    const radiusAt0 = clearcutOrbitRadiusMeters(ELONGATED)
    const radiusAt90 = clearcutOrbitRadiusMeters({ ...ELONGATED, orientationDegrees: 90 })
    expect(radiusAt90).toBe(radiusAt0)
  })

  it('is exactly zero for a degenerate (zero-size) spec, not a negative or NaN value', () => {
    expect(clearcutOrbitRadiusMeters({ semiMajorAxisMeters: 0, semiMinorAxisMeters: 0, orientationDegrees: 0 })).toBe(0)
  })

  it('is a pure, deterministic function of its input', () => {
    expect(clearcutOrbitRadiusMeters(ELONGATED)).toBe(clearcutOrbitRadiusMeters(ELONGATED))
  })
})
