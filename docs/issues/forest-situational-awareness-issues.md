# Forest Situational Awareness — Implementation Issues

Local issue list (no issue tracker configured). Vertical slices ("tracer bullets") derived from [`docs/prd/forest-situational-awareness.md`](../prd/forest-situational-awareness.md), following `CONTEXT.md` vocabulary and the ADRs in `docs/adr/`. Publish/implement in order — each issue is blocked by the one before it.

**Issues A–H complete.** The three bundled example Scenarios ("Quiet Day", "Wildfire Outbreak", "Hiker Intrusion") are fully authored and verified against the default `world.json` — see `src/scenario/bundledScenarios.integration.test.ts`.

**Issues I–M** add a real-world drone fleet refresh (fixed shape/behavior — `DroneType` `'Quadrocopter'`/`'FixedWingDrone'` — stays exactly as-is; only new *identity/spec* fields are layered on top), the Drone status panel's photo/spec card, a "Return Envelope" range overlay, and always-on "Datalink" lines to the nearest Relay. Derived from a design session that resolved these decisions (see updated `CONTEXT.md`):

- **Relay**: the generic role either a Tower or a Base Station plays as a Datalink endpoint.
- **Datalink**: the always-visible, animated (marching-ants) line from a Drone to its nearest Relay (by straight-line distance, any of the 4 fixed assets).
- **Return Envelope**: the map overlay shown only while a Drone's status panel is open — the union of two ellipses (one per Base Station), each with foci at the Drone's current position and that Base Station, sized so the sum of the two focal distances equals `remainingEnduranceSimSeconds × cruiseSpeedMetersPerSecond` (the *dynamic*, shrinking-over-time budget) for that ellipse's Base Station. This is "everywhere the Drone could still go and still make it back to *some* Base Station" — a Drone nearer Base A gets a fatter ellipse toward A, nearer Base B a fatter one toward B, and the two overlap/union in between.
- **Payload**: a Drone's sensor payload, `'Optical'` or `'Thermal'` — distinct from `DroneType` (behavior) and the new **Drone Model** (real-world identity, e.g. `'DJI Mavic 4 Pro'`).

Fleet mapping (kept on the *existing* `drone-1..4` ids/positions/`DroneType`s/patrol-radius-and-speed overrides — only new identity/spec fields are added, so slices C–H's tuned scenario timings and the `bundledScenarios.integration.test.ts` detecting-asset assertions are undisturbed):

| id | `DroneType` (unchanged) | Home Base | Drone Model | Payload | Max Endurance | Cruise Speed | Datalink Range | Image |
|---|---|---|---|---|---|---|---|---|
| `drone-1` | Quadrocopter | base-1 | DJI Mavic 4 Pro | Optical | 51 min (3060s) | 10 m/s | 30 km | `img/dji_mavic_4_pro.jpeg` |
| `drone-2` | FixedWingDrone | base-1 | FlyEye | Thermal | 2h45m (9900s) | 27 m/s | 50 km | `img/flyeye.jpg` |
| `drone-3` | Quadrocopter | base-2 | DJI Matrice 4T | Thermal | 49 min (2940s) | 9 m/s | 25 km | `img/dji_matrice_4t.webp` |
| `drone-4` | FixedWingDrone | base-2 | FlyEye | Thermal | 2h45m (9900s) | 27 m/s | 50 km | `img/flyeye.jpg` |

Values are rough, middle-of-range estimates from the reference table (real product specs/marketing), per design guidance — precision isn't required, only plausibility.

**Issues N–W** add Fire growth/spread and an operator-driven manual dispatch model (replacing automatic dispatch for every Event/Fire type), derived from a design session that deliberately reversed two lines of the original PRD's Out of Scope section (see `docs/adr/0004`–`0006` and the updated `CONTEXT.md`):

- **Fire**: now its own domain concept, not an `EventType` — grows continuously across a **Fire Footprint** (50m hex cells, a local grid per Fire) via the deterministic **Growth Ellipse** model, biased downwind by a new per-Scenario **Wind**.
- **Fire fog-of-war tiers**: Undetected → Tower-Detected (shows an **Uncertainty Ellipse** standing in for the real shape) → Investigated (shows a **Confirmed Shape**, live-updating while a Drone orbits, frozen once that Drone leaves).
- **Manual dispatch**: `dispatch.ts`'s nearest-drone auto-selection is retired for every Event/Fire type (ADR-0005). Person Sighting/Fallen Tree get a simple available-Drones list; Fire gets a **Bingo Range** (safe round-trip) vs. **One-Way Mission** (Drone will be **Lost**) split, reusing the Return Envelope's distance/speed math as a real dispatch-eligibility gate for the first time (ADR-0006).
- **Scenario Epoch**: a new `startDateTimeIso` field on Scenario; every timestamp shown in the UI becomes a calendar date/time instead of raw `elapsedSimSeconds`.

Issues N, O, P, and Q have no blockers and are independent of each other — developed in parallel, each in its own `.worktrees/` checkout per issue, on its own branch, merged back individually. R onward form a stricter chain (R needs P+Q; S needs Q+R; T needs Q+N; U needs T; V needs U+R; W needs U+V).

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

---

## [x] I — Drone spec data model + real-world fleet identity

### Parent

Design session on the drone fleet refresh (see the note above the status legend and updated `CONTEXT.md`).

### What to build

Extend `Drone` (`src/world/types.ts`) with new identity/spec fields, purely additive on top of the existing `id`/`type`/`position`/`homeBaseStationId`/`patrolRadiusMeters`/`patrolSpeedMetersPerSecond`/`detectionRadiusMeters` (none of those change):

```ts
model: string // real-world model name, e.g. "DJI Mavic 4 Pro"
payload: 'Optical' | 'Thermal'
maxEnduranceSimSeconds: number // this Drone's own max endurance, replacing the shared DRONE_MAX_ENDURANCE_SIM_SECONDS constant
cruiseSpeedMetersPerSecond: number // representative flight speed, used later by issue K's Return Envelope — distinct from patrolSpeedMetersPerSecond, which only drives the visible patrol-loop animation speed
datalinkRangeMeters: number // used later by issue M
imageUrl: string // e.g. "/img/dji_mavic_4_pro.jpeg"
```

Update `public/world.json`'s 4 drones with these new fields per the fleet mapping table above — keep every existing field (`id`, `type`, `position`, `homeBaseStationId`, `patrolRadiusMeters`, `patrolSpeedMetersPerSecond`, `detectionRadiusMeters`) byte-for-byte unchanged. Update `src/world/schema.ts` to validate the new fields. Move the drone images into `public/img/` (Vite only serves static assets from `public/`) and reference them via `imageUrl`.

Change `src/engine/telemetry.ts`'s endurance model from the single shared `DRONE_MAX_ENDURANCE_SIM_SECONDS` constant to a per-Drone `maxEnduranceSimSeconds` (still a closed-form function of `elapsedSimSeconds` alone — still cosmetic/display-only, still must never be read by `advanceSimulation.ts`/`dispatch.ts` for gating, per the existing doc comment's invariant). `remainingEnduranceSimSecondsAt`/`batteryPercentAt`/`droneTelemetryFor` need a `maxEnduranceSimSeconds` parameter now instead of the module constant.

