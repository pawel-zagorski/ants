# Split World config from Scenario event scripts

We store the sensor network roster (map bounds, Towers, Base Stations, Drones) in a single `world.json`, separate from `scenario-*.json` files that only contain the timed Event list. The alternative was bundling everything into one self-contained scenario file per run.

We picked the split because the interesting variable across test runs is "what events happen and when," not "where are the towers" — keeping the roster fixed lets us author many scenario files against the same World without duplicating/drifting asset positions. A World is referenced by a Scenario, not owned by it; a future engineer should not add towers/drones fields into scenario files.
