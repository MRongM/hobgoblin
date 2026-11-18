import { useState } from 'react'
import { FolderOpen } from 'lucide-react'
import { toast } from 'sonner'
import { getInitialBootstrap } from '#/web/bootstrap.ts'
import { canOpenDirectoryInFileManager, openDirectoryInFileManager } from '#/web/app-shell-client.ts'
import { resolveFileManagerTarget } from '#/web/file-manager-target.ts'
import { parentDir } from '#/web/lib/paths.ts'
import { pathStyle } from '#/shared/path-semantics.ts'
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
  const hostPlatform = getInitialBootstrap().hostPlatform
  const target = resolveFileManagerTarget(repoId, path, hostPlatform)
  const reason = !nativeAvailable
    ? 'directory-open.desktop-only'
    : !target.ok
      ? target.message
      : disabled
        ? 'directory-open.no-directory'
        : null
  const parentPath = target.ok ? fileManagerParentPath(target.path, hostPlatform) : null
  const openTarget = async (destination: string) => {
    setPending(true)
    try {
      const result = await openDirectoryInFileManager(destination)
      if (!result.ok) toast.error(t(result.message))
    } catch {
      toast.error(t('directory-open.failed'))
    } finally {
      setPending(false)
    }
  }
  return {
    id: 'openDirectory',
    label: t('directory-open.action'),
    title: reason ? t(reason) : target.ok ? target.path : undefined,
    icon: <FolderOpen aria-hidden="true" />,
    visible: true,
    disabled: pending || reason !== null,
    busy: pending,
    parentDirectoryAction: {
      id: 'openParentDirectory',
      label: t('directory-open.parent-action'),
      title: reason ? t(reason) : (parentPath ?? t('directory-open.no-directory')),
      icon: <FolderOpen aria-hidden="true" />,
      disabled: pending || reason !== null || !parentPath,
      busy: pending,
      onSelect: async () => {
        if (pending || reason || !parentPath) return
        await openTarget(parentPath)
      },
    },
    onSelect: async () => {
      if (pending || reason || !target.ok) return
      await openTarget(target.path)
    },
  }
}

function fileManagerParentPath(path: string, platform?: string): string | null {
  if (platform === 'win32') {
    const parent = parentDir(path)
    if (pathStyle(parent) === 'relative' || /^[A-Za-z]:[/\\]+$/u.test(path)) return null
    return parent
  }
  const trimmed = path.replace(/\/+$/u, '')
  return trimmed ? trimmed.slice(0, trimmed.lastIndexOf('/')) || '/' : null
}
