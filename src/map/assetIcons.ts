import { divIcon, type DivIcon } from 'leaflet'
import type { AssetType } from '../world/types'

/** Marker rendered size in pixels — square, so Leaflet can center it on the asset's position. */
const ICON_SIZE = 28

/**
 * One `L.divIcon` per {@link AssetType}, built once and reused across
 * markers. Each is a distinct shape/color/letter combination (not color
 * alone) so Tower, Base Station, Quadrocopter, and Fixed-Wing Drone markers
 * stay distinguishable at a glance and aren't accessibility-dependent on hue.
 */
const ASSET_ICONS: Record<AssetType, DivIcon> = {
  Tower: divIcon({
    className: 'asset-icon asset-icon-tower',
    html: '<span class="asset-icon-shape asset-icon-triangle">T</span>',
    iconSize: [ICON_SIZE, ICON_SIZE],
  }),
  BaseStation: divIcon({
    className: 'asset-icon asset-icon-base-station',
    html: '<span class="asset-icon-shape asset-icon-square">B</span>',
    iconSize: [ICON_SIZE, ICON_SIZE],
  }),
  Quadrocopter: divIcon({
    className: 'asset-icon asset-icon-quadrocopter',
    html: '<span class="asset-icon-shape asset-icon-circle">Q</span>',
    iconSize: [ICON_SIZE, ICON_SIZE],
  }),
  FixedWingDrone: divIcon({
    className: 'asset-icon asset-icon-fixed-wing-drone',
    html: '<span class="asset-icon-shape asset-icon-diamond">F</span>',
    iconSize: [ICON_SIZE, ICON_SIZE],
  }),
}

/** Looks up the shared marker icon for an asset's `type`. */
export function iconForAssetType(type: AssetType): DivIcon {
  return ASSET_ICONS[type]
}
