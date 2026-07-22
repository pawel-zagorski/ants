import { DatalinkLine } from './DatalinkLine'
import { findNearestRelay } from './nearestRelay'
import type { World } from '../world/types'

export interface DatalinkLinesProps {
  /** Expected to be a *live* World (see `engine/liveWorld.ts`) — Drones' current patrol positions, not their static `world.json` ones. */
  world: World
}

/**
 * Always-on map layer (issue L, unlike issue K's selection-gated Return
 * Envelope): one {@link DatalinkLine} per Drone in `world`, to whichever of
 * `world.towers`/`world.baseStations` (combined as Relays — see
 * `CONTEXT.md`'s **Relay** entry) is currently nearest. Recomputed fresh
 * every render — a cheap 4-way distance comparison per Drone at this
 * prototype's scale, so a Drone's line retargets to a different Relay the
 * moment it patrols closer to one, with no memoization needed.
 */
export function DatalinkLines({ world }: DatalinkLinesProps) {
  const relays = [...world.towers, ...world.baseStations]

  return (
    <>
      {world.drones.map((drone) => {
        const nearest = findNearestRelay(drone.position, relays)
        if (!nearest) return null
        return (
          <DatalinkLine key={drone.id} drone={drone} relay={nearest.relay} distanceMeters={nearest.distanceMeters} />
        )
      })}
    </>
  )
}
