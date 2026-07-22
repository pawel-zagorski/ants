import { describe, expect, it } from 'vitest'
import { BUNDLED_SCENARIOS } from './bundledScenarios'
import { loadScenario } from './loadScenario'
import { ScenarioValidationError } from './schema'

function fakeFetch(response: { ok: boolean; status?: number; statusText?: string; body: unknown }) {
  return async () =>
    ({
      ok: response.ok,
      status: response.status ?? 200,
      statusText: response.statusText ?? '',
      json: async () => response.body,
    }) as Response
}

describe('loadScenario', () => {
  it('resolves with a validated Scenario when the fetched JSON matches the schema', async () => {
    const validBody = {
      startDateTimeIso: '2025-06-14T12:00:00Z',
      events: [
        {
          id: 'event-1',
          type: 'FallenTree',
          position: { lat: 64.51, lng: 26.3 },
          spawnAtSimSeconds: 30,
        },
      ],
    }

    const scenario = await loadScenario('/scenario-quiet-day.json', fakeFetch({ ok: true, body: validBody }))

    expect(scenario).toEqual(validBody)
  })

  it('rejects with a ScenarioValidationError when the fetched JSON is malformed', async () => {
    await expect(
      loadScenario('/scenario-quiet-day.json', fakeFetch({ ok: true, body: { not: 'a scenario' } })),
    ).rejects.toBeInstanceOf(ScenarioValidationError)
  })

  it('rejects when the HTTP response is not ok', async () => {
    await expect(
      loadScenario('/scenario-quiet-day.json', fakeFetch({ ok: false, status: 404, statusText: 'Not Found', body: null })),
    ).rejects.toThrow(/404/)
  })
})

describe('the default public/scenario-quiet-day.json', () => {
  it('is listed in BUNDLED_SCENARIOS and parses successfully via the real fetch loader', async () => {
    const listing = BUNDLED_SCENARIOS.find((entry) => entry.url === '/scenario-quiet-day.json')
    expect(listing).toBeDefined()

    const quietDayFile = await import('../../public/scenario-quiet-day.json')

    const scenario = await loadScenario(
      '/scenario-quiet-day.json',
      fakeFetch({ ok: true, body: quietDayFile.default }),
    )

    expect(scenario.events.length).toBeGreaterThan(0)
    expect(scenario.events.every((event) => event.type === 'FallenTree')).toBe(true)
  })
})
