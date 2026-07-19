import { lstat, readdir } from 'node:fs/promises'
import path from 'node:path'
import pLimit from 'p-limit'
import { readWorkspaceConfig } from '#/server/modules/workspace-config-source.ts'
import { probeRepository as probeRepositoryDefault } from '#/server/modules/repo-read-paths.ts'
import type { ProbeResult } from '#/shared/rpc.ts'
import type {
  WorkspaceDiscoveryIssue,
  WorkspaceDiscoveryResult,
  WorkspaceRepositoryCandidate,
  WorkspaceRepositoryEntry,
} from '#/shared/workspace.ts'

interface WorkspaceDiscoveryDependencies {
  probeRepository?: (cwd: string) => Promise<ProbeResult>
}

const repositoryNameCollator = new Intl.Collator('en', {
  numeric: true,
  sensitivity: 'base',
})

export async function discoverWorkspaceRepositories(
  rootPath: string,
  dependencies: WorkspaceDiscoveryDependencies = {},
): Promise<WorkspaceDiscoveryResult> {
  const probeRepository = dependencies.probeRepository ?? probeRepositoryDefault
  const rootProbe = await probeRepository(rootPath)
  if (!rootProbe.ok) return { ok: false, message: rootProbe.message ?? 'error.failed-read-repo' }

  const rootId = path.resolve(rootProbe.root ?? rootPath)
  if (rootProbe.isGitRepo !== false) {
    return {
      ok: true,
      rootId,
      repositories: [],
      candidates: [],
      configuration: { kind: 'missing' },
      skipped: [],
    }
  }

  let entries
  try {
    entries = await readdir(rootId, { withFileTypes: true })
  } catch {
    return { ok: false, message: 'error.failed-read-repo' }
  }

  const directoryCandidates = entries
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => repositoryNameCollator.compare(left.name, right.name))
  const limit = pLimit(8)
  const results = await Promise.all(
    directoryCandidates.map((entry) =>
      limit(async (): Promise<WorkspaceRepositoryEntry | WorkspaceDiscoveryIssue | null> => {
        const candidatePath = path.join(rootId, entry.name)
        if (!(await hasGitMarker(candidatePath))) return null

        const probe = await probeRepository(candidatePath).catch(() => null)
        if (!probe) return { path: candidatePath, message: 'error.failed-read-repo' }
        if (!probe.ok) {
          return { path: candidatePath, message: probe.message ?? 'error.failed-read-repo' }
        }
        if (probe.isGitRepo === false || !probe.root || path.resolve(probe.root) !== path.resolve(candidatePath)) {
          return { path: candidatePath, message: 'error.failed-read-repo' }
        }
        return { id: path.resolve(probe.root), name: entry.name }
      }),
    ),
  )

  const repositories: WorkspaceRepositoryEntry[] = []
  const skipped: WorkspaceDiscoveryIssue[] = []
  for (const result of results) {
    if (!result) continue
    if ('id' in result) repositories.push(result)
    else skipped.push(result)
  }
  const configuration = await readWorkspaceConfig(rootId)
  if (configuration.kind === 'missing') {
    return {
      ok: true,
      rootId,
      repositories,
      candidates: repositories.map((repository) => ({ ...repository, selected: false, available: true })),
      configuration,
      skipped,
    }
  }
  if (configuration.kind === 'invalid') {
    return {
      ok: true,
      rootId,
      repositories: [],
      candidates: repositories.map((repository) => ({ ...repository, selected: false, available: true })),
      configuration,
      skipped,
    }
  }

  const selected = new Set(configuration.config.repo)
  const availableByName = new Map(repositories.map((repository) => [repository.name, repository]))
  const workspaceCandidates: WorkspaceRepositoryCandidate[] = repositories.map((repository) => ({
    ...repository,
    selected: selected.has(repository.name),
    available: true,
  }))
  for (const name of configuration.config.repo) {
    if (availableByName.has(name)) continue
    workspaceCandidates.push({ id: path.join(rootId, name), name, selected: true, available: false })
  }
  const effectiveRepositories = configuration.config.repo.flatMap((name) => {
    const repository = availableByName.get(name)
    return repository ? [repository] : []
  })
  return {
    ok: true,
    rootId,
    repositories: effectiveRepositories,
    candidates: workspaceCandidates,
    configuration,
    skipped,
  }
}

async function hasGitMarker(candidatePath: string): Promise<boolean> {
  try {
    const marker = await lstat(path.join(candidatePath, '.git'))
    return marker.isDirectory() || marker.isFile()
  } catch {
    return false
  }
}
