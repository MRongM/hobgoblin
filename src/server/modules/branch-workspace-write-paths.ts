import path from 'node:path'
import {
  copyBranchWorkspaceEntry,
  createBranchWorkspaceDirectory,
  fingerprintBranchWorkspaceEntry,
  materializeBranchWorkspaceSymlink,
  removeBranchWorkspaceEntry,
} from '#/server/modules/branch-workspace-materialization-source.ts'
import { publishWorkspaceInvalidation } from '#/server/modules/invalidation-broker.ts'
import {
  buildBranchWorkspacePlan,
  type BranchWorkspacePlanDependencies,
} from '#/server/modules/branch-workspace-plan.ts'
import {
  readBranchWorkspaceManifests,
  updateBranchWorkspaceManifests,
} from '#/server/modules/branch-workspace-source.ts'
import { readBranchWorkspaceSnapshot } from '#/server/modules/branch-workspace-read.ts'
import {
  createRepositoryWorktree,
  deleteRepositoryBranch,
  deleteRepositoryRemoteBranch,
  removeRepositoryWorktree,
} from '#/server/modules/repo-write-paths.ts'
import type {
  BranchWorkspaceExecuteInput,
  BranchWorkspaceExecuteResult,
  BranchWorkspaceExecutionWarning,
  BranchWorkspaceManifest,
  BranchWorkspacePlan,
  BranchWorkspacePlanRequest,
  BranchWorkspacePlanResult,
  BranchWorkspaceReorderResult,
} from '#/shared/branch-workspaces.ts'
import type { TerminalCloseSessionsResult } from '#/shared/terminal.ts'
import { isRemoteRepoId } from '#/shared/remote-repo.ts'
import { parseRemoteBranchRef } from '#/shared/remote-branches.ts'

interface PendingBranchWorkspacePlan {
  plan: BranchWorkspacePlan
  request: BranchWorkspacePlanRequest
  persisted: boolean
  directoryReady: boolean
  terminalsClosed: boolean
}

export interface BranchWorkspaceWriteDependencies {
  buildPlan?: typeof buildBranchWorkspacePlan
  planDependencies?: BranchWorkspacePlanDependencies
  readManifests?: typeof readBranchWorkspaceManifests
  readSnapshot?: typeof readBranchWorkspaceSnapshot
  updateManifests?: typeof updateBranchWorkspaceManifests
  createDirectory?: typeof createBranchWorkspaceDirectory
  createWorktree?: typeof createRepositoryWorktree
  materializeSymlink?: typeof materializeBranchWorkspaceSymlink
  copyEntry?: typeof copyBranchWorkspaceEntry
  fingerprintEntry?: typeof fingerprintBranchWorkspaceEntry
  removeEntry?: typeof removeBranchWorkspaceEntry
  removeWorktree?: typeof removeRepositoryWorktree
  deleteBranch?: typeof deleteRepositoryBranch
  deleteRemoteBranch?: typeof deleteRepositoryRemoteBranch
  closeSessions?: (sessionIds: string[]) => Promise<TerminalCloseSessionsResult>
  publishInvalidation?: typeof publishWorkspaceInvalidation
}

export interface BranchWorkspaceWriteService {
  plan(rootId: string, request: BranchWorkspacePlanRequest): Promise<BranchWorkspacePlanResult>
  execute(rootId: string, input: BranchWorkspaceExecuteInput): Promise<BranchWorkspaceExecuteResult>
  abort(rootId: string): boolean
  reorder(rootId: string, orderedIds: string[]): Promise<BranchWorkspaceReorderResult>
}

