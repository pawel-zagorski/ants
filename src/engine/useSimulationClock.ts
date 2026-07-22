import { useCallback, useEffect, useMemo, useState } from 'react'
import { advanceSimulation, initializeSimulationState } from './advanceSimulation'
import type { SimulationState } from './types'
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
}

/**
 * Owns the Simulation Clock: converts wall-clock time to simulated time via
 * `speedMultiplier` and play/pause/step UI state, then calls the pure
 * `advanceSimulation` engine on every animation frame. This is the one place
 * that bridges wall-clock time and React to the engine — `advanceSimulation`
 * itself stays free of both (see ADR/PRD "Simulation engine").
 */
export function useSimulationClock(world: World): SimulationClock {
  const baseState = useMemo(() => initializeSimulationState(world), [world])
  const [elapsedSimSeconds, setElapsedSimSeconds] = useState(0)
  const [isRunning, setIsRunning] = useState(false)
  const [speedMultiplier, setSpeedMultiplier] = useState<SimulationSpeedMultiplier>(1)

  // Resets simulated time whenever `world` (and thus `baseState`) changes
  // identity — an "adjust state during render" reset, not an effect, per
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes.
  const [previousBaseState, setPreviousBaseState] = useState(baseState)
  if (baseState !== previousBaseState) {
    setPreviousBaseState(baseState)
    setElapsedSimSeconds(0)
  }

  useEffect(() => {
    if (!isRunning) return

    let animationFrameId: number
    let lastTimestampMs: number | null = null

    const tick = (timestampMs: number) => {
      if (lastTimestampMs !== null) {
        const wallClockDeltaSeconds = (timestampMs - lastTimestampMs) / 1000
        setElapsedSimSeconds((previous) => previous + wallClockDeltaSeconds * speedMultiplier)
      }
      lastTimestampMs = timestampMs
      animationFrameId = requestAnimationFrame(tick)
    }

    animationFrameId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animationFrameId)
  }, [isRunning, speedMultiplier])

  const simulationState = useMemo(
    () => advanceSimulation(baseState, elapsedSimSeconds),
    [baseState, elapsedSimSeconds],
  )

  const play = useCallback(() => setIsRunning(true), [])
  const pause = useCallback(() => setIsRunning(false), [])
  const step = useCallback(() => setElapsedSimSeconds((previous) => previous + STEP_SIM_SECONDS), [])

  return { simulationState, isRunning, speedMultiplier, play, pause, setSpeedMultiplier, step }
}
