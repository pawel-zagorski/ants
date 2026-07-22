import { distanceMetersBetween, type LatLng } from './geo'
import type { Relay } from '../world/types'

/** The result of a nearest-Relay lookup — the winning Relay plus its straight-line distance from the query point. */
export interface NearestRelay {
  relay: Relay
  distanceMeters: number
}

/**
 * The closest of `relays` to `dronePosition` by {@link distanceMetersBetween}
 * — the always-on Datalink line's target (issue L, see `CONTEXT.md`'s
 * **Relay** and **Datalink** entries). `relays` is the caller's combined
 * `World.towers`/`World.baseStations` roster; this function is agnostic to
 * which kind wins. Returns `undefined` only if `relays` is empty (never
 * happens for the default `world.json`'s 4 fixed assets, but this stays
 * total rather than throwing on a degenerate World).
 */
export function findNearestRelay(dronePosition: LatLng, relays: readonly Relay[]): NearestRelay | undefined {
  let nearest: NearestRelay | undefined
  for (const relay of relays) {
    const distanceMeters = distanceMetersBetween(dronePosition, relay.position)
    if (!nearest || distanceMeters < nearest.distanceMeters) {
      nearest = { relay, distanceMeters }
    }
  }
  return nearest
}
