import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { constants as fsConstants, promises as fs } from 'node:fs'
import { execa, ExecaError } from 'execa'
import { parse } from 'smol-toml'
import { glob, isDynamicPattern } from 'tinyglobby'
import { getRepoRoot } from '#/system/git/branches.ts'
import type { ExecResult } from '#/shared/git-types.ts'
import {
  compactWorktreeBootstrapPaths,
  formatWorktreeBootstrapSummary,
  hasWorktreeBootstrapSummaryDetails,
  isWorktreeBootstrapCandidatePath,
  worktreeBootstrapPreviewFromConfig,
  type WorktreeBootstrapDecision,
  type WorktreeBootstrapMaterializationMode,
  type WorktreeBootstrapSelection,
  type WorktreeBootstrapSummary,
  type WorktreeBootstrapPreviewResult,
  type WorktreeBootstrapTargetEntry,
  type WorktreeBootstrapTargetPreflightResult,
} from '#/shared/worktree-bootstrap-summary.ts'

type MaterializationMode = WorktreeBootstrapMaterializationMode

export interface WorktreeBootstrapConfig {
  copy: string[]
  symlink: string[]
  hardlink: string[]
  exclude: string[]
  setup?: string
}

export async function getWorktreeBootstrapPreview(
  sourceCwd: string,
  options?: { signal?: AbortSignal },
): Promise<WorktreeBootstrapPreviewResult> {
  try {
    if (options?.signal?.aborted) return { ok: false, message: 'cancelled' }
    const sourceRepoRoot = await getRepoRoot(sourceCwd, { signal: options?.signal })
    if (!sourceRepoRoot) return { ok: false, message: 'failed to resolve source repo root' }

    const loaded = await loadBootstrapConfig(path.resolve(sourceRepoRoot))
    if (loaded.kind === 'none') return { ok: true, preview: worktreeBootstrapPreviewFromConfig(undefined) }
    if (loaded.kind === 'error') return { ok: false, message: loaded.message }

    const valid = validateBootstrapConfigPaths(loaded.config)
    if (!valid.ok) return { ok: false, message: valid.message }
    return { ok: true, preview: worktreeBootstrapPreviewFromConfig(loaded.config, loaded.configHash) }
  } catch (err) {
    if (options?.signal?.aborted) return { ok: false, message: 'cancelled' }
    return { ok: false, message: errorMessage(err) }
  }
}

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

const CONFIG_FILE = 'goblin.toml'
const SETUP_TIMEOUT_MS = 10 * 60_000
const WINDOWS_ROOTED_PATH_RE = /^(?:[A-Za-z]:|[\\/])/

export const DEFAULT_WORKTREE_BOOTSTRAP_CONFIG = `# Configure worktree bootstrap for this repo.
# Paths are repo-relative.

[worktree]
`

export async function initializeWorktreeBootstrapConfig(
  sourceCwd: string,
  options?: { signal?: AbortSignal },
): Promise<ExecResult> {
  try {
    if (options?.signal?.aborted) return { ok: false, message: 'cancelled' }
    const sourceRepoRoot = await getRepoRoot(sourceCwd, { signal: options?.signal })
    if (!sourceRepoRoot) return { ok: false, message: 'failed to resolve source repo root' }

    await fs.writeFile(path.join(path.resolve(sourceRepoRoot), CONFIG_FILE), DEFAULT_WORKTREE_BOOTSTRAP_CONFIG, {
      flag: 'wx',
    })
    return { ok: true, message: `${CONFIG_FILE} created` }
  } catch (err) {
    if (options?.signal?.aborted) return { ok: false, message: 'cancelled' }
    if (isErrno(err, 'EEXIST')) return { ok: false, message: 'error.file-exists' }
    return { ok: false, message: `failed to create ${CONFIG_FILE}: ${errorMessage(err)}` }
  }
}

