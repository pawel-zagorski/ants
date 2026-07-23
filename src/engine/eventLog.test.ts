import { describe, expect, it } from 'vitest'
import {
  advanceSimulation,
  initializeSimulationState,
  withManualDispatch,
  withManualFireDispatch,
  withManualReturnToBase,
} from './advanceSimulation'
import { EVENT_LOG_CAP, appendLogEntry } from './eventLog'
import type { EventLogEntry, EventLogKind } from './eventLog'
import { fireOrbitRadiusMetersAt } from './growthEllipse'
import { orbitLapDurationSimSeconds } from './orbit'
import type { LatLng } from '../map/geo'
import { createWorldFixture, droneSpecFixture, windFixture } from '../test/worldFixtures'
import type { Scenario } from '../scenario/types'
import type { World } from '../world/types'
import type { SimulationState } from './types'

const TEST_WIND = windFixture

/** All entries in `log` of a given `kind`, in chronological (oldest-first) order. */
function entriesOfKind(log: readonly EventLogEntry[], kind: EventLogKind): EventLogEntry[] {
  return log.filter((entry) => entry.kind === kind)
}

describe('appendLogEntry (shared contract)', () => {
  function entryAt(simSeconds: number): EventLogEntry {
    return { id: `x:${simSeconds}`, simSeconds, kind: 'droneResumedPatrol', severity: 'info' }
  }

  it('appends chronologically (oldest-first) below the cap', () => {
    const log = appendLogEntry(appendLogEntry([], entryAt(1)), entryAt(2))

    expect(log.map((entry) => entry.simSeconds)).toEqual([1, 2])
  })

  it(`caps at EVENT_LOG_CAP (${EVENT_LOG_CAP}), dropping the oldest entry`, () => {
    let log: EventLogEntry[] = []
    for (let i = 0; i < EVENT_LOG_CAP; i += 1) log = appendLogEntry(log, entryAt(i))
    expect(log).toHaveLength(EVENT_LOG_CAP)
    expect(log[0].simSeconds).toBe(0)

    const capped = appendLogEntry(log, entryAt(EVENT_LOG_CAP))

    expect(capped).toHaveLength(EVENT_LOG_CAP)
    // Oldest (simSeconds 0) dropped; newest (EVENT_LOG_CAP) kept at the end.
    expect(capped[0].simSeconds).toBe(1)
    expect(capped[capped.length - 1].simSeconds).toBe(EVENT_LOG_CAP)
  })
})

describe('initializeSimulationState log', () => {
  it('starts with an empty log', () => {
    const world = createWorldFixture()
    const state = initializeSimulationState(world, { events: [], wind: TEST_WIND })

    expect(state.log).toEqual([])
  })
})

describe('collapsed Fire-orbit lifecycle in a single advance (ADR-0008)', () => {
  const firePosition: LatLng = { lat: 64.55, lng: 26.25 }
  const droneLinearSpeedMetersPerSecond = 10
  const DISPATCH_AT_SIM_SECONDS = 100

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
          // Very high cruise so both the fly-out and fly-back phases finish
          // in <1 sim second, letting a single coarse advance collapse
          // travel → orbit → return → patrol all at once.
          cruiseSpeedMetersPerSecond: 10000,
          patrolRadiusMeters: 100,
          patrolSpeedMetersPerSecond: droneLinearSpeedMetersPerSecond,
          detectionRadiusMeters: 500,
        },
      ],
    })
  }

  it('emits droneBeganFireOrbit, droneReturningAfterOrbit, and droneResumedPatrol — each exactly once, with strictly increasing timestamps — even when all collapse into one 30s-style step', () => {
    const atDispatch = advanceSimulation(
      initializeSimulationState(worldWithOrbitingDrone(), towerDetectedFireScenario()),
      DISPATCH_AT_SIM_SECONDS,
    )
    const dispatched = withManualFireDispatch(atDispatch, 'drone-1', 'fire-1', 'roundTrip')

    const orbitRadiusMeters = fireOrbitRadiusMetersAt(DISPATCH_AT_SIM_SECONDS, TEST_WIND)
    const lapDurationSimSeconds = orbitLapDurationSimSeconds(orbitRadiusMeters, droneLinearSpeedMetersPerSecond)

    // A single large step that lands well past lap completion AND the (near
    // instantaneous) return flight, so travelingToFire → investigatingFire →
    // returningToBase → patrolling all collapse into this one call.
    const collapsed = advanceSimulation(dispatched, DISPATCH_AT_SIM_SECONDS + lapDurationSimSeconds + 30)

    const orbitStarted = entriesOfKind(collapsed.log, 'droneBeganFireOrbit')
    const returning = entriesOfKind(collapsed.log, 'droneReturningAfterOrbit')
    const resumed = entriesOfKind(collapsed.log, 'droneResumedPatrol')

    expect(orbitStarted).toHaveLength(1)
    expect(returning).toHaveLength(1)
    expect(resumed).toHaveLength(1)

    // Each carries the transition's exact embedded timestamp, strictly
    // increasing across the collapsed hops.
    expect(orbitStarted[0].simSeconds).toBeLessThan(returning[0].simSeconds)
    expect(returning[0].simSeconds).toBeLessThan(resumed[0].simSeconds)

    // Payload spot-checks: the orbit/return entries carry the Fire id, and
    // all three name the Drone and its type.
    expect(orbitStarted[0]).toMatchObject({ severity: 'info', droneId: 'drone-1', droneType: 'Quadrocopter', fireId: 'fire-1' })
    expect(returning[0]).toMatchObject({ severity: 'info', droneId: 'drone-1', fireId: 'fire-1' })
    expect(resumed[0]).toMatchObject({ severity: 'info', droneId: 'drone-1' })
  })
})

