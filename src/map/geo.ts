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

/** Reshapes a `LatLngBounds` into the `[lat, lng]` corner tuples react-leaflet expects. */
export function toLeafletBounds(bounds: LatLngBounds): [[number, number], [number, number]] {
  return [
    [bounds.southWest.lat, bounds.southWest.lng],
    [bounds.northEast.lat, bounds.northEast.lng],
  ]
}
