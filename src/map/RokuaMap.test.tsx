import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RokuaMap } from './RokuaMap'
import { offsetLatLng } from './geo'
import type { Scenario } from '../scenario/types'
import { droneSpecFixture, windFixture } from '../test/worldFixtures'
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
      ...droneSpecFixture,
    },
    {
      id: 'drone-2',
      type: 'FixedWingDrone',
      position: { lat: 64.51, lng: 26.24 },
      homeBaseStationId: 'base-1',
      ...droneSpecFixture,
    },
  ],
}

const TEST_WIND = windFixture

const emptyScenario: Scenario = { events: [], wind: TEST_WIND }

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

describe('RokuaMap Return Envelope legend', () => {
  it('always shows the Return Envelope legend, even with nothing selected', () => {
    render(<RokuaMap world={world} scenario={emptyScenario} />)

    expect(screen.getByText(/Return Envelope/i)).toBeInTheDocument()
  })
})

describe('RokuaMap Wind indicator (issue P)', () => {
  it("shows the loaded Scenario's own wind speed label, not a hardcoded default", () => {
    const scenarioWithDistinctWind: Scenario = {
      events: [],
      wind: { directionDegrees: 135, speedMetersPerSecond: 13 },
    }

    render(<RokuaMap world={world} scenario={scenarioWithDistinctWind} />)

    expect(document.querySelector('.wind-indicator')).not.toBeNull()
    expect(screen.getByText('13 m/s')).toBeInTheDocument()
  })
})

