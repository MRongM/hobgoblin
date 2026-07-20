import { normalizeWorkspaceConfig, writeWorkspaceConfig } from '#/server/modules/workspace-config-source.ts'
import { discoverWorkspaceRepositories } from '#/server/modules/workspace-read.ts'
import type { WorkspaceConfig, WorkspaceDiscoveryResult } from '#/shared/workspace.ts'

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
  return await discover(discovery.rootId)
}

function safeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  return message.startsWith('workspace.config.') || message === 'error.ssh-config-changed'
    ? message
    : 'workspace.config.write-failed'
}
