import { clearcutTierLabel } from './assetPanelFormatting'
import { withBase } from '../basePath'
import { isClearcutBingoRangeEligible } from '../engine/bingoRange'
import { clearcutOrbitRadiusMeters } from '../engine/clearcutFootprint'
import { formatScenarioDateTime, pad2 } from '../engine/scenarioEpoch'
import { droneTelemetryFor } from '../engine/telemetry'
import type { ClearcutRuntimeState, SimulationState } from '../engine/types'
import type { BaseStation, Drone } from '../world/types'

/** The fixed display label for a Clearcut's `Type` field (`CONTEXT.md`'s Clearcut entry). */
export const CLEARCUT_TYPE_LABEL = 'Illegal Deforestation'

export interface ClearcutPanelProps {
  clearcut: ClearcutRuntimeState
  /**
   * The current Scenario's Epoch (`CONTEXT.md`) — see `startDateTimeIso` on
   * `Scenario` — used to render `detectedAtSimSeconds` as a real calendar
   * date/time (issue N) rather than raw elapsed seconds. Optional, with the
   * same raw "T+MM:SS" fallback `FirePanel` uses when absent.
   */
  startDateTimeIso?: string
  /**
   * The Simulation Clock's current `SimulationState` in full — `dronePatrol`/
   * `droneActivity`/`elapsedSimSeconds` are what {@link clearcutBingoRangeDronesFor}
   * needs to compute each Drone's live position/endurance and availability,
   * the Clearcut sibling of `FirePanel`'s identical `simulationState` prop.
   */
  simulationState: SimulationState
  /** The World's full Drone roster — every candidate row for the single "Send" list, classified/filtered below. */
  drones: readonly Drone[]
  /** The World's full Base Station roster — the "reach a Base Station afterward" leg of the Bingo Range calculation (see `bingoRange.ts`). */
  baseStations: readonly BaseStation[]
  /**
   * Issue Y's manual Clearcut-dispatch trigger: sends `droneId` to
   * investigate this Clearcut via `useSimulationClock.sendDroneToClearcut`.
   * Unlike `FirePanel.onSend` there is no `missionKind` to carry — a
   * Clearcut dispatch is always the single round-trip Bingo Range kind.
   */
  onSend: (droneId: string) => void
  onClose: () => void
}

/**
 * Renders `detectedAtSimSeconds` as a calendar date/time via the Scenario
 * Epoch when `startDateTimeIso` is available, else a raw "T+MM:SS" fallback
 * — the same tiny per-panel formatter `FirePanel` owns (deliberately not
 * shared, matching this codebase's "each panel owns its own formatter"
 * precedent).
 */
function formatDetectedAt(detectedAtSimSeconds: number, startDateTimeIso: string | undefined): string {
  if (startDateTimeIso) return formatScenarioDateTime(startDateTimeIso, detectedAtSimSeconds)

  const totalSeconds = Math.floor(detectedAtSimSeconds)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `T+${pad2(minutes)}:${pad2(seconds)}`
}

/**
 * The single "Send" list this Clearcut's dispatch section shows (issue Y) —
 * the Clearcut sibling of `FirePanel`'s {@link fireDispatchListsFor}, but
 * collapsed to one Bingo-Range-only list per this issue's spec: a static,
 * non-urgent Clearcut never justifies a One-Way Mission, so there is no
 * second list at all. Every `drones` entry that's currently `'patrolling'`
 * (a Drone missing from `droneActivity`, or already investigating/traveling
 * to something else, is excluded — the same availability rule
 * `fireDispatchListsFor` uses) is classified via `bingoRange.ts`'s
 * `isClearcutBingoRangeEligible` using each Drone's *live* position
 * (`simulationState.dronePatrol[drone.id].position`) and *live* remaining
 * endurance (via `droneTelemetryFor`). A Drone that isn't Bingo-Range
 * eligible — including one that could only make it there one-way — is
 * dropped from the list entirely, per this issue's "Unreachable Drones are
 * excluded" spec; there's no second list to fall into.
 *
 * The orbit radius fed to `isClearcutBingoRangeEligible` is this Clearcut's
 * own static `clearcutFootprint.ts`'s `clearcutOrbitRadiusMeters` — unlike
 * `fireDispatchListsFor`'s `fireOrbitRadiusMetersAt` this needs no elapsed-
 * time/Wind term at all, since a Clearcut Footprint never changes.
 */
