import { assetTypeLabel } from '../world/assetTypeLabel'
import type { EventRuntimeState } from '../engine/types'
import type { Asset } from '../world/types'

export interface AssetPanelProps {
  asset: Asset
  /** The Simulation Clock's current `SimulationState.events` — used to find a Tower's currently-tracked Fire Event. */
  events: Record<string, EventRuntimeState>
  onClose: () => void
}

/**
 * The Fire Event (if any) `towerId` is currently tracking: a Detected Fire
 * Event whose `detectedByAssetId` is this Tower's own id (see
 * `EventRuntimeState.detectedByAssetId`, set by `advanceSimulation`'s
 * Detection logic). Undefined if this Tower hasn't Detected a Fire Event,
 * or if some other asset (a Drone also within range) detected it instead.
 */
function trackedFireEventFor(towerId: string, events: Record<string, EventRuntimeState>): EventRuntimeState | undefined {
  return Object.values(events).find((event) => event.type === 'Fire' && event.detectedByAssetId === towerId)
}

/**
 * Status panel opened by clicking an asset marker: basic identity fields
 * (id, type, position) for every asset kind, plus — for a Tower only — the
 * Fire Event it's currently tracking (PRD user story 4). Richer telemetry
 * for Drones/Base Stations (battery, state, docked counts, etc.) lands in
 * later slices.
 */
export function AssetPanel({ asset, events, onClose }: AssetPanelProps) {
  const typeLabel = assetTypeLabel(asset.type)
  const trackedFireEvent = asset.type === 'Tower' ? trackedFireEventFor(asset.id, events) : undefined

  return (
    <div className="asset-panel" role="dialog" aria-label={`${typeLabel} ${asset.id} status`}>
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
        {asset.type === 'Tower' && (
          <>
            <dt>Tracking</dt>
            <dd>{trackedFireEvent ? `Fire Event ${trackedFireEvent.id}` : 'No Fire Event detected'}</dd>
          </>
        )}
      </dl>
    </div>
  )
}
