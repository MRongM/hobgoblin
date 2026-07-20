import { lstat, readdir, realpath } from 'node:fs/promises'
import path from 'node:path'
import pLimit from 'p-limit'
import { readWorkspaceConfig } from '#/server/modules/workspace-config-source.ts'
import { workspaceRepositoryId, workspaceRootId } from '#/server/modules/workspace-paths.ts'
import { probeRepository as probeRepositoryDefault } from '#/server/modules/repo-read-paths.ts'
import { runRemoteCommand } from '#/system/ssh/commands.ts'
import { resolveRemoteTarget as resolveSshRemoteTarget } from '#/system/ssh/config.ts'
import type { ProbeResult } from '#/shared/rpc.ts'
import {
  isRemoteRepoId,
  normalizeRemoteRepoRef,
  parseRemoteRepoId,
  remoteWorkspaceChildRef,
} from '#/shared/remote-repo.ts'
import type {
  WorkspaceDiscoveryIssue,
  WorkspaceDiscoveryResult,
  WorkspaceRepositoryCandidate,
  WorkspaceRepositoryEntry,
} from '#/shared/workspace.ts'

interface WorkspaceDiscoveryDependencies {
  probeRepository?: (cwd: string) => Promise<ProbeResult>
  readConfig?: typeof readWorkspaceConfig
  resolveRemoteTarget?: typeof resolveSshRemoteTarget
  runRemote?: typeof runRemoteCommand
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

  const rootId = workspaceRootId(rootProbe.root ?? rootPath)
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

  if (isRemoteRepoId(rootId)) {
    return await discoverRemoteWorkspaceRepositories(rootId, dependencies)
  }

  return await discoverLocalWorkspaceRepositories(rootId, probeRepository, dependencies)
}

async function discoverLocalWorkspaceRepositories(
  rootId: string,
  probeRepository: (cwd: string) => Promise<ProbeResult>,
  dependencies: WorkspaceDiscoveryDependencies,
): Promise<WorkspaceDiscoveryResult> {
  let entries
  try {
    entries = await readdir(rootId, { withFileTypes: true })
  } catch {
    return { ok: false, message: 'error.failed-read-repo' }
  }

  const directoryCandidates = entries
    .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
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
        const candidateRoot = await canonicalDirectoryPath(candidatePath)
        const probedRoot = probe.root ? await canonicalDirectoryPath(probe.root) : null
        if (probe.isGitRepo === false || !candidateRoot || candidateRoot !== probedRoot) {
          return { path: candidatePath, message: 'error.failed-read-repo' }
        }
        return { id: path.resolve(candidatePath), name: entry.name }
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
  return await projectWorkspaceDiscovery(rootId, repositories, skipped, dependencies)
}

async function discoverRemoteWorkspaceRepositories(
  rootId: string,
  dependencies: WorkspaceDiscoveryDependencies,
): Promise<WorkspaceDiscoveryResult> {
  const parsed = parseRemoteRepoId(rootId)
  const rootRef = parsed ? normalizeRemoteRepoRef(parsed) : null
  if (!parsed || !rootRef) return { ok: false, message: 'error.failed-read-repo' }

  let target
  try {
    target = (await (dependencies.resolveRemoteTarget ?? resolveSshRemoteTarget)(parsed)).target
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error && error.message === 'error.ssh-config-changed'
          ? error.message
          : 'error.failed-read-repo',
    }
  }
  const runRemote = dependencies.runRemote ?? runRemoteCommand
  const listed = await runRemote(target, { type: 'listWorkspaceGitDirectories', rootPath: parsed.remotePath }).catch(
    () => null,
  )
  if (!listed?.ok) return { ok: false, message: 'error.failed-read-repo' }

  const candidatePaths = Array.from(
    new Set(
      listed.stdout
        .split('\0')
        .filter(Boolean)
        .map((candidate) => path.posix.normalize(candidate))
        .filter((candidate) => path.posix.dirname(candidate) === parsed.remotePath),
    ),
  ).sort((left, right) => repositoryNameCollator.compare(path.posix.basename(left), path.posix.basename(right)))
  const limit = pLimit(8)
  const results = await Promise.all(
    candidatePaths.map((candidatePath) =>
      limit(async (): Promise<WorkspaceRepositoryEntry | WorkspaceDiscoveryIssue> => {
        const name = path.posix.basename(candidatePath)
        const ref = remoteWorkspaceChildRef(rootRef, name)
        if (!ref) return { path: candidatePath, message: 'error.failed-read-repo' }
        const probe = await runRemote(target, { type: 'testWorkspaceGitDirectory', path: candidatePath }).catch(
          () => null,
        )
        if (!probe?.ok) {
          return { path: candidatePath, message: 'error.failed-read-repo' }
        }
        return { id: ref.id, name, remoteRef: ref }
      }),
    ),
  )

  const repositories: WorkspaceRepositoryEntry[] = []
  const skipped: WorkspaceDiscoveryIssue[] = []
  for (const result of results) {
    if ('id' in result) repositories.push(result)
    else skipped.push(result)
  }
  return await projectWorkspaceDiscovery(rootId, repositories, skipped, dependencies)
}

async function projectWorkspaceDiscovery(
  rootId: string,
  repositories: WorkspaceRepositoryEntry[],
  skipped: WorkspaceDiscoveryIssue[],
  dependencies: WorkspaceDiscoveryDependencies,
): Promise<WorkspaceDiscoveryResult> {
  const configuration = dependencies.readConfig
    ? await dependencies.readConfig(rootId)
    : await readWorkspaceConfig(rootId, {
        runRemote: dependencies.runRemote,
        resolveRemoteTarget: dependencies.resolveRemoteTarget,
      })
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
    const id = workspaceRepositoryId(rootId, name)
    if (!id) continue
    const remoteRef = isRemoteRepoId(rootId) ? remoteWorkspaceRefForMember(rootId, name) : null
    workspaceCandidates.push({
      id,
      name,
      selected: true,
      available: false,
      ...(remoteRef ? { remoteRef } : {}),
    })
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

function remoteWorkspaceRefForMember(rootId: string, member: string) {
  const parsed = parseRemoteRepoId(rootId)
  const root = parsed ? normalizeRemoteRepoRef(parsed) : null
  return root ? remoteWorkspaceChildRef(root, member) : null
}

async function hasGitMarker(candidatePath: string): Promise<boolean> {
  try {
    const marker = await lstat(path.join(candidatePath, '.git'))
    return marker.isDirectory() || marker.isFile()
  } catch {
    return false
  }
}

async function canonicalDirectoryPath(candidatePath: string): Promise<string | null> {
  try {
    return await realpath(candidatePath)
  } catch {
    return null
  }
}
