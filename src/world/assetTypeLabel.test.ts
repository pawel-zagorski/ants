import { describe, expect, it } from 'vitest'
import { assetTypeLabel } from './assetTypeLabel'

describe('assetTypeLabel', () => {
  it('renders every asset type using the exact CONTEXT.md vocabulary', () => {
    expect(assetTypeLabel('Tower')).toBe('Tower')
    expect(assetTypeLabel('BaseStation')).toBe('Base Station')
    expect(assetTypeLabel('Quadrocopter')).toBe('Quadrocopter')
    expect(assetTypeLabel('FixedWingDrone')).toBe('Fixed-Wing Drone')
  })
})
