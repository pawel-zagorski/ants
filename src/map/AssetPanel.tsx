import {
  droneTelemetryStateLabel,
  fireMissionKindLabel,
  formatBatteryPercent,
  formatHeadingDegrees,
  formatRemainingEndurance,
  formatSpeedMetersPerSecond,
} from './assetPanelFormatting'
import { baseStationCountsFor, droneTelemetryFor } from '../engine/telemetry'
import type { FireRuntimeState, SimulationState } from '../engine/types'
import { assetTypeLabel } from '../world/assetTypeLabel'
import type { Asset, Drone } from '../world/types'

export interface AssetPanelProps {
  asset: Asset
  /**
   * The Simulation Clock's current `SimulationState` in full — `fires`
   * finds a Tower's currently-tracked Fire (issue E, moved onto its own
   * `fires` map by issue Q/ADR-0004); `dronePatrol`/`droneActivity`/
   * `elapsedSimSeconds` compute a Drone's or Base Station's rich telemetry
   * (issue G). Kept as one prop (rather than several separate ones) since
   * these fields always travel together as a single simulation snapshot —
   * see `RokuaMap`, this panel's only caller.
   */
  simulationState: SimulationState
  /** The World's full Drone roster — used to resolve which Drones are homed at a Base Station (issue G). */
  drones: readonly Drone[]
  onClose: () => void
}

/**
 * The Fire (if any) `towerId` is currently tracking: a Fire whose
 * `detectedByAssetId` is this Tower's own id (see
 * `FireRuntimeState.detectedByAssetId`, set by `advanceSimulation`'s
 * Fire Detection logic). Undefined if this Tower hasn't Detected a Fire,
 * or if some other asset (a Drone also within range) detected it instead.
 */
function trackedFireFor(towerId: string, fires: Record<string, FireRuntimeState>): FireRuntimeState | undefined {
  return Object.values(fires).find((fire) => fire.detectedByAssetId === towerId)
}

/**
 * Status panel opened by clicking an asset marker: basic identity fields
 * (id, type, position) for every asset kind, plus per-kind rich telemetry
 * (PRD "Asset status panels" Implementation Decision) — a Tower's
 * currently-tracked Fire Event (issue E); a Drone's full state/battery/
 * speed/heading/assigned-Event/endurance telemetry and a Base Station's
 * docked/deployed Drone counts and operational status (issue G). A Drone's
 * card additionally shows its `imageUrl` photo and its `model`/`payload`
 * identity fields (issue I), read straight off the `Drone` object rather
 * than `droneTelemetryFor` since they're static identity, not simulation
 * telemetry (issue J). "Assigned Event"/"Assigned Fire" are mutually
 * exclusive (issue U: a Drone investigating a Fire has `assignedFireId`
 * set and `assignedEventId` undefined, and vice versa — see
 * `DroneTelemetry`'s doc comment); "Assigned Fire" additionally shows the
 * `missionKind` ("Round Trip"/"One-Way") inline so this panel answers "is
 * this Drone expected back?" at a glance. Callers
 * are responsible for passing a fresh `simulationState` on every render
 * (see `RokuaMap`) — that's what makes the Drone/Base Station fields
 * "live-update while the clock runs" rather than freezing at whatever they
 * were when the panel was opened.
 */
export function AssetPanel({ asset, simulationState, drones, onClose }: AssetPanelProps) {
  const { fires, dronePatrol, droneActivity, elapsedSimSeconds } = simulationState
  const typeLabel = assetTypeLabel(asset.type)
  const trackedFire = asset.type === 'Tower' ? trackedFireFor(asset.id, fires) : undefined

  const isDrone = asset.type === 'Quadrocopter' || asset.type === 'FixedWingDrone'
  const patrol = isDrone ? dronePatrol[asset.id] : undefined
  const activity = isDrone ? droneActivity[asset.id] : undefined
  const droneTelemetry =
    patrol && activity
      ? droneTelemetryFor(patrol, activity, elapsedSimSeconds, (asset as Drone).maxEnduranceSimSeconds)
      : undefined

  const baseStationCounts = asset.type === 'BaseStation' ? baseStationCountsFor(asset.id, drones, droneActivity) : undefined

  return (
    <div className="asset-panel" role="dialog" aria-label={`${typeLabel} ${asset.id} status`}>
      {isDrone && <img className="asset-panel-photo" src={(asset as Drone).imageUrl} alt={(asset as Drone).model} />}
      <button type="button" className="asset-panel-close" onClick={onClose} aria-label="Close">
        &times;
      </button>
      <h2 className="asset-panel-title">{asset.id}</h2>
      <dl className="asset-panel-fields">
        <dt>Type</dt>
        <dd>{typeLabel}</dd>
        <dt>Position</dt>
        <dd>
          {asset.position.lat.toFixed(4)}, {asset.position.lng.toFixed(4)}
        </dd>
        {isDrone && (
          <>
            <dt>Model</dt>
            <dd>{(asset as Drone).model}</dd>
            <dt>Payload</dt>
            <dd>{(asset as Drone).payload}</dd>
          </>
        )}
        {asset.type === 'Tower' && (
          <>
            <dt>Tracking</dt>
            <dd>{trackedFire ? `Fire ${trackedFire.id}` : 'No Fire detected'}</dd>
          </>
        )}
        {droneTelemetry && (
          <>
            <dt>State</dt>
            <dd>{droneTelemetryStateLabel(droneTelemetry.state)}</dd>
            <dt>Battery</dt>
            <dd>{formatBatteryPercent(droneTelemetry.batteryPercent)}</dd>
            <dt>Speed</dt>
            <dd>{formatSpeedMetersPerSecond(droneTelemetry.speedMetersPerSecond)}</dd>
            <dt>Heading</dt>
            <dd>{formatHeadingDegrees(droneTelemetry.headingDegrees)}</dd>
            <dt>Assigned Event</dt>
            <dd>{droneTelemetry.assignedEventId ?? 'None'}</dd>
            {droneTelemetry.assignedFireId !== undefined && droneTelemetry.missionKind !== undefined && (
              <>
                <dt>Assigned Fire</dt>
                <dd>
                  {droneTelemetry.assignedFireId} ({fireMissionKindLabel(droneTelemetry.missionKind)})
                </dd>
              </>
            )}
            <dt>Flight Endurance Remaining</dt>
            <dd>{formatRemainingEndurance(droneTelemetry.remainingEnduranceSimSeconds)}</dd>
          </>
        )}
        {baseStationCounts && (
          <>
            <dt>Docked Drones</dt>
            <dd>{baseStationCounts.docked}</dd>
            <dt>Deployed Drones</dt>
            <dd>{baseStationCounts.deployed}</dd>
            <dt>Operational Status</dt>
            <dd>Operational</dd>
          </>
        )}
      </dl>
    </div>
  )
}
