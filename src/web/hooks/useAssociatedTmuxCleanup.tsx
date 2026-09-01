import { useState } from 'react'
import { Unplug } from 'lucide-react'
import { toast } from 'sonner'
import type { TmuxCleanupPreviewResult } from '#/shared/tmux-cleanup.ts'
import { ConfirmDialog } from '#/web/components/ConfirmDialog.tsx'
import type { BranchWorkspaceItemAction } from '#/web/components/repo-workspace/BranchWorkspaceItemMenu.tsx'
import type { WorkspaceListItemAction } from '#/web/components/repo-workspace/WorkspaceListItem.tsx'
import { useAsyncPending } from '#/web/hooks/useAsyncPending.ts'
import { useT } from '#/web/stores/i18n.ts'
import { cleanupAssociatedTmuxSessions, previewAssociatedTmuxSessions } from '#/web/tmux-cleanup-client.ts'
import { supportsTmuxMenu } from '#/web/tmux-menu.ts'

interface AssociatedTmuxCleanupOptions {
  projectRoot?: string
  itemPath?: string
  disabled?: boolean
}

interface AssociatedTmuxCleanupView {
  visible: boolean
  action: WorkspaceListItemAction
  contextAction: BranchWorkspaceItemAction
  dialog: React.ReactNode
}

export function useAssociatedTmuxCleanup({
  projectRoot,
  itemPath,
  disabled = false,
}: AssociatedTmuxCleanupOptions): AssociatedTmuxCleanupView {
  const t = useT()
  const [preview, setPreview] = useState<Extract<TmuxCleanupPreviewResult, { ok: true }> | null>(null)
  const { isPending, run } = useAsyncPending<'preview' | 'execute'>()
  const visible = cleanupVisible(projectRoot, itemPath)
  const actionDisabled = disabled || isPending

  const requestPreview = async () => {
    if (!projectRoot || !itemPath || actionDisabled) return
    try {
      const result = await previewAssociatedTmuxSessions({ projectRoot, itemPath })
      if (!result.ok) {
        toast.error(t('tmux.cleanup.preview-failed'), { description: t(result.message) })
        return
      }
      if (result.sessions.length === 0) {
        toast.info(t('tmux.cleanup.none'), { description: result.targetPath })
        return
      }
      setPreview(result)
    } catch (error) {
      toast.error(t('tmux.cleanup.preview-failed'), { description: errorMessage(error) })
    }
  }

  const executeCleanup = async () => {
    if (!projectRoot || !itemPath || !preview) return
    try {
      const result = await cleanupAssociatedTmuxSessions({
        projectRoot,
        itemPath,
        approvedSessionNames: preview.sessions.map((session) => session.sessionName),
      })
      if (!result.ok) {
        toast.error(t('tmux.cleanup.execute-failed'), { description: t(result.message) })
        return
      }
      setPreview(null)
      if (result.failed.length > 0) {
        toast.error(
          t('tmux.cleanup.partial', {
            deleted: result.deleted.length,
            failed: result.failed.length,
            missing: result.missingSessionNames.length,
          }),
          { description: result.failed.map((failure) => `${failure.sessionName}: ${failure.message}`).join('\n') },
        )
        return
      }
      const successMessage = t('tmux.cleanup.success', { count: result.deleted.length })
      if (result.missingSessionNames.length > 0) {
        toast.success(successMessage, {
          description: t('tmux.cleanup.missing', { count: result.missingSessionNames.length }),
        })
      } else {
        toast.success(successMessage)
      }
    } catch (error) {
      toast.error(t('tmux.cleanup.execute-failed'), { description: errorMessage(error) })
    }
  }

  const select = async () => {
    await run('preview', requestPreview)
  }
  const icon = <Unplug aria-hidden="true" />
  const action: WorkspaceListItemAction = {
    id: 'cleanupTmuxSessions',
    label: t('tmux.cleanup.action'),
    icon,
    disabled: actionDisabled,
    busy: isPending,
    destructive: true,
    visible,
    onSelect: select,
  }
  const contextAction: BranchWorkspaceItemAction = {
    label: 'tmux.cleanup.action',
    icon,
    disabled: actionDisabled,
    busy: isPending,
    destructive: true,
    separated: true,
    onSelect: select,
  }

  return {
    visible,
    action,
    contextAction,
    dialog: (
      <ConfirmDialog
        open={preview !== null}
        title={t('tmux.cleanup.confirm-title')}
        message={
          preview ? (
            <div className="space-y-3">
              <p>{t('tmux.cleanup.confirm-summary', { count: preview.sessions.length, path: preview.targetPath })}</p>
              <ul className="max-h-40 list-disc space-y-1 overflow-auto pl-5">
                {preview.sessions.map((session) => (
                  <li key={session.sessionName}>
                    <code className="break-all text-xs">{session.sessionName}</code>
                  </li>
                ))}
              </ul>
              <p className="text-danger">{t('tmux.cleanup.disconnect-warning')}</p>
            </div>
          ) : null
        }
        confirmLabel={t('tmux.cleanup.confirm')}
        destructive
        onCancel={() => setPreview(null)}
        onConfirm={async () => {
          await run('execute', executeCleanup)
        }}
      />
    ),
  }
}

function cleanupVisible(projectRoot?: string, itemPath?: string): boolean {
  return !!itemPath && supportsTmuxMenu(projectRoot)
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'unknown'
}
