import { Polygon } from 'react-leaflet'
import { returnEnvelopeEllipseRing } from './geo'
import { uncertaintyEllipseRadiusMetersForClearcut } from '../engine/uncertaintyEllipse'
import type { ClearcutRuntimeState } from '../engine/types'

export interface ClearcutEstimateLayerProps {
  clearcuts: Record<string, ClearcutRuntimeState>
  /**
   * Ground Truth View toggle (see `CONTEXT.md`): this layer is the
   * default-view counterpart to `ClearcutFootprintLayer` and is gated the
   * opposite way — it renders nothing while Ground Truth View is *enabled*,
   * so the real static Clearcut Footprint that layer shows stays unaffected
   * by this one (mirrors `UncertaintyEllipseLayer` vs. `FireFootprintLayer`).
   */
  groundTruthViewEnabled: boolean
}

/** Violet, dashed — the same "uncertain estimate" treatment `UncertaintyEllipseLayer` uses for a Tower-Detected Fire. */
const CLEARCUT_ESTIMATE_PATH_OPTIONS = {
  weight: 2,
  color: '#7c3aed',
  dashArray: '4 6',
  fillColor: '#7c3aed',
  fillOpacity: 0.2,
}

/**
 * Renders the reused Uncertainty Ellipse estimate (`CONTEXT.md`'s updated
 * entry, ADR-0009) for every currently-spawned, `detected`-but-not-yet-
 * `investigated` Clearcut — the default (fog-of-war) view's stand-in for
 * the real static Clearcut Footprint that `ClearcutFootprintLayer` renders
 * only in Ground Truth View. The Clearcut sibling of
 * `UncertaintyEllipseLayer`, drawn as a simple circle by reusing `geo.ts`'s
 * Return-Envelope ellipse geometry with both foci pinned to the Clearcut's
 * centroid (zero focal separation => a true circle). Size comes from
 * `uncertaintyEllipseRadiusMetersForClearcut`: sized by the detecting
 * Drone's distance at Detection **only**, with the time-growth term zeroed
 * (a Clearcut never spreads), so the estimate is a fixed blur that does not
 * grow while uninvestigated. Clearcuts at any other tier render nothing
 * here — an `'undetected'` one is invisible per the fog-of-war rule, and
 * `'investigated'` is issue Y's Confirmed Shape treatment, not this one.
 */
export function ClearcutEstimateLayer({ clearcuts, groundTruthViewEnabled }: ClearcutEstimateLayerProps) {
  if (groundTruthViewEnabled) return null

  return (
    <>
      {Object.values(clearcuts).flatMap((clearcut) => {
        if (clearcut.tier !== 'detected') return []

        const radiusMeters = uncertaintyEllipseRadiusMetersForClearcut(clearcut)
        const ring = returnEnvelopeEllipseRing(clearcut.position, clearcut.position, radiusMeters * 2)
        if (!ring) return []

        return [
          <Polygon
            key={clearcut.id}
            className="clearcut-estimate-ellipse"
            positions={ring.map((point) => [point.lat, point.lng])}
            {...CLEARCUT_ESTIMATE_PATH_OPTIONS}
          />,
        ]
      })}
    </>
  )
}
