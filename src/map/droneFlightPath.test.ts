import { describe, expect, it } from 'vitest'
import { droneFlightPathFor } from './droneFlightPath'
import { distanceMetersBetween } from './geo'
import type { LatLng } from './geo'
import type {
  DroneActivityState,
  DronePatrolState,
  EventRuntimeState,
  FireRuntimeState,
  SimulationState,
} from '../engine/types'

const BASE: LatLng = { lat: 64.5, lng: 26.25 }
const DRONE_POSITION: LatLng = { lat: 64.52, lng: 26.3 }
const EVENT_POSITION: LatLng = { lat: 64.55, lng: 26.4 }
const FIRE_POSITION: LatLng = { lat: 64.7, lng: 26.2 }

function patrolFixture(overrides: Partial<DronePatrolState> = {}): DronePatrolState {
  return {
    droneType: 'Quadrocopter',
    patrolCenter: BASE,
    patrolRadiusMeters: 250,
    angularSpeedRadiansPerSecond: 8 / 250,
    phaseOffsetRadians: 0,
    detectionRadiusMeters: 500,
    maxEnduranceSimSeconds: 7200,
    cruiseSpeedMetersPerSecond: 10,
    position: DRONE_POSITION,
    ...overrides,
  }
}

function stateFixture(
  activity: DroneActivityState,
  {
    events = {},
    fires = {},
    patrol = patrolFixture(),
  }: {
    events?: Record<string, EventRuntimeState>
    fires?: Record<string, FireRuntimeState>
    patrol?: DronePatrolState
  } = {},
): SimulationState {
  return {
    elapsedSimSeconds: 0,
    dronePatrol: { 'drone-1': patrol },
    droneActivity: { 'drone-1': activity },
    towerDetection: {},
    scenarioEvents: [],
    scenarioFireIgnitions: [],
    events,
    fires,
    wind: { directionDegrees: 90, speedMetersPerSecond: 5 },
    log: [],
  }
}

function eventFixture(): EventRuntimeState {
  return {
    id: 'event-1',
    type: 'FallenTree',
    position: EVENT_POSITION,
    status: 'detected',
    spawnAtSimSeconds: 0,
  }
}

function fireFixture(): FireRuntimeState {
  return {
    id: 'fire-1',
    position: FIRE_POSITION,
    tier: 'investigated',
    spawnAtSimSeconds: 0,
  }
}

describe('droneFlightPathFor', () => {
  it('returns nothing for a patrolling Drone', () => {
    const state = stateFixture({ mode: 'patrolling' })

    expect(droneFlightPathFor('drone-1', state)).toBeNull()
  })

  it('returns nothing for a Lost Drone (frozen — it has no destination)', () => {
    const state = stateFixture({ mode: 'lost', position: DRONE_POSITION, lostAtSimSeconds: 100 })

    expect(droneFlightPathFor('drone-1', state)).toBeNull()
  })

  it('returns a trajectory from the Drone to the Event it is investigating', () => {
    const state = stateFixture(
      { mode: 'investigating', assignedEventId: 'event-1', investigationStartedAtSimSeconds: 0 },
      { events: { 'event-1': eventFixture() } },
    )

    const path = droneFlightPathFor('drone-1', state)

    expect(path).toEqual({ kind: 'trajectory', from: DRONE_POSITION, to: EVENT_POSITION })
  })

  it('returns a trajectory to the fire orbit-entry point while travelingToFire', () => {
    const orbitRadiusMeters = 800
    const state = stateFixture(
      {
        mode: 'travelingToFire',
        assignedFireId: 'fire-1',
        departurePosition: DRONE_POSITION,
        departureSimSeconds: 0,
        missionKind: 'roundTrip',
        orbitRadiusMeters,
      },
      { fires: { 'fire-1': fireFixture() } },
    )

    const path = droneFlightPathFor('drone-1', state)

    expect(path?.kind).toBe('trajectory')
    if (path?.kind !== 'trajectory') throw new Error('expected a trajectory')
    expect(path.from).toEqual(DRONE_POSITION)
    // The destination sits on the fire's orbit circle, one orbit-radius away.
    expect(distanceMetersBetween(FIRE_POSITION, path.to)).toBeCloseTo(orbitRadiusMeters, 0)
  })

  it('returns the actual orbit (fire center + snapshotted radius) while investigatingFire', () => {
    const orbitRadiusMeters = 950
    const state = stateFixture(
      {
        mode: 'investigatingFire',
        assignedFireId: 'fire-1',
        investigationStartedAtSimSeconds: 0,
        missionKind: 'roundTrip',
        orbitRadiusMeters,
      },
      { fires: { 'fire-1': fireFixture() } },
    )

    const path = droneFlightPathFor('drone-1', state)

    expect(path).toEqual({ kind: 'orbit', center: FIRE_POSITION, radiusMeters: orbitRadiusMeters })
  })

  it('returns a trajectory back to the patrol center (home Base Station) while returningToBase', () => {
    const state = stateFixture({ mode: 'returningToBase', departurePosition: FIRE_POSITION, returnStartedAtSimSeconds: 0 })

    const path = droneFlightPathFor('drone-1', state)

    expect(path).toEqual({ kind: 'trajectory', from: DRONE_POSITION, to: BASE })
  })

  it('returns nothing when the investigated Event is missing (defensive)', () => {
    const state = stateFixture({ mode: 'investigating', assignedEventId: 'gone', investigationStartedAtSimSeconds: 0 })

    expect(droneFlightPathFor('drone-1', state)).toBeNull()
  })

  it('returns nothing when the assigned Fire is missing (defensive)', () => {
    const travelling = stateFixture({
      mode: 'travelingToFire',
      assignedFireId: 'gone',
      departurePosition: DRONE_POSITION,
      departureSimSeconds: 0,
      missionKind: 'roundTrip',
      orbitRadiusMeters: 800,
    })
    const orbiting = stateFixture({
      mode: 'investigatingFire',
      assignedFireId: 'gone',
      investigationStartedAtSimSeconds: 0,
      missionKind: 'roundTrip',
      orbitRadiusMeters: 800,
    })

    expect(droneFlightPathFor('drone-1', travelling)).toBeNull()
    expect(droneFlightPathFor('drone-1', orbiting)).toBeNull()
  })

  it('returns nothing for an unknown Drone id', () => {
    const state = stateFixture({ mode: 'patrolling' })

    expect(droneFlightPathFor('nope', state)).toBeNull()
  })
})
