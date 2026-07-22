import type { LatLng, LatLngBounds } from '../map/geo'

/** Discriminant for the two Drone kinds — see `CONTEXT.md`. */
export type DroneType = 'Quadrocopter' | 'FixedWingDrone'

/**
 * A Drone's sensor payload — see `CONTEXT.md`'s **Payload** entry. Distinct
 * from {@link DroneType} (behavior) and `Drone.model` (real-world identity,
 * issue I's fleet refresh) — three independent axes describing a Drone.
 */
export type DronePayload = 'Optical' | 'Thermal'

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

/**
 * A mobile sensor asset — a Quadrocopter or a Fixed-Wing Drone — homed at a
 * Base Station. `patrolRadiusMeters`/`patrolSpeedMetersPerSecond`/
 * `detectionRadiusMeters` are optional per-Drone overrides of the
 * simulation engine's type-based defaults (see
 * `engine/advanceSimulation.ts`) — omit them to use the default tight
 * (Quadrocopter) or long-perimeter (Fixed-Wing) patrol loop, and default
 * detection radius, for that Drone's type.
 *
 * `model`/`payload`/`maxEnduranceSimSeconds`/`cruiseSpeedMetersPerSecond`/
 * `datalinkRangeMeters`/`imageUrl` are issue I's real-world fleet identity
 * fields, purely additive on top of the fields above — see `CONTEXT.md`'s
 * **Drone Model** and **Payload** entries. `model`/`payload`/`imageUrl` are
 * static identity (read straight off this object); `maxEnduranceSimSeconds`
 * replaces the old shared `DRONE_MAX_ENDURANCE_SIM_SECONDS` constant as the
 * input to `engine/telemetry.ts`'s cosmetic battery-drain model;
 * `cruiseSpeedMetersPerSecond` is a representative flight speed for issue
 * K's Return Envelope (distinct from `patrolSpeedMetersPerSecond`, which
 * only drives the visible patrol-loop animation speed); `datalinkRangeMeters`
 * is for issue M's out-of-range Datalink visual state.
 */
export interface Drone {
  id: string
  type: DroneType
  position: LatLng
  homeBaseStationId: string
  patrolRadiusMeters?: number
  patrolSpeedMetersPerSecond?: number
  detectionRadiusMeters?: number
  model: string
  payload: DronePayload
  maxEnduranceSimSeconds: number
  cruiseSpeedMetersPerSecond: number
  datalinkRangeMeters: number
  imageUrl: string
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
