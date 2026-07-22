import { divIcon, type DivIcon } from 'leaflet'
import type { FireTier } from '../engine/types'

/** Marker rendered size in pixels — matches `ICON_SIZE` in `assetIcons.ts`/`eventIcons.ts`. */
const ICON_SIZE = 26

const iconCache = new Map<FireTier, DivIcon>()

/**
 * Builds (and caches) the marker icon for a Fire at `tier`. Deliberately a
 * separate module from `eventIcons.ts` (ADR-0004: Fire is not a kind of
 * Event) but reuses the exact same `.event-icon`/`.event-icon-shape-fire`
 * CSS classes a Fire rendered under the old `EventType` union — this issue
 * is a pure data-model split, not a visual change, so the DOM/CSS output
 * for a Fire marker must stay byte-identical to before it. `'undetected'`
 * maps to the existing `event-icon-undetected` faded/dashed treatment;
 * `'towerDetected'`/`'investigated'` both map to the existing
 * `event-icon-detected` (plain) treatment, since neither has a dedicated
 * visual yet (issues S/T/U/V add the Uncertainty Ellipse/Confirmed Shape
 * treatments on top of this marker, not in this slice).
 */
export function iconForFire(tier: FireTier): DivIcon {
  const cached = iconCache.get(tier)
  if (cached) return cached

  const statusClassName = tier === 'undetected' ? 'event-icon-undetected' : 'event-icon-detected'
  const icon = divIcon({
    className: `event-icon event-icon-fire ${statusClassName}`,
    html: `<span class="event-icon-shape event-icon-shape-fire">FI</span>`,
    iconSize: [ICON_SIZE, ICON_SIZE],
  })

  iconCache.set(tier, icon)
  return icon
}
