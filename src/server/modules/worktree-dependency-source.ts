import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import {
  access,
  open,
  lstat,
  mkdir,
  readdir,
  readlink,
  realpath,
  rmdir,
  stat,
  symlink,
  unlink,
  chmod,
} from 'node:fs/promises'
import path from 'node:path'
import { git } from '#/system/git/helper.ts'
import { getWorktrees } from '#/system/git/worktrees.ts'
import { resolveRepositoryRemoteTarget } from '#/system/remote/target.ts'
import { runRemoteCommand } from '#/system/ssh/commands.ts'
import { isRemoteRepoId, parseRemoteRepoId } from '#/shared/remote-repo.ts'
import { isValidCwd, isValidRepoLocator } from '#/shared/input-validation.ts'
import type {
  WorktreeDependencyCandidate,
  WorktreeDependencyPlanEntry,
  WorktreeDependencyReadInput,
} from '#/shared/worktree-dependencies.ts'
import type { WorktreeDependencyCommand } from '#/system/ssh/worktree-dependency-script.ts'

export interface WorktreeDependencyInspection {
  repoPath: string
  targetRoot: string
  sourceRoot: string
  identity: string
  candidates: WorktreeDependencyCandidate[]
}

interface EntryMetadata {
  kind: 'file' | 'directory' | 'symlink'
  dev: number
  ino: number
  mode: number
  size: number
  mtime: number
  ctime: number
  link?: string
}
interface EntrySnapshot {
  fingerprint: string
  entries: Map<string, EntryMetadata>
}
const MAX_TREE_ENTRIES = 100_000
const MAX_ROOT_ENTRIES = 10_000
const MAX_TREE_DEPTH = 64

export function dependencyName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 255 &&
    value !== '.' &&
    value !== '..' &&
    value.toLowerCase() !== '.git' &&
    !/[\\/\x00-\x1f\x7f]/.test(value)
  )
}

export function dependencyError(error: unknown, fallback = 'failed'): string {
  if (
    error instanceof Error &&
    (error.name === 'AbortError' || error.name === 'TimeoutError' || error.message === 'cancelled')
  )
    return 'worktree-dependencies.cancelled'
  const message = error instanceof Error ? error.message : ''
  return /^worktree-dependencies\.[a-z-]+$/.test(message) ? message : `worktree-dependencies.${fallback}`
}

export async function inspectWorktreeDependencies(
  input: WorktreeDependencyReadInput,
  signal?: AbortSignal,
): Promise<WorktreeDependencyInspection> {
  validateInput(input)
  signal?.throwIfAborted()
  if (isRemoteRepoId(input.repoId))
    return await remote<WorktreeDependencyInspection>(input, { action: 'inspect' }, signal)
  const [repoRoot, targetRoot] = await Promise.all([
    realpath(input.repoId).catch(() => fail('invalid-target')),
    realpath(input.worktreePath).catch(() => fail('invalid-target')),
  ])
  const targetInfo = await lstat(targetRoot)
  if (!targetInfo.isDirectory() || targetInfo.isSymbolicLink()) fail('invalid-target')
  const worktrees = await getWorktrees(repoRoot, { includeStatus: false, throwOnError: true, signal })
  let found = false
  for (const worktree of worktrees) {
    if (worktree.isBare || worktree.isPrunable) continue
    if (samePath(await realpath(worktree.path).catch(() => ''), targetRoot)) {
      found = true
      break
    }
  }
  if (!found) fail('invalid-target')
  const gitTop = await git(targetRoot, ['rev-parse', '--show-toplevel'], { signal })
  if (!samePath(await realpath(gitTop), targetRoot)) fail('invalid-target')
  const commonPath = await git(targetRoot, ['rev-parse', '--path-format=absolute', '--git-common-dir'], { signal })
  const commonReal = await realpath(commonPath)
  const commonInfo = await lstat(commonReal)
  const sourceRoot =
    input.operation === 'remove'
      ? targetRoot
      : await realpath(input.sourceWorktreePath ?? input.repoId).catch(() => fail('invalid-source'))
  const sourceInfo = await lstat(sourceRoot)
  if (!sourceInfo.isDirectory() || sourceInfo.isSymbolicLink()) fail('invalid-source')
  await access(sourceRoot, constants.R_OK)
  if (input.operation === 'add' && (inside(sourceRoot, targetRoot) || inside(targetRoot, sourceRoot)))
    fail('invalid-source')
  const [sourceTracked, targetTracked] = await Promise.all([
    trackedNames(sourceRoot, signal),
    trackedNames(targetRoot, signal),
  ])
  const names = (await readdir(sourceRoot)).sort()
  if (names.length > MAX_ROOT_ENTRIES) fail('failed')
  const candidates: WorktreeDependencyCandidate[] = []
  for (const name of names) {
    signal?.throwIfAborted()
    if (!dependencyName(name) || sourceTracked.has(name.toLowerCase()) || targetTracked.has(name.toLowerCase()))
      continue
    const sourcePath = path.join(sourceRoot, name)
    const info = await lstat(sourcePath).catch(() => null)
    const kind = info && kindOf(info)
    if (!kind || (await isRepositoryDirectory(sourcePath, signal))) continue
    const targetPath = path.join(targetRoot, name)
    candidates.push({ path: name, kind, targetPath, targetExists: await exists(targetPath) })
  }
  return {
    repoPath: repoRoot,
    targetRoot,
    sourceRoot,
    identity: JSON.stringify([
      repoRoot,
      targetRoot,
      sourceRoot,
      identityOf(targetInfo),
      identityOf(sourceInfo),
      commonReal,
      identityOf(commonInfo),
    ]),
    candidates,
  }
}

