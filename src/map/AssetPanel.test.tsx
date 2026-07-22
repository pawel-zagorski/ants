import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AssetPanel } from './AssetPanel'
import type { DroneActivityState, DronePatrolState, FireRuntimeState, SimulationState } from '../engine/types'
import { droneSpecFixture, windFixture } from '../test/worldFixtures'
import type { BaseStation, Drone, Tower } from '../world/types'

const tower: Tower = {
  id: 'tower-1',
  type: 'Tower',
  position: { lat: 64.7, lng: 26.2 },
  detectionRadiusMeters: 15000,
}

const drone: Drone = {
  id: 'drone-1',
  type: 'Quadrocopter',
  position: { lat: 64.502, lng: 26.252 },
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

const baseStation: BaseStation = {
  id: 'base-1',
  type: 'BaseStation',
  position: { lat: 64.5, lng: 26.25 },
}

const patrollingPatrol: DronePatrolState = {
  droneType: 'Quadrocopter',
  patrolCenter: { lat: 64.5, lng: 26.25 },
  patrolRadiusMeters: 250,
  angularSpeedRadiansPerSecond: 0.032,
  phaseOffsetRadians: 0,
  detectionRadiusMeters: 500,
  maxEnduranceSimSeconds: drone.maxEnduranceSimSeconds,
  cruiseSpeedMetersPerSecond: 10,
  position: drone.position,
}

const fixedWingPatrol: DronePatrolState = {
  ...patrollingPatrol,
  droneType: 'FixedWingDrone',
  patrolRadiusMeters: 2500,
  angularSpeedRadiansPerSecond: 0.01,
  position: fixedWingDrone.position,
}

/** A minimal, valid `SimulationState` fixture — callers override just the fields their test cares about. */
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
    wind: windFixture,
    ...overrides,
  }
}

describe('AssetPanel', () => {
  it('shows the asset id, type, and position', () => {
    render(<AssetPanel asset={tower} simulationState={simulationStateFixture()} drones={[]} onClose={vi.fn()} />)

    expect(screen.getByText('tower-1')).toBeInTheDocument()
    expect(screen.getByText('Tower')).toBeInTheDocument()
    expect(screen.getByText('64.7000, 26.2000')).toBeInTheDocument()
  })

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn()
    render(<AssetPanel asset={tower} simulationState={simulationStateFixture()} drones={[]} onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(onClose).toHaveBeenCalledOnce()
  })
})

describe('AssetPanel Tower tracked Fire', () => {
  it('shows "no Fire detected" when the Tower has not Detected one', () => {
    render(<AssetPanel asset={tower} simulationState={simulationStateFixture()} drones={[]} onClose={vi.fn()} />)

    expect(screen.getByText('Tracking')).toBeInTheDocument()
    expect(screen.getByText(/no fire detected/i)).toBeInTheDocument()
  })

  it('shows the Fire id the Tower is currently tracking', () => {
    const fires: Record<string, FireRuntimeState> = {
      'fire-1': {
        id: 'fire-1',
        position: { lat: 64.701, lng: 26.201 },
        tier: 'towerDetected',
        spawnAtSimSeconds: 0,
        detectedByAssetId: 'tower-1',
      },
    }

    render(<AssetPanel asset={tower} simulationState={simulationStateFixture({ fires })} drones={[]} onClose={vi.fn()} />)

    expect(screen.getByText(/fire-1/)).toBeInTheDocument()
  })

  it('does not show a Fire Detected by a different asset', () => {
    const fires: Record<string, FireRuntimeState> = {
      'fire-1': {
        id: 'fire-1',
        position: { lat: 64.701, lng: 26.201 },
        tier: 'towerDetected',
        spawnAtSimSeconds: 0,
        detectedByAssetId: 'drone-1',
      },
    }

    render(<AssetPanel asset={tower} simulationState={simulationStateFixture({ fires })} drones={[]} onClose={vi.fn()} />)

    expect(screen.getByText(/no fire detected/i)).toBeInTheDocument()
  })

  it('does not show a Tracking field for a non-Tower asset', () => {
    render(<AssetPanel asset={drone} simulationState={simulationStateFixture()} drones={[]} onClose={vi.fn()} />)

    expect(screen.queryByText('Tracking')).toBeNull()
  })
})

