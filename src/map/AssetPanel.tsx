import { assetTypeLabel } from '../world/assetTypeLabel'
import type { Asset } from '../world/types'

export interface AssetPanelProps {
  asset: Asset
  onClose: () => void
}

/**
 * Status panel opened by clicking an asset marker. This slice only shows
 * basic identity fields (id, type, position) — there's no simulation engine
 * running yet, so richer telemetry (battery, state, assigned Event, etc.)
 * lands in later slices.
 */
export function AssetPanel({ asset, onClose }: AssetPanelProps) {
  const typeLabel = assetTypeLabel(asset.type)

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
      </dl>
    </div>
  )
}
