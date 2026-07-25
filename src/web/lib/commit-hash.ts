export function formatShortCommitHashTag(hash: string): string | null {
  const trimmed = hash.trim()
  return trimmed ? `#${trimmed.slice(0, 7)}` : null
}
