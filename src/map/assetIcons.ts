import { divIcon, type DivIcon } from 'leaflet'
import type { AssetType } from '../world/types'

/** Leaflet icon footprint in pixels — sized for a ~44px touch target. */
const HIT_SIZE = 44

/**
 * One outer class/shape/letter combination per {@link AssetType},
 * mirroring `eventIcons.ts`'s own per-`EventType` table. `typeClassName`
 * preserves the exact hyphenated names this codebase's tests/CSS already
 * key off (`asset-icon-base-station`, `asset-icon-fixed-wing-drone`) —
 * kept as an explicit table rather than derived from `type.toLowerCase()`,
 * since `AssetType`'s own PascalCase values (`BaseStation`,
 * `FixedWingDrone`) don't lower-case into those hyphenated forms. Each
 * shape is a distinct shape/color/letter combination (not color alone) so
 * Tower, Base Station, Quadrocopter, and Fixed-Wing Drone markers stay
 * distinguishable at a glance and aren't accessibility-dependent on hue.
 */
const ASSET_TYPE_ICON: Record<AssetType, { typeClassName: string; shapeClassName: string; label: string }> = {
  Tower: { typeClassName: 'asset-icon-tower', shapeClassName: 'asset-icon-tower-rook', label: 'T' },
  BaseStation: { typeClassName: 'asset-icon-base-station', shapeClassName: 'asset-icon-square', label: 'B' },
  Quadrocopter: { typeClassName: 'asset-icon-quadrocopter', shapeClassName: 'asset-icon-circle', label: 'Q' },
  FixedWingDrone: { typeClassName: 'asset-icon-fixed-wing-drone', shapeClassName: 'asset-icon-diamond', label: 'F' },
}

const iconCache = new Map<string, DivIcon>()

/**
 * Builds (and caches) the marker icon for an asset of `type`, optionally
 * `isLost` (issue W, `CONTEXT.md`'s **Lost** entry) — only ever `true` for
 * a Drone (`Quadrocopter`/`FixedWingDrone`); a Tower/Base Station is never
 * Lost, so callers simply never pass `true` for those. Mirrors
 * `eventIcons.ts`'s `iconForEvent` caching-by-composite-key pattern (there,
 * `${type}-${status}`; here, `${type}-${isLost}`) — the `.asset-icon-lost`
 * class added below is styled in `index.css` the same greyed-out/
 * desaturated way `.event-icon-resolved` already treats a Resolved Event,
 * this codebase's existing precedent for "still visible, but visually
 * inactive" (see that class's own doc comment).
 */
export function iconForAssetType(type: AssetType, isLost: boolean = false): DivIcon {
  const cacheKey = `${type}-${isLost}`
  const cached = iconCache.get(cacheKey)
  if (cached) return cached

  const { typeClassName, shapeClassName, label } = ASSET_TYPE_ICON[type]
  const lostClassName = isLost ? ' asset-icon-lost' : ''
  const icon = divIcon({
    className: `asset-icon ${typeClassName}${lostClassName}`,
    html: `<span class="asset-icon-hit-area"><span class="asset-icon-shape ${shapeClassName}">${label}</span></span>`,
    iconSize: [HIT_SIZE, HIT_SIZE],
  })

  iconCache.set(cacheKey, icon)
  return icon
}
