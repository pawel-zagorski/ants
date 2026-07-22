import { Marker } from 'react-leaflet'
import { iconForAssetType } from './assetIcons'
import type { DroneActivityState } from '../engine/types'
import type { Asset, World } from '../world/types'

export interface AssetMarkersProps {
  world: World
  /**
   * The Simulation Clock's current `droneActivity` (issue W) — the only
   * part of `SimulationState` this otherwise engine-unaware component
   * needs, purely to know which Drone markers should render the `'lost'`
   * greyed-out treatment (see {@link isLostDrone}). Optional/defaulted to
   * `{}` so every pre-issue-W caller/test (no Drone can ever be Lost
   * without it) keeps working unchanged.
   */
  droneActivity?: Record<string, DroneActivityState>
  onSelect: (asset: Asset) => void
}

/** Whether `asset` is a Drone currently `'lost'` in `droneActivity` (issue W) — a Tower/Base Station id is never a key here, so this is always `false` for them. */
function isLostDrone(assetId: string, droneActivity: Record<string, DroneActivityState>): boolean {
  return droneActivity[assetId]?.mode === 'lost'
}

/**
 * Renders every Tower, Base Station, and Drone in `world` at its current
 * position, each with a marker icon distinct per asset type. Clicking a
 * marker reports that asset via `onSelect`. This component has no knowledge
 * of the simulation engine — Towers and Base Stations are always static,
 * and Drone positions only move if the caller passes a `world` whose Drone
 * positions have already been derived from a `SimulationState` (see
 * `engine/liveWorld.ts`, wired up in `RokuaMap`). The one exception is
 * `droneActivity` (issue W): a Lost Drone still renders (frozen at its
 * `world` position, same as every other asset here) but with the
 * `.asset-icon-lost` greyed-out treatment instead of its normal icon —
 * still clickable, so its status panel can still confirm it's Lost.
 */
export function AssetMarkers({ world, droneActivity = {}, onSelect }: AssetMarkersProps) {
  const assets: Asset[] = [...world.towers, ...world.baseStations, ...world.drones]

  return (
    <>
      {assets.map((asset) => (
        <Marker
          key={asset.id}
          position={[asset.position.lat, asset.position.lng]}
          icon={iconForAssetType(asset.type, isLostDrone(asset.id, droneActivity))}
          eventHandlers={{ click: () => onSelect(asset) }}
        />
      ))}
    </>
  )
}
