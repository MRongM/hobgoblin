import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { parseRemoteRepoId } from '#/shared/remote-repo.ts'
import type {
  WorktreeDependencyExecuteResult,
  WorktreeDependencyPlan,
  WorktreeDependencyPlanRequest,
  WorktreeDependencyPlanResult,
  WorktreeDependencyReadInput,
  WorktreeDependencyReadResult,
  WorktreeDependencyTarget,
} from '#/shared/worktree-dependencies.ts'
import {
  applyWorktreeDependency,
  dependencyError,
  dependencyName,
  fingerprintWorktreeDependency,
  inspectWorktreeDependencies,
  type WorktreeDependencyInspection,
} from '#/server/modules/worktree-dependency-source.ts'
import { acquireFolderMutationScopes } from '#/server/modules/folder-mutation-locks.ts'
import { readAllBranchWorkspaceManifests } from '#/server/modules/branch-workspace-source.ts'
import { publishWorkspaceInvalidation } from '#/server/modules/invalidation-broker.ts'
import { publishRepositorySnapshotInvalidation } from '#/server/modules/repo-write-paths.ts'

const PLAN_TTL_MS = 20 * 60 * 1000
const EXECUTE_TIMEOUT_MS = 10 * 60 * 1000
const MAX_SELECTED_ENTRIES = 256
interface PendingPlan {
  input: WorktreeDependencyReadInput
  inspection: WorktreeDependencyInspection
  plan: WorktreeDependencyPlan
  fingerprints: Map<string, string>
  expiresAt: number
}
export interface WorktreeDependencyWriteService {
  read(input: WorktreeDependencyReadInput, signal?: AbortSignal): Promise<WorktreeDependencyReadResult>
  plan(request: WorktreeDependencyPlanRequest, signal?: AbortSignal): Promise<WorktreeDependencyPlanResult>
  execute(planToken: string): Promise<WorktreeDependencyExecuteResult>
  abort(input: WorktreeDependencyTarget): boolean
  isActive(input: WorktreeDependencyTarget): boolean
}

export function createWorktreeDependencyWriteService(): WorktreeDependencyWriteService {
  const plans = new Map<string, PendingPlan>()
  const active = new Map<string, AbortController>()
  const planning = new Map<string, AbortController>()

  return {
    async read(input, signal) {
      try {
        const snapshot = await inspectWorktreeDependencies(input, signal)
        return { ok: true, sourceWorktreePath: snapshot.sourceRoot, candidates: snapshot.candidates }
      } catch (error) {
        return { ok: false, message: dependencyError(error, 'read-failed') }
      }
    },
    async plan(request, signal) {
      let key: string
      try {
        validateRequest(request)
        key = targetKey(request)
      } catch (error) {
        return { ok: false, message: dependencyError(error) }
      }
      if (active.has(key)) return failure('operation-in-progress')
      planning.get(key)?.abort()
      const controller = new AbortController()
      planning.set(key, controller)
      const planningSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal
      try {
        const input: WorktreeDependencyReadInput = {
          repoId: request.repoId,
          worktreePath: request.worktreePath,
          operation: request.operation,
          ...(request.operation === 'add' ? { sourceWorktreePath: request.sourceWorktreePath } : {}),
        }
        const inspection = await inspectWorktreeDependencies(input, planningSignal)
        if (active.has(targetKey({ repoId: request.repoId, worktreePath: inspection.targetRoot })))
          return failure('operation-in-progress')
        const selected =
          request.operation === 'add'
            ? request.entries
            : request.paths.map((entryPath) => ({ path: entryPath, mode: undefined }))
        const fingerprints = new Map<string, string>()
        const api = parseRemoteRepoId(request.repoId) ? path.posix : path
        const entries: WorktreeDependencyPlan['entries'] = []
        for (const selection of selected) {
          planningSignal.throwIfAborted()
          const candidate = inspection.candidates.find((item) => item.path === selection.path)
          if (!candidate) return failure('tracked')
          if (request.operation === 'add' && candidate.targetExists) return failure('target-exists')
          fingerprints.set(
            selection.path,
            await fingerprintWorktreeDependency(input, inspection, selection.path, planningSignal, selection.mode),
          )
          entries.push({
            path: selection.path,
            kind: candidate.kind,
            targetPath: candidate.targetPath,
            ...(request.operation === 'add'
              ? { sourcePath: api.join(inspection.sourceRoot, selection.path), mode: selection.mode }
              : {}),
          })
        }
        planningSignal.throwIfAborted()
        for (const [token, pending] of plans) if (pending.expiresAt <= Date.now()) plans.delete(token)
        while (plans.size >= 256) plans.delete(plans.keys().next().value!)
        const plan: WorktreeDependencyPlan = {
          token: randomUUID(),
          operation: request.operation,
          worktreePath: inspection.targetRoot,
          entries,
        }
        plans.set(plan.token, { input, inspection, plan, fingerprints, expiresAt: Date.now() + PLAN_TTL_MS })
        return { ok: true, plan }
      } catch (error) {
        return { ok: false, message: dependencyError(error) }
      } finally {
        if (planning.get(key) === controller) planning.delete(key)
      }
    },
    async execute(planToken) {
      const pending = typeof planToken === 'string' ? plans.get(planToken) : undefined
      if (!pending || pending.expiresAt <= Date.now()) {
        if (typeof planToken === 'string') plans.delete(planToken)
        return { ok: false, message: 'worktree-dependencies.plan-stale', completedPaths: [] }
      }
      const { input, inspection, plan } = pending
      const keys = [
        ...new Set([targetKey(input), targetKey({ repoId: input.repoId, worktreePath: inspection.targetRoot })]),
      ]
      if (keys.some((key) => active.has(key)))
        return { ok: false, message: 'worktree-dependencies.operation-in-progress', completedPaths: [] }
      const release = acquireFolderMutationScopes([
        { repoId: input.repoId, path: input.worktreePath },
        { repoId: input.repoId, path: inspection.targetRoot },
        ...(input.operation === 'add'
          ? [
              { repoId: input.repoId, path: input.sourceWorktreePath! },
              { repoId: input.repoId, path: inspection.sourceRoot },
            ]
          : []),
      ])
      if (!release) return { ok: false, message: 'worktree-dependencies.operation-in-progress', completedPaths: [] }
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), EXECUTE_TIMEOUT_MS)
      for (const key of keys) {
        active.set(key, controller)
        planning.get(key)?.abort()
      }
      plans.delete(planToken)
      const completedPaths: string[] = []
      let attempted = false
      try {
        const current = await inspectWorktreeDependencies(input, controller.signal)
        if (current.identity !== inspection.identity)
          return { ok: false, message: 'worktree-dependencies.plan-stale', completedPaths }
        for (const entry of plan.entries) {
          controller.signal.throwIfAborted()
          // A failed/cancelled copy or directory removal can leave partial contents.
          // Invalidate even that entry; never delete residual data as implicit rollback.
          attempted = true
          await applyWorktreeDependency(
            input,
            inspection,
            entry,
            pending.fingerprints.get(entry.path)!,
            controller.signal,
          )
          completedPaths.push(entry.path)
        }
        return { ok: true, completedPaths }
      } catch (error) {
        return { ok: false, message: dependencyError(error), completedPaths }
      } finally {
        clearTimeout(timer)
        for (const key of keys) if (active.get(key) === controller) active.delete(key)
        release()
        if (attempted) await publishChanges(input.repoId)
      }
    },
    abort(input) {
      const controller = active.get(targetKey(input))
      if (!controller) return false
      controller.abort()
      return true
    },
    isActive(input) {
      return active.has(targetKey(input))
    },
  }
}

