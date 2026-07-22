import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Vitest globals are off (see vite.config.ts), so React Testing Library's
// automatic afterEach cleanup never registers itself — do it explicitly to
// stop DOM from one test leaking into the next in the same file.
afterEach(cleanup)
