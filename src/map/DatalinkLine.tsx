import { Polyline } from 'react-leaflet'
import type { Drone, Relay } from '../world/types'

export interface DatalinkLineProps {
  drone: Drone
  relay: Relay
  /**
   * The Drone's live straight-line distance to `relay` — unused by this
   * issue's always-on marching-ants rendering, but kept as a prop (rather
   * than recomputed here) so issue M's out-of-range visual state can
   * compare it against `drone.datalinkRangeMeters` without changing this
   * component's call site.
   */
  distanceMeters: number
}

/**
 * A single Drone's Datalink line (see `CONTEXT.md`'s **Datalink** entry):
 * an animated, dashed Leaflet `Polyline` from `drone` to its nearest
 * `relay`. The "marching ants" travel-toward-the-Relay effect is plain CSS
 * (`.datalink-line`'s `stroke-dasharray` + `@keyframes` on
 * `stroke-dashoffset` in `index.css`) applied to react-leaflet's
 * SVG-rendered `<path>` — no JS animation loop needed.
 *
 * The `className` is passed as a *direct* `Polyline` prop rather than
 * nested under `pathOptions`: react-leaflet only applies a `className` to
 * the underlying Leaflet `Path` at initial construction (`SVG._initPath`) —
 * `pathOptions` re-styles via `Path.setStyle`, which the Leaflet SVG
 * renderer's `_updateStyle` never uses to (re-)add a CSS class. Verified by
 * inspecting the actual rendered `<path>` element in `DatalinkLine.test.tsx`
 * rather than trusting the prop alone.
 *
 * `positions` is ordered Drone-first, Relay-second, which is what makes a
 * *decreasing* `stroke-dashoffset` keyframe read as travel toward the
 * Relay rather than back toward the Drone. The extra `datalink-line-drone-*`/
 * `datalink-line-relay-*` classes carry no styling — they just make which
 * Drone/Relay a rendered line connects independently verifiable in the DOM
 * (issue L's acceptance criteria; also a plausible hook for issue M).
 */
export function DatalinkLine({ drone, relay }: DatalinkLineProps) {
  return (
    <Polyline
      positions={[
        [drone.position.lat, drone.position.lng],
        [relay.position.lat, relay.position.lng],
      ]}
      className={`datalink-line datalink-line-drone-${drone.id} datalink-line-relay-${relay.id}`}
      weight={2}
      color="#2563eb"
      opacity={0.85}
    />
  )
}