export async function bootstrapWorktreeAfterCreate(
  sourceCwd: string,
  targetWorktreePath: string,
  options?: {
    signal?: AbortSignal
    expectedConfigHash?: string
    replaceExisting?: readonly WorktreeBootstrapTargetEntry[]
  },
): Promise<ExecResult> {
  try {
    if (options?.signal?.aborted) return { ok: false, message: 'cancelled' }
    const sourceRepoRoot = await getRepoRoot(sourceCwd, { signal: options?.signal })
    if (!sourceRepoRoot) return bootstrapFailure('failed to resolve source repo root')

    const sourceRoot = path.resolve(sourceRepoRoot)
    const targetRoot = path.resolve(targetWorktreePath)
    const loaded = await loadBootstrapConfig(sourceRoot)
    if (loaded.kind === 'none') {
      if (options?.expectedConfigHash) return bootstrapFailure(`${CONFIG_FILE} changed after confirmation`)
      return { ok: true, message: '' }
    }
    if (loaded.kind === 'error') return bootstrapFailure(loaded.message)
    if (options?.expectedConfigHash && loaded.configHash !== options.expectedConfigHash) {
      return bootstrapFailure(`${CONFIG_FILE} changed after confirmation`)
    }

    const planned = await planMaterializations(sourceRoot, targetRoot, loaded.config, options?.signal)
    if (!planned.ok) return bootstrapFailure(planned.message)

    const materialized = await materializePlan(
      sourceRoot,
      targetRoot,
      planned.operations,
      planned.excludedPaths,
      options?.signal,
      options?.replaceExisting,
    )
    if (!materialized.ok) return bootstrapFailure(materialized.message)

    if (loaded.config.setup) {
      const setup = await runSetupCommand(targetRoot, loaded.config.setup, options?.signal)
      if (!setup.ok) return bootstrapFailure(setup.message)
    }

    const summary = bootstrapSummary(planned.operations, planned.missingSources, loaded.config.setup)
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
    if (await pathExists(path.join(sourceRoot, CONFIG_FILE), { useLstat: true })) {
      return bootstrapFailure(`${CONFIG_FILE} changed after confirmation`)
    }

    const missingSources = new Set<string>()
    const literalOperations: PlannedMaterialization[] = []
    for (const selection of selections) {
      if (!isWorktreeBootstrapCandidatePath(selection.path)) {
        return bootstrapFailure(`invalid worktree bootstrap selection: ${selection.path}`)
      }
      if (selection.mode !== 'copy' && selection.mode !== 'symlink') {
        return bootstrapFailure(`invalid worktree bootstrap mode: ${String(selection.mode)}`)
      }
      const source = resolveConfigPath(sourceRoot, selection.path)
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
    let operations: ReadyMaterialization[]
    let hasSetup = false
    if (decision.kind === 'run') {
      const loaded = await loadBootstrapConfig(sourceRoot)
      if (loaded.kind !== 'ready') {
        return {
          ok: false,
          message: loaded.kind === 'none' ? `${CONFIG_FILE} changed after confirmation` : loaded.message,
        }
      }
      if (loaded.configHash !== decision.configHash) {
        return { ok: false, message: `${CONFIG_FILE} changed after confirmation` }
      }
      const planned = await planMaterializations(sourceRoot, targetRoot, loaded.config, options?.signal)
      if (!planned.ok) return planned
      operations = planned.operations
      hasSetup = !!loaded.config.setup
    } else {
      if (await pathExists(path.join(sourceRoot, CONFIG_FILE), { useLstat: true })) {
        return { ok: false, message: `${CONFIG_FILE} changed after confirmation` }
      }
      const planned = await planLiteralSelections(sourceRoot, targetRoot, decision.selections, options?.signal)
      if (!planned.ok) return planned
      operations = planned.operations
    }

    const classified = await classifyMaterializationTargets(operations, options?.signal)
    if (!classified.ok) return classified
    return { ok: true, preflight: { ...classified.preflight, hasSetup } }
  } catch (err) {
    if (options?.signal?.aborted) return { ok: false, message: 'cancelled' }
    return { ok: false, message: errorMessage(err) }
  }
}

async function loadBootstrapConfig(
  sourceRoot: string,
): Promise<
  | { kind: 'none' }
  | { kind: 'ready'; config: WorktreeBootstrapConfig; configHash: string }
  | { kind: 'error'; message: string }
> {
  let raw = ''
  try {
    raw = await fs.readFile(path.join(sourceRoot, CONFIG_FILE), 'utf8')
  } catch (err) {
    if (isErrno(err, 'ENOENT')) return { kind: 'none' }
    return { kind: 'error', message: `failed to read ${CONFIG_FILE}: ${errorMessage(err)}` }
  }
  const loaded = parseBootstrapConfig(raw)
  return loaded.kind === 'ready' ? { ...loaded, configHash: worktreeBootstrapConfigHash(raw) } : loaded
}

export function worktreeBootstrapConfigHash(raw: string): string {
  return `sha256:${createHash('sha256').update(raw, 'utf8').digest('hex')}`
}

export function parseBootstrapConfig(
  raw: string,
): { kind: 'none' } | { kind: 'ready'; config: WorktreeBootstrapConfig } | { kind: 'error'; message: string } {
  let parsed: unknown
  try {
    parsed = parse(raw)
  } catch (err) {
    return { kind: 'error', message: `invalid ${CONFIG_FILE}: ${errorMessage(err)}` }
  }

  const root = asRecord(parsed)
  if (!root) return { kind: 'error', message: `${CONFIG_FILE} must contain a table` }
  if (root.worktree === undefined) return { kind: 'none' }
  const worktree = asRecord(root.worktree)
  if (!worktree) return { kind: 'error', message: '[worktree] must be a table' }

  const copy = readStringList(worktree, 'copy')
  if (!copy.ok) return { kind: 'error', message: copy.message }
  const symlink = readStringList(worktree, 'symlink')
  if (!symlink.ok) return { kind: 'error', message: symlink.message }
  const hardlink = readStringList(worktree, 'hardlink')
  if (!hardlink.ok) return { kind: 'error', message: hardlink.message }
  const exclude = readStringList(worktree, 'exclude')
  if (!exclude.ok) return { kind: 'error', message: exclude.message }
  const setup = readSetupCommand(worktree)
  if (!setup.ok) return { kind: 'error', message: setup.message }

  return {
    kind: 'ready',
    config: {
      copy: copy.value,
      symlink: symlink.value,
      hardlink: hardlink.value,
      exclude: exclude.value,
      setup: setup.value,
    },
  }
}

export function validateBootstrapConfigPaths(
  config: WorktreeBootstrapConfig,
): { ok: true } | { ok: false; message: string } {
  for (const mode of materializationModes()) {
    for (const entry of config[mode]) {
      const valid = validateConfigPath(entry)
      if (!valid.ok) return valid
    }
  }
  for (const entry of config.exclude) {
    const valid = validateConfigPath(entry)
    if (!valid.ok) return valid
  }
  return { ok: true }
}

function readStringList(
  table: Record<string, unknown>,
  key: 'copy' | 'symlink' | 'hardlink' | 'exclude',
): { ok: true; value: string[] } | { ok: false; message: string } {
  const value = table[key]
  if (value === undefined) return { ok: true, value: [] }
  if (!Array.isArray(value)) return { ok: false, message: `[worktree].${key} must be an array of strings` }
  const strings: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') return { ok: false, message: `[worktree].${key} must be an array of strings` }
    strings.push(item)
  }
  return { ok: true, value: strings }
}

