import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AssetPanel } from './AssetPanel'
import type { Tower } from '../world/types'

const tower: Tower = {
  id: 'tower-1',
  type: 'Tower',
  position: { lat: 64.7, lng: 26.2 },
  detectionRadiusMeters: 15000,
}

describe('AssetPanel', () => {
  it('shows the asset id, type, and position', () => {
    render(<AssetPanel asset={tower} onClose={vi.fn()} />)

    expect(screen.getByText('tower-1')).toBeInTheDocument()
    expect(screen.getByText('Tower')).toBeInTheDocument()
    expect(screen.getByText('64.7000, 26.2000')).toBeInTheDocument()
  })

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn()
    render(<AssetPanel asset={tower} onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(onClose).toHaveBeenCalledOnce()
  })
})
