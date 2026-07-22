import { useEffect, useState } from 'react'
import { RokuaMap } from './map/RokuaMap'
import { loadWorld } from './world/loadWorld'
import type { World } from './world/types'

type WorldLoadState =
  | { status: 'loading' }
  | { status: 'loaded'; world: World }
  | { status: 'error'; message: string }

function App() {
  const [state, setState] = useState<WorldLoadState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false

    loadWorld()
      .then((world) => {
        if (!cancelled) setState({ status: 'loaded', world })
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : String(error)
          setState({ status: 'error', message })
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  if (state.status === 'loading') {
    return <div className="app-status-message">Loading world.json&hellip;</div>
  }

  if (state.status === 'error') {
    return (
      <div className="app-status-message app-status-error" role="alert">
        Failed to load world.json:
        {'\n'}
        {state.message}
      </div>
    )
  }

  return <RokuaMap world={state.world} />
}

export default App
