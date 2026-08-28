import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { cp, lstat, mkdir, readdir, readlink, realpath, rmdir, symlink, unlink } from 'node:fs/promises'
import path from 'node:path'
import { workspaceRepositoryPath } from '#/server/modules/workspace-paths.ts'
import { getWorktrees } from '#/system/git/worktrees.ts'
import {
  isBranchWorkspaceDirectoryName,
  isManagedBranchWorkspaceEntryName,
  type BranchWorkspaceAuxiliaryCandidate,
  type BranchWorkspacePathInspection,
  type BranchWorkspacePathKind,
} from '#/shared/branch-workspaces.ts'
import { isRemoteRepoId, parseRemoteRepoId, type RemoteRepoTarget } from '#/shared/remote-repo.ts'
import {
  copyRemoteBranchWorkspaceEntry,
  createRemoteBranchWorkspaceDirectory,
  fingerprintRemoteBranchWorkspaceEntry,
  inspectRemoteBranchWorkspacePath,
  listRemoteBranchWorkspaceAuxiliaryCandidates,
  listRemoteBranchWorkspaceChildren,
  materializeRemoteBranchWorkspaceSymlink,
  removeRemoteBranchWorkspaceEntry,
} from '#/system/ssh/branch-workspaces.ts'
import { resolveRepositoryRemoteTarget } from '#/system/remote/target.ts'

export interface BranchWorkspaceMaterializationDependencies {
  resolveRemoteTarget?: typeof resolveRepositoryRemoteTarget
  listRemoteCandidates?: typeof listRemoteBranchWorkspaceAuxiliaryCandidates
  inspectRemotePath?: typeof inspectRemoteBranchWorkspacePath
  createRemoteDirectory?: typeof createRemoteBranchWorkspaceDirectory
  materializeRemoteSymlink?: typeof materializeRemoteBranchWorkspaceSymlink
  copyRemoteEntry?: typeof copyRemoteBranchWorkspaceEntry
  fingerprintRemoteEntry?: typeof fingerprintRemoteBranchWorkspaceEntry
  removeRemoteEntry?: typeof removeRemoteBranchWorkspaceEntry
  listRemoteChildren?: typeof listRemoteBranchWorkspaceChildren
}

export async function listBranchWorkspaceAuxiliaryCandidates(
  rootId: string,
  excludedNames: ReadonlySet<string>,
  signal?: AbortSignal,
  dependencies: BranchWorkspaceMaterializationDependencies = {},
): Promise<BranchWorkspaceAuxiliaryCandidate[]> {
  signal?.throwIfAborted()
  const rootPath = requiredRootPath(rootId)
  if (isRemoteRepoId(rootId)) {
    const target = await resolveMaterializationRemoteTarget(rootId, signal, dependencies)
    return await (dependencies.listRemoteCandidates ?? listRemoteBranchWorkspaceAuxiliaryCandidates)(
      target,
      rootPath,
      excludedNames,
      { signal },
    )
  }
  const names = await readdir(rootPath)
  const excludedWorktreePaths = await listResolvedLocalWorktreePaths(rootPath, excludedNames, signal)
  const candidates: BranchWorkspaceAuxiliaryCandidate[] = []
  for (const name of names.sort(compareText)) {
    signal?.throwIfAborted()
    if (excludedNames.has(name) || isManagedBranchWorkspaceEntryName(name)) continue
    const inspection = await inspectLocalPath(rootPath, path.join(rootPath, name))
    if (!inspection.exists || inspection.kind === 'missing') continue
    if (inspection.resolvedPath && excludedWorktreePaths.has(inspection.resolvedPath)) continue
    candidates.push({
      name,
      path: inspection.path,
      kind: inspection.kind,
      ...(inspection.resolvedPath ? { resolvedPath: inspection.resolvedPath } : {}),
      outsideRoot: inspection.outsideRoot,
    })
  }
  return candidates
}

