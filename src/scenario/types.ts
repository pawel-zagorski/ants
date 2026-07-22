import type { LatLng } from '../map/geo'

/**
 * Discriminant for the three kinds of ground-truth Event a Scenario can
 * script, per `CONTEXT.md` exactly — never "Alert" (that would be a UI
 * notification of a Detection, not the Event itself).
 */
export type EventType = 'Fire' | 'PersonSighting' | 'FallenTree'

/**
 * A single scripted Event from a `scenario-*.json` file (ADR-0002): a
 * static point, a type, when it spawns, and — optionally — how long after
 * Detection it stays Detected before auto-resolving (a later slice's
 * concern; this slice only carries the field through).
 */
export interface ScenarioEvent {
  id: string
  type: EventType
  position: LatLng
  spawnAtSimSeconds: number
  durationSimSeconds?: number
}

/**
 * A reproducible, timed script of Events to spawn against a World (see
 * `CONTEXT.md`). Deliberately holds nothing about the World roster itself
 * (ADR-0002) — a Scenario references a World, it never redefines it.
 */
export interface Scenario {
  events: ScenarioEvent[]
  /**
   * The Scenario Epoch (`CONTEXT.md`): the real calendar date/time, as an
   * ISO 8601 string, that `elapsedSimSeconds = 0` corresponds to. Every
   * timestamp shown in the UI is this Epoch plus elapsed Simulation Clock
   * time (see `../engine/scenarioEpoch.ts`). `parseScenario` rejects any
   * `scenario-*.json` missing this or with an unparseable value, so every
   * real (loaded) Scenario is guaranteed to have one — kept optional on
   * this type only so the many hand-built `Scenario` fixtures in engine/UI
   * tests that don't care about calendar time aren't forced to supply a
   * placeholder value.
   */
  startDateTimeIso?: string
}
