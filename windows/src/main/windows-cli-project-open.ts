export const WINDOWS_CLI_PROJECT_OPEN_FLAG = '--hob-open'

export function windowsCliProjectOpenPathFromArgv(
  argv: readonly string[],
  platform: NodeJS.Platform = process.platform,
): string | null {
  if (platform !== 'win32') return null

  const markerIndexes = argv.flatMap((value, index) => (value === WINDOWS_CLI_PROJECT_OPEN_FLAG ? [index] : []))
  if (markerIndexes.length !== 1) return null

  const candidate = argv[markerIndexes[0]! + 1]
  if (!candidate || candidate.startsWith('--')) return null
  return candidate
}
