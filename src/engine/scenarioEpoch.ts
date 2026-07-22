/**
 * The Scenario Epoch (`CONTEXT.md`): converts a Scenario's `startDateTimeIso`
 * plus an `elapsedSimSeconds` offset into the real calendar `Date` that
 * moment corresponds to. Every timestamp shown anywhere in the UI (PRD
 * "Scenario Epoch" Implementation Decision) is this Epoch plus elapsed
 * Simulation Clock time — this is the one place that math lives.
 *
 * `startDateTimeIso` is assumed already validated by `parseScenario`
 * (`../scenario/schema.ts`), which rejects any scenario file missing it or
 * whose value `Date.parse` can't interpret.
 */
export function scenarioDateTimeAt(startDateTimeIso: string, elapsedSimSeconds: number): Date {
  return new Date(Date.parse(startDateTimeIso) + elapsedSimSeconds * 1000)
}

/** Zero-pads a non-negative number to (at least) 2 digits — shared with `SimulationClockPanel`'s raw-elapsed fallback display. */
export function pad2(value: number): string {
  return value.toString().padStart(2, '0')
}

/**
 * Formats {@link scenarioDateTimeAt}'s result as `YYYY-MM-DD HH:MM:SS`.
 * Reads the `Date` back out via its UTC getters (rather than the host's
 * local timezone) so the displayed calendar date/time is a pure function of
 * `startDateTimeIso`/`elapsedSimSeconds` alone, independent of the browser's
 * timezone — the same determinism/reproducibility guarantee (ADR-0003) the
 * rest of the engine holds to.
 */
export function formatScenarioDateTime(startDateTimeIso: string, elapsedSimSeconds: number): string {
  const date = scenarioDateTimeAt(startDateTimeIso, elapsedSimSeconds)
  const datePart = `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`
  const timePart = `${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}:${pad2(date.getUTCSeconds())}`
  return `${datePart} ${timePart}`
}
