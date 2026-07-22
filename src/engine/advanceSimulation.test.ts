import { describe, expect, it } from 'vitest'
import { advanceSimulation, initializeSimulationState } from './advanceSimulation'
import { haversineDistanceMeters } from '../test/haversineDistanceMeters'
import { createWorldFixture } from '../test/worldFixtures'
import type { Scenario } from '../scenario/types'
import type { World } from '../world/types'
import type { SimulationState } from './types'

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

describe('Tower Detection of Fire Events', () => {
  const tower: World['towers'][number] = {
    id: 'tower-1',
    type: 'Tower',
    position: { lat: 64.7, lng: 26.2 },
    detectionRadiusMeters: 1000,
  }
  const worldWithTower: World = createWorldFixture({ towers: [tower] })

  function fireScenarioAt(position: { lat: number; lng: number }): Scenario {
    return { events: [{ id: 'fire-1', type: 'Fire', position, spawnAtSimSeconds: 0 }] }
  }

  it('detects a Fire Event just inside a Tower\'s detection radius', () => {
    // Directly north of the Tower, a few meters inside its detectionRadiusMeters
    // (comfortably clear of floating-point rounding at the exact boundary).
    const insidePosition = { lat: tower.position.lat + 990 / 111320, lng: tower.position.lng }
    const state = advanceSimulation(initializeSimulationState(worldWithTower, fireScenarioAt(insidePosition)), 0)

    expect(state.events['fire-1'].status).toBe('detected')
    expect(state.events['fire-1'].detectedByAssetId).toBe('tower-1')
  })

  it('does not detect a Fire Event just outside a Tower\'s detection radius', () => {
    const outsidePosition = { lat: tower.position.lat + 5000 / 111320, lng: tower.position.lng }
    const state = advanceSimulation(initializeSimulationState(worldWithTower, fireScenarioAt(outsidePosition)), 0)

    expect(state.events['fire-1'].status).toBe('undetected')
    expect(state.events['fire-1'].detectedByAssetId).toBeUndefined()
  })

  it('never detects a Person Sighting or Fallen Tree, regardless of distance from a Tower', () => {
    const atTowerPosition = { ...tower.position }
    const scenario: Scenario = {
      events: [
        { id: 'person-1', type: 'PersonSighting', position: atTowerPosition, spawnAtSimSeconds: 0 },
        { id: 'tree-1', type: 'FallenTree', position: atTowerPosition, spawnAtSimSeconds: 0 },
      ],
    }

    const state = advanceSimulation(initializeSimulationState(worldWithTower, scenario), 0)

    expect(state.events['person-1'].status).toBe('undetected')
    expect(state.events['tree-1'].status).toBe('undetected')
  })
})

describe('Drone Detection of any Event type', () => {
  const droneId = 'quadrocopter-1'

  function worldWithStationaryDrone(detectionRadiusMeters: number): World {
    // A Quadrocopter with patrolSpeedMetersPerSecond 0 sits at a fixed point
    // (within a negligible 1m of its Base Station) at every
    // elapsedSimSeconds, making distance checks trivial to author against a
    // fixed position.
    return createWorldFixture({
      drones: [
        {
          id: droneId,
          type: 'Quadrocopter',
          position: { lat: 64.5, lng: 26.25 },
          homeBaseStationId: 'base-1',
          patrolRadiusMeters: 1,
          patrolSpeedMetersPerSecond: 0,
          detectionRadiusMeters,
        },
      ],
    })
  }

  it.each(['Fire', 'PersonSighting', 'FallenTree'] as const)(
    'detects a %s Event once it is within its detection radius',
    (eventType) => {
      const world = worldWithStationaryDrone(1000)
      const scenario: Scenario = {
        events: [{ id: 'event-1', type: eventType, position: { lat: 64.505, lng: 26.25 }, spawnAtSimSeconds: 0 }],
      }

      const state = advanceSimulation(initializeSimulationState(world, scenario), 0)

      expect(state.events['event-1'].status).toBe('detected')
      expect(state.events['event-1'].detectedByAssetId).toBe(droneId)
    },
  )

  it('does not detect an Event outside its detection radius', () => {
    const world = worldWithStationaryDrone(100)
    const scenario: Scenario = {
      events: [{ id: 'event-1', type: 'FallenTree', position: { lat: 64.55, lng: 26.3 }, spawnAtSimSeconds: 0 }],
    }

    const state = advanceSimulation(initializeSimulationState(world, scenario), 0)

    expect(state.events['event-1'].status).toBe('undetected')
  })
})

