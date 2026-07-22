import { describe, expect, it } from 'vitest'
import { investigateMotionFor, investigatePositionFor, selectNearestAvailableDrone } from './dispatch'
import { distanceMetersBetween } from '../map/geo'
import type { LatLng } from '../map/geo'

describe('selectNearestAvailableDrone', () => {
  const eventPosition: LatLng = { lat: 64.5, lng: 26.25 }

  it('picks the candidate closest to the Event position', () => {
    const candidates = [
      { id: 'far-drone', position: { lat: 64.6, lng: 26.25 } },
      { id: 'near-drone', position: { lat: 64.501, lng: 26.25 } },
    ]

    expect(selectNearestAvailableDrone(eventPosition, candidates)).toBe('near-drone')
  })

  it('breaks exact distance ties by Drone id, lexicographically', () => {
    const candidates = [
      { id: 'drone-b', position: { lat: 64.501, lng: 26.25 } },
      { id: 'drone-a', position: { lat: 64.499, lng: 26.25 } },
    ]

    expect(selectNearestAvailableDrone(eventPosition, candidates)).toBe('drone-a')
  })

  it('returns undefined when there are no candidates (no Drone available)', () => {
    expect(selectNearestAvailableDrone(eventPosition, [])).toBeUndefined()
  })
})

describe('investigatePositionFor', () => {
  const eventPosition: LatLng = { lat: 64.5, lng: 26.25 }

  it('holds a Quadrocopter exactly at the Event position, regardless of elapsed investigation time', () => {
    expect(investigatePositionFor('Quadrocopter', eventPosition, 0)).toEqual(eventPosition)
    expect(investigatePositionFor('Quadrocopter', eventPosition, 17)).toEqual(eventPosition)
  })

  it('keeps a Fixed-Wing Drone circling at a fixed distance from the Event position', () => {
    const radiusAt0 = distanceMetersBetween(eventPosition, investigatePositionFor('FixedWingDrone', eventPosition, 0))
    const radiusAt5 = distanceMetersBetween(eventPosition, investigatePositionFor('FixedWingDrone', eventPosition, 5))

    expect(radiusAt0).toBeGreaterThan(0)
    expect(radiusAt0).toBeCloseTo(radiusAt5, 3)
  })

  it('never lets a Fixed-Wing Drone sit still while investigating (it cannot hover)', () => {
    const positionAt0 = investigatePositionFor('FixedWingDrone', eventPosition, 0)
    const positionAt5 = investigatePositionFor('FixedWingDrone', eventPosition, 5)

    expect(positionAt0).not.toEqual(positionAt5)
  })

  it('is a deterministic, closed-form function of time-since-investigation-started', () => {
    expect(investigatePositionFor('FixedWingDrone', eventPosition, 12.5)).toEqual(
      investigatePositionFor('FixedWingDrone', eventPosition, 12.5),
    )
  })
})

describe('investigateMotionFor', () => {
  it('reports zero speed and no heading for a hovering Quadrocopter', () => {
    const motion = investigateMotionFor('Quadrocopter', 17)

    expect(motion.speedMetersPerSecond).toBe(0)
    expect(motion.headingDegrees).toBeUndefined()
  })

  it('reports non-zero speed and a defined heading for a circling Fixed-Wing Drone', () => {
    const motion = investigateMotionFor('FixedWingDrone', 5)

    expect(motion.speedMetersPerSecond).toBeGreaterThan(0)
    expect(motion.headingDegrees).toBeGreaterThanOrEqual(0)
    expect(motion.headingDegrees).toBeLessThan(360)
  })

  it("gives a Fixed-Wing Drone's investigate speed matching its circle's angular speed times radius", () => {
    const motion = investigateMotionFor('FixedWingDrone', 0)

    // Same fixed circle constants used by investigatePositionFor — verified
    // independently via distance travelled over a short time interval.
    const positionAt0 = investigatePositionFor('FixedWingDrone', { lat: 64.5, lng: 26.25 }, 0)
    const positionAtDt = investigatePositionFor('FixedWingDrone', { lat: 64.5, lng: 26.25 }, 0.001)
    const impliedSpeed = distanceMetersBetween(positionAt0, positionAtDt) / 0.001

    expect(motion.speedMetersPerSecond).toBeCloseTo(impliedSpeed, 0)
  })
})
