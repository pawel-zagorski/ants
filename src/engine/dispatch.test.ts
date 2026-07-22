import { describe, expect, it } from 'vitest'
import { investigatePositionFor, selectNearestAvailableDrone } from './dispatch'
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
