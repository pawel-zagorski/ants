import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SimulationClockPanel } from './SimulationClockPanel'
import type { SimulationClock } from './useSimulationClock'

function clockFixture(overrides: Partial<SimulationClock> = {}): SimulationClock {
  return {
    simulationState: { elapsedSimSeconds: 0 } as SimulationClock['simulationState'],
    isRunning: false,
    speedMultiplier: 1,
    play: vi.fn(),
    pause: vi.fn(),
    setSpeedMultiplier: vi.fn(),
    step: vi.fn(),
    ...overrides,
  } as SimulationClock
}

describe('SimulationClockPanel play/pause emphasis', () => {
  it('marks the Play button with its green class while stopped', () => {
    render(<SimulationClockPanel clock={clockFixture({ isRunning: false })} />)

    const play = screen.getByRole('button', { name: 'Play' })
    expect(play).toHaveClass('simulation-clock-play')
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull()
  })

  it('marks the Pause button with its red class while running', () => {
    render(<SimulationClockPanel clock={clockFixture({ isRunning: true })} />)

    const pause = screen.getByRole('button', { name: 'Pause' })
    expect(pause).toHaveClass('simulation-clock-pause')
    expect(screen.queryByRole('button', { name: 'Play' })).toBeNull()
  })

  it('leaves the Step button without either emphasis class', () => {
    render(<SimulationClockPanel clock={clockFixture({ isRunning: false })} />)

    const step = screen.getByRole('button', { name: 'Step' })
    expect(step).not.toHaveClass('simulation-clock-play')
    expect(step).not.toHaveClass('simulation-clock-pause')
  })
})
