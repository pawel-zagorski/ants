import { useEffect, useRef, useState } from 'react'
import { RokuaMap } from './map/RokuaMap'
import { BUNDLED_SCENARIOS, type BundledScenarioListing } from './scenario/bundledScenarios'
import { loadScenario } from './scenario/loadScenario'
import { ScenarioSelectScreen } from './scenario/ScenarioSelectScreen'
import type { Scenario } from './scenario/types'
import { loadWorld } from './world/loadWorld'
import type { World } from './world/types'

type AppState =
  | { status: 'loading-world' }
  | { status: 'world-load-error'; message: string }
  | { status: 'selecting-scenario'; world: World }
  | { status: 'loading-scenario'; world: World }
  | { status: 'scenario-load-error'; world: World; message: string }
  | { status: 'running'; world: World; scenario: Scenario }

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Top-level flow: load `world.json`, let the operator pick a bundled
 * Scenario and press Play (issue D's start screen), then load that
 * Scenario's Event script and hand both to `RokuaMap`. Each stage fails
 * loudly (a `role="alert"` message) rather than silently falling back.
 */
function App() {
  const [state, setState] = useState<AppState>({ status: 'loading-world' })
  const isMountedRef = useRef(true)

  useEffect(
    () => () => {
      isMountedRef.current = false
    },
    [],
  )

  useEffect(() => {
    loadWorld()
      .then((world) => {
        if (isMountedRef.current) setState({ status: 'selecting-scenario', world })
      })
      .catch((error: unknown) => {
        if (isMountedRef.current) setState({ status: 'world-load-error', message: errorMessage(error) })
      })
  }, [])

  const handlePlay = (world: World, listing: BundledScenarioListing) => {
    setState({ status: 'loading-scenario', world })
    loadScenario(listing.url)
      .then((scenario) => {
        if (isMountedRef.current) setState({ status: 'running', world, scenario })
      })
      .catch((error: unknown) => {
        if (isMountedRef.current) {
          setState({ status: 'scenario-load-error', world, message: errorMessage(error) })
        }
      })
  }

  if (state.status === 'loading-world' || state.status === 'loading-scenario') {
    return <div className="app-status-message">Loading&hellip;</div>
  }

  if (state.status === 'world-load-error') {
    return (
      <div className="app-status-message app-status-error" role="alert">
        Failed to load world.json:
        {'\n'}
        {state.message}
      </div>
    )
  }

  if (state.status === 'scenario-load-error') {
    return (
      <div className="app-status-message app-status-error" role="alert">
        Failed to load scenario:
        {'\n'}
        {state.message}
        <button type="button" onClick={() => setState({ status: 'selecting-scenario', world: state.world })}>
          Back
        </button>
      </div>
    )
  }

  if (state.status === 'selecting-scenario') {
    return (
      <ScenarioSelectScreen listings={BUNDLED_SCENARIOS} onPlay={(listing) => handlePlay(state.world, listing)} />
    )
  }

  return <RokuaMap world={state.world} scenario={state.scenario} />
}

export default App
