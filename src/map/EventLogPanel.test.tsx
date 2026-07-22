import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EventLogPanel } from './EventLogPanel'
import type { EventLogEntry } from '../engine/eventLog'
import type { Scenario } from '../scenario/types'
import { windFixture } from '../test/worldFixtures'
import type { World } from '../world/types'

const world: World = {
  bounds: { southWest: { lat: 64.0, lng: 25.5 }, northEast: { lat: 65.0, lng: 27.0 } },
  towers: [{ id: 'tower-1', type: 'Tower', position: { lat: 64.7, lng: 26.2 }, detectionRadiusMeters: 15000 }],
  baseStations: [{ id: 'base-1', type: 'BaseStation', position: { lat: 64.5, lng: 26.25 } }],
  drones: [],
}

const scenario: Scenario = { events: [], wind: windFixture, startDateTimeIso: '2026-06-01T08:00:00.000Z' }

const earlierEntry: EventLogEntry = {
  id: 'log-1',
  simSeconds: 10,
  kind: 'droneResumedPatrol',
  severity: 'info',
  droneId: 'drone-1',
}

const laterEntry: EventLogEntry = {
  id: 'log-2',
  simSeconds: 20,
  kind: 'droneGrounded',
  severity: 'info',
  droneId: 'drone-2',
  droneModel: 'DJI Mavic 4 Pro',
  droneType: 'Quadrocopter',
}

const fireWarningEntry: EventLogEntry = {
  id: 'log-3',
  simSeconds: 30,
  kind: 'fireDetected',
  severity: 'warning',
  fireId: 'fire-1',
  position: { lat: 64.7, lng: 26.2 },
}

describe('EventLogPanel', () => {
  it('renders entries newest-first (reverse of the chronological log)', () => {
    render(<EventLogPanel log={[earlierEntry, laterEntry]} scenario={scenario} world={world} />)

    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    // laterEntry (simSeconds 20) is chronologically last, so it renders first.
    expect(rows[0]).toHaveTextContent('Drone 2')
    expect(rows[1]).toHaveTextContent('Drone 1 resumed patrolling')
  })

  it('shows a Scenario-Epoch timestamp on each row', () => {
    render(<EventLogPanel log={[earlierEntry]} scenario={scenario} world={world} />)

    // 2026-06-01 08:00:00 UTC + 10s.
    expect(screen.getByText('2026-06-01 08:00:10')).toBeInTheDocument()
  })

  it('prefixes only warning-severity rows with "WARNING: "', () => {
    render(<EventLogPanel log={[laterEntry, fireWarningEntry]} scenario={scenario} world={world} />)

    const warningRow = screen.getByText(/WARNING:/)
    expect(warningRow).toHaveTextContent('WARNING: Fire discovered')
    // The info row (droneGrounded) is not prefixed.
    expect(screen.getByText(/grounded at base/)).not.toHaveTextContent('WARNING:')
  })

  it('applies a distinct severity class to warning rows', () => {
    render(<EventLogPanel log={[fireWarningEntry]} scenario={scenario} world={world} />)

    expect(document.querySelector('.event-log-entry-warning')).not.toBeNull()
  })

  it('shows a friendly empty-state message when the log is empty', () => {
    render(<EventLogPanel log={[]} scenario={scenario} world={world} />)

    expect(screen.queryByRole('listitem')).toBeNull()
    expect(screen.getByText(/no events logged yet/i)).toBeInTheDocument()
  })

  it('collapses to just the header (hiding entries) and expands again via the toggle', () => {
    render(<EventLogPanel log={[earlierEntry]} scenario={scenario} world={world} />)

    // Expanded by default.
    expect(screen.getByRole('listitem')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Collapse' }))
    expect(screen.queryByRole('listitem')).toBeNull()
    // The header/title itself stays visible while collapsed.
    expect(screen.getByText('Event Log')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Expand' }))
    expect(screen.getByRole('listitem')).toBeInTheDocument()
  })
})
