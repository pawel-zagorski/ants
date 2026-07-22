import { describe, expect, it } from 'vitest'
import { squareViewportBounds, toLeafletBounds } from './geo'

describe('squareViewportBounds', () => {
  it('returns a bounding box whose sides span the requested distance', () => {
    const center = { lat: 64.5644, lng: 26.4947 }
    const sideKm = 50

    const bounds = squareViewportBounds(center, sideKm)

    // North-south distance: 1 degree of latitude is ~111.32km everywhere.
    const latSpanKm = (bounds.northEast.lat - bounds.southWest.lat) * 111.32
    expect(latSpanKm).toBeCloseTo(sideKm, 0)

    // East-west distance shrinks with cos(latitude) as meridians converge.
    const lngSpanKm =
      (bounds.northEast.lng - bounds.southWest.lng) *
      111.32 *
      Math.cos((center.lat * Math.PI) / 180)
    expect(lngSpanKm).toBeCloseTo(sideKm, 0)
  })

  it('centers the box on the requested point', () => {
    const center = { lat: 64.5644, lng: 26.4947 }

    const bounds = squareViewportBounds(center, 50)

    expect((bounds.southWest.lat + bounds.northEast.lat) / 2).toBeCloseTo(center.lat, 10)
    expect((bounds.southWest.lng + bounds.northEast.lng) / 2).toBeCloseTo(center.lng, 10)
  })
})

describe('toLeafletBounds', () => {
  it('reshapes southWest/northEast corners into Leaflet LatLngBoundsExpression tuples', () => {
    const bounds = {
      southWest: { lat: 64.34, lng: 25.97 },
      northEast: { lat: 64.79, lng: 27.02 },
    }

    expect(toLeafletBounds(bounds)).toEqual([
      [64.34, 25.97],
      [64.79, 27.02],
    ])
  })
})
