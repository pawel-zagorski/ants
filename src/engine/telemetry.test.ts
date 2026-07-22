import { describe, expect, it } from 'vitest'
import { INVESTIGATION_DURATION_SIM_SECONDS } from './dispatch'
import {
  DRONE_MAX_ENDURANCE_SIM_SECONDS,
  baseStationCountsFor,
  batteryPercentAt,
  droneTelemetryFor,
  remainingEnduranceSimSecondsAt,
} from './telemetry'
import type { DroneActivityState, DronePatrolState } from './types'
import type { Drone } from '../world/types'

const patrollingQuadrocopter: DronePatrolState = {
  droneType: 'Quadrocopter',
  patrolCenter: { lat: 64.5, lng: 26.25 },
  patrolRadiusMeters: 250,
  angularSpeedRadiansPerSecond: 0.032,
  phaseOffsetRadians: 0,
  detectionRadiusMeters: 500,
  position: { lat: 64.5, lng: 26.2529 },
}

const patrollingFixedWing: DronePatrolState = {
  ...patrollingQuadrocopter,
  droneType: 'FixedWingDrone',
  patrolRadiusMeters: 2500,
  angularSpeedRadiansPerSecond: 0.01,
}

describe('remainingEnduranceSimSecondsAt / batteryPercentAt', () => {
  it('starts at the full max endurance and 100% battery at elapsedSimSeconds 0', () => {
    expect(remainingEnduranceSimSecondsAt(0)).toBe(DRONE_MAX_ENDURANCE_SIM_SECONDS)
    expect(batteryPercentAt(0)).toBe(100)
  })

  it('decreases linearly as elapsedSimSeconds increases', () => {
    expect(remainingEnduranceSimSecondsAt(DRONE_MAX_ENDURANCE_SIM_SECONDS / 2)).toBe(DRONE_MAX_ENDURANCE_SIM_SECONDS / 2)
    expect(batteryPercentAt(DRONE_MAX_ENDURANCE_SIM_SECONDS / 2)).toBeCloseTo(50, 10)
  })

  it('never goes below zero remaining endurance / 0% battery, even long past max endurance', () => {
    expect(remainingEnduranceSimSecondsAt(DRONE_MAX_ENDURANCE_SIM_SECONDS * 10)).toBe(0)
    expect(batteryPercentAt(DRONE_MAX_ENDURANCE_SIM_SECONDS * 10)).toBe(0)
  })

  it('is a pure, deterministic function of elapsedSimSeconds alone', () => {
    expect(remainingEnduranceSimSecondsAt(1234)).toBe(remainingEnduranceSimSecondsAt(1234))
    expect(batteryPercentAt(1234)).toBe(batteryPercentAt(1234))
  })
})

describe('droneTelemetryFor — patrolling', () => {
  const patrollingActivity: DroneActivityState = { mode: 'patrolling' }

  it('reports state "patrolling", the current position, and no assigned Event', () => {
    const telemetry = droneTelemetryFor(patrollingQuadrocopter, patrollingActivity, 100)

    expect(telemetry.state).toBe('patrolling')
    expect(telemetry.position).toEqual(patrollingQuadrocopter.position)
    expect(telemetry.assignedEventId).toBeUndefined()
  })

  it('reports a non-zero speed derived from angularSpeedRadiansPerSecond * patrolRadiusMeters', () => {
    const telemetry = droneTelemetryFor(patrollingQuadrocopter, patrollingActivity, 100)

    expect(telemetry.speedMetersPerSecond).toBeCloseTo(
      patrollingQuadrocopter.angularSpeedRadiansPerSecond * patrollingQuadrocopter.patrolRadiusMeters,
      6,
    )
  })

  it('reports a defined heading while patrolling', () => {
    const telemetry = droneTelemetryFor(patrollingQuadrocopter, patrollingActivity, 100)

    expect(telemetry.headingDegrees).toBeGreaterThanOrEqual(0)
    expect(telemetry.headingDegrees).toBeLessThan(360)
  })

  it('reports battery/endurance consistent with the standalone battery helpers', () => {
    const telemetry = droneTelemetryFor(patrollingQuadrocopter, patrollingActivity, 500)

    expect(telemetry.batteryPercent).toBe(batteryPercentAt(500))
    expect(telemetry.remainingEnduranceSimSeconds).toBe(remainingEnduranceSimSecondsAt(500))
  })

  it('gives a Fixed-Wing Drone a higher patrol speed than a Quadrocopter with a smaller loop', () => {
    const fixedWingTelemetry = droneTelemetryFor(patrollingFixedWing, patrollingActivity, 100)
    const quadrocopterTelemetry = droneTelemetryFor(patrollingQuadrocopter, patrollingActivity, 100)

    expect(fixedWingTelemetry.speedMetersPerSecond).toBeGreaterThan(quadrocopterTelemetry.speedMetersPerSecond)
  })
})

