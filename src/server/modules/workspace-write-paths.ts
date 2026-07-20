import { normalizeWorkspaceConfig, writeWorkspaceConfig } from '#/server/modules/workspace-config-source.ts'
import { discoverWorkspaceRepositories } from '#/server/modules/workspace-read.ts'
import type { WorkspaceConfig, WorkspaceDiscoveryResult, WorkspaceRepositoryEntry } from '#/shared/workspace.ts'

interface WorkspaceWriteDependencies {
  discover?: typeof discoverWorkspaceRepositories
  writeConfig?: typeof writeWorkspaceConfig
}

export async function saveWorkspaceConfig(
  rootPath: string,
  value: unknown,
  dependencies: WorkspaceWriteDependencies = {},
): Promise<WorkspaceDiscoveryResult> {
  let config: WorkspaceConfig
  try {
    config = normalizeWorkspaceConfig(value)
  } catch (error) {
    return { ok: false, message: safeMessage(error) }
  }

  const discover = dependencies.discover ?? discoverWorkspaceRepositories
  const discovery = await discover(rootPath)
  if (!discovery.ok) return discovery
  const available = new Set(
    discovery.candidates.filter((candidate) => candidate.available).map((candidate) => candidate.name),
  )
  if (config.repo.some((name) => !available.has(name))) {
    return { ok: false, message: 'workspace.config.repository-unavailable' }
  }

  try {
    await (dependencies.writeConfig ?? writeWorkspaceConfig)(discovery.rootId, config)
  } catch (error) {
    return { ok: false, message: safeMessage(error) }
  }
  return projectSavedWorkspaceConfiguration(discovery, config)
}

function projectSavedWorkspaceConfiguration(
  discovery: Extract<WorkspaceDiscoveryResult, { ok: true }>,
  config: WorkspaceConfig,
): WorkspaceDiscoveryResult {
  const selected = new Set(config.repo)
  const candidates = discovery.candidates.map((candidate) => ({
    ...candidate,
    selected: selected.has(candidate.name),
  }))
  const availableByName = new Map(
    candidates.filter((candidate) => candidate.available).map((candidate) => [candidate.name, candidate]),
  )
  const repositories = config.repo.flatMap((name): WorkspaceRepositoryEntry[] => {
    const candidate = availableByName.get(name)
    return candidate
      ? [
          {
            id: candidate.id,
            name: candidate.name,
            ...(candidate.remoteRef ? { remoteRef: candidate.remoteRef } : {}),
          },
        ]
      : []
  })
  return {
    ...discovery,
    repositories,
    candidates,
    configuration: { kind: 'ready', config },
  }
}

function safeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  return message.startsWith('workspace.config.') || message === 'error.ssh-config-changed'
    ? message
    : 'workspace.config.write-failed'
}
