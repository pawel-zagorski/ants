/** Kilometers spanned by one degree of latitude, roughly constant everywhere. */
const KM_PER_DEGREE_LATITUDE = 111.32

export interface LatLng {
  lat: number
  lng: number
}

export interface LatLngBounds {
  southWest: LatLng
  northEast: LatLng
}

/**
 * Computes an approximate `sideKm` x `sideKm` bounding box centered on `center`.
 *
 * Longitude degrees shrink toward the poles as meridians converge, so the
 * east-west span is corrected by `cos(latitude)`. This is a flat-earth
 * approximation (no ellipsoid/geodesic math) — plenty accurate for sizing a
 * default map viewport at this scale.
 */
export function squareViewportBounds(center: LatLng, sideKm: number): LatLngBounds {
  const halfSideKm = sideKm / 2
  const latOffset = halfSideKm / KM_PER_DEGREE_LATITUDE
  const kmPerDegreeLongitude = KM_PER_DEGREE_LATITUDE * Math.cos((center.lat * Math.PI) / 180)
  const lngOffset = halfSideKm / kmPerDegreeLongitude

  return {
    southWest: { lat: center.lat - latOffset, lng: center.lng - lngOffset },
    northEast: { lat: center.lat + latOffset, lng: center.lng + lngOffset },
  }
}

/**
 * Displaces `origin` by `dxMeters` east and `dyMeters` north and returns the
 * resulting point. Uses the same flat-earth approximation as
 * {@link squareViewportBounds} (no ellipsoid/geodesic math), which is
 * accurate enough for patrol-loop-sized displacements (hundreds to low
 * thousands of meters) at this prototype's scale.
 */
export function offsetLatLng(origin: LatLng, dxMeters: number, dyMeters: number): LatLng {
  const latOffset = dyMeters / 1000 / KM_PER_DEGREE_LATITUDE
  const kmPerDegreeLongitude = KM_PER_DEGREE_LATITUDE * Math.cos((origin.lat * Math.PI) / 180)
  const lngOffset = dxMeters / 1000 / kmPerDegreeLongitude

  return { lat: origin.lat + latOffset, lng: origin.lng + lngOffset }
}

/**
 * Distance in meters between two points, using the same flat-earth
 * approximation as {@link offsetLatLng} (longitude degrees corrected by
 * `cos(latitude)`, no ellipsoid/geodesic math) — the production distance
 * check behind Detection (ADR-0003): comparing this against a Tower's or
 * Drone's fixed detection radius. Accurate enough for this prototype's
 * detection-radius scale (hundreds to tens of thousands of meters); not a
 * geodesic distance, so don't reuse it for, e.g., long-haul navigation.
 */
export function distanceMetersBetween(a: LatLng, b: LatLng): number {
  const kmPerDegreeLongitude = KM_PER_DEGREE_LATITUDE * Math.cos((a.lat * Math.PI) / 180)
  const dyKm = (b.lat - a.lat) * KM_PER_DEGREE_LATITUDE
  const dxKm = (b.lng - a.lng) * kmPerDegreeLongitude
  return Math.sqrt(dxKm * dxKm + dyKm * dyKm) * 1000
}

/**
 * The point on a circle of `radiusMeters` centered on `center`, at the
 * given absolute `angleRadians` (0 = due east, increasing counter-clockwise
 * — plain `cos`/`sin` on top of {@link offsetLatLng}'s east/north
 * displacement). Shared shape behind every closed-form circular-loop
 * position the engine computes — a Drone's patrol loop and a Fixed-Wing
 * Drone's investigate circle (see `engine/advanceSimulation.ts` and
 * `engine/dispatch.ts`) — so that math lives in one place rather than
 * being re-derived per loop kind.
 */
export function pointOnCircle(center: LatLng, radiusMeters: number, angleRadians: number): LatLng {
  const dxMeters = radiusMeters * Math.cos(angleRadians)
  const dyMeters = radiusMeters * Math.sin(angleRadians)
  return offsetLatLng(center, dxMeters, dyMeters)
}

/**
 * The instantaneous linear speed (meters/second) of a point moving along a
 * circle of `radiusMeters` at `angularSpeedRadiansPerSecond` — magnitude
 * only, direction-agnostic (see {@link tangentialHeadingDegrees} for
 * direction). Shared by every Drone motion this engine models on a circle:
 * a patrol loop (`engine/advanceSimulation.ts`) and a Fixed-Wing Drone's
 * investigate circle (`engine/dispatch.ts`) — see `engine/telemetry.ts`
 * (issue G), which is this function's only caller today.
 */
export function tangentialSpeedMetersPerSecond(angularSpeedRadiansPerSecond: number, radiusMeters: number): number {
  return Math.abs(angularSpeedRadiansPerSecond) * radiusMeters
}

/**
 * The compass heading (degrees, 0 = north, 90 = east, clockwise, in
 * `[0, 360)`) of a point's direction of travel at `angleRadians` around a
 * circle whose angle increases at `angularSpeedRadiansPerSecond` (see
 * {@link pointOnCircle}'s angle convention: 0 = due east of center,
 * increasing counter-clockwise). The velocity direction is the derivative
 * of `pointOnCircle`'s position with respect to the angle, scaled by the
 * sign of `angularSpeedRadiansPerSecond` (so a negative — clockwise —
 * angular speed reverses the heading): `(-sin(angleRadians),
 * cos(angleRadians))` in (east, north) meters, converted to a compass
 * bearing. Every angular speed this engine actually produces today is
 * positive (counter-clockwise), but this stays correct either way rather
 * than silently assuming it. Used by `engine/telemetry.ts` (issue G) for a
 * patrolling or investigating (Fixed-Wing) Drone's `headingDegrees`
 * telemetry field — a hovering Quadrocopter has no heading and simply
 * omits this field rather than calling it with `angularSpeedRadiansPerSecond`
 * of `0` (which this function does not special-case).
 */