describe('AssetPanel Drone telemetry (issue G)', () => {
  it('shows State, Battery, Speed, Heading, Assigned Event, and Flight Endurance Remaining for a patrolling Drone', () => {
    const simulationState = simulationStateFixture({
      dronePatrol: { 'drone-1': patrollingPatrol },
      droneActivity: { 'drone-1': { mode: 'patrolling' } },
    })

    render(<AssetPanel asset={drone} simulationState={simulationState} drones={[drone]} onClose={vi.fn()} />)

    const panel = screen.getByRole('dialog')
    expect(panel).toHaveTextContent('State')
    expect(panel).toHaveTextContent('Patrolling')
    expect(panel).toHaveTextContent('Battery')
    expect(panel).toHaveTextContent('100%')
    expect(panel).toHaveTextContent('Speed')
    expect(panel).toHaveTextContent('Heading')
    expect(panel).toHaveTextContent('Assigned Event')
    expect(panel).toHaveTextContent('None')
    expect(panel).toHaveTextContent('Flight Endurance Remaining')
  })

  it('shows the assigned Event id and "Investigating" state for an investigating Drone', () => {
    const investigatingActivity: DroneActivityState = {
      mode: 'investigating',
      assignedEventId: 'fire-1',
      investigationStartedAtSimSeconds: 0,
    }
    const simulationState = simulationStateFixture({
      elapsedSimSeconds: 5,
      dronePatrol: { 'drone-1': patrollingPatrol },
      droneActivity: { 'drone-1': investigatingActivity },
    })

    render(<AssetPanel asset={drone} simulationState={simulationState} drones={[drone]} onClose={vi.fn()} />)

    const panel = screen.getByRole('dialog')
    expect(panel).toHaveTextContent('Investigating')
    expect(panel).toHaveTextContent('fire-1')
  })

  it('shows a hovering-specific heading label for an investigating Quadrocopter', () => {
    const investigatingActivity: DroneActivityState = {
      mode: 'investigating',
      assignedEventId: 'fire-1',
      investigationStartedAtSimSeconds: 0,
    }
    const simulationState = simulationStateFixture({
      elapsedSimSeconds: 5,
      dronePatrol: { 'drone-1': patrollingPatrol },
      droneActivity: { 'drone-1': investigatingActivity },
    })

    render(<AssetPanel asset={drone} simulationState={simulationState} drones={[drone]} onClose={vi.fn()} />)

    expect(screen.getByText('N/A (hovering)')).toBeInTheDocument()
  })

  it('shows a numeric heading for a patrolling Fixed-Wing Drone', () => {
    const simulationState = simulationStateFixture({
      dronePatrol: { 'drone-2': fixedWingPatrol },
      droneActivity: { 'drone-2': { mode: 'patrolling' } },
    })

    render(<AssetPanel asset={fixedWingDrone} simulationState={simulationState} drones={[fixedWingDrone]} onClose={vi.fn()} />)

    expect(screen.queryByText('N/A (hovering)')).toBeNull()
  })

  it('shows the assigned Fire id and its missionKind, not an assigned Event id, for a Fire-investigating Drone (issue U)', () => {
    const investigatingFireActivity: DroneActivityState = {
      mode: 'investigatingFire',
      assignedFireId: 'fire-1',
      investigationStartedAtSimSeconds: 0,
      missionKind: 'oneWay',
      orbitRadiusMeters: 300,
    }
    const simulationState = simulationStateFixture({
      elapsedSimSeconds: 5,
      dronePatrol: { 'drone-1': patrollingPatrol },
      droneActivity: { 'drone-1': investigatingFireActivity },
    })

    render(<AssetPanel asset={drone} simulationState={simulationState} drones={[drone]} onClose={vi.fn()} />)

    const panel = screen.getByRole('dialog')
    expect(panel).toHaveTextContent('Investigating')
    expect(panel).toHaveTextContent('Assigned Fire')
    expect(panel).toHaveTextContent('fire-1')
    expect(panel).toHaveTextContent('One-Way Mission')
    expect(panel).toHaveTextContent('None') // Assigned Event still shows "None"
  })

  it('does not show an "Assigned Fire" row for a patrolling or Event-investigating Drone', () => {
    const simulationState = simulationStateFixture({
      dronePatrol: { 'drone-1': patrollingPatrol },
      droneActivity: { 'drone-1': { mode: 'patrolling' } },
    })

    render(<AssetPanel asset={drone} simulationState={simulationState} drones={[drone]} onClose={vi.fn()} />)

    expect(screen.queryByText('Assigned Fire')).toBeNull()
  })

  it('does not show Drone telemetry fields for a non-Drone asset', () => {
    render(<AssetPanel asset={tower} simulationState={simulationStateFixture()} drones={[]} onClose={vi.fn()} />)

    expect(screen.queryByText('Battery')).toBeNull()
    expect(screen.queryByText('Flight Endurance Remaining')).toBeNull()
  })
})

