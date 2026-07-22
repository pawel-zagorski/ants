import type { LatLng } from '../map/geo'

/**
 * Discriminant for the two kinds of ground-truth Event a Scenario can
 * script, per `CONTEXT.md` exactly — never "Alert" (that would be a UI
 * notification of a Detection, not the Event itself). Fire is deliberately
 * excluded (ADR-0004): it shares this Scenario's timed authoring list (see
 * `ScenarioEntry` below) but is its own domain concept, not a kind of
 * Event — see `ScenarioFireIgnition`.
 */
export type EventType = 'PersonSighting' | 'FallenTree'

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
 * A single scripted Fire ignition from a `scenario-*.json` file (ADR-0004):
 * just a static point and when it ignites — deliberately no
 * `durationSimSeconds`, since a Fire never auto-resolves (`CONTEXT.md`'s
 * Fire entry: Undetected → Tower-Detected → Investigated, no Resolved).
 * Kept as its own interface rather than an optional-fields addition to
 * `ScenarioEvent` so a Fire ignition can never be authored with a
 * `durationSimSeconds` that would silently do nothing.
 */
export interface ScenarioFireIgnition {
  id: string
  type: 'Fire'
  position: LatLng
  spawnAtSimSeconds: number
}

/**
 * One entry in a Scenario's single timed list (ADR-0004): either a Fire
 * ignition or a Person Sighting/Fallen Tree Event, told apart by `type`.
 * Fire shares this list with Events purely to avoid schema churn — it is
 * still its own domain concept, not a kind of Event (see `EventType`).
 */
export type ScenarioEntry = ScenarioEvent | ScenarioFireIgnition

/**
 * A reproducible, timed script of Events and Fire ignitions to spawn
 * against a World (see `CONTEXT.md`). Deliberately holds nothing about the
 * World roster itself (ADR-0002) — a Scenario references a World, it never
 * redefines it.
 */
export interface Scenario {
  events: ScenarioEntry[]
}
