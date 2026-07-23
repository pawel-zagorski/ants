import { DomEvent } from 'leaflet'
import { useEffect, useRef, type HTMLAttributes, type ReactNode } from 'react'

export interface MapOverlayPanelProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

/**
 * Root wrapper for status panels rendered inside `MapContainer`. Leaflet
 * captures wheel/touch scroll on the map by default — without
 * `disableScrollPropagation` on the panel (and its scroll body), the panel
 * content cannot be scrolled on touch devices and sticky footers end up
 * covering clipped fields instead.
 */
export function MapOverlayPanel({ children, className, ...rest }: MapOverlayPanelProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = ref.current
    if (!root) return

    DomEvent.disableScrollPropagation(root)
    DomEvent.disableClickPropagation(root)

    const body = root.querySelector('.asset-panel-body')
    if (body instanceof HTMLElement) {
      DomEvent.disableScrollPropagation(body)
    }
  }, [])

  return (
    <div ref={ref} className={className} {...rest}>
      {children}
    </div>
  )
}
