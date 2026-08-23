import { useEffect, useState } from 'react'
import { DialogFooter } from '#/web/components/ui/dialog.tsx'
import { Button } from '#/web/components/ui/button.tsx'
import { DialogStatusRow } from '#/web/components/ui/dialog-status-row.tsx'
import { FormDialog } from '#/web/components/ui/form-dialog.tsx'
import { Field, FieldLabel } from '#/web/components/ui/field.tsx'
import { Input } from '#/web/components/ui/input.tsx'
import { tildify, untildify } from '#/web/lib/paths.ts'
import { chooseLocalRepositoryPath, hasNativeDirectoryPicker } from '#/web/app-shell-client.ts'
import { useLatestAsyncTask } from '#/web/hooks/useLatestAsyncTask.ts'
import { useIsCompactUi } from '#/web/hooks/useResponsiveUiMode.tsx'
import { useT } from '#/web/stores/i18n.ts'
import { cn } from '#/web/lib/cn.ts'
import type { OpenRepoResult } from '#/web/stores/repos/types.ts'
import { getWindowsWslDistributions } from '#/web/remote-client.ts'
import { normalizeRemoteRepoId } from '#/shared/remote-repo.ts'
import { getInitialBootstrap } from '#/web/bootstrap.ts'
import type { OpenRepositorySource } from '#/web/lib/open-repo-dialog.ts'
interface Props {
  open: boolean
  initialSource?: OpenRepositorySource
  onClose: () => void
  onOpen: (path: string) => Promise<OpenRepoResult>
}

export function OpenRepositoryDialog({ open, initialSource = 'local', onClose, onOpen }: Props) {
  const t = useT()
  const compact = useIsCompactUi()
  const supportsWslImport = getInitialBootstrap().hostPlatform === 'win32'
  const requestedSource = initialSource === 'wsl' && supportsWslImport ? 'wsl' : 'local'
  const [path, setPath] = useState('')
  const [source, setSource] = useState<OpenRepositorySource>(requestedSource)
  const [distribution, setDistribution] = useState('')
  const [distributions, setDistributions] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const { pending, reset, runLatest } = useLatestAsyncTask()

  const trimmedPath = path.trim()
  const effectiveSource = supportsWslImport ? source : 'local'
  const resolvedPath = effectiveSource === 'local' ? untildify(trimmedPath) : trimmedPath
  const canSubmit =
    resolvedPath.length > 0 &&
    !pending &&
    (effectiveSource === 'local' || (distribution.trim().length > 0 && resolvedPath.startsWith('/')))
  const canChoosePath = effectiveSource === 'local' && hasNativeDirectoryPicker()
  const statusText = error ?? ''

  useEffect(() => {
    if (!open) return
    setPath('')
    setSource(requestedSource)
    setDistribution('')
    reset()
    setError(null)
    if (!supportsWslImport) {
      setDistributions([])
      return
    }
    let cancelled = false
    void getWindowsWslDistributions()
      .then((items) => {
        if (cancelled) return
        setDistributions(items)
        setDistribution(items[0] ?? '')
      })
      .catch(() => {
        if (!cancelled) setDistributions([])
      })
    return () => {
      cancelled = true
    }
  }, [open, requestedSource, reset, supportsWslImport])

  async function choosePath() {
    if (pending || !canChoosePath) return
    try {
      const selected = await chooseLocalRepositoryPath()
      if (selected) {
        setPath(tildify(selected))
        setError(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.unknown'))
    }
  }

  async function handleSubmit() {
    if (!canSubmit) return
    setError(null)
    try {
      const input =
        effectiveSource === 'wsl'
          ? normalizeRemoteRepoId({ transport: 'wsl', alias: distribution.trim(), remotePath: resolvedPath })
          : resolvedPath
      const result = await runLatest(() => onOpen(input))
      if (result.status === 'stale') return
      if (result.value.ok) {
        onClose()
        return
      }
      setError(t(result.value.message))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.unknown'))
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !pending) onClose()
      }}
      showCloseButton={!pending}
      title={effectiveSource === 'wsl' ? t('repo-tabs.open-wsl-title') : t('repo-tabs.open-title')}
      description={effectiveSource === 'wsl' ? t('repo-tabs.open-wsl-description') : t('repo-tabs.open-description')}
    >
      <form
        className="space-y-0"
        onSubmit={(event) => {
          event.preventDefault()
          void handleSubmit()
        }}
      >
        {supportsWslImport ? (
          <Field>
            <FieldLabel>{t('repo-tabs.open-source-label')}</FieldLabel>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={source === 'local' ? 'default' : 'outline'}
                disabled={pending}
                onClick={() => setSource('local')}
              >
                {t('repo-tabs.open-source-local')}
              </Button>
              <Button
                type="button"
                variant={source === 'wsl' ? 'default' : 'outline'}
                disabled={pending}
                onClick={() => setSource('wsl')}
              >
                {t('repo-tabs.open-source-wsl')}
              </Button>
            </div>
          </Field>
        ) : null}
        {effectiveSource === 'wsl' ? (
          <Field>
            <FieldLabel htmlFor="open-repo-wsl-distribution">{t('repo-tabs.open-wsl-distribution-label')}</FieldLabel>
            <Input
              id="open-repo-wsl-distribution"
              disabled={pending}
              value={distribution}
              list={distributions.length > 0 ? 'open-repo-wsl-distributions' : undefined}
              onChange={(event) => {
                setDistribution(event.target.value)
                setError(null)
              }}
              placeholder={t('repo-tabs.open-wsl-distribution-placeholder')}
            />
            {distributions.length > 0 ? (
              <datalist id="open-repo-wsl-distributions">
                {distributions.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            ) : null}
          </Field>
        ) : null}
        <Field>
          <FieldLabel htmlFor="open-repo-path">
            {effectiveSource === 'wsl' ? t('repo-tabs.open-wsl-path-label') : t('repo-tabs.open-path-label')}
          </FieldLabel>
          <div className={cn('gap-2', compact ? 'flex flex-col' : 'flex')}>
            <Input
              id="open-repo-path"
              autoFocus
              disabled={pending}
              value={path}
              onChange={(event) => {
                setPath(event.target.value)
                setError(null)
              }}
              placeholder={
                effectiveSource === 'wsl'
                  ? t('repo-tabs.open-wsl-path-placeholder')
                  : t('repo-tabs.open-path-placeholder')
              }
              className="min-w-0 flex-1 font-mono text-xs"
            />
            {canChoosePath ? (
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                className={cn('h-auto self-stretch px-3', compact && 'w-full')}
                onClick={() => void choosePath()}
              >
                {t('repo-tabs.open-path-choose')}
              </Button>
            ) : null}
          </div>
          <DialogStatusRow message={statusText} tone={error ? 'danger' : 'default'} />
        </Field>

        <DialogFooter className="pt-4">
          <Button
            type="button"
            variant="outline"
            className={cn(compact && 'w-full')}
            disabled={pending}
            onClick={onClose}
          >
            {t('dialog.cancel')}
          </Button>
          <Button type="submit" className={cn(compact && 'w-full')} disabled={!canSubmit}>
            {pending
              ? t('repo-tabs.open-opening')
              : effectiveSource === 'wsl'
                ? t('repo-tabs.open-wsl-confirm')
                : t('repo-tabs.open-local-confirm')}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  )
}