export function createBranchWorkspaceWriteService(
  dependencies: BranchWorkspaceWriteDependencies = {},
): BranchWorkspaceWriteService {
  const pendingByRoot = new Map<string, PendingBranchWorkspacePlan>()
  const activeByRoot = new Map<string, AbortController>()
  const buildPlan = dependencies.buildPlan ?? buildBranchWorkspacePlan
  const readManifests = dependencies.readManifests ?? readBranchWorkspaceManifests
  const readSnapshot = dependencies.readSnapshot ?? readBranchWorkspaceSnapshot
  const updateManifests = dependencies.updateManifests ?? updateBranchWorkspaceManifests
  const createDirectory = dependencies.createDirectory ?? createBranchWorkspaceDirectory
  const createWorktree = dependencies.createWorktree ?? createRepositoryWorktree
  const materializeSymlink = dependencies.materializeSymlink ?? materializeBranchWorkspaceSymlink
  const copyEntry = dependencies.copyEntry ?? copyBranchWorkspaceEntry
  const fingerprintEntry = dependencies.fingerprintEntry ?? fingerprintBranchWorkspaceEntry
  const removeEntry = dependencies.removeEntry ?? removeBranchWorkspaceEntry
  const removeWorktree = dependencies.removeWorktree ?? removeRepositoryWorktree
  const deleteBranch = dependencies.deleteBranch ?? deleteRepositoryBranch
  const deleteRemoteBranch = dependencies.deleteRemoteBranch ?? deleteRepositoryRemoteBranch
  const closeSessions =
    dependencies.closeSessions ?? (async (sessionIds: string[]) => ({ closed: [], missing: [...new Set(sessionIds)] }))
  const publishInvalidation = dependencies.publishInvalidation ?? publishWorkspaceInvalidation
  const publishChange = (rootId: string, sourceToken?: string) => {
    if (sourceToken) publishInvalidation(rootId, sourceToken)
    else publishInvalidation(rootId)
  }

  async function persist(
    rootId: string,
    mutate: (manifest: BranchWorkspaceManifest) => BranchWorkspaceManifest,
    branchWorkspaceId: string,
    sourceToken?: string,
  ): Promise<void> {
    let found = false
    await updateManifests(rootId, (manifests) =>
      manifests.map((manifest) => {
        if (manifest.id !== branchWorkspaceId) return manifest
        found = true
        return mutate(manifest)
      }),
    )
    if (!found) throw new Error('workspace.branch-workspace.manifest-missing')
    publishChange(rootId, sourceToken)
  }

  function failOperation(branchWorkspaceId: string, message: string): BranchWorkspaceExecuteResult {
    return { ok: false, message, branchWorkspaceId }
  }

  return {
    async plan(rootId, request) {
      if (activeByRoot.has(rootId)) {
        return { ok: false, message: 'workspace.branch-workspace.operation-in-progress' }
      }
      const result = await buildPlan(rootId, request, dependencies.planDependencies)
      if (result.ok) {
        pendingByRoot.set(rootId, {
          plan: result.plan,
          request,
          persisted: false,
          directoryReady: !result.plan.steps.some((step) => step.kind === 'create-directory'),
          terminalsClosed: result.plan.terminalSessionIds.length === 0,
        })
      }
      return result
    },

    async execute(rootId, input) {
      const pending = pendingByRoot.get(rootId)
      if (!pending || pending.plan.token !== input.planToken) {
        return { ok: false, message: 'workspace.branch-workspace.plan-stale' }
      }
      if (activeByRoot.has(rootId)) {
        return {
          ok: false,
          message: 'workspace.branch-workspace.operation-in-progress',
          branchWorkspaceId: pending.plan.branchWorkspaceId,
        }
      }
      const approvals = new Set(input.approvals)
      if (pending.plan.requiredApprovals.some((approval) => !approvals.has(approval))) {
        return {
          ok: false,
          message: 'workspace.branch-workspace.approval-required',
          branchWorkspaceId: pending.plan.branchWorkspaceId,
        }
      }

      const controller = new AbortController()
      activeByRoot.set(rootId, controller)
      const { plan } = pending
      const warnings: BranchWorkspaceExecutionWarning[] = []
      const persistExecution = (
        targetRootId: string,
        mutate: (manifest: BranchWorkspaceManifest) => BranchWorkspaceManifest,
        branchWorkspaceId: string,
      ) => persist(targetRootId, mutate, branchWorkspaceId, input.sourceToken)
      try {
        if (!pending.persisted) {
          const rebuilt = await buildPlan(rootId, pending.request, dependencies.planDependencies, controller.signal)
          if (!rebuilt.ok || rebuilt.plan.token !== plan.token) {
            return {
              ok: false,
              message:
                !rebuilt.ok && rebuilt.message === 'error.ssh-config-changed'
                  ? rebuilt.message
                  : 'workspace.branch-workspace.plan-stale',
              branchWorkspaceId: plan.branchWorkspaceId,
            }
          }
          if ((plan.operation === 'reduce' || plan.operation === 'remove') && !pending.terminalsClosed) {
            const closed = await closeSessions(plan.terminalSessionIds).catch(() => ({
              closed: [],
              missing: [...plan.terminalSessionIds],
            }))
            const closedIds = new Set(closed.closed)
            if (closed.missing.length > 0 || plan.terminalSessionIds.some((sessionId) => !closedIds.has(sessionId))) {
              return {
                ok: false,
                message: 'workspace.branch-workspace.terminals-close-failed',
                branchWorkspaceId: plan.branchWorkspaceId,
              }
            }
            pending.terminalsClosed = true
          }
          await updateManifests(rootId, (manifests) => {
            const nextManifest: BranchWorkspaceManifest = {
              ...plan.manifest,
              repositories: plan.manifest.repositories.map((member) => ({ ...member })),
              auxiliaryEntries: plan.manifest.auxiliaryEntries.map((entry) => ({ ...entry })),
              operation: { kind: plan.operation },
            }
            const existingIndex = manifests.findIndex((manifest) => manifest.id === plan.branchWorkspaceId)
            if (existingIndex < 0) return [...manifests, nextManifest]
            return manifests.map((manifest, index) => (index === existingIndex ? nextManifest : manifest))
          })
          pending.persisted = true
          publishChange(rootId, input.sourceToken)
        }

        if (plan.operation === 'reduce') {
          for (const repository of plan.repositories) {
            const current = await currentManifest(readManifests, rootId, plan.branchWorkspaceId)
            const member = current.repositories.find(
              (candidate) => candidate.repositoryName === repository.repositoryName,
            )
            if (!member) throw new Error('workspace.branch-workspace.manifest-missing')
            if (member.progress === 'removed') continue
            if (controller.signal.aborted) {
              return failOperation(plan.branchWorkspaceId, 'cancelled')
            }
            const result = await removeWorktree(
              repository.repoId,
              {
                branch: repository.targetBranch,
                worktreePath: repository.worktreePath,
                alsoDeleteBranch: false,
                forceRemoveWorktree: repository.dirty === true,
                forceDeleteBranch: false,
                alsoDeleteUpstream: false,
              },
              controller.signal,
            ).catch((error) => ({ ok: false, message: operationMessage(error) }))
            if (!result.ok) {
              await persistMemberProgress(
                persistExecution,
                rootId,
                plan.branchWorkspaceId,
                repository.repositoryName,
                'failed',
                result.message,
              )
              return failOperation(plan.branchWorkspaceId, result.message)
            }
            await persistMemberProgress(
              persistExecution,
              rootId,
              plan.branchWorkspaceId,
              repository.repositoryName,
              'removed',
            )
          }

          const removedNames = new Set(plan.repositories.map((repository) => repository.repositoryName))
          await persistExecution(
            rootId,
            (manifest) => {
              const { operation: _operation, ...ready } = manifest
              return {
                ...ready,
                repositories: manifest.repositories.filter((member) => !removedNames.has(member.repositoryName)),
              }
            },
            plan.branchWorkspaceId,
          )
          pendingByRoot.delete(rootId)
          return { ok: true, branchWorkspaceId: plan.branchWorkspaceId }
        }

        if (plan.operation === 'remove') {
          for (const repository of plan.repositories) {
            let current = await currentManifest(readManifests, rootId, plan.branchWorkspaceId)
            let member = current.repositories.find(
              (candidate) => candidate.repositoryName === repository.repositoryName,
            )
            if (!member) throw new Error('workspace.branch-workspace.manifest-missing')
            if (controller.signal.aborted) {
              return failOperation(plan.branchWorkspaceId, 'cancelled')
            }
            if (member.progress !== 'removed') {
              let result = { ok: true, message: 'satisfied' }
              if (repository.worktreePresent) {
                try {
                  result = await removeWorktree(
                    repository.repoId,
                    {
                      branch: repository.targetBranch,
                      worktreePath: repository.worktreePath,
                      alsoDeleteBranch: false,
                      forceRemoveWorktree: true,
                      forceDeleteBranch: false,
                      alsoDeleteUpstream: false,
                    },
                    controller.signal,
                  )
                } catch (error) {
                  result = { ok: false, message: operationMessage(error) }
                }
              }
              if (!result.ok) {
                await persistMemberProgress(
                  persistExecution,
                  rootId,
                  plan.branchWorkspaceId,
                  repository.repositoryName,
                  'failed',
                  result.message,
                )
                return failOperation(plan.branchWorkspaceId, result.message)
              }
              await persistMemberProgress(
                persistExecution,
                rootId,
                plan.branchWorkspaceId,
                repository.repositoryName,
                'removed',
              )
            }

            current = await currentManifest(readManifests, rootId, plan.branchWorkspaceId)
            member = current.repositories.find((candidate) => candidate.repositoryName === repository.repositoryName)
            if (!member) throw new Error('workspace.branch-workspace.manifest-missing')
            if (repository.deleteBranch && member.branchCleanupProgress !== 'complete') {
              const result = await deleteBranch(
                repository.repoId,
                repository.targetBranch,
                { force: true, alsoDeleteUpstream: false },
                controller.signal,
              ).catch((error) => ({ ok: false, message: operationMessage(error) }))
              if (!result.ok) {
                await persistRepositoryCleanup(
                  persistExecution,
                  rootId,
                  plan.branchWorkspaceId,
                  repository.repositoryName,
                  'branchCleanupProgress',
                  'failed',
                  result.message,
                )
                return failOperation(plan.branchWorkspaceId, result.message)
              }
              await persistRepositoryCleanup(
                persistExecution,
                rootId,
                plan.branchWorkspaceId,
                repository.repositoryName,
                'branchCleanupProgress',
                'complete',
              )
            }

            current = await currentManifest(readManifests, rootId, plan.branchWorkspaceId)
            member = current.repositories.find((candidate) => candidate.repositoryName === repository.repositoryName)
            if (!member) throw new Error('workspace.branch-workspace.manifest-missing')
            if (repository.deleteUpstream && member.upstreamCleanupProgress !== 'complete') {
              const upstream = repository.upstream ? parseRemoteBranchRef(repository.upstream) : null
              if (!upstream) {
                return failOperation(plan.branchWorkspaceId, 'workspace.branch-workspace.upstream-unavailable')
              }
              const result = await deleteRemoteBranch(
                repository.repoId,
                upstream.remote,
                upstream.branch,
                controller.signal,
              ).catch((error) => ({ ok: false, message: operationMessage(error) }))
              if (!result.ok) {
                await persistRepositoryCleanup(
                  persistExecution,
                  rootId,
                  plan.branchWorkspaceId,
                  repository.repositoryName,
                  'upstreamCleanupProgress',
                  'failed',
                  result.message,
                )
                return failOperation(plan.branchWorkspaceId, result.message)
              }
              await persistRepositoryCleanup(
                persistExecution,
                rootId,
                plan.branchWorkspaceId,
                repository.repositoryName,
                'upstreamCleanupProgress',
                'complete',
              )
            }
          }

          for (const entry of plan.auxiliaryEntries) {
            const current = await currentManifest(readManifests, rootId, plan.branchWorkspaceId)
            const persistedEntry = current.auxiliaryEntries.find((candidate) => candidate.name === entry.name)
            if (persistedEntry?.progress === 'removed') continue
            if (controller.signal.aborted) {
              return failOperation(plan.branchWorkspaceId, 'cancelled')
            }
            try {
              await removeEntry(rootId, entry.targetPath, controller.signal)
              await persistAuxiliaryProgress(persistExecution, rootId, plan.branchWorkspaceId, entry.name, 'removed')
            } catch (error) {
              const message = operationMessage(error)
              await persistAuxiliaryProgress(
                persistExecution,
                rootId,
                plan.branchWorkspaceId,
                entry.name,
                'failed',
                message,
              )
              return failOperation(plan.branchWorkspaceId, message)
            }
          }

          for (const entryName of plan.unmanagedEntries ?? []) {
            if (controller.signal.aborted) {
              return failOperation(plan.branchWorkspaceId, 'cancelled')
            }
            try {
              await removeEntry(rootId, childPath(rootId, plan.path, entryName), controller.signal)
            } catch (error) {
              return failOperation(plan.branchWorkspaceId, operationMessage(error))
            }
          }
          if (plan.steps.some((step) => step.kind === 'remove-directory')) {
            try {
              await removeEntry(rootId, plan.path, controller.signal)
            } catch (error) {
              return failOperation(plan.branchWorkspaceId, operationMessage(error))
            }
          }
          await updateManifests(rootId, (manifests) =>
            manifests.filter((manifest) => manifest.id !== plan.branchWorkspaceId),
          )
          publishChange(rootId, input.sourceToken)
          pendingByRoot.delete(rootId)
          return { ok: true, branchWorkspaceId: plan.branchWorkspaceId }
        }

        if (!pending.directoryReady) {
          try {
            await createDirectory(rootId, plan.path, controller.signal)
            pending.directoryReady = true
          } catch (error) {
            return failOperation(plan.branchWorkspaceId, operationMessage(error))
          }
        }

        for (const repository of plan.repositories) {
          const current = await currentManifest(readManifests, rootId, plan.branchWorkspaceId)
          const member = current.repositories.find(
            (candidate) => candidate.repositoryName === repository.repositoryName,
          )
          if (member?.progress === 'removed' || member?.progress === 'complete') {
            continue
          }
          if (controller.signal.aborted) {
            return failOperation(plan.branchWorkspaceId, 'cancelled')
          }
          let result
          try {
            result = await createWorktree(
              repository.repoId,
              { worktreePath: repository.worktreePath, mode: repository.mode },
              repository.worktreeBootstrap,
              controller.signal,
            )
          } catch (error) {
            result = { ok: false, message: operationMessage(error) }
          }
          if (!result.ok) {
            if (result.repoChanged && repository.worktreeBootstrap.kind !== 'skip') {
              await persistMemberProgress(
                persistExecution,
                rootId,
                plan.branchWorkspaceId,
                repository.repositoryName,
                'complete',
              )
              warnings.push({
                kind: 'repository-dependency-failed',
                repositoryName: repository.repositoryName,
                message: result.message,
              })
              continue
            }
            await persistMemberProgress(
              persistExecution,
              rootId,
              plan.branchWorkspaceId,
              repository.repositoryName,
              'failed',
              result.message,
            )
            return failOperation(plan.branchWorkspaceId, result.message)
          }
          await persistMemberProgress(
            persistExecution,
            rootId,
            plan.branchWorkspaceId,
            repository.repositoryName,
            'complete',
          )
        }

        for (const entry of plan.auxiliaryEntries) {
          const current = await currentManifest(readManifests, rootId, plan.branchWorkspaceId)
          const persistedEntry = current.auxiliaryEntries.find((candidate) => candidate.name === entry.name)
          if (persistedEntry?.progress === 'complete' || persistedEntry?.progress === 'removed') continue
          if (controller.signal.aborted) {
            return failOperation(plan.branchWorkspaceId, 'cancelled')
          }
          try {
            if (entry.action === 'replace-symlink') {
              await removeEntry(rootId, entry.targetPath, controller.signal)
            }
            if (entry.mode === 'symlink') {
              await materializeSymlink(rootId, entry.sourcePath, entry.targetPath, controller.signal)
              await persistAuxiliaryProgress(persistExecution, rootId, plan.branchWorkspaceId, entry.name, 'complete')
            } else {
              await copyEntry(rootId, entry.sourcePath, entry.targetPath, controller.signal)
              const copyBaseline = await fingerprintEntry(rootId, entry.targetPath, controller.signal)
              await persistAuxiliaryProgress(
                persistExecution,
                rootId,
                plan.branchWorkspaceId,
                entry.name,
                'complete',
                undefined,
                copyBaseline,
              )
            }
          } catch (error) {
            const message = operationMessage(error)
            await persistAuxiliaryProgress(
              persistExecution,
              rootId,
              plan.branchWorkspaceId,
              entry.name,
              'failed',
              message,
            )
            return failOperation(plan.branchWorkspaceId, message)
          }
        }

        await persistExecution(
          rootId,
          (manifest) => {
            const { operation: _operation, ...ready } = manifest
            return {
              ...ready,
              auxiliaryEntries: manifest.auxiliaryEntries.filter((entry) => entry.progress !== 'complete'),
            }
          },
          plan.branchWorkspaceId,
        )
        pendingByRoot.delete(rootId)
        if (plan.operation === 'create') {
          const finalState = await readSnapshot(rootId, controller.signal)
          if (!finalState.ok) return failOperation(plan.branchWorkspaceId, finalState.message)
          const snapshot = finalState.items.find((item) => item.id === plan.branchWorkspaceId)
          if (!snapshot || snapshot.state.kind !== 'ready') {
            return failOperation(plan.branchWorkspaceId, 'workspace.branch-workspace.needs-repair')
          }
          return {
            ok: true,
            branchWorkspaceId: plan.branchWorkspaceId,
            snapshot,
            ...(warnings.length > 0 ? { warnings } : {}),
          }
        }
        return {
          ok: true,
          branchWorkspaceId: plan.branchWorkspaceId,
          ...(warnings.length > 0 ? { warnings } : {}),
        }
      } catch (error) {
        return failOperation(plan.branchWorkspaceId, operationMessage(error))
      } finally {
        if (activeByRoot.get(rootId) === controller) activeByRoot.delete(rootId)
      }
    },

    abort(rootId) {
      const controller = activeByRoot.get(rootId)
      if (!controller) return false
      controller.abort()
      return true
    },

    async reorder(rootId, orderedIds) {
      if (activeByRoot.has(rootId)) {
        return { ok: false, message: 'workspace.branch-workspace.operation-in-progress' }
      }
      const snapshot = await readManifests(rootId)
      if (snapshot.kind === 'invalid') return { ok: false, message: snapshot.message }
      const manifests = snapshot.kind === 'ready' ? snapshot.manifests : []
      const knownIds = new Set(manifests.map((manifest) => manifest.id))
      if (new Set(orderedIds).size !== orderedIds.length || orderedIds.some((id) => !knownIds.has(id))) {
        return { ok: false, message: 'workspace.branch-workspace.invalid-order' }
      }
      const byId = new Map(manifests.map((manifest) => [manifest.id, manifest]))
      const selected = new Set(orderedIds)
      const reordered = [
        ...orderedIds.map((id) => byId.get(id)!),
        ...manifests.filter((manifest) => !selected.has(manifest.id)),
      ]
      await updateManifests(rootId, () => reordered)
      publishInvalidation(rootId)
      return { ok: true }
    },
  }
}

