import type { Wind } from '../scenario/types'

export interface WindIndicatorProps {
  wind: Wind
}

/**
 * Small, always-visible compass/arrow indicator (see `CONTEXT.md`'s "Wind"
 * entry) — same UI weight/placement as `GroundTruthToggle`, showing the
 * loaded Scenario's fixed wind direction and speed.
 *
 * `wind.directionDegrees` is the direction the wind is blowing FROM
 * (meteorological convention — see `Wind` in `../scenario/types`), so the
 * arrow glyph (which points up/north at a 0deg rotation) is rotated by
 * `directionDegrees + 180` to instead point in the direction the wind is
 * actually blowing TOWARD — the reading a compass arrow is expected to
 * give at a glance.
 */
export function WindIndicator({ wind }: WindIndicatorProps) {
  const arrowRotationDegrees = (wind.directionDegrees + 180) % 360

  return (
    <div
      className="wind-indicator"
      title={`Wind from ${wind.directionDegrees}\u00b0 at ${wind.speedMetersPerSecond} m/s`}
    >
      <span className="wind-indicator-arrow" style={{ transform: `rotate(${arrowRotationDegrees}deg)` }}>
        &#8593;
      </span>
      <span className="wind-indicator-label">{wind.speedMetersPerSecond} m/s</span>
    </div>
  )
}
