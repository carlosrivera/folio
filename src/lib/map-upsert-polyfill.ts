// pdf.js v6 leans on the Map upsert methods that reached V8 after the Chromium
// build inside Folio's Electron, so the raster window installs these two
// additions before importing it. They match the shipped proposal semantics and
// stay no-ops on runtimes that already provide them.
export function installMapUpsertPolyfill() {
  const prototype = Map.prototype as unknown as Record<string, unknown>

  if (typeof prototype.getOrInsert !== 'function') {
    prototype.getOrInsert = function (this: Map<unknown, unknown>, key: unknown, value: unknown) {
      if (this.has(key)) return this.get(key)
      this.set(key, value)
      return value
    }
  }

  if (typeof prototype.getOrInsertComputed !== 'function') {
    prototype.getOrInsertComputed = function (this: Map<unknown, unknown>, key: unknown, compute: (key: unknown) => unknown) {
      if (this.has(key)) return this.get(key)
      const computed = compute(key)
      this.set(key, computed)
      return computed
    }
  }
}
