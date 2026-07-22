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

**Relay**:
The generic role either a Tower or a Base Station plays as a Datalink endpoint — the union of `World.towers` and `World.baseStations` (4 fixed assets in the default `world.json`). A Tower/Base Station is still identified and rendered as itself everywhere else; "Relay" only names this cross-cutting role when talking about which fixed asset a Drone's Datalink line points to.
_Avoid_: Node, ground station (use "Relay" to keep it distinct from "Base Station")

**Datalink**:
The always-visible, animated (marching-ants) line from a Drone to its nearest Relay, by straight-line distance, recomputed continuously as the Drone patrols. Distinct from a Base Station's docking/recharge role — a Datalink line can point to either a Tower or a Base Station, whichever is closer.
_Avoid_: Link, connection line (use "Datalink" for this specific always-on nearest-Relay line)

### Events & Detection

**Event**:
A ground-truth occurrence spawned by a Scenario at a fixed point and time: a Fire, a Person Sighting, or a Fallen Tree. Static in position; its only state changes are Undetected → Detected → Resolved.
_Avoid_: Incident, alert (an Event is the thing itself; an "alert" would be a UI notification of a Detection)

**Detection**:
The moment an Event's position falls within range of an eligible, active asset (a Tower for Fire Events, a Drone for any Event type). Detection is deterministic based on distance, not probabilistic — this keeps Scenarios fully reproducible.
_Avoid_: Sighting, spotting

**Ground Truth View**:
An optional map mode that reveals Undetected Events (faded/dashed) in addition to Detected ones, for demoing how the sensor network's picture differs from reality. The default view only shows Detected Events ("fog of war").
_Avoid_: God mode, debug view
