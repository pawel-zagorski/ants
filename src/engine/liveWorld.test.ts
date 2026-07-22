import { describe, expect, it } from 'vitest'
import { withDronePositions } from './liveWorld'
import { initializeSimulationState, advanceSimulation } from './advanceSimulation'
import { createWorldFixture } from '../test/worldFixtures'
import type { World } from '../world/types'

const world: World = createWorldFixture({
  towers: [
    { id: 'tower-1', type: 'Tower', position: { lat: 64.7, lng: 26.2 }, detectionRadiusMeters: 15000 },
  ],
  drones: [
    {
      id: 'quadrocopter-1',
      type: 'Quadrocopter',
      position: { lat: 64.5, lng: 26.25 },
      homeBaseStationId: 'base-1',
    },
  ],
})

describe('withDronePositions', () => {
  it('replaces each Drone position with its current simulated position, leaving Towers/Base Stations untouched', () => {
    const state = advanceSimulation(initializeSimulationState(world), 1234)

    const liveWorld = withDronePositions(world, state)

    expect(liveWorld.drones[0].position).toEqual(state.dronePatrol['quadrocopter-1'].position)
    expect(liveWorld.towers).toBe(world.towers)
    expect(liveWorld.baseStations).toBe(world.baseStations)
  })

  it('does not mutate the original World', () => {
    const state = advanceSimulation(initializeSimulationState(world), 1234)
    const originalDronePosition = { ...world.drones[0].position }

    withDronePositions(world, state)

    expect(world.drones[0].position).toEqual(originalDronePosition)
  })
})
