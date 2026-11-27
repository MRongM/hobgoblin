import { useContext, useEffect, useState, type FormEvent, type ReactElement } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { History, MessageSquareText } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import {
  AGENT_SESSIONS_PREFIX,
  MAX_AGENT_PROMPT_LENGTH,
  type AgentProject,
  type AgentProvider,
  type AgentSessionDetail,
  type AgentSessionSummary,
  type AgentTargetCatalog,
} from '#/shared/agent-sessions.ts'
import { isRemoteRepoId } from '#/shared/remote-repo.ts'
import { Button } from '#/web/components/ui/button.tsx'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '#/web/components/ui/dialog.tsx'
import { fetchServerJson, postServerJson, ServerRequestError } from '#/web/lib/server-fetch.ts'
import { useT } from '#/web/stores/i18n.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { workspaceRootIdForRepo } from '#/web/stores/repos/workspace-projects.ts'
import { parseWorktreeTerminalKey } from '#/web/components/terminal/terminal-session-keys.ts'
import { TerminalSessionContext } from '#/web/components/terminal/terminal-session-context.ts'
import type { TerminalSessionBase } from '#/web/components/terminal/types.ts'

const agentKey = ['background-agent-sessions']
const workspacePath = (id: string) => AGENT_SESSIONS_PREFIX + '/workspaces/' + encodeURIComponent(id)
const sessionPath = (id: string) => AGENT_SESSIONS_PREFIX + '/sessions/' + encodeURIComponent(id)
const selectStyle = 'min-w-0 w-full rounded-md border border-input bg-background p-1.5 text-sm'

interface SendRequest {
  path: string
  requestId: string
  prompt: string
  provider?: AgentProvider
  worktreeId?: string
}

export function DesktopTerminalAgentSessions({
  worktreeTerminalKey,
  terminalTarget,
}: {
  worktreeTerminalKey: string
  terminalTarget?: TerminalSessionBase | null
}) {
  const t = useT()
  const queryClient = useQueryClient()
  const resumeAgentTerminal = useContext(TerminalSessionContext)?.resumeAgentTerminal
  const location = parseWorktreeTerminalKey(worktreeTerminalKey)
  const projectRoot = useReposStore((state) =>
    location ? (workspaceRootIdForRepo(state, location.repoRoot) ?? location.repoRoot) : '',
  )
  const worktreePath = location?.worktreePath ?? ''
  const entries = useQuery({
    queryKey: [...agentKey, 'terminal-entries', projectRoot, worktreePath],
    queryFn: ({ signal }) => {
      const query = new URLSearchParams({ projectRoot, worktreePath })
      return fetchServerJson<{ sessions: Array<AgentSessionSummary & { canResumeInTerminal: boolean }> }>(
        AGENT_SESSIONS_PREFIX + '/terminal-entries?' + query,
        { signal },
      )
    },
    enabled: Boolean(projectRoot && worktreePath),
    refetchInterval: 4_000,
  })
  return (
    <>
      {entries.data?.sessions.map((entry) => {
        const title =
          entry.latestTurn?.prompt.trim().split('\n')[0] || (entry.provider === 'codex' ? 'Codex' : 'Claude')
        const resume =
          entry.canResumeInTerminal && entry.status !== 'working' && terminalTarget && resumeAgentTerminal
            ? () =>
                resumeAgentTerminal(terminalTarget, projectRoot, entry.id).finally(() => {
                  void queryClient.invalidateQueries({ queryKey: agentKey })
                })
            : undefined
        return (
          <AgentSessionDialog key={entry.id} initial={entry} resume={resume}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 max-w-40 shrink-0 gap-1 rounded-b-none border-b border-dashed border-separator px-1.5"
              title={title}
              data-interactive
            >
              <MessageSquareText aria-hidden="true" />
              <span className="truncate">{title}</span>
              {(entry.status === 'working' || entry.terminalActive) && (
                <>
                  <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
                  <span className="sr-only">
                    {t(entry.terminalActive ? 'agent-sessions.terminal-active' : 'agent-sessions.running')}
                  </span>
                </>
              )}
            </Button>
          </AgentSessionDialog>
        )
      })}
      {projectRoot && worktreePath && !isRemoteRepoId(projectRoot) && (
        <CodexHistoryImport
          key={worktreeTerminalKey}
          locationQuery={new URLSearchParams({ projectRoot, worktreePath }).toString()}
        />
      )}
    </>
  )
}

