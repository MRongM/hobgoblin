import type { ResolvedEditorApp, ResolvedTerminalApp } from '#/shared/rpc.ts'
import { openRemoteRepositoryEditor, openRemoteRepositoryTerminal } from '#/web/remote-client.ts'
import { openRepositoryEditor, openRepositoryTerminal } from '#/web/repo-client.ts'
import { useAsyncPending } from '#/web/hooks/useAsyncPending.ts'
import { useRuntimeExternalAppSettings } from '#/web/runtime-settings-external-apps.ts'
import { dispatchRepoUiAction } from '#/web/stores/repos/branch-action-write-paths.ts'
import { repoPlainWorkspacePath } from '#/web/stores/repos/capabilities.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import type { RepoState } from '#/web/stores/repos/types.ts'

type ProjectExternalOpenActionId = 'editor' | 'externalTerminal'

interface ProjectExternalOpenAction<IconPref> {
  disabled: boolean
  busy: boolean
  iconPref: IconPref
  onSelect: () => void | Promise<void>
}

export interface ProjectExternalOpenActions {
  visible: boolean
  editor: ProjectExternalOpenAction<ResolvedEditorApp | 'auto'>
  externalTerminal: ProjectExternalOpenAction<ResolvedTerminalApp | 'auto'>
}

const SILENT_SUCCESS_OPS = new Set<ProjectExternalOpenActionId>(['editor', 'externalTerminal'])

export function resolveProjectExternalOpenTarget(repo: RepoState | null | undefined): string | null {
  const plainWorkspacePath = repoPlainWorkspacePath(repo)
  if (plainWorkspacePath) return plainWorkspacePath
  if (!repo || repo.isGitRepo === false) return null
  return repo.data.branches.find((branch) => branch.name === repo.ui.selectedBranch)?.worktree?.path ?? null
}

export function useProjectExternalOpenActions(projectId: string): ProjectExternalOpenActions {
  const repo = useReposStore((state) => state.repos[projectId])
  const setLastResult = useReposStore((state) => state.setLastResult)
  const { terminalApp, resolvedTerminalApp, terminalAvailable, editorApp, resolvedEditorApp, editorAvailable } =
    useRuntimeExternalAppSettings()
  const { pending, isPending, run } = useAsyncPending<ProjectExternalOpenActionId>()
  const targetPath = resolveProjectExternalOpenTarget(repo)
  const visible = !!repo
  const remote = !!repo?.remote.target
  const baseDisabled = !visible || repo.availability.phase === 'unavailable' || !targetPath || isPending
  const editorDisabled = baseDisabled || !editorAvailable
  const externalTerminalDisabled = baseDisabled || (!remote && !terminalAvailable)

  function runOpen(actionId: ProjectExternalOpenActionId): void | Promise<void> {
    const disabled = actionId === 'editor' ? editorDisabled : externalTerminalDisabled
    if (disabled || !repo || !targetPath) return
    const opener =
      actionId === 'editor'
        ? remote
          ? () => openRemoteRepositoryEditor(projectId, targetPath)
          : () => openRepositoryEditor(targetPath)
        : remote
          ? () => openRemoteRepositoryTerminal(projectId, targetPath)
          : () => openRepositoryTerminal(targetPath)
    const result = run(actionId, () =>
      dispatchRepoUiAction(projectId, repo.instanceToken, actionId, opener, setLastResult, {
        silentSuccessOps: SILENT_SUCCESS_OPS,
      }),
    )
    return result ? Promise.resolve(result).then(() => undefined) : undefined
  }

  return {
    visible,
    editor: {
      disabled: editorDisabled,
      busy: pending === 'editor',
      iconPref: resolvedEditorApp ?? editorApp ?? 'auto',
      onSelect: () => runOpen('editor'),
    },
    externalTerminal: {
      disabled: externalTerminalDisabled,
      busy: pending === 'externalTerminal',
      iconPref: remote ? 'auto' : (resolvedTerminalApp ?? terminalApp ?? 'auto'),
      onSelect: () => runOpen('externalTerminal'),
    },
  }
}
