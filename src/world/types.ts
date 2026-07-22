import type { LatLng, LatLngBounds } from '../map/geo'

/** Discriminant for the two Drone kinds — see `CONTEXT.md`. */
export type DroneType = 'Quadrocopter' | 'FixedWingDrone'

/** Discriminant covering every clickable asset kind rendered on the map. */
export type AssetType = 'Tower' | 'BaseStation' | DroneType

/**
 * A fixed, elevated asset with a long detection radius that can only detect
 * Fire Events (see `CONTEXT.md`). Detection logic itself lands in a later
 * slice — this slice only carries the fields needed to render and identify it.
 */
export interface Tower {
  id: string
  type: 'Tower'
  position: LatLng
  detectionRadiusMeters: number
}

/** A fixed ground location that houses Drones, where they dock and recharge. */
export interface BaseStation {
  id: string
  type: 'BaseStation'
  position: LatLng
}

/** A mobile sensor asset — a Quadrocopter or a Fixed-Wing Drone — homed at a Base Station. */
export interface Drone {
  id: string
  type: DroneType
  position: LatLng
  homeBaseStationId: string
}

/** Any single World asset that can be rendered as a marker and clicked for a status panel. */
export type Asset = Tower | BaseStation | Drone

/**
 * The fixed sensor network roster for a simulation run: the map area, its
 * Towers, Base Stations, and Drones (ADR-0002). Does not change once a
 * Scenario starts.
 */
export interface World {
  bounds: LatLngBounds
  towers: Tower[]
  baseStations: BaseStation[]
  drones: Drone[]
}
