import { useState } from 'react'
import { withBase } from '../basePath'
import type { BundledScenarioListing } from './bundledScenarios'

export interface ScenarioSelectScreenProps {
  listings: readonly BundledScenarioListing[]
  onPlay: (listing: BundledScenarioListing) => void
}

/**
 * The start screen (issue D): lets the operator pick a bundled Scenario
 * from a dropdown and press Play to begin the run. Scenario content itself
 * (loading, validating, spawning Events) is handled once `onPlay` reports
 * the chosen listing — this component only owns the selection UI. Above
 * the picker, an intro block (logo badge, tagline, and attribution
 * paragraph) explains what the app is and who built it, since this is the
 * first thing an operator — or a Summer School visitor — sees.
 */
export function ScenarioSelectScreen({ listings, onPlay }: ScenarioSelectScreenProps) {
  const [selectedId, setSelectedId] = useState(listings[0]?.id ?? '')
  const selectedListing = listings.find((listing) => listing.id === selectedId)

  return (
    <div
      className="scenario-select-screen"
      style={{ backgroundImage: `url(${withBase('img/ants_background.png')})` }}
    >
      <div className="scenario-select-panel">
        <img src={withBase('img/ants_logo.png')} alt="Team ANTS logo" className="scenario-select-logo" />
        <h1>Forest Situational Awareness</h1>
        <p className="scenario-select-tagline">
          A forest sensor network simulation — detecting wildfires and hazards across Rokua National Park, Finland.
        </p>
        <p className="scenario-select-intro">
          Developed by team ANTS (Autonomous Navigation Tree Surveying Solution) at the{' '}
          <a href="https://www.esa-jrc-summerschool.org/" target="_blank" rel="noreferrer">
            ESA/JRC International Summer School on GNSS 2026
          </a>
          . This is a frontend-only prototype with no live sensor feeds — pick a scenario below and play it back at
          10x or 60x speed to watch events unfold.
        </p>
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
    </div>
  )
}
