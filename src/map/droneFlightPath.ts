import { pointOnCircle } from './geo'
import type { LatLng } from './geo'
import type { SimulationState } from '../engine/types'

/**
 * What a single Drone's flight should draw on the map this tick, derived
 * purely from its {@link SimulationState} entry (its
 * `DroneActivityState` plus the Event/Fire/patrol data that mode carries):
 *
 * - `'trajectory'` — a straight line the Drone is currently flying, from
 *   its live `from` position to its `to` destination. Applies to every
 *   "going somewhere" mode: `'investigating'` (to the assigned Event),
 *   `'travelingToFire'` (to the fire's orbit-entry point),
 *   `'returningToBase'` (to its `patrolCenter` — its home Base Station's
 *   position, which the engine flies it back to; see `advanceSimulation`),
 *   and `'returningToStation'` (to its nearest Base Station's
 *   `targetPosition` on a manual recall — ADR-0007).
 * - `'orbit'` — the actual circle a Drone is flying around while
 *   `'investigatingFire'`: centered on the Fire's ignition point, at the
 *   real `radiusMeters` snapshotted into the activity at dispatch time (the
 *   same `orbitRadiusMeters` `engine/orbit.ts` uses to place the Drone), so
 *   the drawn circle traces exactly the path the Drone follows.
 *
 * `'patrolling'`, `'grounded'`, and `'lost'` have no flight to draw (a
 * patrolling Drone has no dispatch destination; a Grounded Drone is parked at
 * its Base Station; a Lost Drone is frozen with none) — those, and any mode
 * whose target Event/Fire has gone missing, return `null`.
 */
export type DroneFlightPath =
  | { kind: 'trajectory'; from: LatLng; to: LatLng }
  | { kind: 'orbit'; center: LatLng; radiusMeters: number }

/**
 * The {@link DroneFlightPath} to draw for `droneId` given the current
 * `state`, or `null` when there is nothing to draw. Pure: a function of
 * `state` alone (the Drone's `droneActivity`/`dronePatrol` entries plus the
 * `events`/`fires` its mode references), mirroring how `advanceSimulation`'s
 * `positionForActivity` derives the Drone's own position from the same data
 * — this just derives what its flight looks like rather than where it is.
 *
 * The `'travelingToFire'` destination is the Fire's orbit-entry point
 * (`pointOnCircle` at angle 0 — due east of the Fire at the snapshot orbit
 * radius), exactly where `advanceSimulation`'s `travelingToFire` math flies
 * the Drone before it begins orbiting, not the Fire's ignition point
 * itself. Returns `null` for an unknown `droneId`, or when a referenced
 * Event/Fire is missing from `state` (defensive/total, same spirit as
 * `positionForActivity`'s own missing-target fallbacks).
 */
export function droneFlightPathFor(droneId: string, state: SimulationState): DroneFlightPath | null {
  const patrol = state.dronePatrol[droneId]
  const activity = state.droneActivity[droneId]
  if (!patrol || !activity) return null

  switch (activity.mode) {
    case 'investigating': {
      const event = state.events[activity.assignedEventId]
      if (!event) return null
      return { kind: 'trajectory', from: patrol.position, to: event.position }
    }
    case 'travelingToFire': {
      const fire = state.fires[activity.assignedFireId]
      if (!fire) return null
      return { kind: 'trajectory', from: patrol.position, to: pointOnCircle(fire.position, activity.orbitRadiusMeters, 0) }
    }
    case 'investigatingFire': {
      const fire = state.fires[activity.assignedFireId]
      if (!fire) return null
      return { kind: 'orbit', center: fire.position, radiusMeters: activity.orbitRadiusMeters }
    }
    case 'returningToBase':
      return { kind: 'trajectory', from: patrol.position, to: patrol.patrolCenter }
    case 'returningToStation':
      return { kind: 'trajectory', from: patrol.position, to: activity.targetPosition }
    case 'patrolling':
    case 'grounded':
    case 'lost':
      return null
  }
}
