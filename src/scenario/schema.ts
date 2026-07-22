import { collectLatLngIssues, collectStringFieldIssues, isFiniteNumber, isPlainObject } from '../validation/jsonValidation'
import type { EventType, Scenario, ScenarioEvent } from './types'

const EVENT_TYPES: readonly EventType[] = ['Fire', 'PersonSighting', 'FallenTree']

/**
 * Thrown when `scenario-*.json` content does not match the documented
 * schema. Carries every issue found (not just the first) so a malformed
 * file fails loudly with a full diagnosis rather than one issue at a time
 * — mirrors `WorldValidationError` in `../world/schema`.
 */
export class ScenarioValidationError extends Error {
  readonly issues: readonly string[]

  constructor(issues: readonly string[]) {
    super(`scenario file failed validation:\n- ${issues.join('\n- ')}`)
    this.name = 'ScenarioValidationError'
    this.issues = issues
  }
}

function collectScenarioEventIssues(value: unknown, path: string, issues: string[]): void {
  if (!isPlainObject(value)) {
    issues.push(`${path} must be an object`)
    return
  }

  collectStringFieldIssues(value.id, `${path}.id`, issues)

  if (!EVENT_TYPES.includes(value.type as EventType)) {
    issues.push(`${path}.type must be one of ${EVENT_TYPES.join(', ')}`)
  }

  collectLatLngIssues(value.position, `${path}.position`, issues)

  if (!isFiniteNumber(value.spawnAtSimSeconds) || value.spawnAtSimSeconds < 0) {
    issues.push(`${path}.spawnAtSimSeconds must be a non-negative finite number`)
  }

  if (
    value.durationSimSeconds !== undefined &&
    (!isFiniteNumber(value.durationSimSeconds) || value.durationSimSeconds <= 0)
  ) {
    issues.push(`${path}.durationSimSeconds must be a positive finite number when present`)
  }
}

/**
 * Validates the Scenario-wide `wind` field (see `CONTEXT.md`'s "Wind"
 * entry and the doc comment on {@link Wind} in `./types`):
 * `directionDegrees` must be a compass bearing in `[0, 360]` (the
 * direction the wind is blowing FROM), and `speedMetersPerSecond` must be
 * a non-negative finite number.
 */
function collectWindIssues(value: unknown, path: string, issues: string[]): void {
  if (!isPlainObject(value)) {
    issues.push(`${path} must be an object with directionDegrees/speedMetersPerSecond`)
    return
  }

  if (!isFiniteNumber(value.directionDegrees) || value.directionDegrees < 0 || value.directionDegrees > 360) {
    issues.push(`${path}.directionDegrees must be a finite number between 0 and 360`)
  }

  if (!isFiniteNumber(value.speedMetersPerSecond) || value.speedMetersPerSecond < 0) {
    issues.push(`${path}.speedMetersPerSecond must be a non-negative finite number`)
  }
}

function collectDuplicateIdIssues(events: ScenarioEvent[], issues: string[]): void {
  const seenIds = new Set<string>()
  events.forEach((event) => {
    if (typeof event.id !== 'string') return
    if (seenIds.has(event.id)) {
      issues.push(`duplicate event id "${event.id}" — every Event id must be unique within a Scenario`)
    }
    seenIds.add(event.id)
  })
}

/**
 * Validates and parses raw `scenario-*.json` content into a {@link
 * Scenario}. Throws a {@link ScenarioValidationError} listing every issue
 * found when the input does not match the documented schema (ADR-0002) —
 * never returns a partially-valid Scenario.
 */
export function parseScenario(data: unknown): Scenario {
  const issues: string[] = []

  if (!isPlainObject(data)) {
    throw new ScenarioValidationError(['scenario file must contain a JSON object with an "events" array'])
  }

  if (!Array.isArray(data.events)) {
    issues.push('events must be an array')
    throw new ScenarioValidationError(issues)
  }

  data.events.forEach((event, index) => collectScenarioEventIssues(event, `events[${index}]`, issues))
  collectWindIssues(data.wind, 'wind', issues)

  if (issues.length === 0) {
    collectDuplicateIdIssues(data.events as ScenarioEvent[], issues)
  }

  if (issues.length > 0) {
    throw new ScenarioValidationError(issues)
  }

  return data as unknown as Scenario
}
