import type { EventType } from './types'

/**
 * Maps an {@link EventType} discriminant to its exact `CONTEXT.md` display
 * term, mirroring `world/assetTypeLabel.ts`'s asset-side equivalent. The
 * discriminant values are PascalCase code identifiers (`PersonSighting`,
 * `FallenTree`) — this is the one place that translates them to the domain
 * vocabulary ("Person Sighting", "Fallen Tree") for anything shown to an
 * operator, e.g. `EventPanel`'s "Type" field.
 */
const EVENT_TYPE_LABELS: Record<EventType, string> = {
  PersonSighting: 'Person Sighting',
  FallenTree: 'Fallen Tree',
}

export function eventTypeLabel(type: EventType): string {
  return EVENT_TYPE_LABELS[type]
}
