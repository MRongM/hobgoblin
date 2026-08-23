import { lstat, readdir, realpath } from 'node:fs/promises'
import path from 'node:path'
import pLimit from 'p-limit'
import { readWorkspaceConfig } from '#/server/modules/workspace-config-source.ts'
import { workspaceRepositoryId, workspaceRootId } from '#/server/modules/workspace-paths.ts'
import { probeRepository as probeRepositoryDefault } from '#/server/modules/repo-read-paths.ts'
import { isPrimaryGitWorktree } from '#/system/git/repository-role.ts'
import { REMOTE_WORKSPACE_LINKED_WORKTREE_MARKER, runRemoteCommand } from '#/system/ssh/commands.ts'
import { resolveRepositoryRemoteTarget } from '#/system/remote/target.ts'
import type { ProbeResult } from '#/shared/rpc.ts'
import {
  isRemoteRepoId,
  normalizeRemoteRepoRef,
  parseRemoteRepoId,
  remoteWorkspaceChildRef,
} from '#/shared/remote-repo.ts'
import type {
  WorkspaceConfig,
  WorkspaceConfigSnapshot,
  WorkspaceDiscoveryIssue,
  WorkspaceDiscoveryResult,
  WorkspaceRepositoryCandidate,
  WorkspaceRepositoryEntry,
} from '#/shared/workspace.ts'

