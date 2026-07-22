import type { Asset, BaseStation, Drone, DroneType, Tower, World } from './types'

const DRONE_TYPES: readonly DroneType[] = ['Quadrocopter', 'FixedWingDrone']

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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** Validates a `{ lat, lng }` pair, pushing any issues found under `path`. */
function collectLatLngIssues(value: unknown, path: string, issues: string[]): void {
  if (!isPlainObject(value)) {
    issues.push(`${path} must be an object with numeric lat/lng`)
    return
  }
  if (!isFiniteNumber(value.lat) || value.lat < -90 || value.lat > 90) {
    issues.push(`${path}.lat must be a finite number between -90 and 90`)
  }
  if (!isFiniteNumber(value.lng) || value.lng < -180 || value.lng > 180) {
    issues.push(`${path}.lng must be a finite number between -180 and 180`)
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

function collectStringFieldIssues(value: unknown, path: string, issues: string[]): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    issues.push(`${path} must be a non-empty string`)
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

function collectDroneIssues(value: unknown, path: string, issues: string[]): void {
  const drone = collectCommonAssetIssues(value, path, issues)
  if (!drone) return
  if (!DRONE_TYPES.includes(drone.type as DroneType)) {
    issues.push(`${path}.type must be one of ${DRONE_TYPES.join(', ')}`)
  }
  collectStringFieldIssues(drone.homeBaseStationId, `${path}.homeBaseStationId`, issues)
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
