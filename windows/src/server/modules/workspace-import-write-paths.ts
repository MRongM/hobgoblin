import { discoverWorkspaceRepositories } from '#/server/modules/workspace-read.ts'
import { writeWorkspaceConfig } from '#/server/modules/workspace-config-source.ts'
import { publishWorkspaceConfigurationInvalidation } from '#/server/modules/invalidation-broker.ts'
import { projectWorkspaceConfiguration } from '#/server/modules/workspace-write-paths.ts'
import type { WorkspaceDiscoveryResult } from '#/shared/workspace.ts'

export interface WorkspaceImportOptions {
  sourceToken?: string
}

interface WorkspaceImportDependencies {
  discover?: typeof discoverWorkspaceRepositories
  writeConfig?: typeof writeWorkspaceConfig
  publishInvalidation?: (rootId: string, sourceToken?: string) => void
}

export async function importWorkspaceRepositories(
  rootPath: string,
  options: WorkspaceImportOptions = {},
  dependencies: WorkspaceImportDependencies = {},
): Promise<WorkspaceDiscoveryResult> {
  const discovery = await (dependencies.discover ?? discoverWorkspaceRepositories)(rootPath)
  if (!discovery.ok || discovery.configuration.kind === 'invalid') return discovery

  const configuredNames = discovery.configuration.kind === 'ready' ? [...discovery.configuration.config.repo] : []
  const configuredNameSet = new Set(configuredNames)
  const discoveredNames = discovery.candidates
    .filter((candidate) => candidate.available)
    .map((candidate) => candidate.name)
  const nextNames = [
    ...configuredNames,
    ...discoveredNames.filter((name) => {
      if (configuredNameSet.has(name)) return false
      configuredNameSet.add(name)
      return true
    }),
  ]

  if (nextNames.length === 0) return discovery
  const changed =
    discovery.configuration.kind === 'missing' ||
    nextNames.length !== configuredNames.length ||
    nextNames.some((name, index) => configuredNames[index] !== name)
  if (!changed) return discovery

  try {
    await (dependencies.writeConfig ?? writeWorkspaceConfig)(discovery.rootId, { repo: nextNames })
  } catch (error) {
    return { ok: false, message: importErrorMessage(error) }
  }
  const publishInvalidation = dependencies.publishInvalidation ?? publishWorkspaceConfigurationInvalidation
  publishInvalidation(discovery.rootId, options.sourceToken)
  return projectWorkspaceConfiguration(discovery, { repo: nextNames })
}

function importErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  return message === 'error.ssh-config-changed' || message.startsWith('workspace.config.')
    ? message
    : 'workspace.config.write-failed'
}
