import { createHash } from 'node:crypto'
import {
  cleanupWorkspaceConfig,
  inspectWorkspaceConfigCleanup,
  type WorkspaceConfigCleanupPlan,
} from '#/server/modules/workspace-config-source.ts'
import {
  discardBranchWorkspaceRecords,
  readBranchWorkspaceManifests,
} from '#/server/modules/branch-workspace-source.ts'
import {
  createBranchWorkspaceWriteService,
  type BranchWorkspaceWriteService,
} from '#/server/modules/branch-workspace-write-paths.ts'
import { discoverWorkspaceRepositories } from '#/server/modules/workspace-read.ts'
import { importWorkspaceRepositories } from '#/server/modules/workspace-import-write-paths.ts'
import { publishWorkspaceInvalidation } from '#/server/modules/invalidation-broker.ts'
import type { BranchWorkspaceManifest, BranchWorkspacePlan } from '#/shared/branch-workspaces.ts'
import type {
  WorkspaceRecoveryBranchOutcome,
  WorkspaceRecoveryBranchPlan,
  WorkspaceRecoveryExecuteInput,
  WorkspaceRecoveryExecuteResult,
  WorkspaceRecoveryPlan,
  WorkspaceRecoveryPlanResult,
} from '#/shared/workspace-recovery.ts'

interface PendingRecoveryBranch {
  plan: WorkspaceRecoveryBranchPlan
  ordinaryPlanToken?: string
}

interface PendingWorkspaceRecovery {
  plan: WorkspaceRecoveryPlan
  cleanupPlan: WorkspaceConfigCleanupPlan
  branchManifestFingerprint: string
  branches: PendingRecoveryBranch[]
}

export interface WorkspaceRecoveryWriteDependencies {
  branchService?: BranchWorkspaceWriteService
  inspectConfigCleanup?: typeof inspectWorkspaceConfigCleanup
  cleanupConfig?: typeof cleanupWorkspaceConfig
  discover?: typeof discoverWorkspaceRepositories
  readManifests?: typeof readBranchWorkspaceManifests
  discardRecords?: typeof discardBranchWorkspaceRecords
  importWorkspace?: typeof importWorkspaceRepositories
  publishInvalidation?: typeof publishWorkspaceInvalidation
}

export interface WorkspaceRecoveryWriteService {
  plan(rootId: string): Promise<WorkspaceRecoveryPlanResult>
  execute(rootId: string, input: WorkspaceRecoveryExecuteInput): Promise<WorkspaceRecoveryExecuteResult>
  abort(rootId: string): boolean
}

