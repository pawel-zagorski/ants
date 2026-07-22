import { Polygon } from 'react-leaflet'
import { fireFootprintHexCells } from '../engine/growthEllipse'
import { hexCornersLatLng } from './hexGrid'
import type { FireRuntimeState } from '../engine/types'
import type { Wind } from '../scenario/types'

export interface FireFootprintLayerProps {
  fires: Record<string, FireRuntimeState>
  wind: Wind
  elapsedSimSeconds: number
  /**
   * Ground Truth View toggle (see `CONTEXT.md`): the real Fire Footprint
   * (as opposed to the Uncertainty Ellipse/Confirmed Shape a later issue
   * renders in the default view per Fire tier) is only ever shown here —
   * this layer renders nothing at all while disabled, so the default view
   * is byte-for-byte unaffected by this slice (issue R's acceptance
   * criteria).
   */
  groundTruthViewEnabled: boolean
}

/** Red, low-opacity hex tiles — visually distinct from every other overlay's color in this file's siblings (`ReturnEnvelope`'s amber, `EventMarkers`'/`FireMarkers`' icon colors). */
const FIRE_FOOTPRINT_PATH_OPTIONS = {
  weight: 1,
  color: '#991b1b',
  fillColor: '#991b1b',
  fillOpacity: 0.35,
}

/**
 * Renders every currently-spawned Fire's real, live Fire Footprint
 * (`CONTEXT.md`) as a mosaic of hex-tile polygons — the Growth Ellipse
 * model's (`engine/growthEllipse.ts`) visual output, geo-referenced via
 * `hexCornersLatLng`. Ground-Truth-only per this component's own
 * `groundTruthViewEnabled` gate (see its doc comment); the default
 * (fog-of-war) view keeps showing only `FireMarkers`' plain marker/tier
 * icon, unchanged by this slice — a later issue (S) adds the Uncertainty
 * Ellipse/Confirmed Shape default-view treatments on top of that marker,
 * not this layer.
 */
export function FireFootprintLayer({ fires, wind, elapsedSimSeconds, groundTruthViewEnabled }: FireFootprintLayerProps) {
  if (!groundTruthViewEnabled) return null

  return (
    <>
      {Object.values(fires).flatMap((fire) => {
        const elapsedSecondsSinceIgnition = elapsedSimSeconds - fire.spawnAtSimSeconds
        const cells = fireFootprintHexCells(elapsedSecondsSinceIgnition, wind)

        return cells.map((hex) => (
          <Polygon
            key={`${fire.id}-${hex.q}-${hex.r}`}
            className="fire-footprint-hex"
            positions={hexCornersLatLng(fire.position, hex).map((point) => [point.lat, point.lng])}
            {...FIRE_FOOTPRINT_PATH_OPTIONS}
          />
        ))
      })}
    </>
  )
}
