import { collectLatLngIssues, collectStringFieldIssues, isFiniteNumber, isPlainObject } from '../validation/jsonValidation'
import type { Asset, BaseStation, Drone, DronePayload, DroneType, Tower, World } from './types'

const DRONE_TYPES: readonly DroneType[] = ['Quadrocopter', 'FixedWingDrone']
const DRONE_PAYLOADS: readonly DronePayload[] = ['Optical', 'Thermal']

/**
 * Thrown when `world.json` content does not match the documented schema.
 * Carries every issue found (not just the first) so a malformed file fails
 * loudly with a full diagnosis rather than one issue at a time.
 */
export class WorldValidationError extends Error {
  readonly issues: readonly string[]

  constructor(issues: readonly string[]) {
    super(`world.json failed validation:\n- ${issues.join('\n- ')}`)
    this.name = 'WorldValidationError'
    this.issues = issues
  }
}

function collectBoundsIssues(value: unknown, issues: string[]): void {
  if (!isPlainObject(value)) {
    issues.push('bounds must be an object with southWest/northEast lat/lng corners')
    return
  }
  collectLatLngIssues(value.southWest, 'bounds.southWest', issues)
  collectLatLngIssues(value.northEast, 'bounds.northEast', issues)

  const southWest = value.southWest as { lat?: unknown; lng?: unknown } | undefined
  const northEast = value.northEast as { lat?: unknown; lng?: unknown } | undefined
  if (
    isFiniteNumber(southWest?.lat) &&
    isFiniteNumber(northEast?.lat) &&
    isFiniteNumber(southWest?.lng) &&
    isFiniteNumber(northEast?.lng) &&
    (southWest.lat >= northEast.lat || southWest.lng >= northEast.lng)
  ) {
    issues.push('bounds.southWest must be strictly south and west of bounds.northEast')
  }
}

/**
 * Validates the `id` and `position` fields every asset kind shares, and
 * returns the object so callers can go on to check their type-specific
 * fields. Returns `undefined` (after recording an issue) when `value` isn't
 * even an object, so callers can bail out early.
 */
function collectCommonAssetIssues(
  value: unknown,
  path: string,
  issues: string[],
): Record<string, unknown> | undefined {
  if (!isPlainObject(value)) {
    issues.push(`${path} must be an object`)
    return undefined
  }
  collectStringFieldIssues(value.id, `${path}.id`, issues)
  collectLatLngIssues(value.position, `${path}.position`, issues)
  return value
}

function collectTowerIssues(value: unknown, path: string, issues: string[]): void {
  const tower = collectCommonAssetIssues(value, path, issues)
  if (!tower) return
  if (tower.type !== 'Tower') {
    issues.push(`${path}.type must be "Tower"`)
  }
  if (!isFiniteNumber(tower.detectionRadiusMeters) || tower.detectionRadiusMeters <= 0) {
    issues.push(`${path}.detectionRadiusMeters must be a positive finite number`)
  }
}

function collectBaseStationIssues(value: unknown, path: string, issues: string[]): void {
  const baseStation = collectCommonAssetIssues(value, path, issues)
  if (!baseStation) return
  if (baseStation.type !== 'BaseStation') {
    issues.push(`${path}.type must be "BaseStation"`)
  }
}

/**
 * Validates a Drone's optional `patrolRoute` (issue AA): when present it must
 * be an array of valid `{ lat, lng }` waypoints (each checked via
 * {@link collectLatLngIssues}). An empty array is accepted — it means "no
 * Patrol Route", the legacy base-station loop (see `Drone.patrolRoute`'s doc
 * comment and `engine/advanceSimulation.ts`). Absent is likewise fine.
 */
function collectPatrolRouteIssues(value: unknown, path: string, issues: string[]): void {
  if (value === undefined) return
  if (!Array.isArray(value)) {
    issues.push(`${path} must be an array of { lat, lng } waypoints when provided`)
    return
  }
  value.forEach((waypoint, index) => collectLatLngIssues(waypoint, `${path}[${index}]`, issues))
}

/** Validates an optional positive-number field, pushing an issue only when the field is present but invalid. */
function collectOptionalPositiveNumberIssues(value: unknown, path: string, issues: string[]): void {
  if (value === undefined) return
  if (!isFiniteNumber(value) || value <= 0) {
    issues.push(`${path} must be a positive finite number when provided`)
  }
}

/** Validates a required positive-number field — unlike {@link collectOptionalPositiveNumberIssues}, missing also fails. */
function collectRequiredPositiveNumberIssues(value: unknown, path: string, issues: string[]): void {
  if (!isFiniteNumber(value) || value <= 0) {
    issues.push(`${path} must be a positive finite number`)
  }
}