function validateRequest(request: WorktreeDependencyPlanRequest): void {
  if (!request || typeof request.repoId !== 'string' || typeof request.worktreePath !== 'string') invalid()
  const values = request.operation === 'add' ? request.entries : request.operation === 'remove' ? request.paths : null
  if (!Array.isArray(values) || values.length === 0 || values.length > MAX_SELECTED_ENTRIES) invalid()
  const names = new Set<string>()
  for (const value of values) {
    const name = request.operation === 'add' ? (value as { path?: unknown } | null)?.path : value
    if (!dependencyName(name) || names.has(name)) invalid()
    names.add(name)
    if (
      request.operation === 'add' &&
      (!(value as { mode?: unknown }) || !['copy', 'symlink'].includes((value as { mode: string }).mode))
    )
      invalid()
  }
  if (request.operation === 'add' && (typeof request.sourceWorktreePath !== 'string' || !request.sourceWorktreePath))
    invalid()
}
function invalid(): never {
  throw new Error('worktree-dependencies.invalid-source')
}
function failure(code: string): { ok: false; message: string } {
  return { ok: false, message: `worktree-dependencies.${code}` }
}
function targetKey(input: WorktreeDependencyTarget): string {
  const remote = parseRemoteRepoId(input.repoId)
  const api = remote ? path.posix : path
  const worktreePath = api.resolve(input.worktreePath)
  return `${remote ? `${remote.transport ?? 'ssh'}:${remote.alias}` : 'local'}\0${!remote && process.platform === 'win32' ? worktreePath.toLowerCase() : worktreePath}`
}
async function publishChanges(repoId: string): Promise<void> {
  publishRepositorySnapshotInvalidation(repoId)
  const snapshot = await readAllBranchWorkspaceManifests().catch(() => null)
  if (snapshot?.kind !== 'ready') return
  const remote = parseRemoteRepoId(repoId)
  // Members are derived from disk and may be directory aliases. Refresh all registered
  // groups on the affected host instead of persisting a second member ownership index.
  const roots = new Set(
    snapshot.manifests
      .filter((manifest) => {
        const other = parseRemoteRepoId(manifest.rootId)
        return remote ? !!other && remote.alias === other.alias && remote.transport === other.transport : !other
      })
      .map((manifest) => manifest.rootId),
  )
  for (const root of roots) publishWorkspaceInvalidation(root)
}
