import { describe, expect, it } from 'vitest'
import {
  distanceMetersBetween,
  offsetLatLng,
  pointOnCircle,
  returnEnvelopeEllipseRing,
  squareViewportBounds,
  tangentialHeadingDegrees,
  tangentialSpeedMetersPerSecond,
  toLeafletBounds,
} from './geo'
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

describe('pointOnCircle', () => {
  it('stays exactly radiusMeters away from the center at any angle', () => {
    const center = { lat: 64.5, lng: 26.25 }
    const radiusMeters = 250

    for (const angleRadians of [0, Math.PI / 2, Math.PI, 3.7, -1.2]) {
      const point = pointOnCircle(center, radiusMeters, angleRadians)
      expect(haversineDistanceMeters(center, point)).toBeCloseTo(radiusMeters, -1)
    }
  })

  it('places angle 0 due east of the center, matching offsetLatLng(center, radiusMeters, 0)', () => {
    const center = { lat: 64.5, lng: 26.25 }

    expect(pointOnCircle(center, 250, 0)).toEqual(offsetLatLng(center, 250, 0))
  })

  it('returns the same point for angles 2*PI apart', () => {
    const center = { lat: 64.5, lng: 26.25 }

    expect(pointOnCircle(center, 250, 1.1)).toEqual(pointOnCircle(center, 250, 1.1 + 2 * Math.PI))
  })
})

describe('tangentialSpeedMetersPerSecond', () => {
  it('multiplies angular speed by radius to get linear speed', () => {
    expect(tangentialSpeedMetersPerSecond(0.1, 250)).toBeCloseTo(25, 10)
  })

  it('is always non-negative, regardless of the sign of angularSpeedRadiansPerSecond', () => {
    expect(tangentialSpeedMetersPerSecond(-0.1, 250)).toBeCloseTo(25, 10)
  })
})

describe('tangentialHeadingDegrees', () => {
  it('heads due north (0°) at the east point of a counter-clockwise circle (angle 0)', () => {
    expect(tangentialHeadingDegrees(0, 0.1)).toBeCloseTo(0, 6)
  })

  it('heads due west (270°) at the north point of a counter-clockwise circle (angle PI/2)', () => {
    expect(tangentialHeadingDegrees(Math.PI / 2, 0.1)).toBeCloseTo(270, 6)
  })

  it('heads due south (180°) at the west point of a counter-clockwise circle (angle PI)', () => {
    expect(tangentialHeadingDegrees(Math.PI, 0.1)).toBeCloseTo(180, 6)
  })

  it('reverses to the opposite heading when angularSpeedRadiansPerSecond is negative (clockwise)', () => {
    expect(tangentialHeadingDegrees(0, -0.1)).toBeCloseTo(180, 6)
  })

  it('always returns a value in [0, 360)', () => {
    for (const angleRadians of [0, 1, 2, 3, 4, 5, 6, -1, -5]) {
      const heading = tangentialHeadingDegrees(angleRadians, 0.1)
      expect(heading).toBeGreaterThanOrEqual(0)
      expect(heading).toBeLessThan(360)
    }
  })
})

