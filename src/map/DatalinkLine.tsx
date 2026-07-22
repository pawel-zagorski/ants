import { Polyline } from 'react-leaflet'
import type { Drone, Relay } from '../world/types'

export interface DatalinkLineProps {
  drone: Drone
  relay: Relay
  /**
   * The Drone's live straight-line distance to `relay` — compared against
   * `drone.datalinkRangeMeters` (issue M) to decide between the normal
   * animated-dashed state and the solid red out-of-range state.
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
 *
 * Issue M: once `distanceMeters` exceeds `drone.datalinkRangeMeters`, the
 * line switches to `.datalink-line-out-of-range` instead of `.datalink-line`
 * — solid (no dash array) red, with the marching-ants `animation` not
 * applied at all (an out-of-range line never carries the `.datalink-line`
 * class, so it can't inherit the keyframe by accident). `color` is also
 * passed as a direct `Polyline` prop rather than relying on the CSS class
 * for the red stroke: Leaflet's SVG renderer writes `color`/`weight`/
 * `dashArray` straight onto the rendered `<path>` as presentation
 * attributes in `Path._updateStyle`, independent of the `pathOptions`
 * class-application caveat noted above for `className`.
 */
export function DatalinkLine({ drone, relay, distanceMeters }: DatalinkLineProps) {
  const inRange = distanceMeters <= drone.datalinkRangeMeters
  const className = inRange
    ? `datalink-line datalink-line-drone-${drone.id} datalink-line-relay-${relay.id}`
    : `datalink-line-out-of-range datalink-line-drone-${drone.id} datalink-line-relay-${relay.id}`

  return (
    <Polyline
      positions={[
        [drone.position.lat, drone.position.lng],
        [relay.position.lat, relay.position.lng],
      ]}
      className={className}
      weight={2}
      color={inRange ? '#2563eb' : '#dc2626'}
      opacity={0.85}
    />
  )
}
