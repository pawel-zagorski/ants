import { Polygon } from 'react-leaflet'
import { clearcutFootprintHexCells } from '../engine/clearcutFootprint'
import { hexCornersLatLng } from './hexGrid'
import type { ClearcutRuntimeState } from '../engine/types'

export interface ClearcutFootprintLayerProps {
  clearcuts: Record<string, ClearcutRuntimeState>
  /**
   * Ground Truth View toggle (see `CONTEXT.md`): the real, static Clearcut
   * Footprint (as opposed to the Uncertainty Ellipse estimate a `detected`
   * Clearcut shows in the default view) is only ever shown here — this layer
   * renders nothing at all while disabled, so the default view is unaffected
   * (mirrors `FireFootprintLayer`). Still-`'undetected'` Clearcuts are shown
   * faded here (a lower fill opacity), per issue X's "show still-undetected
   * clearcuts faded" acceptance criterion.
   */
  groundTruthViewEnabled: boolean
}

/** Red, low-opacity hex tiles — the Clearcut sibling of `FireFootprintLayer`'s red footprint (a slightly different red to read as deforestation, not fire). */
const CLEARCUT_FOOTPRINT_PATH_OPTIONS = {
  weight: 1,
  color: '#b91c1c',
  fillColor: '#b91c1c',
}

/** An undetected Clearcut's footprint is drawn fainter than a detected one (Ground Truth View only). */
const DETECTED_FILL_OPACITY = 0.4
const UNDETECTED_FILL_OPACITY = 0.15

/**
 * Renders every currently-spawned Clearcut's real, *static* Clearcut
 * Footprint (`CONTEXT.md`) as a mosaic of hex-tile polygons — the
 * Clearcut-domain sibling of `FireFootprintLayer` (ADR-0009). Uses
 * `clearcutFootprintHexCells` (a pure function of the footprint's fixed
 * size/orientation, with no time/wind term), geo-referenced via the same
 * `hexCornersLatLng` a Fire Footprint uses. Ground-Truth-only per this
 * component's own `groundTruthViewEnabled` gate; still-`'undetected'`
 * Clearcuts render faded so the demo can contrast "what's really there"
 * against the fog-of-war picture.
 */
export function ClearcutFootprintLayer({ clearcuts, groundTruthViewEnabled }: ClearcutFootprintLayerProps) {
  if (!groundTruthViewEnabled) return null

  return (
    <>
      {Object.values(clearcuts).flatMap((clearcut) => {
        const cells = clearcutFootprintHexCells({
          semiMajorAxisMeters: clearcut.semiMajorAxisMeters,
          semiMinorAxisMeters: clearcut.semiMinorAxisMeters,
          orientationDegrees: clearcut.orientationDegrees,
        })
        const fillOpacity = clearcut.tier === 'undetected' ? UNDETECTED_FILL_OPACITY : DETECTED_FILL_OPACITY

        return cells.map((hex) => (
          <Polygon
            key={`${clearcut.id}-${hex.q}-${hex.r}`}
            className="clearcut-footprint-hex"
            positions={hexCornersLatLng(clearcut.position, hex).map((point) => [point.lat, point.lng])}
            {...CLEARCUT_FOOTPRINT_PATH_OPTIONS}
            fillOpacity={fillOpacity}
          />
        ))
      })}
    </>
  )
}