function readSetupCommand(
  table: Record<string, unknown>,
): { ok: true; value?: string } | { ok: false; message: string } {
  const value = table.setup
  if (value === undefined) return { ok: true }
  if (typeof value !== 'string') return { ok: false, message: '[worktree].setup must be a string' }
  if (value.includes('\0')) return { ok: false, message: '[worktree].setup must not contain NUL bytes' }
  return value.trim().length > 0 ? { ok: true, value } : { ok: true }
}

async function planMaterializations(
  sourceRoot: string,
  targetRoot: string,
  config: WorktreeBootstrapConfig,
  signal: AbortSignal | undefined,
): Promise<
  | { ok: true; operations: ReadyMaterialization[]; missingSources: string[]; excludedPaths: Set<string> }
  | { ok: false; message: string }
> {
  const missingSources = new Set<string>()
  const expanded = {
    copy: new Map<string, ConcreteSource>(),
    symlink: new Map<string, ConcreteSource>(),
    hardlink: new Map<string, ConcreteSource>(),
  } satisfies Record<MaterializationMode, Map<string, ConcreteSource>>

  for (const mode of materializationModes()) {
    const result = await expandSources(sourceRoot, config[mode], signal)
    if (!result.ok) return result
    for (const missing of result.missingSources) missingSources.add(missing)
    for (const source of result.sources) expanded[mode].set(source.rel, source)
  }

  const excludes = await expandExcludes(sourceRoot, config.exclude, signal)
  if (!excludes.ok) return excludes
  for (const mode of materializationModes()) {
    for (const rel of expanded[mode].keys()) {
      if (isExcludedPath(rel, excludes.paths)) expanded[mode].delete(rel)
    }
  }

  const ambiguous = findAmbiguousSource(expanded)
  if (ambiguous) return { ok: false, message: `path matches multiple materialization modes: ${ambiguous}` }

  const planned: PlannedMaterialization[] = []
  for (const mode of materializationModes()) {
    for (const source of expanded[mode].values()) planned.push({ ...source, mode })
  }

  const ready = await validateMaterializations(sourceRoot, targetRoot, planned, missingSources, signal)
  if (!ready.ok) return ready

  const nested = findNestedDestinationConflict(ready.operations)
  if (nested) return { ok: false, message: `materialization paths overlap: ${nested}` }

  return {
    ok: true,
    operations: ready.operations,
    missingSources: Array.from(missingSources),
    excludedPaths: excludes.paths,
  }
}

