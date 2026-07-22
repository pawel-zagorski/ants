import { describe, expect, it } from 'vitest'
import { distanceMetersBetween } from '../map/geo'
import { orbitLapDurationSimSeconds, orbitMotionFor, orbitPositionFor } from './orbit'
import type { LatLng } from '../map/geo'

const CENTER: LatLng = { lat: 64.5, lng: 26.25 }

describe('orbitPositionFor', () => {
  it('stays at (approximately) orbitRadiusMeters from the center at every point in time', () => {
    const orbitRadiusMeters = 400
    const linearSpeedMetersPerSecond = 8

    for (const secondsSinceOrbitStarted of [0, 5, 17, 63, 200]) {
      const position = orbitPositionFor(CENTER, orbitRadiusMeters, linearSpeedMetersPerSecond, secondsSinceOrbitStarted)
      expect(distanceMetersBetween(CENTER, position)).toBeCloseTo(orbitRadiusMeters, 0)
    }
  })

  it('sits at the center when orbitRadiusMeters is zero (a Fire that has not yet grown past its ignition point)', () => {
    const position = orbitPositionFor(CENTER, 0, 8, 50)

    expect(position).toEqual(CENTER)
  })

  it('moves over time (position at t=0 differs from a later t)', () => {
    const start = orbitPositionFor(CENTER, 400, 8, 0)
    const later = orbitPositionFor(CENTER, 400, 8, 10)

    expect(later).not.toEqual(start)
  })

  it('returns to (approximately) the same position after one full orbit lap period', () => {
    const orbitRadiusMeters = 300
    const linearSpeedMetersPerSecond = 10
    const lapDurationSimSeconds = orbitLapDurationSimSeconds(orbitRadiusMeters, linearSpeedMetersPerSecond)

    const start = orbitPositionFor(CENTER, orbitRadiusMeters, linearSpeedMetersPerSecond, 20)
    const afterOneLap = orbitPositionFor(CENTER, orbitRadiusMeters, linearSpeedMetersPerSecond, 20 + lapDurationSimSeconds)

    expect(distanceMetersBetween(start, afterOneLap)).toBeLessThan(1)
  })

  it('is a pure, deterministic function of its inputs', () => {
    expect(orbitPositionFor(CENTER, 400, 8, 37)).toEqual(orbitPositionFor(CENTER, 400, 8, 37))
  })
})

describe('orbitMotionFor', () => {
  it('reports non-zero speed and a defined heading for a positive orbit radius (both Drone types orbit, neither hovers)', () => {
    const motion = orbitMotionFor(400, 8, 12)

    expect(motion.speedMetersPerSecond).toBeGreaterThan(0)
    expect(motion.headingDegrees).toBeGreaterThanOrEqual(0)
    expect(motion.headingDegrees).toBeLessThan(360)
  })

  it('reports the same linear speed passed in (tangential speed at the orbit radius equals the driving linear speed)', () => {
    const motion = orbitMotionFor(400, 8, 12)

    expect(motion.speedMetersPerSecond).toBeCloseTo(8, 6)
  })

  it('reports zero speed and no heading when orbitRadiusMeters is zero', () => {
    const motion = orbitMotionFor(0, 8, 12)

    expect(motion.speedMetersPerSecond).toBe(0)
    expect(motion.headingDegrees).toBeUndefined()
  })
})

describe('orbitLapDurationSimSeconds', () => {
  it('equals circumference / linear speed', () => {
    const orbitRadiusMeters = 250
    const linearSpeedMetersPerSecond = 5

    expect(orbitLapDurationSimSeconds(orbitRadiusMeters, linearSpeedMetersPerSecond)).toBeCloseTo(
      (2 * Math.PI * orbitRadiusMeters) / linearSpeedMetersPerSecond,
      6,
    )
  })

  it('grows with a larger orbit radius at the same speed', () => {
    const shortLap = orbitLapDurationSimSeconds(100, 8)
    const longLap = orbitLapDurationSimSeconds(1000, 8)

    expect(longLap).toBeGreaterThan(shortLap)
  })

  it('shrinks with a higher linear speed at the same radius', () => {
    const slowLap = orbitLapDurationSimSeconds(300, 4)
    const fastLap = orbitLapDurationSimSeconds(300, 20)

    expect(fastLap).toBeLessThan(slowLap)
  })

  it('is Infinity for zero or negative linear speed (never completes a lap)', () => {
    expect(orbitLapDurationSimSeconds(300, 0)).toBe(Infinity)
    expect(orbitLapDurationSimSeconds(300, -5)).toBe(Infinity)
  })

  it('is Infinity for zero or negative orbit radius (degenerate orbit — a Fire that has not yet grown past its ignition point cannot complete a lap)', () => {
    expect(orbitLapDurationSimSeconds(0, 8)).toBe(Infinity)
    expect(orbitLapDurationSimSeconds(-1, 8)).toBe(Infinity)
  })
})
