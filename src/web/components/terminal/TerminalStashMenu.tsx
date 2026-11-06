import { MoreHorizontal, X } from 'lucide-react'
import { useCallback, useContext, useMemo, useState, useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '#/web/components/ConfirmDialog.tsx'
import { ConfirmCheckbox } from '#/web/components/ConfirmCheckbox.tsx'
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

type StashedItem = {
  key: string
  sessionId: string
  title: string
  fullTitle: string
  hasBell: boolean
  hasUserInput?: boolean
  tmuxBacked?: boolean
  tmuxCloseSupported?: boolean
}

export function TerminalStashMenu({ repoId }: { repoId: string }) {
  const t = useT()
  const navigation = useMainWindowNavigation()
  const { selectTerminal, closeTerminalAndDismissDetailIfLast } = useTerminalSessionContext()
  const [open, setOpen] = useState(false)
  const [pendingClose, setPendingClose] = useState<StashedItem | null>(null)
  const [closeTmuxSession, setCloseTmuxSession] = useState(false)
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
            ? [
                {
                  key: descriptor.key,
                  sessionId: session.sessionId,
                  title: session.title,
                  fullTitle: session.fullTitle ?? session.title,
                  hasBell: session.hasBell,
                  hasUserInput: session.hasUserInput,
                  tmuxBacked: session.tmuxBacked,
                  tmuxCloseSupported: session.tmuxCloseSupported,
                },
              ]
            : []
        }),
      ),
    [candidates, read, stashed],
  )
  const serialized = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const items = useMemo(() => JSON.parse(serialized) as StashedItem[], [serialized])

  async function closeItem(item: StashedItem, closeTmux = false) {
    const descriptor = candidates.find((candidate) => candidate.key === item.key)
    const current =
      descriptor &&
      read?.worktreeSnapshot(descriptor.worktreeTerminalKey).sessions.find((session) => session.key === item.key)
    if (!descriptor || current?.sessionId !== item.sessionId) {
      setPendingClose(null)
      return
    }
    try {
      const scope = { repoRoot: descriptor.repoRoot, worktreePath: descriptor.worktreePath }
      const result = await (closeTmux
        ? closeTerminalAndDismissDetailIfLast(item.key, scope, { closeTmuxSession: true })
        : closeTerminalAndDismissDetailIfLast(item.key, scope))
      if (result && !result.ok) {
        toast.error(t('terminal.close-tmux-session-failed'), { description: t(result.message) })
        return
      }
      setPendingClose(null)
      setCloseTmuxSession(false)
    } catch {
      toast.error(t('terminal.close-tmux-session-failed'), { description: t('error.tmux-command-failed') })
    }
  }

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
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="sticky right-0 z-10 h-7 min-w-7 w-auto shrink-0 bg-topbar px-1 [-webkit-app-region:no-drag]"
            aria-label={t('terminal.stashed')}
            title={t('terminal.stashed')}
          >
            {items.length > 0 ? (
              <span className="text-xs tabular-nums">{items.length}</span>
            ) : (
              <MoreHorizontal size={16} />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-80 w-[min(32rem,calc(100vw-1rem))]">
          {items.length === 0 ? (
            <div className="px-2 py-3 text-sm text-muted-foreground">{t('terminal.stashed-empty')}</div>
          ) : (
            items.map((item) => {
              const descriptor = candidates.find((candidate) => candidate.key === item.key)
              if (!descriptor) return null
              return (
                <div key={item.key} className="flex items-center gap-1">
                  <DropdownMenuItem
                    onSelect={() => restore(descriptor)}
                    className="min-w-0 flex-1 flex-col items-start gap-0"
                  >
                    <span className="flex w-full items-center gap-2">
                      <span className="min-w-0 flex-1 truncate" title={item.fullTitle}>
                        {item.fullTitle}
                      </span>
                      {item.hasBell && <TerminalBellDot label={t('terminal.bell-unread')} ping={false} />}
                    </span>
                    <span className="max-w-full truncate text-xs text-muted-foreground">{descriptor.worktreePath}</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    asChild
                    className="shrink-0 p-0"
                    onSelect={(event) => {
                      event.preventDefault()
                      setOpen(false)
                      if (item.hasUserInput === false) void closeItem(item)
                      else {
                        setCloseTmuxSession(false)
                        setPendingClose(item)
                      }
                    }}
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      aria-label={t('terminal.close-named', { name: item.fullTitle })}
                      title={t('terminal.close-named', { name: item.fullTitle })}
                    >
                      <X size={14} />
                    </Button>
                  </DropdownMenuItem>
                </div>
              )
            })
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={!!pendingClose}
        title={t('terminal.close-confirm-title')}
        message={
          <div className="flex flex-col gap-3">
            <p>{t('terminal.close-confirm-body', { name: pendingClose?.title ?? '' })}</p>
            {pendingClose?.tmuxBacked === true && pendingClose.tmuxCloseSupported === false && (
              <p className="text-xs text-muted-foreground">{t('terminal.close-tmux-session-exit-required')}</p>
            )}
            {pendingClose?.tmuxBacked === true && pendingClose.tmuxCloseSupported !== false && (
              <ConfirmCheckbox checked={closeTmuxSession} onCheckedChange={setCloseTmuxSession} destructive>
                <span className="flex flex-col gap-1">
                  <span>{t('terminal.close-tmux-session')}</span>
                  <span className="text-xs text-muted-foreground">{t('terminal.close-tmux-session-hint')}</span>
                </span>
              </ConfirmCheckbox>
            )}
          </div>
        }
        confirmLabel={t('terminal.close-confirm-confirm')}
        destructive
        onCancel={() => {
          setPendingClose(null)
          setCloseTmuxSession(false)
        }}
        onConfirm={() => (pendingClose ? closeItem(pendingClose, closeTmuxSession) : undefined)}
      />
    </>
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
