import { describe, expect, it } from 'vitest'
import { advanceSimulation, initializeSimulationState, withManualDispatch } from './advanceSimulation'
import { INVESTIGATION_DURATION_SIM_SECONDS } from './dispatch'
import { haversineDistanceMeters } from '../test/haversineDistanceMeters'
import { createWorldFixture, droneSpecFixture } from '../test/worldFixtures'
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
      ...droneSpecFixture,
    },
    {
      id: 'fixed-wing-1',
      type: 'FixedWingDrone',
      position: { lat: 64.5, lng: 26.25 },
      homeBaseStationId: 'base-1',
      ...droneSpecFixture,
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
          ...droneSpecFixture,
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
          ...droneSpecFixture,
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
          ...droneSpecFixture,
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
          ...droneSpecFixture,
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
          ...droneSpecFixture,
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

describe('Drone dispatch/investigate behavior (issue F)', () => {
  // A Tower sitting right on top of the Fire Event so Detection happens
  // regardless of either Drone's position — isolates "which Drone gets
  // dispatched" from "which asset made the Detection".
  const eventPosition = { lat: 64.55, lng: 26.25 }
  const towerAtEvent: World['towers'][number] = {
    id: 'tower-1',
    type: 'Tower',
    position: eventPosition,
    detectionRadiusMeters: 10,
  }

  function worldWithTwoStationaryDrones(): World {
    return createWorldFixture({
      towers: [towerAtEvent],
      baseStations: [
        { id: 'base-near', type: 'BaseStation', position: { lat: 64.5505, lng: 26.25 } }, // ~55m from the Event
        { id: 'base-far', type: 'BaseStation', position: { lat: 64.65, lng: 26.25 } }, // ~11.1km from the Event
      ],
      drones: [
        {
          id: 'drone-far',
          type: 'Quadrocopter',
          position: { lat: 64.65, lng: 26.25 },
          homeBaseStationId: 'base-far',
          ...droneSpecFixture,
          patrolRadiusMeters: 1,
          patrolSpeedMetersPerSecond: 0,
        },
        {
          id: 'drone-near',
          type: 'Quadrocopter',
          position: { lat: 64.5505, lng: 26.25 },
          homeBaseStationId: 'base-near',
          ...droneSpecFixture,
          patrolRadiusMeters: 1,
          patrolSpeedMetersPerSecond: 0,
        },
      ],
    })
  }

  function fireScenario(): Scenario {
    return { events: [{ id: 'fire-1', type: 'Fire', position: eventPosition, spawnAtSimSeconds: 0 }] }
  }

  it('dispatches exactly one eligible Drone — the nearest available one — on a new Detection', () => {
    const state = advanceSimulation(initializeSimulationState(worldWithTwoStationaryDrones(), fireScenario()), 0)

    expect(state.events['fire-1'].status).toBe('detected')
    expect(state.droneActivity['drone-near']).toMatchObject({ mode: 'investigating', assignedEventId: 'fire-1' })
    expect(state.droneActivity['drone-far']).toEqual({ mode: 'patrolling' })
  })

  it('moves the dispatched Drone toward (onto) the Event position, away from its patrol loop', () => {
    const state = advanceSimulation(initializeSimulationState(worldWithTwoStationaryDrones(), fireScenario()), 0)

    expect(state.dronePatrol['drone-near'].position).toEqual(eventPosition)
  })

  it('holds a dispatched Quadrocopter exactly over the Event position for the whole investigation', () => {
    let state = initializeSimulationState(worldWithTwoStationaryDrones(), fireScenario())

    for (let elapsedSimSeconds = 0; elapsedSimSeconds <= INVESTIGATION_DURATION_SIM_SECONDS - 1; elapsedSimSeconds += 5) {
      state = advanceSimulation(state, elapsedSimSeconds)
      expect(state.dronePatrol['drone-near'].position).toEqual(eventPosition)
      expect(state.droneActivity['drone-near']).toMatchObject({ mode: 'investigating', assignedEventId: 'fire-1' })
    }
  })

  it('circles a dispatched Fixed-Wing Drone around the Event instead of hovering, since it cannot hover', () => {
    const world = createWorldFixture({
      towers: [towerAtEvent],
      baseStations: [{ id: 'base-near', type: 'BaseStation', position: { lat: 64.5505, lng: 26.25 } }],
      drones: [
        {
          id: 'fixed-wing-1',
          type: 'FixedWingDrone',
          position: { lat: 64.5505, lng: 26.25 },
          homeBaseStationId: 'base-near',
          ...droneSpecFixture,
          patrolRadiusMeters: 1,
          patrolSpeedMetersPerSecond: 0,
        },
      ],
    })

    let state = initializeSimulationState(world, fireScenario())
    state = advanceSimulation(state, 0)
    expect(state.droneActivity['fixed-wing-1']).toMatchObject({ mode: 'investigating', assignedEventId: 'fire-1' })
    const positionAtDispatch = state.dronePatrol['fixed-wing-1'].position

    state = advanceSimulation(state, 5)
    const positionFiveSecondsIn = state.dronePatrol['fixed-wing-1'].position

    // Still investigating the same Event, but visibly circling rather than
    // sitting still — a Fixed-Wing Drone cannot hover.
    expect(state.droneActivity['fixed-wing-1']).toMatchObject({ mode: 'investigating', assignedEventId: 'fire-1' })
    expect(positionFiveSecondsIn).not.toEqual(positionAtDispatch)
    expect(positionFiveSecondsIn).not.toEqual(eventPosition)
    expect(haversineDistanceMeters(eventPosition, positionFiveSecondsIn)).toBeLessThan(1000)
  })

  it('returns the Drone to its normal patrol behavior once the investigation interval elapses', () => {
    // A real (non-degenerate) patrol loop for the dispatched Drone, so
    // "resumed patrolling" is distinguishable from "still hovering at the
    // Event" — compared against an undisturbed twin World with no Scenario
    // at all (so it never gets dispatched) as the independent expectation.
    const baseStations: World['baseStations'] = [
      { id: 'base-near', type: 'BaseStation', position: { lat: 64.5505, lng: 26.25 } },
    ]
    const dispatchedDrone: World['drones'][number] = {
      id: 'drone-near',
      type: 'Quadrocopter',
      position: { lat: 64.5505, lng: 26.25 },
      homeBaseStationId: 'base-near',
      ...droneSpecFixture,
      patrolRadiusMeters: 250,
      patrolSpeedMetersPerSecond: 8,
    }
    const world = createWorldFixture({ towers: [towerAtEvent], baseStations, drones: [dispatchedDrone] })
    const undisturbedTwin = createWorldFixture({ towers: [], baseStations, drones: [dispatchedDrone] })

    let state = initializeSimulationState(world, fireScenario())
    for (let elapsedSimSeconds = 0; elapsedSimSeconds <= INVESTIGATION_DURATION_SIM_SECONDS; elapsedSimSeconds += 1) {
      state = advanceSimulation(state, elapsedSimSeconds)
    }

    expect(state.droneActivity['drone-near']).toEqual({ mode: 'patrolling' })

    const afterReturn = advanceSimulation(state, INVESTIGATION_DURATION_SIM_SECONDS + 40)
    const expectedUndisturbedPosition = advanceSimulation(
      initializeSimulationState(undisturbedTwin, { events: [] }),
      INVESTIGATION_DURATION_SIM_SECONDS + 40,
    ).dronePatrol['drone-near'].position

    expect(afterReturn.dronePatrol['drone-near'].position).toEqual(expectedUndisturbedPosition)
  })

  it('leaves a Detection standing with no dispatch (and no crash) when no Drone is available', () => {
    const world = createWorldFixture({
      towers: [
        towerAtEvent,
        { id: 'tower-2', type: 'Tower', position: { lat: 64.6, lng: 26.3 }, detectionRadiusMeters: 10 },
      ],
      drones: [
        {
          id: 'only-drone',
          type: 'Quadrocopter',
          position: { lat: 64.5505, lng: 26.25 },
          homeBaseStationId: 'base-1',
          ...droneSpecFixture,
          patrolRadiusMeters: 1,
          patrolSpeedMetersPerSecond: 0,
        },
      ],
    })
    const scenario: Scenario = {
      events: [
        { id: 'fire-1', type: 'Fire', position: eventPosition, spawnAtSimSeconds: 0 },
        { id: 'fire-2', type: 'Fire', position: { lat: 64.6, lng: 26.3 }, spawnAtSimSeconds: 0 },
      ],
    }

    expect(() => advanceSimulation(initializeSimulationState(world, scenario), 0)).not.toThrow()
    const state = advanceSimulation(initializeSimulationState(world, scenario), 0)

    // Deterministic id order means fire-1 claims the only Drone; fire-2
    // still stands Detected with no Drone assigned.
    expect(state.events['fire-1'].status).toBe('detected')
    expect(state.events['fire-2'].status).toBe('detected')
    expect(state.droneActivity['only-drone']).toMatchObject({ assignedEventId: 'fire-1' })
  })

  it('does not retry dispatch on a later tick for a Fire whose one dispatch opportunity found no Drone available', () => {
    // The only Drone's patrol loop is centered right on an earlier,
    // unrelated Fire, so it's already investigating that Fire at the
    // moment fire-1 is Detected — fire-1's one dispatch opportunity finds
    // no Drone free. (Both fixture Events here are Fires — the only
    // Event type still auto-dispatched, per ADR-0005/issue O — rather than
    // a Fire + a Person Sighting/Fallen Tree, which would no longer
    // compete for the same Drone at all.)
    const earlierEventPosition = { lat: 64.7, lng: 26.4 }
    const world = createWorldFixture({
      towers: [towerAtEvent],
      baseStations: [{ id: 'base-1', type: 'BaseStation', position: earlierEventPosition }],
      drones: [
        {
          id: 'only-drone',
          type: 'Quadrocopter',
          position: earlierEventPosition,
          homeBaseStationId: 'base-1',
          ...droneSpecFixture,
          patrolRadiusMeters: 1,
          patrolSpeedMetersPerSecond: 0,
        },
      ],
    })
    const scenario: Scenario = {
      events: [
        { id: 'earlier-fire', type: 'Fire', position: earlierEventPosition, spawnAtSimSeconds: 0 },
        { id: 'fire-1', type: 'Fire', position: eventPosition, spawnAtSimSeconds: 0 },
      ],
    }

    let state = initializeSimulationState(world, scenario)
    expect(state.droneActivity['only-drone']).toMatchObject({ assignedEventId: 'earlier-fire' })
    expect(state.events['fire-1'].status).toBe('detected')

    // Advance well past the point the Drone finishes investigating
    // earlier-event and becomes available again.
    for (let elapsedSimSeconds = 1; elapsedSimSeconds <= INVESTIGATION_DURATION_SIM_SECONDS + 40; elapsedSimSeconds += 1) {
      state = advanceSimulation(state, elapsedSimSeconds)
    }

    expect(state.droneActivity['only-drone']).toEqual({ mode: 'patrolling' })
    // fire-1's one dispatch opportunity already passed with nothing
    // available — it must not retroactively claim the now-free Drone.
    expect(state.droneActivity['only-drone']).not.toMatchObject({ assignedEventId: 'fire-1' })
  })

  it('is deterministic: two Events newly Detected in the same tick are dispatched in a stable, id-sorted order', () => {
    const world = createWorldFixture({
      towers: [
        { id: 'tower-a', type: 'Tower', position: { lat: 64.55, lng: 26.25 }, detectionRadiusMeters: 10 },
        { id: 'tower-b', type: 'Tower', position: { lat: 64.5505, lng: 26.2505 }, detectionRadiusMeters: 10 },
      ],
      drones: [
        {
          id: 'only-drone',
          type: 'Quadrocopter',
          position: { lat: 64.55, lng: 26.2503 },
          homeBaseStationId: 'base-1',
          ...droneSpecFixture,
          patrolRadiusMeters: 1,
          patrolSpeedMetersPerSecond: 0,
        },
      ],
    })
    const scenario: Scenario = {
      events: [
        { id: 'event-a', type: 'Fire', position: { lat: 64.55, lng: 26.25 }, spawnAtSimSeconds: 0 },
        { id: 'event-b', type: 'Fire', position: { lat: 64.5505, lng: 26.2505 }, spawnAtSimSeconds: 0 },
      ],
    }

    const state = advanceSimulation(initializeSimulationState(world, scenario), 0)

    expect(state.events['event-a'].status).toBe('detected')
    expect(state.events['event-b'].status).toBe('detected')
    // Lower id (event-a) is processed first and claims the only Drone.
    expect(state.droneActivity['only-drone']).toMatchObject({ assignedEventId: 'event-a' })
  })

  it('is reproducible: replaying the same tick-by-tick sequence twice produces an identical dispatch/investigate timeline', () => {
    function replay(): SimulationState {
      let state = initializeSimulationState(worldWithTwoStationaryDrones(), fireScenario())
      for (let elapsedSimSeconds = 1; elapsedSimSeconds <= INVESTIGATION_DURATION_SIM_SECONDS + 40; elapsedSimSeconds += 1) {
        state = advanceSimulation(state, elapsedSimSeconds)
      }
      return state
    }

    const runA = replay()
    const runB = replay()

    expect(runA).toEqual(runB)
  })
})

describe('Manual dispatch retires auto-dispatch for Person Sighting/Fallen Tree (issue O, ADR-0005)', () => {
  // A stationary Drone sitting right on top of the Event position, so if
  // auto-dispatch fired it would be the obvious (only) candidate — isolates
  // "did dispatch happen at all" from "which Drone would have been picked".
  const eventPosition = { lat: 64.55, lng: 26.25 }

  function worldWithOneStationaryDrone(): World {
    return createWorldFixture({
      baseStations: [{ id: 'base-1', type: 'BaseStation', position: eventPosition }],
      drones: [
        {
          id: 'only-drone',
          type: 'Quadrocopter',
          position: eventPosition,
          homeBaseStationId: 'base-1',
          ...droneSpecFixture,
          patrolRadiusMeters: 1,
          patrolSpeedMetersPerSecond: 0,
          detectionRadiusMeters: 10,
        },
      ],
    })
  }

  it.each(['PersonSighting', 'FallenTree'] as const)(
    'Detects a %s Event but leaves every Drone patrolling — no automatic dispatch',
    (eventType) => {
      const scenario: Scenario = {
        events: [{ id: 'event-1', type: eventType, position: eventPosition, spawnAtSimSeconds: 0 }],
      }

      const state = advanceSimulation(initializeSimulationState(worldWithOneStationaryDrone(), scenario), 0)

      expect(state.events['event-1'].status).toBe('detected')
      expect(state.droneActivity['only-drone']).toEqual({ mode: 'patrolling' })
    },
  )

  it('still auto-dispatches the nearest available Drone on a new Fire Detection (unchanged, out of this issue\'s scope)', () => {
    const scenario: Scenario = {
      events: [{ id: 'fire-1', type: 'Fire', position: eventPosition, spawnAtSimSeconds: 0 }],
    }

    const state = advanceSimulation(initializeSimulationState(worldWithOneStationaryDrone(), scenario), 0)

    expect(state.events['fire-1'].status).toBe('detected')
    expect(state.droneActivity['only-drone']).toMatchObject({ mode: 'investigating', assignedEventId: 'fire-1' })
  })
})

describe('withManualDispatch (issue O)', () => {
  const eventPosition = { lat: 64.55, lng: 26.25 }

  function detectedPersonSightingScenario(): Scenario {
    return { events: [{ id: 'person-1', type: 'PersonSighting', position: eventPosition, spawnAtSimSeconds: 0 }] }
  }

  // The Drone sits stationary right on top of the Event position, so
  // Detection happens deterministically at elapsedSimSeconds 0 (Detection
  // itself is unchanged by this issue — see the previous describe block) —
  // isolating "does withManualDispatch behave correctly" from "did the
  // Event get Detected in the first place".
  function worldWithDrone(droneType: 'Quadrocopter' | 'FixedWingDrone', droneId = 'drone-1'): World {
    return createWorldFixture({
      baseStations: [{ id: 'base-1', type: 'BaseStation', position: eventPosition }],
      drones: [
        {
          id: droneId,
          type: droneType,
          position: eventPosition,
          homeBaseStationId: 'base-1',
          ...droneSpecFixture,
          patrolRadiusMeters: 1,
          patrolSpeedMetersPerSecond: 0,
          detectionRadiusMeters: 500,
        },
      ],
    })
  }

  it('leaves a newly-Detected Person Sighting undispatched until explicitly sent', () => {
    const state = advanceSimulation(initializeSimulationState(worldWithDrone('Quadrocopter'), detectedPersonSightingScenario()), 0)

    expect(state.events['person-1'].status).toBe('detected')
    expect(state.droneActivity['drone-1']).toEqual({ mode: 'patrolling' })
  })

  it('starts the named Drone investigating the named Event, as of the state\'s current elapsedSimSeconds', () => {
    const state = advanceSimulation(initializeSimulationState(worldWithDrone('Quadrocopter'), detectedPersonSightingScenario()), 42)

    const dispatched = withManualDispatch(state, 'drone-1', 'person-1')

    expect(dispatched.droneActivity['drone-1']).toEqual({
      mode: 'investigating',
      assignedEventId: 'person-1',
      investigationStartedAtSimSeconds: 42,
    })
  })

  it('holds a manually-sent Quadrocopter exactly over the Event position immediately, with no extra tick needed', () => {
    const state = advanceSimulation(initializeSimulationState(worldWithDrone('Quadrocopter'), detectedPersonSightingScenario()), 0)

    const dispatched = withManualDispatch(state, 'drone-1', 'person-1')

    expect(dispatched.dronePatrol['drone-1'].position).toEqual(eventPosition)
  })

  it('starts a manually-sent Fixed-Wing Drone circling (not hovering) the Event, since it cannot hover', () => {
    const state = advanceSimulation(initializeSimulationState(worldWithDrone('FixedWingDrone'), detectedPersonSightingScenario()), 0)

    const dispatched = withManualDispatch(state, 'drone-1', 'person-1')

    expect(dispatched.dronePatrol['drone-1'].position).not.toEqual(eventPosition)
    expect(haversineDistanceMeters(eventPosition, dispatched.dronePatrol['drone-1'].position)).toBeLessThan(1000)
  })

  it('returns a manually-sent Drone to normal patrol once the same investigation interval elapses (timing unchanged from auto-dispatch)', () => {
    let state = advanceSimulation(initializeSimulationState(worldWithDrone('Quadrocopter'), detectedPersonSightingScenario()), 0)
    state = withManualDispatch(state, 'drone-1', 'person-1')

    for (let elapsedSimSeconds = 1; elapsedSimSeconds < INVESTIGATION_DURATION_SIM_SECONDS; elapsedSimSeconds += 1) {
      state = advanceSimulation(state, elapsedSimSeconds)
      expect(state.droneActivity['drone-1']).toMatchObject({ mode: 'investigating', assignedEventId: 'person-1' })
    }

    state = advanceSimulation(state, INVESTIGATION_DURATION_SIM_SECONDS)
    expect(state.droneActivity['drone-1']).toEqual({ mode: 'patrolling' })
  })

  it('is a no-op when the named Drone is already investigating something else', () => {
    const scenario: Scenario = {
      events: [
        { id: 'person-1', type: 'PersonSighting', position: eventPosition, spawnAtSimSeconds: 0 },
        { id: 'tree-1', type: 'FallenTree', position: { lat: 64.6, lng: 26.3 }, spawnAtSimSeconds: 0 },
      ],
    }
    let state = advanceSimulation(initializeSimulationState(worldWithDrone('Quadrocopter'), scenario), 0)
    state = withManualDispatch(state, 'drone-1', 'person-1')
    expect(state.droneActivity['drone-1']).toMatchObject({ assignedEventId: 'person-1' })

    const stillOnPerson1 = withManualDispatch(state, 'drone-1', 'tree-1')

    expect(stillOnPerson1).toEqual(state)
  })

  it('is a no-op when the named Event is not (yet, or no longer) Detected', () => {
    const undetectedScenario: Scenario = {
      events: [{ id: 'person-1', type: 'PersonSighting', position: { lat: 60, lng: 20 }, spawnAtSimSeconds: 0 }],
    }
    const state = advanceSimulation(initializeSimulationState(worldWithDrone('Quadrocopter'), undetectedScenario), 0)
    expect(state.events['person-1'].status).toBe('undetected')

    expect(withManualDispatch(state, 'drone-1', 'person-1')).toEqual(state)
  })

  it('is a no-op when the named Drone or Event id is unknown', () => {
    const state = advanceSimulation(initializeSimulationState(worldWithDrone('Quadrocopter'), detectedPersonSightingScenario()), 0)

    expect(withManualDispatch(state, 'no-such-drone', 'person-1')).toEqual(state)
    expect(withManualDispatch(state, 'drone-1', 'no-such-event')).toEqual(state)
  })

  it('does not mutate the state object passed in', () => {
    const state = advanceSimulation(initializeSimulationState(worldWithDrone('Quadrocopter'), detectedPersonSightingScenario()), 0)
    const snapshotBefore = JSON.parse(JSON.stringify(state))

    withManualDispatch(state, 'drone-1', 'person-1')

    expect(state).toEqual(snapshotBefore)
  })
})

describe('Event resolution (issue G)', () => {
  const tower: World['towers'][number] = {
    id: 'tower-1',
    type: 'Tower',
    position: { lat: 64.7, lng: 26.2 },
    detectionRadiusMeters: 15000,
  }
  const worldWithTower: World = createWorldFixture({ towers: [tower] })

  it('records detectedAtSimSeconds as the absolute elapsedSimSeconds an Event first becomes Detected', () => {
    const scenario: Scenario = {
      events: [{ id: 'fire-1', type: 'Fire', position: tower.position, spawnAtSimSeconds: 100, durationSimSeconds: 50 }],
    }

    const state = advanceSimulation(initializeSimulationState(worldWithTower, scenario), 137)

    expect(state.events['fire-1'].status).toBe('detected')
    expect(state.events['fire-1'].detectedAtSimSeconds).toBe(137)
  })

  it('flips a Detected Event to Resolved once durationSimSeconds has elapsed since Detection (not since spawn)', () => {
    // Spawns at 100, but only actually gets Detected once the Tower "notices"
    // it at elapsedSimSeconds 137 in this fixture (first tick checked) —
    // durationSimSeconds must count from that Detection instant, not 100.
    const scenario: Scenario = {
      events: [{ id: 'fire-1', type: 'Fire', position: tower.position, spawnAtSimSeconds: 100, durationSimSeconds: 50 }],
    }

    let state = initializeSimulationState(worldWithTower, scenario)
    state = advanceSimulation(state, 137)
    expect(state.events['fire-1'].status).toBe('detected')
    expect(state.events['fire-1'].detectedAtSimSeconds).toBe(137)

    const justBeforeResolution = advanceSimulation(state, 137 + 50 - 1)
    expect(justBeforeResolution.events['fire-1'].status).toBe('detected')

    const atResolution = advanceSimulation(justBeforeResolution, 137 + 50)
    expect(atResolution.events['fire-1'].status).toBe('resolved')
  })

  it('never resolves an Event with no durationSimSeconds, however long it stays Detected', () => {
    const scenario: Scenario = {
      events: [{ id: 'fire-1', type: 'Fire', position: tower.position, spawnAtSimSeconds: 0 }],
    }

    const state = advanceSimulation(initializeSimulationState(worldWithTower, scenario), 1_000_000)

    expect(state.events['fire-1'].status).toBe('detected')
  })

  it('never resolves an Undetected Event, even past its durationSimSeconds window from spawn', () => {
    // Far outside the Tower's range, so it never gets Detected at all.
    const scenario: Scenario = {
      events: [
        { id: 'fire-1', type: 'Fire', position: { lat: 60, lng: 20 }, spawnAtSimSeconds: 0, durationSimSeconds: 10 },
      ],
    }

    const state = advanceSimulation(initializeSimulationState(worldWithTower, scenario), 10_000)

    expect(state.events['fire-1'].status).toBe('undetected')
  })

  it('keeps a Resolved Event Resolved (sticky, forward-only) even if re-checked on a later tick', () => {
    const scenario: Scenario = {
      events: [{ id: 'fire-1', type: 'Fire', position: tower.position, spawnAtSimSeconds: 0, durationSimSeconds: 10 }],
    }

    let state = initializeSimulationState(worldWithTower, scenario)
    state = advanceSimulation(state, 10)
    expect(state.events['fire-1'].status).toBe('resolved')

    state = advanceSimulation(state, 20)
    expect(state.events['fire-1'].status).toBe('resolved')
  })

  it('is deterministic: replaying the same tick sequence twice produces an identical resolution timeline', () => {
    const scenario: Scenario = {
      events: [{ id: 'fire-1', type: 'Fire', position: tower.position, spawnAtSimSeconds: 0, durationSimSeconds: 25 }],
    }

    function replay(): SimulationState {
      let state = initializeSimulationState(worldWithTower, scenario)
      for (let elapsedSimSeconds = 0; elapsedSimSeconds <= 60; elapsedSimSeconds += 1) {
        state = advanceSimulation(state, elapsedSimSeconds)
      }
      return state
    }

    const runA = replay()
    const runB = replay()

    expect(runA).toEqual(runB)
    expect(runA.events['fire-1'].status).toBe('resolved')
  })
})
