# Forest Situational Awareness

A prototype web app that visualizes a forest sensor network (Towers + patrolling Drones) detecting simulated Events (fires, person sightings, fallen trees) in real time on a map of Finland's Rokua National Park.

See [`CONTEXT.md`](CONTEXT.md) for domain vocabulary, [`docs/adr/`](docs/adr) for architectural decisions, and [`docs/prd/forest-situational-awareness.md`](docs/prd/forest-situational-awareness.md) for the full product spec. Implementation is tracked slice-by-slice in [`docs/issues/forest-situational-awareness-issues.md`](docs/issues/forest-situational-awareness-issues.md).

This is currently just the project scaffold and base map (issue A) — no World/Scenario data or simulation yet.

## Getting started

Requires Node.js 20+.

```bash
npm install
npm run dev
```

Then open the printed local URL (typically http://localhost:5173) in a browser. You should see a real, tiled OpenStreetMap view centered on Rokua National Park that you can pan and zoom.

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
  map/        # the Leaflet/react-leaflet base map and its geo helpers
  test/       # test environment setup (e.g. jest-dom matchers)
  App.tsx     # root component
  main.tsx    # React entry point
```

Future slices add `world/`, `engine/`, and `scenario/` concerns on top of this shell (see the issues doc).
