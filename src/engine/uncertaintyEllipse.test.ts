import { describe, expect, it } from 'vitest'
import {
  UNCERTAINTY_ELLIPSE_BASE_RADIUS_METERS,
  uncertaintyEllipseRadiusMeters,
  uncertaintyEllipseRadiusMetersForClearcut,
  uncertaintyEllipseRadiusMetersForFire,
} from './uncertaintyEllipse'
import type { ClearcutRuntimeState, FireRuntimeState } from './types'
import type { Tower } from '../world/types'

describe('uncertaintyEllipseRadiusMeters', () => {
  it('is exactly the base radius at zero distance and zero elapsed time', () => {
    expect(uncertaintyEllipseRadiusMeters(0, 0)).toBe(UNCERTAINTY_ELLIPSE_BASE_RADIUS_METERS)
  })

  it('grows with detecting-Tower distance, all else equal', () => {
    const near = uncertaintyEllipseRadiusMeters(1000, 300)
    const far = uncertaintyEllipseRadiusMeters(10000, 300)

    expect(far).toBeGreaterThan(near)
  })

  it('grows with elapsed time since Detection, all else equal', () => {
    const early = uncertaintyEllipseRadiusMeters(1000, 60)
    const later = uncertaintyEllipseRadiusMeters(1000, 1200)

    expect(later).toBeGreaterThan(early)
  })

  it('never falls below the base radius for a defensive negative distance or elapsed time', () => {
    expect(uncertaintyEllipseRadiusMeters(-500, -100)).toBe(UNCERTAINTY_ELLIPSE_BASE_RADIUS_METERS)
  })
})

describe('uncertaintyEllipseRadiusMetersForFire', () => {
  const nearTower: Tower = { id: 'tower-near', type: 'Tower', position: { lat: 64.6, lng: 26.4 }, detectionRadiusMeters: 15000 }
  const farTower: Tower = { id: 'tower-far', type: 'Tower', position: { lat: 64.75, lng: 26.4 }, detectionRadiusMeters: 15000 }

  function fireFixture(overrides: Partial<FireRuntimeState> = {}): FireRuntimeState {
    return {
      id: 'fire-1',
      position: { lat: 64.6, lng: 26.4 },
      tier: 'towerDetected',
      spawnAtSimSeconds: 0,
      detectedByAssetId: 'tower-near',
      detectedAtSimSeconds: 0,
      ...overrides,
    }
  }

  it('returns undefined when no Tower matches the Fire\'s detectedByAssetId', () => {
    const fire = fireFixture({ detectedByAssetId: 'tower-unknown' })

    expect(uncertaintyEllipseRadiusMetersForFire(fire, [nearTower, farTower], 0)).toBeUndefined()
  })

  it('gives a larger radius for a Fire detected by a farther Tower, all else equal (two fixture Towers)', () => {
    const fireNearDetection = fireFixture({ position: nearTower.position, detectedByAssetId: 'tower-near' })
    const fireFarDetection = fireFixture({ position: nearTower.position, detectedByAssetId: 'tower-far' })

    const nearRadius = uncertaintyEllipseRadiusMetersForFire(fireNearDetection, [nearTower, farTower], 0)
    const farRadius = uncertaintyEllipseRadiusMetersForFire(fireFarDetection, [nearTower, farTower], 0)

    expect(nearRadius).toBeDefined()
    expect(farRadius).toBeDefined()
    expect(farRadius as number).toBeGreaterThan(nearRadius as number)
  })

  it('gives a larger radius the more simulated time has elapsed since Detection, all else equal', () => {
    const fire = fireFixture({ detectedAtSimSeconds: 100 })

    const earlyRadius = uncertaintyEllipseRadiusMetersForFire(fire, [nearTower, farTower], 200)
    const laterRadius = uncertaintyEllipseRadiusMetersForFire(fire, [nearTower, farTower], 4000)

    expect(earlyRadius).toBeDefined()
    expect(laterRadius).toBeDefined()
    expect(laterRadius as number).toBeGreaterThan(earlyRadius as number)
  })
})

describe('uncertaintyEllipseRadiusMetersForClearcut (ADR-0009: distance-only, time term zeroed)', () => {
  function clearcutFixture(overrides: Partial<ClearcutRuntimeState> = {}): ClearcutRuntimeState {
    return {
      id: 'clearcut-1',
      position: { lat: 64.5, lng: 26.25 },
      tier: 'detected',
      spawnAtSimSeconds: 0,
      semiMajorAxisMeters: 400,
      semiMinorAxisMeters: 120,
      orientationDegrees: 40,
      detectedByAssetId: 'drone-2',
      detectedAtSimSeconds: 0,
      detectedFromDistanceMeters: 800,
      ...overrides,
    }
  }

  it('grows with the detecting-Drone distance captured at Detection, all else equal', () => {
    const near = uncertaintyEllipseRadiusMetersForClearcut(clearcutFixture({ detectedFromDistanceMeters: 200 }))
    const far = uncertaintyEllipseRadiusMetersForClearcut(clearcutFixture({ detectedFromDistanceMeters: 3000 }))

    expect(far).toBeGreaterThan(near)
  })

  it('does NOT depend on elapsed time — the estimate is a fixed blur (the time-growth term is zeroed)', () => {
    // The function takes no elapsed-time argument at all, so the same
    // Clearcut always yields the same radius no matter how long has passed.
    const clearcut = clearcutFixture({ detectedFromDistanceMeters: 800 })
    expect(uncertaintyEllipseRadiusMetersForClearcut(clearcut)).toBe(
      uncertaintyEllipseRadiusMetersForClearcut(clearcut),
    )
  })

  it('is exactly the base radius when the Drone was right on top of the Clearcut at Detection', () => {
    expect(uncertaintyEllipseRadiusMetersForClearcut(clearcutFixture({ detectedFromDistanceMeters: 0 }))).toBe(
      UNCERTAINTY_ELLIPSE_BASE_RADIUS_METERS,
    )
  })

  it('falls back to the base radius when no detecting distance was captured (defensive)', () => {
    expect(
      uncertaintyEllipseRadiusMetersForClearcut(clearcutFixture({ detectedFromDistanceMeters: undefined })),
    ).toBe(UNCERTAINTY_ELLIPSE_BASE_RADIUS_METERS)
  })
})
