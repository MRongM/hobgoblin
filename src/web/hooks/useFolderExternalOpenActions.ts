import type { ResolvedEditorApp, ResolvedTerminalApp } from '#/shared/rpc.ts'
import { isRemoteRepoId } from '#/shared/rpc.ts'
import { useAsyncPending } from '#/web/hooks/useAsyncPending.ts'
import { openRemoteRepositoryEditor, openRemoteRepositoryTerminal } from '#/web/remote-client.ts'
import { openRepositoryEditor, openRepositoryTerminal } from '#/web/repo-client.ts'
import { useRuntimeExternalAppSettings } from '#/web/runtime-settings-external-apps.ts'

type FolderExternalOpenActionId = 'editor' | 'externalTerminal'

interface FolderExternalOpenAction<TIcon> {
  disabled: boolean
  busy: boolean
  iconPref: TIcon
  onSelect: () => void | Promise<void>
}

export interface FolderExternalOpenActions {
  editor: FolderExternalOpenAction<ResolvedEditorApp | 'auto'>
  externalTerminal: FolderExternalOpenAction<ResolvedTerminalApp | 'auto'>
}

export function useFolderExternalOpenActions(input: {
  repoId: string
  path: string
  available: boolean
}): FolderExternalOpenActions {
  const { terminalApp, resolvedTerminalApp, terminalAvailable, editorApp, resolvedEditorApp, editorAvailable } =
    useRuntimeExternalAppSettings()
  const { pending, isPending, run } = useAsyncPending<FolderExternalOpenActionId>()
  const remote = isRemoteRepoId(input.repoId)
  const editorDisabled = !input.available || !input.path || !editorAvailable || isPending
  const terminalDisabled = !input.available || !input.path || (!remote && !terminalAvailable) || isPending

  function open(actionId: FolderExternalOpenActionId): void | Promise<void> {
    if ((actionId === 'editor' ? editorDisabled : terminalDisabled) || !input.path) return
    const operation =
      actionId === 'editor'
        ? remote
          ? () => openRemoteRepositoryEditor(input.repoId, input.path)
          : () => openRepositoryEditor(input.path)
        : remote
          ? () => openRemoteRepositoryTerminal(input.repoId, input.path)
          : () => openRepositoryTerminal(input.path)
    const result = run(actionId, operation)
    return result ? Promise.resolve(result).then(() => undefined) : undefined
  }

  return {
    editor: {
      disabled: editorDisabled,
      busy: pending === 'editor',
      iconPref: resolvedEditorApp ?? editorApp ?? 'auto',
      onSelect: () => open('editor'),
    },
    externalTerminal: {
      disabled: terminalDisabled,
      busy: pending === 'externalTerminal',
      iconPref: remote ? 'auto' : (resolvedTerminalApp ?? terminalApp ?? 'auto'),
      onSelect: () => open('externalTerminal'),
    },
  }
}
