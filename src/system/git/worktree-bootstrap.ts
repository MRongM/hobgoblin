import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { getRepoRoot } from '#/system/git/branches.ts'
import type { ExecResult } from '#/shared/git-types.ts'
import {
  compactWorktreeBootstrapPaths,
  formatWorktreeBootstrapSummary,
  hasWorktreeBootstrapSummaryDetails,
  isWorktreeBootstrapCandidatePath,
  type WorktreeBootstrapDecision,
  type WorktreeBootstrapMaterializationMode,
  type WorktreeBootstrapSelection,
  type WorktreeBootstrapSummary,
  type WorktreeBootstrapTargetEntry,
  type WorktreeBootstrapTargetPreflightResult,
} from '#/shared/worktree-bootstrap-summary.ts'

type MaterializationMode = WorktreeBootstrapMaterializationMode

interface ConcreteSource {
  rel: string
  abs: string
}

interface PlannedMaterialization extends ConcreteSource {
  mode: MaterializationMode
}

interface ReadyMaterialization extends PlannedMaterialization {
  dest: string
  stat: Awaited<ReturnType<typeof fs.lstat>>
}

export async function bootstrapWorktreeSelectionsAfterCreate(
  sourceCwd: string,
  targetWorktreePath: string,
  selections: readonly WorktreeBootstrapSelection[],
  options?: { signal?: AbortSignal; replaceExisting?: readonly WorktreeBootstrapTargetEntry[] },
): Promise<ExecResult> {
  try {
    if (options?.signal?.aborted) return { ok: false, message: 'cancelled' }
    const sourceRepoRoot = await getRepoRoot(sourceCwd, { signal: options?.signal })
    if (!sourceRepoRoot) return bootstrapFailure('failed to resolve source repo root')

    const sourceRoot = path.resolve(sourceRepoRoot)
    const targetRoot = path.resolve(targetWorktreePath)

    const missingSources = new Set<string>()
    const literalOperations: PlannedMaterialization[] = []
    for (const selection of selections) {
      if (!isWorktreeBootstrapCandidatePath(selection.path)) {
        return bootstrapFailure(`invalid worktree bootstrap selection: ${selection.path}`)
      }
      if (selection.mode !== 'copy' && selection.mode !== 'symlink') {
        return bootstrapFailure(`invalid worktree bootstrap mode: ${String(selection.mode)}`)
      }
      const source = resolveSourcePath(sourceRoot, selection.path)
      if (!source.ok) return bootstrapFailure(source.message)
      literalOperations.push({ ...source, mode: selection.mode })
    }

    const ready = await validateMaterializations(
      sourceRoot,
      targetRoot,
      literalOperations,
      missingSources,
      options?.signal,
    )
    if (!ready.ok) return bootstrapFailure(ready.message)
    const unsupported = ready.operations.find((operation) => !operation.stat.isFile() && !operation.stat.isDirectory())
    if (unsupported) return bootstrapFailure(`unsupported worktree bootstrap source: ${unsupported.rel}`)

    const materialized = await materializePlan(
      sourceRoot,
      targetRoot,
      ready.operations,
      new Set(),
      options?.signal,
      options?.replaceExisting,
    )
    if (!materialized.ok) return bootstrapFailure(materialized.message)

    const summary = bootstrapSummary(ready.operations, Array.from(missingSources), undefined)
    return {
      ok: true,
      message: formatWorktreeBootstrapSummary(summary),
      ...(hasWorktreeBootstrapSummaryDetails(summary) ? { worktreeBootstrap: summary } : {}),
    }
  } catch (err) {
    if (options?.signal?.aborted) return { ok: false, message: 'cancelled' }
    return bootstrapFailure(errorMessage(err))
  }
}

export async function getWorktreeBootstrapTargetPreflight(
  sourceCwd: string,
  targetWorktreePath: string,
  decision: Exclude<WorktreeBootstrapDecision, { kind: 'skip' }>,
  options?: { signal?: AbortSignal },
): Promise<WorktreeBootstrapTargetPreflightResult> {
  try {
    if (options?.signal?.aborted) return { ok: false, message: 'cancelled' }
    const sourceRepoRoot = await getRepoRoot(sourceCwd, { signal: options?.signal })
    if (!sourceRepoRoot) return { ok: false, message: 'failed to resolve source repo root' }

    const sourceRoot = path.resolve(sourceRepoRoot)
    const targetRoot = path.resolve(targetWorktreePath)
    const planned = await planLiteralSelections(sourceRoot, targetRoot, decision.selections, options?.signal)
    if (!planned.ok) return planned

    const classified = await classifyMaterializationTargets(planned.operations, options?.signal)
    if (!classified.ok) return classified
    return { ok: true, preflight: { ...classified.preflight, hasSetup: false } }
  } catch (err) {
    if (options?.signal?.aborted) return { ok: false, message: 'cancelled' }
    return { ok: false, message: errorMessage(err) }
  }
}

