import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  advanceSimulation,
  initializeSimulationState,
  withManualClearcutDispatch,
  withManualDispatch,
  withManualFireDispatch,
  withManualReturnToBase,
} from './advanceSimulation'
import { findNearestRelay } from '../map/nearestRelay'
import type { FireMissionKind, SimulationState } from './types'
import type { Scenario } from '../scenario/types'
import type { World } from '../world/types'

/** Speed multipliers exposed on the Simulation Clock UI (wall-clock seconds -> simulated seconds). */
export const SIMULATION_SPEED_MULTIPLIERS = [1, 10, 60] as const
export type SimulationSpeedMultiplier = (typeof SIMULATION_SPEED_MULTIPLIERS)[number]

/** How far a single "step while paused" press advances the Simulation Clock. */
const STEP_SIM_SECONDS = 30

export interface SimulationClock {
  /** The engine's current derived state — Drone positions read from here for rendering. */
  simulationState: SimulationState
  isRunning: boolean
  speedMultiplier: SimulationSpeedMultiplier
  play: () => void
  pause: () => void
  setSpeedMultiplier: (multiplier: SimulationSpeedMultiplier) => void
  /** Advances the clock by one fixed increment; intended for use while paused. */
  step: () => void
  /**
   * Issue O's manual dispatch trigger: sends `droneId` to investigate
   * `eventId` right now, regardless of play/pause state (see
   * `withManualDispatch`'s doc comment for why this applies immediately
   * rather than queueing for the next tick). Called by `EventPanel`'s
   * "Send" button via `RokuaMap`.
   */
  sendDrone: (droneId: string, eventId: string) => void
  /**
   * Issue U's Fire-dispatch sibling of `sendDrone`: sends `droneId` to
   * investigate `fireId` right now, carrying `missionKind` (Bingo Range
   * "round trip" vs. One-Way Mission — see `FirePanel`'s two "Send"
   * lists), regardless of play/pause state (same immediate-effect
   * rationale as `sendDrone` — see `withManualFireDispatch`'s doc
   * comment). Called by `FirePanel`'s "Send" buttons via `RokuaMap`.
   */
  sendDroneToFire: (droneId: string, fireId: string, missionKind: FireMissionKind) => void
  /**
   * Issue Y's Clearcut-dispatch sibling of `sendDroneToFire`: sends
   * `droneId` to investigate `clearcutId` right now, regardless of
   * play/pause state (same immediate-effect rationale as `sendDrone`/
   * `sendDroneToFire` — see `withManualClearcutDispatch`'s doc comment).
   * Unlike `sendDroneToFire` there is no `missionKind` to carry — a
   * Clearcut dispatch is always the single round-trip Bingo Range kind, per
   * `ClearcutPanel`'s single "Send" list. Called by `ClearcutPanel`'s
   * "Send" button via `RokuaMap`.
   */
  sendDroneToClearcut: (droneId: string, clearcutId: string) => void
  /**
   * ADR-0007's manual "Return to Nearest Base" recall: sends `droneId` home
   * to its nearest `World.baseStations` entry (by straight-line distance from
   * its current live position) right now, regardless of play/pause state
   * (same immediate-effect rationale as `sendDrone`). The Drone flies there
   * and Grounds on arrival, or is Lost if its endurance runs out en route —
   * see `withManualReturnToBase`. Called by `AssetPanel`'s "Return to Nearest
   * Base" button via `RokuaMap`. A no-op if the World has no Base Stations or
   * the Drone isn't currently eligible (`canReturnDroneToBase`).
   */
  returnDroneToNearestBase: (droneId: string) => void
}

/**
 * Owns the Simulation Clock: converts wall-clock time to simulated time via
 * `speedMultiplier` and play/pause/step UI state, then calls the pure
 * `advanceSimulation` engine on every animation frame. This is the one place
 * that bridges wall-clock time and React to the engine — `advanceSimulation`
 * itself stays free of both (see ADR/PRD "Simulation engine").
 *
 * Each tick feeds the *previous* tick's `simulationState` back in as
 * `advanceSimulation`'s `state` argument (rather than always re-deriving
 * from the Scenario's initial state at the new absolute
 * `elapsedSimSeconds`) — required since Event Detection status (issue E) is
 * monotonic and carried forward via that `state`, not recomputable from
 * `elapsedSimSeconds` alone (see `advanceSimulation`'s doc comment). Drone
 * position stays exactly as before: still a closed-form function of
 * absolute `elapsedSimSeconds`, so chaining doesn't change its values.
 */
export function useSimulationClock(world: World, scenario: Scenario): SimulationClock {
  const baseState = useMemo(() => initializeSimulationState(world, scenario), [world, scenario])
  const [simulationState, setSimulationState] = useState<SimulationState>(baseState)
  const [isRunning, setIsRunning] = useState(false)
  const [speedMultiplier, setSpeedMultiplier] = useState<SimulationSpeedMultiplier>(1)

  // Resets simulated state whenever `world`/`scenario` (and thus
  // `baseState`) change identity — an "adjust state during render" reset,
  // not an effect, per
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes.
  const [previousBaseState, setPreviousBaseState] = useState(baseState)
  if (baseState !== previousBaseState) {
    setPreviousBaseState(baseState)
    setSimulationState(baseState)
  }

  useEffect(() => {
    if (!isRunning) return

    let animationFrameId: number
    let lastTimestampMs: number | null = null

    const tick = (timestampMs: number) => {
      if (lastTimestampMs !== null) {
        const wallClockDeltaSeconds = (timestampMs - lastTimestampMs) / 1000
        setSimulationState((previous) =>
          advanceSimulation(previous, previous.elapsedSimSeconds + wallClockDeltaSeconds * speedMultiplier),
        )
      }
      lastTimestampMs = timestampMs
      animationFrameId = requestAnimationFrame(tick)
    }

    animationFrameId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animationFrameId)
  }, [isRunning, speedMultiplier])

  const play = useCallback(() => setIsRunning(true), [])
  const pause = useCallback(() => setIsRunning(false), [])
  const step = useCallback(
    () => setSimulationState((previous) => advanceSimulation(previous, previous.elapsedSimSeconds + STEP_SIM_SECONDS)),
    [],
  )
  const sendDrone = useCallback(
    (droneId: string, eventId: string) => setSimulationState((previous) => withManualDispatch(previous, droneId, eventId)),
    [],
  )
  const sendDroneToFire = useCallback(
    (droneId: string, fireId: string, missionKind: FireMissionKind) =>
      setSimulationState((previous) => withManualFireDispatch(previous, droneId, fireId, missionKind)),
    [],
  )
  const sendDroneToClearcut = useCallback(
    (droneId: string, clearcutId: string) =>
      setSimulationState((previous) => withManualClearcutDispatch(previous, droneId, clearcutId)),
    [],
  )
  const returnDroneToNearestBase = useCallback(
    (droneId: string) =>
      setSimulationState((previous) => {
        const dronePosition = previous.dronePatrol[droneId]?.position
        if (!dronePosition) return previous
        const nearestBase = findNearestRelay(dronePosition, world.baseStations)
        if (!nearestBase) return previous
        return withManualReturnToBase(previous, droneId, nearestBase.relay.position)
      }),
    [world.baseStations],
  )

  return {
    simulationState,
    isRunning,
    speedMultiplier,
    play,
    pause,
    setSpeedMultiplier,
    step,
    sendDrone,
    sendDroneToFire,
    sendDroneToClearcut,
    returnDroneToNearestBase,
  }
}
