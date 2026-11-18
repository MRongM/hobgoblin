import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { chmod, copyFile, lstat, link, unlink, mkdir, readlink, readdir, rm, symlink } from 'node:fs/promises'
import path from 'node:path'
import { resolveGitExecutable } from '#/system/git/executable.ts'
import {
  isWorkspaceSnapshotRelativePath,
  type WorkspaceSnapshotExport,
  type WorkspaceSnapshotEntry,
} from '#/shared/branch-workspace-clone.ts'

/** Snapshot Git never inherits user hooks, filters, credential helpers, or templates. */
export async function snapshotGit(root: string, args: string[], signal?: AbortSignal): Promise<Buffer> {
  const executable = resolveGitExecutable()
  if (!executable) throw new Error('Git executable is unavailable')
  signal?.throwIfAborted()
  const env: NodeJS.ProcessEnv = { ...process.env }
  for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key]
  Object.assign(env, {
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null',
    GIT_TERMINAL_PROMPT: '0',
    GIT_OPTIONAL_LOCKS: '0',
  })
  return await new Promise((resolve, reject) => {
    const child = spawn(
      executable,
      [
        '-c',
        'core.hooksPath=' + (process.platform === 'win32' ? 'NUL' : '/dev/null'),
        '-c',
        'core.autocrlf=false',
        '-c',
        'core.safecrlf=false',
        '-c',
        'core.fsmonitor=false',
        '-C',
        root,
        ...args,
      ],
      { env, signal, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
    )
    const chunks: Buffer[] = []
    const errors: Buffer[] = []
    let size = 0
    let tooLarge = false
    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > 8 * 1024 * 1024) {
        tooLarge = true
        child.kill()
        return
      }
      chunks.push(chunk)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      if (errors.reduce((sum, item) => sum + item.length, 0) < 8192) errors.push(chunk)
    })
    const timeout = setTimeout(() => child.kill('SIGKILL'), 600_000)
    const abortKill = () => {
      const timer = setTimeout(() => child.kill('SIGKILL'), 500)
      timer.unref()
    }
    signal?.addEventListener('abort', abortKill, { once: true })
    child.once('error', reject)
    child.once('close', (code) => {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', abortKill)
      if (tooLarge) reject(new Error('Snapshot Git metadata exceeds the 8 MiB limit'))
      else if (code !== 0)
        reject(new Error(Buffer.concat(errors).toString('utf8').trim() || 'Git snapshot restore failed'))
      else resolve(Buffer.concat(chunks))
    })
  })
}

export function validateSnapshotDestinationEntries(entries: WorkspaceSnapshotEntry[]): void {
  const seen = new Set<string>()
  for (const entry of entries) {
    if (!isWorkspaceSnapshotRelativePath(entry.path)) throw new Error('Unsafe snapshot path')
    const key = process.platform === 'linux' ? entry.path : entry.path.normalize('NFC').toLowerCase()
    if (seen.has(key)) throw new Error('Source paths collide on the destination filesystem: ' + entry.path)
    seen.add(key)
    if (
      process.platform === 'win32' &&
      entry.path
        .split('/')
        .some(
          (part) => /[<>:"|?*\x00-\x1f]|[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part),
        )
    )
      throw new Error('Source path is not representable on Windows: ' + entry.path)
    if (entry.kind === 'symlink') {
      const target = entry.linkTarget ?? ''
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(entry.path), target))
      if (
        !target ||
        target.includes('\\') ||
        path.posix.isAbsolute(target) ||
        resolved === '..' ||
        resolved.startsWith('../')
      )
        throw new Error('Symbolic link escapes snapshot: ' + entry.path)
    }
  }
}

export async function restoreWorkspaceSnapshotFiles(
  root: string,
  artifacts: string,
  snapshot: WorkspaceSnapshotExport,
  signal: AbortSignal,
): Promise<void> {
  validateSnapshotDestinationEntries(snapshot.entries)
  // Remove tracked paths absent from the working tree (including staged-added then deleted files).
  const present = new Set(snapshot.entries.map((entry) => entry.path))
  for (const rel of snapshot.repository?.trackedPaths ?? []) {
    if (!isWorkspaceSnapshotRelativePath(rel)) throw new Error('Invalid tracked path')
    if (!present.has(rel)) {
      const destination = path.join(root, ...rel.split('/'))
      const exists = await lstat(destination).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null
        throw error
      })
      if (!exists) continue
      await safeParents(root, rel, false)
      if (!exists.isDirectory()) await rm(destination, { force: true })
    }
  }
  for (const entry of [...snapshot.entries].sort((a, b) => a.path.split('/').length - b.path.split('/').length)) {
    signal.throwIfAborted()
    await safeParents(root, entry.path)
    const destination = path.join(root, ...entry.path.split('/'))
    const current = await lstat(destination).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null
      throw error
    })
    if (entry.kind === 'directory') {
      if (current && !current.isDirectory()) await rm(destination)
      await mkdir(destination, { recursive: true })
      continue
    }
    if (current?.isDirectory()) await removeEmptyDirectories(destination)
    else if (current) await rm(destination)
    if (entry.kind === 'symlink') await symlink(entry.linkTarget!, destination)
    else {
      if (!entry.artifact || entry.artifact.sha256 !== entry.sha256 || entry.artifact.size !== entry.size)
        throw new Error('Snapshot file artifact mismatch')
      await copyFile(path.join(artifacts, entry.artifact.id), destination, 1)
      await chmod(destination, entry.mode & 0o777)
    }
  }
  for (const entry of [...snapshot.entries].reverse()) {
    if (entry.kind === 'directory') await chmod(path.join(root, ...entry.path.split('/')), entry.mode & 0o777)
  }
  for (const entry of snapshot.entries) {
    const filename = path.join(root, ...entry.path.split('/'))
    const info = await lstat(filename)
    if (entry.kind === 'symlink') {
      if (!info.isSymbolicLink() || (await readlink(filename)) !== entry.linkTarget)
        throw new Error('Restored symbolic link differs from source')
    } else if (entry.kind === 'file') {
      if (
        !info.isFile() ||
        info.size !== entry.size ||
        (await hashFile(filename)) !== entry.sha256 ||
        (process.platform !== 'win32' && (info.mode & 0o111) !== (entry.mode & 0o111))
      )
        throw new Error('Restored working file differs from source')
    }
  }
}

