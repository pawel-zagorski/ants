import { describe, expect, it } from 'vitest'
import { advanceSimulation, initializeSimulationState } from './advanceSimulation'
import { haversineDistanceMeters } from '../test/haversineDistanceMeters'
import { createWorldFixture } from '../test/worldFixtures'
import type { World } from '../world/types'

const world: World = createWorldFixture({
  drones: [
    {
      id: 'quadrocopter-1',
      type: 'Quadrocopter',
      position: { lat: 64.5, lng: 26.25 },
      homeBaseStationId: 'base-1',
    },
    {
      id: 'fixed-wing-1',
      type: 'FixedWingDrone',
      position: { lat: 64.5, lng: 26.25 },
      homeBaseStationId: 'base-1',
    },
  ],
})

describe('initializeSimulationState', () => {
  it('creates one patrol entry per Drone, keyed by Drone id', () => {
    const state = initializeSimulationState(world)

    expect(Object.keys(state.dronePatrol).sort()).toEqual(['fixed-wing-1', 'quadrocopter-1'])
    expect(state.elapsedSimSeconds).toBe(0)
  })

  it('centers each Drone patrol on its home Base Station', () => {
    const state = initializeSimulationState(world)

    for (const droneId of ['quadrocopter-1', 'fixed-wing-1']) {
      expect(state.dronePatrol[droneId].patrolCenter).toEqual({ lat: 64.5, lng: 26.25 })
    }
  })
})

describe('initializeSimulationState patrol parameter overrides', () => {
  it("uses a Drone's own patrolRadiusMeters/patrolSpeedMetersPerSecond from the World when provided, instead of the DroneType default", () => {
    const worldWithOverride: World = {
      ...world,
      drones: [
        {
          id: 'quadrocopter-1',
          type: 'Quadrocopter',
          position: { lat: 64.5, lng: 26.25 },
          homeBaseStationId: 'base-1',
          patrolRadiusMeters: 999,
          patrolSpeedMetersPerSecond: 3,
        },
      ],
    }

    const state = initializeSimulationState(worldWithOverride)

    expect(state.dronePatrol['quadrocopter-1'].patrolRadiusMeters).toBe(999)
    expect(state.dronePatrol['quadrocopter-1'].angularSpeedRadiansPerSecond).toBeCloseTo(3 / 999)
  })
})

describe('advanceSimulation', () => {
  it('is pure: does not mutate the state object passed in', () => {
    const state = initializeSimulationState(world)
    const snapshotBefore = JSON.parse(JSON.stringify(state))

    advanceSimulation(state, 500)

    expect(state).toEqual(snapshotBefore)
  })

  it('is deterministic: calling it twice with the same state and elapsedSimSeconds returns identical Drone positions', () => {
    const state = initializeSimulationState(world)

    const resultA = advanceSimulation(state, 137)
    const resultB = advanceSimulation(state, 137)

    expect(resultA).toEqual(resultB)
  })

  it('is deterministic end-to-end: running the same World for the same elapsed simulated time twice (fresh initial state each time) produces identical Drone positions', () => {
    const runA = advanceSimulation(initializeSimulationState(world), 4321)
    const runB = advanceSimulation(initializeSimulationState(world), 4321)

    expect(runA).toEqual(runB)
  })

  it('moves Drones over simulated time (positions differ from the initial state)', () => {
    const state = initializeSimulationState(world)

    const advanced = advanceSimulation(state, 50)

    expect(advanced.dronePatrol['quadrocopter-1'].position).not.toEqual(state.dronePatrol['quadrocopter-1'].position)
    expect(advanced.dronePatrol['fixed-wing-1'].position).not.toEqual(state.dronePatrol['fixed-wing-1'].position)
  })

  it('keeps a Quadrocopter within a tight radius of its home Base Station at all times', () => {
    const state = initializeSimulationState(world)
    const baseStation = world.baseStations[0]
    const quadrocopterRadiusMeters = state.dronePatrol['quadrocopter-1'].patrolRadiusMeters

    for (const elapsedSimSeconds of [0, 10, 137, 500, 4000]) {
      const advanced = advanceSimulation(state, elapsedSimSeconds)
      const distanceFromBase = haversineDistanceMeters(
        baseStation.position,
        advanced.dronePatrol['quadrocopter-1'].position,
      )
      expect(distanceFromBase).toBeLessThanOrEqual(quadrocopterRadiusMeters + 1)
    }
  })

  it('gives a Fixed-Wing Drone a larger patrol radius than a Quadrocopter from the same Base Station', () => {
    const state = initializeSimulationState(world)

    expect(state.dronePatrol['fixed-wing-1'].patrolRadiusMeters).toBeGreaterThan(
      state.dronePatrol['quadrocopter-1'].patrolRadiusMeters,
    )
  })

  it('moves a Fixed-Wing Drone at a visibly higher linear speed than a Quadrocopter', () => {
    const state = initializeSimulationState(world)
    const dtSeconds = 1

    const t0 = advanceSimulation(state, 1000)
    const t1 = advanceSimulation(state, 1000 + dtSeconds)

    const quadrocopterStepMeters = haversineDistanceMeters(
      t0.dronePatrol['quadrocopter-1'].position,
      t1.dronePatrol['quadrocopter-1'].position,
    )
    const fixedWingStepMeters = haversineDistanceMeters(
      t0.dronePatrol['fixed-wing-1'].position,
      t1.dronePatrol['fixed-wing-1'].position,
    )

    expect(fixedWingStepMeters).toBeGreaterThan(quadrocopterStepMeters * 2)
  })

  it('returns a Drone to (approximately) the same position after one full patrol loop period', () => {
    const state = initializeSimulationState(world)
    const angularSpeed = state.dronePatrol['quadrocopter-1'].angularSpeedRadiansPerSecond
    const periodSeconds = (2 * Math.PI) / angularSpeed

    const start = advanceSimulation(state, 1000)
    const afterOneLoop = advanceSimulation(state, 1000 + periodSeconds)

    const driftMeters = haversineDistanceMeters(
      start.dronePatrol['quadrocopter-1'].position,
      afterOneLoop.dronePatrol['quadrocopter-1'].position,
    )
    expect(driftMeters).toBeLessThan(1)
  })
})
