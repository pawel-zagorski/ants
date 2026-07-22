import { offsetLatLng } from './geo'
import { HEX_CELL_SIZE_METERS, hexCentroidOffsetMeters } from '../engine/growthEllipse'
import type { LatLng } from './geo'
import type { HexCoordinate } from '../engine/growthEllipse'

/**
 * The 6 corner points of pointy-top hex cell `hex`, geo-referenced against
 * `ignitionPoint` (the Fire's local grid origin — `CONTEXT.md`'s Fire
 * Footprint entry), as a *closed* ring (the first corner repeated as the
 * last) ready to hand straight to a Leaflet `Polygon`'s `positions` prop —
 * same closed-ring convention as `geo.ts`'s `returnEnvelopeEllipseRing`.
 * Corner `i` sits at angle `60 * i - 30` degrees from the cell's centroid
 * (measured same as `pointOnCircle`: 0 = due east, increasing
 * counter-clockwise) — the standard pointy-top vertex layout, whose two
 * vertices at 90/270deg are due north/south of the centroid, giving the
 * hex a "pointy" top and bottom rather than a flat one.
 */
export function hexCornersLatLng(ignitionPoint: LatLng, hex: HexCoordinate): LatLng[] {
  const { eastMeters: centroidEastMeters, northMeters: centroidNorthMeters } = hexCentroidOffsetMeters(hex)

  const corners: LatLng[] = []
  for (let cornerIndex = 0; cornerIndex < 6; cornerIndex += 1) {
    const cornerAngleRadians = ((60 * cornerIndex - 30) * Math.PI) / 180
    const cornerEastMeters = centroidEastMeters + HEX_CELL_SIZE_METERS * Math.cos(cornerAngleRadians)
    const cornerNorthMeters = centroidNorthMeters + HEX_CELL_SIZE_METERS * Math.sin(cornerAngleRadians)
    corners.push(offsetLatLng(ignitionPoint, cornerEastMeters, cornerNorthMeters))
  }
  corners.push(corners[0])

  return corners
}
