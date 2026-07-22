import { describe, expect, it } from 'vitest'
import { advanceSimulation, initializeSimulationState } from '../engine/advanceSimulation'
import { INVESTIGATION_DURATION_SIM_SECONDS } from '../engine/dispatch'
import type { SimulationState } from '../engine/types'
import { parseWorld } from '../world/schema'
import { parseScenario } from './schema'
import type { Scenario } from './types'
import worldJson from '../../public/world.json'
import quietDayJson from '../../public/scenario-quiet-day.json'
import wildfireOutbreakJson from '../../public/scenario-wildfire-outbreak.json'
import hikerIntrusionJson from '../../public/scenario-hiker-intrusion.json'

/**
 * Proves issue H's acceptance criteria against the *real* `public/world.json`
 * roster and the three bundled `scenario-*.json` files, not fixtures — this
 * is the "actually run it through `initializeSimulationState`/
 * `advanceSimulation` and assert the specific outcomes" verification issue
 * H's design guidance calls for, kept as a permanent regression test rather
 * than a throwaway script since it's cheap and protects the tuned
 * positions/timings above from silent drift (e.g. an unrelated `world.json`
 * edit quietly breaking a scenario's geometry).
 *
 * Ticks at 1 simulated second granularity — the same order of granularity
 * `useSimulationClock` drives the engine at (see `advanceSimulation.ts`'s
 * "Tick-resolution caveat") — over each scenario's relevant window, so nth
 * timing assertions below are reading off the same tick sequence a real run
 * would produce, not one coarse jump that could mask a missed detection.
 */
function runScenario(scenario: Scenario, lastElapsedSimSeconds: number, onTick?: (state: SimulationState) => void): SimulationState {
  const world = parseWorld(worldJson)
  let state = initializeSimulationState(world, scenario)
  onTick?.(state)
  for (let elapsedSimSeconds = 1; elapsedSimSeconds <= lastElapsedSimSeconds; elapsedSimSeconds += 1) {
    state = advanceSimulation(state, elapsedSimSeconds)
    onTick?.(state)
  }
  return state
}

const droneIds = ['drone-1', 'drone-2', 'drone-3', 'drone-4']
const towerIds = ['tower-1', 'tower-2']

describe('bundled scenarios load and run without errors against the real world.json', () => {
  it.each([
    ['Quiet Day', quietDayJson],
    ['Wildfire Outbreak', wildfireOutbreakJson],
    ['Hiker Intrusion', hikerIntrusionJson],
  ])('%s parses and runs for 400 simulated seconds with no thrown error', (_name, json) => {
    const scenario = parseScenario(json)
    expect(() => runScenario(scenario, 400)).not.toThrow()
  })
})

describe('"Quiet Day" produces only Fallen Tree Detections, never a Fire Detection', () => {
  const scenario = parseScenario(quietDayJson)

  it('contains zero Fire Events in its script at all (the strongest possible guarantee)', () => {
    expect(scenario.events.some((event) => event.type === 'Fire')).toBe(false)
  })

  it('never produces an Event with type Fire and status other than undetected, at any tick over a 400s run', () => {
    const ticksWithAFireDetection: number[] = []
    runScenario(scenario, 400, (state) => {
      for (const event of Object.values(state.events)) {
        if (event.type === 'Fire' && event.status !== 'undetected') {
          ticksWithAFireDetection.push(state.elapsedSimSeconds)
        }
      }
    })
    expect(ticksWithAFireDetection).toEqual([])
  })

  it('actually detects the Fallen Tree near base-1 (reaches "detected", not just "spawned")', () => {
    const state = runScenario(scenario, 400)
    expect(state.events['quiet-day-fallen-tree-base1'].status).not.toBe('undetected')
    expect(state.events['quiet-day-fallen-tree-base1'].detectedByAssetId).toBe('drone-1')
  })

  it('actually detects the Fallen Tree near base-2 too', () => {
    const state = runScenario(scenario, 400)
    expect(state.events['quiet-day-fallen-tree-base2'].status).not.toBe('undetected')
    expect(state.events['quiet-day-fallen-tree-base2'].detectedByAssetId).toBe('drone-3')
  })

  it('the base-1 Fallen Tree actually reaches "resolved" (demonstrates issue G resolution too)', () => {
    const state = runScenario(scenario, 400)
    expect(state.events['quiet-day-fallen-tree-base1'].status).toBe('resolved')
  })

  it('leaves the remote Fallen Tree undetected for the whole run (out of reach of every Tower/Drone) — the Ground Truth contrast', () => {
    const state = runScenario(scenario, 400)
    expect(state.events['quiet-day-fallen-tree-remote'].status).toBe('undetected')
  })
})

