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

/** Reshapes a `LatLngBounds` into the `[lat, lng]` corner tuples react-leaflet expects. */
export function toLeafletBounds(bounds: LatLngBounds): [[number, number], [number, number]] {
  return [
    [bounds.southWest.lat, bounds.southWest.lng],
    [bounds.northEast.lat, bounds.northEast.lng],
  ]
}
