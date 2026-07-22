# Forest Situational Awareness Simulation

## Problem Statement

An operator wants to understand what it would feel like to monitor a forest for fires, intruders, and hazards using a network of fixed towers and patrolling drones — without needing real hardware, a real incident, or a real backend deployment to see it in action. Today there's no way to visualize how such a sensor network would actually notice things happening in a forest, how quickly, and from which asset, or to compare different event sequences (a quiet day vs. a wildfire outbreak) against the same fixed sensor layout in a repeatable way.

## Solution

A web-based, frontend-only dashboard that renders a real 50×50km area of Rokua National Park, Finland on a real map, shows the fixed sensor network (Towers, Base Stations, Drones) as clickable assets with live status, and plays back a chosen, reproducible Scenario of spawned Events (fires, person sightings, fallen trees). The operator watches Drones patrol and Towers stand watch, sees Events appear on a "ground truth" layer only if they opt in, and otherwise only sees what the network has actually Detected — with play/pause/speed controls over the Simulation Clock. Because a Scenario is just a static, timed event script replayed deterministically against a static World, the exact same run can be reproduced or shared as a JSON file.

## User Stories

1. As an operator, I want to see a real map of a 50×50km area of Rokua National Park so that the simulation feels grounded in a real place, not an abstract grid.
2. As an operator, I want to pan and zoom the map so that I can inspect specific areas closely or see the whole monitored region at once.
3. As an operator, I want to see Tower icons at their real/plausible positions on the map so that I understand the fixed long-range fire-watch coverage.
4. As an operator, I want to click a Tower to see its status (operational state, detection radius, and any Fire Event it's currently tracking) so that I can assess its current relevance.
5. As an operator, I want to see Base Station icons on the map so that I know where Drones live and return to recharge.
6. As an operator, I want to click a Base Station to see which Drones are docked there, which are out on patrol/investigation, and its operational status, so that I understand its current load.
7. As an operator, I want to see Drone icons on the map that move in real time (at the current Simulation Clock speed) so that the patrol behavior feels alive rather than static.
8. As an operator, I want Quadrocopters and Fixed-Wing Drones to be visually distinguishable so that I can tell at a glance which kind of asset I'm looking at.
9. As an operator, I want Quadrocopters to patrol a tight loop near their Base Station so that their short-range role is visually obvious.
10. As an operator, I want Fixed-Wing Drones to patrol a long perimeter loop at higher speed so that their long-range role is visually obvious.
11. As an operator, I want to click a Drone to see rich telemetry (state, battery %, position, speed, heading, assigned Event if any, remaining flight endurance) so that I can assess its condition and current task the way a real operator would.
12. As an operator, I want a dropdown/start screen listing bundled Scenarios (e.g. "Quiet Day", "Wildfire Outbreak", "Hiker Intrusion") so that I can pick a specific story to watch without editing files.
13. As an operator, I want to press Play to start the chosen Scenario so that events begin spawning and the sensor network begins reacting.
14. As an operator, I want to pause the Simulation Clock at any point so that I can inspect the current state without it changing.
15. As an operator, I want to change the Simulation Clock's speed multiplier (e.g. 1x/10x/60x) so that I can watch slow stretches quickly and interesting moments more closely.
16. As an operator, I want to step the Simulation Clock forward by a fixed increment while paused so that I can advance frame-by-frame through an interesting moment.
17. As an operator, by default I want to see only Events the sensor network has actually Detected (fog of war) so that the dashboard reflects genuine situational awareness, not omniscience.
18. As an operator, I want a toggle to reveal Ground Truth (all Events, including undetected ones shown faded/dashed) so that I can see how much the network is missing or how long Detection took.
19. As an operator, I want a Fire Event to only be detectable by a Tower (not a Drone that hasn't happened to fly over it) unless a Drone is also within range, so that the different sensor roles feel meaningfully different.
20. As an operator, I want Person Sighting and Fallen Tree Events to only be detectable by Drones (never by Towers) so that Tower and Drone roles remain distinct.
21. As an operator, when a Tower or Drone Detects a new Event, I want the nearest available Drone to break off its patrol and fly to investigate, so that I can watch the network actively respond rather than just passively notice.
22. As an operator, I want an investigating Quadrocopter to hover directly over the Event it's investigating, and an investigating Fixed-Wing Drone to circle it instead, so that the physical constraints of each Drone type are respected.
23. As an operator, once a Drone finishes investigating, I want it to resume its normal patrol loop so that the simulation doesn't get stuck in a permanent "investigating" state.
24. As an operator, I want a Detected Event to visually change (e.g. to "resolved"/greyed-out) after the Scenario's configured duration for it elapses, so that old events don't clutter the map indefinitely while still leaving a visible history.
25. As an operator, I want loading the same Scenario file twice to produce the exact same sequence of Detections and Drone movements, so that I can trust the simulation for demoing or debugging.
26. As an operator, I want the World (map bounds, Towers, Base Stations, Drones) to be defined once in `world.json` and referenced by every Scenario, so that switching Scenarios never silently changes the sensor network layout.
27. As a scenario author, I want to write a new `scenario-*.json` file containing only a list of timed Events (type, position, spawn time, optional duration) so that I can create new test scenarios without touching the World or engine code.
28. As an operator, I want the default World to include 2 Towers, 2 Base Stations, and 4 Drones (a mix of Quadrocopters and Fixed-Wing Drones) so that there's enough going on to observe interesting handoffs without being overwhelming.

## Implementation Decisions

- **Stack**: React + TypeScript + Vite. Map rendered via `react-leaflet` with OpenStreetMap raster tiles (real geography, real zoom/pan), per ADR-0001 (frontend-only architecture — no backend, no server-pushed state; the whole Simulation Clock and engine run in-browser).
- **Geography**: Map centered on Rokua National Park, Finland (64.5644°N, 26.4947°E), a real former fire-lookout-tower site, with a 50×50km default viewport.
- **World / Scenario file split** (ADR-0002): `world.json` holds the fixed roster — map bounds, Towers (position, detection radius), Base Stations (position, docked Drones), Drones (id, type: Quadrocopter | FixedWingDrone, home Base Station, patrol parameters). `scenario-*.json` files hold only a list of Events: `{ type: Fire | PersonSighting | FallenTree, position, spawnAtSimSeconds, durationSimSeconds? }`. Scenarios reference/assume a World; they never redefine the roster.
- **Simulation engine**: A single pure function, `advanceSimulation(state, elapsedSimSeconds) -> newState`, owns all business logic: Drone movement along patrol loops, Drone dispatch/investigate/return transitions, Event spawning from the loaded Scenario, Detection checks, and Event lifecycle transitions (Undetected → Detected → Resolved). This function has no dependency on React, Leaflet, or wall-clock time — it is driven purely by `elapsedSimSeconds`, which the UI layer derives from the Simulation Clock's play/pause/speed/step state.
- **Detection model** (ADR-0003): Deterministic and distance-based only. An Event is Detected the instant an eligible, active asset's position is within that asset's fixed detection radius of the Event — no probability, no seeded RNG. Towers detect Fire Events only. Drones (either type) detect any Event type.
- **Drone behavior**: Hybrid patrol/dispatch model. Quadrocopters patrol a tight loop near their Base Station and can hover directly over an Event when investigating. Fixed-Wing Drones patrol a long perimeter loop at higher speed and circle (rather than hover over) an Event when investigating. On a new Detection, the nearest available (non-investigating, sufficient battery) Drone is dispatched to investigate, then returns to its patrol loop.
- **Event model**: Events are static points (no movement/growth simulation) spawned at a scenario-defined simulated timestamp, with state `Undetected → Detected → Resolved`. Resolution happens automatically after an optional scenario-defined `durationSimSeconds` elapses post-Detection; Resolved Events remain visible but visually distinct (e.g. greyed out), not removed.
- **Visibility modes**: Default view shows Detected Events only ("fog of war"). A UI toggle switches to Ground Truth View, additionally rendering Undetected Events in a faded/dashed style.
- **Asset status panels**: Clicking a Tower/Base Station/Drone opens a status panel. Drones show rich telemetry: state (idle/patrolling/investigating/returning/charging/fault), battery %, position, speed, heading, assigned Event (if investigating), and remaining flight endurance. Towers and Base Stations show simpler derived operational status (e.g. a Tower's currently-tracked Fire Event, if any; a Base Station's docked vs. deployed Drone counts).
- **Scenario selection**: A start screen/dropdown lists bundled example Scenarios ("Quiet Day", "Wildfire Outbreak", "Hiker Intrusion"); the operator selects one, then presses Play to begin.
- **Simulation Clock**: Adjustable speed multiplier (e.g. 1x/10x/60x) with play/pause/step controls, decoupled from wall-clock time.
- **Domain vocabulary**: Follows `CONTEXT.md` exactly — World, Scenario, Simulation Clock, Tower, Base Station, Drone/Quadrocopter/Fixed-Wing Drone, Event, Detection, Ground Truth View. Avoid the synonyms listed under `_Avoid_` in that file (e.g. never "alert" for an Event itself, never "god mode" for Ground Truth View).

## Testing Decisions

- Concentrate tests on the pure `advanceSimulation(state, elapsedSimSeconds)` engine function — this is the seam that carries all business logic (movement, dispatch, Detection, Event lifecycle) and is fully decoupled from React/Leaflet, so it can be tested with plain unit tests and fixed `world.json` + `scenario-*.json` fixtures, no browser/DOM needed.
- Test only externally observable behavior of the engine: given a World + Scenario + elapsed simulated time, assert on the resulting Event states (Undetected/Detected/Resolved), which asset performed each Detection, and Drone states/positions — not internal implementation details of how the loop math is structured.
- Cover at minimum: a Tower detecting a Fire Event at the edge and outside of its radius; a Drone detecting a Person Sighting/Fallen Tree Event while patrolling; correct dispatch of the nearest available Drone on a new Detection; a Quadrocopter hovering vs. a Fixed-Wing Drone circling while investigating; an Event auto-resolving after its configured duration; and running the same World+Scenario twice producing byte-identical resulting state (reproducibility).
- No prior art for tests exists yet in this repo (greenfield project) — this test suite will be the first, and should establish the pattern of "engine tests are plain unit tests against pure functions; UI is not unit-tested for this prototype" for future scenario/engine work to follow.

## Out of Scope

- No backend service, database, or multi-user/real-time-sync support (see ADR-0001). Revisit only if this moves beyond a prototype.
- No probabilistic/missed detection, weather effects, or sensor unreliability (see ADR-0003).
- No Event growth/spread simulation (e.g. fire spreading, a person's walked path) — Events are static points for this version.
- No manual operator control of Drones (no manually redirecting, launching, or grounding a Drone) — Drone behavior is fully autonomous per the hybrid patrol/dispatch model.
- No scenario editor UI — new Scenarios are authored by hand-writing `scenario-*.json` files.
- No authentication, persistence of past runs, or analytics/reporting on simulation history.
- No support for changing the World roster (adding/removing Towers, Base Stations, or Drones) at runtime through the UI.

## Further Notes

- Real-world caveat: Finland decommissioned its dedicated fire-lookout tower network in the 1980s in favor of aerial patrol. The Tower positions here are anchored to a real, fire-historically-significant site (Rokua National Park's former Pookivaara fire tower) but represent a fictional modernized sensor network, not an active real-world system.
- `CONTEXT.md` and `docs/adr/0001`–`0003` were produced in the design session preceding this PRD and should be treated as authoritative for terminology and the three architectural decisions referenced above.
- Suggested three bundled example Scenarios to build first: "Quiet Day" (a couple of harmless Fallen Tree events, no Fire), "Wildfire Outbreak" (a Fire Event detected by a Tower, triggering Drone dispatch), and "Hiker Intrusion" (a Person Sighting only detectable once a patrolling Drone happens to pass nearby, demonstrating the fog-of-war/Ground Truth distinction well).
