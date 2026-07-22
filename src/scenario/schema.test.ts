import { describe, expect, it } from 'vitest'
import { parseScenario, ScenarioValidationError } from './schema'

const validScenario = {
  startDateTimeIso: '2025-06-14T12:00:00Z',
  events: [
    {
      id: 'event-1',
      type: 'FallenTree',
      position: { lat: 64.51, lng: 26.3 },
      spawnAtSimSeconds: 30,
      durationSimSeconds: 600,
    },
    {
      id: 'fire-1',
      type: 'Fire',
      position: { lat: 64.6, lng: 26.4 },
      spawnAtSimSeconds: 120,
    },
  ],
  wind: { directionDegrees: 225, speedMetersPerSecond: 8 },
}

describe('parseScenario', () => {
  it('returns a Scenario unchanged when the input matches the schema, with Events and a Fire ignition sharing one timed list', () => {
    expect(parseScenario(validScenario)).toEqual(validScenario)
  })

  it('throws a ScenarioValidationError when the input is not an object', () => {
    expect(() => parseScenario(null)).toThrow(ScenarioValidationError)
    expect(() => parseScenario('not a scenario')).toThrow(ScenarioValidationError)
    expect(() => parseScenario([])).toThrow(ScenarioValidationError)
  })

  it('throws when events is missing', () => {
    expect(() => parseScenario({})).toThrow(/events/)
  })

  it('throws when events is not an array', () => {
    expect(() => parseScenario({ events: 'not-an-array' })).toThrow(/events/)
  })

  it('throws when an Event has an unknown type', () => {
    const badType = {
      events: [{ id: 'event-1', type: 'Meteor', position: { lat: 64.5, lng: 26.3 }, spawnAtSimSeconds: 0 }],
    }
    expect(() => parseScenario(badType)).toThrow(/type/)
  })

  it('throws when an Event position is malformed', () => {
    const badPosition = {
      events: [{ id: 'event-1', type: 'FallenTree', position: { lat: 'north', lng: 26.3 }, spawnAtSimSeconds: 0 }],
    }
    expect(() => parseScenario(badPosition)).toThrow(/position/)
  })

  it('throws when spawnAtSimSeconds is missing or negative', () => {
    const missing = { events: [{ id: 'event-1', type: 'FallenTree', position: { lat: 64.5, lng: 26.3 } }] }
    expect(() => parseScenario(missing)).toThrow(/spawnAtSimSeconds/)

    const negative = {
      events: [{ id: 'event-1', type: 'FallenTree', position: { lat: 64.5, lng: 26.3 }, spawnAtSimSeconds: -5 }],
    }
    expect(() => parseScenario(negative)).toThrow(/spawnAtSimSeconds/)
  })

  it('throws when an Event\'s durationSimSeconds is present but not a positive number', () => {
    const badDuration = {
      events: [
        {
          id: 'event-1',
          type: 'FallenTree',
          position: { lat: 64.5, lng: 26.3 },
          spawnAtSimSeconds: 0,
          durationSimSeconds: -1,
        },
      ],
    }
    expect(() => parseScenario(badDuration)).toThrow(/durationSimSeconds/)
  })

  it('throws when startDateTimeIso is missing (the Scenario Epoch, CONTEXT.md)', () => {
    const { startDateTimeIso, ...missingEpoch } = validScenario
    expect(startDateTimeIso).toBeDefined()
    expect(() => parseScenario(missingEpoch)).toThrow(/startDateTimeIso/)
  })

  it('throws when startDateTimeIso is present but unparseable as a date/time', () => {
    const unparseableEpoch = { ...validScenario, startDateTimeIso: 'not-a-date' }
    expect(() => parseScenario(unparseableEpoch)).toThrow(/startDateTimeIso/)
  })

  it('throws when two entries (Event or Fire) share the same id', () => {
    const duplicateIds = {
      startDateTimeIso: '2025-06-14T12:00:00Z',
      events: [
        { id: 'event-1', type: 'FallenTree', position: { lat: 64.5, lng: 26.3 }, spawnAtSimSeconds: 0 },
        { id: 'event-1', type: 'Fire', position: { lat: 64.6, lng: 26.4 }, spawnAtSimSeconds: 10 },
      ],
      wind: validScenario.wind,
    }
    expect(() => parseScenario(duplicateIds)).toThrow(/duplicate/i)
  })

  it('collects multiple issues into one error message', () => {
    const multipleIssues = {
      events: [
        { id: 'event-1', type: 'Meteor', position: { lat: 64.5, lng: 26.3 }, spawnAtSimSeconds: -5 },
      ],
      wind: validScenario.wind,
    }
    try {
      parseScenario(multipleIssues)
      expect.unreachable('expected parseScenario to throw')
    } catch (error) {
      expect(error).toBeInstanceOf(ScenarioValidationError)
      expect((error as ScenarioValidationError).issues.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('throws when wind is missing', () => {
    const withoutWind = { events: validScenario.events }
    expect(() => parseScenario(withoutWind)).toThrow(/wind/)
  })

  it('throws when wind is not an object', () => {
    expect(() => parseScenario({ ...validScenario, wind: 'northerly' })).toThrow(/wind/)
  })

  it('throws when wind.directionDegrees is missing, non-numeric, or out of the 0-360 range', () => {
    expect(() =>
      parseScenario({ ...validScenario, wind: { speedMetersPerSecond: 8 } }),
    ).toThrow(/directionDegrees/)
    expect(() =>
      parseScenario({ ...validScenario, wind: { directionDegrees: 'north', speedMetersPerSecond: 8 } }),
    ).toThrow(/directionDegrees/)
    expect(() =>
      parseScenario({ ...validScenario, wind: { directionDegrees: -1, speedMetersPerSecond: 8 } }),
    ).toThrow(/directionDegrees/)
    expect(() =>
      parseScenario({ ...validScenario, wind: { directionDegrees: 360.5, speedMetersPerSecond: 8 } }),
    ).toThrow(/directionDegrees/)
  })

  it('accepts a wind.directionDegrees of exactly 0 or 360 (the boundary of the compass)', () => {
    expect(() => parseScenario({ ...validScenario, wind: { directionDegrees: 0, speedMetersPerSecond: 8 } })).not.toThrow()
    expect(() => parseScenario({ ...validScenario, wind: { directionDegrees: 360, speedMetersPerSecond: 8 } })).not.toThrow()
  })

  it('throws when wind.speedMetersPerSecond is missing, non-numeric, or negative', () => {
    expect(() =>
      parseScenario({ ...validScenario, wind: { directionDegrees: 225 } }),
    ).toThrow(/speedMetersPerSecond/)
    expect(() =>
      parseScenario({ ...validScenario, wind: { directionDegrees: 225, speedMetersPerSecond: 'calm' } }),
    ).toThrow(/speedMetersPerSecond/)
    expect(() =>
      parseScenario({ ...validScenario, wind: { directionDegrees: 225, speedMetersPerSecond: -1 } }),
    ).toThrow(/speedMetersPerSecond/)
  })

  describe('Fire ignition entries (ADR-0004)', () => {
    it('accepts a minimal Fire ignition entry: id, position, spawnAtSimSeconds only', () => {
      const scenario = {
        startDateTimeIso: validScenario.startDateTimeIso,
        events: [{ id: 'fire-1', type: 'Fire', position: { lat: 64.6, lng: 26.4 }, spawnAtSimSeconds: 0 }],
        wind: validScenario.wind,
      }
      expect(parseScenario(scenario)).toEqual(scenario)
    })

    it('throws when a Fire ignition entry has a malformed position', () => {
      const badPosition = {
        ...validScenario,
        events: [{ id: 'fire-1', type: 'Fire', position: { lat: 'north', lng: 26.3 }, spawnAtSimSeconds: 0 }],
      }
      expect(() => parseScenario(badPosition)).toThrow(/position/)
    })

    it('throws when a Fire ignition entry is missing or has a negative spawnAtSimSeconds', () => {
      const missing = {
        ...validScenario,
        events: [{ id: 'fire-1', type: 'Fire', position: { lat: 64.5, lng: 26.3 } }],
      }
      expect(() => parseScenario(missing)).toThrow(/spawnAtSimSeconds/)

      const negative = {
        ...validScenario,
        events: [{ id: 'fire-1', type: 'Fire', position: { lat: 64.5, lng: 26.3 }, spawnAtSimSeconds: -5 }],
      }
      expect(() => parseScenario(negative)).toThrow(/spawnAtSimSeconds/)
    })

    it('rejects a Fire ignition entry carrying a durationSimSeconds — Fires never auto-resolve', () => {
      const badFire = {
        ...validScenario,
        events: [
          { id: 'fire-1', type: 'Fire', position: { lat: 64.5, lng: 26.3 }, spawnAtSimSeconds: 0, durationSimSeconds: 600 },
        ],
      }
      expect(() => parseScenario(badFire)).toThrow(/durationSimSeconds/)
    })
  })
})
