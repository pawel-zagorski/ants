# Forest Situational Awareness — Implementation Issues

Local issue list (no issue tracker configured). Vertical slices ("tracer bullets") derived from [`docs/prd/forest-situational-awareness.md`](../prd/forest-situational-awareness.md), following `CONTEXT.md` vocabulary and the ADRs in `docs/adr/`. Publish/implement in order — each issue is blocked by the one before it.

**All issues complete (A–H).** The three bundled example Scenarios ("Quiet Day", "Wildfire Outbreak", "Hiker Intrusion") are fully authored and verified against the default `world.json` — see `src/scenario/bundledScenarios.integration.test.ts`.

Status legend: `[ ]` not started, `[~]` in progress, `[x]` done.

---

## [x] A — Project scaffold + base map

### Parent

`docs/prd/forest-situational-awareness.md`

### What to build

Set up the Vite + React + TypeScript project. Render a `react-leaflet` map using OpenStreetMap tiles, centered on Rokua National Park (64.5644°N, 26.4947°E) with a 50×50km default viewport. The map must support pan and zoom. No World/Scenario data yet — just the base map shell.

### Acceptance criteria

- [x] `npm run dev` starts a working app showing a real, tiled map of the Rokua area
- [x] The default viewport covers roughly a 50×50km area around the center coordinates
- [x] The map can be panned and zoomed with the mouse/trackpad
- [x] Project has TypeScript strict mode, a lint config, and a test runner (e.g. Vitest) wired up and passing on an empty/smoke test
- [x] README explains how to install and run the dev server

### Blocked by

None — can start immediately.

---

## [x] B — World data + static asset rendering & click panels

### What to build

Define the `world.json` schema (map bounds, Towers, Base Stations, Drones — see `CONTEXT.md` and ADR-0002) and a loader for it. Render Tower, Base Station, and Drone markers at their fixed `world.json` positions on the map from slice A. Quadrocopter and Fixed-Wing Drone markers must be visually distinguishable from each other and from Towers/Base Stations. Clicking any asset opens a status panel showing its basic identity fields (id, type, position) — no live telemetry yet, since there's no simulation engine running.

### Acceptance criteria

- [x] `world.json` schema documented (types) and validated on load (fails loudly on malformed input)
- [x] Default `world.json` ships with 2 Towers, 2 Base Stations, and 4 Drones (mix of Quadrocopter/Fixed-Wing) per the PRD
- [x] All three asset kinds render as distinct markers at their configured positions
- [x] Quadrocopter vs Fixed-Wing Drone markers are visually distinguishable
- [x] Clicking a marker opens a panel with that asset's id, type, and position
- [x] Unit tests cover `world.json` schema validation (valid + invalid fixtures)

### Blocked by

A

---

## [x] C — Simulation Clock + patrol movement engine

### What to build

Implement the pure simulation engine function described in the PRD: `advanceSimulation(state, elapsedSimSeconds) -> newState`, with no dependency on React/Leaflet/wall-clock time. For this slice it only needs to own Drone patrol movement: Quadrocopters loop tightly near their Base Station, Fixed-Wing Drones loop a long perimeter at higher speed. Build the Simulation Clock UI (play/pause/speed multiplier e.g. 1x/10x/60x/step) and wire it to repeatedly call the engine and re-render Drone positions from slice B's markers.

### Acceptance criteria

- [x] `advanceSimulation` is a pure function (same inputs → same outputs, no side effects), unit-tested in isolation with no rendering/browser dependency
- [x] Quadrocopters visibly patrol a tight loop near their Base Station when the clock is running
- [x] Fixed-Wing Drones visibly patrol a long perimeter loop at a visibly higher speed than Quadrocopters
- [x] Clock UI supports play, pause, at least two speed multipliers, and single-step-while-paused
- [x] Running the same World for the same elapsed simulated time twice produces identical Drone positions (determinism test)

### Blocked by

B

---

## [x] D — Scenario loading, selection UI, and Ground Truth event spawning

### What to build

Define the `scenario-*.json` schema (a list of Events: type, position, `spawnAtSimSeconds`, optional `durationSimSeconds` — see ADR-0002) and a loader. Build a start screen/dropdown listing bundled scenarios (stub content is fine for this slice — full content is slice H) that the operator picks before pressing Play. Spawn Events into the running simulation at their scripted time as `Undetected`. Add a Ground Truth View toggle that reveals Undetected Events (faded/dashed); default view hides them entirely (no Detection logic exists yet, so the default fog-of-war view shows nothing until slice E).

### Acceptance criteria

