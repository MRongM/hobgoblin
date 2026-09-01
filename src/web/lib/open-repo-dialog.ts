import { toast } from 'sonner'
import { chooseLocalRepositoryPath, hasNativeDirectoryPicker } from '#/web/app-shell-client.ts'
import type { OpenRepoResult } from '#/web/stores/repos/types.ts'
import { resolveLocalFilePath, type LocalFilePathContext } from '#/shared/local-file-path-bridge.ts'

export type OpenRepositorySource = 'local' | 'wsl'

interface OpenRepositoryPathState {
  source: OpenRepositorySource
  distribution: string
  distributions: readonly string[]
}

export interface OpenRepositoryPathProjection {
  source: OpenRepositorySource
  distribution: string
  path: string
}

interface Options {
  ensureWorkspaceOpen: (path: string) => Promise<OpenRepoResult>
  activateRepo?: (repoId: string) => void
  openRepoPathDialog?: () => void
  t: (key: string) => string
}

export function projectOpenRepositoryPathInput(
  input: string,
  state: OpenRepositoryPathState,
): OpenRepositoryPathProjection {
  const distribution = state.distribution.trim()
  const context: LocalFilePathContext | undefined =
    state.source === 'wsl' && distribution ? { kind: 'wsl', distribution } : undefined
  const resolution = resolveLocalFilePath(input, context)
  if (!resolution || resolution.execution === 'posix') {
    return { source: state.source, distribution: state.distribution, path: input }
  }
  if (resolution.execution === 'windows') {
    const path = resolution.inputKind === 'wsl-drive-mount' ? resolution.projectPath : input
    return { source: 'local', distribution: state.distribution, path }
  }
  const registeredDistribution =
    state.distributions.find((item) => item.toLowerCase() === resolution.distribution.toLowerCase()) ??
    resolution.distribution
  return {
    source: 'wsl',
    distribution: registeredDistribution,
    path: resolution.linuxPath,
  }
}

export async function openRepoFromDialog({
  ensureWorkspaceOpen,
  activateRepo,
  openRepoPathDialog,
  t,
}: Options): Promise<void> {
  if (!hasNativeDirectoryPicker()) {
    openRepoPathDialog?.()
    return
  }
  const path = await chooseLocalRepositoryPath()
  if (!path) return
  const result = await ensureWorkspaceOpen(path)
  if (!result.ok) {
    toast.error(t('drop.open-failed'), {
      description: t(result.message),
    })
    return
  }
  activateRepo?.(result.id)
}
