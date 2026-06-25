import { useCallback, useEffect, useMemo, useState } from 'react'
import { Copy, ExternalLink, Play, Square, Trash2 } from 'lucide-react'
import { useStoreWithEqualityFn } from 'zustand/traditional'
import { Badge, type BadgeVariant } from '#/web/components/ui/badge.tsx'
import { Button } from '#/web/components/ui/button.tsx'
import { Input } from '#/web/components/ui/input.tsx'
import { Switch } from '#/web/components/ui/switch.tsx'
import { openExternalUrl } from '#/web/app-shell-client.ts'
import {
  activatePortForwardSession,
  deletePortForwardSession,
  listPortForwardSessions,
  startPortForwardSession,
  stopPortForwardSession,
} from '#/web/port-forwarding-client.ts'
import { useT } from '#/web/stores/i18n.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import {
  isLoopbackBindHost,
  normalizePortForwardStartRequest,
  type PortForwardSessionSnapshot,
  type PortForwardSessionStatus,
} from '#/shared/port-forwarding.ts'
import { isRemoteRepoId } from '#/shared/remote-repo.ts'

interface PortsPanelView {
  exists: boolean
  isRemote: boolean
}

const LOOPBACK_BIND_HOST = '127.0.0.1'
const LAN_BIND_HOST = '0.0.0.0'
const REMOTE_LOOPBACK_HOST = '127.0.0.1'

export function ProjectPortsPanel({ repoId }: { repoId: string }) {
  const t = useT()
  const view = usePortsPanelView(repoId)
  const [allowLanAccess, setAllowLanAccess] = useState(false)
  const [localPort, setLocalPort] = useState('')
  const [remotePort, setRemotePort] = useState('')
  const [remotePortFollowsLocal, setRemotePortFollowsLocal] = useState(true)
  const [sessions, setSessions] = useState<PortForwardSessionSnapshot[]>([])
  const [loading, setLoading] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadSessions = useCallback(
    async (signal?: AbortSignal) => {
      if (!view.exists || !view.isRemote) return
      setLoading(true)
      const result = await listPortForwardSessions(repoId, signal)
      if (signal?.aborted) return
      setLoading(false)
      if (result.ok) {
        setSessions(result.sessions)
        setError(null)
      } else {
        setError(result.message)
      }
    },
    [repoId, view.exists, view.isRemote],
  )

  useEffect(() => {
    const controller = new AbortController()
    void loadSessions(controller.signal)
    const timer = window.setInterval(() => void loadSessions(controller.signal), 3000)
    return () => {
      controller.abort()
      window.clearInterval(timer)
    }
  }, [loadSessions])

  const localBindHost = allowLanAccess ? LAN_BIND_HOST : LOOPBACK_BIND_HOST
  const nonLoopback = useMemo(() => !isLoopbackBindHost(localBindHost), [localBindHost])

  function handleLocalPortChange(value: string) {
    setLocalPort(value)
    if (remotePortFollowsLocal) setRemotePort(value)
  }

  function handleRemotePortChange(value: string) {
    setRemotePort(value)
    setRemotePortFollowsLocal(false)
  }

  async function handleStart() {
    const normalized = normalizePortForwardStartRequest({
      repoId,
      localBindHost,
      localPort: Number(localPort),
      remoteHost: REMOTE_LOOPBACK_HOST,
      remotePort: Number(remotePort),
    })
    if (!normalized.ok) {
      setError(normalized.message)
      return
    }
    const controller = new AbortController()
    setPending(true)
    setError(null)
    const result = await startPortForwardSession(normalized.request, controller.signal)
    setPending(false)
    if (!result.ok) setError(result.detail || result.message)
    await loadSessions()
  }

  if (!view.exists) return null
  if (!view.isRemote) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-4 text-center">
        <div>
          <div className="text-sm font-medium text-foreground">{t('ports.local-only-title')}</div>
          <div className="mt-1 text-xs text-muted-foreground">{t('ports.local-only-body')}</div>
        </div>
      </div>
    )
  }

  const lanAccessLabel = t('ports.allow-lan-access')
  const startLabel = t('ports.start')

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto bg-pane p-3 text-xs">
      <div className="grid items-center gap-1.5 md:grid-cols-[5.5rem_5.5rem_auto_auto]">
        <Input
          name="localPort"
          value={localPort}
          onChange={(event) => handleLocalPortChange(event.currentTarget.value)}
          placeholder={t('ports.local-port')}
          aria-label={t('ports.local-port')}
          className="h-7 px-2 py-1 text-xs"
        />
        <Input
          name="remotePort"
          value={remotePort}
          onChange={(event) => handleRemotePortChange(event.currentTarget.value)}
          placeholder={t('ports.remote-port')}
          aria-label={t('ports.remote-port')}
          className="h-7 px-2 py-1 text-xs"
        />
        <label className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground" title={lanAccessLabel}>
          <Switch
            checked={allowLanAccess}
            onCheckedChange={setAllowLanAccess}
            aria-label={lanAccessLabel}
            title={lanAccessLabel}
          />
          <span className="text-[11px] leading-none">{t('ports.lan-short')}</span>
        </label>
        <Button
          data-testid="ports-start"
          type="button"
          size="icon-sm"
          disabled={pending}
          aria-label={startLabel}
          title={startLabel}
          onClick={handleStart}
        >
          <Play className="size-3.5" />
        </Button>
      </div>
      {nonLoopback ? (
        <div className="rounded border border-attention/50 px-2 py-1 text-attention">
          {t('ports.non-loopback-warning')}
        </div>
      ) : null}
      {error ? <div className="text-danger">{t(error)}</div> : null}
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        {loading && sessions.length === 0 ? <div className="text-muted-foreground">{t('ports.loading')}</div> : null}
        {!loading && sessions.length === 0 ? <div className="text-muted-foreground">{t('ports.empty')}</div> : null}
        {sessions.map((session) => (
          <PortForwardSessionRow key={session.id} session={session} onChanged={loadSessions} />
        ))}
      </div>
    </div>
  )
}

