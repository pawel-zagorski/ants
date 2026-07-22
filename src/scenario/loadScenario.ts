import { parseScenario, ScenarioValidationError } from './schema'
import type { Scenario } from './types'

/**
 * Fetches and validates a Scenario's timed Event script from a
 * `scenario-*.json` file (ADR-0002). Rejects with a {@link
 * ScenarioValidationError} if the file is malformed, or a plain `Error` if
 * it can't be fetched — mirrors `loadWorld` in `../world/loadWorld`.
 */
export async function loadScenario(url: string, fetchImpl: typeof fetch = fetch): Promise<Scenario> {
  const response = await fetchImpl(url)
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status} ${response.statusText}`)
  }

  let data: unknown
  try {
    data = await response.json()
  } catch (cause) {
    throw new Error(`Failed to parse ${url} as JSON`, { cause })
  }

  return parseScenario(data)
}

export { ScenarioValidationError }
