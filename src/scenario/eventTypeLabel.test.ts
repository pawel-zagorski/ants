import { describe, expect, it } from 'vitest'
import { eventTypeLabel } from './eventTypeLabel'

describe('eventTypeLabel', () => {
  it('renders every Event type using the exact CONTEXT.md vocabulary', () => {
    expect(eventTypeLabel('Fire')).toBe('Fire')
    expect(eventTypeLabel('PersonSighting')).toBe('Person Sighting')
    expect(eventTypeLabel('FallenTree')).toBe('Fallen Tree')
  })
})
