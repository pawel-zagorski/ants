# Frontend-only architecture, no simulation backend

This is a throwaway prototype meant to answer "does this situational-awareness UI/simulation concept feel right?", not to serve real sensor hardware. We decided the Simulation Clock, World, and Scenario playback all run as an in-memory engine inside the browser (React + TypeScript), reading `world.json` / `scenario-*.json` at startup, with no server component. This keeps the prototype a static site with no deployment/ops surface, and reproducibility is simply "same input files in, same output" — no server-side state to keep in sync.

If this evolves past a prototype (e.g. real sensor feeds, multi-user viewing), the simulation engine's interfaces (World, tick, Detection) should translate fairly directly into a backend service pushing over WebSocket/SSE, but that migration is out of scope here.
