import type { BranchWorkspaceSnapshot } from '#/shared/branch-workspaces.ts'
import { worktreeTerminalKey } from '#/web/components/terminal/terminal-session-keys.ts'
import type {
  TerminalSessionReadContextValue,
  TerminalSessionSummary,
  WorktreeTerminalSnapshot,
} from '#/web/components/terminal/types.ts'

type BranchWorkspaceTerminalScope = Pick<BranchWorkspaceSnapshot, 'id' | 'path' | 'available'>

export interface WorkspaceParentTerminalTarget {
  branchWorkspaceId: string | null
  worktreeTerminalKey: string
  terminalKey: string
}

export interface WorkspaceParentTerminalActions {
  activateOverview: () => void
  activateBranchWorkspace: (branchWorkspaceId: string) => void
  selectTerminal: (worktreeTerminalKey: string, terminalKey: string) => void
  focusTerminal: (terminalKey: string) => void
  revealTerminal: () => void
}

interface ResolveWorkspaceParentTerminalTargetInput {
  rootId: string
  rootPath: string
  activeBranchWorkspaceId: string | null
  branchWorkspaces: readonly BranchWorkspaceTerminalScope[]
  worktreeSnapshot: TerminalSessionReadContextValue['worktreeSnapshot']
}

export function resolveWorkspaceParentTerminalTarget({
  rootId,
  rootPath,
  activeBranchWorkspaceId,
  branchWorkspaces,
  worktreeSnapshot,
}: ResolveWorkspaceParentTerminalTargetInput): WorkspaceParentTerminalTarget | null {
  const rootWorktreeKey = worktreeTerminalKey(rootId, rootPath)
  const rootSession = viableSession(worktreeSnapshot(rootWorktreeKey))
  if (rootSession) {
    return {
      branchWorkspaceId: null,
      worktreeTerminalKey: rootWorktreeKey,
      terminalKey: rootSession.key,
    }
  }

  const activeBranchWorkspace = activeBranchWorkspaceId
    ? branchWorkspaces.find((workspace) => workspace.id === activeBranchWorkspaceId)
    : undefined
  const orderedBranchWorkspaces = activeBranchWorkspace
    ? [activeBranchWorkspace, ...branchWorkspaces.filter((workspace) => workspace.id !== activeBranchWorkspace.id)]
    : branchWorkspaces
  for (const workspace of orderedBranchWorkspaces) {
    if (!workspace.available) continue
    const branchWorktreeKey = worktreeTerminalKey(rootId, workspace.path)
    const branchSession = viableSession(worktreeSnapshot(branchWorktreeKey))
    if (!branchSession) continue
    return {
      branchWorkspaceId: workspace.id,
      worktreeTerminalKey: branchWorktreeKey,
      terminalKey: branchSession.key,
    }
  }
  return null
}

export function activateWorkspaceParentTerminalTarget(
  target: WorkspaceParentTerminalTarget | null,
  actions: WorkspaceParentTerminalActions,
): boolean {
  actions.activateOverview()
  if (!target) return false
  if (target.branchWorkspaceId) actions.activateBranchWorkspace(target.branchWorkspaceId)
  actions.selectTerminal(target.worktreeTerminalKey, target.terminalKey)
  actions.focusTerminal(target.terminalKey)
  actions.revealTerminal()
  return true
}

function viableSession(snapshot: WorktreeTerminalSnapshot): TerminalSessionSummary | null {
  const viable = (session: TerminalSessionSummary) => session.phase !== 'error' && session.phase !== 'closed'
  return (
    snapshot.sessions.find((session) => session.selected && viable(session)) ?? snapshot.sessions.find(viable) ?? null
  )
}
