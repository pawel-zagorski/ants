# Deterministic, distance-based detection instead of probabilistic

Detection of an Event by a Tower or Drone is decided purely by distance: an eligible asset within its fixed detection radius detects the Event on that tick, every time. We considered a probabilistic model (detection chance per tick scaled by distance/weather) as it's more realistic, but rejected it for this prototype.

The explicit requirement was reproducible scenarios — loading the same `world.json` + `scenario-*.json` must always produce the same detection timeline. A probabilistic model would need a seeded RNG whose draws are also replayed/stored, adding bookkeeping for a property (missed detections) nobody asked for yet. If probabilistic detection is wanted later, it should be introduced alongside an explicit seed stored per Scenario run, not as a silent change to this deterministic default.
