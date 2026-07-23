import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ClearcutPanel } from './ClearcutPanel'
import type { ClearcutRuntimeState, DroneActivityState, DronePatrolState, SimulationState } from '../engine/types'
import { droneSpecFixture, windFixture } from '../test/worldFixtures'
import type { BaseStation, Drone } from '../world/types'

const detectedClearcut: ClearcutRuntimeState = {
  id: 'clearcut-1',
  position: { lat: 64.52, lng: 26.25 },
  tier: 'detected',
  spawnAtSimSeconds: 0,
  semiMajorAxisMeters: 400,
  semiMinorAxisMeters: 120,
  orientationDegrees: 40,
  detectedByAssetId: 'drone-2',
  detectedAtSimSeconds: 3725,
  detectedFromDistanceMeters: 900,
}

/** A minimal, valid `SimulationState` fixture, mirroring `FirePanel.test.tsx`'s. */
function simulationStateFixture(overrides: Partial<SimulationState> = {}): SimulationState {
  return {
    elapsedSimSeconds: 0,
    dronePatrol: {},
    droneActivity: {},
    towerDetection: {},
    scenarioEvents: [],
    scenarioFireIgnitions: [],
    scenarioClearcuts: [],
    events: {},
    fires: {},
    clearcuts: {},
    wind: windFixture,
    log: [],
    ...overrides,
  }
}

function patrolFixture(overrides: Partial<DronePatrolState> = {}): DronePatrolState {
  return {
    droneType: 'Quadrocopter',
    patrolCenter: { lat: 64.52, lng: 26.25 },
    patrolRadiusMeters: 250,
    angularSpeedRadiansPerSecond: 0.032,
    phaseOffsetRadians: 0,
    detectionRadiusMeters: 500,
    maxEnduranceSimSeconds: 7200,
    cruiseSpeedMetersPerSecond: 10,
    position: detectedClearcut.position,
    ...overrides,
  }
}

const nearBaseStation: BaseStation = { id: 'base-1', type: 'BaseStation', position: { lat: 64.521, lng: 26.25 } }

