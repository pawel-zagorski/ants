# Forest Situational Awareness

A prototype web app that visualizes a forest sensor network (Towers + patrolling Drones) detecting simulated Events (fires, person sightings, fallen trees) in real time on a map of Finland's Rokua National Park.

See [`CONTEXT.md`](CONTEXT.md) for domain vocabulary, [`docs/adr/`](docs/adr) for architectural decisions, and [`docs/prd/forest-situational-awareness.md`](docs/prd/forest-situational-awareness.md) for the full product spec. Implementation is tracked slice-by-slice in [`docs/issues/forest-situational-awareness-issues.md`](docs/issues/forest-situational-awareness-issues.md).

This currently has the project scaffold, base map (issue A), the World data model + static asset rendering/click panels (issue B), and the Simulation Clock + Drone patrol movement engine (issue C) — no Scenario/Event/Detection data yet.

## Getting started

Requires Node.js 20+.

```bash
npm install
npm run dev
```

Then open the printed local URL (typically http://localhost:5173) in a browser. You should see a real, tiled OpenStreetMap view centered on Rokua National Park that you can pan and zoom, with Tower, Base Station, and Drone markers loaded from [`public/world.json`](public/world.json). Click any marker to open a status panel with its id, type, and position.

Use the Simulation Clock panel (bottom-left) to press Play and watch Drones patrol: Quadrocopters loop tightly around their home Base Station, Fixed-Wing Drones loop a much larger perimeter at a visibly higher speed. Try the 1x/10x/60x speed buttons, Pause, and Step (advances the clock by a fixed increment while paused).

## Other scripts

```bash
npm run build      # type-check and build for production
npm run preview    # preview the production build locally
npm run lint        # run ESLint
npm run typecheck   # run the TypeScript compiler in check-only mode
npm test            # run the Vitest test suite once
npm run test:watch  # run Vitest in watch mode
```

## Project structure

```
src/
  map/        # the Leaflet/react-leaflet map, asset markers/icons, and the click status panel
  world/      # world.json types, schema validation, and the loader
  engine/     # the pure advanceSimulation engine, the useSimulationClock hook, and the Clock UI
  test/       # test environment setup and shared test-only helpers
  App.tsx     # root component — loads world.json, then renders the map
  main.tsx    # React entry point
public/
  world.json  # the default World roster (map bounds, Towers, Base Stations, Drones)
```

Future slices add `scenario/` concerns (Events, Detection, dispatch) on top of the `engine/` seam introduced here — see the issues doc.
