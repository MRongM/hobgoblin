import type { RemoteRepoTarget } from '#/shared/remote-repo.ts'
import type { TelegramBellNotificationContext } from '#/shared/telegram-notifications.ts'
import type { TerminalBellEvent, TerminalDescriptor } from '#/web/components/terminal/types.ts'
import { formatWorktreePath, lastPathSegment } from '#/web/lib/paths.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'

interface TerminalNotificationRepo {
  id: string
  name: string
  workspaceRootId?: string
  isGitRepo: boolean
  remote: { target?: RemoteRepoTarget }
}

function samePath(left: string, right: string): boolean {
  return left.replace(/[/\\]+$/u, '') === right.replace(/[/\\]+$/u, '')
}

function readableName(value: string, fallback: string): string {
  return value.trim() || lastPathSegment(fallback) || fallback
}

export function terminalNotificationContext(
  descriptor: TerminalDescriptor,
  event: TerminalBellEvent,
  repos: Record<string, TerminalNotificationRepo> = useReposStore.getState().repos,
): TelegramBellNotificationContext {
  const repo = repos[descriptor.repoRoot]
  const workspaceRoot = repo?.workspaceRootId ? repos[repo.workspaceRootId] : undefined
  const remoteTarget = repo?.remote.target ?? workspaceRoot?.remote.target
  const project = repo ? readableName(repo.name, repo.id) : readableName('', descriptor.repoRoot)
  const workspaceRootRepo = workspaceRoot ?? repo
  const ownsWorkspaceMembers = Object.values(repos).some(
    (candidate) => candidate.workspaceRootId === descriptor.repoRoot,
  )
  const isWorkspace = Boolean(repo?.workspaceRootId || repo?.isGitRepo === false || ownsWorkspaceMembers)

  let contextKind: TelegramBellNotificationContext['contextKind']
  let context: string
  if (descriptor.targetKind === 'branch-workspace') {
    contextKind = 'branch-workspace'
    context = readableName('', descriptor.worktreePath)
  } else if (isWorkspace) {
    contextKind = 'workspace'
    context = workspaceRootRepo
      ? readableName(workspaceRootRepo.name, workspaceRootRepo.id)
      : readableName('', descriptor.repoRoot)
  } else if (!samePath(descriptor.repoRoot, descriptor.worktreePath)) {
    contextKind = 'worktree'
    context = readableName('', descriptor.worktreePath)
  } else {
    contextKind = 'directory'
    context = repo ? readableName(repo.name, repo.id) : readableName('', descriptor.worktreePath)
  }

  const canonicalTitle = typeof event.canonicalTitle === 'string' ? event.canonicalTitle.trim() : ''
  const processName = event.processName.trim()
  const branch = contextKind === 'workspace' ? '' : descriptor.branch.trim()
  return {
    terminalKey: descriptor.key,
    project,
    contextKind,
    context,
    directory: remoteTarget
      ? `${remoteTarget.alias}:${descriptor.worktreePath}`
      : formatWorktreePath(descriptor.worktreePath),
    ...(branch ? { branch } : {}),
    terminalIndex: descriptor.index,
    ...(canonicalTitle || processName ? { terminalTitle: canonicalTitle || processName } : {}),
  }
}
