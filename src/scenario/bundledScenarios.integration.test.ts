import { describe, expect, it } from 'vitest'
import { advanceSimulation, initializeSimulationState, withManualClearcutDispatch } from '../engine/advanceSimulation'
import { isClearcutBingoRangeEligible } from '../engine/bingoRange'
import { clearcutOrbitRadiusMeters } from '../engine/clearcutFootprint'
import { INVESTIGATION_DURATION_SIM_SECONDS } from '../engine/dispatch'
import { droneTelemetryFor } from '../engine/telemetry'
import type { SimulationState } from '../engine/types'
import { parseWorld } from '../world/schema'
import { parseScenario } from './schema'
import type { Scenario } from './types'
import worldJson from '../../public/world.json'
import quietDayJson from '../../public/scenario-quiet-day.json'
import wildfireOutbreakJson from '../../public/scenario-wildfire-outbreak.json'
import hikerIntrusionJson from '../../public/scenario-hiker-intrusion.json'
import illegalDeforestationJson from '../../public/scenario-illegal-deforestation.json'

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
    ['Illegal Deforestation', illegalDeforestationJson],
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

  it('never produces a Fire with a tier other than undetected, at any tick over a 400s run', () => {
    const ticksWithAFireDetection: number[] = []
    runScenario(scenario, 400, (state) => {
      for (const fire of Object.values(state.fires)) {
        if (fire.tier !== 'undetected') {
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

describe('"Wildfire Outbreak" — Tower Detection of a Fire (issue Q: Fire dispatch/investigation is out of scope here)', () => {
  const scenario = parseScenario(wildfireOutbreakJson)
  const fireId = 'wildfire-outbreak-fire-1'
  const spawnAtSimSeconds = (scenario.events[0].spawnAtSimSeconds ?? 0)

  it('is undetected before its spawn time', () => {
    const state = runScenario(scenario, spawnAtSimSeconds - 1)
    expect(state.fires[fireId]).toBeUndefined()
  })

  it('is Tower-Detected (not by a Drone) at/just after spawn', () => {
    const state = runScenario(scenario, spawnAtSimSeconds)
    expect(state.fires[fireId].tier).toBe('towerDetected')
    expect(state.fires[fireId].detectedByAssetId).toBeDefined()
    expect(towerIds).toContain(state.fires[fireId].detectedByAssetId)
    expect(droneIds).not.toContain(state.fires[fireId].detectedByAssetId)
  })

  it('specifically, tower-1 is the detecting Tower (within its 15km radius, per the chosen placement)', () => {
    const state = runScenario(scenario, spawnAtSimSeconds)
    expect(state.fires[fireId].detectedByAssetId).toBe('tower-1')
  })

  it('does not dispatch any Drone for the Fire — Fire dispatch/investigation comes in a later issue', () => {
    const state = runScenario(scenario, spawnAtSimSeconds)
    const investigating = Object.entries(state.droneActivity).filter(([, activity]) => activity.mode === 'investigating')
    expect(investigating).toHaveLength(0)
  })

  it('stays Tower-Detected (never auto-resolves; Fire has no "resolved" tier) well past a typical demo length', () => {
    const state = runScenario(scenario, spawnAtSimSeconds + INVESTIGATION_DURATION_SIM_SECONDS + 120)
    expect(state.fires[fireId].tier).toBe('towerDetected')
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

  it('is still "undetected" at 200s — comfortably before the routed Drone sweep reaches it', () => {
    // Issue AA: drone-2 now flies a wide world Patrol Route (a big western
    // sweep) rather than its old tight base-1 perimeter loop, so its pass
    // near the hiker lands a little later (first Detection at 251s — see
    // below) than the old base loop's ~sub-250s pass. Still a long,
    // demonstrable fog-of-war stretch first.
    const state = runScenario(scenario, 200)
    expect(state.events[personId].status).toBe('undetected')
  })

  it('becomes "detected" by 300s, once the routed Drone (drone-2) sweeps within range', () => {
    const state = runScenario(scenario, 300)
    expect(state.events[personId].status).toBe('detected')
    expect(state.events[personId].detectedByAssetId).toBe('drone-2')
    expect(towerIds).not.toContain(state.events[personId].detectedByAssetId)
  })

  it('finds the exact tick it first flips to "detected" (251s under the issue AA Patrol Route), confirming a real (non-instant) delay', () => {
    let firstDetectedAtSimSeconds: number | undefined
    runScenario(scenario, 400, (state) => {
      if (firstDetectedAtSimSeconds === undefined && state.events[personId]?.status === 'detected') {
        firstDetectedAtSimSeconds = state.elapsedSimSeconds
      }
    })
    expect(firstDetectedAtSimSeconds).toBe(251)
  })
})

describe('"Illegal Deforestation" — a default-patrol Drone spots the Clearcut from a distance (issue X)', () => {
  const scenario = parseScenario(illegalDeforestationJson)
  const clearcutId = 'illegal-deforestation-clearcut-1'

  it('spawns the Clearcut into SimulationState.clearcuts (a sibling map), never into events/fires', () => {
    const state = runScenario(scenario, 1)
    expect(state.clearcuts[clearcutId]).toBeDefined()
    expect(state.events[clearcutId]).toBeUndefined()
    expect(state.fires[clearcutId]).toBeUndefined()
  })

  it('is still undetected early on (a real fog-of-war stretch before the patrol sweep reaches it)', () => {
    const state = runScenario(scenario, 60)
    expect(state.clearcuts[clearcutId].tier).toBe('undetected')
  })

  it('is detected by a Fixed-Wing Drone (drone-2), never a Tower, within the run', () => {
    const state = runScenario(scenario, 400)
    expect(state.clearcuts[clearcutId].tier).toBe('detected')
    expect(state.clearcuts[clearcutId].detectedByAssetId).toBe('drone-2')
    expect(droneIds).toContain(state.clearcuts[clearcutId].detectedByAssetId)
    expect(towerIds).not.toContain(state.clearcuts[clearcutId].detectedByAssetId)
  })

  it('is an estimate-only Detection — it never auto-investigates (tier stays "detected", not "investigated")', () => {
    let everInvestigated = false
    const state = runScenario(scenario, 400, (s) => {
      if (s.clearcuts[clearcutId]?.tier === 'investigated') everInvestigated = true
    })
    expect(everInvestigated).toBe(false)
    expect(state.clearcuts[clearcutId].tier).toBe('detected')
  })

  it('records the detecting-Drone distance at Detection (for the fixed, distance-only estimate)', () => {
    const state = runScenario(scenario, 400)
    expect(state.clearcuts[clearcutId].detectedFromDistanceMeters).toBeDefined()
  })

  it('is deterministic: the same run twice produces an identical first-Detection tick', () => {
    const firstDetectedTick = () => {
      let tick: number | undefined
      runScenario(parseScenario(illegalDeforestationJson), 400, (state) => {
        if (tick === undefined && state.clearcuts[clearcutId]?.tier === 'detected') tick = state.elapsedSimSeconds
      })
      return tick
    }
    const runA = firstDetectedTick()
    const runB = firstDetectedTick()
    expect(runA).toBeDefined()
    expect(runA).toBe(runB)
  })
})

describe('"Illegal Deforestation" — the tuned scenario (issue BB): estimate-only patrol Detection within 5 minutes, then a manual Bingo-Range investigation reveals 3 clustered Person Sightings', () => {
  const scenario = parseScenario(illegalDeforestationJson)
  const world = parseWorld(worldJson)
  const clearcutId = 'illegal-deforestation-clearcut-1'
  const sightingIds = [
    'illegal-deforestation-sighting-1',
    'illegal-deforestation-sighting-2',
    'illegal-deforestation-sighting-3',
  ]

  /**
   * Runs `scenario` from scratch, letting a Fixed-Wing Drone's ordinary
   * patrol pass Detect the Clearcut, then — the instant it does — manually
   * Bingo-Range-dispatches that same detecting Drone to investigate it
   * (mirroring the `ClearcutPanel`'s single Bingo-Range "Send" list) and
   * continues ticking through a full orbit lap and well beyond. Returns the
   * full detection timeline plus the final state, so a single deterministic
   * run can be asserted on from multiple angles and also compared,
   * wholesale, against a second independent run (determinism).
   */
  function runDetectDispatchAndInvestigate(scenarioInstance: Scenario): {
    finalState: SimulationState
    clearcutDetectedAtSimSeconds: number
    detectingDroneId: string
    bingoRangeEligibleAtDetection: boolean
    clearcutInvestigatedAtSimSeconds: number
    sightingDetectedAtSimSeconds: Record<string, number | undefined>
  } {
    let clearcutDetectedAtSimSeconds: number | undefined
    let stateAtDetection: SimulationState | undefined

    runScenario(scenarioInstance, 300, (s) => {
      if (clearcutDetectedAtSimSeconds === undefined && s.clearcuts[clearcutId]?.tier === 'detected') {
        clearcutDetectedAtSimSeconds = s.elapsedSimSeconds
        stateAtDetection = s
      }
    })
    if (clearcutDetectedAtSimSeconds === undefined || !stateAtDetection) {
      throw new Error('Clearcut was never Detected within 300 simulated seconds')
    }

    const detectingDroneId = stateAtDetection.clearcuts[clearcutId].detectedByAssetId
    if (!detectingDroneId) throw new Error('Detected Clearcut has no detectedByAssetId')

    const patrol = stateAtDetection.dronePatrol[detectingDroneId]
    const activity = stateAtDetection.droneActivity[detectingDroneId]
    const droneSpec = world.drones.find((d) => d.id === detectingDroneId)
    if (!droneSpec) throw new Error(`Unknown Drone "${detectingDroneId}"`)

    const telemetry = droneTelemetryFor(patrol, activity, stateAtDetection.elapsedSimSeconds, droneSpec.maxEnduranceSimSeconds)
    const orbitRadiusMeters = clearcutOrbitRadiusMeters(stateAtDetection.clearcuts[clearcutId])
    const bingoRangeEligibleAtDetection = isClearcutBingoRangeEligible(
      {
        id: detectingDroneId,
        position: patrol.position,
        remainingEnduranceSimSeconds: telemetry.remainingEnduranceSimSeconds,
        cruiseSpeedMetersPerSecond: droneSpec.cruiseSpeedMetersPerSecond,
      },
      stateAtDetection.clearcuts[clearcutId].position,
      world.baseStations,
      orbitRadiusMeters,
    )

    const dispatched = withManualClearcutDispatch(stateAtDetection, detectingDroneId, clearcutId)

    let state = dispatched
    let clearcutInvestigatedAtSimSeconds: number | undefined
    const sightingDetectedAtSimSeconds: Record<string, number | undefined> = {}
    // One full orbit lap at this Drone's patrol linear speed comfortably
    // completes in well under 400s for every Fixed-Wing Drone in the
    // default world.json — see the exact figures in this describe block's
    // own timing-report test below.
    for (let t = clearcutDetectedAtSimSeconds + 1; t <= clearcutDetectedAtSimSeconds + 400; t += 1) {
      state = advanceSimulation(state, t)
      if (clearcutInvestigatedAtSimSeconds === undefined && state.clearcuts[clearcutId].tier === 'investigated') {
        clearcutInvestigatedAtSimSeconds = t
      }
      for (const sightingId of sightingIds) {
        if (sightingDetectedAtSimSeconds[sightingId] === undefined && state.events[sightingId]?.status !== 'undetected') {
          sightingDetectedAtSimSeconds[sightingId] = t
        }
      }
    }
    if (clearcutInvestigatedAtSimSeconds === undefined) {
      throw new Error('Clearcut never became investigated within 400s of manual dispatch')
    }

    return {
      finalState: state,
      clearcutDetectedAtSimSeconds,
      detectingDroneId,
      bingoRangeEligibleAtDetection,
      clearcutInvestigatedAtSimSeconds,
      sightingDetectedAtSimSeconds,
    }
  }

  it('(a) a Fixed-Wing Drone (drone-2) Detects the Clearcut, as a rough estimate, within the first 300 simulated seconds (5 minutes)', () => {
    const result = runDetectDispatchAndInvestigate(scenario)
    expect(result.detectingDroneId).toBe('drone-2')
    expect(result.clearcutDetectedAtSimSeconds).toBeLessThanOrEqual(300)
    // Sanity-check the authored placement: closest approach to drone-2's
    // Patrol Route is within the issue's 1000-1400m band, verified directly
    // against the recorded Detection distance ceiling (Drones only ever
    // Detect at <= their own detectionRadiusMeters, 1500m for a Fixed-Wing
    // Drone — see world.json).
    expect(result.finalState.clearcuts[clearcutId].detectedFromDistanceMeters).toBeLessThanOrEqual(1500)
  })

  it('(b) the automatic patrol Detection is estimate-only — the Clearcut never auto-investigates on its own (stays "detected" for the whole 300s window and well beyond)', () => {
    let everAutoInvestigated = false
    runScenario(scenario, 1000, (s) => {
      if (s.clearcuts[clearcutId]?.tier === 'investigated') everAutoInvestigated = true
    })
    expect(everAutoInvestigated).toBe(false)
  })

  it('(c) all 3 clustered Person Sightings stay "undetected" through pure patrol (no manual dispatch at all) for well over 300 simulated seconds', () => {
    const state = runScenario(scenario, 1000)
    for (const sightingId of sightingIds) {
      expect(state.events[sightingId].status).toBe('undetected')
    }
  })

  it('(d) a manual Bingo-Range dispatch of the detecting Drone, run through one full orbit lap, investigates the Clearcut and reveals all 3 Person Sightings', () => {
    const result = runDetectDispatchAndInvestigate(scenario)

    expect(result.bingoRangeEligibleAtDetection).toBe(true)
    expect(result.finalState.clearcuts[clearcutId].tier).toBe('investigated')

    for (const sightingId of sightingIds) {
      expect(result.finalState.events[sightingId].status).toBe('detected')
      expect(result.sightingDetectedAtSimSeconds[sightingId]).toBeDefined()
      // Every reveal happens as a direct consequence of the dispatched
      // Drone's flight toward/orbit of the Clearcut — never before the
      // operator actually sent it (issue Z's "discovered-on-site" payoff,
      // or this same Drone's own detection radius sweeping over the
      // sighting during that same investigation flight).
      expect(result.sightingDetectedAtSimSeconds[sightingId]!).toBeGreaterThan(result.clearcutDetectedAtSimSeconds)
    }
  })

  it('(e) is fully deterministic: an independent second run produces an identical Detection timeline (Clearcut Detected/Investigated ticks and every Person Sighting Detection tick)', () => {
    const runA = runDetectDispatchAndInvestigate(parseScenario(illegalDeforestationJson))
    const runB = runDetectDispatchAndInvestigate(parseScenario(illegalDeforestationJson))

    expect(runB.clearcutDetectedAtSimSeconds).toBe(runA.clearcutDetectedAtSimSeconds)
    expect(runB.detectingDroneId).toBe(runA.detectingDroneId)
    expect(runB.clearcutInvestigatedAtSimSeconds).toBe(runA.clearcutInvestigatedAtSimSeconds)
    expect(runB.sightingDetectedAtSimSeconds).toEqual(runA.sightingDetectedAtSimSeconds)
  })

  it('reports the exact tuned timings this scenario relies on (a stable regression pin, not just a range check)', () => {
    const result = runDetectDispatchAndInvestigate(scenario)

    expect(result.clearcutDetectedAtSimSeconds).toBe(174)
    expect(result.clearcutInvestigatedAtSimSeconds).toBe(242)
    expect(result.sightingDetectedAtSimSeconds).toEqual({
      'illegal-deforestation-sighting-1': 188,
      'illegal-deforestation-sighting-2': 191,
      'illegal-deforestation-sighting-3': 193,
    })

    // Confirms the one-full-orbit-lap Bingo-Range completion actually
    // happened (rather than, say, the Drone getting stuck orbiting forever):
    // by 400s past Detection, drone-2 has completed its lap and returned to
    // its own normal Patrol Route, per `orbitLapDurationSimSeconds`'s
    // circumference/speed math on this Clearcut's own static orbit radius.
    const orbitRadiusMeters = clearcutOrbitRadiusMeters(result.finalState.clearcuts[clearcutId])
    expect(orbitRadiusMeters).toBe(350)
    expect(result.finalState.droneActivity['drone-2']).toEqual({ mode: 'patrolling' })
  })
})

describe('the scenario dropdown registry', () => {
  it('lists all four bundled scenarios with their exact names', async () => {
    const { BUNDLED_SCENARIOS } = await import('./bundledScenarios')
    const names = BUNDLED_SCENARIOS.map((entry) => entry.name)
    expect(names).toEqual(['Quiet Day', 'Wildfire Outbreak', 'Hiker Intrusion', 'Illegal Deforestation'])
    for (const entry of BUNDLED_SCENARIOS) {
      expect(entry.description.length).toBeGreaterThan(0)
    }
  })
})
