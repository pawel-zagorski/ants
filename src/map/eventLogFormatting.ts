import { formatScenarioDateTime, pad2 } from '../engine/scenarioEpoch'
import { distanceMetersBetween } from './geo'
import type { LatLng } from './geo'
import { assetTypeLabel } from '../world/assetTypeLabel'
import { eventTypeLabel } from '../scenario/eventTypeLabel'
import type { EventLogEntry, EventLogKind, LogSeverity } from '../engine/eventLog'
import type { Scenario } from '../scenario/types'
import type { World } from '../world/types'

/**
 * A single {@link EventLogEntry} rendered for display in `EventLogPanel`:
 * the calendar/elapsed `timestamp`, the human-readable `text` (with no
 * `WARNING: ` prefix — the panel prepends that itself for warning rows, see
 * `EventLogPanel.tsx` / `CONTEXT.md`'s **Event Log** entry), and the
 * `severity` that decides whether it's a nominal or non-nominal line.
 */
export interface FormattedLogEntry {
  timestamp: string
  text: string
  severity: LogSeverity
}

/**
 * Which Log Entry kinds are non-nominal `'warning'` lines (`CONTEXT.md`:
 * Fire discovered, One-Way Mission dispatch, Lost) — every other kind is a
 * nominal `'info'` line. This is the single source of truth for a line's
 * severity at the UI layer; an entry's own `severity` field should agree
 * (the engine derives it from this same rule at emit time).
 */
const SEVERITY_BY_KIND: Record<EventLogKind, LogSeverity> = {
  eventDetected: 'info',
  fireDetected: 'warning',
  droneDispatchedToEvent: 'info',
  droneDispatchedToFire: 'info',
  droneDispatchedOneWay: 'warning',
  droneBeganFireOrbit: 'info',
  droneReturningAfterOrbit: 'info',
  droneRecalledToBase: 'info',
  droneResumedPatrol: 'info',
  droneGrounded: 'info',
  droneLost: 'warning',
}

/** Above this straight-line distance to the nearest named asset, a location falls back to raw decimal coordinates instead of a bearing/distance phrase. */
const NEAREST_ASSET_MAX_METERS = 50_000

/** The 16-point compass rose, indexed clockwise from due north. */
const COMPASS_POINTS_16 = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
] as const

/**
 * The compass bearing (degrees, 0 = north, 90 = east, clockwise, in
 * `[0, 360)`) from `from` to `to`, using the same flat-earth east/north
 * approximation the rest of `geo.ts` uses (no ellipsoid/geodesic math) —
 * plenty accurate for the bearing phrase in a Log Entry's location.
 */
export function bearingDegrees(from: LatLng, to: LatLng): number {
  const kmPerDegreeLongitude = 111.32 * Math.cos((from.lat * Math.PI) / 180)
  const eastKm = (to.lng - from.lng) * kmPerDegreeLongitude
  const northKm = (to.lat - from.lat) * 111.32
  const degrees = (Math.atan2(eastKm, northKm) * 180) / Math.PI
  return (degrees + 360) % 360
}

/** Maps a bearing in degrees to its nearest 16-point compass label (N, NNE, NE, …). */
export function compass16(bearingDeg: number): string {
  const index = Math.round((((bearingDeg % 360) + 360) % 360) / 22.5) % 16
  return COMPASS_POINTS_16[index]
}

/**
 * Prettifies a kebab-case asset/entity id into an operator-facing label:
 * `"tower-1"` → `"Tower 1"`, `"base-2"` → `"Base 2"`, `"drone-1"` →
 * `"Drone 1"`. Each hyphen-separated segment is capitalized and rejoined
 * with spaces.
 */
