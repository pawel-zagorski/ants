import { fireTierLabel } from './assetPanelFormatting'
import { formatScenarioDateTime, pad2 } from '../engine/scenarioEpoch'
import type { FireRuntimeState } from '../engine/types'

export interface FirePanelProps {
  fire: FireRuntimeState
  /**
   * The current Scenario's Epoch (`CONTEXT.md`) — see `startDateTimeIso` on
   * `Scenario` — used to render `detectedAtSimSeconds` as a real calendar
   * date/time (issue N) rather than raw elapsed seconds. Optional to match
   * `Scenario.startDateTimeIso` itself; falls back to a raw "T+MM:SS"
   * display (see {@link formatDetectedAt}) when absent, mirroring
   * `SimulationClockPanel`'s own fallback for the same reason — only
   * reachable for a hand-built `Scenario` fixture missing its Epoch, since
   * every real, loaded Scenario has one.
   */
  startDateTimeIso?: string
  onClose: () => void
}

/**
 * Renders `detectedAtSimSeconds` as a calendar date/time via the Scenario
 * Epoch when `startDateTimeIso` is available, else the same raw "T+MM:SS"
 * fallback `SimulationClockPanel.tsx`'s own (private) `formatElapsedSimTime`
 * uses. Deliberately not shared with `EventPanel`'s own private
 * `formatDetectedAt` (same rationale as that function's doc comment): each
 * panel owns its own tiny formatter rather than a premature shared helper.
 */
function formatDetectedAt(detectedAtSimSeconds: number, startDateTimeIso: string | undefined): string {
  if (startDateTimeIso) return formatScenarioDateTime(startDateTimeIso, detectedAtSimSeconds)

  const totalSeconds = Math.floor(detectedAtSimSeconds)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `T+${pad2(minutes)}:${pad2(seconds)}`
}

/**
 * Status panel opened by clicking a clickable (non-`'undetected'`) Fire
 * marker (issue T) — mirrors `EventPanel`'s open/close pattern exactly (same
 * `.asset-panel`/`role="dialog"` convention, close-button placement), but
 * for a Fire's Detection Status rather than an Event's. Shows the detecting
 * Tower's id (`detectedByAssetId`) and when it detected the Fire
 * (`detectedAtSimSeconds`, converted to a calendar date/time via the
 * Scenario Epoch — see {@link formatDetectedAt}), plus the Fire's current
 * `tier`. Read-only: no dispatch/"Send" UI here yet — that's issue U, built
 * directly on top of this panel.
 */
export function FirePanel({ fire, startDateTimeIso, onClose }: FirePanelProps) {
  return (
    <div className="asset-panel fire-panel" role="dialog" aria-label={`Fire ${fire.id} status`}>
      <button type="button" className="asset-panel-close" onClick={onClose} aria-label="Close">
        &times;
      </button>
      <h2 className="asset-panel-title">{fire.id}</h2>
      <dl className="asset-panel-fields">
        <dt>Tier</dt>
        <dd>{fireTierLabel(fire.tier)}</dd>
        <dt>Detected By</dt>
        <dd>{fire.detectedByAssetId ?? 'Unknown'}</dd>
        <dt>Detected At</dt>
        <dd>
          {fire.detectedAtSimSeconds !== undefined
            ? formatDetectedAt(fire.detectedAtSimSeconds, startDateTimeIso)
            : 'Unknown'}
        </dd>
      </dl>
    </div>
  )
}
