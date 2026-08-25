import type { ResolvedEditorApp, ResolvedTerminalApp } from '#/shared/rpc.ts'
import { openRemoteRepositoryEditor, openRemoteRepositoryTerminal } from '#/web/remote-client.ts'
import { openRepositoryEditor, openRepositoryRemote, openRepositoryTerminal } from '#/web/repo-client.ts'
import { useAsyncPending } from '#/web/hooks/useAsyncPending.ts'
import { useRuntimeExternalAppSettings } from '#/web/runtime-settings-external-apps.ts'
import { dispatchRepoUiAction } from '#/web/stores/repos/branch-action-write-paths.ts'
import { repoPlainWorkspacePath } from '#/web/stores/repos/capabilities.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import type { RepoState } from '#/web/stores/repos/types.ts'
import type { ExecResult } from '#/web/types.ts'
import { selectedRepoWorktree } from '#/web/stores/repos/worktree-selection.ts'

type ProjectExternalOpenActionId = 'editor' | 'externalTerminal' | 'remote'

interface ProjectOpenAction {
  disabled: boolean
  busy: boolean
  onSelect: () => void | Promise<void>
}

interface ProjectExternalOpenAction<IconPref> extends ProjectOpenAction {
  iconPref: IconPref
}

export interface ProjectExternalOpenActions {
  visible: boolean
  editor: ProjectExternalOpenAction<ResolvedEditorApp | 'auto'>
  externalTerminal: ProjectExternalOpenAction<ResolvedTerminalApp | 'auto'>
  remote: ProjectOpenAction
}

const SILENT_SUCCESS_OPS = new Set<ProjectExternalOpenActionId>(['editor', 'externalTerminal', 'remote'])

export function resolveProjectExternalOpenTarget(repo: RepoState | null | undefined): string | null {
  const plainWorkspacePath = repoPlainWorkspacePath(repo)
  if (plainWorkspacePath) return plainWorkspacePath
  if (!repo || repo.isGitRepo === false) return null
  return selectedRepoWorktree(repo)?.worktreePath ?? null
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
  const projectDisabled = !visible || repo.availability.phase === 'unavailable' || isPending
  const targetDisabled = projectDisabled || !targetPath
  const editorDisabled = targetDisabled || !editorAvailable
  const externalTerminalDisabled = targetDisabled || (!remote && !terminalAvailable)
  const remoteDisabled =
    projectDisabled ||
    repo.isGitRepo === false ||
    (repo.remote.hasBrowserRemote !== true && repo.remote.hasGitHubRemote !== true)

  function runProjectOpen(
    actionId: ProjectExternalOpenActionId,
    opener: () => Promise<ExecResult>,
  ): void | Promise<void> {
    if (!repo) return
    const result = run(actionId, () =>
      dispatchRepoUiAction(projectId, repo.instanceToken, actionId, opener, setLastResult, {
        silentSuccessOps: SILENT_SUCCESS_OPS,
      }),
    )
    return result ? Promise.resolve(result).then(() => undefined) : undefined
  }

  function runOpen(actionId: ProjectExternalOpenActionId): void | Promise<void> {
    if (actionId === 'remote') {
      if (remoteDisabled) return
      return runProjectOpen(actionId, () => openRepositoryRemote(projectId))
    }
    const disabled = actionId === 'editor' ? editorDisabled : externalTerminalDisabled
    if (disabled || !targetPath) return
    const opener =
      actionId === 'editor'
        ? remote
          ? () => openRemoteRepositoryEditor(projectId, targetPath)
          : () => openRepositoryEditor(targetPath)
        : remote
          ? () => openRemoteRepositoryTerminal(projectId, targetPath)
          : () => openRepositoryTerminal({ projectRoot: projectId, workingDirectory: targetPath })
    return runProjectOpen(actionId, opener)
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
    remote: {
      disabled: remoteDisabled,
      busy: pending === 'remote',
      onSelect: () => runOpen('remote'),
    },
  }
}
