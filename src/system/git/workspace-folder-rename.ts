import { lstat, mkdir, opendir, readlink, realpath, rename, rmdir, stat, symlink, unlink } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { git } from '#/system/git/helper.ts'

export interface WorkspaceFolderRenameInput {
  previousPath: string
  path: string
  protectedPaths: string[]
}
export interface WorkspaceFolderRenameReply {
  ok: boolean
  previousPath: string
  path: string
  message?: string
  pathMappings?: Array<{ previousPath: string; path: string }>
  repositoryPaths?: string[]
}
interface WorktreeRecord {
  path: string
  locked: boolean
  bare: boolean
}
interface GitGroup {
  common: string
  worktrees: WorktreeRecord[]
}
interface GitRoot {
  path: string
  common: string
}
interface DirectoryLink {
  path: string
  original: string
  replacement: string
  directory: boolean
}
const prefix = 'workspace.branch-workspace.rename.'
const MAX_ENTRIES = 200_000
const MAX_REPOSITORIES = 512

/** A same-parent rename never copies repository data or checks out another branch. */
export async function renameLocalWorkspaceFolder(
  input: WorkspaceFolderRenameInput,
  signal?: AbortSignal,
): Promise<WorkspaceFolderRenameReply> {
  const previousPath = path.resolve(input.previousPath),
    nextPath = path.resolve(input.path)
  let moved = false
  let previousReal = previousPath,
    nextReal = nextPath
  const groups = new Map<string, GitGroup>(),
    roots: GitRoot[] = [],
    links: DirectoryLink[] = []
  const repairedLinks: DirectoryLink[] = []
  let sourceInfo: Awaited<ReturnType<typeof lstat>> | undefined
  let deadline = Date.now() + 120_000
  const check = () => {
    signal?.throwIfAborted()
    if (Date.now() > deadline) throw new Error(prefix + 'scan-limit')
  }
  const runGit = (cwd: string, args: string[], cancellable = true) => {
    if (Date.now() > deadline) throw new Error(prefix + 'scan-limit')
    return git(
      cwd,
      [
        '-c',
        'core.fsmonitor=false',
        '-c',
        `core.hooksPath=${process.platform === 'win32' ? 'NUL' : '/dev/null'}`,
        ...args,
      ],
      {
        timeoutMs: Math.min(15_000, Math.max(1, deadline - Date.now())),
        ...(cancellable ? { signal } : {}),
        env: { GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', GIT_NO_LAZY_FETCH: '1' },
      },
    )
  }
  const rebase = (value: string, reverse = false) =>
    remap(value, reverse ? nextReal : previousReal, reverse ? previousReal : nextReal)
  const repairGit = async (reverse = false) => {
    for (const group of groups.values()) {
      const common = reverse ? group.common : rebase(group.common)
      const primary = group.worktrees[0]!
      const primaryPath = reverse ? primary.path : rebase(primary.path)
      const linkedPaths = group.worktrees
        .slice(1)
        .filter((item) => inside(previousReal, item.path))
        .map((item) => (reverse ? item.path : rebase(item.path)))
      // Repair reconnects both directions when primary and linked worktrees moved together.
      const cwd = (await stat(primaryPath).catch(() => null))?.isDirectory() ? primaryPath : path.dirname(common)
      await runGit(cwd, [`--git-dir=${common}`, 'worktree', 'repair', ...linkedPaths], false)
      const registered = parseRecords(
        await runGit(cwd, [`--git-dir=${common}`, 'worktree', 'list', '--porcelain', '-z'], false),
      )
      const registeredPaths = new Set(
        await Promise.all(registered.map((entry) => realpath(entry.path).catch(() => path.resolve(entry.path)))),
      )
      for (const item of group.worktrees.filter((entry) => inside(previousReal, entry.path))) {
        if (!registeredPaths.has(reverse ? item.path : rebase(item.path))) throw new Error(prefix + 'unsupported-git')
      }
    }
    for (const root of roots) {
      const folder = reverse ? root.path : rebase(root.path)
      const actualCommon = await realpath(
        await runGit(folder, ['rev-parse', '--path-format=absolute', '--git-common-dir'], false),
      )
      if (actualCommon !== (reverse ? root.common : rebase(root.common))) throw new Error(prefix + 'unsupported-git')
    }
  }
  const reply = (ok: boolean, message?: string): WorkspaceFolderRenameReply => ({
    ok,
    previousPath,
    path: moved ? nextPath : previousPath,
    ...(message ? { message } : {}),
    pathMappings: moved
      ? [
          { previousPath, path: nextPath },
          ...(previousReal !== previousPath ? [{ previousPath: previousReal, path: nextReal }] : []),
        ]
      : [],
    repositoryPaths: [
      ...new Set(
        [...roots.map((root) => root.path), ...[...groups.values()].map((group) => group.worktrees[0]!.path)].flatMap(
          (folder) => [folder, rebase(folder)],
        ),
      ),
    ],
  })
  try {
    check()
    if (previousPath === nextPath) return { ok: true, previousPath, path: nextPath }
    if (path.dirname(previousPath) !== path.dirname(nextPath) || previousPath === path.parse(previousPath).root)
      throw new Error('workspace.branch-workspace.invalid-directory')
    sourceInfo = await lstat(previousPath)
    const destinationInfo = await lstat(nextPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null
      throw error
    })
    if (destinationInfo && !sameCaseOnlyEntry(previousPath, nextPath, sourceInfo, destinationInfo))
      throw new Error('workspace.branch-workspace.target-exists')
    if (!(await stat(previousPath)).isDirectory()) throw new Error('workspace.branch-workspace.directory-unavailable')
    if (!sourceInfo.isSymbolicLink()) {
      previousReal = await realpath(previousPath)
      nextReal = path.join(await realpath(path.dirname(previousPath)), path.basename(nextPath))
      for (const protectedPath of input.protectedPaths) {
        const actual = await realpath(protectedPath).catch(() => path.resolve(protectedPath))
        if (inside(previousReal, actual)) throw new Error(prefix + 'protected-root')
      }
      let entries = 0
      const visit = async (folder: string, depth: number): Promise<void> => {
        check()
        if (depth > 80) throw new Error(prefix + 'scan-limit')
        const marker = await lstat(path.join(folder, '.git')).catch(() => null)
        const bare =
          !marker &&
          (await exists(path.join(folder, 'HEAD'))) &&
          (await lstat(path.join(folder, 'objects')).catch(() => null))?.isDirectory() &&
          (await runGit(folder, ['rev-parse', '--is-bare-repository']).catch(() => '')) === 'true'
        if (marker || bare) {
          if (marker && (marker.isSymbolicLink() || (!marker.isFile() && !marker.isDirectory())))
            throw new Error(prefix + 'unsupported-git')
          if (roots.length >= MAX_REPOSITORIES) throw new Error(prefix + 'scan-limit')
          if (!bare) {
            const top = await runGit(folder, ['rev-parse', '--show-toplevel'])
            if ((await realpath(top)) !== folder) throw new Error(prefix + 'unsupported-git')
          }
          const common = await realpath(
            await runGit(folder, ['rev-parse', '--path-format=absolute', '--git-common-dir']),
          )
          const gitDir = await runGit(folder, ['rev-parse', '--absolute-git-dir'])
          for (const lockPath of [
            path.join(common, 'config.lock'),
            path.join(gitDir, 'index.lock'),
            path.join(gitDir, 'HEAD.lock'),
          ])
            if (await exists(lockPath)) throw new Error('workspace.branch-workspace.operation-in-progress')
          const explicitWorktree = await runGit(folder, ['config', '--local', '--get', 'core.worktree']).catch(() => '')
          if (explicitWorktree && path.isAbsolute(explicitWorktree)) throw new Error(prefix + 'unsupported-git')
          if (!groups.has(common)) {
            const worktrees = parseRecords(await runGit(folder, ['worktree', 'list', '--porcelain', '-z']))
            if (!worktrees.length) throw new Error(prefix + 'unsupported-git')
            for (const entry of worktrees) entry.path = await realpath(entry.path).catch(() => path.resolve(entry.path))
            if (worktrees.some((entry) => entry.locked && inside(previousReal, entry.path)))
              throw new Error('workspace.branch-workspace.operation-in-progress')
            groups.set(common, { common, worktrees })
          }
          if (!groups.get(common)!.worktrees.some((entry) => entry.path === folder))
            throw new Error(prefix + 'unsupported-git')
          roots.push({ path: folder, common })
        }
        if (bare) return
        const directory = await opendir(folder)
        for await (const entry of directory) {
          check()
          if (++entries > MAX_ENTRIES) throw new Error(prefix + 'scan-limit')
          if (entry.name === '.git') continue
          const entryPath = path.join(folder, entry.name)
          if (entry.isSymbolicLink()) {
            const original = await readlink(entryPath)
            const target = path.resolve(folder, original)
            const actualTarget = await realpath(target).catch(() => target)
            const targetAfter = rebase(
                inside(previousReal, target) || !inside(previousReal, actualTarget) ? target : actualTarget,
              ),
              linkAfter = rebase(entryPath)
            const replacement = path.isAbsolute(original)
              ? targetAfter
              : path.relative(path.dirname(linkAfter), targetAfter) || '.'
            if (path.resolve(path.dirname(linkAfter), original) !== targetAfter)
              links.push({
                path: entryPath,
                original,
                replacement,
                directory: (await stat(entryPath).catch(() => null))?.isDirectory() ?? false,
              })
          } else if (entry.isDirectory()) await visit(entryPath, depth + 1)
        }
      }
      await visit(previousReal, 0)
    }
    check()
    await renameWithoutOverwrite(previousPath, nextPath, sourceInfo)
    moved = true
    // From this point finish or restore the complete operation before honoring cancellation.
    for (const link of links) {
      const replacement = await replaceLink(rebase(link.path), link.original, link.replacement, link.directory)
      repairedLinks.push({ ...link, replacement })
    }
    await repairGit()
    signal?.throwIfAborted()
    return reply(true)
  } catch (error) {
    let rollbackFailed = false
    if (moved && sourceInfo) {
      try {
        deadline = Date.now() + 120_000
        await renameWithoutOverwrite(nextPath, previousPath, await lstat(nextPath))
        moved = false
        for (const link of repairedLinks) await replaceLink(link.path, link.replacement, link.original, link.directory)
        await repairGit(true)
      } catch {
        rollbackFailed = true
      }
    }
    return reply(
      false,
      rollbackFailed
        ? prefix + 'rollback-failed'
        : signal?.aborted
          ? 'workspace.branch-workspace.rename.cancelled'
          : errorMessage(error),
    )
  }
}

