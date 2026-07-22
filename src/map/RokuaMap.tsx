import { MapContainer, TileLayer } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { squareViewportBounds, toLeafletBounds } from './geo'

/** Rokua National Park, Finland — see docs/prd/forest-situational-awareness.md. */
const ROKUA_CENTER = { lat: 64.5644, lng: 26.4947 }
const DEFAULT_VIEWPORT_SIDE_KM = 50

const DEFAULT_BOUNDS = squareViewportBounds(ROKUA_CENTER, DEFAULT_VIEWPORT_SIDE_KM)

const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

/**
 * Base map shell: an OpenStreetMap-tiled, pannable/zoomable map defaulting to
 * a 50x50km viewport over Rokua National Park. World/Scenario data is layered
 * on top of this in later slices.
 */
export function RokuaMap() {
  return (
    <MapContainer bounds={toLeafletBounds(DEFAULT_BOUNDS)} className="rokua-map">
      <TileLayer url={OSM_TILE_URL} attribution={OSM_ATTRIBUTION} />
    </MapContainer>
  )
}
