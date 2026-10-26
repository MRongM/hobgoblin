import { useEffect, useId, useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { BranchWorkspaceSnapshot } from '#/shared/branch-workspaces.ts'
import { isSafeBranchWorkspaceFolderName } from '#/shared/branch-workspaces.ts'
import { FormDialog } from '#/web/components/ui/form-dialog.tsx'
import { Field, FieldError, FieldLabel } from '#/web/components/ui/field.tsx'
import { Input } from '#/web/components/ui/input.tsx'
import { Button } from '#/web/components/ui/button.tsx'
import { DialogFooter } from '#/web/components/ui/dialog.tsx'
import { renameBranchWorkspaceFolder } from '#/web/workspace-client.ts'
import { joinPath, parentDir } from '#/web/lib/paths.ts'
import { useT } from '#/web/stores/i18n.ts'

interface Props {
  rootId: string
  workspace: BranchWorkspaceSnapshot | null
  onOpenChange: (open: boolean) => void
  onRenamed: (result: { branchWorkspaceId: string; previousPath: string; path: string }) => void | Promise<void>
}

export function BranchWorkspaceRenameDialog({ rootId, workspace, onOpenChange, onRenamed }: Props) {
  const t = useT()
  const id = useId()
  const [name, setName] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actualPath, setActualPath] = useState<string | null>(null)
  useEffect(() => {
    setName(workspace?.directoryName ?? '')
    setError(null)
    setActualPath(null)
  }, [workspace?.id, workspace?.path])
  const valid = isSafeBranchWorkspaceFolderName(name.trim())
  const destination = workspace && valid ? joinPath(parentDir(workspace.path), name.trim()) : null
  const canSave = !!workspace && !pending && valid && name.trim() !== workspace.directoryName

  async function save() {
    if (!workspace || !canSave) return
    setPending(true)
    setError(null)
    try {
      const result = await renameBranchWorkspaceFolder(rootId, workspace.id, name.trim())
      if (!result.ok) {
        setError(result.message)
        setActualPath(result.path ?? null)
        return
      }
      await onRenamed(result)
      onOpenChange(false)
    } catch {
      setError('workspace.branch-workspace.rename.failed')
    } finally {
      setPending(false)
    }
  }

  return (
    <FormDialog
      open={workspace !== null}
      onOpenChange={(open) => {
        if (!pending) onOpenChange(open)
      }}
      title={t('workspace.branch-workspace.rename.title')}
      description={t('workspace.branch-workspace.rename.description')}
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <Field>
          <FieldLabel htmlFor={id}>{t('workspace.branch-workspace.folder')}</FieldLabel>
          <Input
            id={id}
            value={name}
            disabled={pending}
            aria-invalid={!!name && !valid}
            autoFocus
            onChange={(event) => {
              setName(event.target.value)
              setError(null)
            }}
          />
          {name && !valid ? <FieldError>{t('workspace.branch-workspace.create.invalid-folder')}</FieldError> : null}
        </Field>
        <div className="grid gap-2 text-xs">
          <div className="grid gap-1">
            <span className="text-muted-foreground">{t('workspace.branch-workspace.rename.current-path')}</span>
            <code className="break-all">{workspace?.path}</code>
          </div>
          {destination ? (
            <div className="grid gap-1">
              <span className="text-muted-foreground">{t('workspace.branch-workspace.rename.new-path')}</span>
              <code className="break-all">{destination}</code>
            </div>
          ) : null}
        </div>
        {error ? <FieldError role="alert">{t(error)}</FieldError> : null}
        {actualPath ? (
          <div className="grid gap-1 text-xs">
            <span className="text-muted-foreground">{t('workspace.branch-workspace.rename.actual-path')}</span>
            <code className="break-all">{actualPath}</code>
          </div>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            {t('dialog.cancel')}
          </Button>
          <Button type="submit" disabled={!canSave}>
            {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            {t('workspace.branch-workspace.rename.save')}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  )
}
