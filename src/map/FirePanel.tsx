import { fireTierLabel } from './assetPanelFormatting'
import { withBase } from '../basePath'
import { MapOverlayPanel } from './MapOverlayPanel'
import { classifyFireDispatch } from '../engine/bingoRange'
import { fireOrbitRadiusMetersAt } from '../engine/growthEllipse'
import { formatScenarioDateTime, pad2 } from '../engine/scenarioEpoch'
import { droneTelemetryFor } from '../engine/telemetry'
import type { FireMissionKind, FireRuntimeState, SimulationState } from '../engine/types'
import type { Wind } from '../scenario/types'
import type { BaseStation, Drone } from '../world/types'

export interface FirePanelProps {
  fire: FireRuntimeState
  /**
   * The current Scenario's Epoch (`CONTEXT.md`) — see `startDateTimeIso` on
   * `Scenario` — used to render `detectedAtSimSeconds` as a real calendar
   * date/time (issue N) rather than raw elapsed seconds. Optional to match
   * `Scenario.startDateTimeIso` itself; falls back to a raw "T+MM:SS"
   * display (see {@link formatDetectedAt}) when absent, mirroring
   * `SimulationClockPanel`'s own fallback for the same reason — only
   * reachable for a hand-built `Scenario` fixture missing its Epoch, since
   * every real, loaded Scenario has one.
   */
  startDateTimeIso?: string
  /**
   * The Simulation Clock's current `SimulationState` in full — `dronePatrol`/
   * `droneActivity`/`elapsedSimSeconds` are what {@link fireDispatchListsFor}
   * needs to compute each Drone's live position/endurance and availability
   * (mirrors `EventPanel`'s single `simulationState` prop for the same
   * reason: these fields always travel together as one simulation
   * snapshot).
   */
  simulationState: SimulationState
  /** The World's full Drone roster — every candidate row for the two "Send" lists, classified/filtered below. */
  drones: readonly Drone[]
  /** The World's full Base Station roster — the "reach a Base Station afterward" leg of the Bingo Range calculation (see `bingoRange.ts`). */
  baseStations: readonly BaseStation[]
  /**
   * The current Scenario's `Wind` (issue V) — feeds
   * `growthEllipse.ts`'s `fireOrbitRadiusMetersAt`, which
   * {@link fireDispatchListsFor} uses to compute this Fire's *real* current
   * orbit radius (replacing issue U's fixed `FIRE_ORBIT_RADIUS_METERS`
   * placeholder) for `bingoRange.ts`'s round-trip-distance calculation.
   */
  wind: Wind
  /**
   * Issue U's manual Fire-dispatch trigger: sends `droneId` to investigate
   * this Fire via `useSimulationClock.sendDroneToFire`, carrying which of
   * the two "Send" lists it was clicked from as `missionKind` — `'roundTrip'`
   * for Bingo Range, `'oneWay'` for One-Way Mission (see `bingoRange.ts`'s
   * `classifyFireDispatch` and `engine/types.ts`'s `FireMissionKind`).
   */
  onSend: (droneId: string, missionKind: FireMissionKind) => void
  onClose: () => void
}

/**
 * Renders `detectedAtSimSeconds` as a calendar date/time via the Scenario
 * Epoch when `startDateTimeIso` is available, else the same raw "T+MM:SS"
 * fallback `SimulationClockPanel.tsx`'s own (private) `formatElapsedSimTime`
 * uses. Deliberately not shared with `EventPanel`'s own private
 * `formatDetectedAt` (same rationale as that function's doc comment): each
 * panel owns its own tiny formatter rather than a premature shared helper.
 */
function formatDetectedAt(detectedAtSimSeconds: number, startDateTimeIso: string | undefined): string {
  if (startDateTimeIso) return formatScenarioDateTime(startDateTimeIso, detectedAtSimSeconds)

  const totalSeconds = Math.floor(detectedAtSimSeconds)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `T+${pad2(minutes)}:${pad2(seconds)}`
}

/**
 * The two "Send" lists this Fire's dispatch section shows (issue U,
 * ADR-0006): every `drones` entry that's currently `'patrolling'` (a Drone
 * missing from `droneActivity`, or already `'investigating'`/
 * `'investigatingFire'` something else, is excluded — mirrors
 * `EventPanel`'s own `availableDronesFor`, which is the same availability
 * rule for Person Sighting/Fallen Tree dispatch), classified via
 * `bingoRange.ts`'s `classifyFireDispatch` using each Drone's *live*
 * position (`simulationState.dronePatrol[drone.id].position`, not its
 * static `world.json` position) and *live* remaining endurance (via
 * `droneTelemetryFor`, the same live value `ReturnEnvelope`/`AssetPanel`
 * read). A Drone classified `'unreachable'` — cannot even reach the Fire
 * one-way — is dropped from both lists entirely, per the acceptance
 * criteria; there's no third list rendered for it. There's no separate
 * "Lost" exclusion needed here either (issue W): a Lost Drone's
 * `droneActivity[id].mode` is `'lost'`, which the `activity.mode !==
 * 'patrolling'` check above already treats as unavailable — it falls out
 * of both lists (and is never even passed to `classifyFireDispatch`) the
 * same way an already-investigating Drone does, with no change needed
 * here (see `engine/types.ts`'s `DroneActivityState` `'lost'` variant).
 *
 * `wind` (issue V) feeds `growthEllipse.ts`'s `fireOrbitRadiusMetersAt`:
 * this Fire's *real* current orbit radius, evaluated at its elapsed time
 * since ignition *right now* (the moment the operator is viewing this
 * panel — not projected forward to whatever it might grow to by the time
 * a Drone actually arrives, a documented simplification, same spirit as
 * the fixed placeholder radius it replaces), computed once and passed
 * into every candidate's `classifyFireDispatch` call below — replacing
 * issue U's fixed `FIRE_ORBIT_RADIUS_METERS`.
 */