/**
 * Validates a Drone's issue I fleet-identity fields (`model`/`payload`/
 * `maxEnduranceSimSeconds`/`cruiseSpeedMetersPerSecond`/
 * `datalinkRangeMeters`/`imageUrl`) — all required, purely additive
 * alongside the pre-existing fields {@link collectDroneIssues} already
 * checks.
 */
function collectDroneSpecIssues(drone: Record<string, unknown>, path: string, issues: string[]): void {
  collectStringFieldIssues(drone.model, `${path}.model`, issues)
  if (!DRONE_PAYLOADS.includes(drone.payload as DronePayload)) {
    issues.push(`${path}.payload must be one of ${DRONE_PAYLOADS.join(', ')}`)
  }
  collectRequiredPositiveNumberIssues(drone.maxEnduranceSimSeconds, `${path}.maxEnduranceSimSeconds`, issues)
  collectRequiredPositiveNumberIssues(drone.cruiseSpeedMetersPerSecond, `${path}.cruiseSpeedMetersPerSecond`, issues)
  collectRequiredPositiveNumberIssues(drone.datalinkRangeMeters, `${path}.datalinkRangeMeters`, issues)
  collectStringFieldIssues(drone.imageUrl, `${path}.imageUrl`, issues)
}

function collectDroneIssues(value: unknown, path: string, issues: string[]): void {
  const drone = collectCommonAssetIssues(value, path, issues)
  if (!drone) return
  if (!DRONE_TYPES.includes(drone.type as DroneType)) {
    issues.push(`${path}.type must be one of ${DRONE_TYPES.join(', ')}`)
  }
  collectStringFieldIssues(drone.homeBaseStationId, `${path}.homeBaseStationId`, issues)
  collectOptionalPositiveNumberIssues(drone.patrolRadiusMeters, `${path}.patrolRadiusMeters`, issues)
  collectOptionalPositiveNumberIssues(drone.patrolSpeedMetersPerSecond, `${path}.patrolSpeedMetersPerSecond`, issues)
  collectOptionalPositiveNumberIssues(drone.detectionRadiusMeters, `${path}.detectionRadiusMeters`, issues)
  collectPatrolRouteIssues(drone.patrolRoute, `${path}.patrolRoute`, issues)
  collectDroneSpecIssues(drone, path, issues)
}

/** Validates each element of an array field with a per-item validator, or records that it isn't an array. */
function collectArrayIssues<T>(
  value: unknown,
  fieldName: string,
  itemValidator: (item: unknown, path: string, issues: string[]) => void,
  issues: string[],
): value is T[] {
  if (!Array.isArray(value)) {
    issues.push(`${fieldName} must be an array`)
    return false
  }
  value.forEach((item, index) => itemValidator(item, `${fieldName}[${index}]`, issues))
  return true
}

function collectReferentialIssues(
  baseStations: BaseStation[],
  drones: Drone[],
  allAssets: { id: unknown }[],
  issues: string[],
): void {
  const baseStationIds = new Set(baseStations.map((baseStation) => baseStation.id))
  drones.forEach((drone, index) => {
    if (typeof drone.homeBaseStationId === 'string' && !baseStationIds.has(drone.homeBaseStationId)) {
      issues.push(`drones[${index}].homeBaseStationId "${drone.homeBaseStationId}" does not match any baseStations[].id`)
    }
  })

  const seenIds = new Set<string>()
  allAssets.forEach((asset) => {
    if (typeof asset.id !== 'string') return
    if (seenIds.has(asset.id)) {
      issues.push(`duplicate asset id "${asset.id}" — every Tower/BaseStation/Drone id must be unique`)
    }
    seenIds.add(asset.id)
  })
}

/**
 * Validates and parses raw `world.json` content into a {@link World}.
 * Throws a {@link WorldValidationError} listing every issue found when the
 * input does not match the documented schema (ADR-0002) — never returns a
 * partially-valid World.
 */
export function parseWorld(data: unknown): World {
  const issues: string[] = []

  if (!isPlainObject(data)) {
    throw new WorldValidationError(['world.json must contain a JSON object'])
  }

  collectBoundsIssues(data.bounds, issues)

  const towersOk = collectArrayIssues<Tower>(data.towers, 'towers', collectTowerIssues, issues)
  const baseStationsOk = collectArrayIssues<BaseStation>(
    data.baseStations,
    'baseStations',
    collectBaseStationIssues,
    issues,
  )
  const dronesOk = collectArrayIssues<Drone>(data.drones, 'drones', collectDroneIssues, issues)

  if (towersOk && baseStationsOk && dronesOk && issues.length === 0) {
    const towers = data.towers as Tower[]
    const baseStations = data.baseStations as BaseStation[]
    const drones = data.drones as Drone[]
    const allAssets: Asset[] = [...towers, ...baseStations, ...drones]
    collectReferentialIssues(baseStations, drones, allAssets, issues)
  }

  if (issues.length > 0) {
    throw new WorldValidationError(issues)
  }

  return data as unknown as World
}