export function createWorkspaceRecoveryWriteService(
  dependencies: WorkspaceRecoveryWriteDependencies = {},
): WorkspaceRecoveryWriteService {
  const branchService = dependencies.branchService ?? createBranchWorkspaceWriteService()
  const inspectConfigCleanup = dependencies.inspectConfigCleanup ?? inspectWorkspaceConfigCleanup
  const cleanupConfig = dependencies.cleanupConfig ?? cleanupWorkspaceConfig
  const discover = dependencies.discover ?? discoverWorkspaceRepositories
  const readManifests = dependencies.readManifests ?? readBranchWorkspaceManifests
  const discardRecords = dependencies.discardRecords ?? discardBranchWorkspaceRecords
  const importWorkspace = dependencies.importWorkspace ?? importWorkspaceRepositories
  const publishInvalidation = dependencies.publishInvalidation ?? publishWorkspaceInvalidation
  const publishChange = (rootId: string, sourceToken?: string) => {
    if (sourceToken) publishInvalidation(rootId, sourceToken)
    else publishInvalidation(rootId)
  }
  const pendingByRoot = new Map<string, PendingWorkspaceRecovery>()
  const activeByRoot = new Map<string, AbortController>()
  const activeBranchRemovalRoots = new Set<string>()

  return {
    async plan(rootId) {
      if (activeByRoot.has(rootId)) return failure('workspace.recovery.operation-in-progress')
      try {
        const [cleanupPlan, discovery, manifestSnapshot] = await Promise.all([
          inspectConfigCleanup(rootId),
          discover(rootId),
          readManifests(rootId),
        ])
        if (!discovery.ok) return failure(discovery.message)
        if (manifestSnapshot.kind === 'invalid') return failure(manifestSnapshot.message)

        const manifests = manifestSnapshot.kind === 'ready' ? manifestSnapshot.manifests : []
        const branchManifestFingerprint = fingerprintBranchWorkspaceManifests(manifests)
        const branches: PendingRecoveryBranch[] = []
        for (const manifest of manifests) {
          const ordinary = await branchService.plan(rootId, removalRequest(manifest.id))
          if (ordinary.ok) {
            branches.push({
              plan: publicBranchPlan(manifest, 'remove', ordinary.plan.requiredApprovals),
              ordinaryPlanToken: ordinary.plan.token,
            })
          } else {
            if (ordinary.message === 'workspace.branch-workspace.operation-in-progress') {
              return failure('workspace.recovery.operation-in-progress')
            }
            branches.push({
              plan: publicBranchPlan(manifest, 'record-only', [], ordinary.message),
            })
          }
        }

        const planWithoutToken: Omit<WorkspaceRecoveryPlan, 'token'> = {
          rootId: cleanupPlan.rootId,
          cleanupScope: cleanupPlan.scope,
          branchWorkspaces: branches.map((branch) => branch.plan),
          configuredRepositoryNames:
            discovery.configuration.kind === 'ready' ? [...discovery.configuration.config.repo] : [],
          discoveredRepositoryNames: discovery.candidates
            .filter((candidate) => candidate.available)
            .map((candidate) => candidate.name),
        }
        const token = recoveryPlanToken(planWithoutToken, cleanupPlan, branchManifestFingerprint, branches)
        const plan = { token, ...planWithoutToken }
        pendingByRoot.set(rootId, { plan, cleanupPlan, branchManifestFingerprint, branches })
        return { ok: true, plan }
      } catch (error) {
        return failure(recoveryMessage(error))
      }
    },

    async execute(rootId, input) {
      const pending = pendingByRoot.get(rootId)
      if (!pending || pending.plan.token !== input.planToken) return failure('workspace.recovery.plan-stale')
      if (activeByRoot.has(rootId)) return failure('workspace.recovery.operation-in-progress')

      const controller = new AbortController()
      activeByRoot.set(rootId, controller)
      try {
        const currentCleanup = await inspectConfigCleanup(rootId)
        if (!sameCleanupPlan(pending.cleanupPlan, currentCleanup)) {
          return failure('workspace.recovery.plan-stale')
        }
        const currentManifestSnapshot = await readManifests(rootId)
        if (currentManifestSnapshot.kind === 'invalid') return failure('workspace.recovery.plan-stale')
        const currentManifests = currentManifestSnapshot.kind === 'ready' ? currentManifestSnapshot.manifests : []
        if (fingerprintBranchWorkspaceManifests(currentManifests) !== pending.branchManifestFingerprint) {
          return failure('workspace.recovery.plan-stale')
        }

        const preflightFallbacks = new Map<string, string>()
        for (const branch of pending.branches) {
          if (cancelled(controller)) return cancelledFailure()
          if (branch.plan.mode === 'record-only') continue
          const replanned = await branchService.plan(rootId, removalRequest(branch.plan.id))
          if (!replanned.ok) {
            const blocker = recoveryBlockerMessage(replanned.message)
            if (blocker) return failure(blocker)
            preflightFallbacks.set(branch.plan.id, replanned.message)
            continue
          }
          if (replanned.plan.token !== branch.ordinaryPlanToken) return failure('workspace.recovery.plan-stale')
        }

        const outcomes: WorkspaceRecoveryBranchOutcome[] = []
        for (const branch of pending.branches) {
          if (cancelled(controller)) return cancelledFailure()
          const preflightMessage = preflightFallbacks.get(branch.plan.id)
          if (branch.plan.mode === 'record-only' || preflightMessage) {
            const message = preflightMessage ?? branch.plan.message
            const discarded = await discardRecord(rootId, branch.plan.id, discardRecords, controller)
            if (!discarded.ok) return discarded
            publishChange(rootId, input.sourceToken)
            outcomes.push(recordRemovedOutcome(branch.plan, message))
            continue
          }

          const replanned = await branchService.plan(rootId, removalRequest(branch.plan.id))
          if (cancelled(controller)) return cancelledFailure()
          if (!replanned.ok) {
            const blocker = recoveryBlockerMessage(replanned.message)
            if (blocker) return failure(blocker)
            const discarded = await discardRecord(rootId, branch.plan.id, discardRecords, controller)
            if (!discarded.ok) return discarded
            publishChange(rootId, input.sourceToken)
            outcomes.push(recordRemovedOutcome(branch.plan, replanned.message))
            continue
          }
          if (replanned.plan.token !== branch.ordinaryPlanToken) return failure('workspace.recovery.plan-stale')
          let removed: Awaited<ReturnType<BranchWorkspaceWriteService['execute']>>
          activeBranchRemovalRoots.add(rootId)
          try {
            removed = await branchService.execute(rootId, {
              planToken: replanned.plan.token,
              approvals: [...replanned.plan.requiredApprovals],
              ...(input.sourceToken ? { sourceToken: input.sourceToken } : {}),
            })
          } finally {
            activeBranchRemovalRoots.delete(rootId)
          }
          if (cancelled(controller) || (!removed.ok && removed.message === 'cancelled')) return cancelledFailure()
          if (!removed.ok) {
            const blocker = recoveryBlockerMessage(removed.message)
            if (blocker) return failure(blocker)
            const discarded = await discardRecord(rootId, branch.plan.id, discardRecords, controller)
            if (!discarded.ok) return discarded
            publishChange(rootId, input.sourceToken)
            outcomes.push(recordRemovedOutcome(branch.plan, removed.message))
            continue
          }
          outcomes.push({ id: branch.plan.id, branch: branch.plan.branch, outcome: 'removed' })
        }

        if (cancelled(controller)) return cancelledFailure()
        await cleanupConfig(pending.cleanupPlan)
        if (cancelled(controller)) return cancelledFailure()
        const workspace = await importWorkspace(rootId, {
          ...(input.sourceToken ? { sourceToken: input.sourceToken } : {}),
        })
        if (!workspace.ok) return failure(workspace.message)
        publishChange(rootId, input.sourceToken)
        return {
          ok: true,
          outcome: outcomes.some((branch) => branch.outcome === 'record-removed')
            ? 'completed-with-residuals'
            : 'completed',
          workspace,
          branches: outcomes,
        }
      } catch (error) {
        if (cancelled(controller)) return cancelledFailure()
        return failure(recoveryMessage(error))
      } finally {
        pendingByRoot.delete(rootId)
        if (activeByRoot.get(rootId) === controller) activeByRoot.delete(rootId)
      }
    },

    abort(rootId) {
      const controller = activeByRoot.get(rootId)
      if (!controller) return false
      controller.abort()
      if (activeBranchRemovalRoots.has(rootId)) branchService.abort(rootId)
      return true
    },
  }
}

