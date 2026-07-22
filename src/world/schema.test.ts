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

  it('throws when a Drone references a homeBaseStationId that does not exist', () => {
    const danglingReference = {
      ...validWorld,
      drones: [
        {
          id: 'drone-1',
          type: 'Quadrocopter',
          position: { lat: 64.451, lng: 26.301 },
          homeBaseStationId: 'base-does-not-exist',
        },
      ],
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
