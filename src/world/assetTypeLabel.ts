import type { AssetType } from './types'

/**
 * Maps an {@link AssetType} discriminant to its exact `CONTEXT.md` display
 * term. The discriminant values themselves are PascalCase code identifiers
 * (`BaseStation`, `FixedWingDrone`) — this is the one place that translates
 * them to the domain vocabulary ("Base Station", "Fixed-Wing Drone") for
 * anything shown to an operator.
 */
const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  Tower: 'Tower',
  BaseStation: 'Base Station',
  Quadrocopter: 'Quadrocopter',
  FixedWingDrone: 'Fixed-Wing Drone',
}

export function assetTypeLabel(type: AssetType): string {
  return ASSET_TYPE_LABELS[type]
}
