import { useState } from 'react'
import type { BundledScenarioListing } from './bundledScenarios'

export interface ScenarioSelectScreenProps {
  listings: readonly BundledScenarioListing[]
  onPlay: (listing: BundledScenarioListing) => void
}

/**
 * The start screen (issue D): lets the operator pick a bundled Scenario
 * from a dropdown and press Play to begin the run. Scenario content itself
 * (loading, validating, spawning Events) is handled once `onPlay` reports
 * the chosen listing — this component only owns the selection UI.
 */
export function ScenarioSelectScreen({ listings, onPlay }: ScenarioSelectScreenProps) {
  const [selectedId, setSelectedId] = useState(listings[0]?.id ?? '')
  const selectedListing = listings.find((listing) => listing.id === selectedId)

  return (
    <div className="scenario-select-screen">
      <h1>Forest Situational Awareness</h1>
      <label htmlFor="scenario-select-input">Scenario</label>
      <select
        id="scenario-select-input"
        value={selectedId}
        onChange={(changeEvent) => setSelectedId(changeEvent.target.value)}
      >
        {listings.map((listing) => (
          <option key={listing.id} value={listing.id}>
            {listing.name}
          </option>
        ))}
      </select>
      {selectedListing && <p className="scenario-select-description">{selectedListing.description}</p>}
      <button
        type="button"
        onClick={() => selectedListing && onPlay(selectedListing)}
        disabled={!selectedListing}
      >
        Play
      </button>
    </div>
  )
}
