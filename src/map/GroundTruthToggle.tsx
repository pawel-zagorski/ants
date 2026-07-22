export interface GroundTruthToggleProps {
  enabled: boolean
  onChange: (enabled: boolean) => void
}

/**
 * The Ground Truth View toggle (see `CONTEXT.md`): lets the operator reveal
 * Undetected Events (faded/dashed) in addition to whatever's Detected. Off
 * by default everywhere it's mounted — the "fog of war" default lives in
 * the caller's initial state, not here.
 */
export function GroundTruthToggle({ enabled, onChange }: GroundTruthToggleProps) {
  return (
    <label className="ground-truth-toggle">
      <input
        type="checkbox"
        checked={enabled}
        onChange={(changeEvent) => onChange(changeEvent.target.checked)}
      />
      Ground Truth View
    </label>
  )
}
