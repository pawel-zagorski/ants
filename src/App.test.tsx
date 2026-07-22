import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders a Leaflet map container', () => {
    const { container } = render(<App />)

    expect(container.querySelector('.leaflet-container')).not.toBeNull()
  })
})
