import { divIcon, type DivIcon } from 'leaflet'
import type { ClearcutTier } from '../engine/types'

/** Marker rendered size in pixels — matches `ICON_SIZE` in `fireIcons.ts`/`eventIcons.ts`. */
const ICON_SIZE = 26

const iconCache = new Map<ClearcutTier, DivIcon>()

/**
 * Builds (and caches) the marker icon for a Clearcut at `tier` — the
 * Clearcut sibling of `fireIcons.ts`'s `iconForFire` (ADR-0009: a Clearcut
 * is not a kind of Event/Fire, so it gets its own icon module). Renders a
 * **red tree glyph** (a CSS-clipped pine-tree shape, not a two-letter
 * label), reusing the shared `.event-icon`/faded-vs-solid state treatment:
 * `'undetected'` maps to the faded/dashed `event-icon-undetected` (only
 * ever shown in Ground Truth View), while `'detected'`/`'investigated'`
 * map to the solid `event-icon-detected` treatment.
 */
export function iconForClearcut(tier: ClearcutTier): DivIcon {
  const cached = iconCache.get(tier)
  if (cached) return cached

  const statusClassName = tier === 'undetected' ? 'event-icon-undetected' : 'event-icon-detected'
  const icon = divIcon({
    className: `event-icon event-icon-clearcut ${statusClassName}`,
    html: `<span class="event-icon-shape event-icon-shape-clearcut"></span>`,
    iconSize: [ICON_SIZE, ICON_SIZE],
  })

  iconCache.set(tier, icon)
  return icon
}
