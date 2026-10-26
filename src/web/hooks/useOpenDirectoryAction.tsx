import { useState } from 'react'
import { FolderOpen } from 'lucide-react'
import { toast } from 'sonner'
import { getInitialBootstrap } from '#/web/bootstrap.ts'
import { canOpenDirectoryInFileManager, openDirectoryInFileManager } from '#/web/app-shell-client.ts'
import { resolveFileManagerTarget } from '#/web/file-manager-target.ts'
import { useT } from '#/web/stores/i18n.ts'
import type { WorkspaceListItemAction } from '#/web/components/repo-workspace/WorkspaceListItem.tsx'

export function useOpenDirectoryAction({
  repoId,
  path,
  disabled = false,
}: {
  repoId: string
  path: string | null
  disabled?: boolean
}): WorkspaceListItemAction {
  const t = useT()
  const [pending, setPending] = useState(false)
  const nativeAvailable = canOpenDirectoryInFileManager()
  const target = resolveFileManagerTarget(repoId, path, getInitialBootstrap().hostPlatform)
  const reason = !nativeAvailable
    ? 'directory-open.desktop-only'
    : !target.ok
      ? target.message
      : disabled
        ? 'directory-open.no-directory'
        : null
  return {
    id: 'openDirectory',
    label: t('directory-open.action'),
    title: reason ? t(reason) : target.ok ? target.path : undefined,
    icon: <FolderOpen aria-hidden="true" />,
    visible: true,
    disabled: pending || reason !== null,
    busy: pending,
    onSelect: async () => {
      if (pending || reason || !target.ok) return
      setPending(true)
      try {
        const result = await openDirectoryInFileManager(target.path)
        if (!result.ok) toast.error(t(result.message))
      } catch {
        toast.error(t('directory-open.failed'))
      } finally {
        setPending(false)
      }
    },
  }
}
