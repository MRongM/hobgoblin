import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { RemoteBranchSearchInput } from '#/web/components/branch-list/RemoteBranchSearchInput.tsx'
import { Button } from '#/web/components/ui/button.tsx'
import { DialogError } from '#/web/components/ui/dialog-error.tsx'
import { DialogFooter } from '#/web/components/ui/dialog.tsx'
import { Field, FieldDescription, FieldLabel } from '#/web/components/ui/field.tsx'
import { FormDialog } from '#/web/components/ui/form-dialog.tsx'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/web/components/ui/select.tsx'
import { remoteBranchRefMatchesQuery } from '#/shared/remote-branches.ts'
import { getRepositoryRemoteBranches } from '#/web/repo-client.ts'
import { useT } from '#/web/stores/i18n.ts'
import type { RepoBranchState } from '#/web/stores/repos/types.ts'

interface BranchUpstreamDialogProps {
  open: boolean
  repoId: string
  branch: RepoBranchState
  busy: boolean
  onClose: () => void
  onSubmit: (remoteRef: string | null) => void | Promise<void>
}

export function BranchUpstreamDialog({
  open,
  repoId,
  branch,
  busy,
  onClose,
  onSubmit,
}: BranchUpstreamDialogProps) {
  const t = useT()
  const [remoteBranches, setRemoteBranches] = useState<string[]>([])
  const [selected, setSelected] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    if (!open) {
      setRemoteBranches([])
      setSelected('')
      setQuery('')
      setLoadError(false)
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setLoadError(false)
    void getRepositoryRemoteBranches(repoId, controller.signal)
      .then((refs) => {
        if (controller.signal.aborted) return
        setRemoteBranches(refs)
        setSelected(branch.tracking && refs.includes(branch.tracking) ? branch.tracking : (refs[0] ?? ''))
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setRemoteBranches([])
          setSelected('')
          setLoadError(true)
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [branch.tracking, open, repoId])

  const pending = busy || submitting
  const visibleRemoteBranches = remoteBranches.filter((ref) => remoteBranchRefMatchesQuery(ref, query))
  const unchanged = !!branch.tracking && !branch.trackingGone && selected === branch.tracking

  async function submit(remoteRef: string | null) {
    if (pending) return
    setSubmitting(true)
    try {
      await onSubmit(remoteRef)
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !pending) onClose()
      }}
      title={t('action.branch-upstream-title', { branch: branch.name })}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (selected && !unchanged) void submit(selected)
        }}
        className="space-y-4"
      >
        {branch.tracking && (
          <Field>
            <FieldLabel>{t('action.branch-upstream-current')}</FieldLabel>
            <FieldDescription className="break-all font-mono text-foreground">
              {branch.tracking}
              {branch.trackingGone ? ` · ${t('action.branch-upstream-gone')}` : ''}
            </FieldDescription>
          </Field>
        )}
        <Field>
          <FieldLabel htmlFor="branch-upstream-ref">{t('action.branch-upstream-remote-label')}</FieldLabel>
          <Select value={selected} onValueChange={setSelected} disabled={pending || loading || remoteBranches.length === 0}>
            <SelectTrigger id="branch-upstream-ref" size="sm" className="w-full">
              <SelectValue placeholder={t('action.branch-upstream-remote-placeholder')} />
            </SelectTrigger>
            <SelectContent
              matchTriggerWidth
              header={
                <RemoteBranchSearchInput
                  id="branch-upstream-ref-filter"
                  value={query}
                  onChange={setQuery}
                  placeholder={t('action.remote-branch-search-placeholder')}
                  ariaLabel={t('action.remote-branch-search-label')}
                  disabled={loading || remoteBranches.length === 0}
                />
              }
            >
              {visibleRemoteBranches.map((ref) => (
                <SelectItem key={ref} value={ref} textValue={ref}>
                  <span className="truncate">{ref}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription reserveHeight aria-live="polite">
            {loading
              ? t('action.branch-upstream-loading')
              : remoteBranches.length === 0 || visibleRemoteBranches.length === 0
                ? t('action.branch-upstream-empty')
                : ''}
          </FieldDescription>
        </Field>
        {loadError && <DialogError>{t('action.branch-upstream-load-error')}</DialogError>}
        <DialogFooter className="justify-between sm:justify-between">
          <div>
            {branch.tracking && (
              <Button type="button" variant="destructive-soft" size="sm" disabled={pending} onClick={() => void submit(null)}>
                {t('action.branch-upstream-remove')}
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={onClose}>
              {t('dialog.cancel')}
            </Button>
            <Button type="submit" size="sm" disabled={pending || loading || !selected || unchanged}>
              {submitting && <Loader2 className="animate-spin" />}
              {t('action.branch-upstream-confirm')}
            </Button>
          </div>
        </DialogFooter>
      </form>
    </FormDialog>
  )
}
