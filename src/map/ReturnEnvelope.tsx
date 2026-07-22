import { Polygon } from 'react-leaflet'
import { returnEnvelopeEllipseRing } from './geo'
import type { BaseStation, Drone } from '../world/types'

export interface ReturnEnvelopeProps {
  drone: Drone
  /** The Drone's current live position (from `liveWorld`), not its static `world.json` position. */
  dronePosition: Drone['position']
  /** The Drone's live, shrinking-over-time endurance (issue G/I telemetry), not its `maxEnduranceSimSeconds`. */
  remainingEnduranceSimSeconds: number
  baseStations: readonly BaseStation[]
}

/** Amber/gold, dashed — visually distinct from every `.asset-icon-*`/`.event-icon-*` color in `index.css`. */
const RETURN_ENVELOPE_PATH_OPTIONS = {
  color: '#d97706',
  weight: 2,
  dashArray: '6 6',
  fillColor: '#d97706',
  fillOpacity: 0.18,
}

/**
 * The Return Envelope overlay (issue K, `CONTEXT.md`): the union of one
 * ellipse per Base Station, each with foci at the Drone's current live
 * position and that Base Station, sized by the Drone's live remaining
 * flight budget (`remainingEnduranceSimSeconds * cruiseSpeedMetersPerSecond`
 * — issue I's per-Drone endurance/cruise-speed fields). Rendered as
 * semi-transparent, same-colored Leaflet `Polygon`s so overlapping regions
 * union naturally via alpha compositing — no manual geometric union. A
 * Base Station the Drone's remaining budget can't even reach yields
 * `undefined` from {@link returnEnvelopeEllipseRing} and is simply skipped
 * (see its doc comment) — a Drone that can't reach *either* Base Station
 * renders no envelope at all, an accepted low-stakes edge case.
 */
export function ReturnEnvelope({ drone, dronePosition, remainingEnduranceSimSeconds, baseStations }: ReturnEnvelopeProps) {
  const focalDistanceBudgetMeters = remainingEnduranceSimSeconds * drone.cruiseSpeedMetersPerSecond

  return (
    <>
      {baseStations.map((baseStation) => {
        const ring = returnEnvelopeEllipseRing(dronePosition, baseStation.position, focalDistanceBudgetMeters)
        if (!ring) return null

        return (
          <Polygon
            key={baseStation.id}
            className="return-envelope"
            positions={ring.map((point) => [point.lat, point.lng])}
            {...RETURN_ENVELOPE_PATH_OPTIONS}
          />
        )
      })}
    </>
  )
}