async function listResolvedLocalWorktreePaths(
  rootPath: string,
  repositoryNames: ReadonlySet<string>,
  signal?: AbortSignal,
): Promise<Set<string>> {
  const worktreeGroups = await Promise.all(
    [...repositoryNames].map(async (repositoryName) => {
      signal?.throwIfAborted()
      const repositoryPath = path.join(rootPath, repositoryName)
      const worktrees = await getWorktrees(repositoryPath, { includeStatus: false, signal })
      return await Promise.all(
        worktrees.map(async (worktree) => await realpath(worktree.path).catch(() => path.resolve(worktree.path))),
      )
    }),
  )
  signal?.throwIfAborted()
  return new Set(worktreeGroups.flat())
}

export async function inspectBranchWorkspacePath(
  rootId: string,
  candidatePath: string,
  signal?: AbortSignal,
  dependencies: BranchWorkspaceMaterializationDependencies = {},
): Promise<BranchWorkspacePathInspection> {
  signal?.throwIfAborted()
  const rootPath = requiredRootPath(rootId)
  if (isRemoteRepoId(rootId)) {
    const target = await resolveMaterializationRemoteTarget(rootId, signal, dependencies)
    return await (dependencies.inspectRemotePath ?? inspectRemoteBranchWorkspacePath)(target, rootPath, candidatePath, {
      signal,
    })
  }
  return await inspectLocalPath(rootPath, candidatePath)
}

export async function createBranchWorkspaceDirectory(
  rootId: string,
  targetPath: string,
  signal?: AbortSignal,
  dependencies: BranchWorkspaceMaterializationDependencies = {},
): Promise<void> {
  signal?.throwIfAborted()
  const rootPath = requiredRootPath(rootId)
  if (isRemoteRepoId(rootId)) {
    const target = await resolveMaterializationRemoteTarget(rootId, signal, dependencies)
    await (dependencies.createRemoteDirectory ?? createRemoteBranchWorkspaceDirectory)(target, rootPath, targetPath, {
      signal,
    })
    return
  }
  await assertSafeTargetParents(rootPath, targetPath)
  if (
    path.dirname(path.resolve(targetPath)) !== path.resolve(rootPath) ||
    !isBranchWorkspaceDirectoryName(path.basename(targetPath))
  ) {
    throw new Error('workspace.branch-workspace.invalid-path')
  }
  await mkdir(targetPath)
}

export async function materializeBranchWorkspaceSymlink(
  rootId: string,
  sourcePath: string,
  targetPath: string,
  signal?: AbortSignal,
  dependencies: BranchWorkspaceMaterializationDependencies = {},
): Promise<void> {
  signal?.throwIfAborted()
  const rootPath = requiredRootPath(rootId)
  if (isRemoteRepoId(rootId)) {
    const target = await resolveMaterializationRemoteTarget(rootId, signal, dependencies)
    await (dependencies.materializeRemoteSymlink ?? materializeRemoteBranchWorkspaceSymlink)(
      target,
      rootPath,
      sourcePath,
      targetPath,
      { signal },
    )
    return
  }
  assertDirectChildSource(rootPath, sourcePath)
  await assertSafeTargetParents(rootPath, targetPath)
  await symlinkAbsolute(sourcePath, targetPath)
}

export async function copyBranchWorkspaceEntry(
  rootId: string,
  sourcePath: string,
  targetPath: string,
  signal?: AbortSignal,
  dependencies: BranchWorkspaceMaterializationDependencies = {},
): Promise<void> {
  signal?.throwIfAborted()
  const rootPath = requiredRootPath(rootId)
  if (isRemoteRepoId(rootId)) {
    const target = await resolveMaterializationRemoteTarget(rootId, signal, dependencies)
    await (dependencies.copyRemoteEntry ?? copyRemoteBranchWorkspaceEntry)(target, rootPath, sourcePath, targetPath, {
      signal,
    })
    return
  }
  assertDirectChildSource(rootPath, sourcePath)
  await assertSafeTargetParents(rootPath, targetPath)
  const sourceStat = await lstat(sourcePath)
  const copySource = sourceStat.isSymbolicLink() ? await realpath(sourcePath) : sourcePath
  signal?.throwIfAborted()
  await cp(copySource, targetPath, {
    recursive: true,
    dereference: false,
    errorOnExist: true,
    force: false,
    preserveTimestamps: true,
    verbatimSymlinks: true,
  })
}