async function removeEmptyDirectories(directory: string): Promise<void> {
  for (const name of await readdir(directory)) {
    const child = path.join(directory, name)
    const info = await lstat(child)
    if (!info.isDirectory() || info.isSymbolicLink())
      throw new Error('Snapshot path conflicts with unexpected directory content')
    await removeEmptyDirectories(child)
  }
  await rm(directory, { recursive: true })
}

async function safeParents(root: string, relativePath: string, create = true): Promise<void> {
  let current = root
  const parts = relativePath.split('/')
  for (const part of parts.slice(0, -1)) {
    current = path.join(current, part)
    const info = await lstat(current).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null
      throw error
    })
    if (info && (!info.isDirectory() || info.isSymbolicLink()))
      throw new Error('Snapshot destination traverses a non-directory')
    if (!info) {
      if (!create) return
      await mkdir(current)
    }
  }
}

async function hashFile(filename: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filename)) hash.update(chunk)
  return hash.digest('hex')
}

export async function restoreWorkspaceSnapshotRepository(
  root: string,
  artifacts: string,
  snapshot: WorkspaceSnapshotExport,
  signal: AbortSignal,
): Promise<void> {
  const repo = snapshot.repository
  if (!repo || !snapshot.bundle || !snapshot.staged || !snapshot.unstaged)
    throw new Error('Incomplete repository snapshot')
  const template = path.join(artifacts, 'empty-template')
  await mkdir(template)
  await snapshotGit(root, ['init', '--template=' + template, '--object-format=' + repo.objectFormat], signal)
  await snapshotGit(root, ['config', '--local', 'core.autocrlf', 'false'], signal)
  await snapshotGit(
    root,
    ['config', '--local', 'core.filemode', process.platform === 'win32' ? 'false' : 'true'],
    signal,
  )
  await snapshotGit(root, ['bundle', 'verify', path.join(artifacts, 'bundle')], signal)
  await snapshotGit(root, ['bundle', 'unbundle', path.join(artifacts, 'bundle')], signal)
  await snapshotGit(root, ['update-ref', '--no-deref', 'HEAD', repo.head], signal)
  await snapshotGit(root, ['read-tree', 'HEAD'], signal)
  if (repo.branch) {
    await snapshotGit(root, ['check-ref-format', 'refs/heads/' + repo.branch], signal)
    await snapshotGit(root, ['update-ref', 'refs/heads/' + repo.branch, repo.head, ''], signal)
    await snapshotGit(root, ['symbolic-ref', 'HEAD', 'refs/heads/' + repo.branch], signal)
  }
  if (snapshot.staged.size)
    await snapshotGit(
      root,
      ['apply', '--cached', '--binary', '--whitespace=nowarn', path.join(artifacts, 'staged')],
      signal,
    )
  // The separately checksummed unstaged patch is represented by exact captured working bytes.
  await restoreWorkspaceSnapshotFiles(root, artifacts, snapshot, signal)
  const stages = await snapshotGit(root, ['ls-files', '--stage', '-z'], signal)
  if (createHash('sha256').update(stages).digest('hex') !== repo.indexSha256)
    throw new Error('Restored index differs from source')
  const head = (await snapshotGit(root, ['rev-parse', 'HEAD'], signal)).toString('utf8').trim()
  if (head !== repo.head) throw new Error('Restored HEAD differs from source')
  for (const setting of repo.config) {
    if (
      !/^(remote\..+\.(url|pushurl|fetch)|branch\..+\.(remote|merge|pushRemote)|core\.(autocrlf|eol|filemode))$/.test(
        setting.key,
      ) ||
      typeof setting.value !== 'string' ||
      setting.value.includes('\0')
    )
      throw new Error('Unsafe source Git configuration')
    await snapshotGit(
      root,
      [
        'config',
        '--local',
        '--add',
        setting.key,
        setting.key === 'core.filemode' && process.platform === 'win32' ? 'false' : setting.value,
      ],
      signal,
    )
  }
}

/** Every destination is claimed exclusively; concurrent user files are never replaced. */
export async function publishWorkspaceSnapshotEntry(staging: string, destination: string): Promise<void> {
  const info = await lstat(staging)
  if (info.isDirectory()) {
    await mkdir(destination, { mode: 0o700 })
    for (const name of await readdir(staging))
      await publishWorkspaceSnapshotEntry(path.join(staging, name), path.join(destination, name))
    await chmod(destination, info.mode & 0o777)
    await rm(staging, { recursive: true })
  } else if (info.isSymbolicLink()) {
    await symlink(await readlink(staging), destination)
    await unlink(staging)
  } else if (info.isFile()) {
    // Source and destination share a filesystem; link fails atomically if the destination exists.
    await link(staging, destination)
    await unlink(staging)
  } else throw new Error('Unsupported staging entry')
}

export async function publishWorkspaceSnapshotDirectory(staging: string, destination: string): Promise<void> {
  await publishWorkspaceSnapshotEntry(staging, destination)
  await chmod(destination, 0o755)
}
