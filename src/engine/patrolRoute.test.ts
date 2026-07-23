import { describe, expect, it } from 'vitest'
import { patrolRoutePerimeterMeters, patrolRoutePositionAt } from './patrolRoute'
import { distanceMetersBetween } from '../map/geo'
import type { LatLng } from '../map/geo'

// An axis-aligned rectangular route (waypoints ordered counter-clockwise),
// flown as a closed loop W0→W1→W2→W3→W0. Horizontal segments hold `lat`
// constant, vertical ones hold `lng` constant — which gives independent,
// non-tautological expectations for interpolation checks below.
const ROUTE: LatLng[] = [
  { lat: 64.5, lng: 26.2 },
  { lat: 64.5, lng: 26.4 },
  { lat: 64.6, lng: 26.4 },
  { lat: 64.6, lng: 26.2 },
]

describe('patrolRoutePerimeterMeters', () => {
  it('sums the four closed-loop segment lengths (incl. the closing W3→W0 leg)', () => {
    const expected =
      distanceMetersBetween(ROUTE[0], ROUTE[1]) +
      distanceMetersBetween(ROUTE[1], ROUTE[2]) +
      distanceMetersBetween(ROUTE[2], ROUTE[3]) +
      distanceMetersBetween(ROUTE[3], ROUTE[0])
    expect(patrolRoutePerimeterMeters(ROUTE)).toBeCloseTo(expected, 6)
  })

  it('is zero for a degenerate route of fewer than two waypoints', () => {
    expect(patrolRoutePerimeterMeters([])).toBe(0)
    expect(patrolRoutePerimeterMeters([ROUTE[0]])).toBe(0)
  })
})

describe('patrolRoutePositionAt', () => {
  it('sits exactly on the first waypoint at elapsed 0 with no phase offset', () => {
    expect(patrolRoutePositionAt(ROUTE, 25, 0)).toEqual(ROUTE[0])
  })

  it('reaches the second waypoint after travelling exactly the first segment length', () => {
    const firstSegmentMeters = distanceMetersBetween(ROUTE[0], ROUTE[1])
    const speed = 25
    const position = patrolRoutePositionAt(ROUTE, speed, firstSegmentMeters / speed)
    expect(position.lat).toBeCloseTo(ROUTE[1].lat, 6)
    expect(position.lng).toBeCloseTo(ROUTE[1].lng, 6)
  })

  it('interpolates within the first (horizontal) segment: lat constant, lng at the midpoint halfway along it', () => {
    const firstSegmentMeters = distanceMetersBetween(ROUTE[0], ROUTE[1])
    const speed = 25
    const position = patrolRoutePositionAt(ROUTE, speed, firstSegmentMeters / 2 / speed)
    expect(position.lat).toBeCloseTo(64.5, 6)
    expect(position.lng).toBeCloseTo((26.2 + 26.4) / 2, 6)
  })

  it('closes the loop: after one full perimeter it is back at the first waypoint', () => {
    const speed = 25
    const perimeter = patrolRoutePerimeterMeters(ROUTE)
    const position = patrolRoutePositionAt(ROUTE, speed, perimeter / speed)
    expect(position.lat).toBeCloseTo(ROUTE[0].lat, 6)
    expect(position.lng).toBeCloseTo(ROUTE[0].lng, 6)
  })

  it('wraps around: elapsed times one perimeter-period apart give the same position', () => {
    const speed = 25
    const perimeter = patrolRoutePerimeterMeters(ROUTE)
    const period = perimeter / speed
    const a = patrolRoutePositionAt(ROUTE, speed, 137)
    const b = patrolRoutePositionAt(ROUTE, speed, 137 + period)
    expect(b.lat).toBeCloseTo(a.lat, 6)
    expect(b.lng).toBeCloseTo(a.lng, 6)
  })

  it('is deterministic: same inputs twice produce byte-identical output', () => {
    expect(patrolRoutePositionAt(ROUTE, 25, 321, 500)).toEqual(patrolRoutePositionAt(ROUTE, 25, 321, 500))
  })

  it('applies a phase offset in meters along the loop (offset by one segment == starting a waypoint later)', () => {
    const firstSegmentMeters = distanceMetersBetween(ROUTE[0], ROUTE[1])
    const position = patrolRoutePositionAt(ROUTE, 25, 0, firstSegmentMeters)
    expect(position.lat).toBeCloseTo(ROUTE[1].lat, 6)
    expect(position.lng).toBeCloseTo(ROUTE[1].lng, 6)
  })

  it('keeps every sampled position on the route polyline (near-zero distance to some segment)', () => {
    const perpendicularDistanceToSegment = (p: LatLng, a: LatLng, b: LatLng): number => {
      // Project p onto segment a→b in the same flat-earth (east/north meters)
      // frame the route math uses, then measure the residual distance.
      const abLat = b.lat - a.lat
      const abLng = b.lng - a.lng
      const apLat = p.lat - a.lat
      const apLng = p.lng - a.lng
      const denom = abLat * abLat + abLng * abLng
      const t = denom === 0 ? 0 : Math.max(0, Math.min(1, (apLat * abLat + apLng * abLng) / denom))
      const projection = { lat: a.lat + abLat * t, lng: a.lng + abLng * t }
      return distanceMetersBetween(p, projection)
    }

    for (let elapsed = 0; elapsed <= 4000; elapsed += 173) {
      const position = patrolRoutePositionAt(ROUTE, 25, elapsed, 900)
      const minDistance = Math.min(
        ...ROUTE.map((waypoint, i) => perpendicularDistanceToSegment(position, waypoint, ROUTE[(i + 1) % ROUTE.length])),
      )
      expect(minDistance).toBeLessThan(1)
    }
  })

  it('returns the sole waypoint for a single-waypoint route (degenerate, no polyline to fly)', () => {
    expect(patrolRoutePositionAt([ROUTE[0]], 25, 500)).toEqual(ROUTE[0])
  })
})
