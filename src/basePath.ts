/**
 * Resolves a public-asset path against Vite's configured base URL so the app
 * works both at the dev-server root ('/') and under the GitHub Pages project
 * subpath ('/ants/'). `import.meta.env.BASE_URL` always ends with a slash, so
 * we strip any leading slash off `path` to avoid a doubled separator.
 *
 * Use this for anything fetched or referenced by URL at *runtime* (world.json,
 * scenario-*.json, drone photos in public/img) — Vite only rewrites the base
 * into statically-analysable imports and index.html, not into these dynamic
 * string paths.
 */
export function withBase(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`
}