- [x] `scenario-*.json` schema documented and validated on load
- [x] Start screen lists at least one bundled (placeholder) scenario and a Play button
- [x] Events appear on the map at their scripted `spawnAtSimSeconds`, in the correct position, only when Ground Truth View is enabled
- [x] Default view (Ground Truth off) shows no Events, regardless of scenario progress
- [x] Unit tests cover: an Event does not appear before its spawn time, and does appear at/after it

### Blocked by

C

---

## [x] E — Detection logic + fog-of-war default view

### What to build

Add deterministic, distance-based Detection to `advanceSimulation` (ADR-0003): a Tower detects a Fire Event the instant the Event's position is within the Tower's fixed detection radius; a Drone (either type) detects any Event type within its detection radius. Events flip `Undetected` → `Detected`. The default (non-Ground-Truth) view now shows Detected Events. Clicking a Tower shows which Fire Event (if any) it's currently tracking.

### Acceptance criteria

- [x] Unit tests: a Fire Event inside/outside a Tower's radius is/isn't detected; a Person Sighting/Fallen Tree is never detected by a Tower regardless of distance
- [x] Unit tests: a Drone detects any Event type once within its radius
- [x] Default view shows Detected Events and hides Undetected ones; Ground Truth toggle still shows both (Undetected faded/dashed)
- [x] Reproducibility test: identical World + Scenario, run twice, produces an identical Detection timeline (same events, same detecting asset, same simulated timestamp)
- [x] Tower status panel shows its currently-tracked Fire Event, if any

### Blocked by

D

---

## [x] F — Drone dispatch/investigate behavior

### What to build

On a new Detection, the nearest available (not already investigating, sufficient battery/endurance) Drone breaks off its patrol loop and flies to the Event to investigate: Quadrocopters hover directly over it, Fixed-Wing Drones circle it (they cannot hover). After investigating for a scenario/engine-defined interval, the Drone resumes its normal patrol loop.

### Acceptance criteria

- [x] On a new Detection, exactly one eligible Drone (the nearest available one) transitions to "investigating" and moves toward the Event
- [x] A Quadrocopter investigating an Event holds position directly over it; a Fixed-Wing Drone circles around it
- [x] After the investigation interval elapses, the Drone returns to its normal patrol behavior from slice C
- [x] If no Drone is available (all investigating/insufficient battery), the Detection still stands but no dispatch occurs — no crash/undefined state
- [x] Unit tests cover dispatch selection (nearest eligible Drone), hover vs. circle behavior, and return-to-patrol

### Blocked by

E

---

## [x] G — Event resolution + rich status telemetry

### What to build

Add automatic Event resolution: a Detected Event flips to `Resolved` after its scenario-defined `durationSimSeconds` elapses (if present), rendered visually distinct (e.g. greyed out) rather than removed. Enrich the Drone status panel with full telemetry: state (idle/patrolling/investigating/returning/charging/fault), battery %, position, speed, heading, assigned Event (if investigating), and remaining flight endurance. Enrich Base Station status panel with docked vs. deployed Drone counts and operational status.

### Acceptance criteria

- [x] An Event with a `durationSimSeconds` flips to `Resolved` at the correct simulated time and renders distinctly from `Detected`
- [x] An Event with no `durationSimSeconds` never auto-resolves
- [x] Drone status panel shows all telemetry fields listed above, live-updating while the clock runs
- [x] Base Station status panel shows docked vs. deployed Drone counts, live-updating
- [x] Unit tests cover the resolution timing logic

### Blocked by

F

---

## [x] H — Author the three bundled example scenarios

### What to build

Replace the placeholder scenario from slice D with three fully authored, tuned scenarios per the PRD's Further Notes: "Quiet Day" (harmless Fallen Tree events only, no Fire), "Wildfire Outbreak" (a Fire Event detected by a Tower, triggering Drone dispatch), and "Hiker Intrusion" (a Person Sighting only detectable once a patrolling Drone happens to pass nearby — demonstrates the fog-of-war/Ground Truth distinction well). Positions/timings must be tuned against the actual default `world.json` roster so each scenario reliably demonstrates its intended behavior.

### Acceptance criteria

- [x] All three scenarios load and run without errors against the default `world.json`
- [x] "Quiet Day" produces only Fallen Tree Detections, no Fire Detections
- [x] "Wildfire Outbreak" produces a Tower Detection of its Fire Event, followed by a Drone dispatch/investigate cycle
- [x] "Hiker Intrusion" Person Sighting is invisible in default (fog-of-war) view for a noticeable stretch, then gets Detected once a patrolling Drone comes into range — visually demonstrable by toggling Ground Truth View before/after
- [x] Scenario dropdown lists all three with descriptive names/labels

### Blocked by

G
