import { useMemo, useState } from 'react'
import { MapContainer, TileLayer } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { toLeafletBounds } from './geo'
import { AssetMarkers } from './AssetMarkers'
import { AssetPanel } from './AssetPanel'
import { EventMarkers } from './EventMarkers'
import { GroundTruthToggle } from './GroundTruthToggle'
import { withDronePositions } from '../engine/liveWorld'
import { useSimulationClock } from '../engine/useSimulationClock'
import { SimulationClockPanel } from '../engine/SimulationClockPanel'
import type { Scenario } from '../scenario/types'
import type { Asset, World } from '../world/types'

const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

export interface RokuaMapProps {
  world: World
  scenario: Scenario
}

/**
 * Base map shell: an OpenStreetMap-tiled, pannable/zoomable map over the
 * World's `bounds` (Rokua National Park by default — see
 * docs/prd/forest-situational-awareness.md), with its Towers, Base Stations,
 * and Drones rendered as clickable markers, plus the chosen Scenario's
 * spawned Events (issue D). Clicking an asset marker opens a status panel
 * with its basic identity fields, plus — for a Tower — its currently-tracked
 * Fire Event (issue E). The Simulation Clock (issue C) drives Drone patrol
 * movement, Event spawning, and Detection (issue E) — Towers and Base
 * Stations stay at their fixed `world` positions. The default ("fog of
 * war") view shows only Detected/Resolved Events; the Ground Truth View
 * toggle (off by default) additionally reveals Undetected ones,
 * faded/dashed.
 */
export function RokuaMap({ world, scenario }: RokuaMapProps) {
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null)
  const [groundTruthViewEnabled, setGroundTruthViewEnabled] = useState(false)
  const clock = useSimulationClock(world, scenario)
  const liveWorld = useMemo(() => withDronePositions(world, clock.simulationState), [world, clock.simulationState])

  return (
    <MapContainer bounds={toLeafletBounds(world.bounds)} className="rokua-map">
      <TileLayer url={OSM_TILE_URL} attribution={OSM_ATTRIBUTION} />
      <AssetMarkers world={liveWorld} onSelect={setSelectedAsset} />
      <EventMarkers events={clock.simulationState.events} groundTruthViewEnabled={groundTruthViewEnabled} />
      {selectedAsset && (
        <AssetPanel asset={selectedAsset} events={clock.simulationState.events} onClose={() => setSelectedAsset(null)} />
      )}
      <SimulationClockPanel clock={clock} />
      <GroundTruthToggle enabled={groundTruthViewEnabled} onChange={setGroundTruthViewEnabled} />
    </MapContainer>
  )
}
