import { describe, expect, it } from 'vitest'
import { advanceSimulation, canReturnDroneToBase, initializeSimulationState, withManualReturnToBase } from './advanceSimulation'
import { distanceMetersBetween, interpolateLatLng, type LatLng } from '../map/geo'
import { haversineDistanceMeters } from '../test/haversineDistanceMeters'
import { createWorldFixture, droneSpecFixture, windFixture } from '../test/worldFixtures'
import type { Scenario } from '../scenario/types'
import type { World } from '../world/types'
import type { DroneActivityState, SimulationState } from './types'

const emptyScenario: Scenario = { events: [], wind: windFixture }

/** The Base Station the fixture homes every Drone at (see `createWorldFixture`). */
const BASE_POSITION: LatLng = { lat: 64.5, lng: 26.25 }
/** A far-away recall target so the return flight has a non-trivial duration. */
const FAR_TARGET: LatLng = { lat: 64.6, lng: 26.25 }

function worldWithQuadrocopter(maxEnduranceSimSeconds: number): World {
  return createWorldFixture({
    drones: [
      {
        id: 'drone-1',
        type: 'Quadrocopter',
        position: BASE_POSITION,
        homeBaseStationId: 'base-1',
        ...droneSpecFixture,
        maxEnduranceSimSeconds,
        cruiseSpeedMetersPerSecond: 10,
      },
    ],
  })
}

describe('canReturnDroneToBase', () => {
  it('allows a patrolling, missing, or Event-investigating Drone', () => {
    expect(canReturnDroneToBase(undefined)).toBe(true)
    expect(canReturnDroneToBase({ mode: 'patrolling' })).toBe(true)
    expect(
      canReturnDroneToBase({ mode: 'investigating', assignedEventId: 'e1', investigationStartedAtSimSeconds: 0 }),
    ).toBe(true)
  })

  it('allows a round-trip Fire mission but not a one-way one', () => {
    const travelingRoundTrip: DroneActivityState = {
      mode: 'travelingToFire',
      assignedFireId: 'fire-1',
      departurePosition: BASE_POSITION,
      departureSimSeconds: 0,
      missionKind: 'roundTrip',
      orbitRadiusMeters: 300,
    }
    const investigatingOneWay: DroneActivityState = {
      mode: 'investigatingFire',
      assignedFireId: 'fire-1',
      investigationStartedAtSimSeconds: 0,
      missionKind: 'oneWay',
      orbitRadiusMeters: 300,
    }

    expect(canReturnDroneToBase(travelingRoundTrip)).toBe(true)
    expect(canReturnDroneToBase({ ...travelingRoundTrip, missionKind: 'oneWay' })).toBe(false)
    expect(canReturnDroneToBase({ ...investigatingOneWay, missionKind: 'roundTrip' })).toBe(true)
    expect(canReturnDroneToBase(investigatingOneWay)).toBe(false)
  })

  it('does not allow a Drone already heading home or in a terminal state', () => {
    expect(
      canReturnDroneToBase({ mode: 'returningToBase', departurePosition: BASE_POSITION, returnStartedAtSimSeconds: 0 }),
    ).toBe(false)
    expect(
      canReturnDroneToBase({
        mode: 'returningToStation',
        targetPosition: BASE_POSITION,
        departurePosition: FAR_TARGET,
        returnStartedAtSimSeconds: 0,
      }),
    ).toBe(false)
    expect(canReturnDroneToBase({ mode: 'grounded', position: BASE_POSITION, groundedAtSimSeconds: 0 })).toBe(false)
    expect(canReturnDroneToBase({ mode: 'lost', position: FAR_TARGET, lostAtSimSeconds: 0 })).toBe(false)
  })
})

