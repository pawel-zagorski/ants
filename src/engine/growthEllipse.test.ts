import { describe, expect, it } from 'vitest'
import { fireFootprintExtentMetersAt, fireFootprintHexCells, fireOrbitRadiusMetersAt, hexCentroidOffsetMeters } from './growthEllipse'
import type { HexCoordinate } from './growthEllipse'
import type { Wind } from '../scenario/types'

const NO_WIND: Wind = { directionDegrees: 0, speedMetersPerSecond: 0 }
// Meteorological "from due north" -> blows toward due south (bearing 180deg).
const STRONG_NORTHERLY_WIND: Wind = { directionDegrees: 0, speedMetersPerSecond: 12 }

function maxDistanceMeters(cells: HexCoordinate[]): number {
  return Math.max(0, ...cells.map((hex) => {
    const { eastMeters, northMeters } = hexCentroidOffsetMeters(hex)
    return Math.sqrt(eastMeters ** 2 + northMeters ** 2)
  }))
}

describe('fireFootprintExtentMetersAt', () => {
  it('grows the semi-major axis linearly with elapsed time', () => {
    const extentAt1000 = fireFootprintExtentMetersAt(1000, STRONG_NORTHERLY_WIND)
    const extentAt2000 = fireFootprintExtentMetersAt(2000, STRONG_NORTHERLY_WIND)

    expect(extentAt2000.semiMajorAxisMeters).toBeCloseTo(extentAt1000.semiMajorAxisMeters * 2, 6)
  })

  it('produces a circle (equal semi-major/semi-minor axes, no center offset) for zero wind', () => {
    const extent = fireFootprintExtentMetersAt(1000, NO_WIND)

    expect(extent.semiMinorAxisMeters).toBeCloseTo(extent.semiMajorAxisMeters, 6)
    expect(extent.centerOffsetMeters).toBeCloseTo(0, 6)
  })

  it('gives a 5 m/s ("moderate") wind a head rate of spread of ~0.5 m/s', () => {
    const wind: Wind = { directionDegrees: 0, speedMetersPerSecond: 5 }
    const extent = fireFootprintExtentMetersAt(1000, wind)

    // headDistance = 0.5 m/s * 1000s = 500m; backDistance = 0.1 m/s * 1000s = 100m.
    // semiMajorAxis = (500 + 100) / 2 = 300; centerOffset = (500 - 100) / 2 = 200.
    expect(extent.semiMajorAxisMeters).toBeCloseTo(300, 6)
    expect(extent.centerOffsetMeters).toBeCloseTo(200, 6)
  })

  it('elongates (semi-major grows faster than semi-minor) as wind speed increases', () => {
    const lightWind = fireFootprintExtentMetersAt(1000, { directionDegrees: 0, speedMetersPerSecond: 2 })
    const strongWind = fireFootprintExtentMetersAt(1000, { directionDegrees: 0, speedMetersPerSecond: 15 })

    const lightWindRatio = lightWind.semiMajorAxisMeters / lightWind.semiMinorAxisMeters
    const strongWindRatio = strongWind.semiMajorAxisMeters / strongWind.semiMinorAxisMeters
    expect(strongWindRatio).toBeGreaterThan(lightWindRatio)
  })

  it('never grows for zero or negative elapsed time', () => {
    expect(fireFootprintExtentMetersAt(0, STRONG_NORTHERLY_WIND).semiMajorAxisMeters).toBe(0)
    expect(fireFootprintExtentMetersAt(-500, STRONG_NORTHERLY_WIND).semiMajorAxisMeters).toBe(0)
  })
})

