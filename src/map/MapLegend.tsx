/**
 * Always-visible map legend (bottom-right corner) explaining the one overlay
 * whose meaning isn't self-evident from the marker itself: the amber, dashed
 * Return Envelope ellipses (issue K, `ReturnEnvelope.tsx`). Styled to mirror
 * the other floating control panels (`.simulation-clock-panel` et al. — white
 * card, rounded corners, drop shadow), and positioned bottom-right so it
 * clears the bottom-left `.bottom-controls` cluster.
 *
 * The swatch deliberately reuses the exact amber/dashed look of
 * `RETURN_ENVELOPE_PATH_OPTIONS` so the legend reads as the same thing drawn
 * on the map. Wording follows `CONTEXT.md`'s ubiquitous language — "Return
 * Envelope" and "endurance", not the "bingo fuel"/"fuel range" terms
 * CONTEXT's Return Envelope/Bingo Range entries explicitly say to avoid
 * (Drones run on energy/battery, not fuel). The Envelope only renders while a
 * Drone's status panel is open, which the description calls out so its
 * absence isn't read as a bug.
 */
export function MapLegend() {
  return (
    <div className="map-legend" role="group" aria-label="Map legend">
      <div className="map-legend-row">
        <span className="map-legend-swatch map-legend-swatch-return-envelope" aria-hidden="true" />
        <div className="map-legend-text">
          <span className="map-legend-label">Return Envelope</span>
          <span className="map-legend-description">
            Everywhere the selected Drone can still reach and get back to a Base Station on its
            remaining endurance. Shown while a Drone's status panel is open.
          </span>
        </div>
      </div>
    </div>
  )
}
