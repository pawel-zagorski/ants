import { render } from '@testing-library/react'
import { MapContainer } from 'react-leaflet'
import { describe, expect, it } from 'vitest'
import { DroneFlightPaths } from './DroneFlightPaths'
import type { DroneActivityState, DronePatrolState, EventRuntimeState, FireRuntimeState, SimulationState } from '../engine/types'
import type { LatLng } from './geo'

const BASE: LatLng = { lat: 64.5, lng: 26.25 }
const EVENT_POSITION: LatLng = { lat: 64.55, lng: 26.4 }
const FIRE_POSITION: LatLng = { lat: 64.7, lng: 26.2 }

function patrolFixture(overrides: Partial<DronePatrolState> = {}): DronePatrolState {
  return {
    droneType: 'Quadrocopter',
    patrolCenter: BASE,
    patrolRadiusMeters: 250,
    angularSpeedRadiansPerSecond: 8 / 250,
    phaseOffsetRadians: 0,
    detectionRadiusMeters: 500,
    maxEnduranceSimSeconds: 7200,
    cruiseSpeedMetersPerSecond: 10,
    position: { lat: 64.52, lng: 26.3 },
    ...overrides,
  }
}

function stateFixture(
  droneActivity: Record<string, DroneActivityState>,
  dronePatrol: Record<string, DronePatrolState>,
  events: Record<string, EventRuntimeState> = {},
  fires: Record<string, FireRuntimeState> = {},
): SimulationState {
  return {
    elapsedSimSeconds: 0,
    dronePatrol,
    droneActivity,
    towerDetection: {},
    scenarioEvents: [],
    scenarioFireIgnitions: [],
    events,
    fires,
    wind: { directionDegrees: 90, speedMetersPerSecond: 5 },
    log: [],
  }
}

const event: EventRuntimeState = {
  id: 'event-1',
  type: 'FallenTree',
  position: EVENT_POSITION,
  status: 'detected',
  spawnAtSimSeconds: 0,
}

const fire: FireRuntimeState = { id: 'fire-1', position: FIRE_POSITION, tier: 'investigated', spawnAtSimSeconds: 0 }

function renderLayer(state: SimulationState) {
  return render(
    <MapContainer center={[64.5644, 26.4947]} zoom={9}>
      <DroneFlightPaths simulationState={state} />
    </MapContainer>,
  )
}

describe('DroneFlightPaths', () => {
  it('renders nothing for a patrolling Drone', () => {
    renderLayer(stateFixture({ 'drone-1': { mode: 'patrolling' } }, { 'drone-1': patrolFixture() }))

    expect(document.querySelectorAll('path.drone-trajectory')).toHaveLength(0)
    expect(document.querySelectorAll('path.drone-orbit')).toHaveLength(0)
  })

  it('renders one black trajectory line for an investigating Drone', () => {
    renderLayer(
      stateFixture(
        { 'drone-1': { mode: 'investigating', assignedEventId: 'event-1', investigationStartedAtSimSeconds: 0 } },
        { 'drone-1': patrolFixture() },
        { 'event-1': event },
      ),
    )

    const line = document.querySelector('path.drone-trajectory')
    expect(line).not.toBeNull()
    expect(line?.getAttribute('stroke')).toBe('#000000')
    expect(document.querySelectorAll('path.drone-orbit')).toHaveLength(0)
  })

  it('renders a trajectory line for a travelingToFire Drone (not an orbit yet)', () => {
    renderLayer(
      stateFixture(
        {
          'drone-1': {
            mode: 'travelingToFire',
            assignedFireId: 'fire-1',
            departurePosition: BASE,
            departureSimSeconds: 0,
            missionKind: 'roundTrip',
            orbitRadiusMeters: 800,
          },
        },
        { 'drone-1': patrolFixture() },
        {},
        { 'fire-1': fire },
      ),
    )

    expect(document.querySelectorAll('path.drone-trajectory')).toHaveLength(1)
    expect(document.querySelectorAll('path.drone-orbit')).toHaveLength(0)
  })

  it('renders a trajectory line for a returningToBase Drone', () => {
    renderLayer(
      stateFixture(
        { 'drone-1': { mode: 'returningToBase', departurePosition: FIRE_POSITION, returnStartedAtSimSeconds: 0 } },
        { 'drone-1': patrolFixture() },
      ),
    )

    expect(document.querySelectorAll('path.drone-trajectory')).toHaveLength(1)
    expect(document.querySelectorAll('path.drone-orbit')).toHaveLength(0)
  })

  it('renders one black orbit circle (no trajectory) for a Drone investigating a Fire', () => {
    renderLayer(
      stateFixture(
        {
          'drone-1': {
            mode: 'investigatingFire',
            assignedFireId: 'fire-1',
            investigationStartedAtSimSeconds: 0,
            missionKind: 'roundTrip',
            orbitRadiusMeters: 950,
          },
        },
        { 'drone-1': patrolFixture() },
        {},
        { 'fire-1': fire },
      ),
    )

    const orbit = document.querySelector('path.drone-orbit')
    expect(orbit).not.toBeNull()
    expect(orbit?.getAttribute('stroke')).toBe('#000000')
    expect(document.querySelectorAll('path.drone-trajectory')).toHaveLength(0)
  })

  it('renders a flight path for every relevant Drone, not only one', () => {
    renderLayer(
      stateFixture(
        {
          'drone-1': { mode: 'investigating', assignedEventId: 'event-1', investigationStartedAtSimSeconds: 0 },
          'drone-2': {
            mode: 'investigatingFire',
            assignedFireId: 'fire-1',
            investigationStartedAtSimSeconds: 0,
            missionKind: 'roundTrip',
            orbitRadiusMeters: 700,
          },
          'drone-3': { mode: 'patrolling' },
        },
        { 'drone-1': patrolFixture(), 'drone-2': patrolFixture(), 'drone-3': patrolFixture() },
        { 'event-1': event },
        { 'fire-1': fire },
      ),
    )

    expect(document.querySelectorAll('path.drone-trajectory')).toHaveLength(1)
    expect(document.querySelectorAll('path.drone-orbit')).toHaveLength(1)
  })

  it('renders nothing at all when no Drone is flying anywhere', () => {
    renderLayer(stateFixture({}, {}))

    expect(document.querySelectorAll('path.drone-trajectory')).toHaveLength(0)
    expect(document.querySelectorAll('path.drone-orbit')).toHaveLength(0)
  })
})
