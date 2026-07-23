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
 * The three entries below are the PRD's Further Notes named Scenarios
 * (issue H), each tuned against the default `world.json` roster — see
 * `bundledScenarios.integration.test.ts` for the geometric proof that each
 * one actually behaves as its description promises.
 */
import { withBase } from '../basePath'

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
    description: 'A few harmless Fallen Tree reports, no Fire — most get noticed, one never does.',
    url: withBase('scenario-quiet-day.json'),
  },
  {
    id: 'wildfire-outbreak',
    name: 'Wildfire Outbreak',
    description: 'A Tower spots a Fire and keeps tracking it.',
    url: withBase('scenario-wildfire-outbreak.json'),
  },
  {
    id: 'hiker-intrusion',
    name: 'Hiker Intrusion',
    description: 'A Person Sighting stays invisible until a patrolling Drone finally passes by.',
    url: withBase('scenario-hiker-intrusion.json'),
  },
  {
    id: 'illegal-deforestation',
    name: 'Illegal Deforestation',
    description: 'A patrolling Drone spots an illegal Clearcut from a distance — a rough estimate until investigated.',
    url: withBase('scenario-illegal-deforestation.json'),
  },
]
