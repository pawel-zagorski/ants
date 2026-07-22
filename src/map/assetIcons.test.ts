import { describe, expect, it } from 'vitest'
import { iconForAssetType } from './assetIcons'

/** Extracts the `divIcon`'s HTML string, whatever its runtime shape. */
function iconHtml(html: ReturnType<typeof iconForAssetType>['options']['html']): string {
  return typeof html === 'string' ? html : ''
}

describe('iconForAssetType', () => {
  it("renders a Tower as the rook shape with a 'T' letter (not the old triangle)", () => {
    const html = iconHtml(iconForAssetType('Tower').options.html)

    expect(html).toContain('asset-icon-tower-rook')
    expect(html).not.toContain('asset-icon-triangle')
    expect(html).toContain('>T<')
  })

  it('keeps each other asset kind on its own distinct shape/letter', () => {
    expect(iconHtml(iconForAssetType('BaseStation').options.html)).toContain('asset-icon-square')
    expect(iconHtml(iconForAssetType('BaseStation').options.html)).toContain('>B<')
    expect(iconHtml(iconForAssetType('Quadrocopter').options.html)).toContain('asset-icon-circle')
    expect(iconHtml(iconForAssetType('Quadrocopter').options.html)).toContain('>Q<')
    expect(iconHtml(iconForAssetType('FixedWingDrone').options.html)).toContain('asset-icon-diamond')
    expect(iconHtml(iconForAssetType('FixedWingDrone').options.html)).toContain('>F<')
  })
})
