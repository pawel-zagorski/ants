import { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { toLeafletBounds } from './geo'
import { AssetMarkers } from './AssetMarkers'
import { AssetPanel } from './AssetPanel'
import { ClearcutConfirmedShapeLayer } from './ClearcutConfirmedShapeLayer'
import { ClearcutEstimateLayer } from './ClearcutEstimateLayer'
import { ClearcutFootprintLayer } from './ClearcutFootprintLayer'
import { ClearcutMarkers } from './ClearcutMarkers'
import { ClearcutPanel } from './ClearcutPanel'
import { ConfirmedShapeLayer } from './ConfirmedShapeLayer'
import { EventLogPanel } from './EventLogPanel'
import { DatalinkLines } from './DatalinkLines'
import { DroneFlightPaths } from './DroneFlightPaths'
import { EventMarkers } from './EventMarkers'
import { EventPanel } from './EventPanel'
import { FireFootprintLayer } from './FireFootprintLayer'
import { FireMarkers } from './FireMarkers'
import { FirePanel } from './FirePanel'
import { GroundTruthToggle } from './GroundTruthToggle'
import { ReturnEnvelope } from './ReturnEnvelope'
import { UncertaintyEllipseLayer } from './UncertaintyEllipseLayer'
import { WindIndicator } from './WindIndicator'
import { canReturnDroneToBase } from '../engine/advanceSimulation'
import { withDronePositions } from '../engine/liveWorld'
import { droneTelemetryFor } from '../engine/telemetry'
import { useSimulationClock } from '../engine/useSimulationClock'
import { SimulationClockPanel } from '../engine/SimulationClockPanel'
import { withBase } from '../basePath'
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
 * Leaflet sizes its container once, on mount, from that container's then-
 * current dimensions. Under the flex column layout (issue Event Log), the
 * map now lives in a `flex: 1` area above a fixed bottom strip rather than
 * spanning the whole viewport, so this nudges Leaflet to re-measure after
 * the flex layout settles — otherwise a map mounted before its flex parent
 * has resolved its height can render with stale/zero tile dimensions. A
 * no-op render component (mirrors the codebase's other map-child helpers);
 * lives inside `MapContainer` purely so it can call `useMap()`.
 */
function MapResizeInvalidator() {
  const map = useMap()
  useEffect(() => {
    map.invalidateSize()
  }, [map])
  return null
}

/**
 * Base map shell: an OpenStreetMap-tiled, pannable/zoomable map over the
 * World's `bounds` (Rokua National Park by default — see
 * docs/prd/forest-situational-awareness.md), with its Towers, Base Stations,
 * and Drones rendered as clickable markers, plus the chosen Scenario's
 * spawned Events (issue D) and Fires (issue Q — rendered by the sibling
 * `FireMarkers`, reading `SimulationState.fires` rather than `events`,
 * since ADR-0004 Fire is not a kind of Event). Clicking an asset marker
 * opens a status panel with its basic identity fields, plus per-kind rich
 * telemetry: a Tower's currently-tracked Fire (issue E); a Drone's full
 * telemetry and a Base Station's docked/deployed counts (issue G) — see
 * `AssetPanel`. The Simulation Clock (issue C) drives Drone patrol
 * movement, Event spawning, Detection (issue E), and Resolution (issue G) —
 * Towers and Base Stations stay at their fixed `world` positions. The
 * default ("fog of war") view shows only Detected/Resolved Events; the
 * Ground Truth View toggle (off by default) additionally reveals
 * Undetected ones, faded/dashed. Every Drone also always shows an animated
 * Datalink line to its nearest Relay (issue L, see `DatalinkLines`) —
 * unlike the status panel, this layer is not gated by selection. Clicking a
 * Detected Event (Person Sighting/Fallen Tree) instead opens `EventPanel`
 * (issue O, ADR-0005): its Detection Status plus a "Send" button per
 * currently-available Drone, which manually triggers that Drone's
 * investigate behavior — auto-dispatch is retired for these two Event
 * types (Fire Detection is unaffected — it never dispatched a Drone even
 * before issue O, see ADR-0004/ADR-0005 and `advanceSimulation.ts`). Since
 * `scenario` is only ever passed in once a Scenario has been
 * loaded/selected, the Wind indicator (issue P, see `WindIndicator`) is
 * always shown alongside the other bottom-left controls, with no separate
 * loaded-check needed. Ground Truth View also renders each Fire's real,
 * live Fire Footprint (issue R, `FireFootprintLayer`) as a growing
 * hex-tile mosaic, biased downwind by `scenario.wind` — hidden entirely in
 * the default view. That default view instead shows the Uncertainty
 * Ellipse (issue S, `UncertaintyEllipseLayer`) for a Tower-Detected,
 * not-yet-Investigated Fire, sized by the detecting Tower's distance and
 * elapsed time since Detection, or the Confirmed Shape (issue V,
 * `ConfirmedShapeLayer`) once a Fire reaches `'investigated'` — the two
 * are mutually exclusive by tier, so a Fire is always covered by exactly
 * one of them (or neither, while still `'undetected'`). Clicking a
 * clickable (non-`'undetected'`) Fire marker instead opens `FirePanel`
 * (issue T/U): its read-only Detection Status (detecting Tower id/time,
 * current tier) plus a Bingo Range/One-Way Mission "Send" split (issue U,
 * ADR-0006) — `onSend` wires straight to `useSimulationClock.sendDroneToFire`,
 * mirroring `EventPanel`'s `onSend`/`sendDrone` wiring above but carrying
 * which list the Drone was sent from as its `missionKind`. The Uncertainty
 * Ellipse's visibility is keyed off the Fire's `tier` (Detection status),
 * not its Drone-dispatch/investigation state, so it correctly keeps
 * showing while a Drone is en route or `'investigatingFire'` and only
 * disappears once the Fire itself reaches `'investigated'`.
 */
export function RokuaMap({ world, scenario }: RokuaMapProps) {
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null)
  // Mutually exclusive with `selectedAssetId`/`selectedFireId` (see the
  // three `onSelect` handlers below) — only one status/detection panel is
  // ever open at a time, mirroring `AssetPanel`'s single-panel UX for
  // Events/Fires too.
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  // Mirrors `selectedEventId` (issue O), but for Fire (issue T) — kept as
  // its own separate piece of state rather than a shared "selected
  // detection id" (ADR-0004: Fire is not a kind of Event, so its
  // detection-panel-open state stays its own concept too).
  const [selectedFireId, setSelectedFireId] = useState<string | null>(null)
  // Mirrors `selectedFireId` (issue T), but for Clearcut (issue X) — its own
  // separate state (ADR-0009: a Clearcut is not a kind of Event/Fire, so its
  // detection-panel-open state stays its own concept too). Mutually
  // exclusive with the other three selections (see the `onSelect` handlers).
  const [selectedClearcutId, setSelectedClearcutId] = useState<string | null>(null)
  const [groundTruthViewEnabled, setGroundTruthViewEnabled] = useState(false)
  const clock = useSimulationClock(world, scenario)
  const liveWorld = useMemo(() => withDronePositions(world, clock.simulationState), [world, clock.simulationState])
  // Re-derived every render (not stored as the selected object itself) so
  // an open panel's fields track `liveWorld`/`clock.simulationState` as
  // they change, rather than the stale snapshot from the click that opened it.
  const selectedAsset = selectedAssetId ? allAssets(liveWorld).find((asset) => asset.id === selectedAssetId) ?? null : null
  const selectedEvent = selectedEventId ? clock.simulationState.events[selectedEventId] ?? null : null
  const selectedFire = selectedFireId ? clock.simulationState.fires[selectedFireId] ?? null : null
  const selectedClearcut = selectedClearcutId ? clock.simulationState.clearcuts[selectedClearcutId] ?? null : null
  // The Return Envelope (issue K) is only shown while a Drone's status
  // panel is open — mirrors `AssetPanel`'s own conditional-render pattern
  // above, and reads the same live, shrinking-over-time
  // `remainingEnduranceSimSeconds` the panel does (via `droneTelemetryFor`).
  // Excludes a terminal Drone entirely, rather than rendering a degenerate
  // envelope: a `'lost'` Drone (issue W) will never return to any Base
  // Station, and a `'grounded'` Drone (ADR-0007) is already parked at one and
  // permanently out of service — so there is nothing meaningful for this
  // overlay to show for either.
  const selectedDroneMode = selectedAsset !== null ? clock.simulationState.droneActivity[selectedAsset.id]?.mode : undefined
  const selectedDroneIsTerminal = selectedDroneMode === 'lost' || selectedDroneMode === 'grounded'
  const selectedDroneRemainingEnduranceSimSeconds =
    selectedAsset && isDroneAsset(selectedAsset) && !selectedDroneIsTerminal
      ? droneTelemetryFor(
          clock.simulationState.dronePatrol[selectedAsset.id],
          clock.simulationState.droneActivity[selectedAsset.id],
          clock.simulationState.elapsedSimSeconds,
          selectedAsset.maxEnduranceSimSeconds,
        ).remainingEnduranceSimSeconds
      : undefined

  return (
    <div className="simulation-layout">
      <div className="map-area">
        <MapContainer bounds={toLeafletBounds(world.bounds)} className="rokua-map">
          <MapResizeInvalidator />
          <TileLayer url={OSM_TILE_URL} attribution={OSM_ATTRIBUTION} />
      <DatalinkLines world={liveWorld} droneActivity={clock.simulationState.droneActivity} />
      <DroneFlightPaths simulationState={clock.simulationState} />
      <AssetMarkers
        world={liveWorld}
        droneActivity={clock.simulationState.droneActivity}
        onSelect={(asset) => {
          setSelectedAssetId(asset.id)
          setSelectedEventId(null)
          setSelectedFireId(null)
          setSelectedClearcutId(null)
        }}
      />
      <EventMarkers
        events={clock.simulationState.events}
        groundTruthViewEnabled={groundTruthViewEnabled}
        onSelect={(event) => {
          setSelectedEventId(event.id)
          setSelectedAssetId(null)
          setSelectedFireId(null)
          setSelectedClearcutId(null)
        }}
      />
      <FireMarkers
        fires={clock.simulationState.fires}
        groundTruthViewEnabled={groundTruthViewEnabled}
        onSelect={(fire) => {
          setSelectedFireId(fire.id)
          setSelectedAssetId(null)
          setSelectedEventId(null)
          setSelectedClearcutId(null)
        }}
      />
      <ClearcutMarkers
        clearcuts={clock.simulationState.clearcuts}
        groundTruthViewEnabled={groundTruthViewEnabled}
        onSelect={(clearcut) => {
          setSelectedClearcutId(clearcut.id)
          setSelectedAssetId(null)
          setSelectedEventId(null)
          setSelectedFireId(null)
        }}
      />
      <FireFootprintLayer
        fires={clock.simulationState.fires}
        wind={scenario.wind}
        elapsedSimSeconds={clock.simulationState.elapsedSimSeconds}
        groundTruthViewEnabled={groundTruthViewEnabled}
      />
      <UncertaintyEllipseLayer
        fires={clock.simulationState.fires}
        towers={liveWorld.towers}
        elapsedSimSeconds={clock.simulationState.elapsedSimSeconds}
        groundTruthViewEnabled={groundTruthViewEnabled}
      />
      <ConfirmedShapeLayer fires={clock.simulationState.fires} groundTruthViewEnabled={groundTruthViewEnabled} />
      <ClearcutFootprintLayer
        clearcuts={clock.simulationState.clearcuts}
        groundTruthViewEnabled={groundTruthViewEnabled}
      />
      <ClearcutEstimateLayer
        clearcuts={clock.simulationState.clearcuts}
        groundTruthViewEnabled={groundTruthViewEnabled}
      />
      <ClearcutConfirmedShapeLayer
        clearcuts={clock.simulationState.clearcuts}
        groundTruthViewEnabled={groundTruthViewEnabled}
      />
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
          showReturnEnvelope={isDroneAsset(selectedAsset) && selectedDroneRemainingEnduranceSimSeconds !== undefined}
          canReturnToBase={isDroneAsset(selectedAsset) && canReturnDroneToBase(clock.simulationState.droneActivity[selectedAsset.id])}
          onReturnToBase={() => clock.returnDroneToNearestBase(selectedAsset.id)}
          onClose={() => setSelectedAssetId(null)}
        />
      )}
      {selectedEvent && (
        <EventPanel
          event={selectedEvent}
          simulationState={clock.simulationState}
          drones={world.drones}
          onSend={(droneId) => clock.sendDrone(droneId, selectedEvent.id)}
          onClose={() => setSelectedEventId(null)}
        />
      )}
      {selectedFire && (
        <FirePanel
          fire={selectedFire}
          startDateTimeIso={scenario.startDateTimeIso}
          simulationState={clock.simulationState}
          drones={world.drones}
          baseStations={liveWorld.baseStations}
          wind={scenario.wind}
          onSend={(droneId, missionKind) => clock.sendDroneToFire(droneId, selectedFire.id, missionKind)}
          onClose={() => setSelectedFireId(null)}
        />
      )}
      {selectedClearcut && (
        <ClearcutPanel
          clearcut={selectedClearcut}
          startDateTimeIso={scenario.startDateTimeIso}
          simulationState={clock.simulationState}
          drones={world.drones}
          baseStations={liveWorld.baseStations}
          onSend={(droneId) => clock.sendDroneToClearcut(droneId, selectedClearcut.id)}
          onClose={() => setSelectedClearcutId(null)}
        />
      )}
          <div className="bottom-controls">
            <SimulationClockPanel clock={clock} startDateTimeIso={scenario.startDateTimeIso} />
            <GroundTruthToggle enabled={groundTruthViewEnabled} onChange={setGroundTruthViewEnabled} />
            <WindIndicator wind={scenario.wind} />
          </div>
          <img src={withBase('img/ants_logo.png')} alt="Team ANTS logo" className="map-logo-badge" />
        </MapContainer>
      </div>
      <EventLogPanel log={clock.simulationState.log} scenario={scenario} world={world} />
    </div>
  )
}
