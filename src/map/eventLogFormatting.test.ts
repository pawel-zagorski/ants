import { describe, expect, it } from 'vitest'
import { compass16, describeLocation, droneLabel, formatEventLogEntry } from './eventLogFormatting'
import { offsetLatLng } from './geo'
import type { EventLogEntry, EventLogKind } from '../engine/eventLog'
import type { Scenario } from '../scenario/types'
import { windFixture } from '../test/worldFixtures'
import type { World } from '../world/types'

const towerPosition = { lat: 64.7, lng: 26.2 }
const basePosition = { lat: 64.5, lng: 26.25 }

const world: World = {
  bounds: { southWest: { lat: 64.0, lng: 25.5 }, northEast: { lat: 65.0, lng: 27.0 } },
  towers: [{ id: 'tower-1', type: 'Tower', position: towerPosition, detectionRadiusMeters: 15000 }],
  baseStations: [{ id: 'base-2', type: 'BaseStation', position: basePosition }],
  drones: [],
}

const scenarioWithEpoch: Scenario = { events: [], wind: windFixture, startDateTimeIso: '2026-06-01T08:00:00.000Z' }
const scenarioWithoutEpoch: Scenario = { events: [], wind: windFixture }

function entry(kind: EventLogKind, overrides: Partial<EventLogEntry> = {}): EventLogEntry {
  return {
    id: 'log-1',
    simSeconds: 0,
    kind,
    severity: 'info',
    ...overrides,
  }
}

describe('formatEventLogEntry timestamp', () => {
  it('renders the full Scenario-Epoch calendar timestamp when startDateTimeIso is present', () => {
    const formatted = formatEventLogEntry(
      entry('droneResumedPatrol', { simSeconds: 3661, droneId: 'drone-1' }),
      scenarioWithEpoch,
      world,
    )
    // 2026-06-01 08:00:00 UTC + 3661s = 09:01:01.
    expect(formatted.timestamp).toBe('2026-06-01 09:01:01')
  })

  it('falls back to an elapsed T+MM:SS timestamp when startDateTimeIso is missing', () => {
    const formatted = formatEventLogEntry(
      entry('droneResumedPatrol', { simSeconds: 125, droneId: 'drone-1' }),
      scenarioWithoutEpoch,
      world,
    )
    expect(formatted.timestamp).toBe('T+02:05')
  })
})

describe('describeLocation', () => {
  it('describes a position as bearing + distance from the nearest Tower', () => {
    // 2500m east + 2500m north of tower-1 => ~3.5 km, due NE.
    const position = offsetLatLng(towerPosition, 2500, 2500)
    expect(describeLocation(position, world)).toBe('3.5 km NE of Tower 1')
  })

  it('prettifies a Base Station id and picks it when it is the nearest asset', () => {
    // 1000m north of base-2, and far from tower-1 (>20km away).
    const position = offsetLatLng(basePosition, 0, 1000)
    expect(describeLocation(position, world)).toBe('1.0 km N of Base 2')
  })

  it('falls back to decimal coordinates when no named asset is reasonably close', () => {
    // ~85km NE of every asset — beyond the nearest-asset threshold.
    const position = offsetLatLng(basePosition, 60000, 60000)
    expect(describeLocation(position, world)).toMatch(/^\d+\.\d{4}°[NS], \d+\.\d{4}°[EW]$/)
  })
})

describe('compass16', () => {
  it('maps cardinal and intercardinal bearings to their labels', () => {
    expect(compass16(0)).toBe('N')
    expect(compass16(45)).toBe('NE')
    expect(compass16(90)).toBe('E')
    expect(compass16(202.5)).toBe('SSW')
    expect(compass16(359)).toBe('N')
  })
})

describe('droneLabel', () => {
  it('includes the model and type label when both are present', () => {
    expect(
      droneLabel(entry('droneGrounded', { droneId: 'drone-1', droneModel: 'DJI Mavic 4 Pro', droneType: 'Quadrocopter' })),
    ).toBe('Drone 1 (DJI Mavic 4 Pro, Quadrocopter)')
  })

  it('uses the Fixed-Wing Drone CONTEXT.md label for a FixedWingDrone type', () => {
    expect(
      droneLabel(entry('droneGrounded', { droneId: 'drone-2', droneModel: 'FlyEye', droneType: 'FixedWingDrone' })),
    ).toBe('Drone 2 (FlyEye, Fixed-Wing Drone)')
  })

  it('falls back to just the Drone name when model/type are absent', () => {
    expect(droneLabel(entry('droneResumedPatrol', { droneId: 'drone-3' }))).toBe('Drone 3')
  })

  it('looks up model and type from the World when the entry omits them (engine-emitted entries)', () => {
    const worldWithDrone: World = {
      ...world,
      drones: [
        {
          id: 'drone-1',
          type: 'Quadrocopter',
          position: basePosition,
          homeBaseStationId: 'base-2',
          model: 'DJI Mavic 4 Pro',
          payload: 'Optical',
          maxEnduranceSimSeconds: 3000,
          cruiseSpeedMetersPerSecond: 10,
          datalinkRangeMeters: 30000,
          imageUrl: '',
        },
      ],
    }
    expect(droneLabel(entry('droneGrounded', { droneId: 'drone-1' }), worldWithDrone)).toBe(
      'Drone 1 (DJI Mavic 4 Pro, Quadrocopter)',
    )
  })
})

