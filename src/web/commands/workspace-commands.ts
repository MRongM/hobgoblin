import { worktreeTerminalKey } from '#/web/components/terminal/terminal-session-keys.ts'
import { readTerminalSessionCommandBridge } from '#/web/components/terminal/terminal-session-command-bridge.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { formatTerminalId, NON_GIT_WORKSPACE_TERMINAL_BRANCH } from '#/shared/terminal.ts'
import { repoPlainWorkspacePath } from '#/web/stores/repos/capabilities.ts'
import type { MainWindowNavigationActions } from '#/web/main-window-navigation.tsx'
import type { DetailTab } from '#/web/stores/repos/types.ts'
import type {
  TerminalSessionBase,
  TerminalSessionContextValue,
  TerminalSessionReadContextValue,
} from '#/web/components/terminal/types.ts'
import type { TerminalDeepLinkTarget } from '#/web/lib/terminal-deep-link.ts'

interface ShowDetailTabCommandOptions {
  repoId: string | null
  tab: DetailTab
  navigation: MainWindowNavigationActions
  setDetailCollapsed: (collapsed: boolean) => void
}

interface ToggleDetailCommandOptions {
  repoId: string | null
  toggleDetailCollapsed: () => void
}

interface TerminalPrimaryActionCommandOptions {
  repoId: string | null
  navigation: MainWindowNavigationActions
  setDetailCollapsed: (collapsed: boolean) => void
}

interface SelectTerminalCommandOptions {
  repoId: string | null
  index: number
  navigation: MainWindowNavigationActions
  setDetailCollapsed: (collapsed: boolean) => void
}

interface TerminalDeepLinkCommandOptions {
  target: TerminalDeepLinkTarget
  navigation: MainWindowNavigationActions
  setDetailCollapsed: (collapsed: boolean) => void
  terminalSessions?: Pick<TerminalSessionReadContextValue, 'worktreeSnapshot'> &
    Pick<TerminalSessionContextValue, 'selectTerminal'>
}

export function runShowDetailTabCommand({
  repoId,
  tab,
  navigation,
  setDetailCollapsed,
}: ShowDetailTabCommandOptions): boolean {
  if (!repoId) return false
  navigation.showRepoDetailTab(repoId, tab)
  setDetailCollapsed(false)
  return true
}

export function runToggleDetailCommand({ repoId, toggleDetailCollapsed }: ToggleDetailCommandOptions): boolean {
  if (!repoId) return false
  toggleDetailCollapsed()
  return true
}

export async function runTerminalPrimaryActionCommand({
  repoId,
  navigation,
  setDetailCollapsed,
}: TerminalPrimaryActionCommandOptions): Promise<boolean> {
  if (!repoId) return false
  runShowDetailTabCommand({ repoId, tab: 'terminal', navigation, setDetailCollapsed })
  const base = selectedTerminalBase(repoId)
  if (!base) return true
  const bridge = readTerminalSessionCommandBridge()
  if (!bridge) return true
  const worktree = bridge.worktreeSnapshot(worktreeTerminalKey(base.repoRoot, base.worktreePath))
  if (worktree.count > 0) return true
  await bridge.createTerminal(base)
  return true
}

export function runSelectTerminalCommand({
  repoId,
  index,
  navigation,
  setDetailCollapsed,
}: SelectTerminalCommandOptions): boolean {
  if (!repoId || index < 1) return false
  runShowDetailTabCommand({ repoId, tab: 'terminal', navigation, setDetailCollapsed })
  const base = selectedTerminalBase(repoId)
  if (!base) return true
  const bridge = readTerminalSessionCommandBridge()
  if (!bridge) return true
  const worktreeKey = worktreeTerminalKey(base.repoRoot, base.worktreePath)
  const session = bridge
    .worktreeSnapshot(worktreeKey)
    .sessions.find((candidate) => candidate.index === index || candidate.terminalId === formatTerminalId(index))
  if (!session) return true
  bridge.selectTerminal(worktreeKey, session.key)
  return true
}

export function runTerminalDeepLinkCommand({
  target,
  navigation,
  setDetailCollapsed,
  terminalSessions,
}: TerminalDeepLinkCommandOptions): boolean {
  const repo = useReposStore.getState().repos[target.repoId]
  if (!repo) return false

  const branch =
    repo.data.branches.find(
      (candidate) => candidate.name === target.branch && candidate.worktree?.path === target.worktreePath,
    ) ?? repo.data.branches.find((candidate) => candidate.worktree?.path === target.worktreePath)

  if (branch) navigation.showRepoBranchDetailTab(repo.id, branch.name, 'terminal')
  else navigation.showRepoDetailTab(repo.id, 'terminal')
  setDetailCollapsed(false)

  const bridge = terminalSessions ?? readTerminalSessionCommandBridge()
  if (!bridge) return true

  const worktreeKey = worktreeTerminalKey(target.repoId, target.worktreePath)
  const snapshot = bridge.worktreeSnapshot(worktreeKey)
  const session =
    snapshot.sessions.find(
      (candidate) => !!target.terminalId && (candidate.terminalId === target.terminalId || candidate.key === target.terminalId),
    ) ?? snapshot.sessions[0]
  if (session) bridge.selectTerminal(worktreeKey, session.key)
  return true
}

function selectedTerminalBase(repoId: string): TerminalSessionBase | null {
  const repo = useReposStore.getState().repos[repoId]
  const plainWorkspacePath = repoPlainWorkspacePath(repo)
  if (repo && plainWorkspacePath) {
    return {
      repoRoot: repo.id,
      branch: NON_GIT_WORKSPACE_TERMINAL_BRANCH,
      worktreePath: plainWorkspacePath,
    }
  }
  if (!repo?.ui.selectedBranch) return null
  const branch = repo.data.branches.find((candidate) => candidate.name === repo.ui.selectedBranch)
  const worktreePath = branch?.worktree?.path
  if (!worktreePath) return null
  return {
    repoRoot: repo.id,
    branch: branch.name,
    worktreePath,
  }
}
