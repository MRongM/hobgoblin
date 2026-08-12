import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { git } from '#/system/git/helper.ts'
import type { ExecResult } from '#/shared/git-types.ts'
import {
  compactWorktreeBootstrapPaths,
  formatWorktreeBootstrapSummary,
  hasWorktreeBootstrapSummaryDetails,
  normalizeWorktreeDependencyPath,
  type WorktreeBootstrapSelection,
  type WorktreeBootstrapSummary,
} from '#/shared/worktree-bootstrap-summary.ts'

export async function bootstrapWorktreeSelectionsAfterCreate(
  sourceCwd: string,
  targetWorktreePath: string,
  selections: readonly WorktreeBootstrapSelection[],
  options?: { signal?: AbortSignal },
): Promise<ExecResult> {
  const sourceRoot = path.resolve(sourceCwd)
  const targetRoot = path.resolve(targetWorktreePath)
  const materialized: WorktreeBootstrapSelection[] = []
  for (const selection of selections) {
    if (options?.signal?.aborted) break
    const mode = await materializeSelectionBestEffort(sourceRoot, targetRoot, selection, options?.signal)
    if (mode) materialized.push({ path: normalizeWorktreeDependencyPath(selection.path)!, mode })
  }
  const summary: WorktreeBootstrapSummary = {
    copy: compactWorktreeBootstrapPaths(materialized.filter((item) => item.mode === 'copy').map((item) => item.path)),
    symlink: compactWorktreeBootstrapPaths(
      materialized.filter((item) => item.mode === 'symlink').map((item) => item.path),
    ),
    hardlink: compactWorktreeBootstrapPaths([]),
    skippedMissing: compactWorktreeBootstrapPaths([]),
  }
  return {
    ok: true,
    message: formatWorktreeBootstrapSummary(summary),
    ...(hasWorktreeBootstrapSummaryDetails(summary) ? { worktreeBootstrap: summary } : {}),
  }
}

async function materializeSelectionBestEffort(
  sourceRoot: string,
  targetRoot: string,
  selection: WorktreeBootstrapSelection,
  signal: AbortSignal | undefined,
): Promise<'copy' | 'symlink' | null> {
  if (signal?.aborted) return null
  const rel = normalizeWorktreeDependencyPath(selection.path)
  if (!rel || (selection.mode !== 'copy' && selection.mode !== 'symlink')) return null
  try {
    const tracked = await git(sourceRoot, ['ls-files', '-z', '--', rel], { signal })
    if (signal?.aborted || tracked.length > 0) return null

    const sourceRootStat = await fs.lstat(sourceRoot)
    const targetRootStat = await fs.lstat(targetRoot)
    if (
      sourceRootStat.isSymbolicLink() ||
      targetRootStat.isSymbolicLink() ||
      !sourceRootStat.isDirectory() ||
      !targetRootStat.isDirectory()
    ) {
      return null
    }
    const [sourceRootReal, targetRootReal] = await Promise.all([fs.realpath(sourceRoot), fs.realpath(targetRoot)])
    const source = resolveSourcePath(sourceRoot, rel)
    const destination = resolveDestinationPath(targetRoot, rel)
    if (!source.ok || !destination.ok) return null

    const sourceStat = await fs.lstat(source.abs)
    if (sourceStat.isSymbolicLink() || (!sourceStat.isFile() && !sourceStat.isDirectory())) return null
    if (await firstSymlinkAncestor(sourceRoot, rel)) return null
    const sourceReal = await fs.realpath(source.abs)
    if (!isWithinRoot(sourceRootReal, sourceReal)) return null
    if (await firstSymlinkAncestor(targetRoot, rel)) return null
    if (await pathExists(destination.abs)) return null

    await fs.mkdir(path.dirname(destination.abs), { recursive: true })
    if (signal?.aborted || (await firstSymlinkAncestor(targetRoot, rel))) return null
    const destinationParentReal = await fs.realpath(path.dirname(destination.abs))
    if (!isWithinRoot(targetRootReal, destinationParentReal) || (await pathExists(destination.abs))) return null

    if (selection.mode === 'symlink') {
      await fs.symlink(source.abs, destination.abs, symlinkType(sourceStat))
      return 'symlink'
    }
    return (await materializeCopyBestEffort(source.abs, destination.abs, targetRoot, rel, signal)) ? 'copy' : null
  } catch {
    return null
  }
}

async function materializeCopyBestEffort(
  sourcePath: string,
  destinationPath: string,
  targetRoot: string,
  rel: string,
  signal: AbortSignal | undefined,
): Promise<boolean> {
  const temporaryPath = path.join(
    path.dirname(destinationPath),
    `.${path.basename(destinationPath)}.goblin-bootstrap-${randomUUID()}`,
  )
  try {
    await fs.cp(sourcePath, temporaryPath, {
      recursive: true,
      force: false,
      errorOnExist: true,
      dereference: false,
    })
    if (signal?.aborted || (await firstSymlinkAncestor(targetRoot, rel)) || (await pathExists(destinationPath))) {
      return false
    }
    await fs.rename(temporaryPath, destinationPath)
    return true
  } catch {
    return false
  } finally {
    await fs.rm(temporaryPath, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function pathExists(candidatePath: string): Promise<boolean> {
  try {
    await fs.lstat(candidatePath)
    return true
  } catch (error) {
    if (isErrno(error, 'ENOENT')) return false
    throw error
  }
}

async function firstSymlinkAncestor(sourceRoot: string, rel: string): Promise<string | null> {
  const segments = rel.split('/').filter(Boolean)
  let current = sourceRoot
  for (let index = 0; index < segments.length - 1; index += 1) {
    current = path.join(current, segments[index]!)
    try {
      const stat = await fs.lstat(current)
      if (stat.isSymbolicLink()) return segments.slice(0, index + 1).join('/')
    } catch (err) {
      if (isErrno(err, 'ENOENT')) return null
      throw err
    }
  }
  return null
}

function resolveSourcePath(
  sourceRoot: string,
  rel: string,
): { ok: true; rel: string; abs: string } | { ok: false; message: string } {
  if (hasGitSegment(rel)) return { ok: false, message: `bootstrap path must not target .git: ${rel}` }
  const abs = path.resolve(sourceRoot, rel)
  if (!isWithinRoot(sourceRoot, abs)) return { ok: false, message: `bootstrap path escapes repo root: ${rel}` }
  return { ok: true, rel, abs }
}

function resolveDestinationPath(
  targetRoot: string,
  rel: string,
): { ok: true; abs: string } | { ok: false; message: string } {
  if (hasGitSegment(rel)) return { ok: false, message: `bootstrap path must not target .git: ${rel}` }
  const abs = path.resolve(targetRoot, rel)
  if (!isWithinRoot(targetRoot, abs)) return { ok: false, message: `bootstrap path escapes target worktree: ${rel}` }
  return { ok: true, abs }
}

function hasGitSegment(rel: string): boolean {
  return rel.split('/').includes('.git')
}

function isWithinRoot(root: string, candidate: string): boolean {
  const rel = path.relative(root, candidate)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

function symlinkType(stat: Awaited<ReturnType<typeof fs.lstat>>): 'file' | 'dir' | 'junction' {
  if (!stat.isDirectory()) return 'file'
  return process.platform === 'win32' ? 'junction' : 'dir'
}

function isErrno(err: unknown, code: string): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: unknown }).code === code
}