Add `CONTEXT.md` glossary entries for **Payload** and **Drone Model** (see wording drafted above the status legend), cross-referencing the existing **Drone**/**Quadrocopter**/**Fixed-Wing Drone** entries to clarify `DroneType` (behavior) vs. Drone Model (real-world identity) are different axes.

### Acceptance criteria

- [x] `Drone` type carries `model`, `payload`, `maxEnduranceSimSeconds`, `cruiseSpeedMetersPerSecond`, `datalinkRangeMeters`, `imageUrl`; schema validation rejects a `world.json` missing any of them or with an invalid `payload` value
- [x] Default `world.json`'s 4 drones match the fleet mapping table exactly (2× FlyEye/Thermal, 1× DJI Mavic 4 Pro/Optical, 1× DJI Matrice 4T/Thermal), with every pre-existing field unchanged
- [x] `bundledScenarios.integration.test.ts` and all other existing tests still pass unmodified (proves the fleet identity refresh didn't disturb tuned scenario behavior)
- [x] A Drone's `remainingEnduranceSimSeconds`/`batteryPercent` telemetry now drains at a rate derived from its own `maxEnduranceSimSeconds` (unit test: two Drones with different `maxEnduranceSimSeconds` values have different `batteryPercentAt` results at the same `elapsedSimSeconds`)
- [x] `CONTEXT.md` has new **Payload** and **Drone Model** entries

### Blocked by

None — can start immediately.

---

## [ ] J — Drone card: photo + Model/Payload identity fields

### Parent

I

### What to build

In `AssetPanel.tsx`'s Drone section, render the Drone's `imageUrl` as a photo across the top of the card (above the title/close button is fine, or immediately below — pick whichever reads best; `object-fit: cover` a fixed-height banner so the 3 differently-shaped source photos crop consistently), and add "Model" and "Payload" rows to the telemetry `<dl>`, sourced from the new `Drone.model`/`Drone.payload` fields (issue I). These are static identity fields (not simulation telemetry), so they don't need `droneTelemetryFor` — read them straight off the `Drone` object already available as `asset` when `isDrone`.

### Acceptance criteria

- [ ] Clicking any of the 4 drones shows that Drone's own photo at the top of its status panel (Mavic/Matrice/FlyEye photos are visually distinct; both FlyEye drones show the same photo)
- [ ] Panel shows "Model" (e.g. "DJI Mavic 4 Pro") and "Payload" (e.g. "Optical") rows for every Drone
- [ ] Tower/Base Station panels are unaffected (no image, no Model/Payload rows)
- [ ] Component test (`AssetPanel.test.tsx`) covers the image `src`/alt text and the new rows for at least two different Drone Models

### Blocked by

I

---

## [x] K — Return Envelope overlay on Drone selection

### Parent

I

### What to build

A new map overlay, rendered only while a Drone's status panel is open (i.e. `selectedAssetId` in `RokuaMap.tsx` is that Drone's id — mirror how `AssetPanel` itself is conditionally rendered), showing that Drone's **Return Envelope**: the union of two ellipses, one per `world.baseStations` entry, each with foci at the Drone's *current live position* (from `liveWorld`, not its static `world.json` position) and that Base Station's position, and total focal-distance budget `remainingEnduranceSimSeconds × cruiseSpeedMetersPerSecond` (read the Drone's live `droneTelemetryFor(...).remainingEnduranceSimSeconds`, per issue I's per-Drone endurance, times its own `cruiseSpeedMetersPerSecond`).