describe('RokuaMap Datalink lines (issue L)', () => {
  it('shows an animated Datalink line for every Drone, independent of selection', () => {
    render(<RokuaMap world={world} scenario={emptyScenario} />)

    expect(document.querySelectorAll('path.datalink-line')).toHaveLength(world.drones.length)
  })

  it("keeps showing every Drone's Datalink line once a status panel is open", () => {
    render(<RokuaMap world={world} scenario={emptyScenario} />)

    fireEvent.click(document.querySelector('.asset-icon-quadrocopter') as Element)

    expect(document.querySelectorAll('path.datalink-line')).toHaveLength(world.drones.length)
  })

  it("targets drone-1's Datalink line at its nearest Relay (base-1, closer than tower-1)", () => {
    render(<RokuaMap world={world} scenario={emptyScenario} />)

    expect(document.querySelector('.datalink-line-drone-drone-1.datalink-line-relay-base-1')).not.toBeNull()
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
    wind: TEST_WIND,
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
      wind: TEST_WIND,
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

describe('RokuaMap Detection and fog-of-war default view (issue E)', () => {
  const fireWithinTowerRange: Scenario = {
    events: [
      {
        id: 'fire-1',
        // tower-1 sits at (64.7, 26.2) with a 15000m detectionRadiusMeters.
        type: 'Fire',
        position: { lat: 64.7, lng: 26.2 },
        spawnAtSimSeconds: 0,
      },
    ],
    wind: TEST_WIND,
  }

  const personSightingNearTower: Scenario = {
    events: [
      {
        id: 'person-1',
        type: 'PersonSighting',
        position: { lat: 64.7, lng: 26.2 },
        spawnAtSimSeconds: 0,
      },
    ],
    wind: TEST_WIND,
  }

  it('shows a Fire Detected by a Tower in the default (non-Ground-Truth) view', () => {
    render(<RokuaMap world={world} scenario={fireWithinTowerRange} />)

    const marker = document.querySelector('.event-icon-fire')
    expect(marker).not.toBeNull()
    expect(marker).not.toHaveClass('event-icon-undetected')
  })

  it("never shows a Person Sighting next to a Tower in the default view — Towers can't detect it", () => {
    render(<RokuaMap world={world} scenario={personSightingNearTower} />)

    expect(document.querySelectorAll('.event-icon')).toHaveLength(0)
  })

  it("keeps showing a Detected Fire in the default view as the Simulation Clock advances further", () => {
    render(<RokuaMap world={world} scenario={fireWithinTowerRange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Step' }))
    fireEvent.click(screen.getByRole('button', { name: 'Step' }))

    const marker = document.querySelector('.event-icon-fire')
    expect(marker).not.toBeNull()
    expect(marker).not.toHaveClass('event-icon-undetected')
  })

  it("shows the Tower's currently-tracked Fire in its status panel", () => {
    render(<RokuaMap world={world} scenario={fireWithinTowerRange} />)

    fireEvent.click(document.querySelector('.asset-icon-tower') as Element)

    const panel = screen.getByRole('dialog')
    expect(panel).toHaveTextContent('Tracking')
    expect(panel).toHaveTextContent('fire-1')
  })

  it("shows no tracked Fire in a Tower's status panel when none has been Detected", () => {
    render(<RokuaMap world={world} scenario={emptyScenario} />)

    fireEvent.click(document.querySelector('.asset-icon-tower') as Element)

    const panel = screen.getByRole('dialog')
    expect(panel).toHaveTextContent(/no fire detected/i)
  })
})

describe('RokuaMap Drone/Base Station telemetry panels (issue G)', () => {
  it("shows a Drone's full telemetry fields in its status panel", () => {
    render(<RokuaMap world={world} scenario={emptyScenario} />)

    fireEvent.click(document.querySelector('.asset-icon-quadrocopter') as Element)

    const panel = screen.getByRole('dialog')
    expect(panel).toHaveTextContent('State')
    expect(panel).toHaveTextContent('Patrolling')
    expect(panel).toHaveTextContent('Battery')
    expect(panel).toHaveTextContent('Speed')
    expect(panel).toHaveTextContent('Heading')
    expect(panel).toHaveTextContent('Assigned Event')
    expect(panel).toHaveTextContent('Flight Endurance Remaining')
  })

  it("shows a Base Station's docked/deployed Drone counts and Operational status in its status panel", () => {
    render(<RokuaMap world={world} scenario={emptyScenario} />)

    fireEvent.click(document.querySelector('.asset-icon-base-station') as Element)

    const panel = screen.getByRole('dialog')
    expect(panel).toHaveTextContent('Docked Drones')
    expect(panel).toHaveTextContent('Deployed Drones')
    expect(panel).toHaveTextContent('Operational Status')
    expect(panel).toHaveTextContent('Operational')
  })

  it("live-updates an already-open Drone panel's position/telemetry as the Simulation Clock steps forward, with no need to re-click the marker", () => {
    render(<RokuaMap world={world} scenario={emptyScenario} />)

    fireEvent.click(document.querySelector('.asset-icon-quadrocopter') as Element)
    const before = screen.getByRole('dialog').textContent

    fireEvent.click(screen.getByRole('button', { name: 'Step' }))
    const after = screen.getByRole('dialog').textContent

    expect(after).not.toEqual(before)
  })

  it("live-updates an already-open Base Station panel's docked/deployed counts once one of its Drones is dispatched to investigate", () => {
    const eventPosition = { lat: 64.55, lng: 26.25 }
    const worldWithOneDrone: World = {
      bounds: world.bounds,
      towers: [],
      baseStations: [{ id: 'base-1', type: 'BaseStation', position: eventPosition }],
      drones: [
        {
          id: 'drone-1',
          type: 'Quadrocopter',
          position: eventPosition,
          homeBaseStationId: 'base-1',
          ...droneSpecFixture,
          patrolRadiusMeters: 1,
          patrolSpeedMetersPerSecond: 0,
        },
      ],
    }
    // Spawns exactly at the Simulation Clock's Step increment (30 simulated
    // seconds — see STEP_SIM_SECONDS in useSimulationClock.ts), so the
    // Base Station panel can be opened *before* dispatch happens and its
    // counts observed to change after a single Step, with no re-click.
    // A Fallen Tree Event (not a Fire) since dispatch is Event-only — Fire
    // Detection never dispatches a Drone (ADR-0004/ADR-0005, issue Q), and
    // neither does Detection of a Person Sighting/Fallen Tree anymore
    // (issue O) — the Base Station's counts only change once "Send" is
    // clicked in the Event panel.
    const scenarioWithLaterEvent: Scenario = {
      events: [{ id: 'event-1', type: 'FallenTree', position: eventPosition, spawnAtSimSeconds: 30 }],
      wind: TEST_WIND,
    }

    render(<RokuaMap world={worldWithOneDrone} scenario={scenarioWithLaterEvent} />)

    fireEvent.click(document.querySelector('.asset-icon-base-station') as Element)
    const dockedBefore = screen.getByText('Docked Drones').nextElementSibling
    const deployedBefore = screen.getByText('Deployed Drones').nextElementSibling
    expect(dockedBefore).toHaveTextContent('1')
    expect(deployedBefore).toHaveTextContent('0')

    fireEvent.click(screen.getByRole('button', { name: 'Step' }))
    fireEvent.click(document.querySelector('.event-icon-fallentree') as Element)
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    fireEvent.click(document.querySelector('.asset-icon-base-station') as Element)
    const dockedAfter = screen.getByText('Docked Drones').nextElementSibling
    const deployedAfter = screen.getByText('Deployed Drones').nextElementSibling
    expect(dockedAfter).toHaveTextContent('0')
    expect(deployedAfter).toHaveTextContent('1')
  })

  it("shows a dispatched Drone's status flip to Investigating (with its assigned Event id) once it is manually sent to a new Detection", () => {
    // A single-Drone World isolates "which Drone gets dispatched" from the
    // telemetry assertion itself — it's necessarily this one. A Fallen Tree
    // Event (not a Fire) since dispatch is Event-only (ADR-0004/ADR-0005,
    // issue Q), and dispatch only happens once "Send" is clicked in the
    // Event panel (issue O retired auto-dispatch for Person
    // Sighting/Fallen Tree).
    const eventPosition = { lat: 64.55, lng: 26.25 }
    const worldWithOneDrone: World = {
      bounds: world.bounds,
      towers: [],
      baseStations: [{ id: 'base-1', type: 'BaseStation', position: eventPosition }],
      drones: [
        {
          id: 'drone-1',
          type: 'Quadrocopter',
          position: eventPosition,
          homeBaseStationId: 'base-1',
          ...droneSpecFixture,
          patrolRadiusMeters: 1,
          patrolSpeedMetersPerSecond: 0,
        },
      ],
    }
    const eventScenario: Scenario = {
      events: [{ id: 'event-1', type: 'FallenTree', position: eventPosition, spawnAtSimSeconds: 0 }],
      wind: TEST_WIND,
    }

    render(<RokuaMap world={worldWithOneDrone} scenario={eventScenario} />)

    fireEvent.click(document.querySelector('.event-icon-fallentree') as Element)
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    fireEvent.click(document.querySelector('.asset-icon-quadrocopter') as Element)
    const panel = screen.getByRole('dialog')
    expect(panel).toHaveTextContent('Investigating')
    expect(panel).toHaveTextContent('event-1')
  })
})

describe('RokuaMap Manual dispatch for Person Sighting/Fallen Tree (issue O)', () => {
  // Sitting exactly at base-1 (world's Base Station position), so drone-1's
  // Quadrocopter patrol loop (radius 250m, centered on base-1) always stays
  // within its 500m default detection radius — guarantees Detection at
  // elapsedSimSeconds 0 regardless of patrol angle.
  const eventPosition = { lat: 64.5, lng: 26.25 }
  const fallenTreeScenario: Scenario = {
    events: [{ id: 'tree-1', type: 'FallenTree', position: eventPosition, spawnAtSimSeconds: 0 }],
    wind: TEST_WIND,
  }

  it('does not auto-dispatch any Drone on Detection, and clicking the Detected marker opens a panel with Detection Status and available Drones', () => {
    render(<RokuaMap world={world} scenario={fallenTreeScenario} />)

    const marker = document.querySelector('.event-icon-fallentree')
    expect(marker).not.toBeNull()
    expect(marker).not.toHaveClass('event-icon-undetected')

    fireEvent.click(marker as Element)

    const panel = screen.getByRole('dialog')
    expect(panel).toHaveTextContent('tree-1')
    expect(panel).toHaveTextContent('Fallen Tree')
    // Detected by one of the two Drones (both patrol right on top of the
    // Event) — either is a valid, deterministic outcome of Detection.
    expect(panel.textContent).toMatch(/drone-1|drone-2/)
    expect(screen.getAllByRole('button', { name: 'Send' }).length).toBeGreaterThan(0)
  })

  it('leaves every Drone patrolling until "Send" is clicked — no automatic dispatch', () => {
    render(<RokuaMap world={world} scenario={fallenTreeScenario} />)

    fireEvent.click(document.querySelector('.asset-icon-quadrocopter') as Element)
    expect(screen.getByRole('dialog')).toHaveTextContent('Patrolling')
  })

  it('starts the sent Drone investigating once "Send" is clicked, and removes it from the Event panel\'s list', () => {
    render(<RokuaMap world={world} scenario={fallenTreeScenario} />)

    fireEvent.click(document.querySelector('.event-icon-fallentree') as Element)
    fireEvent.click(screen.getAllByRole('button', { name: 'Send' })[0])

    // The Event panel closes itself neither way — re-open it to confirm the
    // sent Drone dropped out of the now-available list.
    fireEvent.click(document.querySelector('.event-icon-fallentree') as Element)
    const remainingSendButtons = screen.getAllByRole('button', { name: 'Send' })
    expect(remainingSendButtons).toHaveLength(1)
  })

  it('shows the sent Drone as Investigating tree-1 in its own status panel', () => {
    render(<RokuaMap world={world} scenario={fallenTreeScenario} />)

    fireEvent.click(document.querySelector('.event-icon-fallentree') as Element)
    fireEvent.click(screen.getAllByRole('button', { name: 'Send' })[0])

    fireEvent.click(document.querySelector('.asset-icon-quadrocopter') as Element)
    const panel = screen.getByRole('dialog')
    expect(panel).toHaveTextContent('Investigating')
    expect(panel).toHaveTextContent('tree-1')
  })

  it('closes the Event panel when a different asset marker is clicked instead', () => {
    render(<RokuaMap world={world} scenario={fallenTreeScenario} />)

    fireEvent.click(document.querySelector('.event-icon-fallentree') as Element)
    expect(screen.getByRole('dialog')).toHaveTextContent('tree-1')

    fireEvent.click(document.querySelector('.asset-icon-tower') as Element)
    expect(screen.getByRole('dialog')).not.toHaveTextContent('tree-1')
    expect(screen.getByRole('dialog')).toHaveTextContent('tower-1')
  })

  it('closes the asset status panel when a Detected Event marker is clicked instead', () => {
    render(<RokuaMap world={world} scenario={fallenTreeScenario} />)

    fireEvent.click(document.querySelector('.asset-icon-tower') as Element)
    expect(screen.getByRole('dialog')).toHaveTextContent('tower-1')

    fireEvent.click(document.querySelector('.event-icon-fallentree') as Element)
    expect(screen.getByRole('dialog')).not.toHaveTextContent('tower-1')
    expect(screen.getByRole('dialog')).toHaveTextContent('tree-1')
  })

  it('opens Fire\'s own Detection Status/dispatch panel (not this Event-only "available Drones" list) when clicking a Detected Fire (issue T/U, not this describe block\'s scope)', () => {
    const fireScenario: Scenario = {
      events: [{ id: 'fire-1', type: 'Fire', position: { lat: 64.7, lng: 26.2 }, spawnAtSimSeconds: 0 }],
      wind: TEST_WIND,
    }
    render(<RokuaMap world={world} scenario={fireScenario} />)

    fireEvent.click(document.querySelector('.event-icon-fire') as Element)

    const panel = screen.getByRole('dialog')
    expect(panel).toHaveTextContent('fire-1')
    // The Fire panel's own Bingo Range/One-Way Mission dispatch UI (issue
    // U) is exercised separately below — this test only confirms clicking
    // a Fire opens *a* Fire panel, not this Event-only describe block's
    // simple "available Drones" list.
    expect(panel).not.toHaveTextContent('Available Drones')
  })
})

describe('RokuaMap Fire clickable Detection Status panel (issue T)', () => {
  // tower-1 sits at (64.7, 26.2) with a 15000m detectionRadiusMeters — this
  // Fire spawns right on top of it, guaranteeing a Tower Detection at
  // elapsedSimSeconds 0.
  const fireWithinTowerRange: Scenario = {
    events: [{ id: 'fire-1', type: 'Fire', position: { lat: 64.7, lng: 26.2 }, spawnAtSimSeconds: 0 }],
    wind: TEST_WIND,
    startDateTimeIso: '2026-06-01T08:00:00.000Z',
  }

  it('opens a Detection Status panel (plus, since issue U, a dispatch section) when a Tower-Detected Fire marker is clicked', () => {
    render(<RokuaMap world={world} scenario={fireWithinTowerRange} />)

    fireEvent.click(document.querySelector('.event-icon-fire') as Element)

    const panel = screen.getByRole('dialog')
    expect(panel).toHaveTextContent('fire-1')
    expect(panel).toHaveTextContent('tower-1')
    expect(panel).toHaveTextContent('Tower-Detected')
    // Scenario Epoch + elapsedSimSeconds 0 => the Epoch itself.
    expect(panel).toHaveTextContent('2026-06-01 08:00:00')
    // The Bingo Range/One-Way Mission dispatch section itself (issue U) is
    // covered in its own describe block below.
    expect(panel).toHaveTextContent('Bingo Range')
    expect(panel).toHaveTextContent('One-Way Mission')
  })

  it('closes the Fire panel via its close button', () => {
    render(<RokuaMap world={world} scenario={fireWithinTowerRange} />)

    fireEvent.click(document.querySelector('.event-icon-fire') as Element)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes the Fire panel when a different asset marker is clicked instead', () => {
    render(<RokuaMap world={world} scenario={fireWithinTowerRange} />)

    fireEvent.click(document.querySelector('.event-icon-fire') as Element)
    expect(screen.getByRole('dialog')).toHaveTextContent('fire-1')

    fireEvent.click(document.querySelector('.asset-icon-base-station') as Element)
    expect(screen.getByRole('dialog')).not.toHaveTextContent('fire-1')
    expect(screen.getByRole('dialog')).toHaveTextContent('base-1')
  })

  it('closes the asset status panel when a clickable Fire marker is clicked instead', () => {
    render(<RokuaMap world={world} scenario={fireWithinTowerRange} />)

    fireEvent.click(document.querySelector('.asset-icon-tower') as Element)
    expect(screen.getByRole('dialog', { name: /Tower tower-1 status/ })).toBeInTheDocument()

    fireEvent.click(document.querySelector('.event-icon-fire') as Element)
    expect(screen.queryByRole('dialog', { name: /Tower tower-1 status/ })).toBeNull()
    expect(screen.getByRole('dialog')).toHaveTextContent('fire-1')
  })

  it('never opens a panel when clicking an Undetected Fire, even in Ground Truth View', () => {
    const fireOutsideTowerRange: Scenario = {
      events: [{ id: 'fire-1', type: 'Fire', position: { lat: 64.3, lng: 26.9 }, spawnAtSimSeconds: 0 }],
      wind: TEST_WIND,
    }
    render(<RokuaMap world={world} scenario={fireOutsideTowerRange} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ground Truth View' }))

    const marker = document.querySelector('.event-icon-fire')
    expect(marker).toHaveClass('event-icon-undetected')
    fireEvent.click(marker as Element)

    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('RokuaMap Uncertainty Ellipse default-view treatment (issue S)', () => {
  // tower-1 sits at (64.7, 26.2) with a 15000m detectionRadiusMeters — this
  // Fire spawns right on top of it, guaranteeing a Tower Detection at
  // elapsedSimSeconds 0.
  const fireWithinTowerRange: Scenario = {
    events: [{ id: 'fire-1', type: 'Fire', position: { lat: 64.7, lng: 26.2 }, spawnAtSimSeconds: 0 }],
    wind: TEST_WIND,
  }

  it('shows an Uncertainty Ellipse (not the real hex footprint, not a plain marker only) for a Tower-Detected Fire in the default view', () => {
    render(<RokuaMap world={world} scenario={fireWithinTowerRange} />)

    expect(document.querySelectorAll('.uncertainty-ellipse')).toHaveLength(1)
    expect(document.querySelectorAll('.fire-footprint-hex')).toHaveLength(0)
    expect(document.querySelector('.event-icon-fire')).not.toBeNull()
  })

  it('keeps showing the real Fire Footprint (not the Uncertainty Ellipse) in Ground Truth View, unaffected by this slice', () => {
    render(<RokuaMap world={world} scenario={fireWithinTowerRange} />)

    fireEvent.click(screen.getByRole('checkbox', { name: 'Ground Truth View' }))

    expect(document.querySelectorAll('.uncertainty-ellipse')).toHaveLength(0)
    expect(document.querySelectorAll('.fire-footprint-hex').length).toBeGreaterThan(0)
  })

  it('keeps showing exactly one Uncertainty Ellipse as the Simulation Clock advances (size growth itself is covered by engine/uncertaintyEllipse.test.ts)', () => {
    render(<RokuaMap world={world} scenario={fireWithinTowerRange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Step' }))
    fireEvent.click(screen.getByRole('button', { name: 'Step' }))

    expect(document.querySelectorAll('.uncertainty-ellipse')).toHaveLength(1)
  })
})

describe('RokuaMap Fire manual dispatch — Bingo Range / One-Way Mission (issue U)', () => {
  // tower-1 (64.7, 26.2, 15000m radius) guarantees Tower Detection at
  // elapsedSimSeconds 0. Both World Drones (drone-1/drone-2, homed at
  // base-1 near 64.5/26.25 — see the top-of-file `world` fixture) sit
  // roughly 22km from this Fire with `droneSpecFixture`'s generous
  // 7200s/10 m/s endurance/cruise-speed, comfortably inside Bingo Range
  // (round trip well under the ~72km budget).
  const fireWithinTowerRange: Scenario = {
    events: [{ id: 'fire-1', type: 'Fire', position: { lat: 64.7, lng: 26.2 }, spawnAtSimSeconds: 0 }],
    wind: TEST_WIND,
  }

  it('shows both Bingo Range Drones with a Send button, and no Drone in the One-Way Mission list', () => {
    render(<RokuaMap world={world} scenario={fireWithinTowerRange} />)

    fireEvent.click(document.querySelector('.event-icon-fire') as Element)

    const panel = screen.getByRole('dialog')
    expect(panel).toHaveTextContent('drone-1')
    expect(panel).toHaveTextContent('drone-2')
    expect(panel).toHaveTextContent('No Drones available for a One-Way Mission')
    expect(screen.getAllByRole('button', { name: 'Send' })).toHaveLength(2)
  })

  it('assigns the sent Drone to the Fire, removes it from patrol availability, and drops it from the Fire panel\'s lists', () => {
    render(<RokuaMap world={world} scenario={fireWithinTowerRange} />)

    fireEvent.click(document.querySelector('.event-icon-fire') as Element)
    fireEvent.click(screen.getAllByRole('button', { name: 'Send' })[0])

    // Re-open the Fire panel — the sent Drone should have dropped out.
    fireEvent.click(document.querySelector('.event-icon-fire') as Element)
    expect(screen.getAllByRole('button', { name: 'Send' })).toHaveLength(1)

    // The sent Drone's own status panel confirms it switched off patrol.
    fireEvent.click(document.querySelector('.asset-icon-quadrocopter') as Element)
    const dronePanel = screen.getByRole('dialog')
    expect(dronePanel).toHaveTextContent('Investigating')
    expect(dronePanel).toHaveTextContent('fire-1')
  })

  it('never shows a Drone that is already investigating something else in either list', () => {
    render(<RokuaMap world={world} scenario={fireWithinTowerRange} />)

    fireEvent.click(document.querySelector('.event-icon-fire') as Element)
    fireEvent.click(screen.getAllByRole('button', { name: 'Send' })[0])

    fireEvent.click(document.querySelector('.event-icon-fire') as Element)
    const panel = screen.getByRole('dialog')
    expect(screen.getAllByRole('button', { name: 'Send' })).toHaveLength(1)
    expect(panel).not.toHaveTextContent('drone-1')
  })
})

describe('RokuaMap Return Envelope overlay (issue K)', () => {
  const base1Position = { lat: 64.5, lng: 26.25 }
  // 3500m east of base-1 — tuned against maxEnduranceSimSeconds/
  // cruiseSpeedMetersPerSecond below so it's reachable at t=0 but not after
  // one Simulation Clock Step (see the "shrinks over simulated time" test).
  const base2Position = offsetLatLng(base1Position, 3500, 0)

  const returnEnvelopeWorld: World = {
    bounds: world.bounds,
    towers: [{ id: 'tower-1', type: 'Tower', position: { lat: 64.7, lng: 26.2 }, detectionRadiusMeters: 15000 }],
    baseStations: [
      { id: 'base-1', type: 'BaseStation', position: base1Position },
      { id: 'base-2', type: 'BaseStation', position: base2Position },
    ],
    drones: [
      {
        id: 'drone-1',
        type: 'Quadrocopter',
        position: base1Position,
        homeBaseStationId: 'base-1',
        ...droneSpecFixture,
        // Stationary right on top of base-1 (radius 1m, zero patrol speed)
        // so the Return Envelope's foci stay deterministic across Steps.
        patrolRadiusMeters: 1,
        patrolSpeedMetersPerSecond: 0,
        // budget(t=0) = 200 * 20 = 4000m: feasible for both base-1 (~1m
        // away) and base-2 (3500m away). budget(t=30, after one Step) =
        // (200-30) * 20 = 3400m: still feasible for base-1, no longer
        // enough to reach base-2 (3500m).
        maxEnduranceSimSeconds: 200,
        cruiseSpeedMetersPerSecond: 20,
      },
    ],
  }

  const noEvents: Scenario = { events: [], wind: TEST_WIND }

  it('shows no Return Envelope overlay until a Drone is selected', () => {
    render(<RokuaMap world={returnEnvelopeWorld} scenario={noEvents} />)

    expect(document.querySelectorAll('.return-envelope')).toHaveLength(0)
  })

  it('shows one ellipse per feasible Base Station (the union) once a Drone is selected', () => {
    render(<RokuaMap world={returnEnvelopeWorld} scenario={noEvents} />)

    fireEvent.click(document.querySelector('.asset-icon-quadrocopter') as Element)

    expect(document.querySelectorAll('.return-envelope')).toHaveLength(2)
  })

  it('hides the Return Envelope overlay when the status panel is closed', () => {
    render(<RokuaMap world={returnEnvelopeWorld} scenario={noEvents} />)

    fireEvent.click(document.querySelector('.asset-icon-quadrocopter') as Element)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(document.querySelectorAll('.return-envelope')).toHaveLength(0)
  })

  it('hides the Return Envelope overlay once a different asset is selected instead', () => {
    render(<RokuaMap world={returnEnvelopeWorld} scenario={noEvents} />)

    fireEvent.click(document.querySelector('.asset-icon-quadrocopter') as Element)
    fireEvent.click(document.querySelector('.asset-icon-tower') as Element)

    expect(document.querySelectorAll('.return-envelope')).toHaveLength(0)
  })

  it('never shows a Return Envelope when a Tower is selected', () => {
    render(<RokuaMap world={returnEnvelopeWorld} scenario={noEvents} />)

    fireEvent.click(document.querySelector('.asset-icon-tower') as Element)

    expect(document.querySelectorAll('.return-envelope')).toHaveLength(0)
  })

  it('never shows a Return Envelope when a Base Station is selected', () => {
    render(<RokuaMap world={returnEnvelopeWorld} scenario={noEvents} />)

    fireEvent.click(document.querySelectorAll('.asset-icon-base-station')[0] as Element)

    expect(document.querySelectorAll('.return-envelope')).toHaveLength(0)
  })

  it('shrinks over simulated time: a farther Base Station drops out of the union once the shrinking budget can no longer reach it', () => {
    render(<RokuaMap world={returnEnvelopeWorld} scenario={noEvents} />)

    fireEvent.click(document.querySelector('.asset-icon-quadrocopter') as Element)
    expect(document.querySelectorAll('.return-envelope')).toHaveLength(2)

    // Advances by STEP_SIM_SECONDS (30 simulated seconds — see
    // useSimulationClock.ts), exactly enough to drop base-2 out of budget.
    fireEvent.click(screen.getByRole('button', { name: 'Step' }))

    expect(document.querySelectorAll('.return-envelope')).toHaveLength(1)
  })
})

describe('RokuaMap Lost Drone / One-Way Mission endurance exhaustion (issue W)', () => {
  const firePosition = { lat: 64.7, lng: 26.2 }
  // drone-1's home Base Station sits 300m from the Fire, and it patrols a
  // tight 1m loop right on top of that Base Station — so its live patrol
  // position is ~300m from the Fire at dispatch time. Budget at
  // `maxEnduranceSimSeconds` 40 * `cruiseSpeedMetersPerSecond` 10 = 400m
  // clears that one-way 300m leg (`classifyFireDispatch`'s `'oneWayMission'`
  // condition), but not the ~600m round trip back to the same (only) Base
  // Station (`'bingoRange'`'s condition) — guaranteeing `'oneWayMission'`,
  // never `'bingoRange'`, without needing a realistic-distance World.
  const baseStationPosition = offsetLatLng(firePosition, 300, 0)
  const lostDroneWorld: World = {
    bounds: world.bounds,
    towers: [{ id: 'tower-1', type: 'Tower', position: firePosition, detectionRadiusMeters: 500 }],
    baseStations: [{ id: 'base-1', type: 'BaseStation', position: baseStationPosition }],
    drones: [
      {
        id: 'drone-1',
        type: 'Quadrocopter',
        position: baseStationPosition,
        homeBaseStationId: 'base-1',
        ...droneSpecFixture,
        maxEnduranceSimSeconds: 40,
        cruiseSpeedMetersPerSecond: 10,
        patrolRadiusMeters: 1,
      },
    ],
  }

  const fireScenario: Scenario = {
    events: [{ id: 'fire-1', type: 'Fire', position: firePosition, spawnAtSimSeconds: 0 }],
    wind: TEST_WIND,
  }

  /** Opens the Fire panel, sends `drone-1` on the One-Way Mission, then advances the Simulation Clock two Steps (60 simulated seconds — comfortably past the 40s `maxEnduranceSimSeconds` above) so it goes Lost. */
  function renderWithLostDrone() {
    render(<RokuaMap world={lostDroneWorld} scenario={fireScenario} />)

    fireEvent.click(document.querySelector('.event-icon-fire') as Element)
    expect(screen.getByRole('dialog')).toHaveTextContent('No Drones currently in Bingo Range')
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    fireEvent.click(screen.getByRole('button', { name: 'Step' }))
    fireEvent.click(screen.getByRole('button', { name: 'Step' }))
  }

  it('renders the Lost Drone marker with the greyed-out asset-icon-lost treatment', () => {
    renderWithLostDrone()

    const marker = document.querySelector('.asset-icon-quadrocopter')
    expect(marker).not.toBeNull()
    expect(marker).toHaveClass('asset-icon-lost')
  })

  it('shows "Lost" as the Drone\'s own status-panel state', () => {
    renderWithLostDrone()

    fireEvent.click(document.querySelector('.asset-icon-quadrocopter') as Element)

    expect(screen.getByRole('dialog')).toHaveTextContent('Lost')
  })

  it('never lists the Lost Drone in the Fire panel\'s Bingo Range/One-Way Mission lists again', () => {
    renderWithLostDrone()

    fireEvent.click(document.querySelector('.event-icon-fire') as Element)

    const panel = screen.getByRole('dialog')
    expect(panel).toHaveTextContent('No Drones currently in Bingo Range')
    expect(panel).toHaveTextContent('No Drones available for a One-Way Mission')
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull()
  })

  it('renders no Datalink line for the Lost Drone', () => {
    renderWithLostDrone()

    expect(document.querySelector('.datalink-line-drone-drone-1')).toBeNull()
  })

  it('renders no Return Envelope for the Lost Drone even once its status panel is open', () => {
    renderWithLostDrone()

    fireEvent.click(document.querySelector('.asset-icon-quadrocopter') as Element)

    expect(document.querySelectorAll('.return-envelope')).toHaveLength(0)
  })

  it('keeps the Drone frozen at its Lost position as the Simulation Clock advances further, rather than resuming any movement', () => {
    renderWithLostDrone()

    fireEvent.click(document.querySelector('.asset-icon-quadrocopter') as Element)
    const positionAtLoss = screen.getByRole('dialog').textContent

    fireEvent.click(screen.getByRole('button', { name: 'Step' }))
    fireEvent.click(document.querySelector('.asset-icon-quadrocopter') as Element)
    const positionMuchLater = screen.getByRole('dialog').textContent

    expect(positionMuchLater).toEqual(positionAtLoss)
  })
})
