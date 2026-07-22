import { Polygon } from 'react-leaflet'
import { hexCornersLatLng } from './hexGrid'
import type { FireRuntimeState } from '../engine/types'

export interface ConfirmedShapeLayerProps {
  fires: Record<string, FireRuntimeState>
  /**
   * Ground Truth View toggle (see `CONTEXT.md`): this layer is the
   * default-view, `'investigated'`-tier sibling of `UncertaintyEllipseLayer`
   * (`'towerDetected'`-tier) — it renders nothing at all while Ground Truth
   * View is *enabled*, since Ground Truth View shows the real live Fire
   * Footprint via `FireFootprintLayer` regardless of tier, unaffected by
   * this one.
   */
  groundTruthViewEnabled: boolean
}

/** Amber-orange, higher-opacity than `FireFootprintLayer`'s red — reads as "confirmed" rather than "raw ground truth" or "uncertain" (`UncertaintyEllipseLayer`'s violet). */
const CONFIRMED_SHAPE_PATH_OPTIONS = {
  weight: 1,
  color: '#c2410c',
  fillColor: '#c2410c',
  fillOpacity: 0.35,
}

/**
 * Renders the Confirmed Shape (`CONTEXT.md`, issue V) for every
 * currently-spawned, Investigated Fire (`tier === 'investigated'`) — the
 * default (fog-of-war) view's stand-in for the real Fire Footprint
 * `FireFootprintLayer` renders only in Ground Truth View, and the
 * `'investigated'`-tier sibling of `UncertaintyEllipseLayer`'s
 * `'towerDetected'`-tier ellipse (the two are mutually exclusive by tier,
 * so a Fire is only ever covered by one of them at a time). Reads
 * `fire.confirmedFootprintHexCells` directly rather than recomputing the
 * live footprint itself — `advanceSimulation.ts` is solely responsible for
 * deciding whether those cells are still being updated (a Drone is
 * actively orbiting) or sit frozen as a stale snapshot (every orbiting
 * Drone has left); this layer just draws whatever it's given, same
 * `hexCornersLatLng` polygon geometry as `FireFootprintLayer`. Fires at any
 * other tier, or an `'investigated'` Fire that defensively has no cells
 * recorded yet, render nothing here.
 */
export function ConfirmedShapeLayer({ fires, groundTruthViewEnabled }: ConfirmedShapeLayerProps) {
  if (groundTruthViewEnabled) return null

  return (
    <>
      {Object.values(fires).flatMap((fire) => {
        if (fire.tier !== 'investigated' || !fire.confirmedFootprintHexCells) return []

        return fire.confirmedFootprintHexCells.map((hex) => (
          <Polygon
            key={`${fire.id}-${hex.q}-${hex.r}`}
            className="confirmed-shape-hex"
            positions={hexCornersLatLng(fire.position, hex).map((point) => [point.lat, point.lng])}
            {...CONFIRMED_SHAPE_PATH_OPTIONS}
          />
        ))
      })}
    </>
  )
}
