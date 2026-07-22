import { SIMULATION_SPEED_MULTIPLIERS, type SimulationClock } from './useSimulationClock'

export interface SimulationClockPanelProps {
  clock: SimulationClock
}

function formatElapsedSimTime(elapsedSimSeconds: number): string {
  const totalSeconds = Math.floor(elapsedSimSeconds)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `T+${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

/**
 * The Simulation Clock UI: play/pause, speed multiplier selection, and
 * single-step-while-paused. Pure UI/orchestration wiring — all the state and
 * wall-clock-to-simulated-time conversion lives in `useSimulationClock`, and
 * the actual movement math lives in the `advanceSimulation` engine, neither
 * of which this component knows about directly.
 */
export function SimulationClockPanel({ clock }: SimulationClockPanelProps) {
  return (
    <div className="simulation-clock-panel" role="group" aria-label="Simulation Clock">
      <span className="simulation-clock-time">{formatElapsedSimTime(clock.simulationState.elapsedSimSeconds)}</span>
      {clock.isRunning ? (
        <button type="button" onClick={clock.pause}>
          Pause
        </button>
      ) : (
        <button type="button" onClick={clock.play}>
          Play
        </button>
      )}
      <button type="button" onClick={clock.step} disabled={clock.isRunning}>
        Step
      </button>
      <div className="simulation-clock-speeds" role="group" aria-label="Speed multiplier">
        {SIMULATION_SPEED_MULTIPLIERS.map((multiplier) => (
          <button
            key={multiplier}
            type="button"
            aria-pressed={clock.speedMultiplier === multiplier}
            className={clock.speedMultiplier === multiplier ? 'simulation-clock-speed-active' : undefined}
            onClick={() => clock.setSpeedMultiplier(multiplier)}
          >
            {multiplier}x
          </button>
        ))}
      </div>
    </div>
  )
}