async function planLiteralSelections(
  sourceRoot: string,
  targetRoot: string,
  selections: readonly WorktreeBootstrapSelection[],
  signal: AbortSignal | undefined,
): Promise<
  { ok: true; operations: ReadyMaterialization[]; missingSources: string[] } | { ok: false; message: string }
> {
  const missingSources = new Set<string>()
  const literalOperations: PlannedMaterialization[] = []
  for (const selection of selections) {
    if (!isWorktreeBootstrapCandidatePath(selection.path)) {
      return { ok: false, message: `invalid worktree bootstrap selection: ${selection.path}` }
    }
    if (selection.mode !== 'copy' && selection.mode !== 'symlink') {
      return { ok: false, message: `invalid worktree bootstrap mode: ${String(selection.mode)}` }
    }
    const source = resolveSourcePath(sourceRoot, selection.path)
    if (!source.ok) return source
    literalOperations.push({ ...source, mode: selection.mode })
  }

  const ready = await validateMaterializations(sourceRoot, targetRoot, literalOperations, missingSources, signal)
  if (!ready.ok) return ready
  const unsupported = ready.operations.find((operation) => !operation.stat.isFile() && !operation.stat.isDirectory())
  if (unsupported) return { ok: false, message: `unsupported worktree bootstrap source: ${unsupported.rel}` }
  return { ok: true, operations: ready.operations, missingSources: Array.from(missingSources) }
}

async function validateMaterializations(
  sourceRoot: string,
  targetRoot: string,
  planned: PlannedMaterialization[],
  missingSources: Set<string>,
  signal: AbortSignal | undefined,
): Promise<{ ok: true; operations: ReadyMaterialization[] } | { ok: false; message: string }> {
  const operations: ReadyMaterialization[] = []
  let sourceRootReal = sourceRoot
  try {
    sourceRootReal = await fs.realpath(sourceRoot)
  } catch (err) {
    return { ok: false, message: `failed to inspect source repo root: ${errorMessage(err)}` }
  }
  for (const item of planned) {
    if (signal?.aborted) return { ok: false, message: 'cancelled' }

    let stat: Awaited<ReturnType<typeof fs.lstat>>
    try {
      stat = await fs.lstat(item.abs)
    } catch (err) {
      if (isErrno(err, 'ENOENT')) {
        missingSources.add(item.rel)
        continue
      }
      return { ok: false, message: `failed to inspect ${item.rel}: ${errorMessage(err)}` }
    }

    if (item.mode === 'hardlink' && !stat.isFile()) {
      return { ok: false, message: `hardlink source is not a file: ${item.rel}` }
    }

    const safeSource = await validateSourcePathWithinRoot(sourceRoot, sourceRootReal, item.rel, item.abs, stat)
    if (!safeSource.ok) return safeSource

    const destination = resolveDestinationPath(targetRoot, item.rel)
    if (!destination.ok) return destination
    const safeDestination = await validateDestinationPathWithinRoot(targetRoot, item.rel)
    if (!safeDestination.ok) return safeDestination
    const source = resolveSourcePath(sourceRoot, item.rel)
    if (!source.ok) return source
    operations.push({ ...item, abs: source.abs, dest: destination.abs, stat })
  }
  return { ok: true, operations }
}

async function validateDestinationPathWithinRoot(
  targetRoot: string,
  rel: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const symlinkAncestor = await firstSymlinkAncestor(targetRoot, rel)
  if (symlinkAncestor) {
    return { ok: false, message: `bootstrap target path uses symlink parent: ${symlinkAncestor}` }
  }
  return { ok: true }
}

