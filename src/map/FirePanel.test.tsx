import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FirePanel } from './FirePanel'
import type { DroneActivityState, DronePatrolState, FireRuntimeState, SimulationState } from '../engine/types'
import { droneSpecFixture } from '../test/worldFixtures'
import type { BaseStation, Drone } from '../world/types'

const towerDetectedFire: FireRuntimeState = {
  id: 'fire-1',
  position: { lat: 64.6, lng: 26.4 },
  tier: 'towerDetected',
  spawnAtSimSeconds: 0,
  detectedByAssetId: 'tower-1',
  detectedAtSimSeconds: 3725,
}

/** A minimal, valid `SimulationState` fixture, mirroring `EventPanel.test.tsx`'s. */
function simulationStateFixture(overrides: Partial<SimulationState> = {}): SimulationState {
  return {
    elapsedSimSeconds: 0,
    dronePatrol: {},
    droneActivity: {},
    towerDetection: {},
    scenarioEvents: [],
    scenarioFireIgnitions: [],
    events: {},
    fires: {},
    ...overrides,
  }
}

function patrolFixture(overrides: Partial<DronePatrolState> = {}): DronePatrolState {
  return {
    droneType: 'Quadrocopter',
    patrolCenter: { lat: 64.6, lng: 26.4 },
    patrolRadiusMeters: 250,
    angularSpeedRadiansPerSecond: 0.032,
    phaseOffsetRadians: 0,
    detectionRadiusMeters: 500,
    position: towerDetectedFire.position,
    ...overrides,
  }
}

const nearBaseStation: BaseStation = { id: 'base-1', type: 'BaseStation', position: { lat: 64.601, lng: 26.4 } }