function PortForwardSessionRow({
  session,
  onChanged,
}: {
  session: PortForwardSessionSnapshot
  onChanged: () => Promise<void>
}) {
  const t = useT()
  const canUseUrl = !!session.localUrl && session.status === 'active'
  const canDelete = session.status === 'failed' || session.status === 'stopped'
  const canActivate = session.status === 'failed' || session.status === 'stopped'
  return (
    <div className="flex min-w-0 items-center gap-1.5 rounded border border-separator px-1.5 py-1">
      <div className="min-w-0 flex-1">
        <div className="truncate font-mono text-[11px]">
          {session.localBindHost}:{session.actualLocalPort ?? session.requestedLocalPort ?? session.remotePort} -&gt;{' '}
          {session.remoteHost}:{session.remotePort}
        </div>
        {session.message ? <div className="mt-0.5 truncate text-danger">{t(session.message)}</div> : null}
      </div>
      <Badge variant={variantForStatus(session.status)}>{session.status}</Badge>
      <Button
        data-testid={`ports-open-${session.id}`}
        type="button"
        size="icon-xs"
        variant="ghost"
        aria-label={t('ports.open')}
        title={t('ports.open')}
        disabled={!canUseUrl}
        onClick={() => session.localUrl && void openExternalUrl(session.localUrl)}
      >
        <ExternalLink className="size-3.5" />
      </Button>
      <Button
        data-testid={`ports-copy-${session.id}`}
        type="button"
        size="icon-xs"
        variant="ghost"
        aria-label={t('ports.copy')}
        title={t('ports.copy')}
        disabled={!canUseUrl}
        onClick={() => session.localUrl && void navigator.clipboard?.writeText(session.localUrl)}
      >
        <Copy className="size-3.5" />
      </Button>
      <Button
        data-testid={`ports-activate-${session.id}`}
        type="button"
        size="icon-xs"
        variant="ghost"
        aria-label={t('ports.activate')}
        title={t('ports.activate')}
        disabled={!canActivate}
        onClick={async () => {
          await activatePortForwardSession(session.id)
          await onChanged()
        }}
      >
        <Play className="size-3.5" />
      </Button>
      <Button
        data-testid={`ports-stop-${session.id}`}
        type="button"
        size="icon-xs"
        variant="ghost"
        aria-label={t('ports.stop')}
        title={t('ports.stop')}
        disabled={session.status === 'stopped'}
        onClick={async () => {
          await stopPortForwardSession(session.id)
          await onChanged()
        }}
      >
        <Square className="size-3.5" />
      </Button>
      <Button
        data-testid={`ports-delete-${session.id}`}
        type="button"
        size="icon-xs"
        variant="ghost"
        className="text-danger hover:bg-danger-surface hover:text-danger"
        aria-label={t('ports.delete-history')}
        title={t('ports.delete-history')}
        disabled={!canDelete}
        onClick={async () => {
          await deletePortForwardSession(session.id)
          await onChanged()
        }}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  )
}

function variantForStatus(status: PortForwardSessionStatus): BadgeVariant {
  if (status === 'active') return 'success'
  if (status === 'failed') return 'destructive'
  return 'secondary'
}

function usePortsPanelView(repoId: string): PortsPanelView {
  return useStoreWithEqualityFn(
    useReposStore,
    (state) => {
      const repo = state.repos[repoId]
      return { exists: !!repo, isRemote: !!repo && isRemoteRepoId(repoId) }
    },
    (a, b) => a.exists === b.exists && a.isRemote === b.isRemote,
  )
}
