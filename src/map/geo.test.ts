import { describe, expect, it } from 'vitest'
import { distanceMetersBetween, offsetLatLng, squareViewportBounds, toLeafletBounds } from './geo'
import { haversineDistanceMeters } from '../test/haversineDistanceMeters'

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

describe('offsetLatLng', () => {
  it('moves the point north by dyMeters when dxMeters is 0', () => {
    const origin = { lat: 64.5, lng: 26.25 }

    const moved = offsetLatLng(origin, 0, 1000)

    expect(moved.lng).toBeCloseTo(origin.lng, 6)
    expect(moved.lat).toBeGreaterThan(origin.lat)
    expect(haversineDistanceMeters(origin, moved)).toBeCloseTo(1000, -1)
  })

  it('moves the point east by dxMeters when dyMeters is 0, correcting for longitude convergence', () => {
    const origin = { lat: 64.5, lng: 26.25 }

    const moved = offsetLatLng(origin, 1000, 0)

    expect(moved.lat).toBeCloseTo(origin.lat, 6)
    expect(moved.lng).toBeGreaterThan(origin.lng)
    expect(haversineDistanceMeters(origin, moved)).toBeCloseTo(1000, -1)
  })

  it('produces a point whose distance from origin matches the requested displacement magnitude', () => {
    const origin = { lat: 64.5, lng: 26.25 }
    const dxMeters = 300
    const dyMeters = 400

    const moved = offsetLatLng(origin, dxMeters, dyMeters)

    // 3-4-5 triangle: sqrt(300^2 + 400^2) = 500
    expect(haversineDistanceMeters(origin, moved)).toBeCloseTo(500, -1)
  })
})

describe('distanceMetersBetween', () => {
  it('returns 0 for a point and itself', () => {
    const point = { lat: 64.5, lng: 26.25 }

    expect(distanceMetersBetween(point, point)).toBe(0)
  })

  it('matches offsetLatLng: the distance to a point offset by dx/dy meters is the magnitude of that offset', () => {
    const origin = { lat: 64.5, lng: 26.25 }
    const offset = offsetLatLng(origin, 300, 400)

    // 3-4-5 triangle: sqrt(300^2 + 400^2) = 500
    expect(distanceMetersBetween(origin, offset)).toBeCloseTo(500, 6)
  })

  it('agrees with the independent haversine calculation at this prototype scale', () => {
    const a = { lat: 64.5, lng: 26.25 }
    const b = { lat: 64.62, lng: 26.7 }

    expect(distanceMetersBetween(a, b)).toBeCloseTo(haversineDistanceMeters(a, b), -3)
  })

  it('is approximately symmetric (the longitude correction uses the first point\'s latitude, so it is not exact)', () => {
    const a = { lat: 64.5, lng: 26.25 }
    const b = { lat: 64.7, lng: 26.2 }

    expect(distanceMetersBetween(a, b)).toBeCloseTo(distanceMetersBetween(b, a), -2)
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