describe('FirePanel', () => {
  it('shows the Fire id, current tier, and Detection Status (detecting Tower id and calendar date/time)', () => {
    render(
      <FirePanel
        fire={towerDetectedFire}
        startDateTimeIso="2026-06-01T08:00:00.000Z"
        simulationState={simulationStateFixture()}
        drones={[]}
        baseStations={[]}
        onSend={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    const panel = screen.getByRole('dialog')
    expect(panel).toHaveTextContent('fire-1')
    expect(panel).toHaveTextContent('Tower-Detected')
    expect(panel).toHaveTextContent('tower-1')
    // 3725s = 1h 2m 5s past the Epoch (2026-06-01T08:00:00Z) => 09:02:05.
    expect(panel).toHaveTextContent('2026-06-01 09:02:05')
  })

  it('falls back to a raw T+MM:SS display when no Scenario Epoch is available', () => {
    render(
      <FirePanel
        fire={towerDetectedFire}
        simulationState={simulationStateFixture()}
        drones={[]}
        baseStations={[]}
        onSend={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByRole('dialog')).toHaveTextContent('T+62:05')
  })

  it('shows "Unknown" for Detected By/Detected At when a Fire has neither (defensive; not reachable for a clickable Fire)', () => {
    const fireWithNoDetection: FireRuntimeState = {
      id: 'fire-2',
      position: { lat: 64.6, lng: 26.4 },
      tier: 'towerDetected',
      spawnAtSimSeconds: 0,
    }

    render(
      <FirePanel
        fire={fireWithNoDetection}
        simulationState={simulationStateFixture()}
        drones={[]}
        baseStations={[]}
        onSend={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    const panel = screen.getByRole('dialog')
    expect(panel).toHaveTextContent('Unknown')
  })

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn()
    render(
      <FirePanel
        fire={towerDetectedFire}
        simulationState={simulationStateFixture()}
        drones={[]}
        baseStations={[]}
        onSend={vi.fn()}
        onClose={onClose}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(onClose).toHaveBeenCalledOnce()
  })
})

describe('FirePanel Bingo Range / One-Way Mission lists (issue U)', () => {
  it('lists a Drone right on top of the Fire, near a Base Station, with plenty of endurance, under "Bingo Range"', () => {
    const bingoDrone: Drone = {
      id: 'bingo-drone',
      type: 'Quadrocopter',
      position: towerDetectedFire.position,
      homeBaseStationId: 'base-1',
      ...droneSpecFixture,
      cruiseSpeedMetersPerSecond: 20,
      maxEnduranceSimSeconds: 7200,
    }
    const simulationState = simulationStateFixture({
      dronePatrol: { 'bingo-drone': patrolFixture() },
      droneActivity: { 'bingo-drone': { mode: 'patrolling' } },
    })

    render(
      <FirePanel
        fire={towerDetectedFire}
        simulationState={simulationState}
        drones={[bingoDrone]}
        baseStations={[nearBaseStation]}
        onSend={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    const bingoSection = screen.getByText('Bingo Range').closest('.fire-panel-drones') as HTMLElement
    expect(within(bingoSection).getByText('bingo-drone')).toBeInTheDocument()
    const oneWaySection = screen.getByText('One-Way Mission').closest('.fire-panel-drones') as HTMLElement
    expect(within(oneWaySection).queryByText('bingo-drone')).toBeNull()
  })

  it('lists a Drone that can reach the Fire but not safely return under "One-Way Mission" only', () => {
    const oneWayDrone: Drone = {
      id: 'one-way-drone',
      type: 'Quadrocopter',
      position: { lat: 64.9, lng: 26.4 }, // ~33.4km from the Fire
      homeBaseStationId: 'base-1',
      ...droneSpecFixture,
      cruiseSpeedMetersPerSecond: 10,
      maxEnduranceSimSeconds: 7200,
    }
    // Remaining budget (3400s * 10 m/s = 34,000m) comfortably clears the
    // ~33,396m one-way leg to the Fire, but falls short of the round trip
    // (one-way leg + one orbit lap + the ~111m leg back to the nearby Base
    // Station, ~35,392m total).
    const simulationState = simulationStateFixture({
      elapsedSimSeconds: 7200 - 3400,
      dronePatrol: { 'one-way-drone': patrolFixture({ position: oneWayDrone.position }) },
      droneActivity: { 'one-way-drone': { mode: 'patrolling' } },
    })

    render(
      <FirePanel
        fire={towerDetectedFire}
        simulationState={simulationState}
        drones={[oneWayDrone]}
        baseStations={[nearBaseStation]}
        onSend={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    const oneWaySection = screen.getByText('One-Way Mission').closest('.fire-panel-drones') as HTMLElement
    expect(within(oneWaySection).getByText('one-way-drone')).toBeInTheDocument()
    const bingoSection = screen.getByText('Bingo Range').closest('.fire-panel-drones') as HTMLElement
    expect(within(bingoSection).queryByText('one-way-drone')).toBeNull()
  })

  it('excludes a Drone that cannot even reach the Fire one-way from both lists', () => {
    const unreachableDrone: Drone = {
      id: 'unreachable-drone',
      type: 'Quadrocopter',
      position: { lat: 66, lng: 30 }, // hundreds of km away
      homeBaseStationId: 'base-1',
      ...droneSpecFixture,
      cruiseSpeedMetersPerSecond: 10,
      maxEnduranceSimSeconds: 100,
    }
    const simulationState = simulationStateFixture({
      dronePatrol: { 'unreachable-drone': patrolFixture({ position: unreachableDrone.position }) },
      droneActivity: { 'unreachable-drone': { mode: 'patrolling' } },
    })

    render(
      <FirePanel
        fire={towerDetectedFire}
        simulationState={simulationState}
        drones={[unreachableDrone]}
        baseStations={[nearBaseStation]}
        onSend={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.queryByText('unreachable-drone')).toBeNull()
  })

  it('excludes a Drone already investigating an Event/Fire from both lists', () => {
    const busyDrone: Drone = {
      id: 'busy-drone',
      type: 'Quadrocopter',
      position: towerDetectedFire.position,
      homeBaseStationId: 'base-1',
      ...droneSpecFixture,
      cruiseSpeedMetersPerSecond: 20,
      maxEnduranceSimSeconds: 7200,
    }
    const busyActivity: DroneActivityState = {
      mode: 'investigating',
      assignedEventId: 'some-other-event',
      investigationStartedAtSimSeconds: 0,
    }
    const simulationState = simulationStateFixture({
      dronePatrol: { 'busy-drone': patrolFixture() },
      droneActivity: { 'busy-drone': busyActivity },
    })

    render(
      <FirePanel
        fire={towerDetectedFire}
        simulationState={simulationState}
        drones={[busyDrone]}
        baseStations={[nearBaseStation]}
        onSend={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.queryByText('busy-drone')).toBeNull()
  })

  it('shows a message instead of a list when no Drone qualifies for a given list', () => {
    render(
      <FirePanel
        fire={towerDetectedFire}
        simulationState={simulationStateFixture()}
        drones={[]}
        baseStations={[]}
        onSend={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByText(/no drones? currently in bingo range/i)).toBeInTheDocument()
    expect(screen.getByText(/no drones? available for a one-way mission/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull()
  })

  it('calls onSend with the Drone id and missionKind "roundTrip" from the Bingo Range list', () => {
    const onSend = vi.fn()
    const bingoDrone: Drone = {
      id: 'bingo-drone',
      type: 'Quadrocopter',
      position: towerDetectedFire.position,
      homeBaseStationId: 'base-1',
      ...droneSpecFixture,
      cruiseSpeedMetersPerSecond: 20,
      maxEnduranceSimSeconds: 7200,
    }
    const simulationState = simulationStateFixture({
      dronePatrol: { 'bingo-drone': patrolFixture() },
      droneActivity: { 'bingo-drone': { mode: 'patrolling' } },
    })

    render(
      <FirePanel
        fire={towerDetectedFire}
        simulationState={simulationState}
        drones={[bingoDrone]}
        baseStations={[nearBaseStation]}
        onSend={onSend}
        onClose={vi.fn()}
      />,
    )

    const bingoSection = screen.getByText('Bingo Range').closest('.fire-panel-drones') as HTMLElement
    fireEvent.click(within(bingoSection).getByRole('button', { name: 'Send' }))

    expect(onSend).toHaveBeenCalledExactlyOnceWith('bingo-drone', 'roundTrip')
  })

  it('calls onSend with the Drone id and missionKind "oneWay" from the One-Way Mission list', () => {
    const onSend = vi.fn()
    const oneWayDrone: Drone = {
      id: 'one-way-drone',
      type: 'Quadrocopter',
      position: { lat: 64.9, lng: 26.4 },
      homeBaseStationId: 'base-1',
      ...droneSpecFixture,
      cruiseSpeedMetersPerSecond: 10,
      maxEnduranceSimSeconds: 7200,
    }
    const simulationState = simulationStateFixture({
      elapsedSimSeconds: 7200 - 3400,
      dronePatrol: { 'one-way-drone': patrolFixture({ position: oneWayDrone.position }) },
      droneActivity: { 'one-way-drone': { mode: 'patrolling' } },
    })

    render(
      <FirePanel
        fire={towerDetectedFire}
        simulationState={simulationState}
        drones={[oneWayDrone]}
        baseStations={[nearBaseStation]}
        onSend={onSend}
        onClose={vi.fn()}
      />,
    )

    const oneWaySection = screen.getByText('One-Way Mission').closest('.fire-panel-drones') as HTMLElement
    fireEvent.click(within(oneWaySection).getByRole('button', { name: 'Send' }))

    expect(onSend).toHaveBeenCalledExactlyOnceWith('one-way-drone', 'oneWay')
  })
})