function removalRequest(branchWorkspaceId: string) {
  return {
    operation: 'remove' as const,
    branchWorkspaceId,
    alsoDeleteBranch: false,
    alsoDeleteUpstream: false,
  }
}

function publicBranchPlan(
  manifest: BranchWorkspaceManifest,
  mode: WorkspaceRecoveryBranchPlan['mode'],
  requiredApprovals: BranchWorkspacePlan['requiredApprovals'],
  message?: string,
): WorkspaceRecoveryBranchPlan {
  return {
    id: manifest.id,
    branch: manifest.branch,
    path: manifest.path,
    mode,
    requiredApprovals: [...requiredApprovals],
    ...(message ? { message } : {}),
  }
}

function recoveryPlanToken(
  plan: Omit<WorkspaceRecoveryPlan, 'token'>,
  cleanupPlan: WorkspaceConfigCleanupPlan,
  branchManifestFingerprint: string,
  branches: PendingRecoveryBranch[],
): string {
  const payload = JSON.stringify({
    plan,
    cleanupFingerprint: cleanupPlan.fingerprint,
    branchManifestFingerprint,
    ordinaryPlanTokens: branches.map((branch) => branch.ordinaryPlanToken ?? null),
  })
  return `sha256:${createHash('sha256').update(payload).digest('hex')}`
}

function fingerprintBranchWorkspaceManifests(manifests: readonly BranchWorkspaceManifest[]): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(manifests)).digest('hex')}`
}

function sameCleanupPlan(left: WorkspaceConfigCleanupPlan, right: WorkspaceConfigCleanupPlan): boolean {
  return left.rootId === right.rootId && left.scope === right.scope && left.fingerprint === right.fingerprint
}

async function discardRecord(
  rootId: string,
  branchWorkspaceId: string,
  discardRecords: typeof discardBranchWorkspaceRecords,
  controller: AbortController,
): Promise<{ ok: true } | { ok: false; message: string; cancelled?: boolean }> {
  if (cancelled(controller)) return cancelledFailure()
  try {
    await discardRecords(rootId, [branchWorkspaceId])
    return { ok: true }
  } catch (error) {
    return failure(recoveryMessage(error))
  }
}

function recordRemovedOutcome(plan: WorkspaceRecoveryBranchPlan, message?: string): WorkspaceRecoveryBranchOutcome {
  return {
    id: plan.id,
    branch: plan.branch,
    outcome: 'record-removed',
    ...(message ? { message } : {}),
  }
}

function cancelled(controller: AbortController): boolean {
  return controller.signal.aborted
}

function cancelledFailure(): Extract<WorkspaceRecoveryExecuteResult, { ok: false }> {
  return { ok: false, message: 'workspace.recovery.cancelled', cancelled: true }
}

function failure(message: string): { ok: false; message: string } {
  return { ok: false, message }
}

function recoveryMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  return message.startsWith('workspace.') || message.startsWith('error.') ? message : 'workspace.recovery.failed'
}

function recoveryBlockerMessage(message: string): string | null {
  if (message === 'workspace.branch-workspace.operation-in-progress') {
    return 'workspace.recovery.operation-in-progress'
  }
  return message === 'workspace.branch-workspace.plan-stale' ||
    message === 'workspace.branch-workspace.manifest-missing' ||
    message === 'workspace.branch-workspace.operation-incomplete' ||
    message === 'workspace.configuration-required' ||
    message === 'error.ssh-config-changed'
    ? 'workspace.recovery.plan-stale'
    : null
}
