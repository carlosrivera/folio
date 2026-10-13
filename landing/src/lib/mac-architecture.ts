export type MacArchitectureHints = {
  userAgentData?: {
    getHighEntropyValues?: (hints: string[]) => Promise<{ architecture?: string }>
  }
}

/** "Intel Mac OS X" in a user agent is a compatibility label, not a CPU probe. */
export async function macDownloadArchitecture(browser: MacArchitectureHints): Promise<'arm64' | 'x64'> {
  try {
    const hints = await browser.userAgentData?.getHighEntropyValues?.(['architecture'])
    if (hints?.architecture === 'x86') return 'x64'
  } catch {
    // Safari and browsers that restrict client hints still offer both downloads.
  }
  // Prefer current M-series Macs when the browser does not expose architecture.
  return 'arm64'
}