function CodexHistoryImport({ locationQuery }: { locationQuery: string }) {
  const t = useT()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const path = AGENT_SESSIONS_PREFIX + '/codex-history'
  const sessions = useQuery({
    queryKey: [...agentKey, 'codex-history', locationQuery],
    queryFn: ({ signal }) =>
      fetchServerJson<{ sessions: Array<{ id: string; title: string }> }>(path + '?' + locationQuery, { signal }),
    enabled: open,
  })
  const sync = useMutation({
    mutationFn: (id: string) => postServerJson(path + '/' + encodeURIComponent(id) + '?' + locationQuery, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: agentKey })
      setOpen(false)
    },
  })
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (sync.isPending) return
        sync.reset()
        setOpen(nextOpen)
      }}
    >
      <DialogPrimitive.Trigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="h-7 shrink-0"
          title={t('agent-sessions.import-codex')}
          aria-label={t('agent-sessions.import-codex')}
          data-interactive
        >
          <History aria-hidden="true" />
        </Button>
      </DialogPrimitive.Trigger>
      <DialogContent className="max-h-[min(36rem,85dvh)] overflow-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t('agent-sessions.import-codex')}</DialogTitle>
        </DialogHeader>
        {(sessions.isError || sync.isError) && (
          <p role="alert" className="text-sm text-destructive">
            {t('agent-sessions.import-codex-error')}
          </p>
        )}
        {sessions.isPending && (
          <p role="status" className="text-sm text-muted-foreground">
            {t('agent-sessions.loading')}
          </p>
        )}
        {sessions.data?.sessions.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('agent-sessions.import-codex-empty')}</p>
        )}
        {sessions.data?.sessions.map((entry) => (
          <Button
            key={entry.id}
            type="button"
            variant="outline"
            className="min-w-0 justify-start"
            disabled={sync.isPending}
            onClick={() => sync.mutate(entry.id)}
          >
            <span className="truncate">{entry.title}</span>
          </Button>
        ))}
      </DialogContent>
    </Dialog>
  )
}

function AgentSessionDialog({
  children,
  initial,
  resume,
}: {
  children: ReactElement
  initial: Pick<AgentSessionSummary, 'id' | 'workspaceId'>
  resume?: () => Promise<string>
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [launching, setLaunching] = useState(false)
  const [launchFailed, setLaunchFailed] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger
        asChild
        aria-busy={launching}
        onClick={(event) => {
          if (!resume) return
          event.preventDefault()
          if (launching) return
          setLaunching(true)
          setLaunchFailed(false)
          void resume()
            .catch((error: unknown) => {
              setLaunchFailed(!(error instanceof ServerRequestError && error.status === 409))
              setOpen(true)
            })
            .finally(() => setLaunching(false))
        }}
      >
        {children}
      </DialogPrimitive.Trigger>
      <DialogContent
        className="flex h-[min(46rem,calc(100dvh-2rem))] flex-col sm:max-w-4xl"
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle>{t('agent-sessions.title')}</DialogTitle>
        </DialogHeader>
        {launchFailed && (
          <p role="alert" className="text-sm text-destructive">
            {t('agent-sessions.terminal-error')}
          </p>
        )}
        {open && <AgentSessionPanel initial={initial} />}
      </DialogContent>
    </Dialog>
  )
}

