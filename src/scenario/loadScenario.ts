import { fetchAndParseJson } from '../validation/jsonValidation'
import { parseScenario, ScenarioValidationError } from './schema'
import type { Scenario } from './types'

/**
 * Fetches and validates a Scenario's timed Event script from a
 * `scenario-*.json` file (ADR-0002). Rejects with a {@link
 * ScenarioValidationError} if the file is malformed, or a plain `Error` if
 * it can't be fetched — shares its fetch/parse plumbing with `loadWorld` via
 * `fetchAndParseJson` in `../validation/jsonValidation`.
 */
export async function loadScenario(url: string, fetchImpl: typeof fetch = fetch): Promise<Scenario> {
  return fetchAndParseJson(url, parseScenario, fetchImpl)
}

export { ScenarioValidationError }
