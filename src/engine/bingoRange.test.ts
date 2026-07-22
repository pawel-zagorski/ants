import { describe, expect, it } from 'vitest'
import { FIRE_ORBIT_RADIUS_METERS, classifyFireDispatch } from './bingoRange'
import type { LatLng } from '../map/geo'
import type { BaseStation } from '../world/types'

const firePosition: LatLng = { lat: 64.5, lng: 26.25 }

const nearBaseStation: BaseStation = { id: 'base-1', type: 'BaseStation', position: { lat: 64.501, lng: 26.25 } }
const baseStations: readonly BaseStation[] = [nearBaseStation]

// A round trip is roughly: distance to fire + one orbit lap + distance back
// to the nearest Base Station. With the fire and Base Station both ~100m
// apart and a small orbit lap, a Drone starting right on top of the fire
// needs only a little more than that combined distance's worth of budget.
const orbitLapMeters = 2 * Math.PI * FIRE_ORBIT_RADIUS_METERS

describe('classifyFireDispatch', () => {
  it('classifies a Drone as "bingoRange" when its remaining budget comfortably covers fly-out + one orbit lap + fly-back', () => {
    const dronePosition: LatLng = firePosition
    const distanceToFireMeters = 0
    const distanceBackMeters = 111 // ~0.001 degrees latitude
    const roundTripMeters = distanceToFireMeters + orbitLapMeters + distanceBackMeters
    const cruiseSpeedMetersPerSecond = 20
    const remainingEnduranceSimSeconds = (roundTripMeters / cruiseSpeedMetersPerSecond) * 2 // generous margin

    const classification = classifyFireDispatch(
      { id: 'drone-1', position: dronePosition, remainingEnduranceSimSeconds, cruiseSpeedMetersPerSecond },
      firePosition,
      baseStations,
    )

    expect(classification).toBe('bingoRange')
  })

  it('classifies a Drone as "oneWayMission" when it can reach the Fire but not the round trip', () => {
    // Far enough that a full round trip (there + orbit + back) is
    // impossible, but the one-way leg alone is comfortably within budget.
    const dronePosition: LatLng = { lat: 64.5, lng: 26.3 }
    const cruiseSpeedMetersPerSecond = 10
    const remainingEnduranceSimSeconds = 300 // 3000m budget

    const classification = classifyFireDispatch(
      { id: 'drone-2', position: dronePosition, remainingEnduranceSimSeconds, cruiseSpeedMetersPerSecond },
      firePosition,
      baseStations,
    )

    expect(classification).toBe('oneWayMission')
  })

  it('classifies a Drone as "unreachable" when it cannot even reach the Fire one-way', () => {
    const dronePosition: LatLng = { lat: 64.5, lng: 27.5 } // tens of km away
    const cruiseSpeedMetersPerSecond = 10
    const remainingEnduranceSimSeconds = 10 // 100m budget — nowhere close

    const classification = classifyFireDispatch(
      { id: 'drone-3', position: dronePosition, remainingEnduranceSimSeconds, cruiseSpeedMetersPerSecond },
      firePosition,
      baseStations,
    )

    expect(classification).toBe('unreachable')
  })

  it('is a pure, deterministic function of its inputs', () => {
    const candidate = { id: 'drone-4', position: { lat: 64.51, lng: 26.26 }, remainingEnduranceSimSeconds: 500, cruiseSpeedMetersPerSecond: 12 }

    expect(classifyFireDispatch(candidate, firePosition, baseStations)).toBe(
      classifyFireDispatch(candidate, firePosition, baseStations),
    )
  })

  it('treats a Drone with no reachable Base Station as never "bingoRange" (round trip needs at least one)', () => {
    const dronePosition: LatLng = firePosition
    const cruiseSpeedMetersPerSecond = 20
    const remainingEnduranceSimSeconds = 100000 // effectively unlimited budget

    const classification = classifyFireDispatch(
      { id: 'drone-5', position: dronePosition, remainingEnduranceSimSeconds, cruiseSpeedMetersPerSecond },
      firePosition,
      [],
    )

    expect(classification).toBe('oneWayMission')
  })

  it('accepts a custom orbitRadiusMeters override instead of the FIRE_ORBIT_RADIUS_METERS default', () => {
    const dronePosition: LatLng = firePosition
    const cruiseSpeedMetersPerSecond = 20
    // Budget covers the round trip with the default orbit radius but not
    // with a much larger overridden one.
    const distanceBackMeters = 111
    const roundTripWithDefaultOrbit = orbitLapMeters + distanceBackMeters
    const remainingEnduranceSimSeconds = (roundTripWithDefaultOrbit / cruiseSpeedMetersPerSecond) * 1.1

    const withDefaultOrbit = classifyFireDispatch(
      { id: 'drone-6', position: dronePosition, remainingEnduranceSimSeconds, cruiseSpeedMetersPerSecond },
      firePosition,
      baseStations,
    )
    const withHugeOrbit = classifyFireDispatch(
      { id: 'drone-6', position: dronePosition, remainingEnduranceSimSeconds, cruiseSpeedMetersPerSecond },
      firePosition,
      baseStations,
      50000,
    )

    expect(withDefaultOrbit).toBe('bingoRange')
    expect(withHugeOrbit).not.toBe('bingoRange')
  })
})
