import { useCallback, useEffect, useMemo, useState } from 'react'
import { advanceSimulation, initializeSimulationState, withManualDispatch } from './advanceSimulation'
import type { SimulationState } from './types'
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

  return { simulationState, isRunning, speedMultiplier, play, pause, setSpeedMultiplier, step, sendDrone }
}
