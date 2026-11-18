import { useEffect, useState } from 'react'
import { FolderOpen, Loader2 } from 'lucide-react'
import { FormDialog } from '#/web/components/ui/form-dialog.tsx'
import { Field, FieldLabel } from '#/web/components/ui/field.tsx'
import { Button } from '#/web/components/ui/button.tsx'
import { Input } from '#/web/components/ui/input.tsx'
import { DialogFooter } from '#/web/components/ui/dialog.tsx'
import { canChooseSubworkspaceParentPath, chooseSubworkspaceParentPath } from '#/web/app-shell-client.ts'
import { registerBranchWorkspaceFolder } from '#/web/workspace-client.ts'
import { useT } from '#/web/stores/i18n.ts'
import { isRemoteRepoId } from '#/shared/remote-repo.ts'
import { isAbsoluteWorktreePath } from '#/shared/worktree-create.ts'

interface BranchWorkspaceFolderDialogProps {
  open: boolean
  rootId: string
  onOpenChange: (open: boolean) => void
  onRegistered: (rootId: string, branchWorkspaceId: string) => void | Promise<void>
}

/** Registration records a directory; its branches and members remain filesystem-owned. */
export function BranchWorkspaceFolderDialog({
  open,
  rootId,
  onOpenChange,
  onRegistered,
}: BranchWorkspaceFolderDialogProps) {
  const t = useT()
  const [folderPath, setFolderPath] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setFolderPath('')
    setError(null)
  }, [open, rootId])

  async function browse() {
    const path = await chooseSubworkspaceParentPath(t('workspace.branch-workspace.folder-register.title'))
    if (path) {
      setFolderPath(path)
      setError(null)
    }
  }

  async function submit() {
    if (pending || !isAbsoluteWorktreePath(folderPath.trim())) return
    setPending(true)
    setError(null)
    try {
      const result = await registerBranchWorkspaceFolder(rootId, folderPath.trim())
      if (!result.ok) {
        setError(result.message)
        return
      }
      await onRegistered(rootId, result.branchWorkspaceId)
      onOpenChange(false)
    } catch {
      setError('workspace.branch-workspace.folder-register.failed')
    } finally {
      setPending(false)
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next)
      }}
      title={t('workspace.branch-workspace.folder-register.title')}
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <p className="text-sm text-muted-foreground">{t('workspace.branch-workspace.folder-register.description')}</p>
        <Field>
          <FieldLabel htmlFor="subworkspace-folder-path">
            {t('workspace.branch-workspace.folder-register.path')}
          </FieldLabel>
          <div className="flex gap-2">
            <Input
              id="subworkspace-folder-path"
              value={folderPath}
              disabled={pending}
              onChange={(event) => {
                setFolderPath(event.target.value)
                setError(null)
              }}
              placeholder={t('workspace.branch-workspace.folder-register.placeholder')}
              autoFocus
            />
            {!isRemoteRepoId(rootId) && canChooseSubworkspaceParentPath() ? (
              <Button type="button" variant="outline" disabled={pending} onClick={() => void browse()}>
                <FolderOpen aria-hidden="true" />
                {t('workspace.branch-workspace.folder-register.browse')}
              </Button>
            ) : null}
          </div>
        </Field>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {t(error)}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            {t('dialog.cancel')}
          </Button>
          <Button type="submit" disabled={pending || !isAbsoluteWorktreePath(folderPath.trim())}>
            {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            {t('workspace.branch-workspace.folder-register.submit')}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  )
}
