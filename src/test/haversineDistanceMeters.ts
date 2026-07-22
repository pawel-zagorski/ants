import type { LatLng } from '../map/geo'

/**
 * Independent great-circle distance calculation used only by tests to check
 * geometry helpers (`offsetLatLng`, patrol math) from an outside source of
 * truth — deliberately never imported by production code, so it never
 * shares an implementation with the code it verifies.
 */
export function haversineDistanceMeters(a: LatLng, b: LatLng): number {
  const earthRadiusMeters = 6371000
  const toRadians = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRadians(b.lat - a.lat)
  const dLng = toRadians(b.lng - a.lng)
  const sinDLat = Math.sin(dLat / 2)
  const sinDLng = Math.sin(dLng / 2)
  const h = sinDLat * sinDLat + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * sinDLng * sinDLng
  return 2 * earthRadiusMeters * Math.asin(Math.min(1, Math.sqrt(h)))
}
