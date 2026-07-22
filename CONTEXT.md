# Forest Situational Awareness Simulation

A prototype web app that visualizes a forest sensor network (fire towers + patrolling drones) detecting simulated events (fires, people, fallen trees) in real time on a map of Finland's Rokua National Park.

## Language

### World & Scenario

**World**:
The fixed sensor network for a simulation run: the map area, its Towers, Base Stations, and Drones. Defined in `world.json` and does not change once a Scenario starts.
_Avoid_: Infrastructure, setup

**Scenario**:
A reproducible, timed script of Events to spawn against a World. Defined in a `scenario-*.json` file so the same sequence can be replayed deterministically.
_Avoid_: Simulation (that's the running process, not the file), run, session

**Simulation Clock**:
The engine's internal notion of elapsed time within a Scenario, advanced at an adjustable speed multiplier and controllable via play/pause/step. Distinct from wall-clock time.
_Avoid_: Game time, sim time (use "Simulation Clock" or "simulated time")

### Sensor Network

**Tower**:
A fixed, elevated asset with a long detection radius that can only detect Fire Events. Modeled on Finland's real (historical) fire lookout tower network.
_Avoid_: Watchtower, lookout (use "Tower")

**Base Station**:
A fixed ground location that houses one or more Drones, where they return to recharge and from which they launch to patrol.
_Avoid_: Depot, hangar

**Drone**:
A mobile sensor asset that patrols near its Base Station and can detect any Event type within its detection radius. Comes in two kinds: Quadrocopter and Fixed-Wing Drone.
_Avoid_: UAV, quad (alone — use "Quadrocopter")

**Quadrocopter**:
A Drone that patrols a tight loop close to its Base Station and can hover directly over an Event to investigate it.
_Avoid_: Quad, multirotor

**Fixed-Wing Drone**:
A Drone that patrols a long perimeter loop at higher speed/range than a Quadrocopter, and circles (rather than hovers over) an Event when investigating, since it cannot stop mid-air.
_Avoid_: Winged drone, plane drone

**Drone Model**:
A Drone's real-world product identity (e.g. "DJI Mavic 4 Pro", "FlyEye") — distinct from `DroneType` (Quadrocopter vs. Fixed-Wing Drone, which governs simulated behavior) and from **Payload**. Two Drones can share a Drone Model (e.g. both Fixed-Wing Drones fly as a FlyEye) while differing in behavior overrides, or share a `DroneType` while being different Drone Models with different specs.
_Avoid_: Drone type (ambiguous with `DroneType`), make/manufacturer

**Payload**:
A Drone's sensor payload: `'Optical'` or `'Thermal'`. A third independent axis alongside `DroneType` (behavior) and Drone Model (real-world identity) — any combination of the three can occur.
_Avoid_: Sensor type, camera

**Return Envelope**:
The map overlay shown only while a Drone's status panel is open: the union of two ellipses, one per Base Station, each with foci at the Drone's current live position and that Base Station, sized so the sum of the two focal distances equals the Drone's live `remainingEnduranceSimSeconds × cruiseSpeedMetersPerSecond` (the dynamic, shrinking-over-time flight budget) for that ellipse's Base Station. Answers "everywhere this Drone could still go and still make it back to *some* Base Station" — a Drone nearer Base A gets a fatter ellipse toward A, nearer Base B a fatter one toward B, and the two overlap/union in between. A Base Station outside the current budget simply drops its ellipse from the union rather than rendering a degenerate shape.
_Avoid_: Range ring, fuel ring (this is a two-focus ellipse, not a simple radius)

**Relay**:
The generic role either a Tower or a Base Station plays as a Datalink endpoint — the union of `World.towers` and `World.baseStations` (4 fixed assets in the default `world.json`). A Tower/Base Station is still identified and rendered as itself everywhere else; "Relay" only names this cross-cutting role when talking about which fixed asset a Drone's Datalink line points to.
_Avoid_: Node, ground station (use "Relay" to keep it distinct from "Base Station")

**Bingo Range**:
The set of Drones whose current `remainingEnduranceSimSeconds` is enough to fly out to a given Fire, conduct the perimeter-mapping flight, and still reach a Base Station afterward — computed from the same distance/speed math as the Return Envelope, but used as a real dispatch-eligibility gate rather than a display-only overlay. Scoped narrowly to the Fire-dispatch decision; ordinary patrol and Person Sighting/Fallen Tree dispatch remain unaffected by endurance (see ADR on endurance gating).
_Avoid_: Bingo fuel, fuel range (Drones use energy/battery, not fuel, but "bingo" is kept as the borrowed aviation term for "just enough to still make it back")

**One-Way Mission**:
A Fire-investigation dispatch to a Drone that is outside Bingo Range but can still physically reach the Fire on its remaining endurance. The operator knowingly accepts the Drone will be lost — it is not expected to return to any Base Station.
_Avoid_: Suicide mission, kamikaze (use "One-Way Mission")

**Datalink**:
The always-visible, animated (marching-ants) line from a Drone to its nearest Relay, by straight-line distance, recomputed continuously as the Drone patrols. Distinct from a Base Station's docking/recharge role — a Datalink line can point to either a Tower or a Base Station, whichever is closer. If the nearest Relay's distance exceeds the Drone's own `datalinkRangeMeters` (issue I), the line instead renders as a solid, non-animated red "out of range" state — the marching-ants animation stops rather than just being overlaid — signaling the Drone has patrolled beyond its own comms reach. Given Rokua's actual Tower/Base Station spacing this rarely or never triggers in the bundled scenarios' default patrol loops; it exists as an edge-case visual, not a normal-path one.
_Avoid_: Link, connection line (use "Datalink" for this specific always-on nearest-Relay line)

### Events & Detection

**Event**:
A ground-truth occurrence spawned by a Scenario at a fixed point and time: a Person Sighting or a Fallen Tree. Static in position; its only state changes are Undetected → Detected → Resolved. A Fire is spawned the same way (scheduled in the same timed Scenario list) but is its own concept, not an Event — see **Fire**.
_Avoid_: Incident, alert (an Event is the thing itself; an "alert" would be a UI notification of a Detection)

**Fire**:
A ground-truth wildfire ignition spawned by a Scenario at a fixed point and time, sharing the Scenario's timed-list authoring with Events but modeled separately: once ignited it grows continuously across a Fire Footprint biased downwind by the Scenario's Wind, rather than sitting static like an Event. Progresses through its own tiers (Undetected → Tower-Detected → Investigated) instead of the Event's Undetected → Detected → Resolved, and never auto-resolves.
_Avoid_: Fire Event, wildfire event (use "Fire" alone; it is not a kind of Event)

**Wind**:
A fixed direction and speed authored once per Scenario (not on World), constant for the whole run, that biases Fire spread downwind. Kept scenario-fixed and hand-authored rather than randomized or time-varying, to preserve ADR-0003's reproducibility guarantee.
_Avoid_: Weather (Wind is the only weather-like factor modeled — no rain/humidity/temperature)

**Fire Footprint**:
The real, ground-truth set of hexagonal cells (50m cells, local axial grid centered on that Fire's ignition point) currently burning for a given Fire, per the Growth Ellipse model. Independent of any other Fire's grid. Contrast with **Uncertainty Ellipse** and **Confirmed Shape**, which are what the operator has actually learned about it, not the ground truth itself.
_Avoid_: Burn area, affected area, hex grid (alone — "Fire Footprint" names the actual burning cells)

**Growth Ellipse**:
The deterministic model governing a Fire Footprint's shape over time: an ellipse anchored at the ignition point, growing fastest at its downwind head, slowest at its upwind back, and at an intermediate rate on the flanks, with eccentricity set by Wind speed. A hex cell joins the Fire Footprint once the ellipse covers it. Chosen over a cellular-automaton spread model because it's a real wildfire-behavior model and needs no per-tick neighbor bookkeeping to stay deterministic.
_Avoid_: Spread model (too generic — "Growth Ellipse" names the specific mechanism)

**Uncertainty Ellipse**:
The map overlay shown for a Fire that is Tower-Detected but not yet Investigated: an ellipse standing in for the Fire's true position/size, sized by the detecting Tower's distance (further = blurrier) and growing further with elapsed time since Detection, since an uninvestigated Fire may have spread beyond what the Tower last implied. Shown in the default (fog-of-war) view in place of the real Fire Footprint.
_Avoid_: Detection radius, error ellipse

**Confirmed Shape**:
The last-known real Fire Footprint as directly observed by an investigating Drone's orbit: live-updating every tick while a Drone actively orbits, then freezing as a stale snapshot the instant that Drone leaves (investigation complete, back to patrol) or is Lost. Shown in the default view once a Fire has been Investigated at least once, replacing the Uncertainty Ellipse.
_Avoid_: Confirmed footprint (keep distinct from Fire Footprint, which is always the real/live ground truth regardless of what's been confirmed)

**Bingo Range**:
The set of Drones whose current `remainingEnduranceSimSeconds` is enough to fly out to a given Fire, complete one full orbit lap of its Fire Footprint/Uncertainty Ellipse, and still reach a Base Station afterward — computed from the same distance/speed math as the Return Envelope, but used as a real dispatch-eligibility gate rather than a display-only overlay. Scoped narrowly to the Fire-dispatch decision; ordinary patrol and Person Sighting/Fallen Tree dispatch remain unaffected by endurance.
_Avoid_: Bingo fuel, fuel range (Drones use energy/battery, not fuel, but "bingo" is kept as the borrowed aviation term for "just enough to still make it back")

**One-Way Mission**:
A Fire-investigation dispatch to a Drone that is outside Bingo Range but can still physically reach the Fire on its remaining endurance. The operator knowingly accepts the Drone will be Lost — it is not expected to return to any Base Station.
_Avoid_: Suicide mission, kamikaze (use "One-Way Mission")

**Lost** (Drone state):
A terminal Drone state entered the instant a Drone dispatched on a One-Way Mission exhausts its `remainingEnduranceSimSeconds` — frozen in place, greyed out, permanently unavailable for future dispatch. The only place in this prototype where endurance is allowed to gate/end a Drone's behavior; ordinary patrol endurance remains cosmetic display only.
_Avoid_: Crashed, destroyed (Lost is deliberately non-specific about mechanism — this is energy depletion, not a crash simulation)

**Detection**:
The moment an Event's or Fire's position falls within range of an eligible, active asset (a Tower for a Fire, a Drone for any Event type or a Fire). Detection is deterministic based on distance, not probabilistic — this keeps Scenarios fully reproducible.
_Avoid_: Sighting, spotting

**Ground Truth View**:
An optional map mode that reveals Undetected Events (faded/dashed) and every Fire's real Fire Footprint (regardless of its Tower-Detected/Investigated tier) in addition to what's normally shown, for demoing how the sensor network's picture differs from reality. The default view only shows Detected Events and each Fire's Uncertainty Ellipse/Confirmed Shape ("fog of war").
_Avoid_: God mode, debug view

**Scenario Epoch**:
The real-world calendar date/time authored once per Scenario (e.g. a `startDateTimeIso` field) that `elapsedSimSeconds = 0` corresponds to. Every timestamp displayed across the UI is Scenario Epoch + elapsed Simulation Clock time, shown as a calendar date/time rather than raw seconds.
_Avoid_: Start time (ambiguous with the Simulation Clock's own start-at-zero)
