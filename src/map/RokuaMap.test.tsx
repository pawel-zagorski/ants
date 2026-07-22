import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RokuaMap } from './RokuaMap'
import type { Scenario } from '../scenario/types'
import type { World } from '../world/types'

const world: World = {
  bounds: { southWest: { lat: 64.3398, lng: 25.9718 }, northEast: { lat: 64.789, lng: 27.0176 } },
  towers: [
    { id: 'tower-1', type: 'Tower', position: { lat: 64.7, lng: 26.2 }, detectionRadiusMeters: 15000 },
  ],
  baseStations: [{ id: 'base-1', type: 'BaseStation', position: { lat: 64.5, lng: 26.25 } }],
  drones: [
    {
      id: 'drone-1',
      type: 'Quadrocopter',
      position: { lat: 64.502, lng: 26.252 },
      homeBaseStationId: 'base-1',
    },
    {
      id: 'drone-2',
      type: 'FixedWingDrone',
      position: { lat: 64.51, lng: 26.24 },
      homeBaseStationId: 'base-1',
    },
  ],
}

const emptyScenario: Scenario = { events: [] }

describe('RokuaMap', () => {
  it('renders a distinct marker per asset kind and no panel until one is clicked', () => {
    render(<RokuaMap world={world} scenario={emptyScenario} />)

    expect(document.querySelectorAll('.asset-icon-tower')).toHaveLength(1)
    expect(document.querySelectorAll('.asset-icon-base-station')).toHaveLength(1)
    expect(document.querySelectorAll('.asset-icon-quadrocopter')).toHaveLength(1)
    expect(document.querySelectorAll('.asset-icon-fixed-wing-drone')).toHaveLength(1)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens a status panel with id/type/position when a marker is clicked', () => {
    render(<RokuaMap world={world} scenario={emptyScenario} />)

    const towerMarker = document.querySelector('.asset-icon-tower')
    expect(towerMarker).not.toBeNull()
    fireEvent.click(towerMarker as Element)

    const panel = screen.getByRole('dialog')
    expect(panel).toHaveTextContent('tower-1')
    expect(panel).toHaveTextContent('Tower')
    expect(panel).toHaveTextContent('64.7000, 26.2000')
  })

  it("shows a Drone's current patrol position (not its static world.json position) in the panel", () => {
    render(<RokuaMap world={world} scenario={emptyScenario} />)

    fireEvent.click(document.querySelector('.asset-icon-quadrocopter') as Element)

    const panel = screen.getByRole('dialog')
    expect(panel).toHaveTextContent('drone-1')
    // Patrolling near its home Base Station (64.5, 26.25), not its raw world.json position.
    expect(panel).toHaveTextContent(/-?\d+\.\d{4}, -?\d+\.\d{4}/)
  })

  it('displays Base Station and Fixed-Wing Drone using their exact CONTEXT.md vocabulary', () => {
    render(<RokuaMap world={world} scenario={emptyScenario} />)

    fireEvent.click(document.querySelector('.asset-icon-base-station') as Element)
    expect(screen.getByRole('dialog')).toHaveTextContent('Base Station')

    fireEvent.click(document.querySelector('.asset-icon-fixed-wing-drone') as Element)
    expect(screen.getByRole('dialog')).toHaveTextContent('Fixed-Wing Drone')
  })

  it('switches the panel to the newly clicked asset', () => {
    render(<RokuaMap world={world} scenario={emptyScenario} />)

    fireEvent.click(document.querySelector('.asset-icon-quadrocopter') as Element)
    fireEvent.click(document.querySelector('.asset-icon-tower') as Element)

    const panel = screen.getByRole('dialog')
    expect(panel).toHaveTextContent('tower-1')
    expect(screen.queryByText('drone-1')).toBeNull()
  })

  it('closes the panel when its close button is clicked', () => {
    render(<RokuaMap world={world} scenario={emptyScenario} />)

    fireEvent.click(document.querySelector('.asset-icon-tower') as Element)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders the Simulation Clock with Play, Step, and speed multiplier controls, starting paused', () => {
    render(<RokuaMap world={world} scenario={emptyScenario} />)

    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Step' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '1x' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '10x' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '60x' })).toBeInTheDocument()
  })

  it('switches to Pause and disables Step once Play is pressed', () => {
    render(<RokuaMap world={world} scenario={emptyScenario} />)

    fireEvent.click(screen.getByRole('button', { name: 'Play' }))

    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Play' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Step' })).toBeDisabled()
  })

  it('moves a Quadrocopter to a new patrol position when stepping the Simulation Clock forward while paused', () => {
    render(<RokuaMap world={world} scenario={emptyScenario} />)

    fireEvent.click(document.querySelector('.asset-icon-quadrocopter') as Element)
    const positionBefore = screen.getByRole('dialog').textContent

    fireEvent.click(screen.getByRole('button', { name: 'Step' }))
    fireEvent.click(document.querySelector('.asset-icon-quadrocopter') as Element)
    const positionAfter = screen.getByRole('dialog').textContent

    expect(positionAfter).not.toEqual(positionBefore)
  })
})

describe('RokuaMap Event spawning and Ground Truth View', () => {
  const scenarioWithImmediateEvent: Scenario = {
    events: [
      {
        id: 'event-1',
        type: 'FallenTree',
        position: { lat: 64.55, lng: 26.3 },
        spawnAtSimSeconds: 0,
      },
    ],
  }

  it('does not render an Event marker by default, even once it has spawned', () => {
    render(<RokuaMap world={world} scenario={scenarioWithImmediateEvent} />)

    expect(document.querySelectorAll('.event-icon')).toHaveLength(0)
  })

  it('renders a spawned Event, faded/dashed, once Ground Truth View is enabled', () => {
    render(<RokuaMap world={world} scenario={scenarioWithImmediateEvent} />)

    fireEvent.click(screen.getByRole('checkbox', { name: 'Ground Truth View' }))

    const marker = document.querySelector('.event-icon-fallentree')
    expect(marker).not.toBeNull()
    expect(marker).toHaveClass('event-icon-undetected')
  })

  it('hides Events again when Ground Truth View is toggled back off', () => {
    render(<RokuaMap world={world} scenario={scenarioWithImmediateEvent} />)

    const toggle = screen.getByRole('checkbox', { name: 'Ground Truth View' })
    fireEvent.click(toggle)
    fireEvent.click(toggle)

    expect(document.querySelectorAll('.event-icon')).toHaveLength(0)
  })

  it("does not render an Event before its spawnAtSimSeconds, and renders it once the clock steps past that time", () => {
    const scenarioWithLaterEvent: Scenario = {
      events: [
        {
          id: 'event-1',
          type: 'FallenTree',
          position: { lat: 64.55, lng: 26.3 },
          spawnAtSimSeconds: 30,
        },
      ],
    }

    render(<RokuaMap world={world} scenario={scenarioWithLaterEvent} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ground Truth View' }))

    expect(document.querySelectorAll('.event-icon')).toHaveLength(0)

    // The Simulation Clock's Step control advances by 30 simulated seconds
    // (STEP_SIM_SECONDS in useSimulationClock.ts) — exactly this Event's spawn time.
    fireEvent.click(screen.getByRole('button', { name: 'Step' }))

    expect(document.querySelectorAll('.event-icon')).toHaveLength(1)
  })
})
