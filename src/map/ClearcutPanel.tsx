import { clearcutTierLabel } from './assetPanelFormatting'
import { withBase } from '../basePath'
import { formatScenarioDateTime, pad2 } from '../engine/scenarioEpoch'
import type { ClearcutRuntimeState } from '../engine/types'

/** The fixed display label for a Clearcut's `Type` field (`CONTEXT.md`'s Clearcut entry). */
export const CLEARCUT_TYPE_LABEL = 'Illegal Deforestation'

export interface ClearcutPanelProps {
  clearcut: ClearcutRuntimeState
  /**
   * The current Scenario's Epoch (`CONTEXT.md`) — see `startDateTimeIso` on
   * `Scenario` — used to render `detectedAtSimSeconds` as a real calendar
   * date/time (issue N) rather than raw elapsed seconds. Optional, with the
   * same raw "T+MM:SS" fallback `FirePanel` uses when absent.
   */
  startDateTimeIso?: string
  onClose: () => void
}

/**
 * Renders `detectedAtSimSeconds` as a calendar date/time via the Scenario
 * Epoch when `startDateTimeIso` is available, else a raw "T+MM:SS" fallback
 * — the same tiny per-panel formatter `FirePanel` owns (deliberately not
 * shared, matching this codebase's "each panel owns its own formatter"
 * precedent).
 */
function formatDetectedAt(detectedAtSimSeconds: number, startDateTimeIso: string | undefined): string {
  if (startDateTimeIso) return formatScenarioDateTime(startDateTimeIso, detectedAtSimSeconds)

  const totalSeconds = Math.floor(detectedAtSimSeconds)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `T+${pad2(minutes)}:${pad2(seconds)}`
}

/**
 * Read-only status panel opened by clicking a clickable (non-`'undetected'`)
 * Clearcut marker (issue X) — the Clearcut sibling of `FirePanel`, mirroring
 * its open/close pattern exactly (same `.asset-panel`/`role="dialog"`
 * convention, `logging.jpg` banner in place of `wildfire.jpeg`). Shows the
 * Clearcut's Type ("Illegal Deforestation"), Detection Status (which Drone
 * detected it, and when — as a Scenario-Epoch calendar date/time), and
 * current tier. Deliberately has **no dispatch UI** in this slice — the
 * Bingo-Range "Send" list is issue Y's addition, not this foundational one.
 */
export function ClearcutPanel({ clearcut, startDateTimeIso, onClose }: ClearcutPanelProps) {
  return (
    <div className="asset-panel clearcut-panel" role="dialog" aria-label={`Clearcut ${clearcut.id} status`}>
      <img className="asset-panel-photo" src={withBase('/img/logging.jpg')} alt="Illegal Deforestation" />
      <button type="button" className="asset-panel-close" onClick={onClose} aria-label="Close">
        &times;
      </button>
      <h2 className="asset-panel-title">{clearcut.id}</h2>
      <dl className="asset-panel-fields">
        <dt>Type</dt>
        <dd>{CLEARCUT_TYPE_LABEL}</dd>
        <dt>Detected By</dt>
        <dd>{clearcut.detectedByAssetId ?? 'Unknown'}</dd>
        <dt>Detected At</dt>
        <dd>
          {clearcut.detectedAtSimSeconds !== undefined
            ? formatDetectedAt(clearcut.detectedAtSimSeconds, startDateTimeIso)
            : 'Unknown'}
        </dd>
        <dt>Tier</dt>
        <dd>{clearcutTierLabel(clearcut.tier)}</dd>
      </dl>
    </div>
  )
}
