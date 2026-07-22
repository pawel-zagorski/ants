import { StrictMode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { BUNDLED_SCENARIOS } from './scenario/bundledScenarios'

const VALID_WORLD = {
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
      model: 'DJI Mavic 4 Pro',
      payload: 'Optical',
      maxEnduranceSimSeconds: 3060,
      cruiseSpeedMetersPerSecond: 10,
      datalinkRangeMeters: 30000,
      imageUrl: '/img/dji_mavic_4_pro.jpeg',
    },
  ],
}

const VALID_SCENARIO = {
  events: [{ id: 'event-1', type: 'FallenTree', position: { lat: 64.51, lng: 26.26 }, spawnAtSimSeconds: 30 }],
  wind: { directionDegrees: 45, speedMetersPerSecond: 2 },
}

function stubFetchByUrl(responses: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input.toString()
      const body = responses[url]
      if (body === undefined) {
        return new Response(null, { status: 404, statusText: 'Not Found' })
      }
      return new Response(JSON.stringify(body), { status: 200 })
    }),
  )
}

describe('App', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads world.json then shows a scenario start screen with a Play button', async () => {
    stubFetchByUrl({ '/world.json': VALID_WORLD })

    render(<App />)

    expect(await screen.findByRole('button', { name: 'Play' })).toBeInTheDocument()
    expect(screen.getByText(BUNDLED_SCENARIOS[0].name)).toBeInTheDocument()
  })

  // Regression test for a bug where the app hung on "Loading…" forever in
  // dev mode. `main.tsx` renders `<App />` inside `<StrictMode>`, whose
  // dev-only mount->cleanup->remount cycle exercises the mount-tracking ref
  // guard around `loadWorld`'s `setState` in a way a plain `render(<App />)`
  // (used above) never does.
  it('reaches the scenario start screen under StrictMode, not just plain rendering', async () => {
    stubFetchByUrl({ '/world.json': VALID_WORLD })

    render(<App />, { wrapper: StrictMode })

    expect(await screen.findByRole('button', { name: 'Play' })).toBeInTheDocument()
  })

  it('shows a loud error message when world.json fails validation', async () => {
    stubFetchByUrl({ '/world.json': { not: 'a world' } })

    render(<App />)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/Failed to load world\.json/)
  })

  it('loads the selected scenario and renders the map with asset markers after pressing Play', async () => {
    stubFetchByUrl({ '/world.json': VALID_WORLD, '/scenario-quiet-day.json': VALID_SCENARIO })

    render(<App />)

    await screen.findByRole('button', { name: 'Play' })
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))

    await waitFor(() => expect(document.querySelector('.leaflet-container')).not.toBeNull())
    expect(document.querySelectorAll('.asset-icon')).toHaveLength(3)
  })

  it('shows a loud error message when the selected scenario fails validation', async () => {
    stubFetchByUrl({ '/world.json': VALID_WORLD, '/scenario-quiet-day.json': { not: 'a scenario' } })

    render(<App />)

    await screen.findByRole('button', { name: 'Play' })
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/Failed to load scenario/)
  })
})