export async function fingerprintWorktreeDependency(
  input: WorktreeDependencyReadInput,
  inspection: WorktreeDependencyInspection,
  name: string,
  signal?: AbortSignal,
  mode?: 'copy' | 'symlink',
): Promise<string> {
  if (!dependencyName(name)) fail('invalid-source')
  if (isRemoteRepoId(input.repoId))
    return await remote<string>(input, { action: 'fingerprint', name, identity: inspection.identity, mode }, signal)
  const current = await inspectWorktreeDependencies(input, signal)
  assertIdentity(current, inspection.identity)
  if (!current.candidates.some((candidate) => candidate.path === name)) fail('tracked')
  return (
    await snapshotEntry(path.join(current.sourceRoot, name), signal, input.operation === 'add' && mode === 'symlink')
  ).fingerprint
}

export async function applyWorktreeDependency(
  input: WorktreeDependencyReadInput,
  inspection: WorktreeDependencyInspection,
  entry: WorktreeDependencyPlanEntry,
  fingerprint: string,
  signal?: AbortSignal,
): Promise<void> {
  if (!dependencyName(entry.path)) fail('invalid-source')
  if (isRemoteRepoId(input.repoId)) {
    await remote(
      input,
      { action: input.operation, name: entry.path, identity: inspection.identity, fingerprint, mode: entry.mode },
      signal,
    )
    return
  }
  const current = await inspectWorktreeDependencies(input, signal)
  assertIdentity(current, inspection.identity)
  const candidate = current.candidates.find((item) => item.path === entry.path)
  if (!candidate) fail('tracked')
  const source = path.join(current.sourceRoot, entry.path)
  const target = path.join(current.targetRoot, entry.path)
  const snapshot = await snapshotEntry(source, signal, input.operation === 'add' && entry.mode === 'symlink')
  if (snapshot.fingerprint !== fingerprint) fail('plan-stale')
  const parentIdentity = identityOf(await lstat(current.targetRoot))
  const sourceIdentity = identityOf(await lstat(current.sourceRoot))
  const indexes = await Promise.all([
    readIndexStamp(current.targetRoot, signal),
    readIndexStamp(current.sourceRoot, signal),
  ])
  const [sourceTracked, targetTracked] = await Promise.all([
    trackedNames(current.sourceRoot, signal),
    trackedNames(current.targetRoot, signal),
  ])
  if (sourceTracked.has(entry.path.toLowerCase()) || targetTracked.has(entry.path.toLowerCase())) fail('tracked')
  const assertRoot = async () => {
    signal?.throwIfAborted()
    const info = await lstat(current.targetRoot)
    if (
      info.isSymbolicLink() ||
      identityOf(info) !== parentIdentity ||
      !samePath(await realpath(current.targetRoot), current.targetRoot)
    )
      fail('plan-stale')
    const sourceInfo = await lstat(current.sourceRoot)
    if (
      sourceInfo.isSymbolicLink() ||
      identityOf(sourceInfo) !== sourceIdentity ||
      !samePath(await realpath(current.sourceRoot), current.sourceRoot)
    )
      fail('plan-stale')
    for (const index of indexes) if (index && (await fileStamp(index.path)) !== index.stamp) fail('plan-stale')
  }
  await assertRoot()
  if (input.operation === 'remove') {
    await removeSnapshot(target, snapshot, assertRoot, signal)
    return
  }
  if (await exists(target)) fail('target-exists')
  if (entry.mode === 'symlink') {
    const sourceType = await stat(source).catch(() => null)
    await symlink(
      source,
      target,
      sourceType?.isDirectory() ? (process.platform === 'win32' ? 'junction' : 'dir') : 'file',
    )
    return
  }
  if (entry.mode !== 'copy') fail('invalid-source')
  await copySnapshot(source, target, snapshot, assertRoot, signal)
}