describe('fireOrbitRadiusMetersAt', () => {
  it('is zero at ignition (elapsedSecondsSinceIgnition <= 0)', () => {
    expect(fireOrbitRadiusMetersAt(0, STRONG_NORTHERLY_WIND)).toBe(0)
    expect(fireOrbitRadiusMetersAt(-100, STRONG_NORTHERLY_WIND)).toBe(0)
  })

  it('grows as the Fire Footprint grows (scales with elapsed time since ignition)', () => {
    const radiusAt1000 = fireOrbitRadiusMetersAt(1000, STRONG_NORTHERLY_WIND)
    const radiusAt2000 = fireOrbitRadiusMetersAt(2000, STRONG_NORTHERLY_WIND)

    expect(radiusAt2000).toBeGreaterThan(radiusAt1000)
    expect(radiusAt1000).toBeGreaterThan(0)
  })

  it('equals the semi-major axis length for a zero-wind (circular) footprint, since centerOffsetMeters is zero', () => {
    const radius = fireOrbitRadiusMetersAt(1000, NO_WIND)
    const extent = fireFootprintExtentMetersAt(1000, NO_WIND)

    expect(radius).toBeCloseTo(extent.semiMajorAxisMeters, 6)
  })

  it('equals the downwind head distance (centerOffsetMeters + semiMajorAxisMeters) under wind', () => {
    const wind: Wind = { directionDegrees: 0, speedMetersPerSecond: 5 }
    const radius = fireOrbitRadiusMetersAt(1000, wind)

    // headDistance = 0.5 m/s * 1000s = 500m (see fireFootprintExtentMetersAt's own test above).
    expect(radius).toBeCloseTo(500, 6)
  })

  it('always encloses every Fire Footprint hex cell for a given elapsed time/wind (no cell centroid exceeds this radius from the ignition point)', () => {
    const wind: Wind = { directionDegrees: 45, speedMetersPerSecond: 8 }
    const elapsedSecondsSinceIgnition = 2500
    const radius = fireOrbitRadiusMetersAt(elapsedSecondsSinceIgnition, wind)
    const cells = fireFootprintHexCells(elapsedSecondsSinceIgnition, wind)

    for (const cell of cells) {
      const { eastMeters, northMeters } = hexCentroidOffsetMeters(cell)
      const distanceFromIgnitionMeters = Math.sqrt(eastMeters ** 2 + northMeters ** 2)
      // A generous margin for the hex cell's own footprint beyond its centroid.
      expect(distanceFromIgnitionMeters).toBeLessThanOrEqual(radius + 100)
    }
  })

  it('is a pure, deterministic function of its inputs', () => {
    expect(fireOrbitRadiusMetersAt(1500, STRONG_NORTHERLY_WIND)).toBe(fireOrbitRadiusMetersAt(1500, STRONG_NORTHERLY_WIND))
  })
})

describe('fireFootprintHexCells', () => {
  it('always includes the ignition cell (0,0) once ignited', () => {
    const cells = fireFootprintHexCells(1, NO_WIND)

    expect(cells).toContainEqual({ q: 0, r: 0 })
  })

  it('returns only the ignition cell at elapsedSecondsSinceIgnition = 0', () => {
    const cells = fireFootprintHexCells(0, STRONG_NORTHERLY_WIND)

    expect(cells).toEqual([{ q: 0, r: 0 }])
  })

  it('grows outward from a single cell as elapsed time increases (no wind: circular growth)', () => {
    const earlyCells = fireFootprintHexCells(200, NO_WIND)
    const laterCells = fireFootprintHexCells(4000, NO_WIND)

    expect(laterCells.length).toBeGreaterThan(earlyCells.length)
  })

  it('is symmetric under point-reflection through the ignition cell for zero wind (a true circle)', () => {
    const cells = fireFootprintHexCells(3000, NO_WIND)
    const cellKeys = new Set(cells.map((hex) => `${hex.q},${hex.r}`))

    for (const hex of cells) {
      expect(cellKeys.has(`${-hex.q},${-hex.r}`)).toBe(true)
    }
  })

  it('elongates downwind: a strong wind pushes the footprint much further downwind than upwind', () => {
    const cells = fireFootprintHexCells(3000, STRONG_NORTHERLY_WIND)

    // STRONG_NORTHERLY_WIND blows FROM north, i.e. TOWARD south — downwind
    // cells have negative r (south, per the axial-to-pixel convention in
    // `hexGrid.ts`: northMeters = 1.5 * r * HEX_CELL_SIZE_METERS).
    const downwindExtent = Math.abs(Math.min(...cells.map((hex) => hex.r)))
    const upwindExtent = Math.max(...cells.map((hex) => hex.r))

    expect(downwindExtent).toBeGreaterThan(upwindExtent * 2)
  })

  it('grows to a multi-hundred-meter footprint by the end of a ~45 simulated-minute scenario under a moderate wind', () => {
    const wind: Wind = { directionDegrees: 0, speedMetersPerSecond: 5 }
    const cells = fireFootprintHexCells(45 * 60, wind)

    expect(maxDistanceMeters(cells)).toBeGreaterThan(300)
  })

  it('is deterministic: the same inputs produce byte-identical (deeply equal) cell sets every time', () => {
    const cellsRunA = fireFootprintHexCells(1500, STRONG_NORTHERLY_WIND)
    const cellsRunB = fireFootprintHexCells(1500, STRONG_NORTHERLY_WIND)

    expect(cellsRunA).toEqual(cellsRunB)
  })

  it('produces no duplicate cells', () => {
    const cells = fireFootprintHexCells(2500, STRONG_NORTHERLY_WIND)
    const cellKeys = cells.map((hex) => `${hex.q},${hex.r}`)

    expect(new Set(cellKeys).size).toBe(cellKeys.length)
  })
})
