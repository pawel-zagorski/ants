import { Marker } from 'react-leaflet'
import { iconForAssetType } from './assetIcons'
import type { Asset, World } from '../world/types'

export interface AssetMarkersProps {
  world: World
  onSelect: (asset: Asset) => void
}

/**
 * Renders every Tower, Base Station, and Drone in `world` at its current
 * position, each with a marker icon distinct per asset type. Clicking a
 * marker reports that asset via `onSelect`. This component has no knowledge
 * of the simulation engine — Towers and Base Stations are always static,
 * and Drone positions only move if the caller passes a `world` whose Drone
 * positions have already been derived from a `SimulationState` (see
 * `engine/liveWorld.ts`, wired up in `RokuaMap`).
 */
export function AssetMarkers({ world, onSelect }: AssetMarkersProps) {
  const assets: Asset[] = [...world.towers, ...world.baseStations, ...world.drones]

  return (
    <>
      {assets.map((asset) => (
        <Marker
          key={asset.id}
          position={[asset.position.lat, asset.position.lng]}
          icon={iconForAssetType(asset.type)}
          eventHandlers={{ click: () => onSelect(asset) }}
        />
      ))}
    </>
  )
}
