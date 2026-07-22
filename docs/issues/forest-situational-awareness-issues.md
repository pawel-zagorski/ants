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

## [ ] M — Datalink out-of-range visual state

### Parent

L

### What to build

Using issue I's `datalinkRangeMeters` and issue L's nearest-Relay Datalink line: if a Drone's distance to its nearest Relay exceeds its own `datalinkRangeMeters`, render that Drone's Datalink line in a visually distinct "out of range" state — solid (not dashed) red, animation stopped — instead of the normal marching-ants state. Given Rokua's actual Tower/Base Station spacing, this should rarely or never trigger for the bundled scenarios' default patrol loops; that's expected (a rare/edge-case visual, not a normal-path one) and doesn't need a dedicated scenario to force it.

### Acceptance criteria

- [ ] A Drone whose nearest-Relay distance is within its `datalinkRangeMeters` shows the normal animated dashed line (issue L, unchanged)
- [ ] A Drone whose nearest-Relay distance exceeds its `datalinkRangeMeters` shows a solid red, non-animated line instead
- [ ] Unit/component test forces both cases via a synthetic Drone position/`datalinkRangeMeters` fixture (doesn't rely on any bundled scenario actually triggering out-of-range)

### Blocked by

L