async function snapshotEntry(root: string, signal?: AbortSignal, shallow = false): Promise<EntrySnapshot> {
  const entries = new Map<string, EntryMetadata>()
  const walk = async (absolute: string, relative: string, depth: number): Promise<void> => {
    signal?.throwIfAborted()
    if (entries.size >= MAX_TREE_ENTRIES || depth > MAX_TREE_DEPTH) fail('failed')
    const info = await lstat(absolute)
    const kind = kindOf(info)
    if (!kind) fail('invalid-source')
    const entry: EntryMetadata = {
      kind,
      dev: info.dev,
      ino: info.ino,
      mode: info.mode,
      size: info.size,
      mtime: info.mtimeMs,
      ctime: info.ctimeMs,
    }
    if (kind === 'symlink') entry.link = await readlink(absolute)
    entries.set(relative, entry)
    if (kind !== 'directory' || shallow) return
    const names = (await readdir(absolute)).sort()
    if (
      names.some((name) => name.toLowerCase() === '.git') ||
      (names.includes('HEAD') && names.includes('objects') && names.includes('refs'))
    )
      fail('invalid-source')
    for (const name of names) await walk(path.join(absolute, name), relative ? `${relative}/${name}` : name, depth + 1)
  }
  await walk(root, '', 0)
  return {
    entries,
    fingerprint: createHash('sha256')
      .update(JSON.stringify([...entries]))
      .digest('hex'),
  }
}