function clearcutBingoRangeDronesFor(
  clearcut: ClearcutRuntimeState,
  drones: readonly Drone[],
  simulationState: SimulationState,
  baseStations: readonly BaseStation[],
): Drone[] {
  const bingoRange: Drone[] = []
  const orbitRadiusMeters = clearcutOrbitRadiusMeters(clearcut)

  for (const drone of drones) {
    const patrol = simulationState.dronePatrol[drone.id]
    if (!patrol) continue

    const activity = simulationState.droneActivity[drone.id] ?? { mode: 'patrolling' as const }
    if (activity.mode !== 'patrolling') continue

    const { remainingEnduranceSimSeconds } = droneTelemetryFor(
      patrol,
      activity,
      simulationState.elapsedSimSeconds,
      drone.maxEnduranceSimSeconds,
    )

    const eligible = isClearcutBingoRangeEligible(
      {
        id: drone.id,
        position: patrol.position,
        remainingEnduranceSimSeconds,
        cruiseSpeedMetersPerSecond: drone.cruiseSpeedMetersPerSecond,
      },
      clearcut.position,
      baseStations,
      orbitRadiusMeters,
    )

    if (eligible) bingoRange.push(drone)
  }

  return bingoRange
}

/**
 * Status panel opened by clicking a clickable (non-`'undetected'`) Clearcut
 * marker (issue X) — the Clearcut sibling of `FirePanel`, mirroring its
 * open/close pattern exactly (same `.asset-panel`/`role="dialog"`
 * convention, `logging.jpg` banner in place of `wildfire.jpeg`). Shows the
 * Clearcut's Type ("Illegal Deforestation"), Detection Status (which Drone
 * detected it, and when — as a Scenario-Epoch calendar date/time), current
 * tier, and — new in issue Y — a single Bingo-Range-only dispatch list (see
 * {@link clearcutBingoRangeDronesFor}): no One-Way Mission section at all,
 * since a static, non-urgent Clearcut never justifies sacrificing a Drone.
 */
export function ClearcutPanel({
  clearcut,
  startDateTimeIso,
  simulationState,
  drones,
  baseStations,
  onSend,
  onClose,
}: ClearcutPanelProps) {
  const bingoRange = clearcutBingoRangeDronesFor(clearcut, drones, simulationState, baseStations)

  return (
    <div className="asset-panel clearcut-panel" role="dialog" aria-label={`Clearcut ${clearcut.id} status`}>
      <img className="asset-panel-photo" src={withBase('/img/logging.jpg')} alt="Illegal Deforestation" />
      <button type="button" className="asset-panel-close" onClick={onClose} aria-label="Close">
        &times;
      </button>
      <h2 className="asset-panel-title">{clearcut.id}</h2>
      <dl className="asset-panel-fields">
        <dt>Type</dt>
        <dd>{CLEARCUT_TYPE_LABEL}</dd>
        <dt>Detected By</dt>
        <dd>{clearcut.detectedByAssetId ?? 'Unknown'}</dd>
        <dt>Detected At</dt>
        <dd>
          {clearcut.detectedAtSimSeconds !== undefined
            ? formatDetectedAt(clearcut.detectedAtSimSeconds, startDateTimeIso)
            : 'Unknown'}
        </dd>
        <dt>Tier</dt>
        <dd>{clearcutTierLabel(clearcut.tier)}</dd>
      </dl>
      <div className="clearcut-panel-drones">
        <h3 className="clearcut-panel-drones-title">Bingo Range</h3>
        {bingoRange.length === 0 ? (
          <p className="clearcut-panel-no-drones">No Drones currently in Bingo Range</p>
        ) : (
          <ul className="clearcut-panel-drone-list">
            {bingoRange.map((drone) => (
              <li key={drone.id} className="clearcut-panel-drone-row">
                <span className="clearcut-panel-drone-id">{drone.id}</span>
                <button type="button" onClick={() => onSend(drone.id)}>
                  Send
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
