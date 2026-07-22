import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EventPanel } from './EventPanel'
import type { DroneActivityState, EventRuntimeState, SimulationState } from '../engine/types'
import { droneSpecFixture } from '../test/worldFixtures'
import type { Drone } from '../world/types'

const detectedFallenTree: EventRuntimeState = {
  id: 'event-1',
  type: 'FallenTree',
  position: { lat: 64.55, lng: 26.3 },
  status: 'detected',
  spawnAtSimSeconds: 0,
  detectedByAssetId: 'the-detecting-drone',
  detectedAtSimSeconds: 45,
}

const quadrocopter: Drone = {
  id: 'drone-1',
  type: 'Quadrocopter',
  position: { lat: 64.5, lng: 26.25 },
  homeBaseStationId: 'base-1',
  ...droneSpecFixture,
}

const fixedWingDrone: Drone = {
  id: 'drone-2',
  type: 'FixedWingDrone',
  position: { lat: 64.51, lng: 26.24 },
  homeBaseStationId: 'base-1',
  ...droneSpecFixture,
}

const investigatingActivity: DroneActivityState = {
  mode: 'investigating',
  assignedEventId: 'some-other-event',
  investigationStartedAtSimSeconds: 0,
}

/** A minimal, valid `SimulationState` fixture, mirroring `AssetPanel.test.tsx`'s. */
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

describe('EventPanel', () => {
  it('shows the Event id, type, and Detection Status (which asset detected it, when)', () => {
    render(
      <EventPanel
        event={detectedFallenTree}
        simulationState={simulationStateFixture()}
        drones={[]}
        onSend={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    const panel = screen.getByRole('dialog')
    expect(panel).toHaveTextContent('event-1')
    expect(panel).toHaveTextContent('Fallen Tree')
    expect(panel).toHaveTextContent('the-detecting-drone')
    expect(panel).toHaveTextContent('45')
  })

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn()
    render(
      <EventPanel
        event={detectedFallenTree}
        simulationState={simulationStateFixture()}
        drones={[]}
        onSend={vi.fn()}
        onClose={onClose}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(onClose).toHaveBeenCalledOnce()
  })
})

describe('EventPanel available Drones list (issue O)', () => {
  it('lists every patrolling Drone with a Send button', () => {
    const simulationState = simulationStateFixture({
      droneActivity: { 'drone-1': { mode: 'patrolling' }, 'drone-2': { mode: 'patrolling' } },
    })

    render(
      <EventPanel
        event={detectedFallenTree}
        simulationState={simulationState}
        drones={[quadrocopter, fixedWingDrone]}
        onSend={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByText('drone-1')).toBeInTheDocument()
    expect(screen.getByText('drone-2')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Send' })).toHaveLength(2)
  })

  it('excludes an already-investigating Drone from the list', () => {
    const simulationState = simulationStateFixture({
      droneActivity: { 'drone-1': { mode: 'patrolling' }, 'drone-2': investigatingActivity },
    })

    render(
      <EventPanel
        event={detectedFallenTree}
        simulationState={simulationState}
        drones={[quadrocopter, fixedWingDrone]}
        onSend={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByText('drone-1')).toBeInTheDocument()
    expect(screen.queryByText('drone-2')).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Send' })).toHaveLength(1)
  })

  it('shows a message instead of a list when no Drone is currently available', () => {
    const simulationState = simulationStateFixture({
      droneActivity: { 'drone-1': investigatingActivity },
    })

    render(
      <EventPanel
        event={detectedFallenTree}
        simulationState={simulationState}
        drones={[quadrocopter]}
        onSend={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull()
    expect(screen.getByText(/no drones? (currently )?available/i)).toBeInTheDocument()
  })

  it('calls onSend with the clicked row\'s Drone id', () => {
    const onSend = vi.fn()
    const simulationState = simulationStateFixture({
      droneActivity: { 'drone-1': { mode: 'patrolling' }, 'drone-2': { mode: 'patrolling' } },
    })

    render(
      <EventPanel
        event={detectedFallenTree}
        simulationState={simulationState}
        drones={[quadrocopter, fixedWingDrone]}
        onSend={onSend}
        onClose={vi.fn()}
      />,
    )

    const drone2Row = screen.getByText('drone-2').closest('li') as HTMLElement
    fireEvent.click(within(drone2Row).getByRole('button', { name: 'Send' }))

    expect(onSend).toHaveBeenCalledExactlyOnceWith('drone-2')
  })

  it('treats a Drone missing from droneActivity as available (defaults to patrolling)', () => {
    render(
      <EventPanel
        event={detectedFallenTree}
        simulationState={simulationStateFixture()}
        drones={[quadrocopter]}
        onSend={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByText('drone-1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument()
  })
})
