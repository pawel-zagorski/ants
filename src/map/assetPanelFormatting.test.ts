import { describe, expect, it } from 'vitest'
import {
  droneTelemetryStateLabel,
  fireTierLabel,
  formatBatteryPercent,
  formatHeadingDegrees,
  formatRemainingEndurance,
  formatSpeedMetersPerSecond,
} from './assetPanelFormatting'

describe('formatBatteryPercent', () => {
  it('rounds to the nearest whole percent and appends a % sign', () => {
    expect(formatBatteryPercent(83.6)).toBe('84%')
    expect(formatBatteryPercent(0)).toBe('0%')
    expect(formatBatteryPercent(100)).toBe('100%')
  })
})

describe('formatSpeedMetersPerSecond', () => {
  it('shows one decimal place with a unit suffix', () => {
    expect(formatSpeedMetersPerSecond(8)).toBe('8.0 m/s')
    expect(formatSpeedMetersPerSecond(0)).toBe('0.0 m/s')
    expect(formatSpeedMetersPerSecond(24.96)).toBe('25.0 m/s')
  })
})

describe('formatHeadingDegrees', () => {
  it('rounds to the nearest whole degree with a degree sign', () => {
    expect(formatHeadingDegrees(89.6)).toBe('90°')
    expect(formatHeadingDegrees(0)).toBe('0°')
  })

  it('shows a hovering-specific label when heading is undefined', () => {
    expect(formatHeadingDegrees(undefined)).toBe('N/A (hovering)')
  })
})

describe('formatRemainingEndurance', () => {
  it('formats whole hours and minutes', () => {
    expect(formatRemainingEndurance(7200)).toBe('2h 0m')
    expect(formatRemainingEndurance(3660)).toBe('1h 1m')
  })

  it('omits the hours part when under an hour remains', () => {
    expect(formatRemainingEndurance(300)).toBe('5m')
    expect(formatRemainingEndurance(0)).toBe('0m')
  })
})

describe('droneTelemetryStateLabel', () => {
  it('title-cases each of the six possible telemetry states', () => {
    expect(droneTelemetryStateLabel('idle')).toBe('Idle')
    expect(droneTelemetryStateLabel('patrolling')).toBe('Patrolling')
    expect(droneTelemetryStateLabel('investigating')).toBe('Investigating')
    expect(droneTelemetryStateLabel('returning')).toBe('Returning')
    expect(droneTelemetryStateLabel('charging')).toBe('Charging')
    expect(droneTelemetryStateLabel('fault')).toBe('Fault')
  })
})

describe('fireTierLabel', () => {
  it('renders each FireTier discriminant using CONTEXT.md\'s exact vocabulary', () => {
    expect(fireTierLabel('undetected')).toBe('Undetected')
    expect(fireTierLabel('towerDetected')).toBe('Tower-Detected')
    expect(fireTierLabel('investigated')).toBe('Investigated')
  })
})