describe('AssetPanel Drone photo + Model/Payload (issue J)', () => {
  it("shows the Drone's own photo and its Model/Payload rows", () => {
    const mavic: Drone = { ...drone, model: 'DJI Mavic 4 Pro', payload: 'Optical', imageUrl: '/img/dji_mavic_4_pro.jpeg' }

    render(<AssetPanel asset={mavic} simulationState={simulationStateFixture()} drones={[mavic]} onClose={vi.fn()} />)

    const photo = screen.getByRole('img', { name: 'DJI Mavic 4 Pro' })
    expect(photo).toHaveAttribute('src', '/img/dji_mavic_4_pro.jpeg')
    expect(screen.getByText('Model')).toBeInTheDocument()
    expect(screen.getByText('DJI Mavic 4 Pro')).toBeInTheDocument()
    expect(screen.getByText('Payload')).toBeInTheDocument()
    expect(screen.getByText('Optical')).toBeInTheDocument()
  })

  it("shows a different Drone's own distinct photo and Model/Payload rows", () => {
    const matrice: Drone = { ...fixedWingDrone, model: 'DJI Matrice 4T', payload: 'Thermal', imageUrl: '/img/dji_matrice_4t.webp' }

    render(<AssetPanel asset={matrice} simulationState={simulationStateFixture()} drones={[matrice]} onClose={vi.fn()} />)

    const photo = screen.getByRole('img', { name: 'DJI Matrice 4T' })
    expect(photo).toHaveAttribute('src', '/img/dji_matrice_4t.webp')
    expect(screen.getByText('DJI Matrice 4T')).toBeInTheDocument()
    expect(screen.getByText('Thermal')).toBeInTheDocument()
  })

  it('does not show a photo or Model/Payload rows for a Tower', () => {
    render(<AssetPanel asset={tower} simulationState={simulationStateFixture()} drones={[]} onClose={vi.fn()} />)

    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.queryByText('Model')).toBeNull()
    expect(screen.queryByText('Payload')).toBeNull()
  })

  it('does not show a photo or Model/Payload rows for a Base Station', () => {
    render(<AssetPanel asset={baseStation} simulationState={simulationStateFixture()} drones={[]} onClose={vi.fn()} />)

    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.queryByText('Model')).toBeNull()
    expect(screen.queryByText('Payload')).toBeNull()
  })
})

describe('AssetPanel Base Station telemetry (issue G)', () => {
  it('shows docked vs. deployed Drone counts and Operational status', () => {
    const simulationState = simulationStateFixture({
      droneActivity: {
        'drone-1': { mode: 'patrolling' },
        'drone-2': { mode: 'investigating', assignedEventId: 'fire-1', investigationStartedAtSimSeconds: 0 },
      },
    })

    render(
      <AssetPanel asset={baseStation} simulationState={simulationState} drones={[drone, fixedWingDrone]} onClose={vi.fn()} />,
    )

    const panel = screen.getByRole('dialog')
    expect(panel).toHaveTextContent('Operational Status')
    expect(panel).toHaveTextContent('Operational')

    const dockedValue = screen.getByText('Docked Drones').nextElementSibling
    const deployedValue = screen.getByText('Deployed Drones').nextElementSibling
    expect(dockedValue).toHaveTextContent('1')
    expect(deployedValue).toHaveTextContent('1')
  })

  it('counts a Fire-investigating Drone (issue U: mode "investigatingFire") as deployed too', () => {
    const simulationState = simulationStateFixture({
      droneActivity: {
        'drone-1': { mode: 'patrolling' },
        'drone-2': {
          mode: 'investigatingFire',
          assignedFireId: 'fire-1',
          investigationStartedAtSimSeconds: 0,
          missionKind: 'roundTrip',
          orbitRadiusMeters: 300,
        },
      },
    })

    render(
      <AssetPanel asset={baseStation} simulationState={simulationState} drones={[drone, fixedWingDrone]} onClose={vi.fn()} />,
    )

    const dockedValue = screen.getByText('Docked Drones').nextElementSibling
    const deployedValue = screen.getByText('Deployed Drones').nextElementSibling
    expect(dockedValue).toHaveTextContent('1')
    expect(deployedValue).toHaveTextContent('1')
  })

  it('does not show Base Station telemetry fields for a non-Base-Station asset', () => {
    render(<AssetPanel asset={tower} simulationState={simulationStateFixture()} drones={[]} onClose={vi.fn()} />)

    expect(screen.queryByText('Docked Drones')).toBeNull()
  })
})