async function currentManifest(
  readManifests: typeof readBranchWorkspaceManifests,
  rootId: string,
  branchWorkspaceId: string,
): Promise<BranchWorkspaceManifest> {
  const snapshot = await readManifests(rootId)
  const manifest =
    snapshot.kind === 'ready' ? snapshot.manifests.find((candidate) => candidate.id === branchWorkspaceId) : undefined
  if (!manifest) throw new Error('workspace.branch-workspace.manifest-missing')
  return manifest
}

async function persistMemberProgress(
  persist: (
    rootId: string,
    mutate: (manifest: BranchWorkspaceManifest) => BranchWorkspaceManifest,
    branchWorkspaceId: string,
  ) => Promise<void>,
  rootId: string,
  branchWorkspaceId: string,
  repositoryName: string,
  progress: 'complete' | 'removed' | 'failed',
  lastError?: string,
): Promise<void> {
  await persist(
    rootId,
    (manifest) => ({
      ...manifest,
      repositories: manifest.repositories.map((member) =>
        member.repositoryName === repositoryName
          ? {
              ...member,
              progress,
              ...(lastError ? { lastError } : {}),
              ...(!lastError ? { lastError: undefined } : {}),
            }
          : member,
      ),
    }),
    branchWorkspaceId,
  )
}

