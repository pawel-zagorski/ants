# Manual dispatch replaces auto-dispatch for every Event type

The PRD explicitly scoped out manual Drone control ("no manual operator control of Drones... fully autonomous"). We're reversing that: every Detection (Fire, Person Sighting, Fallen Tree) now requires the operator to click and choose a Drone from a panel, rather than the nearest available Drone auto-dispatching.

This was decided specifically because Fire dispatch needs a real decision (which Drone, whether to risk a One-Way Mission) that can't be automated. For UI consistency we chose to make Person Sighting/Fallen Tree dispatch manual too — with a much simpler panel (just a list of available Drones to click, no bingo-range math, no one-way option) — rather than running two different dispatch philosophies side by side. `dispatch.ts`'s nearest-drone auto-selection is retired in favor of user-driven selection everywhere.