async function planLiteralSelections(
  sourceRoot: string,
  targetRoot: string,
  selections: readonly WorktreeBootstrapSelection[],
  signal: AbortSignal | undefined,
): Promise<{ ok: true; operations: ReadyMaterialization[]; missingSources: string[] } | { ok: false; message: string }> {
  const missingSources = new Set<string>()
  const literalOperations: PlannedMaterialization[] = []
  for (const selection of selections) {
    if (!isWorktreeBootstrapCandidatePath(selection.path)) {
      return { ok: false, message: `invalid worktree bootstrap selection: ${selection.path}` }
    }
    if (selection.mode !== 'copy' && selection.mode !== 'symlink') {
      return { ok: false, message: `invalid worktree bootstrap mode: ${String(selection.mode)}` }
    }
    const source = resolveConfigPath(sourceRoot, selection.path)
    if (!source.ok) return source
    literalOperations.push({ ...source, mode: selection.mode })
  }

  const ready = await validateMaterializations(sourceRoot, targetRoot, literalOperations, missingSources, signal)
  if (!ready.ok) return ready
  const unsupported = ready.operations.find((operation) => !operation.stat.isFile() && !operation.stat.isDirectory())
  if (unsupported) return { ok: false, message: `unsupported worktree bootstrap source: ${unsupported.rel}` }
  return { ok: true, operations: ready.operations, missingSources: Array.from(missingSources) }
}

async function expandSources(
  sourceRoot: string,
  entries: string[],
  signal: AbortSignal | undefined,
): Promise<{ ok: true; sources: ConcreteSource[]; missingSources: string[] } | { ok: false; message: string }> {
  const sources = new Map<string, ConcreteSource>()
  const missingSources = new Set<string>()

  for (const entry of entries) {
    if (signal?.aborted) return { ok: false, message: 'cancelled' }
    const valid = validateConfigPath(entry)
    if (!valid.ok) return valid

    if (!isDynamicPattern(entry)) {
      const source = resolveConfigPath(sourceRoot, normalizeRelativePath(entry))
      if (!source.ok) return source
      if (!(await pathExists(source.abs))) {
        missingSources.add(source.rel)
        continue
      }
      sources.set(source.rel, source)
      continue
    }

    const matches = await glob(entry, globOptions(sourceRoot, signal))
    for (const match of matches) {
      const source = resolveConfigPath(sourceRoot, normalizeRelativePath(match))
      if (!source.ok) return source
      sources.set(source.rel, source)
    }
  }

  return { ok: true, sources: Array.from(sources.values()), missingSources: Array.from(missingSources) }
}

