import { MoreHorizontal } from 'lucide-react'
import { useCallback, useContext, useMemo, useSyncExternalStore } from 'react'
import { Button } from '#/web/components/ui/button.tsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#/web/components/ui/dropdown-menu.tsx'
import {
  TerminalSessionReadContext,
  useTerminalSessionContext,
} from '#/web/components/terminal/terminal-session-context.ts'
import { useTerminalCatalog } from '#/web/components/terminal/terminal-session-store.ts'
import { useTerminalStashStore } from '#/web/components/terminal/terminal-stash-store.ts'
import { useMainWindowNavigation } from '#/web/main-window-navigation.tsx'
import { runTerminalDeepLinkCommand } from '#/web/commands/workspace-commands.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { useT } from '#/web/stores/i18n.ts'
import { TerminalBellDot } from '#/web/components/terminal/TerminalBellDot.tsx'
import { mainWindowQueryClient } from '#/web/main-window-queries.ts'
import { branchWorkspaceQueryKey } from '#/web/branch-workspace-query-cache.ts'
import { resolveBranchWorkspaceMemberTarget } from '#/web/components/repo-workspace/branch-workspace-member-target.ts'
import type { BranchWorkspaceReadResult } from '#/shared/branch-workspaces.ts'
import type { TerminalDescriptor } from '#/web/components/terminal/types.ts'

type StashedItem = { key: string; title: string; hasBell: boolean }

export function TerminalStashMenu({ repoId }: { repoId: string }) {
  const t = useT()
  const navigation = useMainWindowNavigation()
  const { selectTerminal } = useTerminalSessionContext()
  const read = useContext(TerminalSessionReadContext)
  const catalog = useTerminalCatalog()
  const stashed = useTerminalStashStore((state) => state.stashedTerminals)
  const activeProjectId = useReposStore((state) => state.activeProjectId ?? repoId)
  const repos = useReposStore((state) => state.repos)
  const candidates = useMemo(
    () =>
      catalog.filter((descriptor) => {
        const project = repos[descriptor.repoRoot]?.workspaceRootId ?? descriptor.repoRoot
        return (project === activeProjectId || descriptor.repoRoot === activeProjectId) && !!stashed[descriptor.key]
      }),
    [catalog, repos, activeProjectId, stashed],
  )
  const scopes = useMemo(() => [...new Set(candidates.map((item) => item.worktreeTerminalKey))], [candidates])
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!read) return () => {}
      const unsubscribers = scopes.map((scope) => read.subscribeWorktree(scope, listener))
      return () => unsubscribers.forEach((unsubscribe) => unsubscribe())
    },
    [read, scopes],
  )
  const getSnapshot = useCallback(
    () =>
      JSON.stringify(
        candidates.flatMap((descriptor) => {
          const session = read
            ?.worktreeSnapshot(descriptor.worktreeTerminalKey)
            .sessions.find((item) => item.key === descriptor.key)
          return session?.sessionId && session.sessionId === stashed[descriptor.key]
            ? [{ key: descriptor.key, title: session.title, hasBell: session.hasBell }]
            : []
        }),
      ),
    [candidates, read, stashed],
  )
  const serialized = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const items = useMemo(() => JSON.parse(serialized) as StashedItem[], [serialized])

  function restore(descriptor: TerminalDescriptor) {
    const state = useReposStore.getState()
    if (descriptor.targetKind === 'branch-workspace' && descriptor.branchWorkspaceId) {
      state.activateBranchWorkspace(descriptor.repoRoot, descriptor.branchWorkspaceId)
      state.setDetailCollapsed(false)
      selectTerminal(descriptor.worktreeTerminalKey, descriptor.key)
      return
    }
    if (!read) return
    const branchWorkspaceId = findMemberWorkspace(activeProjectId, descriptor)
    runTerminalDeepLinkCommand({
      target: {
        repoId: descriptor.repoRoot,
        worktreePath: descriptor.worktreePath,
        branch: descriptor.branch,
        terminalId: descriptor.terminalId,
        ...(branchWorkspaceId ? { branchWorkspaceScope: { workspaceRootId: activeProjectId, branchWorkspaceId } } : {}),
      },
      navigation,
      setDetailCollapsed: state.setDetailCollapsed,
      terminalSessions: { worktreeSnapshot: read.worktreeSnapshot, selectTerminal },
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="sticky right-0 z-10 h-7 w-7 shrink-0 bg-topbar [-webkit-app-region:no-drag]"
          aria-label={t('terminal.stashed')}
          title={t('terminal.stashed')}
        >
          <MoreHorizontal size={16} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 min-w-56 max-w-80">
        {items.length === 0 ? (
          <div className="px-2 py-3 text-sm text-muted-foreground">{t('terminal.stashed-empty')}</div>
        ) : (
          items.map((item) => {
            const descriptor = candidates.find((candidate) => candidate.key === item.key)
            if (!descriptor) return null
            return (
              <DropdownMenuItem
                key={item.key}
                onSelect={() => restore(descriptor)}
                className="flex flex-col items-start gap-0"
              >
                <span className="flex w-full items-center gap-2">
                  <span className="min-w-0 flex-1 truncate">{item.title}</span>
                  {item.hasBell && <TerminalBellDot label={t('terminal.bell-unread')} ping={false} />}
                </span>
                <span className="max-w-full truncate text-xs text-muted-foreground">{descriptor.worktreePath}</span>
              </DropdownMenuItem>
            )
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function findMemberWorkspace(rootId: string, descriptor: TerminalDescriptor): string | undefined {
  const state = useReposStore.getState()
  const project = state.workspaceProjects[rootId]
  const query = mainWindowQueryClient.getQueryData<BranchWorkspaceReadResult>(branchWorkspaceQueryKey(rootId))
  if (!project || !query?.ok) return undefined
  for (const workspace of query.items) {
    if (!workspace.available) continue
    for (const member of workspace.repositories) {
      const result = resolveBranchWorkspaceMemberTarget({
        member,
        repositoryIds: project.repositoryIds,
        candidates: project.candidates,
        repos: state.repos,
      })
      if (
        result.ok &&
        result.target.repositoryId === descriptor.repoRoot &&
        result.target.worktreePath === descriptor.worktreePath
      )
        return workspace.id
    }
  }
  return undefined
}
