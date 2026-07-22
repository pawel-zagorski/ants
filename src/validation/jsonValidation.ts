/**
 * Small, generic JSON-shape validation primitives shared by every
 * `parse*` loader in this app (`world/schema.ts`, `scenario/schema.ts`).
 * Each `collect*Issues` helper pushes human-readable issue strings onto a
 * shared `issues` array rather than throwing, so a caller can report every
 * problem in a malformed file at once instead of stopping at the first.
 */

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** Validates a `{ lat, lng }` pair, pushing any issues found under `path`. */
export function collectLatLngIssues(value: unknown, path: string, issues: string[]): void {
  if (!isPlainObject(value)) {
    issues.push(`${path} must be an object with numeric lat/lng`)
    return
  }
  if (!isFiniteNumber(value.lat) || value.lat < -90 || value.lat > 90) {
    issues.push(`${path}.lat must be a finite number between -90 and 90`)
  }
  if (!isFiniteNumber(value.lng) || value.lng < -180 || value.lng > 180) {
    issues.push(`${path}.lng must be a finite number between -180 and 180`)
  }
}

/** Validates that `value` is a non-empty string, pushing an issue under `path` if not. */
export function collectStringFieldIssues(value: unknown, path: string, issues: string[]): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    issues.push(`${path} must be a non-empty string`)
  }
}
