import { useMemo, useState } from 'react'
import { MapContainer, TileLayer } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { toLeafletBounds } from './geo'
import { AssetMarkers } from './AssetMarkers'
import { AssetPanel } from './AssetPanel'
import { DatalinkLines } from './DatalinkLines'
import { EventMarkers } from './EventMarkers'
import { GroundTruthToggle } from './GroundTruthToggle'
import { ReturnEnvelope } from './ReturnEnvelope'
import { WindIndicator } from './WindIndicator'
import { withDronePositions } from '../engine/liveWorld'
import { droneTelemetryFor } from '../engine/telemetry'
import { useSimulationClock } from '../engine/useSimulationClock'
import { SimulationClockPanel } from '../engine/SimulationClockPanel'
import type { Scenario } from '../scenario/types'
import type { Asset, Drone, World } from '../world/types'

const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

export interface RokuaMapProps {
  world: World
  scenario: Scenario
}

/**
 * Every clickable asset in `world`, in a stable flat list — the lookup
 * table {@link RokuaMap} re-derives a fresh `Asset` from on every render
 * (see `selectedAssetId` below), so an open status panel's fields (a
 * Drone's live position/telemetry, issue G) stay current as the Simulation
 * Clock advances, rather than freezing at whatever they were the tick the
 * marker was clicked.
 */
function allAssets(world: World): Asset[] {
  return [...world.towers, ...world.baseStations, ...world.drones]
}

function isDroneAsset(asset: Asset): asset is Drone {
  return asset.type === 'Quadrocopter' || asset.type === 'FixedWingDrone'
}

/**
 * Base map shell: an OpenStreetMap-tiled, pannable/zoomable map over the
 * World's `bounds` (Rokua National Park by default — see
 * docs/prd/forest-situational-awareness.md), with its Towers, Base Stations,
 * and Drones rendered as clickable markers, plus the chosen Scenario's
 * spawned Events (issue D). Clicking an asset marker opens a status panel
 * with its basic identity fields, plus per-kind rich telemetry: a Tower's
 * currently-tracked Fire Event (issue E); a Drone's full telemetry and a
 * Base Station's docked/deployed counts (issue G) — see `AssetPanel`. The
 * Simulation Clock (issue C) drives Drone patrol movement, Event spawning,
 * Detection (issue E), and Resolution (issue G) — Towers and Base Stations
 * stay at their fixed `world` positions. The default ("fog of war") view
 * shows only Detected/Resolved Events; the Ground Truth View toggle (off
 * by default) additionally reveals Undetected ones, faded/dashed. Every
 * Drone also always shows an animated Datalink line to its nearest Relay
 * (issue L, see `DatalinkLines`) — unlike the status panel, this layer is
 * not gated by selection. Since `scenario` is only ever passed in once a
 * Scenario has been loaded/selected, the Wind indicator (issue P, see
 * `WindIndicator`) is always shown alongside the other bottom-left
 * controls, with no separate loaded-check needed.
 */
export function RokuaMap({ world, scenario }: RokuaMapProps) {
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null)
  const [groundTruthViewEnabled, setGroundTruthViewEnabled] = useState(false)
  const clock = useSimulationClock(world, scenario)
  const liveWorld = useMemo(() => withDronePositions(world, clock.simulationState), [world, clock.simulationState])
  // Re-derived every render (not stored as the selected object itself) so
  // an open panel's fields track `liveWorld`/`clock.simulationState` as
  // they change, rather than the stale snapshot from the click that opened it.
  const selectedAsset = selectedAssetId ? allAssets(liveWorld).find((asset) => asset.id === selectedAssetId) ?? null : null
  // The Return Envelope (issue K) is only shown while a Drone's status
  // panel is open — mirrors `AssetPanel`'s own conditional-render pattern
  // above, and reads the same live, shrinking-over-time
  // `remainingEnduranceSimSeconds` the panel does (via `droneTelemetryFor`).
  const selectedDroneRemainingEnduranceSimSeconds =
    selectedAsset && isDroneAsset(selectedAsset)
      ? droneTelemetryFor(
          clock.simulationState.dronePatrol[selectedAsset.id],
          clock.simulationState.droneActivity[selectedAsset.id],
          clock.simulationState.elapsedSimSeconds,
          selectedAsset.maxEnduranceSimSeconds,
        ).remainingEnduranceSimSeconds
      : undefined

  return (
    <MapContainer bounds={toLeafletBounds(world.bounds)} className="rokua-map">
      <TileLayer url={OSM_TILE_URL} attribution={OSM_ATTRIBUTION} />
      <DatalinkLines world={liveWorld} />
      <AssetMarkers world={liveWorld} onSelect={(asset) => setSelectedAssetId(asset.id)} />
      <EventMarkers events={clock.simulationState.events} groundTruthViewEnabled={groundTruthViewEnabled} />
      {selectedAsset && isDroneAsset(selectedAsset) && selectedDroneRemainingEnduranceSimSeconds !== undefined && (
        <ReturnEnvelope
          drone={selectedAsset}
          dronePosition={selectedAsset.position}
          remainingEnduranceSimSeconds={selectedDroneRemainingEnduranceSimSeconds}
          baseStations={liveWorld.baseStations}
        />
      )}
      {selectedAsset && (
        <AssetPanel
          asset={selectedAsset}
          simulationState={clock.simulationState}
          drones={world.drones}
          onClose={() => setSelectedAssetId(null)}
        />
      )}
      <div className="bottom-controls">
        <SimulationClockPanel clock={clock} />
        <GroundTruthToggle enabled={groundTruthViewEnabled} onChange={setGroundTruthViewEnabled} />
        <WindIndicator wind={scenario.wind} />
      </div>
    </MapContainer>
  )
}
