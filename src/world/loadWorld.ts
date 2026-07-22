import { withBase } from '../basePath'
import { fetchAndParseJson } from '../validation/jsonValidation'
import { parseWorld, WorldValidationError } from './schema'
import type { World } from './types'

const DEFAULT_WORLD_URL = withBase('world.json')

/**
 * Fetches and validates the World roster (map bounds, Towers, Base Stations,
 * Drones) from `world.json`. Rejects with a {@link WorldValidationError} if
 * the file is malformed, or a plain `Error` if it can't be fetched — this
 * loader never resolves with a partially-valid World.
 */
export async function loadWorld(
  url: string = DEFAULT_WORLD_URL,
  fetchImpl: typeof fetch = fetch,
): Promise<World> {
  return fetchAndParseJson(url, parseWorld, fetchImpl)
}

export { WorldValidationError }
