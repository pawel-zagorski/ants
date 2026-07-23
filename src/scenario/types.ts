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
 * A single scripted Clearcut from a `scenario-*.json` file (ADR-0009):
 * an illegal-deforestation site, modeled as a sibling of a Fire ignition
 * rather than a kind of Event (parallels `ScenarioFireIgnition`/ADR-0004).
 * Authored as a static, *oriented* footprint: a `position` centroid, when
 * it spawns (`spawnAtSimSeconds`, typically `0`), and the footprint's shape
 * as an ellipse — `semiMajorAxisMeters`/`semiMinorAxisMeters` (its two
 * half-axes) plus `orientationDegrees` (the major axis' compass bearing,
 * clockwise from north, so a road-aligned logging site can be elongated
 * along the road). Deliberately no `durationSimSeconds` (a Clearcut never
 * auto-resolves) and — unlike a Fire — no Wind/time term at all: its
 * Clearcut Footprint (`engine/clearcutFootprint.ts`) is fixed for the whole
 * run (`CONTEXT.md`'s Clearcut Footprint entry).
 */
export interface ScenarioClearcut {
  id: string
  type: 'Clearcut'
  position: LatLng
  spawnAtSimSeconds: number
  semiMajorAxisMeters: number
  semiMinorAxisMeters: number
  orientationDegrees: number
}

/**
 * One entry in a Scenario's single timed list (ADR-0004/ADR-0009): a Fire
 * ignition, a Clearcut, or a Person Sighting/Fallen Tree Event, told apart
 * by `type`. Fire and Clearcut share this list with Events purely to avoid
 * schema churn — each is still its own domain concept, not a kind of Event
 * (see `EventType`).
 */
export type ScenarioEntry = ScenarioEvent | ScenarioFireIgnition | ScenarioClearcut

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
 * A reproducible, timed script of Events and Fire ignitions to spawn
 * against a World (see `CONTEXT.md`). Deliberately holds nothing about the
 * World roster itself (ADR-0002) — a Scenario references a World, it never
 * redefines it.
 */
export interface Scenario {
  events: ScenarioEntry[]
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
  wind: Wind
}
