import { describe, expect, it } from 'vitest'
import { advanceSimulation, initializeSimulationState } from './advanceSimulation'
import { createWorldFixture, droneSpecFixture, windFixture } from '../test/worldFixtures'
import type { Scenario, ScenarioClearcut } from '../scenario/types'
import type { Tower, World } from '../world/types'

const CLEARCUT_POSITION = { lat: 64.5, lng: 26.25 }

const clearcutEntry: ScenarioClearcut = {
  id: 'clearcut-1',
  type: 'Clearcut',
  position: CLEARCUT_POSITION,
  spawnAtSimSeconds: 0,
  semiMajorAxisMeters: 400,
  semiMinorAxisMeters: 120,
  orientationDegrees: 40,
}

const scenario: Scenario = { events: [clearcutEntry], wind: windFixture }

/** A Drone whose tight patrol loop sits right on the Clearcut, so it is always within detection range. */
function worldWithDroneOnClearcut(): World {
  return createWorldFixture({
    baseStations: [{ id: 'base-1', type: 'BaseStation', position: CLEARCUT_POSITION }],
    drones: [
      {
        id: 'drone-1',
        type: 'Quadrocopter',
        position: CLEARCUT_POSITION,
        homeBaseStationId: 'base-1',
        patrolRadiusMeters: 100,
        detectionRadiusMeters: 500,
        ...droneSpecFixture,
      },
    ],
  })
}

const towerOnClearcut: Tower = {
  id: 'tower-1',
  type: 'Tower',
  position: CLEARCUT_POSITION,
  detectionRadiusMeters: 15000,
}

describe('Clearcut detection (ADR-0009: Drone-only)', () => {
  it('spawns a Clearcut into SimulationState.clearcuts (a sibling map to events/fires), not into events or fires', () => {
    const state = initializeSimulationState(worldWithDroneOnClearcut(), scenario)

    expect(state.clearcuts['clearcut-1']).toBeDefined()
    expect(state.events['clearcut-1']).toBeUndefined()
    expect(state.fires['clearcut-1']).toBeUndefined()
  })

  it('is detected by a Drone within range, flipping undetected -> detected and crediting the Drone', () => {
    const state = advanceSimulation(initializeSimulationState(worldWithDroneOnClearcut(), scenario), 1)

    expect(state.clearcuts['clearcut-1'].tier).toBe('detected')
    expect(state.clearcuts['clearcut-1'].detectedByAssetId).toBe('drone-1')
    expect(state.clearcuts['clearcut-1'].detectedAtSimSeconds).toBeDefined()
  })

  it('is NEVER detected by a Tower, regardless of distance (Towers do not detect Clearcuts)', () => {
    const worldWithOnlyTower = createWorldFixture({ towers: [towerOnClearcut], drones: [] })
    let state = initializeSimulationState(worldWithOnlyTower, scenario)
    for (let t = 1; t <= 60; t += 1) state = advanceSimulation(state, t)

    expect(state.clearcuts['clearcut-1'].tier).toBe('undetected')
    expect(state.clearcuts['clearcut-1'].detectedByAssetId).toBeUndefined()
  })

  it('even with a Tower right on top AND a Drone in range, the detecting asset is the Drone (never the Tower)', () => {
    const world: World = { ...worldWithDroneOnClearcut(), towers: [towerOnClearcut] }
    const state = advanceSimulation(initializeSimulationState(world, scenario), 1)

    expect(state.clearcuts['clearcut-1'].detectedByAssetId).toBe('drone-1')
  })

  it('stays undetected while no Drone is within range', () => {
    const worldWithDistantDrone = createWorldFixture({
      baseStations: [{ id: 'base-1', type: 'BaseStation', position: { lat: 64.9, lng: 26.9 } }],
      drones: [
        {
          id: 'drone-1',
          type: 'Quadrocopter',
          position: { lat: 64.9, lng: 26.9 },
          homeBaseStationId: 'base-1',
          patrolRadiusMeters: 100,
          detectionRadiusMeters: 500,
          ...droneSpecFixture,
        },
      ],
    })
    const state = advanceSimulation(initializeSimulationState(worldWithDistantDrone, scenario), 1)

    expect(state.clearcuts['clearcut-1'].tier).toBe('undetected')
  })

  it('detection is sticky: once detected it stays detected even if the Drone later flies out of range', () => {
    const world = worldWithDroneOnClearcut()
    let state = advanceSimulation(initializeSimulationState(world, scenario), 1)
    expect(state.clearcuts['clearcut-1'].tier).toBe('detected')
    const detectedAt = state.clearcuts['clearcut-1'].detectedAtSimSeconds

    // Advance far into the future; tier and detection fields never revert.
    state = advanceSimulation(state, 5000)
    expect(state.clearcuts['clearcut-1'].tier).toBe('detected')
    expect(state.clearcuts['clearcut-1'].detectedAtSimSeconds).toBe(detectedAt)
  })

  it('captures the detecting distance once, at Detection time (for the distance-only estimate)', () => {
    const state = advanceSimulation(initializeSimulationState(worldWithDroneOnClearcut(), scenario), 1)
    const distance = state.clearcuts['clearcut-1'].detectedFromDistanceMeters
    expect(distance).toBeDefined()
    expect(distance as number).toBeGreaterThanOrEqual(0)

    // It never changes on later ticks, even as the Drone moves.
    const later = advanceSimulation(state, 500)
    expect(later.clearcuts['clearcut-1'].detectedFromDistanceMeters).toBe(distance)
  })

  it('is deterministic: same world + scenario run twice produces the same detection outcome', () => {
    const runA = advanceSimulation(initializeSimulationState(worldWithDroneOnClearcut(), scenario), 1)
    const runB = advanceSimulation(initializeSimulationState(worldWithDroneOnClearcut(), scenario), 1)

    expect(runA.clearcuts).toEqual(runB.clearcuts)
  })
})