describe('manual recall Log Entries (droneRecalledToBase → droneGrounded / droneLost)', () => {
  const BASE_POSITION: LatLng = { lat: 64.5, lng: 26.25 }
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

  function recalledFromFarTarget(maxEnduranceSimSeconds: number): SimulationState {
    const base = initializeSimulationState(worldWithQuadrocopter(maxEnduranceSimSeconds), { events: [], wind: TEST_WIND })
    const atFarTarget: SimulationState = {
      ...base,
      dronePatrol: { 'drone-1': { ...base.dronePatrol['drone-1'], position: FAR_TARGET } },
    }
    return withManualReturnToBase(atFarTarget, 'drone-1', BASE_POSITION)
  }

  it('emits droneRecalledToBase (info) at the target position the instant the recall is issued', () => {
    const recalled = recalledFromFarTarget(7200)

    const recall = entriesOfKind(recalled.log, 'droneRecalledToBase')
    expect(recall).toHaveLength(1)
    expect(recall[0]).toMatchObject({ severity: 'info', droneId: 'drone-1', droneType: 'Quadrocopter', position: BASE_POSITION })
  })

  it('emits droneGrounded (info) once the recall flight completes', () => {
    const recalled = recalledFromFarTarget(7200)
    const returnDurationSimSeconds = 0.1 * 111_320 // ~FAR_TARGET→BASE distance / cruise 10 (rough upper bound)

    const arrived = advanceSimulation(recalled, returnDurationSimSeconds)

    expect(arrived.droneActivity['drone-1'].mode).toBe('grounded')
    const grounded = entriesOfKind(arrived.log, 'droneGrounded')
    expect(grounded).toHaveLength(1)
    expect(grounded[0]).toMatchObject({ severity: 'info', droneId: 'drone-1' })
    // The recall order line is still there, followed by the grounding.
    expect(entriesOfKind(arrived.log, 'droneRecalledToBase')).toHaveLength(1)
  })

  it('emits droneLost (warning) instead when the Drone cannot make it home on its remaining endurance', () => {
    // Endurance far below the full return duration, so it can never arrive.
    const shortEndurance = 300
    const recalled = recalledFromFarTarget(shortEndurance)

    const exhausted = advanceSimulation(recalled, 100_000)

    expect(exhausted.droneActivity['drone-1'].mode).toBe('lost')
    const lost = entriesOfKind(exhausted.log, 'droneLost')
    expect(lost).toHaveLength(1)
    expect(lost[0]).toMatchObject({ severity: 'warning', droneId: 'drone-1', simSeconds: shortEndurance })
    // A recall-driven Lost carries no Fire id (it was not a Fire mission).
    expect(lost[0].fireId).toBeUndefined()
  })
})

