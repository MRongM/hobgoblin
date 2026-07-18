import { Globe, QrCode } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useStoreWithEqualityFn } from 'zustand/traditional'
import { openExternalUrl } from '#/web/app-shell-client.ts'
import { Tip } from '#/web/components/Tip.tsx'
import { Button } from '#/web/components/ui/button.tsx'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '#/web/components/ui/dialog.tsx'
import { worktreeTerminalKey } from '#/web/components/terminal/terminal-session-keys.ts'
import { useWorktreeTerminalSnapshot } from '#/web/components/terminal/terminal-session-store.ts'
import { buildTerminalDeepLinkUrl } from '#/web/lib/terminal-deep-link.ts'
import { qrCodeDataUrls } from '#/web/lib/qr-code-images.ts'
import { useLanInfoQuery } from '#/web/settings-queries.ts'
import { useT } from '#/web/stores/i18n.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'

interface Props {
  repoId: string
}

interface TerminalStatusTarget {
  branch: string
  worktreePath: string
}

export function TerminalStatusActions({ repoId }: Props) {
  const t = useT()
  const [lanQrOpen, setLanQrOpen] = useState(false)
  const target = useStoreWithEqualityFn(
    useReposStore,
    (state): TerminalStatusTarget | null => {
      const repo = state.repos[repoId]
      const branchName = repo?.ui.selectedBranch ?? repo?.data.currentBranch
      const branch = branchName ? repo?.data.branches.find((candidate) => candidate.name === branchName) : null
      const worktreePath = branch?.worktree?.path
      return branch && worktreePath ? { branch: branch.name, worktreePath } : null
    },
    (left, right) =>
      left === right ||
      (!!left && !!right && left.branch === right.branch && left.worktreePath === right.worktreePath),
  )
  const terminalKey = target ? worktreeTerminalKey(repoId, target.worktreePath) : null
  const sessions = useWorktreeTerminalSnapshot(terminalKey).sessions
  const selectedSession = sessions.find((session) => session.selected) ?? sessions[0] ?? null
  const { data: lanInfo } = useLanInfoQuery()
  const lanUrls = useMemo(() => {
    if (!target) return []
    return (lanInfo?.lanUrls ?? []).map((url) =>
      buildTerminalDeepLinkUrl(url, {
        repoId,
        worktreePath: target.worktreePath,
        branch: target.branch,
        terminalId: selectedSession?.terminalId,
      }),
    )
  }, [lanInfo?.lanUrls, repoId, selectedSession?.terminalId, target])
  const browserUrl = useMemo(() => {
    if (!target || !lanInfo) return null
    const accessHost = lanInfo.host === '0.0.0.0' ? '127.0.0.1' : lanInfo.host
    return buildTerminalDeepLinkUrl(`http://${accessHost}:${lanInfo.port}`, {
      repoId,
      worktreePath: target.worktreePath,
      branch: target.branch,
      terminalId: selectedSession?.terminalId,
    })
  }, [lanInfo, repoId, selectedSession?.terminalId, target])

  if (!target) return null

  return (
    <div className="flex items-center gap-0.5">
      <Tip label={t('terminal.open-in-browser-title')}>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => {
            if (browserUrl) void openExternalUrl(browserUrl)
          }}
          disabled={!browserUrl}
          aria-label={t('terminal.open-in-browser')}
        >
          <Globe />
        </Button>
      </Tip>
      <Tip label={t('terminal.lan-qr-title')}>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => setLanQrOpen(true)}
          aria-label={t('terminal.lan-qr')}
        >
          <QrCode />
        </Button>
      </Tip>
      <TerminalLanQrDialog open={lanQrOpen} onOpenChange={setLanQrOpen} urls={lanUrls} />
    </div>
  )
}

interface TerminalLanQrDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  urls: string[]
}

function TerminalLanQrDialog({ open, onOpenChange, urls }: TerminalLanQrDialogProps) {
  const t = useT()
  const [qrCodes, setQrCodes] = useState<Record<string, string>>({})
  const urlKey = urls.join('\n')

  useEffect(() => {
    let cancelled = false
    if (!open || urls.length === 0) {
      setQrCodes({})
      return
    }
    void qrCodeDataUrls(urls).then((next) => {
      if (!cancelled) setQrCodes(next)
    })
    return () => {
      cancelled = true
    }
  }, [open, urlKey, urls])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('terminal.lan-qr-title')}</DialogTitle>
          <DialogDescription>
            {urls.length === 0 ? t('terminal.lan-qr-empty') : t('terminal.lan-qr-description')}
          </DialogDescription>
        </DialogHeader>
        {urls.length > 0 && (
          <div className="grid max-h-[70vh] grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2">
            {urls.map((url) => (
              <div key={url} className="flex min-w-0 flex-col items-center gap-2 rounded-md border bg-muted/20 p-3">
                {qrCodes[url] ? (
                  <img
                    data-testid="terminal-lan-qr-image"
                    src={qrCodes[url]}
                    alt={t('terminal.lan-qr-image-alt', { url })}
                    width={180}
                    height={180}
                    className="rounded border bg-white"
                  />
                ) : (
                  <div
                    data-testid="terminal-lan-qr-loading"
                    className="grid h-[180px] w-[180px] place-items-center rounded border bg-background text-xs text-muted-foreground"
                  >
                    {t('terminal.lan-qr-loading')}
                  </div>
                )}
                <code
                  data-testid="terminal-lan-qr-url"
                  className="w-full break-all rounded bg-background px-2 py-1 text-xs text-muted-foreground"
                >
                  {url}
                </code>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
