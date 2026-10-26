import { useId, type KeyboardEvent } from 'react'
import { FolderOpen, LoaderCircle } from 'lucide-react'
import { Field, FieldDescription, FieldError, FieldLabel } from '#/web/components/ui/field.tsx'
import { Input } from '#/web/components/ui/input.tsx'
import { Button } from '#/web/components/ui/button.tsx'
import { useT } from '#/web/stores/i18n.ts'
import { isSafeBranchWorkspaceFolderName } from '#/shared/branch-workspaces.ts'

interface BranchWorkspaceCreateFieldsProps {
  folderName: string
  parentDirectory: string
  targetPath: string | null
  parentDirectoryValid: boolean
  locked: boolean
  fixed: boolean
  nativeDirectoryPicker: boolean
  directoryPickerPending: boolean
  directoryPickerError: string | null
  onFolderNameChange: (value: string) => void
  onParentDirectoryChange: (value: string) => void
  onBrowse: () => void
  onSubmit: () => void
}

/** Creation inputs are local; the server still validates the exact destination before execution. */
export function BranchWorkspaceCreateFields({
  folderName,
  parentDirectory,
  targetPath,
  parentDirectoryValid,
  locked,
  fixed,
  nativeDirectoryPicker,
  directoryPickerPending,
  directoryPickerError,
  onFolderNameChange,
  onParentDirectoryChange,
  onBrowse,
  onSubmit,
}: BranchWorkspaceCreateFieldsProps) {
  const t = useT()
  const id = useId()
  const invalidName = !!folderName && !isSafeBranchWorkspaceFolderName(folderName.trim())
  const invalidDirectory = !!parentDirectory && !parentDirectoryValid
  function submitOnEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
    event.preventDefault()
    if (!locked && !directoryPickerPending) onSubmit()
  }

  return (
    <div className="grid gap-4">
      <Field>
        <FieldLabel htmlFor={`${id}-name`}>{t('workspace.branch-workspace.folder')}</FieldLabel>
        <Input
          id={`${id}-name`}
          value={folderName}
          disabled={locked || fixed}
          aria-invalid={invalidName}
          aria-describedby={invalidName ? `${id}-name-error` : undefined}
          onChange={(event) => onFolderNameChange(event.target.value)}
          onKeyDown={submitOnEnter}
        />
        {invalidName ? (
          <FieldError id={`${id}-name-error`} role="alert">
            {t('workspace.branch-workspace.create.invalid-folder')}
          </FieldError>
        ) : null}
      </Field>
      <Field>
        <FieldLabel htmlFor={`${id}-parent`}>{t('workspace.branch-workspace.storage-directory')}</FieldLabel>
        <div className="flex gap-2">
          <Input
            id={`${id}-parent`}
            value={parentDirectory}
            disabled={locked || fixed || directoryPickerPending}
            className="min-w-0 flex-1 font-mono text-xs"
            aria-invalid={invalidDirectory}
            aria-describedby={`${id}-parent-help${invalidDirectory || directoryPickerError ? ` ${id}-parent-error` : ''}`}
            onChange={(event) => onParentDirectoryChange(event.target.value)}
            onKeyDown={submitOnEnter}
          />
          {nativeDirectoryPicker && !fixed ? (
            <Button type="button" variant="outline" disabled={locked || directoryPickerPending} onClick={onBrowse}>
              {directoryPickerPending ? (
                <LoaderCircle className="animate-spin" aria-hidden="true" />
              ) : (
                <FolderOpen aria-hidden="true" />
              )}
              {t('workspace.branch-workspace.storage-directory-browse')}
            </Button>
          ) : null}
        </div>
        <FieldDescription id={`${id}-parent-help`}>
          {t(
            fixed ? 'workspace.branch-workspace.directory-fixed' : 'workspace.branch-workspace.storage-directory-help',
          )}
        </FieldDescription>
        {invalidDirectory || directoryPickerError ? (
          <FieldError id={`${id}-parent-error`} role="alert">
            {t(directoryPickerError ?? 'workspace.branch-workspace.storage-directory-invalid')}
          </FieldError>
        ) : null}
      </Field>
      {targetPath ? (
        <div data-branch-workspace-planned-path className="grid min-w-0 gap-1 rounded-md bg-muted/30 px-3 py-2 text-xs">
          <span className="text-muted-foreground">{t('workspace.branch-workspace.target-directory')}</span>
          <code className="break-all" title={targetPath}>
            {targetPath}
          </code>
        </div>
      ) : null}
    </div>
  )
}
