import { describe, expect, it } from 'vitest'
import { loadWorld } from './loadWorld'
import { WorldValidationError } from './schema'

function fakeFetch(response: { ok: boolean; status?: number; statusText?: string; body: unknown }) {
  return async () =>
    ({
      ok: response.ok,
      status: response.status ?? 200,
      statusText: response.statusText ?? '',
      json: async () => response.body,
    }) as Response
}

describe('loadWorld', () => {
  it('resolves with a validated World when the fetched JSON matches the schema', async () => {
    const validBody = {
      bounds: { southWest: { lat: 64.3398, lng: 25.9718 }, northEast: { lat: 64.789, lng: 27.0176 } },
      towers: [
        { id: 'tower-1', type: 'Tower', position: { lat: 64.7, lng: 26.2 }, detectionRadiusMeters: 15000 },
      ],
      baseStations: [{ id: 'base-1', type: 'BaseStation', position: { lat: 64.5, lng: 26.25 } }],
      drones: [
        {
          id: 'drone-1',
          type: 'Quadrocopter',
          position: { lat: 64.502, lng: 26.252 },
          homeBaseStationId: 'base-1',
        },
      ],
    }

    const world = await loadWorld('/world.json', fakeFetch({ ok: true, body: validBody }))

    expect(world).toEqual(validBody)
  })

  it('rejects with a WorldValidationError when the fetched JSON is malformed', async () => {
    await expect(
      loadWorld('/world.json', fakeFetch({ ok: true, body: { not: 'a world' } })),
    ).rejects.toBeInstanceOf(WorldValidationError)
  })

  it('rejects when the HTTP response is not ok', async () => {
    await expect(
      loadWorld('/world.json', fakeFetch({ ok: false, status: 404, statusText: 'Not Found', body: null })),
    ).rejects.toThrow(/404/)
  })
})

describe('the default public/world.json', () => {
  it('parses successfully via the real fetch loader', async () => {
    const defaultWorld = await import('../../public/world.json')

    const world = await loadWorld('/world.json', fakeFetch({ ok: true, body: defaultWorld.default }))

    expect(world.towers).toHaveLength(2)
    expect(world.baseStations).toHaveLength(2)
    expect(world.drones).toHaveLength(4)
    expect(world.drones.filter((drone) => drone.type === 'Quadrocopter').length).toBeGreaterThanOrEqual(1)
    expect(world.drones.filter((drone) => drone.type === 'FixedWingDrone').length).toBeGreaterThanOrEqual(1)
  })
})