function AgentSessionPanel({ initial }: { initial: Pick<AgentSessionSummary, 'id' | 'workspaceId'> }) {
  const t = useT()
  const queryClient = useQueryClient()
  const [projectId, setProjectId] = useState(initial.workspaceId)
  const [sessionId, setSessionId] = useState(initial.id)
  const [worktreeId, setWorktreeId] = useState('')
  const [provider, setProvider] = useState<AgentProvider>('codex')
  const [draft, setDraft] = useState('')
  const [retry, setRetry] = useState<SendRequest | null>(null)

  const projects = useQuery({
    queryKey: [...agentKey, 'projects'],
    queryFn: ({ signal }) =>
      fetchServerJson<{ workspaces: AgentProject[] }>(AGENT_SESSIONS_PREFIX + '/workspaces', { signal }),
    refetchInterval: 8_000,
  })
  const workspaces = projects.data?.workspaces ?? []
  const project =
    workspaces.find((entry) => entry.id === projectId) ?? workspaces.find((entry) => entry.active) ?? workspaces[0]
  const root = project ? workspacePath(project.id) : ''
  const sessions = useQuery({
    queryKey: [...agentKey, 'summaries', project?.id],
    queryFn: ({ signal }) => fetchServerJson<{ sessions: AgentSessionSummary[] }>(root + '/sessions', { signal }),
    enabled: !!project,
    refetchInterval: 4_000,
  })
  const targets = useQuery({
    queryKey: [...agentKey, 'targets', project?.id],
    queryFn: ({ signal }) => fetchServerJson<AgentTargetCatalog>(root + '/targets', { signal }),
    enabled: !!project,
  })
  const path = sessionPath(sessionId)
  const status = useQuery({
    queryKey: [...agentKey, 'status', sessionId],
    queryFn: async ({ signal }) => {
      try {
        return await fetchServerJson<AgentSessionSummary>(path + '/status', { signal })
      } catch (error) {
        if (error instanceof ServerRequestError && error.status === 404) return null
        throw error
      }
    },
    enabled: !!sessionId,
    refetchInterval: (query) => (query.state.data?.latestTurn?.state === 'working' ? 1_500 : 4_000),
  })
  const summary = status.data
  const detail = useQuery({
    queryKey: [...agentKey, 'detail', sessionId, summary?.updatedAt, summary?.latestTurn?.state],
    queryFn: ({ signal }) => fetchServerJson<AgentSessionDetail>(path, { signal }),
    enabled: !!summary,
    placeholderData: (previous) => (previous?.id === sessionId ? previous : undefined),
  })

  const send = useMutation({
    mutationFn: ({ path, requestId, prompt, provider, worktreeId }: SendRequest) =>
      postServerJson(
        path,
        provider ? { requestId, prompt, mode: 'background', provider, worktreeId } : { requestId, prompt },
      ),
    onSuccess: (response) => {
      const { sessionId } = response as { sessionId: string }
      setSessionId(sessionId)
      setDraft('')
      setRetry(null)
      void queryClient.invalidateQueries({ queryKey: agentKey })
    },
  })
  const stop = useMutation({
    mutationFn: (requestId: string) =>
      fetchServerJson(path + '/turns/' + encodeURIComponent(requestId), { method: 'DELETE' }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: agentKey }),
  })

  const missingSession = status.data === null
  const resetSend = send.reset
  const resetStop = stop.reset
  useEffect(() => {
    if (!missingSession) return
    setSessionId('')
    setDraft('')
    setRetry(null)
    resetSend()
    resetStop()
    void queryClient.invalidateQueries({ queryKey: [...agentKey, 'summaries'] })
  }, [missingSession, queryClient, resetSend, resetStop])

  const busy = send.isPending || stop.isPending
  const working = summary?.latestTurn?.state === 'working'
  const terminalActive = summary?.terminalActive === true
  const directTargets = targets.data?.worktrees ?? []
  const subspaces = targets.data?.subworkspaces ?? []
  const selectedWorktree = worktreeId || directTargets.find((entry) => entry.primary)?.id || directTargets[0]?.id || ''
  const currentTarget = summary?.worktreeId ?? selectedWorktree
  const currentGroup = subspaces.find(
    (group) => group.root?.id === currentTarget || group.worktrees.some((tree) => tree.id === currentTarget),
  )
  const currentTree =
    directTargets.find((tree) => tree.id === currentTarget) ??
    [currentGroup?.root, ...(currentGroup?.worktrees ?? [])].find((tree) => tree?.id === currentTarget)
  const location = [...new Set([project?.name, currentGroup?.name, currentTree?.name].filter(Boolean))].join(' / ')

  function selectSession(id: string) {
    setSessionId(id)
    setDraft('')
    setRetry(null)
    send.reset()
    stop.reset()
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (
      !draft.trim() ||
      busy ||
      working ||
      terminalActive ||
      !project ||
      (sessionId ? !summary || summary.status === 'closed' : !selectedWorktree)
    )
      return
    const endpoint = sessionId ? path + '/turns' : root + '/sessions'
    const request =
      retry?.path === endpoint &&
      retry.prompt === draft &&
      (sessionId || (retry.provider === provider && retry.worktreeId === selectedWorktree))
        ? retry
        : {
            path: endpoint,
            requestId: crypto.randomUUID(),
            prompt: draft,
            ...(!sessionId ? { provider, worktreeId: selectedWorktree } : {}),
          }
    setRetry(request)
    send.mutate(request)
  }

  const loadError = projects.isError || sessions.isError || targets.isError || status.isError || detail.isError
  const summaries = sessions.data?.sessions ?? []
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(9rem,14rem)_minmax(0,1fr)] overflow-hidden rounded-md border">
      <aside className="flex min-h-0 flex-col gap-2 border-r bg-muted/25 p-2">
        <select
          aria-label={t('agent-sessions.project')}
          className={selectStyle}
          value={project?.id ?? ''}
          disabled={busy || !workspaces.length}
          onChange={(event) => {
            setProjectId(event.target.value)
            setWorktreeId('')
            selectSession('')
          }}
        >
          {!workspaces.length && <option value="">{t('agent-sessions.no-projects')}</option>}
          {workspaces.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
            </option>
          ))}
        </select>
        <Button type="button" variant="outline" size="sm" onClick={() => selectSession('')} disabled={busy || !project}>
          {t('agent-sessions.new')}
        </Button>
        <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
          {[...summaries]
            .sort((a, b) => Number(b.status === 'working') - Number(a.status === 'working'))
            .map((item) => (
              <li key={item.id}>
                <Button
                  type="button"
                  variant={sessionId === item.id ? 'secondary' : 'ghost'}
                  className="h-auto w-full justify-start px-2 py-1.5 text-left"
                  disabled={busy}
                  onClick={() => selectSession(item.id)}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm">
                      {item.latestTurn?.prompt.trim().split('\n')[0] || item.provider}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {item.provider === 'codex' ? 'Codex' : 'Claude'}
                      {item.status === 'working' && ' · ' + t('agent-sessions.running')}
                    </span>
                  </span>
                </Button>
              </li>
            ))}
        </ul>
      </aside>
      <section className="flex min-h-0 min-w-0 flex-col">
        <div className="border-b p-2">
          {sessionId ? (
            <p className="truncate text-sm">{location}</p>
          ) : (
            <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2">
              <select
                aria-label={t('agent-sessions.worktree')}
                className={selectStyle}
                value={selectedWorktree}
                onChange={(event) => setWorktreeId(event.target.value)}
                disabled={busy || !targets.data}
              >
                {!directTargets.length && <option value="">{t('agent-sessions.worktree')}</option>}
                {directTargets.map((tree) => (
                  <option key={tree.id} value={tree.id}>
                    {treeLabel(tree)}
                  </option>
                ))}
                {subspaces.map((group) => (
                  <optgroup key={group.id} label={group.name}>
                    {group.root && <option value={group.root.id}>{group.root.name}</option>}
                    {group.worktrees.map((tree) => (
                      <option key={tree.id} value={tree.id}>
                        {treeLabel(tree)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <select
                aria-label={t('agent-sessions.provider')}
                className={selectStyle}
                value={provider}
                onChange={(event) => setProvider(event.target.value === 'claude' ? 'claude' : 'codex')}
                disabled={busy}
              >
                <option value="codex">Codex</option>
                <option value="claude">Claude</option>
              </select>
            </div>
          )}
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3">
          {summary &&
            detail.data?.messages.map((message) => (
              <p
                key={message.id}
                className={
                  message.role === 'user'
                    ? 'max-w-[85%] self-end rounded-lg bg-accent p-2 text-sm whitespace-pre-wrap break-words'
                    : 'text-sm whitespace-pre-wrap break-words'
                }
              >
                {message.content}
              </p>
            ))}
          {working && (
            <p role="status" className="text-sm text-muted-foreground">
              {t('agent-sessions.running')}
            </p>
          )}
          {summary?.latestTurn?.state === 'cancelled' && (
            <p className="text-sm text-muted-foreground">{t('agent-sessions.stopped')}</p>
          )}
          {summary?.latestTurn?.state === 'failed' && (
            <p className="text-sm text-destructive">{t('agent-sessions.failed')}</p>
          )}
          {loadError && (
            <p role="alert" className="text-sm text-destructive">
              {t('agent-sessions.load-error')}
            </p>
          )}
        </div>
        <form onSubmit={submit} className="border-t p-2">
          {terminalActive && (
            <p role="status" className="pb-2 text-sm text-muted-foreground">
              {t('agent-sessions.terminal-active')}
            </p>
          )}
          {(send.isError || stop.isError) && (
            <p role="alert" className="pb-2 text-sm text-destructive">
              {t(stop.isError ? 'agent-sessions.stop-error' : 'agent-sessions.send-error')}
            </p>
          )}
          <div className="flex items-end gap-2">
            <textarea
              aria-label={t('agent-sessions.message')}
              placeholder={t('agent-sessions.message')}
              className="min-h-10 min-w-0 flex-1 resize-y rounded-md border border-input bg-background p-2 text-sm"
              rows={2}
              value={draft}
              maxLength={MAX_AGENT_PROMPT_LENGTH}
              disabled={send.isPending || summary?.status === 'closed'}
              onChange={(event) => setDraft(event.target.value)}
            />
            {working && summary?.latestTurn ? (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => stop.mutate(summary.latestTurn!.requestId)}
              >
                {t('agent-sessions.stop')}
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={
                  busy ||
                  terminalActive ||
                  !draft.trim() ||
                  !project ||
                  (sessionId ? !summary || summary.status === 'closed' : !selectedWorktree)
                }
              >
                {t('agent-sessions.send')}
              </Button>
            )}
          </div>
        </form>
      </section>
    </div>
  )
}

function treeLabel(tree: { name: string; branch: string | null }) {
  return tree.branch ? tree.name + ' · ' + tree.branch : tree.name
}
