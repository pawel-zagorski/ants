import { DatalinkLine } from './DatalinkLine'
import { findNearestRelay } from './nearestRelay'
import type { DroneActivityState } from '../engine/types'
import type { World } from '../world/types'

export interface DatalinkLinesProps {
  /** Expected to be a *live* World (see `engine/liveWorld.ts`) — Drones' current patrol positions, not their static `world.json` ones. */
  world: World
  /**
   * The Simulation Clock's current `droneActivity` (issue W) — used only
   * to drop a `'lost'` Drone's line entirely (a Lost Drone will never
   * reach any Relay again, same "never renders" treatment as its Return
   * Envelope — see `RokuaMap`). Optional/defaulted to `{}`, mirroring
   * `AssetMarkers`' own equivalent prop, so no pre-issue-W caller/test
   * breaks (no Drone can ever be Lost without it).
   */
  droneActivity?: Record<string, DroneActivityState>
}

/**
 * Always-on map layer (issue L, unlike issue K's selection-gated Return
 * Envelope): one {@link DatalinkLine} per Drone in `world`, to whichever of
 * `world.towers`/`world.baseStations` (combined as Relays — see
 * `CONTEXT.md`'s **Relay** entry) is currently nearest — except a `'lost'`
 * Drone (issue W), which renders no Datalink line at all. Recomputed fresh
 * every render — a cheap 4-way distance comparison per Drone at this
 * prototype's scale, so a Drone's line retargets to a different Relay the
 * moment it patrols closer to one, with no memoization needed.
 */
export function DatalinkLines({ world, droneActivity = {} }: DatalinkLinesProps) {
  const relays = [...world.towers, ...world.baseStations]

  return (
    <>
      {world.drones.map((drone) => {
        if (droneActivity[drone.id]?.mode === 'lost') return null

        const nearest = findNearestRelay(drone.position, relays)
        if (!nearest) return null
        return (
          <DatalinkLine key={drone.id} drone={drone} relay={nearest.relay} distanceMeters={nearest.distanceMeters} />
        )
      })}
    </>
  )
}
