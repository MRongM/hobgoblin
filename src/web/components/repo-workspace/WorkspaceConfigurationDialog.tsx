import { useEffect, useMemo, useState } from 'react'
import { FolderGit2 } from 'lucide-react'
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
import { useT } from '#/web/stores/i18n.ts'
import type { WorkspaceConfig, WorkspaceRepositoryCandidate } from '#/shared/workspace.ts'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  configuredRepositoryNames: string[]
  candidates: WorkspaceRepositoryCandidate[]
  onSave: (config: WorkspaceConfig) => Promise<{ ok: boolean; message?: string }>
}

export function WorkspaceConfigurationDialog({
  open,
  onOpenChange,
  configuredRepositoryNames,
  candidates,
  onSave,
}: Props) {
  const t = useT()
  const initialSelection = useMemo(() => {
    const selectedNames = new Set(
      candidates.filter((candidate) => candidate.selected).map((candidate) => candidate.name),
    )
    const configured = configuredRepositoryNames.filter((name) => selectedNames.has(name))
    const configuredSet = new Set(configured)
    const newlyDiscovered = candidates
      .filter((candidate) => candidate.selected && !configuredSet.has(candidate.name))
      .map((candidate) => candidate.name)
    return [...configured, ...newlyDiscovered]
  }, [candidates, configuredRepositoryNames])
  const [selected, setSelected] = useState<string[]>(initialSelection)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setSelected(initialSelection)
    setPending(false)
    setError(null)
  }, [initialSelection, open])

  const toggleMember = (name: string, checked: boolean) => {
    setError(null)
    if (checked) {
      setSelected((current) => (current.includes(name) ? current : [...current, name]))
      return
    }
    setSelected((current) => current.filter((entry) => entry !== name))
  }

  const submit = async () => {
    if (selected.length === 0 || pending) return
    setPending(true)
    setError(null)
    const result = await onSave({ repo: selected })
    setPending(false)
    if (result.ok) onOpenChange(false)
    else setError(result.message ?? 'workspace.config.write-failed')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('workspace.configure-title')}</DialogTitle>
          <DialogDescription>{t('workspace.configure-description')}</DialogDescription>
        </DialogHeader>

        <div className="overflow-hidden rounded-md border border-separator bg-background">
          <div className="border-b border-separator bg-muted/35 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            <span>{t('workspace.configure-members')}</span>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {candidates.map((candidate) => {
              const checked = selected.includes(candidate.name)
              return (
                <div
                  key={candidate.id}
                  className="flex min-h-9 items-center border-b border-separator/60 px-3 last:border-b-0"
                >
                  <label className="flex min-w-0 items-center gap-2 text-xs">
                    <Checkbox
                      type="button"
                      aria-label={`${candidate.name} ${t('workspace.configure-member')}`}
                      checked={checked}
                      disabled={pending || (!candidate.available && !checked)}
                      onCheckedChange={(value) => toggleMember(candidate.name, value === true)}
                    />
                    <FolderGit2 className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="truncate font-medium">{candidate.name}</span>
                    {!candidate.available && (
                      <span className="text-[10px] text-danger">{t('workspace.repository-unavailable')}</span>
                    )}
                  </label>
                </div>
              )
            })}
          </div>
        </div>

        {error && (
          <p className="text-xs text-danger" role="alert">
            {t(error)}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            {t('workspace.configure-cancel')}
          </Button>
          <Button type="submit" disabled={selected.length === 0 || pending} onClick={() => void submit()}>
            {pending ? t('workspace.configure-saving') : t('workspace.configure-save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
