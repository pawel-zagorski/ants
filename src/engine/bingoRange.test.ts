import { describe, expect, it } from 'vitest'
import { classifyFireDispatch } from './bingoRange'
import type { LatLng } from '../map/geo'
import type { BaseStation } from '../world/types'

const firePosition: LatLng = { lat: 64.5, lng: 26.25 }

const nearBaseStation: BaseStation = { id: 'base-1', type: 'BaseStation', position: { lat: 64.501, lng: 26.25 } }
const baseStations: readonly BaseStation[] = [nearBaseStation]

/**
 * A representative orbit radius for tests that don't care about its exact
 * value — issue V made this a required, caller-supplied parameter (the
 * Fire's real current extent, `growthEllipse.ts`'s `fireOrbitRadiusMetersAt`)
 * rather than a fixed module constant, so every test below now passes one
 * explicitly.
 */
const TEST_ORBIT_RADIUS_METERS = 300

// A round trip is roughly: distance to fire + one orbit lap + distance back
// to the nearest Base Station. With the fire and Base Station both ~100m
// apart and a small orbit lap, a Drone starting right on top of the fire
// needs only a little more than that combined distance's worth of budget.
const orbitLapMeters = 2 * Math.PI * TEST_ORBIT_RADIUS_METERS

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
      TEST_ORBIT_RADIUS_METERS,
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
      TEST_ORBIT_RADIUS_METERS,
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
      TEST_ORBIT_RADIUS_METERS,
    )

    expect(classification).toBe('unreachable')
  })

  it('is a pure, deterministic function of its inputs', () => {
    const candidate = { id: 'drone-4', position: { lat: 64.51, lng: 26.26 }, remainingEnduranceSimSeconds: 500, cruiseSpeedMetersPerSecond: 12 }

    expect(classifyFireDispatch(candidate, firePosition, baseStations, TEST_ORBIT_RADIUS_METERS)).toBe(
      classifyFireDispatch(candidate, firePosition, baseStations, TEST_ORBIT_RADIUS_METERS),
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
      TEST_ORBIT_RADIUS_METERS,
    )

    expect(classification).toBe('oneWayMission')
  })

  it('scales the round-trip distance requirement with the given orbitRadiusMeters (issue V: caller-supplied, from the Fire\'s real extent)', () => {
    const dronePosition: LatLng = firePosition
    const cruiseSpeedMetersPerSecond = 20
    // Budget covers the round trip with a small orbit radius but not with a
    // much larger one — same fire, same Drone, only the orbit radius differs.
    const distanceBackMeters = 111
    const roundTripWithSmallOrbit = orbitLapMeters + distanceBackMeters
    const remainingEnduranceSimSeconds = (roundTripWithSmallOrbit / cruiseSpeedMetersPerSecond) * 1.1

    const withSmallOrbit = classifyFireDispatch(
      { id: 'drone-6', position: dronePosition, remainingEnduranceSimSeconds, cruiseSpeedMetersPerSecond },
      firePosition,
      baseStations,
      TEST_ORBIT_RADIUS_METERS,
    )
    const withHugeOrbit = classifyFireDispatch(
      { id: 'drone-6', position: dronePosition, remainingEnduranceSimSeconds, cruiseSpeedMetersPerSecond },
      firePosition,
      baseStations,
      50000,
    )

    expect(withSmallOrbit).toBe('bingoRange')
    expect(withHugeOrbit).not.toBe('bingoRange')
  })
})
