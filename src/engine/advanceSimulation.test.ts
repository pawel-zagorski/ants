import { describe, expect, it } from 'vitest'
import { advanceSimulation, initializeSimulationState } from './advanceSimulation'
import { haversineDistanceMeters } from '../test/haversineDistanceMeters'
import { createWorldFixture } from '../test/worldFixtures'
import type { Scenario } from '../scenario/types'
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

const emptyScenario: Scenario = { events: [] }

describe('initializeSimulationState', () => {
  it('creates one patrol entry per Drone, keyed by Drone id', () => {
    const state = initializeSimulationState(world, emptyScenario)

    expect(Object.keys(state.dronePatrol).sort()).toEqual(['fixed-wing-1', 'quadrocopter-1'])
    expect(state.elapsedSimSeconds).toBe(0)
  })

  it('centers each Drone patrol on its home Base Station', () => {
    const state = initializeSimulationState(world, emptyScenario)

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

    const state = initializeSimulationState(worldWithOverride, emptyScenario)

    expect(state.dronePatrol['quadrocopter-1'].patrolRadiusMeters).toBe(999)
    expect(state.dronePatrol['quadrocopter-1'].angularSpeedRadiansPerSecond).toBeCloseTo(3 / 999)
  })
})

describe('advanceSimulation', () => {
  it('is pure: does not mutate the state object passed in', () => {
    const state = initializeSimulationState(world, emptyScenario)
    const snapshotBefore = JSON.parse(JSON.stringify(state))

    advanceSimulation(state, 500)

    expect(state).toEqual(snapshotBefore)
  })

  it('is deterministic: calling it twice with the same state and elapsedSimSeconds returns identical Drone positions', () => {
    const state = initializeSimulationState(world, emptyScenario)

    const resultA = advanceSimulation(state, 137)
    const resultB = advanceSimulation(state, 137)

    expect(resultA).toEqual(resultB)
  })

  it('is deterministic end-to-end: running the same World for the same elapsed simulated time twice (fresh initial state each time) produces identical Drone positions', () => {
    const runA = advanceSimulation(initializeSimulationState(world, emptyScenario), 4321)
    const runB = advanceSimulation(initializeSimulationState(world, emptyScenario), 4321)

    expect(runA).toEqual(runB)
  })

  it('moves Drones over simulated time (positions differ from the initial state)', () => {
    const state = initializeSimulationState(world, emptyScenario)

    const advanced = advanceSimulation(state, 50)

    expect(advanced.dronePatrol['quadrocopter-1'].position).not.toEqual(state.dronePatrol['quadrocopter-1'].position)
    expect(advanced.dronePatrol['fixed-wing-1'].position).not.toEqual(state.dronePatrol['fixed-wing-1'].position)
  })

  it('keeps a Quadrocopter within a tight radius of its home Base Station at all times', () => {
    const state = initializeSimulationState(world, emptyScenario)
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
    const state = initializeSimulationState(world, emptyScenario)

    expect(state.dronePatrol['fixed-wing-1'].patrolRadiusMeters).toBeGreaterThan(
      state.dronePatrol['quadrocopter-1'].patrolRadiusMeters,
    )
  })

  it('moves a Fixed-Wing Drone at a visibly higher linear speed than a Quadrocopter', () => {
    const state = initializeSimulationState(world, emptyScenario)
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
    const state = initializeSimulationState(world, emptyScenario)
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

describe('Event spawning', () => {
  const worldWithNoDrones: World = createWorldFixture()

  const scenario: Scenario = {
    events: [
      {
        id: 'event-1',
        type: 'FallenTree',
        position: { lat: 64.55, lng: 26.3 },
        spawnAtSimSeconds: 100,
      },
      {
        id: 'event-2',
        type: 'Fire',
        position: { lat: 64.6, lng: 26.4 },
        spawnAtSimSeconds: 200,
        durationSimSeconds: 600,
      },
    ],
  }

  it('does not include an Event in state.events before its spawnAtSimSeconds', () => {
    const state = advanceSimulation(initializeSimulationState(worldWithNoDrones, scenario), 99)

    expect(state.events['event-1']).toBeUndefined()
  })

  it('includes an Event in state.events at exactly its spawnAtSimSeconds', () => {
    const state = advanceSimulation(initializeSimulationState(worldWithNoDrones, scenario), 100)

    expect(state.events['event-1']).toBeDefined()
  })

  it('includes an Event in state.events after its spawnAtSimSeconds, at its scripted position', () => {
    const state = advanceSimulation(initializeSimulationState(worldWithNoDrones, scenario), 150)

    expect(state.events['event-1']).toEqual({
      id: 'event-1',
      type: 'FallenTree',
      position: { lat: 64.55, lng: 26.3 },
      status: 'undetected',
      spawnAtSimSeconds: 100,
    })
  })

  it('only spawns Events whose spawnAtSimSeconds has been reached, leaving later Events out entirely', () => {
    const state = advanceSimulation(initializeSimulationState(worldWithNoDrones, scenario), 150)

    expect(Object.keys(state.events)).toEqual(['event-1'])
  })

  it('spawns every Event whose time has passed once elapsedSimSeconds reaches it, carrying durationSimSeconds through', () => {
    const state = advanceSimulation(initializeSimulationState(worldWithNoDrones, scenario), 250)

    expect(Object.keys(state.events).sort()).toEqual(['event-1', 'event-2'])
    expect(state.events['event-2'].durationSimSeconds).toBe(600)
  })

  it('gives every spawned Event "undetected" status (no Detection logic exists yet)', () => {
    const state = advanceSimulation(initializeSimulationState(worldWithNoDrones, scenario), 250)

    expect(state.events['event-1'].status).toBe('undetected')
    expect(state.events['event-2'].status).toBe('undetected')
  })

  it('is deterministic: the same Scenario + elapsedSimSeconds always spawns the same set of Events', () => {
    const runA = advanceSimulation(initializeSimulationState(worldWithNoDrones, scenario), 250)
    const runB = advanceSimulation(initializeSimulationState(worldWithNoDrones, scenario), 250)

    expect(runA.events).toEqual(runB.events)
  })
})
