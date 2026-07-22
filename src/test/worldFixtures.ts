import type { World } from '../world/types'

/**
 * A minimal, valid World fixture for tests that only care about specific
 * assets (typically Drones) — a fixed bounds/single-Base-Station skeleton
 * that callers override just the fields they need for their scenario,
 * instead of re-typing the whole `World` shape in every test file.
 */
export function createWorldFixture(overrides: Partial<World> = {}): World {
  return {
    bounds: { southWest: { lat: 64.3398, lng: 25.9718 }, northEast: { lat: 64.789, lng: 27.0176 } },
    towers: [],
    baseStations: [{ id: 'base-1', type: 'BaseStation', position: { lat: 64.5, lng: 26.25 } }],
    drones: [],
    ...overrides,
  }
}