async function expandExcludes(
  sourceRoot: string,
  entries: string[],
  signal: AbortSignal | undefined,
): Promise<{ ok: true; paths: Set<string> } | { ok: false; message: string }> {
  const paths = new Set<string>()
  for (const entry of entries) {
    if (signal?.aborted) return { ok: false, message: 'cancelled' }
    const valid = validateConfigPath(entry)
    if (!valid.ok) return valid

    if (!isDynamicPattern(entry)) {
      const source = resolveConfigPath(sourceRoot, normalizeRelativePath(entry))
      if (!source.ok) return source
      if (await pathExists(source.abs)) paths.add(source.rel)
      continue
    }

    const matches = await glob(entry, globOptions(sourceRoot, signal))
    for (const match of matches) {
      const source = resolveConfigPath(sourceRoot, normalizeRelativePath(match))
      if (!source.ok) return source
      paths.add(source.rel)
    }
  }
  return { ok: true, paths }
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
    const source = resolveConfigPath(sourceRoot, item.rel)
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
        const copied = await materializeCopy(
          sourceRoot,
          targetRoot,
          item,
          excludedPaths,
          replacementKeys,
          signal,
        )
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

async function runSetupCommand(
  targetRoot: string,
  setup: string,
  signal: AbortSignal | undefined,
): Promise<ExecResult> {
  if (signal?.aborted) return { ok: false, message: 'cancelled' }
  try {
    await fs.access(targetRoot, fsConstants.R_OK | fsConstants.W_OK)
    const invocation = buildSetupInvocation(setup)
    const result = await execa(invocation.command, invocation.args, {
      cwd: targetRoot,
      timeout: SETUP_TIMEOUT_MS,
      cancelSignal: signal,
      forceKillAfterDelay: 500,
      maxBuffer: 10 * 1024 * 1024,
    })
    return { ok: true, message: result.stdout.trim() }
  } catch (err) {
    if (err instanceof ExecaError) {
      if (signal?.aborted || err.isCanceled) return { ok: false, message: 'cancelled' }
      if (err.timedOut) return { ok: false, message: `setup timed out after ${SETUP_TIMEOUT_MS / 1000}s` }
      const output = [String(err.stderr ?? '').trim(), String(err.stdout ?? '').trim()].filter(Boolean)
      return { ok: false, message: output.join('\n').trim() || err.message || 'setup failed' }
    }
    return { ok: false, message: errorMessage(err) }
  }
}

function buildSetupInvocation(setup: string): { command: string; args: string[] } {
  const shell = process.env.SHELL?.trim()
  // An interactive login shell loads the user's normal terminal environment
  // (e.g. ~/.zshrc / ~/.bashrc as well as ~/.zprofile / ~/.bash_profile),
  // so tools like bun, nvm, and pnpm resolve without absolute paths.
  if (shell) return { command: shell, args: ['-il', '-c', setup] }
  return { command: '/bin/sh', args: ['-c', setup] }
}

function materializationModes(): MaterializationMode[] {
  return ['copy', 'symlink', 'hardlink']
}

function validateConfigPath(entry: string): { ok: true } | { ok: false; message: string } {
  if (entry.length === 0) return { ok: false, message: 'bootstrap path must not be empty' }
  if (/[\0-\x1f\x7f]/.test(entry)) return { ok: false, message: `bootstrap path contains control characters: ${entry}` }
  if (entry.startsWith('!')) return { ok: false, message: `negative glob patterns are not supported: ${entry}` }
  if (path.isAbsolute(entry) || WINDOWS_ROOTED_PATH_RE.test(entry))
    return { ok: false, message: `bootstrap path must be relative: ${entry}` }
  if (normalizeRelativePath(entry) === '.')
    return { ok: false, message: `bootstrap path must not target repo root: ${entry}` }

  const segments = entry.replace(/\\/g, '/').split('/').filter(Boolean)
  if (segments.includes('..')) return { ok: false, message: `bootstrap path escapes repo root: ${entry}` }
  if (segments.includes('.git')) return { ok: false, message: `bootstrap path must not target .git: ${entry}` }
  return { ok: true }
}

function resolveConfigPath(
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

function globOptions(sourceRoot: string, signal: AbortSignal | undefined) {
  return {
    cwd: sourceRoot,
    absolute: false,
    onlyFiles: false,
    dot: true,
    expandDirectories: false,
    followSymbolicLinks: false,
    ignore: ['.git', '.git/**', '**/.git', '**/.git/**'],
    signal,
  }
}

function findAmbiguousSource(expanded: Record<MaterializationMode, Map<string, ConcreteSource>>): string | null {
  const firstModeByPath = new Map<string, MaterializationMode>()
  for (const mode of materializationModes()) {
    for (const rel of expanded[mode].keys()) {
      const existing = firstModeByPath.get(rel)
      if (existing && existing !== mode) return rel
      firstModeByPath.set(rel, mode)
    }
  }
  return null
}

function findNestedDestinationConflict(operations: ReadyMaterialization[]): string | null {
  const rels = operations.map((item) => item.rel).sort((a, b) => a.length - b.length)
  for (let i = 0; i < rels.length; i += 1) {
    const parent = rels[i]!
    for (let j = i + 1; j < rels.length; j += 1) {
      const child = rels[j]!
      if (child.startsWith(`${parent}/`)) return `${parent} contains ${child}`
    }
  }
  return null
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

async function pathExists(target: string, options?: { useLstat?: boolean }): Promise<boolean> {
  try {
    if (options?.useLstat) await fs.lstat(target)
    else await fs.access(target, fsConstants.F_OK)
    return true
  } catch (err) {
    if (isErrno(err, 'ENOENT')) return false
    throw err
  }
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function isErrno(err: unknown, code: string): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: unknown }).code === code
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
