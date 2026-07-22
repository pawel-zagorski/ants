import { useState } from 'react'
import { formatEventLogEntry } from './eventLogFormatting'
import type { EventLogEntry } from '../engine/eventLog'
import type { Scenario } from '../scenario/types'
import type { World } from '../world/types'

export interface EventLogPanelProps {
  /**
   * The Event Log in engine (chronological, oldest-first) order — exactly
   * `SimulationState.log`. This panel reverses it for display so the newest
   * Log Entry is at the top (`CONTEXT.md`'s **Event Log** entry).
   */
  log: readonly EventLogEntry[]
  /** The running Scenario — supplies the Scenario Epoch for each entry's calendar timestamp. */
  scenario: Scenario
  /** The World roster — supplies the named assets each entry's location is described relative to. */
  world: World
}

/**
 * The Event Log (ADR-0008, `CONTEXT.md`'s **Event Log** entry): a
 * full-width bottom strip listing the operator's known picture (Detections,
 * dispatches, the manual recall order, and observed Drone activity) newest
 * line at the top, each prefixed with a Scenario-Epoch calendar timestamp.
 * Non-nominal lines (Fire discovered, One-Way Mission dispatch, Lost) are
 * rendered visually distinct and prefixed `WARNING: ` — that prefix lives
 * here, not in `eventLogFormatting.ts`'s text, so the plain `text` stays
 * reusable. A header bar (title + collapse/expand toggle) lets the operator
 * shrink it to just the header; the entry list has a fixed height with its
 * own vertical scroll so it never grows to push the map away, and a
 * friendly empty-state shows before anything has been logged.
 */
export function EventLogPanel({ log, scenario, world }: EventLogPanelProps) {
  const [collapsed, setCollapsed] = useState(false)

  // Newest-first: the engine stores chronological/oldest-first, the operator
  // reads top-down newest-first.
  const entriesNewestFirst = [...log].reverse()

  return (
    <section className="event-log-panel" aria-label="Event Log">
      <header className="event-log-header">
        <h2 className="event-log-title">Event Log</h2>
        <button
          type="button"
          className="event-log-toggle"
          onClick={() => setCollapsed((previous) => !previous)}
          aria-expanded={!collapsed}
        >
          {collapsed ? 'Expand' : 'Collapse'}
        </button>
      </header>
      {!collapsed && (
        <div className="event-log-content">
          {entriesNewestFirst.length === 0 ? (
            <p className="event-log-empty">No events logged yet — activity will appear here as the simulation runs.</p>
          ) : (
            <ul className="event-log-entries">
              {entriesNewestFirst.map((entry) => {
                const { timestamp, text, severity } = formatEventLogEntry(entry, scenario, world)
                return (
                  <li key={entry.id} className={`event-log-entry event-log-entry-${severity}`}>
                    <span className="event-log-timestamp">{timestamp}</span>
                    <span className="event-log-text">{severity === 'warning' ? `WARNING: ${text}` : text}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