function parseRecords(raw: string): WorktreeRecord[] {
  return raw
    .split('\0\0')
    .filter(Boolean)
    .flatMap((block) => {
      const fields = block.split('\0'),
        line = fields.find((field) => field.startsWith('worktree '))
      return line
        ? [
            {
              path: line.slice(9),
              bare: fields.includes('bare'),
              locked: fields.some((field) => field === 'locked' || field.startsWith('locked ')),
            },
          ]
        : []
    })
}
function inside(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate)
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}
function remap(value: string, from: string, to: string): string {
  return inside(from, value) ? path.join(to, path.relative(from, value)) : value
}
async function exists(value: string) {
  return await lstat(value).then(
    () => true,
    (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return false
      throw error
    },
  )
}
async function renameWithoutOverwrite(from: string, to: string, expected: Awaited<ReturnType<typeof lstat>>) {
  const current = await lstat(from)
  if (current.ino !== expected.ino || current.dev !== expected.dev)
    throw new Error('workspace.branch-workspace.plan-stale')
  const destination = await lstat(to).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  if (destination) {
    if (!sameCaseOnlyEntry(from, to, current, destination)) throw new Error('workspace.branch-workspace.target-exists')
    await rename(from, to)
    return
  }
  // Windows refuses an existing directory destination; Unix reserves it exclusively first.
  if (current.isSymbolicLink()) {
    const original = await readlink(from)
    await symlink(original, to, process.platform === 'win32' ? 'junction' : undefined)
    const claim = await lstat(to)
    try {
      const source = await lstat(from)
      if (source.ino !== expected.ino || source.dev !== expected.dev)
        throw new Error('workspace.branch-workspace.plan-stale')
      await unlink(from)
    } catch (error) {
      const present = await lstat(to).catch(() => null)
      if (present?.ino === claim.ino && present.dev === claim.dev) await unlink(to).catch(() => undefined)
      throw error
    }
    return
  }
  if (process.platform === 'win32') {
    await rename(from, to)
    return
  }
  await mkdir(to)
  const claim = await lstat(to)
  try {
    const present = await lstat(to)
    if (claim.ino !== present.ino || claim.dev !== present.dev)
      throw new Error('workspace.branch-workspace.target-exists')
    const source = await lstat(from)
    if (source.ino !== expected.ino || source.dev !== expected.dev)
      throw new Error('workspace.branch-workspace.plan-stale')
    await rename(from, to)
  } catch (error) {
    const present = await lstat(to).catch(() => null)
    if (present?.ino === claim.ino && present.dev === claim.dev) await rmdir(to).catch(() => undefined)
    throw error
  }
}
function sameCaseOnlyEntry(
  from: string,
  to: string,
  source: Awaited<ReturnType<typeof lstat>>,
  target: Awaited<ReturnType<typeof lstat>>,
) {
  return (
    from !== to && from.toLowerCase() === to.toLowerCase() && source.ino === target.ino && source.dev === target.dev
  )
}
async function replaceLink(filename: string, expected: string, replacement: string, directory: boolean) {
  if ((await readlink(filename)) !== expected) throw new Error('workspace.branch-workspace.plan-stale')
  const temporary = path.join(path.dirname(filename), `.hob-rename-link-${randomUUID()}`)
  await symlink(replacement, temporary, process.platform === 'win32' ? (directory ? 'junction' : 'file') : undefined)
  try {
    if ((await readlink(filename)) !== expected) throw new Error('workspace.branch-workspace.plan-stale')
    await rename(temporary, filename)
    return await readlink(filename)
  } finally {
    await unlink(temporary).catch(() => undefined)
  }
}
function errorMessage(error: unknown) {
  if (error instanceof Error && /^(workspace\.|error\.)/.test(error.message)) return error.message
  return prefix + 'failed'
}
