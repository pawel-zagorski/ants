import { describe, expect, it } from 'vitest'
import { advanceSimulation, initializeSimulationState, withManualDispatch, withManualFireDispatch } from './advanceSimulation'
import { INVESTIGATION_DURATION_SIM_SECONDS } from './dispatch'
import { fireFootprintHexCells, fireOrbitRadiusMetersAt } from './growthEllipse'
import { orbitLapDurationSimSeconds, orbitPositionFor } from './orbit'
import { haversineDistanceMeters } from '../test/haversineDistanceMeters'
import { createWorldFixture, droneSpecFixture, windFixture } from '../test/worldFixtures'
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

// Wind is required on every Scenario (issue P) but irrelevant to these
// engine tests, which predate Fire spread consuming it — `windFixture`
// keeps every literal below focused on what it's actually testing.
const TEST_WIND = windFixture

const emptyScenario: Scenario = { events: [], wind: TEST_WIND }

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

describe('patrol routes (issue AA)', () => {
  const ROUTE = [
    { lat: 64.55, lng: 26.05 },
    { lat: 64.55, lng: 26.45 },
    { lat: 64.45, lng: 26.45 },
    { lat: 64.45, lng: 26.05 },
  ]

  const routedWorld: World = createWorldFixture({
    drones: [
      {
        id: 'routed-1',
        type: 'FixedWingDrone',
        position: { lat: 64.5, lng: 26.25 },
        homeBaseStationId: 'base-1',
        ...droneSpecFixture,
        patrolSpeedMetersPerSecond: 25,
        patrolRoute: ROUTE,
      },
      {
        id: 'unrouted-1',
        type: 'Quadrocopter',
        position: { lat: 64.5, lng: 26.25 },
        homeBaseStationId: 'base-1',
        ...droneSpecFixture,
      },
    ],
  })

  /** Perpendicular distance (meters) from `p` to the closed polyline through `route`. */
  function distanceToRouteMeters(p: { lat: number; lng: number }): number {
    return Math.min(
      ...ROUTE.map((a, i) => {
        const b = ROUTE[(i + 1) % ROUTE.length]
        const abLat = b.lat - a.lat
        const abLng = b.lng - a.lng
        const denom = abLat * abLat + abLng * abLng
        const t = denom === 0 ? 0 : Math.max(0, Math.min(1, ((p.lat - a.lat) * abLat + (p.lng - a.lng) * abLng) / denom))
        return haversineDistanceMeters(p, { lat: a.lat + abLat * t, lng: a.lng + abLng * t })
      }),
    )
  }

  it('flies a routed Drone along its waypoint loop, staying on the polyline at every tick', () => {
    const state = initializeSimulationState(routedWorld, emptyScenario)
    for (const elapsedSimSeconds of [0, 60, 137, 800, 3000]) {
      const advanced = advanceSimulation(state, elapsedSimSeconds)
      expect(distanceToRouteMeters(advanced.dronePatrol['routed-1'].position)).toBeLessThan(2)
    }
  })

  it('is deterministic: a routed Drone has the same position twice for the same elapsedSimSeconds', () => {
    const state = initializeSimulationState(routedWorld, emptyScenario)
    expect(advanceSimulation(state, 137).dronePatrol['routed-1'].position).toEqual(
      advanceSimulation(state, 137).dronePatrol['routed-1'].position,
    )
  })

  it('actually sweeps a wide area — far beyond a base-station loop radius', () => {
    const state = initializeSimulationState(routedWorld, emptyScenario)
    const base = routedWorld.baseStations[0].position
    let maxDistanceFromBase = 0
    for (let elapsedSimSeconds = 0; elapsedSimSeconds <= 3000; elapsedSimSeconds += 30) {
      const position = advanceSimulation(state, elapsedSimSeconds).dronePatrol['routed-1'].position
      maxDistanceFromBase = Math.max(maxDistanceFromBase, haversineDistanceMeters(base, position))
    }
    // The default Fixed-Wing base loop radius is 2500m; a map-sweeping route
    // ranges much farther from its home Base Station than that.
    expect(maxDistanceFromBase).toBeGreaterThan(8000)
  })

  it('leaves a Drone without a patrolRoute on its unchanged tight base-station loop (no regression)', () => {
    const state = initializeSimulationState(routedWorld, emptyScenario)
    const base = routedWorld.baseStations[0].position
    const radius = state.dronePatrol['unrouted-1'].patrolRadiusMeters
    for (const elapsedSimSeconds of [0, 137, 1000, 3000]) {
      const position = advanceSimulation(state, elapsedSimSeconds).dronePatrol['unrouted-1'].position
      expect(haversineDistanceMeters(base, position)).toBeLessThanOrEqual(radius + 1)
    }
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
        type: 'PersonSighting',
        position: { lat: 64.6, lng: 26.4 },
        spawnAtSimSeconds: 200,
        durationSimSeconds: 600,
      },
    ],
    wind: TEST_WIND,
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

describe('Fire ignition spawning (issue Q)', () => {
  const worldWithNoDrones: World = createWorldFixture()

  const scenario: Scenario = {
    events: [
      { id: 'fire-1', type: 'Fire', position: { lat: 64.6, lng: 26.4 }, spawnAtSimSeconds: 100 },
    ],
    wind: TEST_WIND,
  }

  it('does not include a Fire in state.fires before its spawnAtSimSeconds', () => {
    const state = advanceSimulation(initializeSimulationState(worldWithNoDrones, scenario), 99)

    expect(state.fires['fire-1']).toBeUndefined()
  })

  it('includes a Fire in state.fires at exactly its spawnAtSimSeconds, at its scripted position, as "undetected"', () => {
    const state = advanceSimulation(initializeSimulationState(worldWithNoDrones, scenario), 100)

    expect(state.fires['fire-1']).toEqual({
      id: 'fire-1',
      position: { lat: 64.6, lng: 26.4 },
      tier: 'undetected',
      spawnAtSimSeconds: 100,
    })
  })

  it('never places a Fire ignition into state.events — fires and events are separate sibling maps (ADR-0004)', () => {
    const state = advanceSimulation(initializeSimulationState(worldWithNoDrones, scenario), 100)

    expect(state.events['fire-1']).toBeUndefined()
    expect(Object.keys(state.events)).toHaveLength(0)
  })

  it('is deterministic: the same Scenario + elapsedSimSeconds always spawns the same set of Fires', () => {
    const runA = advanceSimulation(initializeSimulationState(worldWithNoDrones, scenario), 250)
    const runB = advanceSimulation(initializeSimulationState(worldWithNoDrones, scenario), 250)

    expect(runA.fires).toEqual(runB.fires)
  })
})

describe('Tower Detection of Fires (issue Q: reads from state.fires, not state.events)', () => {
  const tower: World['towers'][number] = {
    id: 'tower-1',
    type: 'Tower',
    position: { lat: 64.7, lng: 26.2 },
    detectionRadiusMeters: 1000,
  }
  const worldWithTower: World = createWorldFixture({ towers: [tower] })

  function fireScenarioAt(position: { lat: number; lng: number }): Scenario {
    return { events: [{ id: 'fire-1', type: 'Fire', position, spawnAtSimSeconds: 0 }], wind: TEST_WIND }
  }

  it("moves a Fire to tier 'towerDetected' just inside a Tower's detection radius", () => {
    // Directly north of the Tower, a few meters inside its detectionRadiusMeters
    // (comfortably clear of floating-point rounding at the exact boundary).
    const insidePosition = { lat: tower.position.lat + 990 / 111320, lng: tower.position.lng }
    const state = advanceSimulation(initializeSimulationState(worldWithTower, fireScenarioAt(insidePosition)), 0)

    expect(state.fires['fire-1'].tier).toBe('towerDetected')
    expect(state.fires['fire-1'].detectedByAssetId).toBe('tower-1')
  })

  it('leaves a Fire "undetected" just outside a Tower\'s detection radius', () => {
    const outsidePosition = { lat: tower.position.lat + 5000 / 111320, lng: tower.position.lng }
    const state = advanceSimulation(initializeSimulationState(worldWithTower, fireScenarioAt(outsidePosition)), 0)

    expect(state.fires['fire-1'].tier).toBe('undetected')
    expect(state.fires['fire-1'].detectedByAssetId).toBeUndefined()
  })

  it('never detects a Person Sighting or Fallen Tree, regardless of distance from a Tower', () => {
    const atTowerPosition = { ...tower.position }
    const scenario: Scenario = {
      events: [
        { id: 'person-1', type: 'PersonSighting', position: atTowerPosition, spawnAtSimSeconds: 0 },
        { id: 'tree-1', type: 'FallenTree', position: atTowerPosition, spawnAtSimSeconds: 0 },
      ],
      wind: TEST_WIND,
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

  it.each(['PersonSighting', 'FallenTree'] as const)(
    'detects a %s Event once it is within its detection radius',
    (eventType) => {
      const world = worldWithStationaryDrone(1000)
      const scenario: Scenario = {
        events: [{ id: 'event-1', type: eventType, position: { lat: 64.505, lng: 26.25 }, spawnAtSimSeconds: 0 }],
        wind: TEST_WIND,
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
      wind: TEST_WIND,
    }

    const state = advanceSimulation(initializeSimulationState(world, scenario), 0)

    expect(state.events['event-1'].status).toBe('undetected')
  })
})

describe('Drone Detection of a Fire (issue Q: CONTEXT.md — "a Drone for any Event type or a Fire")', () => {
  const droneId = 'quadrocopter-1'

  function worldWithStationaryDrone(detectionRadiusMeters: number): World {
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

  it('moves a Fire to tier "towerDetected" once a Drone (not a Tower) comes within its detection radius', () => {
    const world = worldWithStationaryDrone(1000)
    const scenario: Scenario = {
      events: [{ id: 'fire-1', type: 'Fire', position: { lat: 64.505, lng: 26.25 }, spawnAtSimSeconds: 0 }],
      wind: TEST_WIND,
    }

    const state = advanceSimulation(initializeSimulationState(world, scenario), 0)

    expect(state.fires['fire-1'].tier).toBe('towerDetected')
    expect(state.fires['fire-1'].detectedByAssetId).toBe(droneId)
  })

  it('leaves a Fire "undetected" outside a Drone\'s detection radius, with no Tower in range either', () => {
    const world = worldWithStationaryDrone(100)
    const scenario: Scenario = {
      events: [{ id: 'fire-1', type: 'Fire', position: { lat: 64.55, lng: 26.3 }, spawnAtSimSeconds: 0 }],
      wind: TEST_WIND,
    }

    const state = advanceSimulation(initializeSimulationState(world, scenario), 0)

    expect(state.fires['fire-1'].tier).toBe('undetected')
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
    const scenario: Scenario = {
      events: [{ id: 'event-1', type: 'FallenTree', position: eventPosition, spawnAtSimSeconds: 0 }],
      wind: TEST_WIND,
    }

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
      wind: TEST_WIND,
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
      wind: TEST_WIND,
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
    expect(runA.fires['fire-1'].tier).toBe('towerDetected')
    expect(runA.fires['fire-1'].detectedByAssetId).toBe('tower-1')
    expect(runA.events['tree-1'].status).toBe('detected')
    expect(runA.events['tree-1'].detectedByAssetId).toBe('quadrocopter-1')
  })
})

describe('Manual dispatch retires auto-dispatch for Events; Fire has no auto-dispatch either (issues O/Q, ADR-0004/ADR-0005)', () => {
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
    'Detects a %s Event but leaves every Drone patrolling — no automatic dispatch (issue O)',
    (eventType) => {
      const scenario: Scenario = {
        events: [{ id: 'event-1', type: eventType, position: eventPosition, spawnAtSimSeconds: 0 }],
        wind: TEST_WIND,
      }

      const state = advanceSimulation(initializeSimulationState(worldWithOneStationaryDrone(), scenario), 0)

      expect(state.events['event-1'].status).toBe('detected')
      expect(state.droneActivity['only-drone']).toEqual({ mode: 'patrolling' })
    },
  )

  it('leaves every Drone patrolling even once a Fire is Tower-Detected — Fire has no automatic-dispatch mechanism in this slice either (issue Q; Fire dispatch is a later issue, U/V)', () => {
    const world = createWorldFixture({
      towers: [{ id: 'tower-1', type: 'Tower', position: eventPosition, detectionRadiusMeters: 10 }],
      baseStations: [{ id: 'base-near', type: 'BaseStation', position: { lat: 64.5505, lng: 26.25 } }],
      drones: [
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
    const scenario: Scenario = {
      events: [{ id: 'fire-1', type: 'Fire', position: eventPosition, spawnAtSimSeconds: 0 }],
      wind: TEST_WIND,
    }

    const state = advanceSimulation(initializeSimulationState(world, scenario), 0)

    expect(state.fires['fire-1'].tier).toBe('towerDetected')
    expect(state.droneActivity['drone-near']).toEqual({ mode: 'patrolling' })
  })
})

describe('withManualDispatch (issue O)', () => {
  const eventPosition = { lat: 64.55, lng: 26.25 }

  function detectedPersonSightingScenario(): Scenario {
    return { events: [{ id: 'person-1', type: 'PersonSighting', position: eventPosition, spawnAtSimSeconds: 0 }], wind: TEST_WIND }
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
      wind: TEST_WIND,
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
      wind: TEST_WIND,
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

describe('withManualFireDispatch (issue U)', () => {
  const firePosition = { lat: 64.55, lng: 26.25 }

  function towerDetectedFireScenario(): Scenario {
    return { events: [{ id: 'fire-1', type: 'Fire', position: firePosition, spawnAtSimSeconds: 0 }], wind: TEST_WIND }
  }

  // A Tower sitting right on the Fire's position, so Detection happens
  // deterministically at elapsedSimSeconds 0 — isolating "does
  // withManualFireDispatch behave correctly" from "did the Fire get
  // Detected in the first place".
  function worldWithDrone(droneType: 'Quadrocopter' | 'FixedWingDrone', droneId = 'drone-1'): World {
    return createWorldFixture({
      towers: [{ id: 'tower-1', type: 'Tower', position: firePosition, detectionRadiusMeters: 500 }],
      baseStations: [{ id: 'base-1', type: 'BaseStation', position: firePosition }],
      drones: [
        {
          id: droneId,
          type: droneType,
          position: firePosition,
          homeBaseStationId: 'base-1',
          ...droneSpecFixture,
          // Very high cruise speed so the travel phase completes in <0.01 sim seconds —
          // these tests care about dispatch state and immediate arrival, not travel duration.
          cruiseSpeedMetersPerSecond: 10000,
          patrolRadiusMeters: 1,
          patrolSpeedMetersPerSecond: 0,
          detectionRadiusMeters: 500,
        },
      ],
    })
  }

  it('leaves a newly Tower-Detected Fire undispatched until explicitly sent', () => {
    const state = advanceSimulation(initializeSimulationState(worldWithDrone('Quadrocopter'), towerDetectedFireScenario()), 0)

    expect(state.fires['fire-1'].tier).toBe('towerDetected')
    expect(state.droneActivity['drone-1']).toEqual({ mode: 'patrolling' })
  })

  it("starts the named Drone traveling to the named Fire on dispatch, then orbiting it after arrival", () => {
    const state = advanceSimulation(initializeSimulationState(worldWithDrone('Quadrocopter'), towerDetectedFireScenario()), 42)

    const dispatched = withManualFireDispatch(state, 'drone-1', 'fire-1', 'roundTrip')

    // Dispatch immediately enters 'travelingToFire' (not yet orbiting)
    expect(dispatched.droneActivity['drone-1']).toMatchObject({
      mode: 'travelingToFire',
      assignedFireId: 'fire-1',
      departureSimSeconds: 42,
      missionKind: 'roundTrip',
      orbitRadiusMeters: fireOrbitRadiusMetersAt(42, TEST_WIND),
    })

    // After travel completes (cruise speed = 10000 m/s → arrives in <1 sim second), drone orbits
    const arrived = advanceSimulation(dispatched, 43)
    expect(arrived.droneActivity['drone-1']).toMatchObject({
      mode: 'investigatingFire',
      assignedFireId: 'fire-1',
      missionKind: 'roundTrip',
      orbitRadiusMeters: fireOrbitRadiusMetersAt(42, TEST_WIND),
    })
  })

  it('records missionKind "oneWay" for a One-Way Mission send', () => {
    const state = advanceSimulation(initializeSimulationState(worldWithDrone('Quadrocopter'), towerDetectedFireScenario()), 0)

    const dispatched = withManualFireDispatch(state, 'drone-1', 'fire-1', 'oneWay')

    expect(dispatched.droneActivity['drone-1']).toMatchObject({ mode: 'travelingToFire', missionKind: 'oneWay' })
  })

  it('flies a manually-sent Quadrocopter to the Fire center once travel completes (orbitRadius = 0 at ignition → orbit entry = fire position)', () => {
    const state = advanceSimulation(initializeSimulationState(worldWithDrone('Quadrocopter'), towerDetectedFireScenario()), 0)

    const dispatched = withManualFireDispatch(state, 'drone-1', 'fire-1', 'roundTrip')

    // Drone is en route — position is unchanged on the dispatch tick itself
    expect(dispatched.dronePatrol['drone-1'].position).not.toEqual(firePosition)

    // After travel completes (cruise speed = 10000 m/s → arrives in <1 sim second):
    // orbitRadius = 0 at ignition time → orbit entry = fire center → Quadrocopter hovers at fire
    const afterTravel = advanceSimulation(dispatched, 1)
    expect(afterTravel.dronePatrol['drone-1'].position).toEqual(firePosition)
  })

  it('starts a manually-sent Fixed-Wing Drone circling (not hovering) the Fire, since it cannot hover, once the Fire has grown a non-zero extent to orbit', () => {
    // At elapsedSimSeconds 0 the Fire has *just* ignited — its extent (and
    // therefore its orbit radius) is still exactly zero, so dispatching
    // that instant would degenerately place the Drone right on the Fire's
    // own position (see `orbit.ts`'s `orbitAngleRadiansAt` doc comment).
    // Advancing a bit first gives the Fire a real, non-zero extent to orbit.
    const state = advanceSimulation(initializeSimulationState(worldWithDrone('FixedWingDrone'), towerDetectedFireScenario()), 42)

    const dispatched = withManualFireDispatch(state, 'drone-1', 'fire-1', 'roundTrip')

    expect(dispatched.dronePatrol['drone-1'].position).not.toEqual(firePosition)
    expect(haversineDistanceMeters(firePosition, dispatched.dronePatrol['drone-1'].position)).toBeLessThan(1000)
  })

  it('stays "investigatingFire" indefinitely — no fixed-duration expiry like an Event investigation (issue V/W will add a real ending condition)', () => {
    let state = advanceSimulation(initializeSimulationState(worldWithDrone('Quadrocopter'), towerDetectedFireScenario()), 0)
    state = withManualFireDispatch(state, 'drone-1', 'fire-1', 'roundTrip')

    state = advanceSimulation(state, INVESTIGATION_DURATION_SIM_SECONDS * 10)

    expect(state.droneActivity['drone-1']).toMatchObject({ mode: 'investigatingFire', assignedFireId: 'fire-1' })
  })

  it('is a no-op when the named Drone is already investigating something else', () => {
    const state = advanceSimulation(initializeSimulationState(worldWithDrone('Quadrocopter'), towerDetectedFireScenario()), 0)
    const dispatched = withManualFireDispatch(state, 'drone-1', 'fire-1', 'roundTrip')
    expect(dispatched.droneActivity['drone-1']).toMatchObject({ assignedFireId: 'fire-1' })

    const stillOnFire1 = withManualFireDispatch(dispatched, 'drone-1', 'fire-1', 'oneWay')

    expect(stillOnFire1).toEqual(dispatched)
  })

  it('is a no-op when the named Fire is not (yet) Tower-Detected', () => {
    const undetectedScenario: Scenario = {
      events: [{ id: 'fire-1', type: 'Fire', position: { lat: 60, lng: 20 }, spawnAtSimSeconds: 0 }],
      wind: TEST_WIND,
    }
    const state = advanceSimulation(initializeSimulationState(worldWithDrone('Quadrocopter'), undetectedScenario), 0)
    expect(state.fires['fire-1'].tier).toBe('undetected')

    expect(withManualFireDispatch(state, 'drone-1', 'fire-1', 'roundTrip')).toEqual(state)
  })

  it('is a no-op when the named Drone or Fire id is unknown', () => {
    const state = advanceSimulation(initializeSimulationState(worldWithDrone('Quadrocopter'), towerDetectedFireScenario()), 0)

    expect(withManualFireDispatch(state, 'no-such-drone', 'fire-1', 'roundTrip')).toEqual(state)
    expect(withManualFireDispatch(state, 'drone-1', 'no-such-fire', 'roundTrip')).toEqual(state)
  })

  it('does not mutate the state object passed in', () => {
    const state = advanceSimulation(initializeSimulationState(worldWithDrone('Quadrocopter'), towerDetectedFireScenario()), 0)
    const snapshotBefore = JSON.parse(JSON.stringify(state))

    withManualFireDispatch(state, 'drone-1', 'fire-1', 'roundTrip')

    expect(state).toEqual(snapshotBefore)
  })
})

describe('Fire orbit / Confirmed Shape (issue V)', () => {
  const firePosition = { lat: 64.55, lng: 26.25 }
  // Nonzero, so orbit angular speed (and therefore lap duration) is
  // well-defined — `withManualFireDispatch (issue U)`'s own
  // `worldWithDrone` deliberately uses `patrolSpeedMetersPerSecond: 0`
  // (irrelevant to *that* block's assertions), which would make a Drone's
  // orbit linear speed zero and a lap take forever — not usable here.
  const droneLinearSpeedMetersPerSecond = 10

  function towerDetectedFireScenario(): Scenario {
    return { events: [{ id: 'fire-1', type: 'Fire', position: firePosition, spawnAtSimSeconds: 0 }], wind: TEST_WIND }
  }

  function worldWithOrbitingDrone(): World {
    return createWorldFixture({
      towers: [{ id: 'tower-1', type: 'Tower', position: firePosition, detectionRadiusMeters: 500 }],
      baseStations: [{ id: 'base-1', type: 'BaseStation', position: firePosition }],
      drones: [
        {
          id: 'drone-1',
          type: 'Quadrocopter',
          position: firePosition,
          homeBaseStationId: 'base-1',
          ...droneSpecFixture,
          // Very high cruise speed so the travel phase completes in <0.01 sim seconds —
          // these tests care about orbit/confirmed-shape behavior, not travel duration.
          cruiseSpeedMetersPerSecond: 10000,
          patrolRadiusMeters: 100,
          patrolSpeedMetersPerSecond: droneLinearSpeedMetersPerSecond,
          detectionRadiusMeters: 500,
        },
      ],
    })
  }

  // Dispatches at elapsedSimSeconds 100 (not 0), so the Fire has already
  // grown a real, non-zero extent to orbit — see the Fixed-Wing orbit test
  // above for why dispatching right at ignition would be degenerate.
  const DISPATCH_AT_SIM_SECONDS = 100

  function dispatchedState(missionKind: 'roundTrip' | 'oneWay'): SimulationState {
    const state = advanceSimulation(
      initializeSimulationState(worldWithOrbitingDrone(), towerDetectedFireScenario()),
      DISPATCH_AT_SIM_SECONDS,
    )
    return withManualFireDispatch(state, 'drone-1', 'fire-1', missionKind)
  }

  it("ratchets the Fire's tier to 'investigated' the instant a Drone begins orbiting it", () => {
    const state = advanceSimulation(
      initializeSimulationState(worldWithOrbitingDrone(), towerDetectedFireScenario()),
      DISPATCH_AT_SIM_SECONDS,
    )
    expect(state.fires['fire-1'].tier).toBe('towerDetected')

    const dispatched = withManualFireDispatch(state, 'drone-1', 'fire-1', 'roundTrip')

    // On dispatch alone, fire is still towerDetected — drone is en route, not yet orbiting
    expect(dispatched.fires['fire-1'].tier).toBe('towerDetected')

    // After drone arrives and begins orbiting (cruise speed = 10000 m/s → arrives in <1 sim second),
    // tier ratchets to 'investigated'
    const arrived = advanceSimulation(dispatched, DISPATCH_AT_SIM_SECONDS + 1)
    expect(arrived.fires['fire-1'].tier).toBe('investigated')
  })

  it('exposes a live Confirmed Shape, matching the real live Fire Footprint, on every tick while a Drone actively orbits', () => {
    let state = dispatchedState('oneWay')

    for (const elapsedSimSeconds of [DISPATCH_AT_SIM_SECONDS + 5, DISPATCH_AT_SIM_SECONDS + 15, DISPATCH_AT_SIM_SECONDS + 40]) {
      state = advanceSimulation(state, elapsedSimSeconds)

      const fire = state.fires['fire-1']
      expect(fire.tier).toBe('investigated')
      expect(fire.confirmedAtSimSeconds).toBe(elapsedSimSeconds)
      expect(fire.confirmedFootprintHexCells).toEqual(fireFootprintHexCells(elapsedSimSeconds - fire.spawnAtSimSeconds, TEST_WIND))
    }
  })

  it('completes a roundTrip (Bingo Range) Drone\'s investigation after exactly one full orbit lap and returns it to patrolling', () => {
    const dispatched = withManualFireDispatch(
      advanceSimulation(initializeSimulationState(worldWithOrbitingDrone(), towerDetectedFireScenario()), DISPATCH_AT_SIM_SECONDS),
      'drone-1',
      'fire-1',
      'roundTrip',
    )
    const orbitRadiusMeters = fireOrbitRadiusMetersAt(DISPATCH_AT_SIM_SECONDS, TEST_WIND)
    const lapDurationSimSeconds = orbitLapDurationSimSeconds(orbitRadiusMeters, droneLinearSpeedMetersPerSecond)

    const justBeforeLapCompletes = advanceSimulation(dispatched, DISPATCH_AT_SIM_SECONDS + lapDurationSimSeconds - 1)
    expect(justBeforeLapCompletes.droneActivity['drone-1']).toMatchObject({ mode: 'investigatingFire' })

    const justAfterLapCompletes = advanceSimulation(dispatched, DISPATCH_AT_SIM_SECONDS + lapDurationSimSeconds + 1)
    expect(justAfterLapCompletes.droneActivity['drone-1']).toEqual({ mode: 'patrolling' })
  })

  it('freezes the Confirmed Shape as a stale snapshot the moment the last orbiting Drone stops, and never reverts the Fire tier back', () => {
    const dispatched = withManualFireDispatch(
      advanceSimulation(initializeSimulationState(worldWithOrbitingDrone(), towerDetectedFireScenario()), DISPATCH_AT_SIM_SECONDS),
      'drone-1',
      'fire-1',
      'roundTrip',
    )
    const orbitRadiusMeters = fireOrbitRadiusMetersAt(DISPATCH_AT_SIM_SECONDS, TEST_WIND)
    const lapDurationSimSeconds = orbitLapDurationSimSeconds(orbitRadiusMeters, droneLinearSpeedMetersPerSecond)
    const lastTickStillOrbitingAtSimSeconds = DISPATCH_AT_SIM_SECONDS + lapDurationSimSeconds - 1
    const justAfterLapCompletesAtSimSeconds = DISPATCH_AT_SIM_SECONDS + lapDurationSimSeconds + 1

    // A real Simulation Clock ticks far more often than this test does, so
    // step through an intermediate still-orbiting tick first (recording
    // its live Confirmed Shape) rather than jumping straight from dispatch
    // to well after lap completion in one big leap, which would otherwise
    // skip every tick the freeze is actually supposed to have captured.
    const stillOrbiting = advanceSimulation(dispatched, lastTickStillOrbitingAtSimSeconds)
    expect(stillOrbiting.droneActivity['drone-1']).toMatchObject({ mode: 'investigatingFire' })
    const lastLiveShape = stillOrbiting.fires['fire-1'].confirmedFootprintHexCells

    const departed = advanceSimulation(stillOrbiting, justAfterLapCompletesAtSimSeconds)
    expect(departed.droneActivity['drone-1']).toEqual({ mode: 'patrolling' })
    expect(departed.fires['fire-1'].tier).toBe('investigated')
    expect(departed.fires['fire-1'].confirmedFootprintHexCells).toEqual(lastLiveShape)
    expect(departed.fires['fire-1'].confirmedAtSimSeconds).toBe(lastTickStillOrbitingAtSimSeconds)

    const muchLater = advanceSimulation(departed, justAfterLapCompletesAtSimSeconds + 10_000)

    expect(muchLater.fires['fire-1'].tier).toBe('investigated')
    expect(muchLater.fires['fire-1'].confirmedFootprintHexCells).toEqual(lastLiveShape)
    expect(muchLater.fires['fire-1'].confirmedAtSimSeconds).toBe(lastTickStillOrbitingAtSimSeconds)
  })

  it('keeps a roundTrip Drone investigating even when dispatched at fire-ignition time (orbit radius = 0 at dispatch → zero-circumference lap must not be treated as instantly completed)', () => {
    // Bug: orbitLapDurationSimSeconds(0, speed) = 0, so the very first tick
    // after dispatch sees secondsSinceOrbitStarted > 0 = lapDuration and
    // immediately returns the Drone to 'patrolling'. The fix: treat
    // orbitRadiusMeters <= 0 the same as linearSpeedMetersPerSecond <= 0
    // — a degenerate orbit that can never complete a lap returns Infinity.
    const stateAtIgnition = advanceSimulation(
      initializeSimulationState(worldWithOrbitingDrone(), towerDetectedFireScenario()),
      0, // dispatch at the exact moment the Fire ignites → orbitRadiusMeters = 0
    )
    const dispatched = withManualFireDispatch(stateAtIgnition, 'drone-1', 'fire-1', 'roundTrip')
    expect((dispatched.droneActivity['drone-1'] as { orbitRadiusMeters: number }).orbitRadiusMeters).toBe(0)

    const nextTick = advanceSimulation(dispatched, 1)

    expect(nextTick.droneActivity['drone-1']).toMatchObject({ mode: 'investigatingFire', assignedFireId: 'fire-1' })
  })

  it('leaves a oneWay (One-Way Mission) Drone orbiting indefinitely, with no lap-based ending, keeping the Confirmed Shape live the whole time', () => {
    const dispatched = dispatchedState('oneWay')
    const orbitRadiusMeters = fireOrbitRadiusMetersAt(DISPATCH_AT_SIM_SECONDS, TEST_WIND)
    const lapDurationSimSeconds = orbitLapDurationSimSeconds(orbitRadiusMeters, droneLinearSpeedMetersPerSecond)

    const wayPastOneLap = advanceSimulation(dispatched, DISPATCH_AT_SIM_SECONDS + lapDurationSimSeconds * 5)

    expect(wayPastOneLap.droneActivity['drone-1']).toMatchObject({ mode: 'investigatingFire', missionKind: 'oneWay' })
    expect(wayPastOneLap.fires['fire-1'].confirmedAtSimSeconds).toBe(DISPATCH_AT_SIM_SECONDS + lapDurationSimSeconds * 5)
  })
})

describe('Lost Drone / One-Way Mission endurance exhaustion (issue W)', () => {
  const firePosition = { lat: 64.55, lng: 26.25 }
  const droneLinearSpeedMetersPerSecond = 10
  // Dispatched at t=100 (not 0), same non-degenerate-orbit-radius rationale
  // as the issue V block above. Deliberately small (105 sim seconds), just
  // 5s past dispatch, so exhaustion is reached well before this Drone's
  // orbit lap would otherwise complete on its own (~31s at this radius/
  // speed — see the "does not apply to a roundTrip mission" test below).
  const DISPATCH_AT_SIM_SECONDS = 100
  const MAX_ENDURANCE_SIM_SECONDS = 105

  function towerDetectedFireScenario(): Scenario {
    return { events: [{ id: 'fire-1', type: 'Fire', position: firePosition, spawnAtSimSeconds: 0 }], wind: TEST_WIND }
  }

  function worldWithOrbitingDrone(): World {
    return createWorldFixture({
      towers: [{ id: 'tower-1', type: 'Tower', position: firePosition, detectionRadiusMeters: 500 }],
      baseStations: [{ id: 'base-1', type: 'BaseStation', position: firePosition }],
      drones: [
        {
          id: 'drone-1',
          type: 'Quadrocopter',
          position: firePosition,
          homeBaseStationId: 'base-1',
          ...droneSpecFixture,
          // Very high cruise speed so the travel phase completes in <0.01 sim seconds —
          // these tests care about endurance-exhaustion behavior during orbit, not travel duration.
          cruiseSpeedMetersPerSecond: 10000,
          maxEnduranceSimSeconds: MAX_ENDURANCE_SIM_SECONDS,
          patrolRadiusMeters: 100,
          patrolSpeedMetersPerSecond: droneLinearSpeedMetersPerSecond,
          detectionRadiusMeters: 500,
        },
      ],
    })
  }

  function dispatchedState(missionKind: 'roundTrip' | 'oneWay' = 'oneWay'): SimulationState {
    const state = advanceSimulation(
      initializeSimulationState(worldWithOrbitingDrone(), towerDetectedFireScenario()),
      DISPATCH_AT_SIM_SECONDS,
    )
    return withManualFireDispatch(state, 'drone-1', 'fire-1', missionKind)
  }

  it('stays "investigatingFire" the instant before remainingEnduranceSimSeconds would reach zero', () => {
    const dispatched = dispatchedState('oneWay')

    const justBefore = advanceSimulation(dispatched, MAX_ENDURANCE_SIM_SECONDS - 1)

    expect(justBefore.droneActivity['drone-1']).toMatchObject({ mode: 'investigatingFire', missionKind: 'oneWay' })
  })

  it('transitions to "lost" the exact tick remainingEnduranceSimSeconds reaches zero — not one tick early', () => {
    const dispatched = dispatchedState('oneWay')

    const atExhaustion = advanceSimulation(dispatched, MAX_ENDURANCE_SIM_SECONDS)

    expect(atExhaustion.droneActivity['drone-1']).toMatchObject({ mode: 'lost', lostAtSimSeconds: MAX_ENDURANCE_SIM_SECONDS })
  })

  it("freezes the Drone at exactly wherever its orbit put it at the precise instant endurance ran out, even when a later tick overshoots that instant", () => {
    const dispatched = dispatchedState('oneWay')
    const orbitRadiusMeters = fireOrbitRadiusMetersAt(DISPATCH_AT_SIM_SECONDS, TEST_WIND)

    // Advance 1 sim second to get past the travel phase (cruise = 10000 m/s → arrives in <1s),
    // then read the exact investigationStartedAtSimSeconds the engine recorded.
    const arrived = advanceSimulation(dispatched, DISPATCH_AT_SIM_SECONDS + 1)
    expect(arrived.droneActivity['drone-1']).toMatchObject({ mode: 'investigatingFire' })
    const { investigationStartedAtSimSeconds } = arrived.droneActivity['drone-1'] as {
      investigationStartedAtSimSeconds: number
    }

    // The frozen position must be wherever the orbit formula put the Drone at the
    // exact instant endurance ran out — derived from the real investigationStartedAtSimSeconds,
    // not the dispatch time, because a travel phase separates the two.
    const expectedLostPosition = orbitPositionFor(
      firePosition,
      orbitRadiusMeters,
      droneLinearSpeedMetersPerSecond,
      MAX_ENDURANCE_SIM_SECONDS - investigationStartedAtSimSeconds,
    )

    // A real Simulation Clock would tick close to MAX_ENDURANCE_SIM_SECONDS,
    // but this jumps a large, coarse step past it — same "not whatever
    // later tick happened to detect it" instant this behavior is supposed
    // to guarantee regardless of tick granularity.
    const wayPastExhaustion = advanceSimulation(arrived, MAX_ENDURANCE_SIM_SECONDS + 500)

    expect(wayPastExhaustion.droneActivity['drone-1']).toMatchObject({ mode: 'lost' })
    expect(wayPastExhaustion.dronePatrol['drone-1'].position).toEqual(expectedLostPosition)
  })

  it('never leaves "lost" once reached, staying frozen at that same position forever', () => {
    const dispatched = dispatchedState('oneWay')
    const lost = advanceSimulation(dispatched, MAX_ENDURANCE_SIM_SECONDS)

    const muchLater = advanceSimulation(lost, MAX_ENDURANCE_SIM_SECONDS + 100_000)

    expect(muchLater.droneActivity['drone-1']).toEqual(lost.droneActivity['drone-1'])
    expect(muchLater.dronePatrol['drone-1'].position).toEqual(lost.dronePatrol['drone-1'].position)
  })

  it("freezes the Fire's Confirmed Shape the instant its sole orbiting Drone goes Lost, and never live-updates again (issue V's freeze condition applies with no extra plumbing)", () => {
    const dispatched = dispatchedState('oneWay')
    const lastLiveTickAtSimSeconds = MAX_ENDURANCE_SIM_SECONDS - 1

    // Steps through the last still-orbiting tick first (recording its live
    // Confirmed Shape), same rationale as the issue V freeze test above:
    // a real Simulation Clock ticks far more often than this test does.
    const stillOrbiting = advanceSimulation(dispatched, lastLiveTickAtSimSeconds)
    expect(stillOrbiting.droneActivity['drone-1']).toMatchObject({ mode: 'investigatingFire' })
    const lastLiveShape = stillOrbiting.fires['fire-1'].confirmedFootprintHexCells

    const lost = advanceSimulation(stillOrbiting, MAX_ENDURANCE_SIM_SECONDS)

    expect(lost.droneActivity['drone-1']).toMatchObject({ mode: 'lost' })
    expect(lost.fires['fire-1'].tier).toBe('investigated')
    expect(lost.fires['fire-1'].confirmedFootprintHexCells).toEqual(lastLiveShape)
    expect(lost.fires['fire-1'].confirmedAtSimSeconds).toBe(lastLiveTickAtSimSeconds)

    const muchLater = advanceSimulation(lost, MAX_ENDURANCE_SIM_SECONDS + 10_000)
    expect(muchLater.fires['fire-1'].confirmedFootprintHexCells).toEqual(lastLiveShape)
    expect(muchLater.fires['fire-1'].confirmedAtSimSeconds).toBe(lastLiveTickAtSimSeconds)
  })

  it('never applies the endurance-exhaustion check to a roundTrip mission, even once its own endurance has also run out mid-orbit', () => {
    const dispatched = dispatchedState('roundTrip')
    const orbitRadiusMeters = fireOrbitRadiusMetersAt(DISPATCH_AT_SIM_SECONDS, TEST_WIND)
    const lapDurationSimSeconds = orbitLapDurationSimSeconds(orbitRadiusMeters, droneLinearSpeedMetersPerSecond)
    // This fixture's lap takes ~31s — comfortably longer than the 5s until
    // MAX_ENDURANCE_SIM_SECONDS is reached, so this instant is past
    // exhaustion but still mid-lap.
    expect(lapDurationSimSeconds).toBeGreaterThan(MAX_ENDURANCE_SIM_SECONDS - DISPATCH_AT_SIM_SECONDS)

    const pastExhaustionStillMidLap = advanceSimulation(dispatched, MAX_ENDURANCE_SIM_SECONDS)

    expect(pastExhaustionStillMidLap.droneActivity['drone-1']).toMatchObject({ mode: 'investigatingFire', missionKind: 'roundTrip' })
  })
})

describe('Event resolution (issue G)', () => {
  // A stationary Drone with a generous detectionRadiusMeters override,
  // standing in for the Tower this block originally used — Events (Person
  // Sighting/Fallen Tree) are Drone-detected only; Tower detection now only
  // applies to Fire (see ADR-0004, issue Q).
  const detectorPosition = { lat: 64.7, lng: 26.2 }
  const worldWithDetector: World = createWorldFixture({
    baseStations: [{ id: 'base-1', type: 'BaseStation', position: detectorPosition }],
    drones: [
      {
        id: 'detector-drone',
        type: 'Quadrocopter',
        position: detectorPosition,
        homeBaseStationId: 'base-1',
        ...droneSpecFixture,
        patrolRadiusMeters: 1,
        patrolSpeedMetersPerSecond: 0,
        detectionRadiusMeters: 15000,
      },
    ],
  })

  it('records detectedAtSimSeconds as the absolute elapsedSimSeconds an Event first becomes Detected', () => {
    const scenario: Scenario = {
      events: [{ id: 'event-1', type: 'FallenTree', position: detectorPosition, spawnAtSimSeconds: 100, durationSimSeconds: 50 }],
      wind: TEST_WIND,
    }

    const state = advanceSimulation(initializeSimulationState(worldWithDetector, scenario), 137)

    expect(state.events['event-1'].status).toBe('detected')
    expect(state.events['event-1'].detectedAtSimSeconds).toBe(137)
  })

  it('flips a Detected Event to Resolved once durationSimSeconds has elapsed since Detection (not since spawn)', () => {
    // Spawns at 100, but only actually gets Detected once the Drone
    // "notices" it at elapsedSimSeconds 137 in this fixture (first tick
    // checked) — durationSimSeconds must count from that Detection instant,
    // not 100.
    const scenario: Scenario = {
      events: [{ id: 'event-1', type: 'FallenTree', position: detectorPosition, spawnAtSimSeconds: 100, durationSimSeconds: 50 }],
      wind: TEST_WIND,
    }

    let state = initializeSimulationState(worldWithDetector, scenario)
    state = advanceSimulation(state, 137)
    expect(state.events['event-1'].status).toBe('detected')
    expect(state.events['event-1'].detectedAtSimSeconds).toBe(137)

    const justBeforeResolution = advanceSimulation(state, 137 + 50 - 1)
    expect(justBeforeResolution.events['event-1'].status).toBe('detected')

    const atResolution = advanceSimulation(justBeforeResolution, 137 + 50)
    expect(atResolution.events['event-1'].status).toBe('resolved')
  })

  it('never resolves an Event with no durationSimSeconds, however long it stays Detected', () => {
    const scenario: Scenario = {
      events: [{ id: 'event-1', type: 'FallenTree', position: detectorPosition, spawnAtSimSeconds: 0 }],
      wind: TEST_WIND,
    }

    const state = advanceSimulation(initializeSimulationState(worldWithDetector, scenario), 1_000_000)

    expect(state.events['event-1'].status).toBe('detected')
  })

  it('never resolves an Undetected Event, even past its durationSimSeconds window from spawn', () => {
    // Far outside the Drone's range, so it never gets Detected at all.
    const scenario: Scenario = {
      events: [
        { id: 'event-1', type: 'FallenTree', position: { lat: 60, lng: 20 }, spawnAtSimSeconds: 0, durationSimSeconds: 10 },
      ],
      wind: TEST_WIND,
    }

    const state = advanceSimulation(initializeSimulationState(worldWithDetector, scenario), 10_000)

    expect(state.events['event-1'].status).toBe('undetected')
  })

  it('keeps a Resolved Event Resolved (sticky, forward-only) even if re-checked on a later tick', () => {
    const scenario: Scenario = {
      events: [{ id: 'event-1', type: 'FallenTree', position: detectorPosition, spawnAtSimSeconds: 0, durationSimSeconds: 10 }],
      wind: TEST_WIND,
    }

    let state = initializeSimulationState(worldWithDetector, scenario)
    state = advanceSimulation(state, 10)
    expect(state.events['event-1'].status).toBe('resolved')

    state = advanceSimulation(state, 20)
    expect(state.events['event-1'].status).toBe('resolved')
  })

  it('is deterministic: replaying the same tick sequence twice produces an identical resolution timeline', () => {
    const scenario: Scenario = {
      events: [{ id: 'event-1', type: 'FallenTree', position: detectorPosition, spawnAtSimSeconds: 0, durationSimSeconds: 25 }],
      wind: TEST_WIND,
    }

    function replay(): SimulationState {
      let state = initializeSimulationState(worldWithDetector, scenario)
      for (let elapsedSimSeconds = 0; elapsedSimSeconds <= 60; elapsedSimSeconds += 1) {
        state = advanceSimulation(state, elapsedSimSeconds)
      }
      return state
    }

    const runA = replay()
    const runB = replay()

    expect(runA).toEqual(runB)
    expect(runA.events['event-1'].status).toBe('resolved')
  })
})
