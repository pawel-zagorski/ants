import { Polygon } from 'react-leaflet'
import { hexCornersLatLng } from './hexGrid'
import { clearcutFootprintHexCells } from '../engine/clearcutFootprint'
import type { ClearcutRuntimeState } from '../engine/types'

export interface ClearcutConfirmedShapeLayerProps {
  clearcuts: Record<string, ClearcutRuntimeState>
  /**
   * Ground Truth View toggle (see `CONTEXT.md`): this layer is the
   * default-view, `'investigated'`-tier sibling of `ClearcutEstimateLayer`
   * (`'detected'`-tier) — it renders nothing at all while Ground Truth View
   * is *enabled*, since Ground Truth View shows the real static Clearcut
   * Footprint via `ClearcutFootprintLayer` regardless of tier, unaffected
   * by this one (mirrors `ConfirmedShapeLayer` vs. `FireFootprintLayer`).
   */
  groundTruthViewEnabled: boolean
}

/** Same amber-orange "confirmed" treatment `ConfirmedShapeLayer` uses for an Investigated Fire — a Clearcut's Confirmed Shape reads identically, just permanently so. */
const CONFIRMED_SHAPE_PATH_OPTIONS = {
  weight: 1,
  color: '#c2410c',
  fillColor: '#c2410c',
  fillOpacity: 0.35,
}

/**
 * Renders the Confirmed Shape (`CONTEXT.md`, issue Y) for every currently-
 * spawned, Investigated Clearcut (`tier === 'investigated'`) — the default
 * (fog-of-war) view's stand-in for the real Clearcut Footprint
 * `ClearcutFootprintLayer` renders only in Ground Truth View, and the
 * `'investigated'`-tier sibling of `ClearcutEstimateLayer`'s `'detected'`-
 * tier ellipse (the two are mutually exclusive by tier, so a Clearcut is
 * only ever covered by one of them at a time).
 *
 * Dramatically simpler than `ConfirmedShapeLayer`'s Fire equivalent: rather
 * than reading a separately-tracked, possibly-frozen
 * `confirmedFootprintHexCells` field, this layer re-derives the shape
 * directly from `clearcut`'s own intrinsic, static shape fields
 * (`semiMajorAxisMeters`/`semiMinorAxisMeters`/`orientationDegrees`) via
 * `clearcutFootprint.ts`'s `clearcutFootprintHexCells` — because a Clearcut
 * Footprint never changes, that direct derivation IS the exact, permanent
 * Confirmed Shape by construction, with no live per-tick recompute and no
 * "freeze on departure" snapshot logic needed at all (see
 * `ClearcutTier`'s doc comment in `engine/types.ts`). Clearcuts at any
 * other tier render nothing here — an `'undetected'`/`'detected'` one is
 * either invisible per the fog-of-war rule or covered by
 * `ClearcutEstimateLayer` instead.
 */
export function ClearcutConfirmedShapeLayer({ clearcuts, groundTruthViewEnabled }: ClearcutConfirmedShapeLayerProps) {
  if (groundTruthViewEnabled) return null

  return (
    <>
      {Object.values(clearcuts).flatMap((clearcut) => {
        if (clearcut.tier !== 'investigated') return []

        const hexCells = clearcutFootprintHexCells(clearcut)

        return hexCells.map((hex) => (
          <Polygon
            key={`${clearcut.id}-${hex.q}-${hex.r}`}
            className="confirmed-shape-hex"
            positions={hexCornersLatLng(clearcut.position, hex).map((point) => [point.lat, point.lng])}
            {...CONFIRMED_SHAPE_PATH_OPTIONS}
          />
        ))
      })}
    </>
  )
}