describe('withManualReturnToBase', () => {
  function stateAtDronePosition(dronePosition: LatLng, activity: DroneActivityState): SimulationState {
    const base = initializeSimulationState(worldWithQuadrocopter(7200), emptyScenario)
    return {
      ...base,
      dronePatrol: { 'drone-1': { ...base.dronePatrol['drone-1'], position: dronePosition } },
      droneActivity: { 'drone-1': activity },
    }
  }

  it('recalls an eligible Drone to the given target, departing from its current position', () => {
    const state = stateAtDronePosition(FAR_TARGET, { mode: 'patrolling' })

    const recalled = withManualReturnToBase(state, 'drone-1', BASE_POSITION)

    expect(recalled.droneActivity['drone-1']).toEqual({
      mode: 'returningToStation',
      targetPosition: BASE_POSITION,
      departurePosition: FAR_TARGET,
      returnStartedAtSimSeconds: state.elapsedSimSeconds,
    })
  })

  it('abandons an in-progress Event investigation when recalled', () => {
    const state = stateAtDronePosition(FAR_TARGET, {
      mode: 'investigating',
      assignedEventId: 'person-1',
      investigationStartedAtSimSeconds: 0,
    })

    const recalled = withManualReturnToBase(state, 'drone-1', BASE_POSITION)

    expect(recalled.droneActivity['drone-1'].mode).toBe('returningToStation')
  })

  it('is a no-op for an ineligible (One-Way Mission) Drone', () => {
    const state = stateAtDronePosition(FAR_TARGET, {
      mode: 'investigatingFire',
      assignedFireId: 'fire-1',
      investigationStartedAtSimSeconds: 0,
      missionKind: 'oneWay',
      orbitRadiusMeters: 300,
    })

    expect(withManualReturnToBase(state, 'drone-1', BASE_POSITION)).toBe(state)
  })

  it('is a no-op for an unknown Drone id', () => {
    const state = stateAtDronePosition(FAR_TARGET, { mode: 'patrolling' })

    expect(withManualReturnToBase(state, 'no-such-drone', BASE_POSITION)).toBe(state)
  })
})

describe('return-to-base flight (advanceSimulation)', () => {
  const returnDistanceMeters = distanceMetersBetween(FAR_TARGET, BASE_POSITION)
  const returnDurationSimSeconds = returnDistanceMeters / 10 // cruiseSpeedMetersPerSecond

  function recalledFromFarTarget(maxEnduranceSimSeconds: number): SimulationState {
    const base = initializeSimulationState(worldWithQuadrocopter(maxEnduranceSimSeconds), emptyScenario)
    const atFarTarget: SimulationState = {
      ...base,
      dronePatrol: { 'drone-1': { ...base.dronePatrol['drone-1'], position: FAR_TARGET } },
    }
    return withManualReturnToBase(atFarTarget, 'drone-1', BASE_POSITION)
  }

  it('is still returning, part-way along the leg, before it arrives', () => {
    const recalled = recalledFromFarTarget(7200)
    const midFlight = advanceSimulation(recalled, returnDurationSimSeconds / 2)

    expect(midFlight.droneActivity['drone-1'].mode).toBe('returningToStation')
    const expected = interpolateLatLng(FAR_TARGET, BASE_POSITION, 0.5)
    expect(haversineDistanceMeters(midFlight.dronePatrol['drone-1'].position, expected)).toBeLessThan(50)
  })

  it('Grounds at the target Base Station once the leg completes', () => {
    const recalled = recalledFromFarTarget(7200)
    const arrived = advanceSimulation(recalled, returnDurationSimSeconds + 1)

    const activity = arrived.droneActivity['drone-1']
    expect(activity.mode).toBe('grounded')
    if (activity.mode === 'grounded') {
      expect(haversineDistanceMeters(activity.position, BASE_POSITION)).toBeLessThan(1)
    }
    expect(haversineDistanceMeters(arrived.dronePatrol['drone-1'].position, BASE_POSITION)).toBeLessThan(1)
  })

  it('stays Grounded (frozen at base) on subsequent ticks', () => {
    const recalled = recalledFromFarTarget(7200)
    const arrived = advanceSimulation(recalled, returnDurationSimSeconds + 1)
    const later = advanceSimulation(arrived, returnDurationSimSeconds + 500)

    expect(later.droneActivity['drone-1'].mode).toBe('grounded')
    expect(later.dronePatrol['drone-1'].position).toEqual(arrived.dronePatrol['drone-1'].position)
  })

  it('becomes Lost where it runs out if endurance cannot cover the return leg', () => {
    // maxEndurance below the full return duration, so it can never make it home.
    const shortEndurance = Math.floor(returnDurationSimSeconds / 2)
    const recalled = recalledFromFarTarget(shortEndurance)
    const exhausted = advanceSimulation(recalled, returnDurationSimSeconds)

    const activity = exhausted.droneActivity['drone-1']
    expect(activity.mode).toBe('lost')
    if (activity.mode === 'lost') {
      expect(activity.lostAtSimSeconds).toBe(shortEndurance)
      const expected = interpolateLatLng(FAR_TARGET, BASE_POSITION, shortEndurance / returnDurationSimSeconds)
      expect(haversineDistanceMeters(activity.position, expected)).toBeLessThan(50)
    }
  })
})
