import { createHash } from 'node:crypto'
import path from 'node:path'
import {
  fingerprintBranchWorkspaceEntry,
  inspectBranchWorkspacePath,
} from '#/server/modules/branch-workspace-materialization-source.ts'
import { readBranchWorkspaceSnapshot } from '#/server/modules/branch-workspace-read.ts'
import type {
  BranchWorkspaceDependencyAddPlan,
  BranchWorkspaceDependencyCandidate,
  BranchWorkspaceDependencyPlan,
  BranchWorkspaceDependencyPlanRequest,
  BranchWorkspaceDependencyPlanResult,
  BranchWorkspaceDependencyReadResult,
  BranchWorkspaceDependencyRemovePlan,
} from '#/shared/branch-workspace-dependencies.ts'
import type { BranchWorkspaceReadResult } from '#/shared/branch-workspaces.ts'
import { isRemoteRepoId } from '#/shared/remote-repo.ts'

export interface BranchWorkspaceDependencyPlanDependencies {
  readSnapshot?: (rootId: string, signal?: AbortSignal) => Promise<BranchWorkspaceReadResult>
  inspectPath?: typeof inspectBranchWorkspacePath
  fingerprintEntry?: typeof fingerprintBranchWorkspaceEntry
}

export async function readBranchWorkspaceDependencyCandidates(
  rootId: string,
  branchWorkspaceId: string,
  signal?: AbortSignal,
  dependencies: BranchWorkspaceDependencyPlanDependencies = {},
): Promise<BranchWorkspaceDependencyReadResult> {
  try {
    signal?.throwIfAborted()
    const snapshot = await (dependencies.readSnapshot ?? readBranchWorkspaceSnapshot)(rootId, signal)
    if (!snapshot.ok) return snapshot
    const workspace = snapshot.items.find((item) => item.id === branchWorkspaceId)
    if (!workspace) return { ok: false, message: 'workspace.branch-workspace.manifest-missing' }
    if (workspace.state.kind !== 'ready') {
      return { ok: false, message: 'workspace.branch-workspace.dependency.not-ready' }
    }

    const inspectPath = dependencies.inspectPath ?? inspectBranchWorkspacePath
    const pathApi = isRemoteRepoId(snapshot.rootId) ? path.posix : path
    const candidates: BranchWorkspaceDependencyCandidate[] = []
    for (const source of snapshot.auxiliaryCandidates) {
      signal?.throwIfAborted()
      const targetPath = pathApi.join(workspace.path, source.name)
      const target = await inspectPath(snapshot.rootId, targetPath, signal)
      candidates.push({
        name: source.name,
        sourcePath: source.path,
        sourceKind: source.kind,
        targetPath,
        targetKind: target.exists ? target.kind : 'missing',
        outsideRoot: source.outsideRoot,
      })
    }
    return { ok: true, rootId: snapshot.rootId, branchWorkspaceId, candidates }
  } catch (error) {
    if (isAbortError(error)) throw error
    return { ok: false, message: operationMessage(error, 'workspace.branch-workspace.dependency.read-failed') }
  }
}

export async function buildBranchWorkspaceDependencyPlan(
  rootId: string,
  request: BranchWorkspaceDependencyPlanRequest,
  dependencies: BranchWorkspaceDependencyPlanDependencies = {},
  signal?: AbortSignal,
): Promise<BranchWorkspaceDependencyPlanResult> {
  const read = await readBranchWorkspaceDependencyCandidates(
    rootId,
    request.branchWorkspaceId,
    signal,
    dependencies,
  )
  if (!read.ok) return read
  const byName = new Map(read.candidates.map((candidate) => [candidate.name, candidate]))

  if (request.operation === 'add') {
    const entries: BranchWorkspaceDependencyAddPlan['entries'] = []
    for (const selection of [...request.entries].sort(compareName)) {
      const candidate = byName.get(selection.name)
      if (!candidate) return { ok: false, message: 'workspace.branch-workspace.dependency.unavailable' }
      if (candidate.targetKind !== 'missing') {
        return { ok: false, message: 'workspace.branch-workspace.dependency.target-exists' }
      }
      entries.push({
        name: candidate.name,
        mode: selection.mode,
        sourcePath: candidate.sourcePath,
        sourceKind: candidate.sourceKind,
        targetPath: candidate.targetPath,
        outsideRoot: candidate.outsideRoot,
      })
    }
    const plan = withoutToken({
      rootId: read.rootId,
      operation: 'add',
      branchWorkspaceId: request.branchWorkspaceId,
      entries,
      requiredApprovals: entries.some((entry) => entry.outsideRoot) ? ['outside-root-source'] : [],
    })
    return { ok: true, plan }
  }

  const fingerprintEntry = dependencies.fingerprintEntry ?? fingerprintBranchWorkspaceEntry
  const entries: BranchWorkspaceDependencyRemovePlan['entries'] = []
  for (const name of [...request.names].sort(compareText)) {
    signal?.throwIfAborted()
    const candidate = byName.get(name)
    if (!candidate) return { ok: false, message: 'workspace.branch-workspace.dependency.unavailable' }
    if (candidate.targetKind === 'missing') {
      return { ok: false, message: 'workspace.branch-workspace.dependency.target-missing' }
    }
    try {
      entries.push({
        name: candidate.name,
        sourcePath: candidate.sourcePath,
        targetPath: candidate.targetPath,
        targetKind: candidate.targetKind,
        fingerprint: await fingerprintEntry(read.rootId, candidate.targetPath, signal),
      })
    } catch (error) {
      if (isAbortError(error)) throw error
      return { ok: false, message: operationMessage(error, 'workspace.branch-workspace.dependency.read-failed') }
    }
  }
  const plan = withoutToken({
    rootId: read.rootId,
    operation: 'remove',
    branchWorkspaceId: request.branchWorkspaceId,
    entries,
    requiredApprovals: [],
  })
  return { ok: true, plan }
}

function withoutToken(plan: Omit<BranchWorkspaceDependencyPlan, 'token'>): BranchWorkspaceDependencyPlan {
  const token = `sha256:${createHash('sha256').update(JSON.stringify(plan), 'utf8').digest('hex')}`
  return { token, ...plan } as BranchWorkspaceDependencyPlan
}

function compareName(
  left: { name: string },
  right: { name: string },
): number {
  return compareText(left.name, right.name)
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function operationMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : ''
  return message || fallback
}
