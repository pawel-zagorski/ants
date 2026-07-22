/**
 * One entry per Scenario file bundled with the app for the start screen's
 * dropdown. This is intentionally the *only* place that lists them —
 * dropping in another `scenario-*.json` under `public/` and adding one
 * entry here is the whole extension story, no other code changes needed.
 *
 * `name`/`description` are UI-facing labels, not part of the
 * `scenario-*.json` schema itself (ADR-0002: a scenario file holds only its
 * Event list) — that's why they live in this registry instead of inside
 * the file.
 *
 * "Quiet Day" is a placeholder for this slice (a couple of harmless Fallen
 * Tree events) — full authoring of it and the other two named scenarios
 * ("Wildfire Outbreak", "Hiker Intrusion") from the PRD is issue H.
 */
export interface BundledScenarioListing {
  id: string
  name: string
  description: string
  url: string
}

export const BUNDLED_SCENARIOS: readonly BundledScenarioListing[] = [
  {
    id: 'quiet-day',
    name: 'Quiet Day',
    description: 'Placeholder scenario: a couple of harmless Fallen Tree events, no Fire.',
    url: '/scenario-quiet-day.json',
  },
]
