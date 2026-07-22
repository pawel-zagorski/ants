import { collectLatLngIssues, collectStringFieldIssues, isFiniteNumber, isPlainObject } from '../validation/jsonValidation'
import type { EventType, Scenario, ScenarioEntry } from './types'

const EVENT_TYPES: readonly EventType[] = ['PersonSighting', 'FallenTree']

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

/**
 * Validates a Fire ignition entry (ADR-0004): just `id`/`position`/
 * `spawnAtSimSeconds`, and — unlike a Person Sighting/Fallen Tree Event —
 * no `durationSimSeconds` at all, since a Fire never auto-resolves.
 * Rejecting its presence outright (rather than silently ignoring it) turns
 * a likely scenario-authoring mistake (copy-pasting an Event entry and
 * forgetting to drop the field) into a loud validation error.
 */
function collectFireIgnitionIssues(value: Record<string, unknown>, path: string, issues: string[]): void {
  collectStringFieldIssues(value.id, `${path}.id`, issues)
  collectLatLngIssues(value.position, `${path}.position`, issues)

  if (!isFiniteNumber(value.spawnAtSimSeconds) || value.spawnAtSimSeconds < 0) {
    issues.push(`${path}.spawnAtSimSeconds must be a non-negative finite number`)
  }

  if (value.durationSimSeconds !== undefined) {
    issues.push(`${path}.durationSimSeconds must not be present on a Fire ignition entry — Fires never auto-resolve`)
  }
}

/** Validates a Person Sighting/Fallen Tree Event entry — unchanged from before ADR-0004's Fire split. */
function collectEventIssues(value: Record<string, unknown>, path: string, issues: string[]): void {
  collectStringFieldIssues(value.id, `${path}.id`, issues)

  if (!EVENT_TYPES.includes(value.type as EventType)) {
    issues.push(`${path}.type must be one of ${EVENT_TYPES.join(', ')} or Fire`)
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
 * Dispatches a single `events[]` entry to Fire-ignition or Event
 * validation by `type`, so the two are validated distinctly (ADR-0004)
 * even though they share the same JSON array.
 */
function collectScenarioEntryIssues(value: unknown, path: string, issues: string[]): void {
  if (!isPlainObject(value)) {
    issues.push(`${path} must be an object`)
    return
  }

  if (value.type === 'Fire') {
    collectFireIgnitionIssues(value, path, issues)
    return
  }

  collectEventIssues(value, path, issues)
}

function collectDuplicateIdIssues(entries: ScenarioEntry[], issues: string[]): void {
  const seenIds = new Set<string>()
  entries.forEach((entry) => {
    if (typeof entry.id !== 'string') return
    if (seenIds.has(entry.id)) {
      issues.push(`duplicate event id "${entry.id}" — every Event/Fire id must be unique within a Scenario`)
    }
    seenIds.add(entry.id)
  })
}

/**
 * Validates and parses raw `scenario-*.json` content into a {@link
 * Scenario}. Throws a {@link ScenarioValidationError} listing every issue
 * found when the input does not match the documented schema (ADR-0002,
 * ADR-0004) — never returns a partially-valid Scenario.
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

  data.events.forEach((entry, index) => collectScenarioEntryIssues(entry, `events[${index}]`, issues))

  if (issues.length === 0) {
    collectDuplicateIdIssues(data.events as ScenarioEntry[], issues)
  }

  if (issues.length > 0) {
    throw new ScenarioValidationError(issues)
  }

  return data as unknown as Scenario
}