export async function fingerprintBranchWorkspaceEntry(
  rootId: string,
  targetPath: string,
  signal?: AbortSignal,
  dependencies: BranchWorkspaceMaterializationDependencies = {},
): Promise<string> {
  signal?.throwIfAborted()
  const rootPath = requiredRootPath(rootId)
  if (isRemoteRepoId(rootId)) {
    const target = await resolveMaterializationRemoteTarget(rootId, signal, dependencies)
    return await (dependencies.fingerprintRemoteEntry ?? fingerprintRemoteBranchWorkspaceEntry)(
      target,
      rootPath,
      targetPath,
      { signal },
    )
  }
  await assertSafeTargetParents(rootPath, targetPath)
  const hash = createHash('sha256')
  await hashLocalEntry(hash, targetPath, '.', signal)
  return hash.digest('hex')
}

export async function removeBranchWorkspaceEntry(
  rootId: string,
  targetPath: string,
  signal?: AbortSignal,
  dependencies: BranchWorkspaceMaterializationDependencies = {},
): Promise<void> {
  signal?.throwIfAborted()
  const rootPath = requiredRootPath(rootId)
  if (isRemoteRepoId(rootId)) {
    const target = await resolveMaterializationRemoteTarget(rootId, signal, dependencies)
    await (dependencies.removeRemoteEntry ?? removeRemoteBranchWorkspaceEntry)(target, rootPath, targetPath, {
      signal,
    })
    return
  }
  await assertSafeTargetParents(rootPath, targetPath)
  await removeLocalEntryNoFollow(targetPath, signal)
}

export async function listBranchWorkspaceChildren(
  rootId: string,
  targetPath: string,
  signal?: AbortSignal,
  dependencies: BranchWorkspaceMaterializationDependencies = {},
): Promise<string[]> {
  signal?.throwIfAborted()
  const rootPath = requiredRootPath(rootId)
  if (isRemoteRepoId(rootId)) {
    const target = await resolveMaterializationRemoteTarget(rootId, signal, dependencies)
    return await (dependencies.listRemoteChildren ?? listRemoteBranchWorkspaceChildren)(target, rootPath, targetPath, {
      signal,
    })
  }
  await assertSafeTargetParents(rootPath, targetPath)
  const targetStat = await lstat(targetPath)
  if (!targetStat.isDirectory() || targetStat.isSymbolicLink()) {
    throw new Error('workspace.branch-workspace.not-directory')
  }
  return (await readdir(targetPath)).sort(compareText)
}

async function inspectLocalPath(rootPath: string, candidatePath: string): Promise<BranchWorkspacePathInspection> {
  const normalizedRoot = path.resolve(rootPath)
  const normalizedPath = path.resolve(candidatePath)
  assertLexicallyInside(normalizedRoot, normalizedPath, true)
  const relative = path.relative(normalizedRoot, normalizedPath)
  const directChild = relative.length > 0 && !relative.includes(path.sep)
  let stat: Awaited<ReturnType<typeof lstat>>
  try {
    stat = await lstat(normalizedPath)
  } catch (error) {
    if (!isErrno(error, 'ENOENT')) throw error
    return {
      path: normalizedPath,
      exists: false,
      kind: 'missing',
      directChild,
      outsideRoot: false,
    }
  }

  const resolvedPath = await realpath(normalizedPath).catch((error: unknown) => {
    if (isErrno(error, 'ENOENT')) return undefined
    throw error
  })
  const linkTarget = stat.isSymbolicLink() ? await readlink(normalizedPath) : undefined
  const resolvedRoot = await realpath(normalizedRoot)
  return {
    path: normalizedPath,
    exists: true,
    kind: pathKind(stat),
    ...(resolvedPath ? { resolvedPath } : {}),
    ...(linkTarget ? { linkTarget } : {}),
    directChild,
    outsideRoot: resolvedPath ? !isPathWithin(resolvedRoot, resolvedPath, true) : false,
  }
}