Add ellipse-sampling geometry to `src/map/geo.ts` (alongside the existing `pointOnCircle`/`offsetLatLng`/`distanceMetersBetween` flat-earth helpers): given two foci and a total focal-distance budget, sample ~60-120 points around the ellipse (standard parametric ellipse: semi-major axis `a = budget / 2`, focal separation `c = distanceMetersBetween(focus1, focus2) / 2`, semi-minor axis `b = sqrt(a^2 - c^2)`, centered at the midpoint, rotated to align with the focus1→focus2 axis) and return them as a closed `LatLng[]` ring suitable for a Leaflet `Polygon`. If `budget < distanceMetersBetween(drone, baseStation)` (the Drone couldn't even make it to that particular Base Station on remaining energy), skip that ellipse entirely rather than producing a degenerate/negative-`b` shape — a Drone whose remaining energy can't reach *either* Base Station renders no envelope at all (rather than crashing), which is an acceptable, low-stakes edge case for this prototype's scenario lengths.

Render both ellipses (whichever are feasible) as semi-transparent Leaflet `Polygon`s in the same fill color — overlapping regions naturally union via alpha compositing, no manual geometric union needed. Pick a color that's visually distinct from the existing `.asset-icon-*`/`.event-icon-*` palette in `index.css` (e.g. a muted amber/gold, dashed outline).

Add a `CONTEXT.md` glossary entry for **Return Envelope** (see wording drafted above the status legend).

### Acceptance criteria

- [x] Selecting a Drone shows its Return Envelope overlay (1 or 2 filled ellipses, per feasibility); deselecting (closing the panel, or clicking another asset) hides it
- [x] Selecting a Tower or Base Station never shows a Return Envelope
- [x] The overlay visibly shrinks over simulated time as the clock runs (dynamic budget) — demoable by comparing the overlay at two different Simulation Clock times for the same selected Drone
- [x] Unit tests for the new `geo.ts` ellipse-sampling function: known focus/budget inputs produce points at the expected semi-major/semi-minor extents; a budget smaller than the focal distance is rejected (returns `undefined`/empty rather than throwing or producing NaNs)
- [x] `CONTEXT.md` has a new **Return Envelope** entry

### Blocked by

I

---

## [x] L — Always-on animated Datalink lines to the nearest Relay

### Parent

I

### What to build

A new always-rendered map layer (not tied to selection, unlike issue K): for every Drone, find the nearest **Relay** — the closest of all Towers *and* Base Stations combined (4 fixed assets total), by `distanceMetersBetween` against the Drone's live position — and draw a dashed line from the Drone to that Relay, animated as "marching ants" (dashes visually travel toward the Relay): a Leaflet `Polyline` with a dash pattern, animated via CSS `stroke-dashoffset` (an SVG renderer path override or a `periodic` `setInterval`/`requestAnimationFrame` nudging the polyline's rendered dash-offset — whichever is simplest to wire up against react-leaflet's default SVG renderer). Direction of travel must read as "toward the Relay" (decreasing dash-offset in the direction from Drone to Relay, not the reverse).

Recompute the nearest Relay every render (as Drone positions change while patrolling) — this is a cheap 4-way distance comparison per Drone per tick, no memoization needed at this prototype's scale.

Add `CONTEXT.md` glossary entries for **Relay** and **Datalink** (see wording drafted above the status legend).

### Acceptance criteria

- [x] All 4 Drones simultaneously show a dashed line to their own nearest Relay (Tower or Base Station) at all times, independent of selection
- [x] The line visibly updates to a different Relay if a Drone patrols closer to a different one than its previous nearest
- [x] The dashes visibly animate in the direction of travel toward the Relay (not static, not reversed)
- [x] `CONTEXT.md` has new **Relay** and **Datalink** entries

### Blocked by

I

---

## [x] M — Datalink out-of-range visual state

### Parent

L

### What to build

Using issue I's `datalinkRangeMeters` and issue L's nearest-Relay Datalink line: if a Drone's distance to its nearest Relay exceeds its own `datalinkRangeMeters`, render that Drone's Datalink line in a visually distinct "out of range" state — solid (not dashed) red, animation stopped — instead of the normal marching-ants state. Given Rokua's actual Tower/Base Station spacing, this should rarely or never trigger for the bundled scenarios' default patrol loops; that's expected (a rare/edge-case visual, not a normal-path one) and doesn't need a dedicated scenario to force it.

### Acceptance criteria

- [x] A Drone whose nearest-Relay distance is within its `datalinkRangeMeters` shows the normal animated dashed line (issue L, unchanged)
- [x] A Drone whose nearest-Relay distance exceeds its `datalinkRangeMeters` shows a solid red, non-animated line instead
- [x] Unit/component test forces both cases via a synthetic Drone position/`datalinkRangeMeters` fixture (doesn't rely on any bundled scenario actually triggering out-of-range)

### Blocked by

L

---

## [x] N — Scenario Epoch: calendar date/time schema + display

### Parent

Design session on Fire spread and manual dispatch (see the note above the status legend and updated `CONTEXT.md`).

### What to build

Add `startDateTimeIso` (an ISO 8601 string) to the scenario schema (`src/scenario/types.ts`, `src/scenario/schema.ts`) — the real calendar date/time that `elapsedSimSeconds = 0` corresponds to for that Scenario. Add a small helper (e.g. `src/engine/scenarioEpoch.ts`) that converts `(startDateTimeIso, elapsedSimSeconds) -> Date` and a display-formatted string. Update the Simulation Clock panel (`SimulationClockPanel.tsx`) to show the current calendar date/time (epoch + elapsed) instead of raw elapsed seconds. Give all three bundled scenarios a plausible `startDateTimeIso`.

### Acceptance criteria

- [x] Scenario schema requires `startDateTimeIso`; validation rejects a scenario missing it or with an unparseable value
- [x] A helper function converts epoch + `elapsedSimSeconds` to a calendar `Date`/formatted string; unit-tested for a few known offsets (0s, and a large offset crossing into the next day)
- [x] Simulation Clock panel shows the current calendar date/time, live-updating as the clock runs
- [x] All three bundled scenarios have a `startDateTimeIso`
- [x] Existing tests (`bundledScenarios.integration.test.ts`, scenario schema tests) updated and passing

### Blocked by

None — can start immediately.

---

## [x] O — Manual dispatch for Person Sighting/Fallen Tree; retire auto-dispatch

### Parent

Design session on Fire spread and manual dispatch.

### What to build

Per ADR-0005, remove `dispatch.ts`'s nearest-available-Drone auto-selection trigger on a new Detection for Person Sighting and Fallen Tree Events — Detection itself is unchanged, only the automatic dispatch side-effect is removed. Add click handling to `EventMarkers.tsx` (currently none) and a new `EventPanel` component (mirroring `AssetPanel`'s open/close pattern) that opens when a Detected Event is clicked, showing basic Detection Status (which asset detected it, when) plus a simple list of currently-available (non-investigating) Drones with a "Send" button per Drone. Sending a Drone applies the same investigate transition `dispatch.ts` already has (Quadrocopter hovers, Fixed-Wing circles, fixed duration, then returns to patrol) — only the trigger changes from automatic to an explicit user action threaded into `advanceSimulation`.

### Acceptance criteria

- [x] A new Detection no longer auto-dispatches any Drone (existing auto-dispatch tests updated to assert no automatic transition)
- [x] Clicking a Detected Person Sighting/Fallen Tree opens a panel showing detection source/time and a list of available Drones
- [x] Clicking "Send" on a listed Drone starts that Drone's existing hover/circle investigate behavior, unchanged from before
- [x] A Drone already investigating/unavailable does not appear in the list
- [x] Unit tests cover: no auto-dispatch on Detection, manual send triggers the correct investigate mode per Drone type, investigate-then-return-to-patrol timing unchanged

### Blocked by

None — can start immediately.

---

## [x] P — Wind: scenario schema field + map compass indicator

### Parent

Design session on Fire spread and manual dispatch.

### What to build

Add a `wind: { directionDegrees: number; speedMetersPerSecond: number }` field to the scenario schema (`src/scenario/types.ts`, `src/scenario/schema.ts`) — fixed for the whole Scenario, hand-authored, never randomized or time-varying (ADR-0003). Render a small compass/arrow indicator on the map (similar UI weight to the Ground Truth toggle) showing the loaded Scenario's wind direction and speed once a Scenario is loaded. Give all three bundled scenarios a plausible `wind` value.

### Acceptance criteria

- [x] Scenario schema requires `wind`; validation rejects a missing/malformed value
- [x] A wind indicator renders on the map once a Scenario is loaded, pointing in the scenario's wind direction with its speed labeled
- [x] All three bundled scenarios have a `wind` value
- [x] Unit tests cover schema validation for `wind`

### Blocked by

None — can start immediately.

---

## [x] Q — Fire becomes its own domain concept

### Parent

Design session on Fire spread and manual dispatch.

### What to build

Per ADR-0004, split Fire out of the `EventType` union. Introduce a distinct `Fire`/`FireRuntimeState` type in `src/engine/types.ts` (separate from `EventRuntimeState`), with its own tier field (`'undetected' | 'towerDetected' | 'investigated'` — no `'resolved'`; Fires never auto-resolve). Update the scenario schema so a Fire ignition entry (`{ type: 'Fire', position, spawnAtSimSeconds }`, no `durationSimSeconds`) is validated/parsed distinctly from a Person Sighting/Fallen Tree `Event` entry, even though both live in the same timed list. Update `advanceSimulation.ts`'s spawn/detect logic to produce `SimulationState.fires` (a new sibling map to `events`) instead of folding Fire into `events`. Tower detection logic for Fire moves onto this new Fire-specific path — behavior unchanged for now (Fire still renders as a single marker at its ignition point; no spread/ellipse yet, that's issue R). Update `EventMarkers`/`eventIcons` so Fire rendering is driven by `SimulationState.fires`. The existing "Wildfire Outbreak" scenario/tests must continue to pass with unchanged behavior.

