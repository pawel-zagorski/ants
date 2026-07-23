import { describe, expect, it } from 'vitest'
import { parseWorld, WorldValidationError } from './schema'

const validWorld = {
  bounds: {
    southWest: { lat: 64.3398, lng: 25.9723 },
    northEast: { lat: 64.789, lng: 27.0171 },
  },
  towers: [
    { id: 'tower-1', type: 'Tower', position: { lat: 64.65, lng: 26.2 }, detectionRadiusMeters: 15000 },
  ],
  baseStations: [{ id: 'base-1', type: 'BaseStation', position: { lat: 64.45, lng: 26.3 } }],
  drones: [
    {
      id: 'drone-1',
      type: 'Quadrocopter',
      position: { lat: 64.451, lng: 26.301 },
      homeBaseStationId: 'base-1',
      model: 'DJI Mavic 4 Pro',
      payload: 'Optical',
      maxEnduranceSimSeconds: 3060,
      cruiseSpeedMetersPerSecond: 10,
      datalinkRangeMeters: 30000,
      imageUrl: '/img/dji_mavic_4_pro.jpeg',
    },
  ],
}

describe('parseWorld', () => {
  it('returns a World unchanged when the input matches the schema', () => {
    expect(parseWorld(validWorld)).toEqual(validWorld)
  })

  it('throws a WorldValidationError when the input is not an object', () => {
    expect(() => parseWorld(null)).toThrow(WorldValidationError)
    expect(() => parseWorld('not a world')).toThrow(WorldValidationError)
    expect(() => parseWorld([])).toThrow(WorldValidationError)
  })

  it('throws when a top-level field is missing', () => {
    const withoutTowers: Record<string, unknown> = { ...validWorld }
    delete withoutTowers.towers
    expect(() => parseWorld(withoutTowers)).toThrow(/towers/)
  })

  it('throws when bounds are malformed', () => {
    const badBounds = {
      ...validWorld,
      bounds: { southWest: { lat: 'north', lng: 25.9723 }, northEast: { lat: 64.789, lng: 27.0171 } },
    }
    expect(() => parseWorld(badBounds)).toThrow(/bounds/)
  })

  it('throws when bounds are inverted (southWest not south/west of northEast)', () => {
    const invertedBounds = {
      ...validWorld,
      bounds: { southWest: { lat: 65, lng: 27 }, northEast: { lat: 64, lng: 26 } },
    }
    expect(() => parseWorld(invertedBounds)).toThrow(/bounds/)
  })

  it('throws when a Tower is missing detectionRadiusMeters', () => {
    const badTower = {
      ...validWorld,
      towers: [{ id: 'tower-1', type: 'Tower', position: { lat: 64.65, lng: 26.2 } }],
    }
    expect(() => parseWorld(badTower)).toThrow(/detectionRadiusMeters/)
  })

  it('throws when a Drone has an unknown type', () => {
    const badDrone = {
      ...validWorld,
      drones: [
        {
          id: 'drone-1',
          type: 'Helicopter',
          position: { lat: 64.451, lng: 26.301 },
          homeBaseStationId: 'base-1',
        },
      ],
    }
    expect(() => parseWorld(badDrone)).toThrow(/type/)
  })

  it('accepts a Drone with optional patrol parameter overrides', () => {
    const withPatrolParams = {
      ...validWorld,
      drones: [
        {
          ...validWorld.drones[0],
          patrolRadiusMeters: 400,
          patrolSpeedMetersPerSecond: 10,
        },
      ],
    }
    expect(parseWorld(withPatrolParams)).toEqual(withPatrolParams)
  })

  it('throws when a Drone patrol parameter override is not a positive number', () => {
    const badPatrolRadius = {
      ...validWorld,
      drones: [{ ...validWorld.drones[0], patrolRadiusMeters: -5 }],
    }
    expect(() => parseWorld(badPatrolRadius)).toThrow(/patrolRadiusMeters/)

    const badPatrolSpeed = {
      ...validWorld,
      drones: [{ ...validWorld.drones[0], patrolSpeedMetersPerSecond: 'fast' }],
    }
    expect(() => parseWorld(badPatrolSpeed)).toThrow(/patrolSpeedMetersPerSecond/)
  })

  it('accepts a Drone with an optional detectionRadiusMeters override', () => {
    const withDetectionRadius = {
      ...validWorld,
      drones: [{ ...validWorld.drones[0], detectionRadiusMeters: 750 }],
    }
    expect(parseWorld(withDetectionRadius)).toEqual(withDetectionRadius)
  })

  it('throws when a Drone detectionRadiusMeters override is not a positive number', () => {
    const badDetectionRadius = {
      ...validWorld,
      drones: [{ ...validWorld.drones[0], detectionRadiusMeters: 0 }],
    }
    expect(() => parseWorld(badDetectionRadius)).toThrow(/detectionRadiusMeters/)
  })

  /** Returns a shallow copy of `validWorld.drones[0]` with `field` omitted, for "missing required field" test cases. */
  function droneMissingField(field: keyof typeof validWorld.drones[0]): Record<string, unknown> {
    return Object.fromEntries(Object.entries(validWorld.drones[0]).filter(([key]) => key !== field))
  }

  it('throws when a Drone is missing model, payload, maxEnduranceSimSeconds, cruiseSpeedMetersPerSecond, datalinkRangeMeters, or imageUrl (issue I)', () => {
    expect(() => parseWorld({ ...validWorld, drones: [droneMissingField('model')] })).toThrow(/model/)
    expect(() => parseWorld({ ...validWorld, drones: [droneMissingField('payload')] })).toThrow(/payload/)
    expect(() => parseWorld({ ...validWorld, drones: [droneMissingField('maxEnduranceSimSeconds')] })).toThrow(
      /maxEnduranceSimSeconds/,
    )
    expect(() => parseWorld({ ...validWorld, drones: [droneMissingField('cruiseSpeedMetersPerSecond')] })).toThrow(
      /cruiseSpeedMetersPerSecond/,
    )
    expect(() => parseWorld({ ...validWorld, drones: [droneMissingField('datalinkRangeMeters')] })).toThrow(
      /datalinkRangeMeters/,
    )
    expect(() => parseWorld({ ...validWorld, drones: [droneMissingField('imageUrl')] })).toThrow(/imageUrl/)
  })

  it('throws when a Drone has an invalid payload value', () => {
    const badPayload = {
      ...validWorld,
      drones: [{ ...validWorld.drones[0], payload: 'Infrared' }],
    }
    expect(() => parseWorld(badPayload)).toThrow(/payload/)
  })

  it('accepts a Drone with an optional patrolRoute of valid waypoints (issue AA)', () => {
    const withPatrolRoute = {
      ...validWorld,
      drones: [
        {
          ...validWorld.drones[0],
          patrolRoute: [
            { lat: 64.55, lng: 26.3 },
            { lat: 64.55, lng: 26.05 },
            { lat: 64.45, lng: 26.05 },
          ],
        },
      ],
    }
    expect(parseWorld(withPatrolRoute)).toEqual(withPatrolRoute)
  })

  it('accepts a Drone with an empty patrolRoute (treated as legacy base-station loop)', () => {
    const withEmptyRoute = {
      ...validWorld,
      drones: [{ ...validWorld.drones[0], patrolRoute: [] }],
    }
    expect(parseWorld(withEmptyRoute)).toEqual(withEmptyRoute)
  })

  it('throws when a Drone patrolRoute is not an array', () => {
    const badRoute = {
      ...validWorld,
      drones: [{ ...validWorld.drones[0], patrolRoute: { lat: 64.5, lng: 26.25 } }],
    }
    expect(() => parseWorld(badRoute)).toThrow(/patrolRoute/)
  })

  it('throws when a Drone patrolRoute contains a malformed waypoint', () => {
    const badWaypoint = {
      ...validWorld,
      drones: [
        {
          ...validWorld.drones[0],
          patrolRoute: [{ lat: 64.55, lng: 26.3 }, { lat: 'north', lng: 26.05 }],
        },
      ],
    }
    expect(() => parseWorld(badWaypoint)).toThrow(/patrolRoute/)
  })

  it('throws when a Drone references a homeBaseStationId that does not exist', () => {
    const danglingReference = {
      ...validWorld,
      drones: [{ ...validWorld.drones[0], homeBaseStationId: 'base-does-not-exist' }],
    }
    expect(() => parseWorld(danglingReference)).toThrow(/homeBaseStationId/)
  })

  it('throws when two assets share the same id', () => {
    const duplicateIds = {
      ...validWorld,
      baseStations: [{ id: 'tower-1', type: 'BaseStation', position: { lat: 64.45, lng: 26.3 } }],
    }
    expect(() => parseWorld(duplicateIds)).toThrow(/duplicate/i)
  })

  it('collects multiple issues into one error message', () => {
    const multipleIssues = {
      ...validWorld,
      towers: 'not-an-array',
      baseStations: 'not-an-array',
    }
    try {
      parseWorld(multipleIssues)
      expect.unreachable('expected parseWorld to throw')
    } catch (error) {
      expect(error).toBeInstanceOf(WorldValidationError)
      expect((error as WorldValidationError).issues.length).toBeGreaterThanOrEqual(2)
    }
  })
})
