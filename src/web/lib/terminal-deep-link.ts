export interface TerminalDeepLinkTarget {
  repoId: string
  worktreePath: string
  branch?: string
  terminalId?: string
  branchWorkspaceScope?: {
    workspaceRootId: string
    branchWorkspaceId: string
  }
}

const TERMINAL_DEEP_LINK_PARAMS = [
  'view',
  'repo',
  'worktree',
  'branch',
  'terminal',
  'workspace',
  'branchWorkspace',
] as const

export function buildTerminalDeepLinkUrl(baseUrl: string, target: TerminalDeepLinkTarget): string {
  const url = new URL(baseUrl)
  url.search = ''
  url.hash = ''
  url.searchParams.set('view', 'terminal')
  url.searchParams.set('repo', target.repoId)
  url.searchParams.set('worktree', target.worktreePath)
  if (target.branch) url.searchParams.set('branch', target.branch)
  if (target.terminalId) url.searchParams.set('terminal', target.terminalId)
  if (target.branchWorkspaceScope?.workspaceRootId && target.branchWorkspaceScope.branchWorkspaceId) {
    url.searchParams.set('workspace', target.branchWorkspaceScope.workspaceRootId)
    url.searchParams.set('branchWorkspace', target.branchWorkspaceScope.branchWorkspaceId)
  }
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
  const workspaceRootId = url.searchParams.get('workspace')?.trim()
  const branchWorkspaceId = url.searchParams.get('branchWorkspace')?.trim()
  return {
    repoId,
    worktreePath,
    branch,
    terminalId,
    ...(workspaceRootId && branchWorkspaceId ? { branchWorkspaceScope: { workspaceRootId, branchWorkspaceId } } : {}),
  }
}

export function clearTerminalDeepLinkParams(value: string | URL): URL {
  const url = new URL(value.toString())
  for (const key of TERMINAL_DEEP_LINK_PARAMS) url.searchParams.delete(key)
  return url
}