describe('droneTelemetryFor — investigating', () => {
  const investigatingActivity: DroneActivityState = {
    mode: 'investigating',
    assignedEventId: 'fire-1',
    investigationStartedAtSimSeconds: 100,
  }

  it('reports state "investigating" and the assigned Event id', () => {
    const telemetry = droneTelemetryFor(patrollingQuadrocopter, investigatingActivity, 110)

    expect(telemetry.state).toBe('investigating')
    expect(telemetry.assignedEventId).toBe('fire-1')
  })

  it('reports zero speed and no heading for a hovering (investigating) Quadrocopter', () => {
    const telemetry = droneTelemetryFor(patrollingQuadrocopter, investigatingActivity, 110)

    expect(telemetry.speedMetersPerSecond).toBe(0)
    expect(telemetry.headingDegrees).toBeUndefined()
  })

  it('reports non-zero speed and a defined heading for a circling (investigating) Fixed-Wing Drone', () => {
    const telemetry = droneTelemetryFor(patrollingFixedWing, investigatingActivity, 110)

    expect(telemetry.speedMetersPerSecond).toBeGreaterThan(0)
    expect(telemetry.headingDegrees).toBeGreaterThanOrEqual(0)
  })

  it('does not resume patrol speed math (issue F: investigate position overrides patrol) within INVESTIGATION_DURATION_SIM_SECONDS', () => {
    const telemetry = droneTelemetryFor(
      patrollingQuadrocopter,
      investigatingActivity,
      100 + INVESTIGATION_DURATION_SIM_SECONDS - 1,
    )

    expect(telemetry.state).toBe('investigating')
  })
})

describe('baseStationCountsFor', () => {
  const drones: Drone[] = [
    { id: 'drone-1', type: 'Quadrocopter', position: { lat: 0, lng: 0 }, homeBaseStationId: 'base-1' },
    { id: 'drone-2', type: 'FixedWingDrone', position: { lat: 0, lng: 0 }, homeBaseStationId: 'base-1' },
    { id: 'drone-3', type: 'Quadrocopter', position: { lat: 0, lng: 0 }, homeBaseStationId: 'base-2' },
  ]

  it('counts a patrolling Drone homed at the Base Station as docked', () => {
    const droneActivity: Record<string, DroneActivityState> = {
      'drone-1': { mode: 'patrolling' },
      'drone-2': { mode: 'patrolling' },
      'drone-3': { mode: 'patrolling' },
    }

    expect(baseStationCountsFor('base-1', drones, droneActivity)).toEqual({ docked: 2, deployed: 0 })
  })

  it('counts an investigating Drone homed at the Base Station as deployed', () => {
    const droneActivity: Record<string, DroneActivityState> = {
      'drone-1': { mode: 'investigating', assignedEventId: 'fire-1', investigationStartedAtSimSeconds: 0 },
      'drone-2': { mode: 'patrolling' },
      'drone-3': { mode: 'patrolling' },
    }

    expect(baseStationCountsFor('base-1', drones, droneActivity)).toEqual({ docked: 1, deployed: 1 })
  })

  it('ignores Drones homed at a different Base Station', () => {
    const droneActivity: Record<string, DroneActivityState> = {
      'drone-1': { mode: 'patrolling' },
      'drone-2': { mode: 'patrolling' },
      'drone-3': { mode: 'investigating', assignedEventId: 'fire-1', investigationStartedAtSimSeconds: 0 },
    }

    expect(baseStationCountsFor('base-1', drones, droneActivity)).toEqual({ docked: 2, deployed: 0 })
    expect(baseStationCountsFor('base-2', drones, droneActivity)).toEqual({ docked: 0, deployed: 1 })
  })

  it('every Drone homed at a Base Station lands in exactly one bucket (docked + deployed sums to homed count)', () => {
    const droneActivity: Record<string, DroneActivityState> = {
      'drone-1': { mode: 'investigating', assignedEventId: 'fire-1', investigationStartedAtSimSeconds: 0 },
      'drone-2': { mode: 'patrolling' },
      'drone-3': { mode: 'patrolling' },
    }

    const counts = baseStationCountsFor('base-1', drones, droneActivity)
    expect(counts.docked + counts.deployed).toBe(2)
  })
})