export function tangentialHeadingDegrees(angleRadians: number, angularSpeedRadiansPerSecond: number): number {
  const directionSign = angularSpeedRadiansPerSecond < 0 ? -1 : 1
  const eastComponent = -Math.sin(angleRadians) * directionSign
  const northComponent = Math.cos(angleRadians) * directionSign
  const headingRadians = Math.atan2(eastComponent, northComponent)
  const headingDegrees = (headingRadians * 180) / Math.PI
  return (headingDegrees + 360) % 360
}

/**
 * Samples `sampleCount` points around the ellipse whose foci are `focus1`
 * and `focus2` and whose total focal-distance budget (the ellipse's
 * defining constant: the sum of distances from any point on it to both
 * foci) is `focalDistanceBudgetMeters` — the geometry behind the Return
 * Envelope overlay (issue K, `CONTEXT.md`'s **Return Envelope** entry):
 * "everywhere a Drone with this much remaining flight budget could go and
 * still make it back to this one focus (a Base Station)". Semi-major axis
 * `a = focalDistanceBudgetMeters / 2`, focal separation `c =
 * distanceMetersBetween(focus1, focus2) / 2`, semi-minor axis `b =
 * sqrt(a^2 - c^2)`, centered at the foci's midpoint and rotated to align
 * with the focus1->focus2 axis — all in the same east/north flat-earth
 * approximation {@link offsetLatLng} uses (no ellipsoid/geodesic math,
 * consistent with every other helper in this file). Returns a *closed*
 * ring (the first sampled point repeated as the last) ready to hand
 * straight to a Leaflet `Polygon`'s `positions` prop.
 *
 * Returns `undefined` if `focalDistanceBudgetMeters` is less than the
 * focal separation distance itself (`a < c`) — geometrically, the budget
 * can't even span the gap between the two foci, so there is no valid
 * ellipse (rather than producing a negative-`b`/`NaN` shape). This is the
 * "Drone can't even make it to this particular Base Station on remaining
 * energy" case (issue K acceptance criteria) — callers should skip
 * rendering entirely for that focus pair rather than treating `undefined`
 * as an error.
 */
export function returnEnvelopeEllipseRing(
  focus1: LatLng,
  focus2: LatLng,
  focalDistanceBudgetMeters: number,
  sampleCount = 96,
): LatLng[] | undefined {
  const kmPerDegreeLongitude = KM_PER_DEGREE_LATITUDE * Math.cos((focus1.lat * Math.PI) / 180)
  const dxMeters = (focus2.lng - focus1.lng) * kmPerDegreeLongitude * 1000
  const dyMeters = (focus2.lat - focus1.lat) * KM_PER_DEGREE_LATITUDE * 1000

  const semiMajorAxisMeters = focalDistanceBudgetMeters / 2
  const focalSeparationMeters = Math.sqrt(dxMeters * dxMeters + dyMeters * dyMeters) / 2
  if (semiMajorAxisMeters < focalSeparationMeters) return undefined

  const semiMinorAxisMeters = Math.sqrt(semiMajorAxisMeters ** 2 - focalSeparationMeters ** 2)
  const center = offsetLatLng(focus1, dxMeters / 2, dyMeters / 2)
  const rotationRadians = Math.atan2(dyMeters, dxMeters)
  const cosRotation = Math.cos(rotationRadians)
  const sinRotation = Math.sin(rotationRadians)

  const ring: LatLng[] = []
  for (let i = 0; i <= sampleCount; i += 1) {
    const angleRadians = (2 * Math.PI * i) / sampleCount
    const localEastMeters = semiMajorAxisMeters * Math.cos(angleRadians)
    const localNorthMeters = semiMinorAxisMeters * Math.sin(angleRadians)
    const eastMeters = localEastMeters * cosRotation - localNorthMeters * sinRotation
    const northMeters = localEastMeters * sinRotation + localNorthMeters * cosRotation
    ring.push(offsetLatLng(center, eastMeters, northMeters))
  }

  return ring
}

/**
 * Linear interpolation between two `LatLng` points at fraction `t` ∈ [0, 1]
 * (0 = `a`, 1 = `b`, values outside this range extrapolate). Uses the same
 * flat-earth approximation as every other helper in this file — accurate
 * enough for the hundreds-to-low-thousands-of-meter transit distances this
 * engine produces during Drone travel phases.
 */
export function interpolateLatLng(a: LatLng, b: LatLng, t: number): LatLng {
  return {
    lat: a.lat + (b.lat - a.lat) * t,
    lng: a.lng + (b.lng - a.lng) * t,
  }
}

/** Reshapes a `LatLngBounds` into the `[lat, lng]` corner tuples react-leaflet expects. */
export function toLeafletBounds(bounds: LatLngBounds): [[number, number], [number, number]] {
  return [
    [bounds.southWest.lat, bounds.southWest.lng],
    [bounds.northEast.lat, bounds.northEast.lng],
  ]
}