describe('Detection Log Entries (fog-of-war, sticky)', () => {
  it('emits eventDetected (info) exactly once and never again on later ticks', () => {
    const dronePosition: LatLng = { lat: 64.5, lng: 26.25 }
    const world = createWorldFixture({
      baseStations: [{ id: 'base-1', type: 'BaseStation', position: dronePosition }],
      drones: [
        {
          id: 'quadrocopter-1',
          type: 'Quadrocopter',
          position: dronePosition,
          homeBaseStationId: 'base-1',
          ...droneSpecFixture,
          patrolRadiusMeters: 1,
          patrolSpeedMetersPerSecond: 0,
          detectionRadiusMeters: 1000,
        },
      ],
    })
    // Spawns at t=10 (not 0), so Detection happens during an advance call, not
    // at initialization (where the log is deliberately empty).
    const scenario: Scenario = {
      events: [{ id: 'event-1', type: 'FallenTree', position: dronePosition, spawnAtSimSeconds: 10 }],
      wind: TEST_WIND,
    }

    let state = initializeSimulationState(world, scenario)
    expect(state.log).toEqual([])

    state = advanceSimulation(state, 10)
    const detected = entriesOfKind(state.log, 'eventDetected')
    expect(detected).toHaveLength(1)
    expect(detected[0]).toMatchObject({
      severity: 'info',
      simSeconds: 10,
      droneId: 'quadrocopter-1',
      droneType: 'Quadrocopter',
      eventId: 'event-1',
      eventType: 'FallenTree',
      position: dronePosition,
    })

    state = advanceSimulation(state, 25)
    state = advanceSimulation(state, 200)
    expect(entriesOfKind(state.log, 'eventDetected')).toHaveLength(1)
  })

  it('emits fireDetected (WARNING) exactly once and never again on later ticks', () => {
    const firePosition: LatLng = { lat: 64.7, lng: 26.2 }
    const world = createWorldFixture({
      towers: [{ id: 'tower-1', type: 'Tower', position: firePosition, detectionRadiusMeters: 1000 }],
    })
    const scenario: Scenario = {
      events: [{ id: 'fire-1', type: 'Fire', position: firePosition, spawnAtSimSeconds: 10 }],
      wind: TEST_WIND,
    }

    let state = initializeSimulationState(world, scenario)
    state = advanceSimulation(state, 10)
    const detected = entriesOfKind(state.log, 'fireDetected')
    expect(detected).toHaveLength(1)
    expect(detected[0]).toMatchObject({ severity: 'warning', simSeconds: 10, fireId: 'fire-1', position: firePosition })

    state = advanceSimulation(state, 50)
    state = advanceSimulation(state, 500)
    expect(entriesOfKind(state.log, 'fireDetected')).toHaveLength(1)
  })
})

describe('manual dispatch Log Entries', () => {
  const eventPosition: LatLng = { lat: 64.55, lng: 26.25 }

  it('emits droneDispatchedToEvent (info) with the Event payload', () => {
    const world = createWorldFixture({
      baseStations: [{ id: 'base-1', type: 'BaseStation', position: eventPosition }],
      drones: [
        {
          id: 'drone-1',
          type: 'Quadrocopter',
          position: eventPosition,
          homeBaseStationId: 'base-1',
          ...droneSpecFixture,
          patrolRadiusMeters: 1,
          patrolSpeedMetersPerSecond: 0,
          detectionRadiusMeters: 500,
        },
      ],
    })
    const scenario: Scenario = {
      events: [{ id: 'person-1', type: 'PersonSighting', position: eventPosition, spawnAtSimSeconds: 0 }],
      wind: TEST_WIND,
    }

    const state = advanceSimulation(initializeSimulationState(world, scenario), 42)
    const dispatched = withManualDispatch(state, 'drone-1', 'person-1')

    const entries = entriesOfKind(dispatched.log, 'droneDispatchedToEvent')
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      severity: 'info',
      simSeconds: 42,
      droneId: 'drone-1',
      droneType: 'Quadrocopter',
      eventId: 'person-1',
      eventType: 'PersonSighting',
      position: eventPosition,
    })
  })

  it('emits droneDispatchedToFire (info) for a round-trip Bingo-Range send', () => {
    const firePosition: LatLng = { lat: 64.55, lng: 26.25 }
    const world = createWorldFixture({
      towers: [{ id: 'tower-1', type: 'Tower', position: firePosition, detectionRadiusMeters: 500 }],
      baseStations: [{ id: 'base-1', type: 'BaseStation', position: firePosition }],
      drones: [
        {
          id: 'drone-1',
          type: 'Quadrocopter',
          position: firePosition,
          homeBaseStationId: 'base-1',
          ...droneSpecFixture,
          patrolRadiusMeters: 1,
          patrolSpeedMetersPerSecond: 0,
          detectionRadiusMeters: 500,
        },
      ],
    })
    const scenario: Scenario = {
      events: [{ id: 'fire-1', type: 'Fire', position: firePosition, spawnAtSimSeconds: 0 }],
      wind: TEST_WIND,
    }

    const state = advanceSimulation(initializeSimulationState(world, scenario), 10)
    const dispatched = withManualFireDispatch(state, 'drone-1', 'fire-1', 'roundTrip')

    const entries = entriesOfKind(dispatched.log, 'droneDispatchedToFire')
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      severity: 'info',
      droneId: 'drone-1',
      fireId: 'fire-1',
      missionKind: 'roundTrip',
      position: firePosition,
    })
    expect(entriesOfKind(dispatched.log, 'droneDispatchedOneWay')).toHaveLength(0)
  })
})