async function validateSourcePathWithinRoot(
  sourceRoot: string,
  sourceRootReal: string,
  rel: string,
  abs: string,
  stat: Awaited<ReturnType<typeof fs.lstat>>,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const symlinkAncestor = await firstSymlinkAncestor(sourceRoot, rel)
  if (symlinkAncestor) {
    return { ok: false, message: `bootstrap path uses symlink parent: ${symlinkAncestor}` }
  }
  if (stat.isSymbolicLink()) return { ok: true }

  let sourceReal = ''
  try {
    sourceReal = await fs.realpath(abs)
  } catch (err) {
    return { ok: false, message: `failed to inspect ${rel}: ${errorMessage(err)}` }
  }
  if (!isWithinRoot(sourceRootReal, sourceReal))
    return { ok: false, message: `bootstrap path escapes repo root: ${rel}` }
  return { ok: true }
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

async function classifyMaterializationTargets(
  operations: readonly ReadyMaterialization[],
  signal: AbortSignal | undefined,
): Promise<
  | {
      ok: true
      preflight: {
        pending: WorktreeBootstrapTargetEntry[]
        satisfied: WorktreeBootstrapTargetEntry[]
        conflicts: WorktreeBootstrapTargetEntry[]
      }
    }
  | { ok: false; message: string }
> {
  const pending: WorktreeBootstrapTargetEntry[] = []
  const satisfied: WorktreeBootstrapTargetEntry[] = []
  const conflicts: WorktreeBootstrapTargetEntry[] = []
  for (const operation of operations) {
    if (signal?.aborted) return { ok: false, message: 'cancelled' }
    const entry = { path: operation.rel, mode: operation.mode }
    const state = await materializationTargetState(operation)
    if (!state.ok) return state
    if (state.state === 'missing') pending.push(entry)
    else if (state.state === 'satisfied') satisfied.push(entry)
    else conflicts.push(entry)
  }
  return { ok: true, preflight: { pending, satisfied, conflicts } }
}

async function materializationTargetState(
  operation: ReadyMaterialization,
): Promise<{ ok: true; state: 'missing' | 'satisfied' | 'conflict' } | { ok: false; message: string }> {
  let targetStat: Awaited<ReturnType<typeof fs.lstat>>
  try {
    targetStat = await fs.lstat(operation.dest)
  } catch (err) {
    if (isErrno(err, 'ENOENT')) return { ok: true, state: 'missing' }
    return { ok: false, message: `failed to inspect ${operation.rel}: ${errorMessage(err)}` }
  }

  if (operation.mode === 'symlink' && targetStat.isSymbolicLink()) {
    try {
      const target = await fs.readlink(operation.dest)
      const resolvedTarget = path.resolve(path.dirname(operation.dest), target)
      if (resolvedTarget === operation.abs) return { ok: true, state: 'satisfied' }
    } catch (err) {
      return { ok: false, message: `failed to inspect ${operation.rel}: ${errorMessage(err)}` }
    }
  }
  if (
    operation.mode === 'hardlink' &&
    targetStat.isFile() &&
    targetStat.dev === operation.stat.dev &&
    targetStat.ino === operation.stat.ino
  ) {
    return { ok: true, state: 'satisfied' }
  }
  return { ok: true, state: 'conflict' }
}

async function materializePlan(
  sourceRoot: string,
  targetRoot: string,
  operations: ReadyMaterialization[],
  excludedPaths: Set<string>,
  signal: AbortSignal | undefined,
  replaceExisting: readonly WorktreeBootstrapTargetEntry[] = [],
): Promise<ExecResult> {
  const concreteByKey = new Map(operations.map((operation) => [targetEntryKey(operation), operation]))
  const replacementKeys = new Set<string>()
  for (const replacement of replaceExisting) {
    const key = targetEntryKey(replacement)
    if (replacementKeys.has(key) || !concreteByKey.has(key)) {
      return { ok: false, message: `invalid replacement target: ${replacement.path}` }
    }
    replacementKeys.add(key)
  }

  const preflight = await classifyMaterializationTargets(operations, signal)
  if (!preflight.ok) return preflight
  const unapproved = preflight.preflight.conflicts.find((entry) => !replacementKeys.has(targetEntryKey(entry)))
  if (unapproved) return { ok: false, message: `destination already exists: ${unapproved.path}` }

  for (const item of operations) {
    if (signal?.aborted) return { ok: false, message: 'cancelled' }
    try {
      await fs.mkdir(path.dirname(item.dest), { recursive: true })
      const safeDestination = await validateDestinationPathWithinRoot(targetRoot, item.rel)
      if (!safeDestination.ok) return safeDestination
      const targetState = await materializationTargetState(item)
      if (!targetState.ok) return targetState
      if (targetState.state === 'satisfied') continue
      if (item.mode === 'copy') {
        const copied = await materializeCopy(sourceRoot, targetRoot, item, excludedPaths, replacementKeys, signal)
        if (!copied.ok) return copied
        continue
      }
      if (targetState.state === 'conflict') {
        if (!replacementKeys.has(targetEntryKey(item))) {
          return { ok: false, message: `destination already exists: ${item.rel}` }
        }
        await fs.rm(item.dest, { recursive: true, force: false })
      }
      switch (item.mode) {
        case 'symlink':
          await fs.symlink(item.abs, item.dest, symlinkType(item.stat))
          break
        case 'hardlink':
          await fs.link(item.abs, item.dest)
          break
      }
    } catch (err) {
      if (isErrno(err, 'EEXIST')) return { ok: false, message: `destination already exists: ${item.rel}` }
      return { ok: false, message: `failed to ${item.mode} ${item.rel}: ${errorMessage(err)}` }
    }
  }
  return { ok: true, message: '' }
}

async function materializeCopy(
  sourceRoot: string,
  targetRoot: string,
  item: ReadyMaterialization,
  excludedPaths: Set<string>,
  replacementKeys: ReadonlySet<string>,
  signal: AbortSignal | undefined,
): Promise<ExecResult> {
  const temporaryPath = path.join(
    path.dirname(item.dest),
    `.${path.basename(item.dest)}.goblin-bootstrap-${randomUUID()}`,
  )
  try {
    await fs.cp(item.abs, temporaryPath, {
      recursive: true,
      force: false,
      errorOnExist: true,
      dereference: false,
      filter: (sourcePath) => shouldCopyPath(sourceRoot, sourcePath, excludedPaths),
    })
    if (signal?.aborted) return { ok: false, message: 'cancelled' }
    const safeDestination = await validateDestinationPathWithinRoot(targetRoot, item.rel)
    if (!safeDestination.ok) return safeDestination
    const targetState = await materializationTargetState(item)
    if (!targetState.ok) return targetState
    if (targetState.state === 'conflict') {
      if (!replacementKeys.has(targetEntryKey(item))) {
        return { ok: false, message: `destination already exists: ${item.rel}` }
      }
      await fs.rm(item.dest, { recursive: true, force: false })
    }
    await fs.rename(temporaryPath, item.dest)
    return { ok: true, message: '' }
  } catch (err) {
    if (isErrno(err, 'EEXIST')) return { ok: false, message: `destination already exists: ${item.rel}` }
    return { ok: false, message: `failed to copy ${item.rel}: ${errorMessage(err)}` }
  } finally {
    await fs.rm(temporaryPath, { recursive: true, force: true }).catch(() => undefined)
  }
}

function targetEntryKey(entry: { rel: string; mode: MaterializationMode } | WorktreeBootstrapTargetEntry): string {
  return 'rel' in entry ? `${entry.mode}\0${entry.rel}` : `${entry.mode}\0${entry.path}`
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

function normalizeRelativePath(value: string): string {
  const normalized = path.posix.normalize(value.replace(/\\/g, '/').replace(/\/+$/, ''))
  return normalized === '' ? '.' : normalized
}

function hasGitSegment(rel: string): boolean {
  return rel.split('/').includes('.git')
}

function isWithinRoot(root: string, candidate: string): boolean {
  const rel = path.relative(root, candidate)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

function shouldCopyPath(sourceRoot: string, sourcePath: string, excludedPaths: Set<string>): boolean {
  const rel = normalizeRelativePath(path.relative(sourceRoot, sourcePath))
  if (hasGitSegment(rel)) return false
  return !isExcludedPath(rel, excludedPaths)
}

function isExcludedPath(rel: string, excludedPaths: Set<string>): boolean {
  if (excludedPaths.has(rel)) return true
  for (const excluded of excludedPaths) {
    if (rel.startsWith(`${excluded}/`)) return true
  }
  return false
}

function symlinkType(stat: Awaited<ReturnType<typeof fs.lstat>>): 'file' | 'dir' | 'junction' {
  if (!stat.isDirectory()) return 'file'
  return process.platform === 'win32' ? 'junction' : 'dir'
}

function bootstrapSummary(
  operations: ReadyMaterialization[],
  missingSources: string[],
  setupCommand: string | undefined,
): WorktreeBootstrapSummary {
  return {
    copy: compactWorktreeBootstrapPaths(pathsForMode(operations, 'copy')),
    symlink: compactWorktreeBootstrapPaths(pathsForMode(operations, 'symlink')),
    hardlink: compactWorktreeBootstrapPaths(pathsForMode(operations, 'hardlink')),
    skippedMissing: compactWorktreeBootstrapPaths(missingSources),
    ...(setupCommand ? { setup: { command: setupCommand } } : {}),
  }
}

function bootstrapFailure(message: string): ExecResult {
  return { ok: false, message: `Worktree bootstrap failed: ${message}` }
}

function pathsForMode(operations: ReadyMaterialization[], mode: MaterializationMode): string[] {
  return operations.filter((operation) => operation.mode === mode).map((operation) => operation.rel)
}

function isErrno(err: unknown, code: string): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: unknown }).code === code
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
