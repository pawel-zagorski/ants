import { divIcon, type DivIcon } from 'leaflet'
import type { EventStatus } from '../engine/types'
import type { EventType } from '../scenario/types'

/** Marker rendered size in pixels — matches `ICON_SIZE` in `assetIcons.ts`. */
const ICON_SIZE = 26

/**
 * One shape/letter/color combination per {@link EventType}, mirroring
 * `assetIcons.ts`. Fire is deliberately absent (ADR-0004: Fire is not a
 * kind of Event) — see `fireIcons.ts` for its own icon.
 */
const EVENT_TYPE_ICON: Record<EventType, { shapeClassName: string; label: string }> = {
  PersonSighting: { shapeClassName: 'event-icon-shape-person-sighting', label: 'PS' },
  FallenTree: { shapeClassName: 'event-icon-shape-fallen-tree', label: 'FT' },
}

const iconCache = new Map<string, DivIcon>()

/**
 * Builds (and caches) the marker icon for an Event of `type` at `status`.
 * Only `'undetected'` is reachable in this slice — no Detection logic
 * exists yet — but `status` is threaded through now so a later slice's
 * `'detected'`/`'resolved'` styling is a matter of adding CSS, not touching
 * this function's callers.
 */
export function iconForEvent(type: EventType, status: EventStatus): DivIcon {
  const cacheKey = `${type}-${status}`
  const cached = iconCache.get(cacheKey)
  if (cached) return cached

  const { shapeClassName, label } = EVENT_TYPE_ICON[type]
  const statusClassName = `event-icon-${status}`
  const icon = divIcon({
    className: `event-icon event-icon-${type.toLowerCase()} ${statusClassName}`,
    html: `<span class="event-icon-shape ${shapeClassName}">${label}</span>`,
    iconSize: [ICON_SIZE, ICON_SIZE],
  })

  iconCache.set(cacheKey, icon)
  return icon
}
