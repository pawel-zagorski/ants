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
    },
    {
      id: 'event-2',
      type: 'Fire',
      position: { lat: 64.6, lng: 26.4 },
      spawnAtSimSeconds: 120,
      durationSimSeconds: 600,
    },
  ],
}

describe('parseScenario', () => {
  it('returns a Scenario unchanged when the input matches the schema', () => {
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
      events: [{ id: 'event-1', type: 'Fire', position: { lat: 'north', lng: 26.3 }, spawnAtSimSeconds: 0 }],
    }
    expect(() => parseScenario(badPosition)).toThrow(/position/)
  })

  it('throws when spawnAtSimSeconds is missing or negative', () => {
    const missing = { events: [{ id: 'event-1', type: 'Fire', position: { lat: 64.5, lng: 26.3 } }] }
    expect(() => parseScenario(missing)).toThrow(/spawnAtSimSeconds/)

    const negative = {
      events: [{ id: 'event-1', type: 'Fire', position: { lat: 64.5, lng: 26.3 }, spawnAtSimSeconds: -5 }],
    }
    expect(() => parseScenario(negative)).toThrow(/spawnAtSimSeconds/)
  })

  it('throws when durationSimSeconds is present but not a positive number', () => {
    const badDuration = {
      events: [
        {
          id: 'event-1',
          type: 'Fire',
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

  it('throws when two Events share the same id', () => {
    const duplicateIds = {
      startDateTimeIso: '2025-06-14T12:00:00Z',
      events: [
        { id: 'event-1', type: 'Fire', position: { lat: 64.5, lng: 26.3 }, spawnAtSimSeconds: 0 },
        { id: 'event-1', type: 'FallenTree', position: { lat: 64.6, lng: 26.4 }, spawnAtSimSeconds: 10 },
      ],
    }
    expect(() => parseScenario(duplicateIds)).toThrow(/duplicate/i)
  })

  it('collects multiple issues into one error message', () => {
    const multipleIssues = {
      events: [
        { id: 'event-1', type: 'Meteor', position: { lat: 64.5, lng: 26.3 }, spawnAtSimSeconds: -5 },
      ],
    }
    try {
      parseScenario(multipleIssues)
      expect.unreachable('expected parseScenario to throw')
    } catch (error) {
      expect(error).toBeInstanceOf(ScenarioValidationError)
      expect((error as ScenarioValidationError).issues.length).toBeGreaterThanOrEqual(2)
    }
  })
})
