import { describe, expect, it } from 'vitest'
import { macDownloadArchitecture } from '../../landing/src/lib/mac-architecture'

describe('Mac download architecture', () => {
  it('uses architecture hints rather than an Apple Silicon browser’s Intel compatibility label', async () => {
    const browser = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', userAgentData: { getHighEntropyValues: async () => ({ architecture: 'arm' }) } }
    expect(await macDownloadArchitecture(browser)).toBe('arm64')
  })
  it('offers the Intel download when explicit architecture hints identify x86', async () => {
    expect(await macDownloadArchitecture({ userAgentData: { getHighEntropyValues: async () => ({ architecture: 'x86' }) } })).toBe('x64')
  })
  it('defaults to Apple Silicon when architecture is unavailable or blocked', async () => {
    expect(await macDownloadArchitecture({})).toBe('arm64')
    expect(await macDownloadArchitecture({ userAgentData: { getHighEntropyValues: async () => { throw new Error('Restricted') } } })).toBe('arm64')
    expect(await macDownloadArchitecture({ userAgentData: { getHighEntropyValues: async () => ({}) } })).toBe('arm64')
  })
})
