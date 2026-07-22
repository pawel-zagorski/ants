import { formatScenarioDateTime, pad2 } from './scenarioEpoch'
import { SIMULATION_SPEED_MULTIPLIERS, type SimulationClock } from './useSimulationClock'

export interface SimulationClockPanelProps {
  clock: SimulationClock
  /** The current Scenario's Epoch (`CONTEXT.md`) — see `startDateTimeIso` on `Scenario`. */
  startDateTimeIso?: string
}

function formatElapsedSimTime(elapsedSimSeconds: number): string {
  const totalSeconds = Math.floor(elapsedSimSeconds)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `T+${pad2(minutes)}:${pad2(seconds)}`
}

/**
 * The Simulation Clock UI: play/pause, speed multiplier selection, and
 * single-step-while-paused. Pure UI/orchestration wiring — all the state and
 * wall-clock-to-simulated-time conversion lives in `useSimulationClock`, and
 * the actual movement math lives in the `advanceSimulation` engine, neither
 * of which this component knows about directly.
 *
 * Displays the current calendar date/time (Scenario Epoch + elapsed
 * Simulation Clock time, per the PRD's "Scenario Epoch" Implementation
 * Decision) rather than raw elapsed seconds whenever `startDateTimeIso` is
 * available — live-updating on every render since it's a pure function of
 * `clock.simulationState.elapsedSimSeconds`. Falls back to the raw `T+MM:SS`
 * display when it isn't (only possible for a hand-built `Scenario` fixture
 * missing its Epoch — every real, loaded Scenario has one; see `Scenario`'s
 * `startDateTimeIso` doc comment).
 */
export function SimulationClockPanel({ clock, startDateTimeIso }: SimulationClockPanelProps) {
  const { elapsedSimSeconds } = clock.simulationState
  const timeDisplay = startDateTimeIso
    ? formatScenarioDateTime(startDateTimeIso, elapsedSimSeconds)
    : formatElapsedSimTime(elapsedSimSeconds)

  return (
    <div className="simulation-clock-panel" role="group" aria-label="Simulation Clock">
      <span className="simulation-clock-time">{timeDisplay}</span>
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