### Acceptance criteria

- [x] `Fire` is no longer part of the `EventType` union; `SimulationState.fires` is a new, separate map from `SimulationState.events`
- [x] Scenario schema validates a Fire ignition entry distinctly (no `durationSimSeconds` accepted/required) while still living in the same timed list as Events
- [x] Tower detection of a Fire still works exactly as before (existing detection tests pass, adapted to read from `fires` instead of `events`)
- [x] Fire still renders as a marker on the map, in the same visual position/behavior as before this slice (no visible regression)
- [x] `bundledScenarios.integration.test.ts` passes with the "Wildfire Outbreak" scenario producing the same Tower-Detection outcome as before

### Blocked by

None — can start immediately.

---

## [x] R — Fire spreads: Growth Ellipse hex-grid Fire Footprint

### Parent

Design session on Fire spread and manual dispatch.

### What to build

Implement the deterministic Growth Ellipse model: given a Fire's ignition point, elapsed time since ignition, and the Scenario's Wind (issue P), compute the Fire Footprint as a set of 50m hex cells in a local axial coordinate grid centered on the ignition point (issue Q's `Fire` type). Growth is fastest at the downwind head, slowest at the upwind back, intermediate on the flanks; head rate of spread ≈ 0.1× wind speed (m/s); zero-wind Fires grow uniformly at the (slow) back rate. A hex cell joins the footprint once the analytic ellipse covers its centroid. Render the real Fire Footprint as a hex-tile polygon layer in Ground Truth View only — the default view is unaffected by this slice (issue S handles the default view).

### Acceptance criteria

- [x] Pure function computing a Fire's Fire Footprint (set of hex cell coordinates) given ignition point, elapsed time, and wind — unit-tested for: no wind (circular growth), strong wind (elongated downwind), and determinism (same inputs twice → byte-identical cell sets)
- [x] Ground Truth View renders a growing hex-tile shape for each Fire, visibly elongating downwind as wind speed increases
- [x] A Fire ignited early in a ~30–45 simulated-minute scenario grows to a visible multi-hundred-meter footprint by the end (sanity-checked manually or via a test asserting cell count grows over time)
- [x] Default (non-Ground-Truth) view shows no change from before this slice

### Blocked by

P, Q

---

## [x] S — Uncertainty Ellipse in default view for Tower-Detected Fire

### Parent

Design session on Fire spread and manual dispatch.

### What to build

Once a Fire is Tower-Detected (issue Q), compute and render an Uncertainty Ellipse in the default (fog-of-war) view in place of the real Fire Footprint: size driven by (a) the detecting Tower's distance to the Fire (further = larger/blurrier) and (b) elapsed simulated time since Detection (grows further the longer it goes un-Investigated). Reuse the ellipse-sampling geometry already in `src/map/geo.ts` (built for the Return Envelope) rather than writing new ellipse math. The real Fire Footprint (issue R) stays hidden in the default view at this tier; Ground Truth View is unaffected (already shows the real footprint per issue R).

### Acceptance criteria

- [x] A Tower-Detected, not-yet-Investigated Fire shows an ellipse (not the real hex footprint, not a plain marker) in the default view
- [x] Ellipse size increases with detecting-Tower distance, all else equal (unit test with two fixture Towers at different distances)
- [x] Ellipse size increases with elapsed time since Detection, all else equal (unit test at two different elapsed times)
- [x] Ground Truth View continues to show the real Fire Footprint unaffected by this slice

### Blocked by

Q, R

---

## [x] T — Fire clickable: Detection Status panel (read-only)

### Parent

Design session on Fire spread and manual dispatch.

### What to build

Add click handling for Fires (mirroring issue O's Event click pattern) opening a new `FirePanel` component. Shows Detection Status: which Tower detected it and when (using issue N's Scenario Epoch to show a calendar date/time, not raw seconds), and its current tier (Tower-Detected vs. Investigated). No dispatch UI yet (issue U).

### Acceptance criteria

- [x] Clicking a Fire (marker, Uncertainty Ellipse, or Fire Footprint hex shape) opens a panel
- [x] Panel shows the detecting Tower's id and a calendar date/time (via Scenario Epoch), and current tier
- [x] Panel closes the same way other status panels do (close button / selecting something else)
- [x] Component test covers panel content for a Tower-Detected Fire fixture

### Blocked by

Q, N

---

## [x] U — Fire manual dispatch: Bingo Range / One-Way Mission lists + send

### Parent

Design session on Fire spread and manual dispatch.

### What to build

Per ADR-0006, add a Bingo Range calculation reusing the Return Envelope's distance/speed math (`src/map/geo.ts`): for a given Fire and Drone, compute whether the Drone's `remainingEnduranceSimSeconds` covers (distance to Fire + one orbit lap of its current extent + distance from Fire to nearest Base Station), converted via `cruiseSpeedMetersPerSecond`. Classify every non-Lost, non-investigating Drone into: Bingo Range (round-trip safe), One-Way Mission (can reach the Fire but not return), or unreachable (excluded from the list entirely). Extend issue T's `FirePanel` with two labeled lists and a "Send" action per Drone; sending assigns the Drone to the Fire, distinguishing one-way from round-trip so issues V/W know which ending behavior applies.

### Acceptance criteria

- [x] Given a Fire position and a set of fixture Drones with varying `remainingEnduranceSimSeconds`/positions, classification unit tests cover: clearly Bingo-Range-safe, clearly one-way-only, and clearly unreachable
- [x] `FirePanel` shows two separate lists (Bingo Range, One-Way Mission) with a Send button per Drone; unreachable Drones don't appear in either
- [x] Sending a Drone from either list assigns it to the Fire and removes it from patrol availability
- [x] A Drone already Lost, investigating, or en route to another Fire/Event never appears in either list

### Blocked by

T

---

## [x] V — Drone investigates Fire: orbit, live Confirmed Shape, one-lap completion

### Parent

Design session on Fire spread and manual dispatch.

### What to build

A Drone dispatched to a Fire (issue U) flies to it, then both Drone types orbit its current extent (radius scaled to the Fire's Uncertainty Ellipse/Fire Footprint bounding size) instead of hovering/fixed-radius-circling. While a Drone is actively orbiting, compute and render a live Confirmed Shape in the default view, tracking the real Fire Footprint (issue R) every tick. A Bingo-Range Drone completes exactly one full orbit lap (circumference at patrol speed), then the Confirmed Shape freezes as a stale snapshot and the Drone automatically returns to patrol. (One-Way Mission drones' ending behavior is issue W.)

### Acceptance criteria

- [x] An investigating Drone (either type) orbits the Fire's current extent rather than hovering/fixed-150m-circling
- [x] While orbiting, the default view's Confirmed Shape updates every tick to match the live Fire Footprint
- [x] After one full orbit lap, a Bingo-Range Drone's Confirmed Shape freezes (stops updating) and the Drone returns to its normal patrol loop
- [x] Unit tests cover: orbit radius scales with Fire extent, one-lap completion timing (circumference / patrol speed), and the freeze-on-departure behavior

### Blocked by

U, R

---

## [x] W — One-Way Mission execution + terminal Lost drone state

### Parent

Design session on Fire spread and manual dispatch.

### What to build

A Drone dispatched on a One-Way Mission (issue U) orbits and maps (issue V's orbit/Confirmed-Shape behavior) for as long as its `remainingEnduranceSimSeconds` lasts. The instant that hits zero, it transitions to a new terminal `Lost` Drone state: frozen in place, rendered distinctly (e.g. greyed out), and permanently excluded from all future dispatch lists (issue O's simple list and issue U's Bingo Range/One-Way lists) and from the Return Envelope/Datalink overlays.

### Acceptance criteria

- [x] A One-Way Mission Drone continues orbiting/mapping (reusing issue V's behavior) rather than stopping immediately on dispatch
- [x] The instant `remainingEnduranceSimSeconds` reaches zero, the Drone transitions to `Lost` and stops moving, wherever it currently is
- [x] A `Lost` Drone renders visually distinct from all other states and never appears in any dispatch list again
- [x] Unit tests cover the exact transition timing (Lost occurs precisely when endurance hits zero, not before/after) and that a Lost Drone's Confirmed Shape contribution freezes at that same moment

### Blocked by

U, V

---

**Issues X–BB** add **Illegal Deforestation** as a new detectable phenomenon plus a scenario to demo it, derived from a design session (see the updated `CONTEXT.md` and the new ADR-0009). Key decisions:

- **Clearcut**: a new top-level domain concept modeled as a *sibling of `Fire`, not an `Event`* (parallels ADR-0004). It occupies a **static** hex **Clearcut Footprint** that never grows/shrinks, is detectable by **Drones only** (never Towers), and moves Undetected → Detected → Investigated like a Fire. Seen from a distance it is an estimate (a reused **Uncertainty Ellipse** with the time-growth term zeroed, since it never spreads); once investigated its real footprint becomes a **Confirmed Shape** that is exact and permanent (no staleness). Display label: "Illegal Deforestation".
- **Clearcut Footprint** shape is authored as a frozen, *oriented ellipse* (size + orientation + elongation) — an elongated, road-aligned blob — reusing the hex-grid/growth-ellipse math but with no Wind term and no time term.
- **Investigation** is Fire-style (fly out, orbit to reveal the shape) but gated by **Bingo Range only** — no One-Way Mission (a static, non-urgent target never justifies sacrificing a Drone).
- **Discovered-on-site payoff**: when a Clearcut becomes Investigated, any Undetected `PersonSighting`s within a radius of its centroid are revealed, credited to the investigating Drone (reveal-on-investigation, not proximity/patrol).
- **Patrol Route**: a new *optional* per-Drone `world.json` field — an ordered waypoint loop a Drone flies instead of the default base-station loop. Being a World property it applies across every Scenario (ADR-0002 kept intact); Drones without it keep the legacy base loop. Applied to the two Fixed-Wing Drones so one can pass near the Clearcut for a rough estimate-only detection.

Dependency shape: **X and AA have no blockers and run in parallel**; then **Y → Z → BB** is a chain (BB also needs AA). The `CONTEXT.md` glossary terms (Clearcut, Clearcut Footprint, updated Uncertainty Ellipse, Patrol Route) are already committed alongside this issue list; ADR-0009 is authored in slice X.

---

## [x] X — Clearcut concept: static footprint, drone-only detection, estimate view, red-tree marker + panel, Ground Truth

### Parent

Design session on Illegal Deforestation (see the note above and ADR-0009).

### What to build

Introduce **Clearcut** as a new top-level domain concept, a sibling of `Fire` (NOT a new `EventType`) — follow the ADR-0004 pattern that split `Fire` from `Event`. This is the foundational tracer bullet: a Clearcut spawns, gets detected by a Drone from a distance as a fuzzy estimate, renders a red-tree marker, opens a read-only panel with the `logging.jpg` photo, and its real static footprint is visible in Ground Truth View. No investigation/dispatch yet (that's Y).

- **Runtime type**: add a `ClearcutRuntimeState` in `src/engine/types.ts` with its own tier field `'undetected' | 'detected' | 'investigated'` (mirror `FireRuntimeState`; note the middle tier is `detected`, since a Drone — not a Tower — detects it). Add `SimulationState.clearcuts` as a new sibling map alongside `events` and `fires`.
- **Scenario schema**: add a `Clearcut` entry type to the scenario timed list (`src/scenario/types.ts`, `schema.ts`), validated/parsed distinctly (like the Fire ignition entry). Shape authoring fields: `position` (centroid), `spawnAtSimSeconds`, plus footprint size/orientation — e.g. `semiMajorAxisMeters`, `semiMinorAxisMeters` (or a single size + eccentricity), and `orientationDegrees`. No `durationSimSeconds` (never auto-resolves). Update `partitionScenarioEntries` in `advanceSimulation.ts` to route Clearcut entries into `clearcuts`.
- **Static Clearcut Footprint**: add a pure function (e.g. `src/engine/clearcutFootprint.ts`) computing the fixed set of 50m hex cells for a Clearcut from its centroid + size + orientation as an oriented ellipse — reuse the hex-grid math in `growthEllipse.ts`/`hexGrid.ts`, but with **no wind term and no time term** (constant for the whole run). Unit-test determinism and that orientation/elongation actually rotate/stretch the cell set.
- **Detection (drone-only)**: extend detection in `advanceSimulation.ts` so a Clearcut flips `undetected → detected` when any Drone comes within its detection radius of the Clearcut (position = centroid). Towers must NEVER detect a Clearcut. Detection is deterministic/sticky (ADR-0003) and records the detecting Drone id + sim-second. Payload does not gate detection (every Drone qualifies).
- **Estimate (Uncertainty Ellipse, time term zeroed)**: for a `detected`-tier Clearcut, show a reused Uncertainty Ellipse in the default (fog-of-war) view, sized by the detecting Drone's distance only — the time-since-detection growth term is zeroed for Clearcuts (they don't spread). Add a new map layer (mirror `UncertaintyEllipseLayer.tsx`) or parameterize the existing one.
- **Red-tree marker + icon**: add a Clearcut marker layer (mirror `FireMarkers.tsx`) and an icon (new `src/map/clearcutIcons.ts`) rendering a **red tree glyph** (not a two-letter label), with a faded/solid state treatment like `fireIcons.ts` (faded when undetected in Ground Truth View, solid once detected). Add the CSS in `index.css`. Only `detected`/`investigated` Clearcuts are clickable in the default view.
- **Panel**: add a `ClearcutPanel` (mirror `FirePanel.tsx`) with the `public/img/logging.jpg` banner at top and fields Type ("Illegal Deforestation"), Detected By, Detected At (Scenario-Epoch calendar time), Tier. No dispatch UI yet (Y adds it). Wire selection into `RokuaMap.tsx` alongside the existing event/fire/asset selection (mutually exclusive). Move/ensure `public/img/logging.jpg` is committed.
- **Ground Truth View**: render the real static Clearcut Footprint as a hex-tile layer (mirror `FireFootprintLayer.tsx`) when Ground Truth is ON, and show still-undetected Clearcuts faded.
- **Minimal scenario for demoability**: create `public/scenario-illegal-deforestation.json` with a single Clearcut placed so a *default-patrol* Drone detects it (BB later re-tunes position + adds sightings + wind/epoch polish), a plausible `startDateTimeIso`, and a `wind` value (schema requires it; unused by the Clearcut). Register it in `src/scenario/bundledScenarios.ts` (display "Illegal Deforestation").
- **ADR-0009**: write `docs/adr/0009-clearcut-static-fire-sibling.md` recording that Clearcut is modeled as a static Fire-sibling (not an Event), the trade-off considered (Event-type vs Fire-sibling), and the reuse of Fire's hex/estimate/confirmed-shape machinery. `CONTEXT.md` glossary terms already exist — ensure cross-references are consistent.

### Acceptance criteria

- [ ] `Clearcut` is a distinct concept: `ClearcutRuntimeState` with tiers `undetected|detected|investigated`, and `SimulationState.clearcuts` separate from `events`/`fires`; it is NOT in the `EventType` union
- [ ] Scenario schema validates/parses a Clearcut entry distinctly (centroid, size, orientation, `spawnAtSimSeconds`, no `durationSimSeconds`); malformed input is rejected
- [ ] Pure Clearcut Footprint function is deterministic and produces an oriented/elongated hex-cell set that does NOT change with elapsed time (unit-tested: same cells at t=0 and t=late; orientation rotates the set)
- [ ] A Drone detects a Clearcut within range (unit test); a Tower never detects a Clearcut regardless of distance (unit test)
- [ ] Default view shows a distance-sized Uncertainty Ellipse estimate for a `detected` Clearcut that does NOT grow over time (unit test at two elapsed times → same size)
- [ ] Clearcut renders a red-tree marker; clicking a detected Clearcut opens a panel showing `logging.jpg`, Type, Detected By, Detected At (calendar), and Tier
- [ ] Ground Truth View shows the real static Clearcut Footprint hex shape; default view does not
- [ ] `scenario-illegal-deforestation.json` loads and runs against default `world.json`, is listed in the scenario picker, and produces a Drone Detection of its Clearcut
- [ ] ADR-0009 exists; `CONTEXT.md` Clearcut terms are consistent; typecheck passes and the full test suite is green

### Blocked by

None — can start immediately.

---

## [x] Y — Clearcut investigation: Bingo-Range dispatch + orbit → permanent Confirmed Shape

### Parent

Design session on Illegal Deforestation.

### What to build

Add operator-driven investigation of a Clearcut, reusing the Fire investigation machinery (`withManualFireDispatch`, `orbit.ts`, Confirmed Shape) but with two differences: **Bingo Range only** (no One-Way Mission), and the **Confirmed Shape is exact and permanent** (a Clearcut is static, so there is no staleness/refresh once mapped).

- Extend `ClearcutPanel` (issue X) with a **single dispatch list gated by Bingo Range** — reuse `bingoRange.ts` distance/speed math (fly to Clearcut + one orbit lap of its extent + return to nearest Base Station). No One-Way Mission list/section. Unreachable Drones are excluded.
- Add a manual-dispatch path for Clearcuts (mirror `withManualFireDispatch`): the Drone flies to the Clearcut, orbits its extent (radius scaled to the footprint bounding size), and on beginning the orbit the Clearcut flips `detected → investigated`.
- Render a **Confirmed Shape** for an `investigated` Clearcut (mirror `ConfirmedShapeLayer.tsx`) in the default view, replacing the Uncertainty Ellipse. Because the footprint is static, the Confirmed Shape equals the real Clearcut Footprint exactly and stays permanent — it does NOT need per-tick live updates or a freeze-on-departure snapshot (it never goes stale).
- A Bingo-Range Drone completes one orbit lap then returns to patrol (reuse issue V's completion logic).

### Acceptance criteria

- [ ] The Clearcut panel shows a single Bingo-Range dispatch list (no One-Way Mission section); unreachable/investigating/Lost Drones don't appear
- [ ] Sending a Drone flies it to the Clearcut and orbits it; the Clearcut flips to `investigated`
- [ ] An `investigated` Clearcut shows a Confirmed Shape (real footprint) in the default view in place of the Uncertainty Ellipse
- [ ] The Confirmed Shape is exact and does not change/decay over time after investigation (unit test: identical cells long after the Drone leaves)
- [ ] Bingo-Range classification for a Clearcut is unit-tested (clearly safe vs clearly unreachable), reusing the Fire distance/speed math
- [ ] Typecheck passes and the full test suite is green

### Blocked by

X

---

## [x] Z — Reveal nearby Person Sightings when a Clearcut is Investigated

### Parent

Design session on Illegal Deforestation.

### What to build

When a Clearcut transitions to `investigated` (issue Y — the Drone begins orbiting), reveal every still-`undetected` `PersonSighting` Event within a fixed radius of the Clearcut's centroid, as a "discovered-on-site" payoff. This is a reveal-on-investigation mechanism (b1 from the design session): proximity-authored (a radius around the centroid), NOT triggered by the Drone's own detection radius or patrol fly-by.

- In `advanceSimulation.ts`, on the `detected → investigated` transition, flip qualifying `PersonSighting`s from `undetected` to `detected`, crediting the **investigating Drone** as the detecting asset and the current sim-second as the detection time. Size the reveal radius as an engine constant tuned so authored sightings around a Clearcut fall inside (document the constant).
- These revealed sightings then behave exactly like any other detected Person Sighting: they show their normal detected marker, are clickable → existing `EventPanel`, and emit normal `PersonSighting detected` lines in the Event Log (no special panel/log wording; the Clearcut panel itself says nothing about them).
- Sightings outside the radius, or already detected, are unaffected. Determinism preserved (ADR-0003).

### Acceptance criteria

- [ ] Investigating a Clearcut flips undetected `PersonSighting`s within the reveal radius to detected, credited to the investigating Drone, at the investigation sim-second (unit test)
- [ ] `PersonSighting`s outside the radius stay undetected; already-detected ones are unchanged (unit test)
- [ ] Revealed sightings render as normal detected markers, open the existing `EventPanel`, and produce normal Event Log lines
- [ ] The reveal is deterministic (same scenario twice → identical revealed set + timestamps)
- [ ] Typecheck passes and the full test suite is green

### Blocked by

Y

---

## [x] AA — World waypoint Patrol Routes for the two Fixed-Wing Drones

### Parent

Design session on Illegal Deforestation.

### What to build

Add an optional **Patrol Route** to Drones so they can sweep arbitrary map waypoints instead of only looping their home Base Station. This is a World-level property (ADR-0002 kept intact): it applies across every Scenario. Independent of the Clearcut concept — can be built in parallel with issue X.

- **Schema**: add an optional `patrolRoute?: LatLng[]` (ordered waypoints, flown as a closed loop) to `Drone` in `src/world/types.ts` and validate it in `src/world/schema.ts` (reject malformed points; empty/absent = legacy behavior).
- **Engine**: in `advanceSimulation.ts` patrol movement, if a Drone has a `patrolRoute`, move it along the closed polyline of waypoints at its `patrolSpeedMetersPerSecond` (deterministic closed-form position from `elapsedSimSeconds`, like the existing circular loop — same determinism guarantees, phase offset from drone id acceptable). Drones without a `patrolRoute` keep today's base-station loop unchanged.
- **world.json**: give the two Fixed-Wing Drones (`drone-2`, `drone-4`) map-sweeping `patrolRoute`s spanning a wide area (so BB can place a Clearcut ~1000–1400 m off one route). Leave both Quadrocopters on their base loops. Keep all other drone fields unchanged.
- **Rendering**: ensure the drone flight-path overlay (`DroneFlightPaths`) reflects the waypoint route for routed Drones.
- **Existing scenarios/tests**: rerouting the Fixed-Wing Drones may shift detection timings in the quiet-day/wildfire/hiker scenarios — update `bundledScenarios.integration.test.ts` and any other affected tests to match the new, still-deterministic behavior. `CONTEXT.md` already has the **Patrol Route** term.

### Acceptance criteria

- [ ] `Drone.patrolRoute` is an optional, validated `LatLng[]`; a Drone without it patrols exactly as before (regression: Quadrocopters unchanged)
- [ ] A Drone with a `patrolRoute` deterministically flies the closed waypoint loop at its patrol speed (unit test: same `elapsedSimSeconds` → same position twice; position lies on the route polyline)
- [ ] `drone-2` and `drone-4` have wide map-sweeping routes in `world.json`; `drone-1`/`drone-3` keep base loops
- [ ] The flight-path overlay shows the waypoint route for routed Drones
- [ ] All existing scenario/integration tests are updated and green under the new patrol behavior
- [ ] Typecheck passes and the full test suite is green

### Blocked by

None — can start immediately (parallel with X).

---

## [x] BB — Author & register the tuned "Illegal Deforestation" scenario

### Parent

Design session on Illegal Deforestation.

### What to build

Finalize and tune `public/scenario-illegal-deforestation.json` (created minimally in issue X) into the full demo scenario, now that the Clearcut concept (X), investigation (Y), sighting reveal (Z), and Fixed-Wing Patrol Routes (AA) all exist.

- **Clearcut**: spawned at `spawnAtSimSeconds: 0`, positioned ~1000–1400 m off one Fixed-Wing Drone's `patrolRoute` (issue AA) so that Drone passes **close enough for a rough, estimate-only Detection within 5 simulated minutes** but never orbits it (no accidental investigation). Give it an oriented/elongated footprint aligned to look like a road-side logging site.
- **Person Sightings**: author **3** `PersonSighting` Events clustered around the Clearcut, within issue Z's reveal radius, spawned at T+0 but positioned so no patrol fly-by detects them early (they should only appear when the operator investigates the Clearcut).
- **Wind + epoch**: set a plausible `startDateTimeIso` (Scenario Epoch) and a nominal `wind` (unused by the Clearcut, but schema-required).
- **Registration**: ensure it's registered in `bundledScenarios.ts` with the display name "Illegal Deforestation".
- **Integration test**: add coverage in `bundledScenarios.integration.test.ts` asserting: (a) a Fixed-Wing Drone detects the Clearcut at the `detected` tier within 5 simulated minutes; (b) the initial Detection is estimate-only (tier `detected`, not `investigated`); (c) after a manual Bingo-Range dispatch + orbit, the Clearcut becomes `investigated` and the 3 nearby Person Sightings become detected; (d) determinism (same run twice → identical detection timeline).

### Acceptance criteria

- [ ] Scenario loads/runs against default `world.json`, listed as "Illegal Deforestation" in the picker
- [ ] A Fixed-Wing Drone gets a rough, estimate-only Detection of the Clearcut within 5 simulated minutes (integration test), without auto-investigating
- [ ] Manually dispatching a Bingo-Range Drone investigates the Clearcut (Confirmed Shape appears) and reveals the 3 clustered Person Sightings (integration test)
- [ ] The 3 sightings are NOT detected before the investigation (no early patrol fly-by detection)
- [ ] Scenario run is deterministic (same detection timeline twice)
- [ ] Typecheck passes and the full test suite is green

### Blocked by

X, Y, Z, AA
