import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

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
    },
  ],
}

describe('App', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(VALID_WORLD), { status: 200 })),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads world.json and renders a Leaflet map container with asset markers', async () => {
    render(<App />)

    await waitFor(() => expect(document.querySelector('.leaflet-container')).not.toBeNull())
    expect(document.querySelectorAll('.asset-icon')).toHaveLength(3)
  })

  it('shows a loud error message when world.json fails validation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ not: 'a world' }), { status: 200 })),
    )

    render(<App />)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/Failed to load world\.json/)
  })
})
