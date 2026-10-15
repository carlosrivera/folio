import { afterEach, describe, expect, it } from 'vitest'
import { installMapUpsertPolyfill } from './map-upsert-polyfill'

type UpsertableMap<K, V> = Map<K, V> & { getOrInsert(key: K, value: V): V; getOrInsertComputed(key: K, compute: (key: K) => V): V }

const prototype = Map.prototype as unknown as Record<string, unknown>
const originalGetOrInsert = prototype.getOrInsert
const originalGetOrInsertComputed = prototype.getOrInsertComputed

afterEach(() => {
  if (originalGetOrInsert === undefined) delete prototype.getOrInsert
  else prototype.getOrInsert = originalGetOrInsert
  if (originalGetOrInsertComputed === undefined) delete prototype.getOrInsertComputed
  else prototype.getOrInsertComputed = originalGetOrInsertComputed
})

describe('installMapUpsertPolyfill', () => {
  it('inserts a missing value and returns an existing one untouched', () => {
    delete prototype.getOrInsert
    installMapUpsertPolyfill()
    const map = new Map<string, number>() as UpsertableMap<string, number>
    expect(map.getOrInsert('a', 1)).toBe(1)
    expect(map.getOrInsert('a', 2)).toBe(1)
    expect([...map]).toEqual([['a', 1]])
  })

  it('computes only when the key is absent', () => {
    delete prototype.getOrInsertComputed
    installMapUpsertPolyfill()
    const map = new Map<string, number>([['kept', 1]]) as UpsertableMap<string, number>
    let computed = 0
    expect(map.getOrInsertComputed('kept', () => { computed += 1; return 2 })).toBe(1)
    expect(map.getOrInsertComputed('added', (key) => { computed += 1; return key.length })).toBe(5)
    expect(computed).toBe(1)
  })

  it('leaves native implementations alone', () => {
    const marker = () => 0
    prototype.getOrInsert = marker
    installMapUpsertPolyfill()
    expect(prototype.getOrInsert).toBe(marker)
  })
})