async function copySnapshot(
  source: string,
  target: string,
  snapshot: EntrySnapshot,
  assertRoot: () => Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  const createdDirectories = new Map<string, string>()
  for (const [relative, expected] of snapshot.entries) {
    signal?.throwIfAborted()
    await assertRoot()
    const sourcePath = relative ? path.join(source, ...relative.split('/')) : source
    const destination = relative ? path.join(target, ...relative.split('/')) : target
    await assertSnapshotEntry(sourcePath, expected)
    await assertParents(source, relative, snapshot.entries)
    if (relative) await assertCreatedParents(target, relative, createdDirectories)
    if (expected.kind === 'directory') {
      await mkdir(destination, { mode: (expected.mode & 0o777) | 0o700 })
      createdDirectories.set(relative, identityOf(await lstat(destination)))
    } else if (expected.kind === 'symlink') {
      const link = path.resolve(path.dirname(sourcePath), expected.link!)
      const linkInfo = await stat(sourcePath).catch(() => null)
      await symlink(
        link,
        destination,
        linkInfo?.isDirectory() ? (process.platform === 'win32' ? 'junction' : 'dir') : 'file',
      )
    } else {
      const sourceFile = await open(sourcePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
      try {
        const opened = await sourceFile.stat()
        if (
          opened.dev !== expected.dev ||
          opened.ino !== expected.ino ||
          opened.size !== expected.size ||
          opened.mtimeMs !== expected.mtime
        )
          fail('plan-stale')
        const destinationFile = await open(destination, 'wx', expected.mode & 0o777)
        try {
          const buffer = Buffer.allocUnsafe(256 * 1024)
          while (true) {
            signal?.throwIfAborted()
            const { bytesRead } = await sourceFile.read(buffer, 0, buffer.length, null)
            if (!bytesRead) break
            let offset = 0
            while (offset < bytesRead) {
              signal?.throwIfAborted()
              const { bytesWritten } = await destinationFile.write(buffer, offset, bytesRead - offset, null)
              if (!bytesWritten) fail('failed')
              offset += bytesWritten
            }
          }
          await destinationFile.chmod(expected.mode & 0o777)
          await destinationFile.utimes(new Date(expected.mtime), new Date(expected.mtime))
        } finally {
          await destinationFile.close()
        }
      } finally {
        await sourceFile.close()
      }
      await assertSnapshotEntry(sourcePath, expected)
    }
  }
  for (const [relative, expected] of [...snapshot.entries].reverse()) {
    if (expected.kind === 'directory') {
      await assertRoot()
      await assertCreatedParents(target, relative, createdDirectories)
      const destination = relative ? path.join(target, ...relative.split('/')) : target
      const current = await lstat(destination)
      if (
        !current.isDirectory() ||
        current.isSymbolicLink() ||
        identityOf(current) !== createdDirectories.get(relative)
      )
        fail('plan-stale')
      await chmod(destination, expected.mode & 0o777)
    }
  }
}

async function removeSnapshot(
  root: string,
  snapshot: EntrySnapshot,
  assertRoot: () => Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  for (const [relative, expected] of [...snapshot.entries].reverse()) {
    signal?.throwIfAborted()
    await assertRoot()
    await assertParents(root, relative, snapshot.entries)
    const absolute = relative ? path.join(root, ...relative.split('/')) : root
    const current = await lstat(absolute)
    if (
      identityOf(current) !== JSON.stringify([expected.dev, expected.ino, expected.mode]) ||
      kindOf(current) !== expected.kind
    )
      fail('plan-stale')
    if (expected.kind === 'directory') await rmdir(absolute)
    else {
      await assertSnapshotEntry(absolute, expected)
      await unlink(absolute)
    }
  }
}

async function assertSnapshotEntry(absolute: string, expected: EntryMetadata): Promise<void> {
  const info = await lstat(absolute)
  if (
    info.dev !== expected.dev ||
    info.ino !== expected.ino ||
    info.mode !== expected.mode ||
    info.size !== expected.size ||
    info.mtimeMs !== expected.mtime ||
    info.ctimeMs !== expected.ctime
  )
    fail('plan-stale')
  if (expected.kind === 'symlink' && (await readlink(absolute)) !== expected.link) fail('plan-stale')
}
async function assertParents(
  root: string,
  relative: string,
  entries: ReadonlyMap<string, EntryMetadata>,
): Promise<void> {
  const parts = relative.split('/').filter(Boolean)
  for (let count = 0; count < parts.length; count++) {
    const rel = parts.slice(0, count).join('/')
    const expected = entries.get(rel)
    const current = await lstat(rel ? path.join(root, ...parts.slice(0, count)) : root)
    if (
      !expected ||
      current.isSymbolicLink() ||
      !current.isDirectory() ||
      current.dev !== expected.dev ||
      current.ino !== expected.ino
    )
      fail('plan-stale')
  }
}
async function assertCreatedParents(
  root: string,
  relative: string,
  entries: ReadonlyMap<string, string>,
): Promise<void> {
  const parts = relative.split('/').filter(Boolean)
  for (let count = 0; count < parts.length; count++) {
    const rel = parts.slice(0, count).join('/')
    const current = await lstat(rel ? path.join(root, ...parts.slice(0, count)) : root)
    if (current.isSymbolicLink() || !current.isDirectory() || entries.get(rel) !== identityOf(current))
      fail('plan-stale')
  }
}
async function fileStamp(absolute: string): Promise<string> {
  const info = await lstat(absolute).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  return info ? JSON.stringify([info.dev, info.ino, info.mode, info.size, info.mtimeMs, info.ctimeMs]) : 'missing'
}
async function readIndexStamp(root: string, signal?: AbortSignal): Promise<{ path: string; stamp: string } | null> {
  try {
    const filename = await git(root, ['rev-parse', '--path-format=absolute', '--git-path', 'index'], { signal })
    return { path: filename, stamp: await fileStamp(filename) }
  } catch (error) {
    signal?.throwIfAborted()
    if (String((error as { stderr?: string }).stderr ?? '').includes('not a git repository')) return null
    throw error
  }
}
async function trackedNames(root: string, signal?: AbortSignal): Promise<Set<string>> {
  try {
    const value = await git(root, ['-c', 'core.fsmonitor=false', 'ls-files', '-z'], {
      signal,
      env: { GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' },
    })
    return new Set(
      value
        .split('\0')
        .filter(Boolean)
        .map((name) => name.split('/')[0]!.toLowerCase()),
    )
  } catch (error) {
    signal?.throwIfAborted()
    if (String((error as { stderr?: string }).stderr ?? '').includes('not a git repository')) return new Set()
    throw error
  }
}
async function isRepositoryDirectory(absolute: string, signal?: AbortSignal): Promise<boolean> {
  const info = await stat(absolute).catch(() => null)
  if (!info?.isDirectory()) return false
  if (await exists(path.join(absolute, '.git'))) return true
  if (
    (await exists(path.join(absolute, 'HEAD'))) &&
    (await exists(path.join(absolute, 'objects'))) &&
    (await exists(path.join(absolute, 'refs')))
  )
    return true
  signal?.throwIfAborted()
  return false
}
function kindOf(info: Awaited<ReturnType<typeof lstat>>): EntryMetadata['kind'] | null {
  return info.isSymbolicLink() ? 'symlink' : info.isDirectory() ? 'directory' : info.isFile() ? 'file' : null
}
function identityOf(info: Awaited<ReturnType<typeof lstat>>): string {
  return JSON.stringify([info.dev, info.ino, info.mode])
}
function samePath(left: string, right: string): boolean {
  return process.platform === 'win32'
    ? path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase()
    : path.resolve(left) === path.resolve(right)
}
function inside(root: string, candidate: string): boolean {
  const rel = path.relative(root, candidate)
  return !rel || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel))
}
async function exists(value: string): Promise<boolean> {
  try {
    await lstat(value)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}
function assertIdentity(value: WorktreeDependencyInspection, expected: string): void {
  if (value.identity !== expected) fail('plan-stale')
}
function fail(code: string): never {
  throw new Error(`worktree-dependencies.${code}`)
}
function validateInput(input: WorktreeDependencyReadInput): void {
  if (
    !input ||
    !isValidRepoLocator(input.repoId) ||
    !isValidCwd(input.worktreePath) ||
    !['add', 'remove'].includes(input.operation)
  )
    fail('invalid-target')
  const api = isRemoteRepoId(input.repoId) ? path.posix : path
  if (!api.isAbsolute(input.worktreePath)) fail('invalid-target')
  if (
    input.operation === 'add' &&
    input.sourceWorktreePath !== undefined &&
    (!isValidCwd(input.sourceWorktreePath) || !api.isAbsolute(input.sourceWorktreePath))
  )
    fail('invalid-source')
}
async function remote<T>(
  input: WorktreeDependencyReadInput,
  action: Omit<WorktreeDependencyCommand, 'type' | 'repoPath' | 'worktreePath' | 'sourceWorktreePath' | 'operation'>,
  signal?: AbortSignal,
): Promise<T> {
  const ref = parseRemoteRepoId(input.repoId)
  if (!ref) fail('invalid-target')
  const { target } = await resolveRepositoryRemoteTarget(ref)
  const result = await runRemoteCommand(
    target,
    {
      type: 'worktreeDependency',
      repoPath: ref.remotePath,
      worktreePath: input.worktreePath,
      sourceWorktreePath: input.sourceWorktreePath,
      operation: input.operation,
      ...action,
    },
    { signal, timeoutMs: 600_000, maxBuffer: 8 * 1024 * 1024 },
  )
  if (!result.ok) {
    signal?.throwIfAborted()
    fail('failed')
  }
  const reply = JSON.parse(result.stdout) as { ok: boolean; value?: T; message?: string }
  if (!reply.ok) throw new Error(reply.message ?? 'worktree-dependencies.failed')
  return reply.value as T
}
