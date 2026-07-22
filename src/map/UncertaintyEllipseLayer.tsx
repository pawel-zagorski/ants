import { Polygon } from 'react-leaflet'
import { returnEnvelopeEllipseRing } from './geo'
import { uncertaintyEllipseRadiusMetersForFire } from '../engine/uncertaintyEllipse'
import type { FireRuntimeState } from '../engine/types'
import type { Tower } from '../world/types'

export interface UncertaintyEllipseLayerProps {
  fires: Record<string, FireRuntimeState>
  towers: readonly Tower[]
  elapsedSimSeconds: number
  /**
   * Ground Truth View toggle (see `CONTEXT.md`): this layer is the
   * default-view counterpart to `FireFootprintLayer` and is gated the
   * opposite way — it renders nothing at all while Ground Truth View is
   * *enabled*, so the real Fire Footprint that layer shows stays
   * completely unaffected by this one (issue R's acceptance criteria,
   * unchanged by this slice).
   */
  groundTruthViewEnabled: boolean
}

/** Violet, dashed — visually distinct from `FireFootprintLayer`'s dark red and `ReturnEnvelope`'s amber, signaling "uncertain" rather than "confirmed real" or "reachable". */
const UNCERTAINTY_ELLIPSE_PATH_OPTIONS = {
  weight: 2,
  color: '#7c3aed',
  dashArray: '4 6',
  fillColor: '#7c3aed',
  fillOpacity: 0.2,
}

/**
 * Renders the Uncertainty Ellipse (`CONTEXT.md`, issue S) for every
 * currently-spawned, Tower-Detected-but-not-yet-Investigated Fire
 * (`tier === 'towerDetected'`) — the default (fog-of-war) view's stand-in
 * for the real Fire Footprint `FireFootprintLayer` renders only in Ground
 * Truth View. Size comes from `uncertaintyEllipseRadiusMetersForFire`
 * (`engine/uncertaintyEllipse.ts`): larger the farther the detecting Tower
 * is from the Fire, and larger the longer it's gone uninvestigated. Drawn
 * as a simple circle — reusing `geo.ts`'s existing Return-Envelope ellipse
 * geometry (issue K) with both foci pinned to the Fire's own position, so
 * the focal separation is zero and the "ellipse" degenerates to a true
 * circle of that radius — rather than writing new ellipse math, since
 * Tower-detection uncertainty is radial, not wind-directional like the
 * real Growth Ellipse (see that engine module's doc comments for the
 * reasoning). Fires at any other tier (`'undetected'`, `'investigated'`)
 * render nothing here — an `'undetected'` Fire is invisible per the
 * fog-of-war rule, and `'investigated'` is a later issue's Confirmed
 * Shape treatment, not this one.
 */
export function UncertaintyEllipseLayer({ fires, towers, elapsedSimSeconds, groundTruthViewEnabled }: UncertaintyEllipseLayerProps) {
  if (groundTruthViewEnabled) return null

  return (
    <>
      {Object.values(fires).flatMap((fire) => {
        if (fire.tier !== 'towerDetected') return []

        const radiusMeters = uncertaintyEllipseRadiusMetersForFire(fire, towers, elapsedSimSeconds)
        if (radiusMeters === undefined) return []

        const ring = returnEnvelopeEllipseRing(fire.position, fire.position, radiusMeters * 2)
        if (!ring) return []

        return [
          <Polygon
            key={fire.id}
            className="uncertainty-ellipse"
            positions={ring.map((point) => [point.lat, point.lng])}
            {...UNCERTAINTY_ELLIPSE_PATH_OPTIONS}
          />,
        ]
      })}
    </>
  )
}