describe('"Wildfire Outbreak" — Tower Detection followed by a Drone dispatch/investigate/resolve cycle', () => {
  const scenario = parseScenario(wildfireOutbreakJson)
  const fireId = 'wildfire-outbreak-fire-1'
  const spawnAtSimSeconds = (scenario.events[0].spawnAtSimSeconds ?? 0)

  it('is undetected before its spawn time', () => {
    const state = runScenario(scenario, spawnAtSimSeconds - 1)
    expect(state.events[fireId]).toBeUndefined()
  })

  it('is Detected by a Tower (not a Drone) at/just after spawn', () => {
    const state = runScenario(scenario, spawnAtSimSeconds)
    expect(state.events[fireId].status).toBe('detected')
    expect(state.events[fireId].detectedByAssetId).toBeDefined()
    expect(towerIds).toContain(state.events[fireId].detectedByAssetId)
    expect(droneIds).not.toContain(state.events[fireId].detectedByAssetId)
  })

  it('specifically, tower-1 is the detecting Tower (within its 15km radius, per the chosen placement)', () => {
    const state = runScenario(scenario, spawnAtSimSeconds)
    expect(state.events[fireId].detectedByAssetId).toBe('tower-1')
  })

  it('dispatches exactly one Drone to "investigating" this Event, in the same tick as Detection', () => {
    const state = runScenario(scenario, spawnAtSimSeconds)
    const investigating = Object.entries(state.droneActivity).filter(([, activity]) => activity.mode === 'investigating')
    expect(investigating).toHaveLength(1)
    const [droneId, activity] = investigating[0]
    expect(droneIds).toContain(droneId)
    expect(activity).toMatchObject({ assignedEventId: fireId })
  })

  it('the dispatched Drone reverts to "patrolling" once the investigation interval elapses', () => {
    const stateDuring = runScenario(scenario, spawnAtSimSeconds + INVESTIGATION_DURATION_SIM_SECONDS - 1)
    const stillInvestigating = Object.values(stateDuring.droneActivity).filter((activity) => activity.mode === 'investigating')
    expect(stillInvestigating).toHaveLength(1)

    const stateAfter = runScenario(scenario, spawnAtSimSeconds + INVESTIGATION_DURATION_SIM_SECONDS)
    const stillInvestigatingAfter = Object.values(stateAfter.droneActivity).filter((activity) => activity.mode === 'investigating')
    expect(stillInvestigatingAfter).toHaveLength(0)
  })

  it('the Fire Event eventually resolves within a reasonable demo length', () => {
    const durationSimSeconds = scenario.events[0].durationSimSeconds
    expect(durationSimSeconds).toBeDefined()

    const justBefore = runScenario(scenario, spawnAtSimSeconds + (durationSimSeconds as number) - 1)
    expect(justBefore.events[fireId].status).toBe('detected')

    const atResolution = runScenario(scenario, spawnAtSimSeconds + (durationSimSeconds as number))
    expect(atResolution.events[fireId].status).toBe('resolved')
  })
})

describe('"Hiker Intrusion" — invisible fog-of-war stretch, then Detected by a patrolling Drone', () => {
  const scenario = parseScenario(hikerIntrusionJson)
  const personId = 'hiker-intrusion-person-1'

  it('is never Detected by a Tower, structurally (Towers only ever check Fire Events)', () => {
    expect(scenario.events[0].type).toBe('PersonSighting')
  })

  it('is still "undetected" a full 90 simulated seconds after spawn (a real, noticeable fog-of-war stretch)', () => {
    const state = runScenario(scenario, 90)
    expect(state.events[personId].status).toBe('undetected')
  })

  it('is still "undetected" at 150s — comfortably before the tuned Drone sweep reaches it', () => {
    const state = runScenario(scenario, 150)
    expect(state.events[personId].status).toBe('undetected')
  })

  it('becomes "detected" by 250s, once the patrolling Drone (drone-2) sweeps within range', () => {
    const state = runScenario(scenario, 250)
    expect(state.events[personId].status).toBe('detected')
    expect(state.events[personId].detectedByAssetId).toBe('drone-2')
    expect(towerIds).not.toContain(state.events[personId].detectedByAssetId)
  })

  it('finds the exact tick it first flips to "detected", confirming a real (non-instant) delay', () => {
    let firstDetectedAtSimSeconds: number | undefined
    runScenario(scenario, 400, (state) => {
      if (firstDetectedAtSimSeconds === undefined && state.events[personId]?.status === 'detected') {
        firstDetectedAtSimSeconds = state.elapsedSimSeconds
      }
    })
    expect(firstDetectedAtSimSeconds).toBeDefined()
    expect(firstDetectedAtSimSeconds as number).toBeGreaterThanOrEqual(60)
  })
})

describe('the scenario dropdown registry', () => {
  it('lists all three PRD-named scenarios with the exact PRD names', async () => {
    const { BUNDLED_SCENARIOS } = await import('./bundledScenarios')
    const names = BUNDLED_SCENARIOS.map((entry) => entry.name)
    expect(names).toEqual(['Quiet Day', 'Wildfire Outbreak', 'Hiker Intrusion'])
    for (const entry of BUNDLED_SCENARIOS) {
      expect(entry.description.length).toBeGreaterThan(0)
    }
  })
})
