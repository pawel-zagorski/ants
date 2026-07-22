import { parseWorld, WorldValidationError } from './schema'
import type { World } from './types'

const DEFAULT_WORLD_URL = '/world.json'

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

  return parseWorld(data)
}

export { WorldValidationError }
