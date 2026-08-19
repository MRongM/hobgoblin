export const BRANCH_PREFIX_OPTIONS = ['feat/', 'feature/', 'bugfix/', 'hotfix/', 'release/', 'merge/', 'dev/'] as const

export type BranchPrefix = (typeof BRANCH_PREFIX_OPTIONS)[number]

const BRANCH_PREFIX_SET: Set<string> = new Set(BRANCH_PREFIX_OPTIONS)

export function detectBranchPrefix(branchName: string): BranchPrefix | null {
  for (const prefix of BRANCH_PREFIX_OPTIONS) {
    if (branchName.startsWith(prefix)) return prefix
  }
  return null
}

export function applyBranchPrefix(branchName: string, nextPrefix: BranchPrefix | null): string {
  const current = detectBranchPrefix(branchName)
  const rest = current ? branchName.slice(current.length) : branchName
  return nextPrefix ? `${nextPrefix}${rest}` : rest
}

export function isKnownBranchPrefix(value: string): value is BranchPrefix {
  return BRANCH_PREFIX_SET.has(value)
}
