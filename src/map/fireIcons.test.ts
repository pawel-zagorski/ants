import { describe, expect, it } from 'vitest'
import { iconForFire } from './fireIcons'

/** Extracts the `divIcon`'s HTML string, whatever its runtime shape. */
function iconHtml(html: ReturnType<typeof iconForFire>['options']['html']): string {
  return typeof html === 'string' ? html : ''
}

describe('iconForFire', () => {
  it("keeps the 'FI' letter and the fire shape class", () => {
    const html = iconHtml(iconForFire('towerDetected').options.html)

    expect(html).toContain('event-icon-shape-fire')
    expect(html).toContain('>FI<')
  })

  it('preserves the faded/dashed treatment for an Undetected Fire', () => {
    expect(iconForFire('undetected').options.className).toContain('event-icon-undetected')
  })

  it('uses the plain (non-faded) treatment for a Detected Fire', () => {
    const className = iconForFire('towerDetected').options.className ?? ''
    expect(className).toContain('event-icon-detected')
    expect(className).not.toContain('event-icon-undetected')
  })
})