function fireDispatchListsFor(
  fire: FireRuntimeState,
  drones: readonly Drone[],
  simulationState: SimulationState,
  baseStations: readonly BaseStation[],
  wind: Wind,
): { bingoRange: Drone[]; oneWayMission: Drone[] } {
  const bingoRange: Drone[] = []
  const oneWayMission: Drone[] = []
  const orbitRadiusMeters = fireOrbitRadiusMetersAt(simulationState.elapsedSimSeconds - fire.spawnAtSimSeconds, wind)

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

    const classification = classifyFireDispatch(
      {
        id: drone.id,
        position: patrol.position,
        remainingEnduranceSimSeconds,
        cruiseSpeedMetersPerSecond: drone.cruiseSpeedMetersPerSecond,
      },
      fire.position,
      baseStations,
      orbitRadiusMeters,
    )

    if (classification === 'bingoRange') bingoRange.push(drone)
    else if (classification === 'oneWayMission') oneWayMission.push(drone)
  }

  return { bingoRange, oneWayMission }
}

/** One "Send"-able Drone list under a labeled heading — shared markup for both the Bingo Range and One-Way Mission sections below. */
function FireDispatchDroneList({
  title,
  drones,
  emptyMessage,
  missionKind,
  onSend,
}: {
  title: string
  drones: readonly Drone[]
  emptyMessage: string
  missionKind: FireMissionKind
  onSend: (droneId: string, missionKind: FireMissionKind) => void
}) {
  return (
    <div className="fire-panel-drones">
      <h3 className="fire-panel-drones-title">{title}</h3>
      {drones.length === 0 ? (
        <p className="fire-panel-no-drones">{emptyMessage}</p>
      ) : (
        <ul className="fire-panel-drone-list">
          {drones.map((drone) => (
            <li key={drone.id} className="fire-panel-drone-row">
              <span className="fire-panel-drone-id">{drone.id}</span>
              <button type="button" onClick={() => onSend(drone.id, missionKind)}>
                Send
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Status panel opened by clicking a clickable (non-`'undetected'`) Fire
 * marker (issue T) — mirrors `EventPanel`'s open/close pattern exactly (same
 * `.asset-panel`/`role="dialog"` convention, close-button placement), but
 * for a Fire's Detection Status plus its own dispatch section (issue U,
 * ADR-0006): rather than `EventPanel`'s single "Available Drones" list,
 * this shows two separately-labeled lists, "Bingo Range" and "One-Way
 * Mission" (`CONTEXT.md`'s exact terms) — see {@link fireDispatchListsFor}
 * for the classification/availability rule behind each. A Drone in either
 * list has its own "Send" button; clicking one calls `onSend` with that
 * list's `missionKind` so `RokuaMap`'s `useSimulationClock.sendDroneToFire`
 * can record which kind of mission it is on the Drone's runtime state
 * (`DroneActivityState`'s `'investigatingFire'` variant).
 */
export function FirePanel({ fire, startDateTimeIso, simulationState, drones, baseStations, wind, onSend, onClose }: FirePanelProps) {
  const { bingoRange, oneWayMission } = fireDispatchListsFor(fire, drones, simulationState, baseStations, wind)

  return (
    <MapOverlayPanel className="asset-panel fire-panel" role="dialog" aria-label={`Fire ${fire.id} status`}>
      <button type="button" className="asset-panel-close" onClick={onClose} aria-label="Close">
        &times;
      </button>
      <div className="asset-panel-body">
        <img className="asset-panel-photo" src={withBase('/img/wildfire.jpeg')} alt="Wildfire" />
        <h2 className="asset-panel-title">{fire.id}</h2>
        <dl className="asset-panel-fields">
          <dt>Tier</dt>
          <dd>{fireTierLabel(fire.tier)}</dd>
          <dt>Detected By</dt>
          <dd>{fire.detectedByAssetId ?? 'Unknown'}</dd>
          <dt>Detected At</dt>
          <dd>
            {fire.detectedAtSimSeconds !== undefined
              ? formatDetectedAt(fire.detectedAtSimSeconds, startDateTimeIso)
              : 'Unknown'}
          </dd>
        </dl>
      </div>
      <FireDispatchDroneList
        title="Bingo Range"
        drones={bingoRange}
        emptyMessage="No Drones currently in Bingo Range"
        missionKind="roundTrip"
        onSend={onSend}
      />
      <FireDispatchDroneList
        title="One-Way Mission"
        drones={oneWayMission}
        emptyMessage="No Drones available for a One-Way Mission"
        missionKind="oneWay"
        onSend={onSend}
      />
    </MapOverlayPanel>
  )
}