describe('One-Way Mission Log Entries (droneDispatchedOneWay → droneLost, both WARNING)', () => {
  const firePosition: LatLng = { lat: 64.55, lng: 26.25 }
  const DISPATCH_AT_SIM_SECONDS = 100
  const MAX_ENDURANCE_SIM_SECONDS = 105

  function scenario(): Scenario {
    return { events: [{ id: 'fire-1', type: 'Fire', position: firePosition, spawnAtSimSeconds: 0 }], wind: TEST_WIND }
  }

  function world(): World {
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
          cruiseSpeedMetersPerSecond: 10000,
          maxEnduranceSimSeconds: MAX_ENDURANCE_SIM_SECONDS,
          patrolRadiusMeters: 100,
          patrolSpeedMetersPerSecond: 10,
          detectionRadiusMeters: 500,
        },
      ],
    })
  }

  it('emits droneDispatchedOneWay (WARNING) on send and droneLost (WARNING) with the Fire id at endurance exhaustion', () => {
    const atDispatch = advanceSimulation(initializeSimulationState(world(), scenario()), DISPATCH_AT_SIM_SECONDS)
    const dispatched = withManualFireDispatch(atDispatch, 'drone-1', 'fire-1', 'oneWay')

    const oneWay = entriesOfKind(dispatched.log, 'droneDispatchedOneWay')
    expect(oneWay).toHaveLength(1)
    expect(oneWay[0]).toMatchObject({ severity: 'warning', droneId: 'drone-1', fireId: 'fire-1', missionKind: 'oneWay' })

    const lostState = advanceSimulation(dispatched, MAX_ENDURANCE_SIM_SECONDS)
    expect(lostState.droneActivity['drone-1'].mode).toBe('lost')

    const lost = entriesOfKind(lostState.log, 'droneLost')
    expect(lost).toHaveLength(1)
    expect(lost[0]).toMatchObject({
      severity: 'warning',
      droneId: 'drone-1',
      fireId: 'fire-1',
      simSeconds: MAX_ENDURANCE_SIM_SECONDS,
    })
  })

  it('still emits droneBeganFireOrbit when transit, orbit start, and loss collapse into one tick (S1)', () => {
    // A single coarse advance jumps the Drone past arrival AND endurance
    // exhaustion. Per ADR-0008 the orbit-start transition genuinely occurred
    // (the Drone reaches the Fire before running out), so it must still be
    // logged — exactly once, before the Lost line — rather than short-circuited.
    const atDispatch = advanceSimulation(initializeSimulationState(world(), scenario()), DISPATCH_AT_SIM_SECONDS)
    const dispatched = withManualFireDispatch(atDispatch, 'drone-1', 'fire-1', 'oneWay')
    const lostState = advanceSimulation(dispatched, MAX_ENDURANCE_SIM_SECONDS)

    const orbit = entriesOfKind(lostState.log, 'droneBeganFireOrbit')
    expect(orbit).toHaveLength(1)
    expect(orbit[0]).toMatchObject({ severity: 'info', droneId: 'drone-1', fireId: 'fire-1' })

    const lost = entriesOfKind(lostState.log, 'droneLost')
    expect(lost).toHaveLength(1)
    // The orbit start is logged at (or before) the moment of loss, never after.
    expect(orbit[0].simSeconds).toBeLessThanOrEqual(lost[0].simSeconds)
  })
})

describe('Event Log determinism (ADR-0003 / ADR-0008)', () => {
  const firePosition: LatLng = { lat: 64.55, lng: 26.25 }
  const droneLinearSpeedMetersPerSecond = 10

  function scenario(): Scenario {
    return { events: [{ id: 'fire-1', type: 'Fire', position: firePosition, spawnAtSimSeconds: 0 }], wind: TEST_WIND }
  }

  function world(): World {
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
          cruiseSpeedMetersPerSecond: 10000,
          patrolRadiusMeters: 100,
          patrolSpeedMetersPerSecond: droneLinearSpeedMetersPerSecond,
          detectionRadiusMeters: 500,
        },
      ],
    })
  }

  function replay(): EventLogEntry[] {
    let state = advanceSimulation(initializeSimulationState(world(), scenario()), 100)
    state = withManualFireDispatch(state, 'drone-1', 'fire-1', 'roundTrip')
    for (const elapsedSimSeconds of [101, 130, 200, 500]) {
      state = advanceSimulation(state, elapsedSimSeconds)
    }
    return state.log
  }

  it('produces byte-identical logs (ids included) when replayed along the same time points twice', () => {
    const runA = replay()
    const runB = replay()

    expect(runA).toEqual(runB)
    // Sanity: this replay actually exercised a rich lifecycle, not an empty log.
    expect(runA.length).toBeGreaterThanOrEqual(4)
    expect(entriesOfKind(runA, 'droneDispatchedToFire')).toHaveLength(1)
    expect(entriesOfKind(runA, 'droneResumedPatrol')).toHaveLength(1)
  })
})