async function persistRepositoryCleanup(
  persist: (
    rootId: string,
    mutate: (manifest: BranchWorkspaceManifest) => BranchWorkspaceManifest,
    branchWorkspaceId: string,
  ) => Promise<void>,
  rootId: string,
  branchWorkspaceId: string,
  repositoryName: string,
  field: 'branchCleanupProgress' | 'upstreamCleanupProgress',
  progress: 'complete' | 'failed',
  lastError?: string,
): Promise<void> {
  await persist(
    rootId,
    (manifest) => ({
      ...manifest,
      repositories: manifest.repositories.map((member) =>
        member.repositoryName === repositoryName
          ? {
              ...member,
              [field]: progress,
              ...(lastError ? { lastError } : { lastError: undefined }),
            }
          : member,
      ),
    }),
    branchWorkspaceId,
  )
}

async function persistAuxiliaryProgress(
  persist: (
    rootId: string,
    mutate: (manifest: BranchWorkspaceManifest) => BranchWorkspaceManifest,
    branchWorkspaceId: string,
  ) => Promise<void>,
  rootId: string,
  branchWorkspaceId: string,
  entryName: string,
  progress: 'complete' | 'removed' | 'failed',
  lastError?: string,
  copyBaseline?: string,
): Promise<void> {
  await persist(
    rootId,
    (manifest) =>
      progress === 'complete'
        ? {
            ...manifest,
            auxiliaryEntries: manifest.auxiliaryEntries.filter((entry) => entry.name !== entryName),
          }
        : {
            ...manifest,
            auxiliaryEntries: manifest.auxiliaryEntries.map((entry) =>
              entry.name === entryName
                ? {
                    ...entry,
                    progress,
                    ...(lastError ? { lastError } : { lastError: undefined }),
                    ...(copyBaseline ? { copyBaseline } : {}),
                  }
                : entry,
            ),
          },
    branchWorkspaceId,
  )
}

function childPath(rootId: string, parentPath: string, name: string): string {
  return (isRemoteRepoId(rootId) ? path.posix : path).join(parentPath, name)
}

function operationMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  return message || 'workspace.branch-workspace.operation-failed'
}
