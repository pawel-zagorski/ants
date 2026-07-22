import type { LatLng } from '../map/geo'
import type { DroneType } from '../world/types'
import type { EventType } from '../scenario/types'

export type LogSeverity = 'info' | 'warning'

export type EventLogKind =
  | 'eventDetected'
  | 'fireDetected'
  | 'droneDispatchedToEvent'
  | 'droneDispatchedToFire'
  | 'droneDispatchedOneWay'
  | 'droneBeganFireOrbit'
  | 'droneReturningAfterOrbit'
  | 'droneRecalledToBase'
  | 'droneResumedPatrol'
  | 'droneGrounded'
  | 'droneLost'

export interface EventLogEntry {
  id: string
  simSeconds: number
  kind: EventLogKind
  severity: LogSeverity
  droneId?: string
  droneModel?: string
  droneType?: DroneType
  eventId?: string
  eventType?: EventType
  fireId?: string
  baseStationId?: string
  missionKind?: 'roundTrip' | 'oneWay'
  position?: LatLng
}

export const EVENT_LOG_CAP = 1000

export function appendLogEntry(log: readonly EventLogEntry[], entry: EventLogEntry): EventLogEntry[] {
  const next = [...log, entry]
  return next.length > EVENT_LOG_CAP ? next.slice(next.length - EVENT_LOG_CAP) : next
}