interface WorkspaceDiscoveryDependencies {
  probeRepository?: (cwd: string) => Promise<ProbeResult>
  isPrimaryWorktree?: (cwd: string) => Promise<boolean>
  readConfig?: typeof readWorkspaceConfig
  resolveRemoteTarget?: typeof resolveRepositoryRemoteTarget
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

export async function restoreWorkspaceRepositories(
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

  const configuration = await readWorkspaceConfiguration(rootId, dependencies)
  if (configuration.kind === 'ready') {
    return isRemoteRepoId(rootId)
      ? await restoreRemoteConfiguredWorkspace(rootId, configuration.config, dependencies)
      : await restoreLocalConfiguredWorkspace(rootId, configuration.config, probeRepository)
  }

  return isRemoteRepoId(rootId)
    ? await discoverRemoteWorkspaceRepositories(rootId, dependencies, configuration)
    : await discoverLocalWorkspaceRepositories(rootId, probeRepository, dependencies, configuration)
}

async function discoverLocalWorkspaceRepositories(
  rootId: string,
  probeRepository: (cwd: string) => Promise<ProbeResult>,
  dependencies: WorkspaceDiscoveryDependencies,
  configuration?: WorkspaceConfigSnapshot,
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
  const excludedRepositoryNames = new Set<string>()
  const results = await Promise.all(
    directoryCandidates.map((entry) =>
      limit(async (): Promise<WorkspaceRepositoryEntry | WorkspaceDiscoveryIssue | null> => {
        const candidatePath = path.join(rootId, entry.name)
        const marker = await gitMarkerKind(candidatePath)
        if (!marker) return null
        if (
          marker === 'file' &&
          !(await (dependencies.isPrimaryWorktree ?? isPrimaryGitWorktree)(candidatePath).catch(() => false))
        ) {
          excludedRepositoryNames.add(entry.name)
          return null
        }

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
  return await projectWorkspaceDiscovery(
    rootId,
    repositories,
    skipped,
    dependencies,
    configuration,
    excludedRepositoryNames,
  )
}

async function discoverRemoteWorkspaceRepositories(
  rootId: string,
  dependencies: WorkspaceDiscoveryDependencies,
  configuration?: WorkspaceConfigSnapshot,
): Promise<WorkspaceDiscoveryResult> {
  const parsed = parseRemoteRepoId(rootId)
  const rootRef = parsed ? normalizeRemoteRepoRef(parsed) : null
  if (!parsed || !rootRef) return { ok: false, message: 'error.failed-read-repo' }

  let target
  try {
    target = (await (dependencies.resolveRemoteTarget ?? resolveRepositoryRemoteTarget)(parsed)).target
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
  const resolvedConfiguration = configuration ?? (await readWorkspaceConfiguration(rootId, dependencies))
  const excludedRepositoryNames = new Set<string>()
  if (resolvedConfiguration.kind === 'ready') {
    const discoveredNames = new Set(repositories.map((repository) => repository.name))
    await Promise.all(
      resolvedConfiguration.config.repo.map((name) =>
        limit(async () => {
          if (discoveredNames.has(name)) return
          const ref = remoteWorkspaceChildRef(rootRef, name)
          if (!ref) return
          const probe = await runRemote(target, { type: 'testWorkspaceGitDirectory', path: ref.remotePath }).catch(
            () => null,
          )
          if (!probe?.ok && probe?.stdout === REMOTE_WORKSPACE_LINKED_WORKTREE_MARKER) {
            excludedRepositoryNames.add(name)
          }
        }),
      ),
    )
  }
  return await projectWorkspaceDiscovery(
    rootId,
    repositories,
    skipped,
    dependencies,
    resolvedConfiguration,
    excludedRepositoryNames,
  )
}

async function restoreLocalConfiguredWorkspace(
  rootId: string,
  config: WorkspaceConfig,
  probeRepository: (cwd: string) => Promise<ProbeResult>,
): Promise<WorkspaceDiscoveryResult> {
  const limit = pLimit(8)
  const candidates = await Promise.all(
    config.repo.map((name) =>
      limit(async (): Promise<WorkspaceRepositoryCandidate> => {
        const id = workspaceRepositoryId(rootId, name)!
        const probe = await probeRepository(id).catch(() => null)
        const candidateRoot = await canonicalDirectoryPath(id)
        const probedRoot = probe?.root ? await canonicalDirectoryPath(probe.root) : null
        const available =
          probe?.ok === true && probe.isGitRepo !== false && !!candidateRoot && candidateRoot === probedRoot
        return { id, name, selected: true, available }
      }),
    ),
  )
  return configuredWorkspaceResult(rootId, config, candidates)
}

async function restoreRemoteConfiguredWorkspace(
  rootId: string,
  config: WorkspaceConfig,
  dependencies: WorkspaceDiscoveryDependencies,
): Promise<WorkspaceDiscoveryResult> {
  const parsed = parseRemoteRepoId(rootId)
  const rootRef = parsed ? normalizeRemoteRepoRef(parsed) : null
  if (!parsed || !rootRef) return { ok: false, message: 'error.failed-read-repo' }

  let target
  try {
    target = (await (dependencies.resolveRemoteTarget ?? resolveRepositoryRemoteTarget)(parsed)).target
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
  const limit = pLimit(8)
  const candidates = await Promise.all(
    config.repo.map((name) =>
      limit(async (): Promise<WorkspaceRepositoryCandidate> => {
        const ref = remoteWorkspaceChildRef(rootRef, name)!
        const probe = await runRemote(target, {
          type: 'testWorkspaceGitDirectory',
          path: ref.remotePath,
        }).catch(() => null)
        return { id: ref.id, name, remoteRef: ref, selected: true, available: probe?.ok === true }
      }),
    ),
  )
  return configuredWorkspaceResult(rootId, config, candidates)
}

function configuredWorkspaceResult(
  rootId: string,
  config: WorkspaceConfig,
  candidates: WorkspaceRepositoryCandidate[],
): WorkspaceDiscoveryResult {
  const repositories = candidates.flatMap((candidate): WorkspaceRepositoryEntry[] =>
    candidate.available
      ? [
          {
            id: candidate.id,
            name: candidate.name,
            ...(candidate.remoteRef ? { remoteRef: candidate.remoteRef } : {}),
          },
        ]
      : [],
  )
  return {
    ok: true,
    rootId,
    repositories,
    candidates,
    configuration: { kind: 'ready', config },
    skipped: [],
  }
}

async function projectWorkspaceDiscovery(
  rootId: string,
  repositories: WorkspaceRepositoryEntry[],
  skipped: WorkspaceDiscoveryIssue[],
  dependencies: WorkspaceDiscoveryDependencies,
  configurationOverride?: WorkspaceConfigSnapshot,
  excludedRepositoryNames: ReadonlySet<string> = new Set(),
): Promise<WorkspaceDiscoveryResult> {
  const configuration = configurationOverride ?? (await readWorkspaceConfiguration(rootId, dependencies))
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
    if (availableByName.has(name) || excludedRepositoryNames.has(name)) continue
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

async function readWorkspaceConfiguration(
  rootId: string,
  dependencies: WorkspaceDiscoveryDependencies,
): Promise<WorkspaceConfigSnapshot> {
  return dependencies.readConfig ? await dependencies.readConfig(rootId) : await readWorkspaceConfig(rootId)
}

function remoteWorkspaceRefForMember(rootId: string, member: string) {
  const parsed = parseRemoteRepoId(rootId)
  const root = parsed ? normalizeRemoteRepoRef(parsed) : null
  return root ? remoteWorkspaceChildRef(root, member) : null
}

async function gitMarkerKind(candidatePath: string): Promise<'directory' | 'file' | null> {
  try {
    const marker = await lstat(path.join(candidatePath, '.git'))
    if (marker.isDirectory()) return 'directory'
    if (marker.isFile()) return 'file'
    return null
  } catch {
    return null
  }
}

async function canonicalDirectoryPath(candidatePath: string): Promise<string | null> {
  try {
    return await realpath(candidatePath)
  } catch {
    return null
  }
}
