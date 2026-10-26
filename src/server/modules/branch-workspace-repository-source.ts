import { createHash } from 'node:crypto'
import { fingerprintBranchWorkspaceEntry } from '#/server/modules/branch-workspace-materialization-source.ts'
import { cp, lstat, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { runServerCancellable } from '#/server/common/network-ops.ts'
import { repositoryIdAtPath, workspaceRepositoryPath } from '#/server/modules/workspace-paths.ts'
import { gitNetworkOptionsFromPrefs } from '#/server/modules/git-network-settings.ts'
import { getServerSettingsPrefs } from '#/server/modules/settings-source.ts'
import { buildGitNetworkEnv, gitNetworkOptions, git, type GitNetworkOptions } from '#/system/git/helper.ts'
import { parseWorktrees } from '#/system/git/parsers.ts'
import { resolveRepositoryRemoteTarget } from '#/system/remote/target.ts'
import { runRemoteCommand } from '#/system/ssh/commands.ts'
import { parseRemoteRepoId } from '#/shared/remote-repo.ts'
import type { ExecResult } from '#/shared/git-types.ts'
import type { BranchWorkspaceMemberSource } from '#/shared/branch-workspaces.ts'
import type { CreateWorktreeMode } from '#/shared/worktree-create.ts'

export interface BranchWorkspaceRepositoryMaterialization {
  memberId?: string
  source: BranchWorkspaceMemberSource
  worktreePath: string
  /** Omitted means retain the clone's remote default branch. */
  mode?: CreateWorktreeMode
}

export interface BranchWorkspaceRepositorySourceDependencies {
  getNetworkOptions?: () => Promise<GitNetworkOptions>
  resolveRemoteTarget?: typeof resolveRepositoryRemoteTarget
  runRemote?: typeof runRemoteCommand
}

/** Complete repositories never share source objects, config, hooks or a worktree registration. */
export async function materializeBranchWorkspaceRepository(
  rootId: string,
  input: BranchWorkspaceRepositoryMaterialization,
  signal?: AbortSignal,
  dependencies: BranchWorkspaceRepositorySourceDependencies = {},
): Promise<ExecResult> {
  let sourceKey: string
  try {
    sourceKey = await repositoryCloneCoordinationKey(rootId, input.source, signal, dependencies)
  } catch (error) {
    return {
      ok: false,
      message: signal?.aborted
        ? 'cancelled'
        : error instanceof Error
          ? error.message
          : 'workspace.branch-workspace.repository-unavailable',
    }
  }
  return await enqueueRepositoryClone(
    sourceKey,
    async () =>
      await runServerCancellable(sourceKey, 'user', async (networkSignal) => {
        const combined = signal ? AbortSignal.any([signal, networkSignal]) : networkSignal
        try {
          combined.throwIfAborted()
          const remote = parseRemoteRepoId(rootId)
          const networkOptions =
            !remote || remote.transport === 'wsl'
              ? await (
                  dependencies.getNetworkOptions ??
                  (async () => gitNetworkOptionsFromPrefs(await getServerSettingsPrefs()))
                )()
              : undefined
          if (remote) {
            if (input.source.kind === 'repository') {
              const source = parseRemoteRepoId(input.source.repositoryId)
              if (!source || source.alias !== remote.alias || source.transport !== remote.transport)
                return { ok: false, message: 'error.invalid-arguments' }
            }
            const { target } = await (dependencies.resolveRemoteTarget ?? resolveRepositoryRemoteTarget)(
              remote,
              combined,
            )
            const result = await (dependencies.runRemote ?? runRemoteCommand)(
              target,
              {
                type: 'materializeBranchWorkspaceRepository',
                rootPath: remote.remotePath,
                source:
                  input.source.kind === 'url' ? input.source.url : workspaceRepositoryPath(input.source.repositoryId)!,
                sourceIsRepository: input.source.kind === 'repository',
                targetPath: input.worktreePath,
                mode: input.mode,
                memberId: input.memberId,
              },
              {
                signal: combined,
                timeoutMs: networkOptions?.timeoutMs ?? 300_000,
                ...(remote.transport === 'wsl' ? { wslEnvironment: buildGitNetworkEnv(networkOptions?.proxyUrl) } : {}),
              },
            )
            if (!result.ok)
              return { ok: false, message: result.message ?? 'workspace.branch-workspace.remote-operation-failed' }
            const payload = JSON.parse(result.stdout) as ExecResult
            return payload.ok
              ? { ok: true, message: 'created' }
              : { ok: false, message: payload.message || 'workspace.branch-workspace.remote-operation-failed' }
          }
          if (input.source.kind === 'repository' && parseRemoteRepoId(input.source.repositoryId))
            return { ok: false, message: 'error.invalid-arguments' }
          return await materializeLocalRepository(rootId, input, combined, networkOptions)
        } catch (error) {
          return {
            ok: false,
            message: combined.aborted
              ? 'cancelled'
              : error instanceof Error
                ? error.message
                : 'workspace.branch-workspace.operation-failed',
          }
        }
      }),
  )
}

async function materializeLocalRepository(
  rootId: string,
  input: BranchWorkspaceRepositoryMaterialization,
  signal: AbortSignal,
  networkOptions?: GitNetworkOptions,
): Promise<ExecResult> {
  const rootPath = workspaceRepositoryPath(rootId)!
  const targetPath = path.resolve(input.worktreePath)
  const relative = path.relative(rootPath, targetPath)
  if (relative.startsWith('..') || path.isAbsolute(relative) || relative.split(path.sep).length !== 2)
    throw new Error('workspace.branch-workspace.invalid-path')
  const parent = path.dirname(targetPath)
  const parentInfo = await lstat(parent)
  if (!parentInfo.isDirectory() || parentInfo.isSymbolicLink())
    throw new Error('workspace.branch-workspace.invalid-path')
  if (
    await lstat(targetPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null
      throw error
    })
  )
    throw new Error('workspace.branch-workspace.target-exists')
  const staging = await mkdtemp(path.join(parent, '.hob-clone-'))
  const checkout = path.join(staging, 'repository')
  const run = async (cwd: string, args: string[]) =>
    await git(cwd, args, gitNetworkOptions(networkOptions, 300_000, signal))
  try {
    const source = input.source.kind === 'url' ? input.source.url : input.source.repositoryId
    const remoteConfig =
      input.source.kind === 'repository'
        ? await run(source, [
            'config',
            '--get-regexp',
            '^(remote\\..*\\.(url|pushurl|fetch)|branch\\..*\\.(remote|merge))$',
          ]).catch(() => '')
        : null
    await run(parent, ['clone', '--no-local', '--no-hardlinks', '--no-checkout', '--', source, checkout])
    if (input.source.kind === 'repository') {
      // A normal clone only creates one local branch. Preserve the other source branches before dropping its temporary origin.
      const refs = await run(checkout, ['for-each-ref', '--format=%(refname)%00%(objectname)', 'refs/remotes/origin/'])
      for (const line of refs.split('\n').filter(Boolean)) {
        const [ref, hash] = line.split('\0')
        if (!ref || !hash || ref === 'refs/remotes/origin/HEAD') continue
        await run(checkout, ['update-ref', `refs/heads/${ref.slice('refs/remotes/origin/'.length)}`, hash])
      }
    }
    if (remoteConfig !== null) {
      await run(checkout, ['remote', 'remove', 'origin'])
      for (const line of remoteConfig.split('\n').filter(Boolean)) {
        const separator = line.indexOf(' ')
        if (separator > 0) await run(checkout, ['config', '--add', line.slice(0, separator), line.slice(separator + 1)])
      }
      await run(checkout, [
        'fetch',
        '--no-tags',
        '--no-write-fetch-head',
        '--',
        source,
        '+refs/remotes/*:refs/remotes/*',
      ])
    }
    await checkoutRepositoryMode(checkout, input.mode, run)
    if (input.memberId) {
      await run(checkout, ['config', 'hobgoblin.subworkspaceMemberId', input.memberId])
      const ownership = await run(checkout, ['config', '--local', '--get', 'hobgoblin.subworkspaceMemberId'])
      if (ownership !== input.memberId) throw new Error('workspace.branch-workspace.repository-unavailable')
    }
    signal.throwIfAborted()
    await publishBranchWorkspaceRepository(rootId, checkout, targetPath, signal)
    return { ok: true, message: 'created' }
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}

async function checkoutRepositoryMode(
  cwd: string,
  mode: CreateWorktreeMode | undefined,
  run: (cwd: string, args: string[]) => Promise<string>,
): Promise<void> {
  if (!mode) {
    await run(cwd, ['checkout', '--force'])
    return
  }
  if (mode.kind === 'existingBranch') {
    await run(cwd, ['checkout', mode.branch])
    return
  }
  if (mode.kind === 'detached') {
    await run(cwd, ['checkout', '--detach', mode.ref])
    return
  }
  if (mode.kind === 'trackRemoteBranch') {
    await run(cwd, ['checkout', '-b', mode.localBranch, '--track', mode.remoteRef])
    return
  }
  const ref = mode.creationBase.kind === 'localBranch' ? mode.creationBase.branch : mode.creationBase.remoteRef
  await run(cwd, ['checkout', '-b', mode.newBranch, ref])
}

export interface BranchWorkspaceRepositoryDeletionInspection {
  memberId?: string
  dirty: boolean
  localOnlyCommits: number
  repositoryFingerprint: string
}

/** Preview and resume guard for deleting an independently owned target directory. */
export async function inspectBranchWorkspaceRepository(
  rootId: string,
  targetPath: string,
  signal?: AbortSignal,
  dependencies: BranchWorkspaceRepositorySourceDependencies = {},
): Promise<BranchWorkspaceRepositoryDeletionInspection> {
  const remote = parseRemoteRepoId(rootId)
  if (remote) {
    const { target } = await (dependencies.resolveRemoteTarget ?? resolveRepositoryRemoteTarget)(remote, signal)
    const result = await (dependencies.runRemote ?? runRemoteCommand)(
      target,
      { type: 'inspectBranchWorkspaceRepository', rootPath: remote.remotePath, targetPath },
      { signal, timeoutMs: 90_000 },
    )
    if (!result.ok) throw new Error(result.message ?? 'workspace.branch-workspace.remote-operation-failed')
    const payload = JSON.parse(result.stdout) as BranchWorkspaceRepositoryDeletionInspection & { ok?: boolean }
    if (
      payload.ok !== true ||
      typeof payload.dirty !== 'boolean' ||
      !Number.isSafeInteger(payload.localOnlyCommits) ||
      !/^[a-f0-9]{64}$/.test(payload.repositoryFingerprint)
    )
      throw new Error('workspace.branch-workspace.remote-invalid-response')
    return {
      ...(payload.memberId ? { memberId: payload.memberId } : {}),
      dirty: payload.dirty,
      localOnlyCommits: payload.localOnlyCommits,
      repositoryFingerprint: payload.repositoryFingerprint,
    }
  }
  const rootPath = workspaceRepositoryPath(rootId)!
  const relative = path.relative(rootPath, targetPath)
  if (relative.startsWith('..') || path.isAbsolute(relative) || relative.split(path.sep).length !== 2)
    throw new Error('workspace.branch-workspace.invalid-path')
  const gitDir = await lstat(path.join(targetPath, '.git'))
  if (!gitDir.isDirectory() || gitDir.isSymbolicLink())
    throw new Error('workspace.branch-workspace.repository-unavailable')
  const run = async (args: string[]) => await git(targetPath, args, { signal })
  const common = await run(['rev-parse', '--git-common-dir'])
  if (path.resolve(targetPath, common) !== path.join(targetPath, '.git'))
    throw new Error('workspace.branch-workspace.repository-unavailable')
  const registrations = await run(['worktree', 'list', '--porcelain', '-z'])
  if (
    registrations
      .split('\0')
      .filter((field) => field.startsWith('worktree '))
      .some((field) => path.resolve(field.slice(9)) !== path.resolve(targetPath))
  )
    throw new Error('workspace.branch-workspace.worktree-elsewhere')
  const [status, stagedDiff, unstagedDiff, refs, head, count, untracked] = await Promise.all([
    run(['status', '--porcelain=v1', '-z']),
    run(['diff', '--cached', '--binary']),
    run(['diff', '--binary']),
    run(['show-ref']).catch(() => ''),
    run(['rev-parse', 'HEAD']),
    run(['rev-list', '--count', '--all', '--not', '--remotes']),
    run(['ls-files', '--others', '--exclude-standard', '-z']),
  ])
  const hash = createHash('sha256').update(JSON.stringify([status, stagedDiff, unstagedDiff, refs, head]))
  for (const name of untracked.split('\0').filter(Boolean)) {
    signal?.throwIfAborted()
    hash.update(name).update(await fingerprintBranchWorkspaceEntry(rootId, path.join(targetPath, name), signal))
  }
  const memberId = await run(['config', '--get', 'hobgoblin.subworkspaceMemberId']).catch(() => '')
  return {
    ...(memberId ? { memberId } : {}),
    dirty: !!status,
    localOnlyCommits: Number(count),
    repositoryFingerprint: hash.digest('hex'),
  }
}

const cloneQueues = new Map<string, Promise<ExecResult>>()
async function enqueueRepositoryClone(key: string, work: () => Promise<ExecResult>): Promise<ExecResult> {
  const previous = cloneQueues.get(key) ?? Promise.resolve({ ok: true, message: '' })
  const current = previous.catch(() => ({ ok: false, message: '' })).then(work)
  cloneQueues.set(key, current)
  try {
    return await current
  } finally {
    if (cloneQueues.get(key) === current) cloneQueues.delete(key)
  }
}

/** Claim the final directory atomically, then publish with exclusive file creation. */
export async function publishBranchWorkspaceRepository(
  rootId: string,
  stagingPath: string,
  targetPath: string,
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted()
  const rootPath = workspaceRepositoryPath(rootId)
  const relative = rootPath ? path.relative(rootPath, targetPath) : '..'
  if (
    !rootPath ||
    relative.startsWith('..') ||
    path.isAbsolute(relative) ||
    relative.split(path.sep).length !== 2 ||
    !(await lstat(path.dirname(targetPath))).isDirectory() ||
    (await lstat(path.dirname(targetPath))).isSymbolicLink()
  )
    throw new Error('workspace.branch-workspace.invalid-path')
  try {
    await mkdir(targetPath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('workspace.branch-workspace.target-exists')
    throw error
  }
  const claim = await lstat(targetPath)
  try {
    signal?.throwIfAborted()
    for (const name of await readdir(stagingPath)) {
      await cp(path.join(stagingPath, name), path.join(targetPath, name), {
        recursive: true,
        force: false,
        errorOnExist: true,
        dereference: false,
        verbatimSymlinks: true,
        filter: () => {
          signal?.throwIfAborted()
          return true
        },
      })
    }
  } catch (error) {
    const current = await lstat(targetPath).catch(() => null)
    if (
      current?.ino === claim.ino &&
      current.dev === claim.dev &&
      (await unchangedPublicationSubset(rootId, stagingPath, targetPath))
    )
      await rm(targetPath, { recursive: true, force: true })
    throw error
  }
}

async function unchangedPublicationSubset(rootId: string, source: string, target: string): Promise<boolean> {
  try {
    for (const name of await readdir(target)) {
      const a = path.join(source, name),
        b = path.join(target, name)
      const [original, present] = await Promise.all([lstat(a), lstat(b)])
      if (original.isDirectory() && present.isDirectory() && !present.isSymbolicLink()) {
        if (!(await unchangedPublicationSubset(rootId, a, b))) return false
      } else if (
        (await fingerprintBranchWorkspaceEntry(rootId, a)) !== (await fingerprintBranchWorkspaceEntry(rootId, b))
      )
        return false
    }
    return true
  } catch {
    return false
  }
}

async function repositoryCloneCoordinationKey(
  rootId: string,
  source: BranchWorkspaceMemberSource,
  signal: AbortSignal | undefined,
  dependencies: BranchWorkspaceRepositorySourceDependencies,
): Promise<string> {
  signal?.throwIfAborted()
  if (source.kind === 'url') return `${rootId}\0${source.url}`
  const remote = parseRemoteRepoId(rootId)
  let output: string
  if (remote) {
    const sourceRemote = parseRemoteRepoId(source.repositoryId)
    if (!sourceRemote || sourceRemote.alias !== remote.alias || sourceRemote.transport !== remote.transport)
      throw new Error('error.invalid-arguments')
    const { target } = await (dependencies.resolveRemoteTarget ?? resolveRepositoryRemoteTarget)(remote, signal)
    const result = await (dependencies.runRemote ?? runRemoteCommand)(
      target,
      { type: 'gitWorktreeList', path: sourceRemote.remotePath },
      { signal },
    )
    if (!result.ok) throw new Error(result.message ?? 'workspace.branch-workspace.repository-unavailable')
    output = result.stdout
  } else {
    if (parseRemoteRepoId(source.repositoryId)) throw new Error('error.invalid-arguments')
    output = await git(source.repositoryId, ['worktree', 'list', '--porcelain', '--expire', 'now'], { signal })
  }
  const primary = parseWorktrees(output).find((entry) => entry.isPrimary)
  if (!primary || primary.isBare) throw new Error('workspace.branch-workspace.repository-unavailable')
  return repositoryIdAtPath(rootId, primary.path)
}
