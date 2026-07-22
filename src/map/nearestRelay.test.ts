import { describe, expect, it } from 'vitest'
import { findNearestRelay } from './nearestRelay'
import type { Relay } from '../world/types'

const tower: Relay = { id: 'tower-1', type: 'Tower', position: { lat: 64.7, lng: 26.2 }, detectionRadiusMeters: 15000 }
const nearBaseStation: Relay = { id: 'base-1', type: 'BaseStation', position: { lat: 64.5, lng: 26.25 } }
const farBaseStation: Relay = { id: 'base-2', type: 'BaseStation', position: { lat: 64.62, lng: 26.7 } }

describe('findNearestRelay', () => {
  it('picks the closest Relay by straight-line distance out of Towers and Base Stations combined', () => {
    const dronePosition = { lat: 64.501, lng: 26.251 }

    const nearest = findNearestRelay(dronePosition, [tower, nearBaseStation, farBaseStation])

    expect(nearest?.relay.id).toBe('base-1')
  })

  it('reports the distance to the chosen Relay, matching an independent distance calculation', () => {
    const dronePosition = { lat: 64.501, lng: 26.251 }

    const nearest = findNearestRelay(dronePosition, [nearBaseStation])

    // Known offset from base-1 (64.5, 26.25): ~0.001 deg lat (111.32m) and
    // ~0.001 deg lng (111.32 * cos(64.5deg) =~ 47.8m) — Pythagorean distance.
    expect(nearest?.distanceMeters).toBeCloseTo(Math.sqrt(111.32 ** 2 + 47.8 ** 2), 0)
  })

  it('switches its pick when the Drone is nearer a different Relay', () => {
    const nearFarBaseStationPosition = { lat: 64.619, lng: 26.699 }

    const nearest = findNearestRelay(nearFarBaseStationPosition, [tower, nearBaseStation, farBaseStation])

    expect(nearest?.relay.id).toBe('base-2')
  })

  it('returns undefined when there are no Relays at all', () => {
    const nearest = findNearestRelay({ lat: 64.5, lng: 26.25 }, [])

    expect(nearest).toBeUndefined()
  })
})
