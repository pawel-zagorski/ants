import { Marker } from 'react-leaflet'
import { iconForAssetType } from './assetIcons'
import type { Asset, World } from '../world/types'

export interface AssetMarkersProps {
  world: World
  onSelect: (asset: Asset) => void
}

/**
 * Renders every Tower, Base Station, and Drone in `world` at its fixed
 * position, each with a marker icon distinct per asset type. Clicking a
 * marker reports that asset via `onSelect` — this slice has no simulation
 * engine, so positions never change after the World loads.
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