describe('ClearcutPanel', () => {
  it('shows the Clearcut id, Type, detecting Drone, calendar date/time, and tier', () => {
    render(
      <ClearcutPanel
        clearcut={detectedClearcut}
        startDateTimeIso="2026-06-01T08:00:00.000Z"
        simulationState={simulationStateFixture()}
        drones={[]}
        baseStations={[]}
        onSend={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    const panel = screen.getByRole('dialog')
    expect(panel).toHaveTextContent('clearcut-1')
    expect(panel).toHaveTextContent('Illegal Deforestation')
    expect(panel).toHaveTextContent('drone-2')
    expect(panel).toHaveTextContent('Detected')
    // 3725s = 1h 2m 5s past the Epoch (2026-06-01T08:00:00Z) => 09:02:05.
    expect(panel).toHaveTextContent('2026-06-01 09:02:05')
  })

  it('shows the logging.jpg banner photo', () => {
    render(
      <ClearcutPanel
        clearcut={detectedClearcut}
        simulationState={simulationStateFixture()}
        drones={[]}
        baseStations={[]}
        onSend={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    const photo = screen.getByRole('img', { name: 'Illegal Deforestation' })
    expect(photo).toHaveAttribute('src', '/img/logging.jpg')
    expect(photo).toHaveClass('asset-panel-photo')
  })

  it('falls back to a raw T+MM:SS display when no Scenario Epoch is available', () => {
    render(
      <ClearcutPanel
        clearcut={detectedClearcut}
        simulationState={simulationStateFixture()}
        drones={[]}
        baseStations={[]}
        onSend={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByRole('dialog')).toHaveTextContent('T+62:05')
  })

  it('shows "Unknown" for Detected By/At when a Clearcut has neither (defensive)', () => {
    const undetectedFields: ClearcutRuntimeState = {
      ...detectedClearcut,
      detectedByAssetId: undefined,
      detectedAtSimSeconds: undefined,
    }
    render(
      <ClearcutPanel
        clearcut={undetectedFields}
        simulationState={simulationStateFixture()}
        drones={[]}
        baseStations={[]}
        onSend={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByRole('dialog')).toHaveTextContent('Unknown')
  })

  it('has NO One-Way Mission section at all (issue Y: a static Clearcut never justifies sacrificing a Drone)', () => {
    render(
      <ClearcutPanel
        clearcut={detectedClearcut}
        simulationState={simulationStateFixture()}
        drones={[]}
        baseStations={[]}
        onSend={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.queryByText('One-Way Mission')).toBeNull()
  })

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn()
    render(
      <ClearcutPanel
        clearcut={detectedClearcut}
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

describe('ClearcutPanel Bingo Range dispatch list (issue Y)', () => {
  it('lists a Drone right on top of the Clearcut, near a Base Station, with plenty of endurance, under "Bingo Range"', () => {
    const bingoDrone: Drone = {
      id: 'bingo-drone',
      type: 'Quadrocopter',
      position: detectedClearcut.position,
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
      <ClearcutPanel
        clearcut={detectedClearcut}
        simulationState={simulationState}
        drones={[bingoDrone]}
        baseStations={[nearBaseStation]}
        onSend={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    const bingoSection = screen.getByText('Bingo Range').closest('.clearcut-panel-drones') as HTMLElement
    expect(within(bingoSection).getByText('bingo-drone')).toBeInTheDocument()
  })

  it('excludes a Drone that could only make a one-way trip — no One-Way Mission fallback list for a Clearcut', () => {
    const oneWayOnlyDrone: Drone = {
      id: 'one-way-only-drone',
      type: 'Quadrocopter',
      position: { lat: 64.9, lng: 26.25 }, // far enough that only the one-way leg is affordable
      homeBaseStationId: 'base-1',
      ...droneSpecFixture,
      cruiseSpeedMetersPerSecond: 10,
      maxEnduranceSimSeconds: 7200,
    }
    const simulationState = simulationStateFixture({
      elapsedSimSeconds: 7200 - 3400,
      dronePatrol: { 'one-way-only-drone': patrolFixture({ position: oneWayOnlyDrone.position }) },
      droneActivity: { 'one-way-only-drone': { mode: 'patrolling' } },
    })

    render(
      <ClearcutPanel
        clearcut={detectedClearcut}
        simulationState={simulationState}
        drones={[oneWayOnlyDrone]}
        baseStations={[nearBaseStation]}
        onSend={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.queryByText('one-way-only-drone')).toBeNull()
    expect(screen.getByText(/no drones? currently in bingo range/i)).toBeInTheDocument()
  })

  it('excludes a Drone that cannot even reach the Clearcut one-way', () => {
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
      <ClearcutPanel
        clearcut={detectedClearcut}
        simulationState={simulationState}
        drones={[unreachableDrone]}
        baseStations={[nearBaseStation]}
        onSend={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.queryByText('unreachable-drone')).toBeNull()
  })

  it('excludes a Drone already investigating/traveling to something else', () => {
    const busyDrone: Drone = {
      id: 'busy-drone',
      type: 'Quadrocopter',
      position: detectedClearcut.position,
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
      <ClearcutPanel
        clearcut={detectedClearcut}
        simulationState={simulationState}
        drones={[busyDrone]}
        baseStations={[nearBaseStation]}
        onSend={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.queryByText('busy-drone')).toBeNull()
  })

  it('excludes a Lost Drone (issue W) outright, never even classified', () => {
    const lostDrone: Drone = {
      id: 'lost-drone',
      type: 'Quadrocopter',
      position: detectedClearcut.position,
      homeBaseStationId: 'base-1',
      ...droneSpecFixture,
      cruiseSpeedMetersPerSecond: 20,
      maxEnduranceSimSeconds: 7200,
    }
    const lostActivity: DroneActivityState = {
      mode: 'lost',
      position: detectedClearcut.position,
      lostAtSimSeconds: 7200,
    }
    const simulationState = simulationStateFixture({
      dronePatrol: { 'lost-drone': patrolFixture() },
      droneActivity: { 'lost-drone': lostActivity },
    })

    render(
      <ClearcutPanel
        clearcut={detectedClearcut}
        simulationState={simulationState}
        drones={[lostDrone]}
        baseStations={[nearBaseStation]}
        onSend={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.queryByText('lost-drone')).toBeNull()
    expect(screen.getByText(/no drones? currently in bingo range/i)).toBeInTheDocument()
  })

  it('shows a message instead of a list when no Drone qualifies, with no "Send" button rendered', () => {
    render(
      <ClearcutPanel
        clearcut={detectedClearcut}
        simulationState={simulationStateFixture()}
        drones={[]}
        baseStations={[]}
        onSend={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByText(/no drones? currently in bingo range/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull()
  })

  it('calls onSend with just the Drone id (no missionKind — always the single Bingo Range list)', () => {
    const onSend = vi.fn()
    const bingoDrone: Drone = {
      id: 'bingo-drone',
      type: 'Quadrocopter',
      position: detectedClearcut.position,
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
      <ClearcutPanel
        clearcut={detectedClearcut}
        simulationState={simulationState}
        drones={[bingoDrone]}
        baseStations={[nearBaseStation]}
        onSend={onSend}
        onClose={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(onSend).toHaveBeenCalledExactlyOnceWith('bingo-drone')
  })
})
