import { describe, expect, it } from 'vitest'
import {
  UNCERTAINTY_ELLIPSE_BASE_RADIUS_METERS,
  uncertaintyEllipseRadiusMeters,
  uncertaintyEllipseRadiusMetersForFire,
} from './uncertaintyEllipse'
import type { FireRuntimeState } from './types'
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
