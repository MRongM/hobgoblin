import { useState } from 'react'
import { AlertTriangle, ExternalLink, Folder, Loader2, ScanSearch, Terminal } from 'lucide-react'
import { toast } from 'sonner'
import type { TmuxHostSessionIdentity, TmuxHostSessionRecord } from '#/shared/tmux-cleanup.ts'
import type { BranchWorkspaceItemAction } from '#/web/components/repo-workspace/BranchWorkspaceItemMenu.tsx'
import { Button } from '#/web/components/ui/button.tsx'
import { Checkbox } from '#/web/components/ui/checkbox.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/web/components/ui/dialog.tsx'
import { useAsyncPending } from '#/web/hooks/useAsyncPending.ts'
import { useT } from '#/web/stores/i18n.ts'
import { closeHostTmuxSessions, openHostTmuxSession, previewHostTmuxSessions } from '#/web/tmux-cleanup-client.ts'
import { supportsTmuxMenu } from '#/web/tmux-menu.ts'

interface HostTmuxInventoryOptions {
  projectRoot?: string
  disabled?: boolean
}

interface HostTmuxInventoryView {
  visible: boolean
  contextAction: BranchWorkspaceItemAction
  dialog: React.ReactNode
}

export function useHostTmuxInventory({
  projectRoot,
  disabled = false,
}: HostTmuxInventoryOptions): HostTmuxInventoryView {
  const t = useT()
  const [sessions, setSessions] = useState<TmuxHostSessionRecord[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const { pending, isPending, run } = useAsyncPending<'preview' | 'close' | `open:${string}`>()
  const visible = hostInventoryVisible(projectRoot)
  const actionDisabled = disabled || isPending

  const requestPreview = async () => {
    if (!projectRoot || actionDisabled) return
    try {
      const result = await previewHostTmuxSessions({ projectRoot })
      if (!result.ok) {
        toast.error(t('tmux.host-inventory.preview-failed'), { description: t(result.message) })
        return
      }
      if (result.sessions.length === 0) {
        toast.info(t('tmux.host-inventory.none'))
        return
      }
      setSelected(new Set())
      setSessions(result.sessions)
    } catch (error) {
      toast.error(t('tmux.host-inventory.preview-failed'), { description: errorMessage(error) })
    }
  }

  const executeClose = async () => {
    if (!projectRoot || !sessions || selected.size === 0) return
    const approvedSessions = sessions
      .filter((session) => selected.has(tmuxSessionIdentityKey(session)))
      .map(tmuxSessionIdentity)
    if (approvedSessions.length === 0) return
    try {
      const result = await closeHostTmuxSessions({ projectRoot, approvedSessions })
      if (!result.ok) {
        toast.error(t('tmux.host-inventory.execute-failed'), { description: t(result.message) })
        return
      }
      const removed = new Set([
        ...result.closed.map(tmuxSessionIdentityKey),
        ...result.missing.map(tmuxSessionIdentityKey),
      ])
      const remaining = sessions.filter((session) => !removed.has(tmuxSessionIdentityKey(session)))
      setSelected(new Set())
      setSessions(remaining.length > 0 ? remaining : null)
      if (result.failed.length > 0) {
        toast.error(
          t('tmux.host-inventory.partial', {
            closed: result.closed.length,
            failed: result.failed.length,
            missing: result.missing.length,
          }),
          {
            description: result.failed
              .map((failure) => `${failure.session.sessionName}: ${failure.message}`)
              .join('\n'),
          },
        )
        return
      }
      const successMessage = t('tmux.host-inventory.success', { count: result.closed.length })
      if (result.missing.length > 0) {
        toast.success(successMessage, {
          description: t('tmux.host-inventory.missing', { count: result.missing.length }),
        })
      } else {
        toast.success(successMessage)
      }
    } catch (error) {
      toast.error(t('tmux.host-inventory.execute-failed'), { description: errorMessage(error) })
    }
  }

  const executeOpen = async (session: TmuxHostSessionRecord) => {
    if (!projectRoot) return
    try {
      const result = await openHostTmuxSession({ projectRoot, session: tmuxSessionIdentity(session) })
      if (!result.ok) {
        toast.error(t('tmux.host-inventory.open-failed'), { description: t(result.message) })
      } else if (result.status === 'missing') {
        toast.error(t('tmux.host-inventory.open-missing'))
      }
    } catch (error) {
      toast.error(t('tmux.host-inventory.open-failed'), { description: errorMessage(error) })
    }
  }

  const closeDialog = () => {
    if (isPending) return
    setSessions(null)
    setSelected(new Set())
  }

  const toggle = (session: TmuxHostSessionRecord, checked: boolean) => {
    const key = tmuxSessionIdentityKey(session)
    setSelected((current) => {
      const next = new Set(current)
      if (checked) next.add(key)
      else next.delete(key)
      return next
    })
  }

  const contextAction: BranchWorkspaceItemAction = {
    label: 'tmux.host-inventory.action',
    icon: <ScanSearch aria-hidden="true" />,
    disabled: actionDisabled,
    busy: isPending,
    destructive: false,
    onSelect: async () => {
      await run('preview', requestPreview)
    },
  }

  const groups = groupSessionsByDirectory(sessions ?? [])
  return {
    visible,
    contextAction,
    dialog: (
      <Dialog open={sessions !== null} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent data-testid="host-tmux-dialog" className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('tmux.host-inventory.title')}</DialogTitle>
            <DialogDescription>{t('tmux.host-inventory.description')}</DialogDescription>
          </DialogHeader>

          <div className="max-h-[min(28rem,65vh)] space-y-2 overflow-y-auto pr-1">
            {groups.map(([directory, directorySessions]) => (
              <section
                key={directory}
                data-host-tmux-directory={directory}
                className="overflow-hidden rounded-md border border-border/80 bg-muted/15"
              >
                <div className="flex min-w-0 items-center gap-2 border-b border-border/70 bg-muted/35 px-3 py-2">
                  <Folder className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <code className="min-w-0 truncate text-[11px] font-medium text-foreground" title={directory}>
                    {directory}
                  </code>
                </div>
                <div className="divide-y divide-border/60">
                  {directorySessions.map((session) => {
                    const identityKey = tmuxSessionIdentityKey(session)
                    const checked = selected.has(identityKey)
                    const openActionId = `open:${identityKey}` as const
                    return (
                      <div key={identityKey} className="flex min-w-0 items-start gap-2.5 px-3 py-2">
                        <Checkbox
                          data-host-tmux-session={identityKey}
                          variant="destructive"
                          checked={checked}
                          disabled={isPending}
                          aria-label={t('tmux.host-inventory.select-session', { name: session.sessionName })}
                          onCheckedChange={(value) => toggle(session, value === true)}
                        />
                        <Terminal className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <span className="min-w-0 flex-1 space-y-1">
                          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                            <code className="min-w-0 truncate text-[11px] text-foreground" title={session.sessionName}>
                              {session.sessionName}
                            </code>
                            <span className="rounded-sm border border-border/70 bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">
                              {session.kind === 'hobgoblin'
                                ? t('tmux.host-inventory.terminal-number', { number: session.terminalNumber })
                                : t('tmux.host-inventory.default-session')}
                            </span>
                            <span
                              className={
                                session.attachedClients > 0
                                  ? 'rounded-sm border border-warning-border bg-warning-surface px-1.5 py-0.5 text-[10px] text-warning'
                                  : 'rounded-sm border border-border/70 bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground'
                              }
                            >
                              {session.attachedClients > 0
                                ? t('tmux.host-inventory.attached', { count: session.attachedClients })
                                : t('tmux.host-inventory.detached')}
                            </span>
                          </span>
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          data-host-tmux-open-session={session.sessionName}
                          disabled={isPending}
                          aria-label={t('tmux.host-inventory.open-external', { name: session.sessionName })}
                          title={t('tmux.host-inventory.open-external', { name: session.sessionName })}
                          onClick={() => void run(openActionId, () => executeOpen(session))}
                        >
                          {pending === openActionId ? (
                            <Loader2 className="animate-spin" aria-hidden="true" />
                          ) : (
                            <ExternalLink aria-hidden="true" />
                          )}
                        </Button>
                      </div>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>

          <div className="flex items-start gap-2 rounded-md border border-danger-border bg-danger-surface px-3 py-2 text-[11px] leading-4 text-danger">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>{t('tmux.host-inventory.warning')}</span>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" disabled={isPending} onClick={closeDialog}>
              {t('dialog.cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              data-host-tmux-close-selected
              disabled={selected.size === 0 || isPending}
              aria-busy={isPending ? true : undefined}
              onClick={() => void run('close', executeClose)}
            >
              {isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              {t('tmux.host-inventory.close-selected', { count: selected.size })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    ),
  }
}

function groupSessionsByDirectory(
  sessions: readonly TmuxHostSessionRecord[],
): Array<[string, TmuxHostSessionRecord[]]> {
  const groups = new Map<string, TmuxHostSessionRecord[]>()
  for (const session of sessions) {
    const group = groups.get(session.initialPath)
    if (group) group.push(session)
    else groups.set(session.initialPath, [session])
  }
  return [...groups]
}

function tmuxSessionIdentity(session: TmuxHostSessionRecord): TmuxHostSessionIdentity {
  return session.kind === 'default'
    ? { kind: 'default', sessionName: session.sessionName }
    : {
        kind: 'hobgoblin',
        sessionName: session.sessionName,
        ...(session.serverName === undefined ? {} : { serverName: session.serverName }),
      }
}

function tmuxSessionIdentityKey(identity: TmuxHostSessionIdentity | TmuxHostSessionRecord): string {
  return `${identity.kind}\0${identity.serverName ?? 'legacy-default'}\0${identity.sessionName}`
}

function hostInventoryVisible(projectRoot?: string): boolean {
  return supportsTmuxMenu(projectRoot)
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'unknown'
}