export function prettifyId(id: string): string {
  return id
    .split('-')
    .map((part) => (part.length === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(' ')
}

/** Raw decimal-coordinate fallback, e.g. `"64.7000°N, 26.3051°E"` — hemisphere letters, absolute values, four decimals. */
function formatDecimalCoordinates(position: LatLng): string {
  const latHemisphere = position.lat >= 0 ? 'N' : 'S'
  const lngHemisphere = position.lng >= 0 ? 'E' : 'W'
  return `${Math.abs(position.lat).toFixed(4)}°${latHemisphere}, ${Math.abs(position.lng).toFixed(4)}°${lngHemisphere}`
}

/**
 * A human-readable location for `position`: bearing + distance from the
 * NEAREST named asset (Towers + Base Stations), e.g.
 * `"3.2 km NNE of Tower 1"`. Falls back to raw decimal coordinates (see
 * {@link formatDecimalCoordinates}) when there is no named asset within
 * {@link NEAREST_ASSET_MAX_METERS} — or none at all. Drones are excluded on
 * purpose: they move, so they make poor fixed reference points.
 */
export function describeLocation(position: LatLng, world: World): string {
  const namedAssets = [...world.towers, ...world.baseStations]

  let nearestId: string | undefined
  let nearestPosition: LatLng | undefined
  let nearestDistanceMeters = Infinity
  for (const asset of namedAssets) {
    const distanceMeters = distanceMetersBetween(asset.position, position)
    if (distanceMeters < nearestDistanceMeters) {
      nearestDistanceMeters = distanceMeters
      nearestId = asset.id
      nearestPosition = asset.position
    }
  }

  if (nearestId === undefined || nearestPosition === undefined || nearestDistanceMeters > NEAREST_ASSET_MAX_METERS) {
    return formatDecimalCoordinates(position)
  }

  const distanceKm = (nearestDistanceMeters / 1000).toFixed(1)
  const direction = compass16(bearingDegrees(nearestPosition, position))
  return `${distanceKm} km ${direction} of ${prettifyId(nearestId)}`
}

/**
 * The Scenario-Epoch calendar timestamp for `simSeconds` (full
 * `YYYY-MM-DD HH:MM:SS` UTC — see `../engine/scenarioEpoch.ts`), or, when
 * the Scenario has no `startDateTimeIso`, an elapsed `T+MM:SS` fallback
 * (mirroring `SimulationClockPanel`/`EventPanel`'s own raw-elapsed style).
 */
function formatTimestamp(scenario: Scenario, simSeconds: number): string {
  if (scenario.startDateTimeIso) {
    return formatScenarioDateTime(scenario.startDateTimeIso, simSeconds)
  }
  const totalSeconds = Math.max(0, Math.floor(simSeconds))
  return `T+${pad2(Math.floor(totalSeconds / 60))}:${pad2(totalSeconds % 60)}`
}

/** The simple operator-facing Drone name, e.g. `"Drone 1"` (no model/type suffix). */
function droneName(entry: EventLogEntry): string {
  return entry.droneId ? prettifyId(entry.droneId) : 'Drone'
}

/**
 * The rich Drone label used on dispatch/recall/grounded/lost lines:
 * `"Drone 1 (DJI Mavic 4 Pro, Quadrocopter)"`. The model/type are taken from
 * the entry's own `droneModel`/`droneType` when present, otherwise looked up
 * from `world` by `droneId` — the engine only stamps `droneType` (its
 * `DronePatrolState` carries no real-world `model`), so the World lookup is
 * what supplies the model for engine-emitted entries. Falls back to the
 * plain `"Drone 1"` name when neither source yields both a model and a type.
 */
export function droneLabel(entry: EventLogEntry, world?: World): string {
  const name = droneName(entry)
  const worldDrone = entry.droneId && world ? world.drones.find((drone) => drone.id === entry.droneId) : undefined
  const model = entry.droneModel ?? worldDrone?.model
  const droneType = entry.droneType ?? worldDrone?.type
  if (model && droneType) {
    return `${name} (${model}, ${assetTypeLabel(droneType)})`
  }
  return name
}

/** Mid-sentence event-type phrasing, e.g. `"person sighting"` / `"fallen tree"`. */
function eventTypeLower(entry: EventLogEntry): string {
  return entry.eventType ? eventTypeLabel(entry.eventType).toLowerCase() : 'event'
}

/** Sentence-start event-type phrasing, e.g. `"Person sighting"` / `"Fallen tree"`. */
function eventTypeSentence(entry: EventLogEntry): string {
  const lower = eventTypeLower(entry)
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

/** The described location for this entry's `position` (or a plain fallback phrase if it somehow carries none). */
function locationText(entry: EventLogEntry, world: World): string {
  return entry.position ? describeLocation(entry.position, world) : 'an unknown location'
}

/**
 * The Base Station a recall targets, named directly (e.g. `"Base 2"`) rather
 * than as a bearing/distance phrase — a `droneRecalledToBase` entry's
 * `position` IS a Base Station, so `describeLocation` would otherwise read the
 * awkward `"0.0 km N of Base 2"`. Prefers the entry's own `baseStationId`,
 * else the nearest Base Station to the entry's `position`. Falls back to the
 * generic `"nearest base"` when neither is available.
 */
function recalledBaseName(entry: EventLogEntry, world: World): string {
  if (entry.baseStationId) {
    return prettifyId(entry.baseStationId)
  }
  if (!entry.position || world.baseStations.length === 0) {
    return 'nearest base'
  }
  let nearest = world.baseStations[0]
  let nearestDistanceMeters = distanceMetersBetween(nearest.position, entry.position)
  for (const baseStation of world.baseStations.slice(1)) {
    const distanceMeters = distanceMetersBetween(baseStation.position, entry.position)
    if (distanceMeters < nearestDistanceMeters) {
      nearestDistanceMeters = distanceMeters
      nearest = baseStation
    }
  }
  return prettifyId(nearest.id)
}

/**
 * Builds the human-readable line for one {@link EventLogEntry} by kind,
 * matching ADR-0008 / `CONTEXT.md`'s Event Log wording. Deliberately does
 * NOT bake a `WARNING: ` prefix into warning-severity lines — the panel
 * adds that based on {@link FormattedLogEntry.severity}.
 */
function textForEntry(entry: EventLogEntry, world: World): string {
  switch (entry.kind) {
    case 'eventDetected':
      return `${eventTypeSentence(entry)} detected ${locationText(entry, world)}`
    case 'fireDetected':
      return `Fire discovered ${locationText(entry, world)}`
    case 'droneDispatchedToEvent':
      return `${droneLabel(entry, world)} dispatched to investigate ${eventTypeLower(entry)} ${locationText(entry, world)}`
    case 'droneDispatchedToFire':
      return `${droneLabel(entry, world)} dispatched to investigate fire ${locationText(entry, world)}`
    case 'droneDispatchedOneWay':
      return `${droneLabel(entry, world)} dispatched on a ONE-WAY mission to fire ${locationText(entry, world)}`
    case 'droneBeganFireOrbit':
      return `${droneName(entry)} reached the fire and began orbiting ${locationText(entry, world)}`
    case 'droneReturningAfterOrbit':
      return `${droneName(entry)} finished investigating the fire and is returning to base`
    case 'droneRecalledToBase':
      return `${droneLabel(entry, world)} ordered to return to nearest base (${recalledBaseName(entry, world)})`
    case 'droneResumedPatrol':
      return `${droneName(entry)} resumed patrolling`
    case 'droneGrounded':
      return `${droneLabel(entry, world)} grounded at base — out of service`
    case 'droneLost':
      return `${droneLabel(entry, world)} lost — endurance exhausted`
  }
}

/**
 * Formats a single {@link EventLogEntry} into its display parts: a
 * Scenario-Epoch (or elapsed-fallback) `timestamp`, the human-readable
 * `text`, and the `severity` (derived from {@link SEVERITY_BY_KIND}, the
 * one source of truth — an entry's own `severity` field should agree).
 * Pure: no React, no wall-clock, no formatting baked into engine state
 * (ADR-0008).
 */
export function formatEventLogEntry(entry: EventLogEntry, scenario: Scenario, world: World): FormattedLogEntry {
  return {
    timestamp: formatTimestamp(scenario, entry.simSeconds),
    text: textForEntry(entry, world),
    severity: SEVERITY_BY_KIND[entry.kind],
  }
}