describe('formatEventLogEntry text per kind', () => {
  const nearTower = offsetLatLng(towerPosition, 2500, 2500) // 3.5 km NE of Tower 1

  it('formats an eventDetected line with a sentence-case event type', () => {
    const formatted = formatEventLogEntry(
      entry('eventDetected', { eventType: 'PersonSighting', position: nearTower }),
      scenarioWithEpoch,
      world,
    )
    expect(formatted.text).toBe('Person sighting detected 3.5 km NE of Tower 1')
    expect(formatted.severity).toBe('info')
  })

  it('formats a fireDetected line as a warning', () => {
    const formatted = formatEventLogEntry(entry('fireDetected', { fireId: 'fire-1', position: nearTower }), scenarioWithEpoch, world)
    expect(formatted.text).toBe('Fire discovered 3.5 km NE of Tower 1')
    expect(formatted.severity).toBe('warning')
  })

  it('formats a droneDispatchedToEvent line with the rich drone label and lower-case event type', () => {
    const formatted = formatEventLogEntry(
      entry('droneDispatchedToEvent', {
        droneId: 'drone-1',
        droneModel: 'DJI Mavic 4 Pro',
        droneType: 'Quadrocopter',
        eventType: 'FallenTree',
        position: nearTower,
      }),
      scenarioWithEpoch,
      world,
    )
    expect(formatted.text).toBe('Drone 1 (DJI Mavic 4 Pro, Quadrocopter) dispatched to investigate fallen tree 3.5 km NE of Tower 1')
    expect(formatted.severity).toBe('info')
  })

  it('formats a droneDispatchedOneWay line as a warning with the ONE-WAY wording', () => {
    const formatted = formatEventLogEntry(
      entry('droneDispatchedOneWay', { droneId: 'drone-2', droneModel: 'FlyEye', droneType: 'FixedWingDrone', position: nearTower }),
      scenarioWithEpoch,
      world,
    )
    expect(formatted.text).toBe('Drone 2 (FlyEye, Fixed-Wing Drone) dispatched on a ONE-WAY mission to fire 3.5 km NE of Tower 1')
    expect(formatted.severity).toBe('warning')
  })

  it('formats the observed-activity lines with the plain Drone name', () => {
    expect(formatEventLogEntry(entry('droneBeganFireOrbit', { droneId: 'drone-1', position: nearTower }), scenarioWithEpoch, world).text).toBe(
      'Drone 1 reached the fire and began orbiting 3.5 km NE of Tower 1',
    )
    expect(formatEventLogEntry(entry('droneReturningAfterOrbit', { droneId: 'drone-1' }), scenarioWithEpoch, world).text).toBe(
      'Drone 1 finished investigating the fire and is returning to base',
    )
    expect(formatEventLogEntry(entry('droneResumedPatrol', { droneId: 'drone-1' }), scenarioWithEpoch, world).text).toBe(
      'Drone 1 resumed patrolling',
    )
  })

  it('formats recall/grounded/lost lines, with lost as a warning', () => {
    const droneFields = { droneId: 'drone-1', droneModel: 'DJI Mavic 4 Pro', droneType: 'Quadrocopter' as const }
    expect(formatEventLogEntry(entry('droneRecalledToBase', { ...droneFields, position: nearTower }), scenarioWithEpoch, world).text).toBe(
      'Drone 1 (DJI Mavic 4 Pro, Quadrocopter) ordered to return to nearest base (Base 2)',
    )
    expect(formatEventLogEntry(entry('droneGrounded', droneFields), scenarioWithEpoch, world).text).toBe(
      'Drone 1 (DJI Mavic 4 Pro, Quadrocopter) grounded at base — out of service',
    )
    const lost = formatEventLogEntry(entry('droneLost', droneFields), scenarioWithEpoch, world)
    expect(lost.text).toBe('Drone 1 (DJI Mavic 4 Pro, Quadrocopter) lost — endurance exhausted')
    expect(lost.severity).toBe('warning')
  })
})
