export interface TerminalDeepLinkTarget {
  repoId: string
  worktreePath: string
  branch?: string
  terminalId?: string
}

export function buildTerminalDeepLinkUrl(baseUrl: string, target: TerminalDeepLinkTarget): string {
  const url = new URL(baseUrl)
  url.search = ''
  url.hash = ''
  url.searchParams.set('view', 'terminal')
  url.searchParams.set('repo', target.repoId)
  url.searchParams.set('worktree', target.worktreePath)
  if (target.branch) url.searchParams.set('branch', target.branch)
  if (target.terminalId) url.searchParams.set('terminal', target.terminalId)
  return url.toString()
}

export function parseTerminalDeepLinkUrl(value: string | URL): TerminalDeepLinkTarget | null {
  const url = typeof value === 'string' ? new URL(value) : value
  if (url.searchParams.get('view') !== 'terminal') return null

  const repoId = url.searchParams.get('repo')?.trim()
  const worktreePath = url.searchParams.get('worktree')?.trim()
  if (!repoId || !worktreePath) return null

  const branch = url.searchParams.get('branch')?.trim() || undefined
  const terminalId = url.searchParams.get('terminal')?.trim() || undefined
  return { repoId, worktreePath, branch, terminalId }
}
