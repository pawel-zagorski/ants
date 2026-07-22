import { useState } from 'react'
import { MapContainer, TileLayer } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { toLeafletBounds } from './geo'
import { AssetMarkers } from './AssetMarkers'
import { AssetPanel } from './AssetPanel'
import type { Asset, World } from '../world/types'

const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

export interface RokuaMapProps {
  world: World
}

/**
 * Base map shell: an OpenStreetMap-tiled, pannable/zoomable map over the
 * World's `bounds` (Rokua National Park by default — see
 * docs/prd/forest-situational-awareness.md), with its Towers, Base Stations,
 * and Drones rendered as clickable markers. Clicking a marker opens a status
 * panel with its basic identity fields.
 */
export function RokuaMap({ world }: RokuaMapProps) {
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null)

  return (
    <MapContainer bounds={toLeafletBounds(world.bounds)} className="rokua-map">
      <TileLayer url={OSM_TILE_URL} attribution={OSM_ATTRIBUTION} />
      <AssetMarkers world={world} onSelect={setSelectedAsset} />
      {selectedAsset && <AssetPanel asset={selectedAsset} onClose={() => setSelectedAsset(null)} />}
    </MapContainer>
  )
}