describe('returnEnvelopeEllipseRing', () => {
  // Foci 800m apart, aligned due east so the rotation is 0 and expected
  // extents can be checked directly along the east/north axes.
  const focus1 = { lat: 64.5, lng: 26.25 }
  const focus2 = offsetLatLng(focus1, 800, 0)
  const focalDistanceMeters = 800 // c*2
  const focalSeparationMeters = focalDistanceMeters / 2 // c = 400

  it('rejects a budget smaller than the focal distance (a < c) by returning undefined, not NaN/throwing', () => {
    const tooSmallBudget = focalDistanceMeters - 1

    expect(returnEnvelopeEllipseRing(focus1, focus2, tooSmallBudget)).toBeUndefined()
  })

  it('accepts a budget at (i.e. not strictly below) the focal distance (a ~= c, a near-degenerate b~=0 ellipse)', () => {
    // A hair above the exact focal distance to stay clear of floating-point
    // rounding at the a === c boundary itself, while still exercising the
    // near-degenerate (b close to 0) case without NaNs.
    const ring = returnEnvelopeEllipseRing(focus1, focus2, focalDistanceMeters + 0.01)

    expect(ring).toBeDefined()
    for (const point of ring ?? []) {
      expect(Number.isNaN(point.lat)).toBe(false)
      expect(Number.isNaN(point.lng)).toBe(false)
    }
  })

  it('places the semi-major-axis vertex (angle 0) at distance a from the center, along the focus1->focus2 axis', () => {
    const budget = 1000 // a = 500
    const ring = returnEnvelopeEllipseRing(focus1, focus2, budget)
    expect(ring).toBeDefined()

    const center = offsetLatLng(focus1, focalSeparationMeters, 0)
    const semiMajorVertex = ring![0]

    expect(distanceMetersBetween(center, semiMajorVertex)).toBeCloseTo(500, 4)
    // Aligned due east of center, since the foci sit on the east/west axis.
    expect(semiMajorVertex.lat).toBeCloseTo(center.lat, 6)
    expect(semiMajorVertex.lng).toBeGreaterThan(center.lng)
  })

  it('places the semi-minor-axis vertex (angle PI/2) at distance b from the center', () => {
    const budget = 1000 // a = 500, c = 400, b = sqrt(500^2 - 400^2) = 300
    const sampleCount = 96
    const ring = returnEnvelopeEllipseRing(focus1, focus2, budget, sampleCount)
    expect(ring).toBeDefined()

    const center = offsetLatLng(focus1, focalSeparationMeters, 0)
    const quarterIndex = sampleCount / 4
    const semiMinorVertex = ring![quarterIndex]

    expect(distanceMetersBetween(center, semiMinorVertex)).toBeCloseTo(300, 4)
  })

  it('returns a closed ring: the first and last sampled points are identical', () => {
    const ring = returnEnvelopeEllipseRing(focus1, focus2, 1000)

    expect(ring).toBeDefined()
    expect(ring![0]).toEqual(ring![ring!.length - 1])
  })

  it('every sampled point satisfies the ellipse-defining property: distances to both foci sum to the budget', () => {
    const budget = 1200
    const ring = returnEnvelopeEllipseRing(focus1, focus2, budget)
    expect(ring).toBeDefined()

    for (const point of ring ?? []) {
      const sumOfFocalDistances = distanceMetersBetween(point, focus1) + distanceMetersBetween(point, focus2)
      // Loose precision: distanceMetersBetween's own flat-earth longitude
      // correction uses each call's *first* point's latitude, so measuring
      // from both foci (at slightly different latitudes than the sampled
      // point) compounds a small amount of approximation error on top of
      // the ring's own construction — still well under 0.1% of the budget.
      expect(sumOfFocalDistances).toBeCloseTo(budget, 0)
    }
  })

  it('produces a circle (a === b) when both foci coincide (focal separation 0)', () => {
    const samePoint = { lat: 64.6, lng: 26.4 }
    const budget = 600 // a = b = 300, a circle of radius 300

    const ring = returnEnvelopeEllipseRing(samePoint, samePoint, budget)
    expect(ring).toBeDefined()

    for (const point of ring ?? []) {
      expect(distanceMetersBetween(samePoint, point)).toBeCloseTo(300, 3)
    }
  })

  it('defaults to sampling within the 60-120 point range suggested by the issue', () => {
    const ring = returnEnvelopeEllipseRing(focus1, focus2, 1000)

    // +1 for the closing point that repeats the first.
    expect(ring!.length - 1).toBeGreaterThanOrEqual(60)
    expect(ring!.length - 1).toBeLessThanOrEqual(120)
  })

  it('honors an explicit sampleCount', () => {
    const ring = returnEnvelopeEllipseRing(focus1, focus2, 1000, 60)

    expect(ring).toHaveLength(61)
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
