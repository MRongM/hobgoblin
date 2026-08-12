import type { WorkspaceProjectState } from '#/web/stores/repos/types.ts'

export function workspaceConfigurationRecoveryAvailable(workspace: WorkspaceProjectState | undefined): boolean {
  if (!workspace) return false
  if (workspace.configurationError) return true
  if (workspace.candidates.some((candidate) => candidate.selected && !candidate.available)) return true
  if (!workspace.configured && workspace.candidates.length > 0) return true
  if (workspace.error?.startsWith('workspace.config.')) return true

  const configuredNames = workspace.configuredRepositoryNames
  if (!configuredNames) return false
  const representedNames = new Set(
    workspace.candidates.filter((candidate) => candidate.selected).map((candidate) => candidate.name),
  )
  return configuredNames.some((name) => !representedNames.has(name))
}
