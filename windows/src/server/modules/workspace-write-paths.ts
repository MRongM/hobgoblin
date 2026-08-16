import { readBranchWorkspaceManifests } from '#/server/modules/branch-workspace-source.ts'
import { normalizeWorkspaceConfig, writeWorkspaceConfig } from '#/server/modules/workspace-config-source.ts'
import { discoverWorkspaceRepositories } from '#/server/modules/workspace-read.ts'
import type { WorkspaceConfig, WorkspaceDiscoveryResult, WorkspaceRepositoryEntry } from '#/shared/workspace.ts'

interface WorkspaceWriteDependencies {
  discover?: typeof discoverWorkspaceRepositories
  writeConfig?: typeof writeWorkspaceConfig
  readBranchWorkspaces?: (rootId: string) => Promise<BranchWorkspaceReferenceSnapshot>
}

type BranchWorkspaceReferenceSnapshot =
  | { kind: 'missing' }
  | { kind: 'invalid'; message: string }
  | {
      kind: 'ready'
      manifests: Array<{
        branch: string
        repositories: Array<{ repositoryName: string }>
      }>
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
    const branchWorkspaces = await (dependencies.readBranchWorkspaces ?? readBranchWorkspaceManifests)(discovery.rootId)
    if (branchWorkspaces.kind === 'invalid') return { ok: false, message: branchWorkspaces.message }
    const removedRepositories = new Set(
      discovery.configuration.kind === 'ready'
        ? discovery.configuration.config.repo.filter((name) => !config.repo.includes(name))
        : [],
    )
    const affectedBranchWorkspaces =
      branchWorkspaces.kind === 'ready'
        ? Array.from(
            new Set(
              branchWorkspaces.manifests
                .filter((manifest) =>
                  manifest.repositories.some((member) => removedRepositories.has(member.repositoryName)),
                )
                .map((manifest) => manifest.branch),
            ),
          ).sort(compareText)
        : []
    if (affectedBranchWorkspaces.length > 0) {
      return {
        ok: false,
        message: 'workspace.config.repository-referenced',
        affectedBranchWorkspaces,
      }
    }
    await (dependencies.writeConfig ?? writeWorkspaceConfig)(discovery.rootId, config)
  } catch (error) {
    return { ok: false, message: safeMessage(error) }
  }
  return projectWorkspaceConfiguration(discovery, config)
}

export function projectWorkspaceConfiguration(
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
  return message.startsWith('workspace.config.') ||
    message.startsWith('workspace.branch-workspace.') ||
    message === 'error.ssh-config-changed'
    ? message
    : 'workspace.config.write-failed'
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
