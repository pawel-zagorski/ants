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
 * A fixed direction/speed authored once per Scenario (see `CONTEXT.md`'s
 * "Wind" entry) — constant for the whole run, hand-authored, never
 * randomized or time-varying (ADR-0003's reproducibility guarantee).
 *
 * `directionDegrees` follows standard meteorological convention: the
 * direction the wind is blowing FROM, measured clockwise from true north
 * (0=N, 90=E, 180=S, 270=W). A "northerly wind" (0) blows from north
 * *to* south — it does not blow toward the north. Any consumer that
 * needs the direction the wind is blowing *toward* (e.g. a compass arrow,
 * or issue R's downwind Growth Ellipse bias) must add 180 to this value.
 */
export interface Wind {
  directionDegrees: number
  speedMetersPerSecond: number
}

/**
 * A reproducible, timed script of Events to spawn against a World (see
 * `CONTEXT.md`). Deliberately holds nothing about the World roster itself
 * (ADR-0002) — a Scenario references a World, it never redefines it.
 */
export interface Scenario {
  events: ScenarioEvent[]
  wind: Wind
}