describe('Detection is monotonic (sticky status)', () => {
  it('keeps an Event Detected even once the detecting Drone patrols back out of range', () => {
    // A tight-looping Quadrocopter passes near the Event once per orbit,
    // then flies away again — Detection must persist through that.
    const world = createWorldFixture({
      drones: [
        {
          id: 'quadrocopter-1',
          type: 'Quadrocopter',
          position: { lat: 64.5, lng: 26.25 },
          homeBaseStationId: 'base-1',
          patrolRadiusMeters: 250,
          detectionRadiusMeters: 50,
        },
      ],
    })
    // Just past the patrol loop's edge (radius 250 + a small margin), so the
    // Quadrocopter only enters its 50m detection radius once per lap, near
    // its closest approach.
    const eventPosition = { lat: 64.5 + 260 / 111320, lng: 26.25 }
    const scenario: Scenario = { events: [{ id: 'event-1', type: 'FallenTree', position: eventPosition, spawnAtSimSeconds: 0 }] }

    let state = initializeSimulationState(world, scenario)
    let becameDetectedAtSimSeconds: number | undefined
    for (let elapsedSimSeconds = 0; elapsedSimSeconds <= 400; elapsedSimSeconds += 1) {
      state = advanceSimulation(state, elapsedSimSeconds)
      if (state.events['event-1'].status === 'detected' && becameDetectedAtSimSeconds === undefined) {
        becameDetectedAtSimSeconds = elapsedSimSeconds
      }
    }

    expect(becameDetectedAtSimSeconds).toBeDefined()
    // Confirm the Quadrocopter did fly back out of the Event's detection
    // range afterward (otherwise this test wouldn't be exercising stickiness).
    const finalDistance = haversineDistanceMeters(eventPosition, state.dronePatrol['quadrocopter-1'].position)
    expect(finalDistance).toBeGreaterThan(50)
    expect(state.events['event-1'].status).toBe('detected')
    expect(state.events['event-1'].detectedByAssetId).toBe('quadrocopter-1')
  })

  it('never re-derives Detection status from scratch when replaying the same absolute elapsedSimSeconds after the Event has already been Detected', () => {
    const world = createWorldFixture({
      drones: [
        {
          id: 'quadrocopter-1',
          type: 'Quadrocopter',
          position: { lat: 64.5, lng: 26.25 },
          homeBaseStationId: 'base-1',
          patrolRadiusMeters: 1,
          patrolSpeedMetersPerSecond: 0,
          detectionRadiusMeters: 10,
        },
      ],
    })
    const scenario: Scenario = {
      events: [{ id: 'event-1', type: 'FallenTree', position: { lat: 64.5, lng: 26.25 }, spawnAtSimSeconds: 0 }],
    }

    const detected = advanceSimulation(initializeSimulationState(world, scenario), 0)
    expect(detected.events['event-1'].status).toBe('detected')

    // A hand-built incoming state where the Drone has moved far away, but
    // the Event's carried-forward status is already 'detected' — the sticky
    // merge must trust that carried-forward status, not the Drone's current
    // distance, on this tick.
    const droneFlewAway: SimulationState = {
      ...detected,
      dronePatrol: {
        'quadrocopter-1': { ...detected.dronePatrol['quadrocopter-1'], position: { lat: 65, lng: 27 } },
      },
    }

    const stillDetected = advanceSimulation(droneFlewAway, 1)
    expect(stillDetected.events['event-1'].status).toBe('detected')
    expect(stillDetected.events['event-1'].detectedByAssetId).toBe('quadrocopter-1')
  })
})

describe('Detection reproducibility', () => {
  it('replaying the same tick-by-tick sequence twice from a fresh initial state produces an identical Detection timeline', () => {
    const world = createWorldFixture({
      towers: [{ id: 'tower-1', type: 'Tower', position: { lat: 64.7, lng: 26.2 }, detectionRadiusMeters: 15000 }],
      drones: [
        {
          id: 'quadrocopter-1',
          type: 'Quadrocopter',
          position: { lat: 64.5, lng: 26.25 },
          homeBaseStationId: 'base-1',
          patrolRadiusMeters: 250,
          detectionRadiusMeters: 300,
        },
      ],
    })
    const scenario: Scenario = {
      events: [
        { id: 'fire-1', type: 'Fire', position: { lat: 64.705, lng: 26.2 }, spawnAtSimSeconds: 0 },
        { id: 'tree-1', type: 'FallenTree', position: { lat: 64.5 + 255 / 111320, lng: 26.25 }, spawnAtSimSeconds: 10 },
      ],
    }
    // Same granularity useSimulationClock actually drives the engine at:
    // many small increasing steps, not one coarse jump (a single jump could
    // miss the Quadrocopter's brief pass through the Fallen Tree's radius).
    const tickPlanSimSeconds: number[] = []
    for (let t = 0; t <= 300; t += 1) tickPlanSimSeconds.push(t)

    function replay(): SimulationState {
      let state = initializeSimulationState(world, scenario)
      for (const elapsedSimSeconds of tickPlanSimSeconds) {
        state = advanceSimulation(state, elapsedSimSeconds)
      }
      return state
    }

    const runA = replay()
    const runB = replay()

    expect(runA).toEqual(runB)
    // Sanity: this scenario is actually exercising Detection by both asset kinds.
    expect(runA.events['fire-1'].status).toBe('detected')
    expect(runA.events['fire-1'].detectedByAssetId).toBe('tower-1')
    expect(runA.events['tree-1'].status).toBe('detected')
    expect(runA.events['tree-1'].detectedByAssetId).toBe('quadrocopter-1')
  })
})
