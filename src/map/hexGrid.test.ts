import { describe, expect, it } from 'vitest'
import { hexCornersLatLng } from './hexGrid'
import { HEX_CELL_SIZE_METERS } from '../engine/growthEllipse'
import { haversineDistanceMeters } from '../test/haversineDistanceMeters'
import type { LatLng } from './geo'

const IGNITION_POINT: LatLng = { lat: 64.6, lng: 26.4 }

describe('hexCornersLatLng', () => {
  it('returns a closed ring (first corner repeated as the last)', () => {
    const corners = hexCornersLatLng(IGNITION_POINT, { q: 0, r: 0 })

    expect(corners).toHaveLength(7)
    expect(corners[0]).toEqual(corners[6])
  })

  it('places every corner of the origin cell exactly HEX_CELL_SIZE_METERS from the ignition point', () => {
    const corners = hexCornersLatLng(IGNITION_POINT, { q: 0, r: 0 })

    for (const corner of corners.slice(0, 6)) {
      expect(haversineDistanceMeters(IGNITION_POINT, corner)).toBeCloseTo(HEX_CELL_SIZE_METERS, 0)
    }
  })

  it('centers a non-origin cell away from the ignition point', () => {
    const originCorners = hexCornersLatLng(IGNITION_POINT, { q: 0, r: 0 })
    const neighborCorners = hexCornersLatLng(IGNITION_POINT, { q: 1, r: 0 })

    const originCentroidApprox = originCorners[0]
    const neighborCentroidApprox = neighborCorners[0]
    expect(haversineDistanceMeters(originCentroidApprox, neighborCentroidApprox)).toBeGreaterThan(0)
  })

  it('gives adjacent cells (q=0,r=0) and (q=1,r=0) centroids exactly one hex-width apart', () => {
    // Pointy-top axial-to-pixel: stepping q by 1 moves the centroid
    // sqrt(3) * HEX_CELL_SIZE_METERS east (see `growthEllipse.ts`'s
    // `hexCentroidOffsetMeters`) — verify this independently via corner 0
    // (a fixed offset from each cell's own centroid) on both cells.
    const originCorner = hexCornersLatLng(IGNITION_POINT, { q: 0, r: 0 })[0]
    const neighborCorner = hexCornersLatLng(IGNITION_POINT, { q: 1, r: 0 })[0]

    const expectedStepMeters = Math.sqrt(3) * HEX_CELL_SIZE_METERS
    expect(haversineDistanceMeters(originCorner, neighborCorner)).toBeCloseTo(expectedStepMeters, 0)
  })
})