async function assertSafeTargetParents(rootPath: string, targetPath: string): Promise<void> {
  const normalizedRoot = path.resolve(rootPath)
  const normalizedTarget = path.resolve(targetPath)
  assertLexicallyInside(normalizedRoot, normalizedTarget, false)
  const relative = path.relative(normalizedRoot, normalizedTarget)
  const segments = relative.split(path.sep)
  let current = normalizedRoot
  for (const segment of segments.slice(0, -1)) {
    current = path.join(current, segment)
    const stat = await lstat(current).catch((error: unknown) => {
      if (isErrno(error, 'ENOENT')) throw new Error('workspace.branch-workspace.invalid-path')
      throw error
    })
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error('workspace.branch-workspace.invalid-path')
    }
  }
}

function assertDirectChildSource(rootPath: string, sourcePath: string): void {
  const normalizedRoot = path.resolve(rootPath)
  const normalizedSource = path.resolve(sourcePath)
  const relative = path.relative(normalizedRoot, normalizedSource)
  if (!relative || relative.includes(path.sep) || relative === '..' || path.isAbsolute(relative)) {
    throw new Error('workspace.branch-workspace.invalid-source')
  }
}

function assertLexicallyInside(rootPath: string, candidatePath: string, allowRoot: boolean): void {
  if (!isPathWithin(rootPath, candidatePath, allowRoot)) {
    throw new Error('workspace.branch-workspace.invalid-path')
  }
}

function isPathWithin(rootPath: string, candidatePath: string, allowRoot: boolean): boolean {
  const relative = path.relative(rootPath, candidatePath)
  if (!relative) return allowRoot
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

async function hashLocalEntry(
  hash: ReturnType<typeof createHash>,
  targetPath: string,
  relativePath: string,
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted()
  const stat = await lstat(targetPath)
  const kind = pathKind(stat)
  hashField(hash, relativePath)
  hashField(hash, kind)
  hashField(hash, String(stat.mode & 0o7777))
  if (kind === 'symlink') {
    hashField(hash, await readlink(targetPath))
    return
  }
  if (kind === 'file') {
    for await (const chunk of createReadStream(targetPath)) {
      signal?.throwIfAborted()
      hash.update(chunk)
    }
    return
  }
  if (kind !== 'directory') return
  const names = (await readdir(targetPath)).sort(compareText)
  for (const name of names) {
    const childRelative = relativePath === '.' ? name : path.posix.join(relativePath, name)
    await hashLocalEntry(hash, path.join(targetPath, name), childRelative, signal)
  }
}

function hashField(hash: ReturnType<typeof createHash>, value: string): void {
  hash.update(`${Buffer.byteLength(value)}:`)
  hash.update(value)
}

async function removeLocalEntryNoFollow(targetPath: string, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted()
  let stat: Awaited<ReturnType<typeof lstat>>
  try {
    stat = await lstat(targetPath)
  } catch (error) {
    if (isErrno(error, 'ENOENT')) return
    throw error
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    await unlink(targetPath)
    return
  }
  for (const name of (await readdir(targetPath)).sort(compareText)) {
    await removeLocalEntryNoFollow(path.join(targetPath, name), signal)
  }
  await rmdir(targetPath)
}

async function symlinkAbsolute(sourcePath: string, targetPath: string): Promise<void> {
  await symlink(path.resolve(sourcePath), targetPath)
}

function requiredRootPath(rootId: string): string {
  const rootPath = workspaceRepositoryPath(rootId)
  if (!rootPath) throw new Error('workspace.branch-workspace.invalid-root')
  return rootPath
}

async function resolveMaterializationRemoteTarget(
  rootId: string,
  signal: AbortSignal | undefined,
  dependencies: BranchWorkspaceMaterializationDependencies,
): Promise<RemoteRepoTarget> {
  const ref = parseRemoteRepoId(rootId)
  if (!ref) throw new Error('workspace.branch-workspace.invalid-root')
  return (await (dependencies.resolveRemoteTarget ?? resolveRepositoryRemoteTarget)(ref, signal)).target
}

function pathKind(stat: Awaited<ReturnType<typeof lstat>>): Exclude<BranchWorkspacePathKind, 'missing'> {
  if (stat.isSymbolicLink()) return 'symlink'
  if (stat.isDirectory()) return 'directory'
  if (stat.isFile()) return 'file'
  return 'other'
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function isErrno(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code
}
