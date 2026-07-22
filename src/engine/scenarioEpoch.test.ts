import { describe, expect, it } from 'vitest'
import { formatScenarioDateTime, scenarioDateTimeAt } from './scenarioEpoch'

describe('scenarioDateTimeAt', () => {
  it('returns the Scenario Epoch itself at elapsedSimSeconds 0', () => {
    const date = scenarioDateTimeAt('2025-06-14T20:00:00Z', 0)

    expect(date.toISOString()).toBe('2025-06-14T20:00:00.000Z')
  })

  it('adds elapsedSimSeconds to the Epoch as real calendar seconds, crossing into the next day', () => {
    // 20:00 + 5h (18000s) lands at 01:00 the following calendar day.
    const date = scenarioDateTimeAt('2025-06-14T20:00:00Z', 18_000)

    expect(date.toISOString()).toBe('2025-06-15T01:00:00.000Z')
  })
})

describe('formatScenarioDateTime', () => {
  it('formats the Epoch itself at elapsedSimSeconds 0 as a calendar date/time', () => {
    expect(formatScenarioDateTime('2025-06-14T20:00:00Z', 0)).toBe('2025-06-14 20:00:00')
  })

  it('formats a large offset that crosses into the next calendar day', () => {
    expect(formatScenarioDateTime('2025-06-14T20:00:00Z', 18_000)).toBe('2025-06-15 01:00:00')
  })
})
