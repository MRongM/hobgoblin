import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import {
  buildBranchWorkspaceClonePlan,
  assertCloneDestinationAbsent,
  assertCloneDestinationParent,
} from '#/server/modules/branch-workspace-clone-plan.ts'
import {
  resolveWorkspaceSnapshotSource,
  withWorkspaceSnapshotExport,
  downloadWorkspaceSnapshot,
} from '#/server/modules/branch-workspace-clone-source.ts'
import {
  registerBranchWorkspaceFolder,
  readBranchWorkspaceManifests,
} from '#/server/modules/branch-workspace-source.ts'
import { createBranchWorkspaceDirectory } from '#/server/modules/branch-workspace-materialization-source.ts'
import { branchWorkspaceStorageRootIdAtPath, workspaceRootId } from '#/server/modules/workspace-paths.ts'
import {
  publishWorkspaceInvalidation,
  publishWorkspaceConfigurationInvalidation,
} from '#/server/modules/invalidation-broker.ts'
import { createRepositoryWorktree, publishRepositorySnapshotInvalidation } from '#/server/modules/repo-write-paths.ts'
import { runServerCancellable } from '#/server/common/network-ops.ts'
import {
  snapshotGit,
  restoreWorkspaceSnapshotFiles,
  restoreWorkspaceSnapshotRepository,
  publishWorkspaceSnapshotDirectory,
  publishWorkspaceSnapshotEntry,
} from '#/system/git/workspace-snapshot.ts'
import type {
  BranchWorkspaceCloneRequest,
  BranchWorkspaceClonePlan,
  BranchWorkspaceClonePlanResult,
  BranchWorkspaceCloneExecuteResult,
  BranchWorkspaceCloneProgress,
  WorkspaceSnapshotExport,
} from '#/shared/branch-workspace-clone.ts'

interface PendingClone {
  plan: BranchWorkspaceClonePlan
  created: boolean
  registered?: boolean
  rootIdentity?: string
  rootComplete: boolean
  completed: Set<string>
  progress: BranchWorkspaceCloneProgress
}

export interface BranchWorkspaceCloneWriteDependencies {
  isOperationActive?: (rootId: string) => boolean
}

export function createBranchWorkspaceCloneWriteService(dependencies: BranchWorkspaceCloneWriteDependencies = {}) {
  const plans = new Map<string, PendingClone>()
  const active = new Map<string, AbortController>()
  const sourceActive = new Set<string>()
  const isBusy = (rootId: string) =>
    active.has(rootId) || sourceActive.has(rootId) || Boolean(dependencies.isOperationActive?.(rootId))
  function notify(pending: PendingClone, sourceToken?: string) {
    publishWorkspaceInvalidation(pending.plan.targetRootId, sourceToken)
  }
  return {
    isActive(rootId: string): boolean {
      return active.has(workspaceRootId(rootId)) || sourceActive.has(workspaceRootId(rootId))
    },
    abort(rootId: string): boolean {
      const controller = active.get(workspaceRootId(rootId))
      if (!controller) return false
      controller.abort()
      return true
    },
    progress(planToken: string): BranchWorkspaceCloneProgress | null {
      const progress = plans.get(planToken)?.progress
      return progress ? structuredClone(progress) : null
    },
    async plan(request: BranchWorkspaceCloneRequest): Promise<BranchWorkspaceClonePlanResult> {
      let rootId: string | undefined
      let ownsActive = false
      try {
        if (!request || typeof request.targetRootId !== 'string') throw new Error('Invalid clone destination')
        rootId = workspaceRootId(request.targetRootId)
        if (
          isBusy(rootId) ||
          (typeof request.sourceRootId === 'string' && isBusy(workspaceRootId(request.sourceRootId)))
        )
          throw new Error('A workspace operation is already running')
        const controller = new AbortController()
        active.set(rootId, controller)
        ownsActive = true
        const plan = await buildBranchWorkspaceClonePlan(request, controller.signal)
        plans.set(plan.token, {
          plan,
          created: false,
          rootComplete: plan.rootSnapshot === null,
          completed: new Set(),
          progress: {
            planToken: plan.token,
            branchWorkspaceId: plan.branchWorkspaceId,
            phase: 'export',
            completedRepositoryNames: [],
            transferredBytes: 0,
          },
        })
        // Retain failed/retryable operations, but avoid unbounded unused preview storage.
        if (plans.size > 64)
          for (const [token, candidate] of plans) {
            if (!candidate.created && token !== plan.token) {
              plans.delete(token)
              break
            }
          }
        return { ok: true, plan: structuredClone(plan) }
      } catch (error) {
        return {
          ok: false,
          message: 'workspace.branch-workspace.clone.failed',
          detail: String(error instanceof Error ? error.message : error),
        }
      } finally {
        if (rootId && ownsActive) active.delete(rootId)
      }
    },
    async execute(input: { planToken: string; sourceToken?: string }): Promise<BranchWorkspaceCloneExecuteResult> {
      const pending = plans.get(input.planToken)
      if (!pending) return { ok: false, message: 'workspace.branch-workspace.clone.plan-expired' }
      const { plan } = pending
      if (pending.progress.phase === 'complete')
        return { ok: true, rootId: plan.targetRootId, branchWorkspaceId: plan.branchWorkspaceId }
      if (isBusy(plan.targetRootId) || isBusy(plan.sourceRootId))
        return { ok: false, message: 'workspace.branch-workspace.operation-in-progress' }
      const controller = new AbortController()
      active.set(plan.targetRootId, controller)
      sourceActive.add(plan.sourceRootId)
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(2 * 60 * 60 * 1000)])
      let currentName: string | undefined
      try {
        const target = await resolveWorkspaceSnapshotSource(plan.sourceRootId, signal)
        await assertCloneDestinationParent(path.dirname(plan.path))
        if (!pending.created) {
          await assertCloneDestinationAbsent(plan.path)
          const registry = await readBranchWorkspaceManifests(plan.targetRootId)
          if (
            registry.kind === 'invalid' ||
            (registry.kind === 'ready' && registry.manifests.some((manifest) => manifest.path === plan.path))
          )
            throw new Error('Clone destination registration changed')
          if (plan.rootSnapshot !== null) {
            await createBranchWorkspaceDirectory(
              branchWorkspaceStorageRootIdAtPath(plan.targetRootId, plan.path),
              plan.path,
              signal,
            )
            pending.created = true
            const createdInfo = await lstat(plan.path)
            pending.rootIdentity = `${createdInfo.dev}:${createdInfo.ino}`
          }
        }
        const registerPublishedRoot = async () => {
          if (!pending.created) return
          const info = await lstat(plan.path)
          if (!info.isDirectory() || info.isSymbolicLink() || `${info.dev}:${info.ino}` !== pending.rootIdentity)
            throw new Error('Clone destination changed')
          if (!pending.registered) {
            const registration = await registerBranchWorkspaceFolder(plan.targetRootId, plan.path)
            plan.branchWorkspaceId = registration.branchWorkspaceId
            pending.progress.branchWorkspaceId = registration.branchWorkspaceId
            pending.registered = true
          } else {
            const registry = await readBranchWorkspaceManifests(plan.targetRootId)
            const current =
              registry.kind === 'ready'
                ? registry.manifests.find((folder) => folder.id === plan.branchWorkspaceId)
                : undefined
            if (!current || current.path !== plan.path)
              throw new Error('Clone destination was unregistered; automatic retry is unavailable')
          }
          publishWorkspaceConfigurationInvalidation(plan.targetRootId, input.sourceToken)
          notify(pending, input.sourceToken)
        }
        await registerPublishedRoot()
        let lastProgressAt = 0
        const notifyProgress = () => {
          const now = Date.now()
          if (now - lastProgressAt > 1000) {
            lastProgressAt = now
            publishWorkspaceInvalidation(plan.targetRootId, input.sourceToken)
          }
        }
        const transfer = async (snapshot: WorkspaceSnapshotExport, artifacts: string) => {
          pending.progress.phase = 'transfer'
          notifyProgress()
          await downloadWorkspaceSnapshot(target, snapshot, artifacts, signal, (bytes) => {
            pending.progress.transferredBytes += bytes
            notifyProgress()
          })
          pending.progress.phase = 'restore'
          notifyProgress()
        }
        if (!pending.rootComplete && plan.rootSnapshot) {
          pending.progress.phase = 'export'
          notifyProgress()
          await withWorkspaceSnapshotExport(
            target,
            {
              rootPath: plan.sourcePath,
              repository: false,
              excludeNames: plan.members.map((member) => member.repositoryName),
              ignoredPaths: [],
            },
            plan.rootSnapshot.fingerprint,
            signal,
            async (snapshot) => {
              const temp = await mkdtemp(path.join(path.dirname(plan.path), '.hobgoblin-snapshot-'))
              try {
                const files = path.join(temp, 'files')
                const artifacts = path.join(temp, 'artifacts')
                await mkdir(files)
                await mkdir(artifacts)
                await transfer(snapshot, artifacts)
                await restoreWorkspaceSnapshotFiles(files, artifacts, snapshot, signal)
                signal.throwIfAborted()
                for (const name of await readdir(files)) await assertCloneDestinationAbsent(path.join(plan.path, name))
                // Publication has no abort boundary between entries; a completed root group is retained for retry.
                for (const name of await readdir(files))
                  await publishWorkspaceSnapshotEntry(path.join(files, name), path.join(plan.path, name))
                pending.rootComplete = true
              } finally {
                await rm(temp, { recursive: true, force: true })
              }
            },
          )
        }
        for (const member of plan.members) {
          if (pending.completed.has(member.repositoryName)) continue
          currentName = member.repositoryName
          pending.progress.repositoryName = currentName
          pending.progress.phase = 'export'
          notifyProgress()
          await assertCloneDestinationAbsent(member.targetPath)
          await withWorkspaceSnapshotExport(
            target,
            {
              rootPath: member.sourcePath,
              repository: true,
              excludeNames: [],
              ignoredPaths: Object.hasOwn(plan.ignoredPaths, member.repositoryName)
                ? plan.ignoredPaths[member.repositoryName]!
                : [],
            },
            member.snapshot.fingerprint,
            signal,
            async (snapshot) => {
              const temp = await mkdtemp(path.join(path.dirname(plan.path), '.hobgoblin-snapshot-'))
              try {
                const files = path.join(temp, 'repository')
                const artifacts = path.join(temp, 'artifacts')
                await mkdir(files)
                await mkdir(artifacts)
                await transfer(snapshot, artifacts)
                await restoreWorkspaceSnapshotRepository(files, artifacts, snapshot, signal)
                signal.throwIfAborted()
                if (member.mapping)
                  await restoreMappedMember(
                    member.mapping,
                    member.targetPath,
                    artifacts,
                    snapshot,
                    signal,
                    input.sourceToken,
                  )
                else await publishWorkspaceSnapshotDirectory(files, member.targetPath)
                // Publication succeeded: retain it even if cleanup or registration then fails.
                pending.completed.add(member.repositoryName)
                pending.progress.completedRepositoryNames = [...pending.completed]
                if (member.targetPath === plan.path) {
                  const publishedInfo = await lstat(plan.path)
                  pending.created = true
                  pending.rootIdentity = `${publishedInfo.dev}:${publishedInfo.ino}`
                }
              } finally {
                const recoveryPath = path.join(temp, 'mapped-worktree')
                if (
                  await lstat(recoveryPath).catch((error: NodeJS.ErrnoException) => {
                    if (error.code === 'ENOENT') return null
                    throw error
                  })
                ) {
                  throw new Error('Mapped worktree cleanup requires attention; retained temporary directory: ' + temp)
                }
                await rm(temp, { recursive: true, force: true })
              }
            },
          )
          await registerPublishedRoot()
          notify(pending, input.sourceToken)
          publishRepositorySnapshotInvalidation(member.mapping?.repositoryId ?? member.targetPath, input.sourceToken)
        }
        notify(pending, input.sourceToken)
        pending.progress.phase = 'complete'
        return { ok: true, rootId: plan.targetRootId, branchWorkspaceId: plan.branchWorkspaceId }
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        pending.progress.phase = signal.aborted ? 'cancelled' : 'failed'
        pending.progress.detail = detail
        if (pending.created) notify(pending, input.sourceToken)
        return {
          ok: false,
          message: signal.aborted
            ? 'workspace.branch-workspace.clone.cancelled'
            : 'workspace.branch-workspace.clone.failed',
          detail,
          ...(pending.created ? { branchWorkspaceId: plan.branchWorkspaceId } : {}),
        }
      } finally {
        active.delete(plan.targetRootId)
        sourceActive.delete(plan.sourceRootId)
        publishWorkspaceInvalidation(plan.targetRootId, input.sourceToken)
      }
    },
  }
}

async function restoreMappedMember(
  mapping: NonNullable<BranchWorkspaceClonePlan['members'][number]['mapping']>,
  destination: string,
  artifacts: string,
  snapshot: WorkspaceSnapshotExport,
  signal: AbortSignal,
  sourceToken?: string,
): Promise<void> {
  const head = snapshot.repository!.head
  const importBranch = 'hobgoblin-import-' + randomUUID()
  const result = await runServerCancellable(mapping.repositoryId, 'user', async (operationSignal) => {
    const mergedSignal = AbortSignal.any([signal, operationSignal])
    const common = (
      await snapshotGit(mapping.repositoryId, ['rev-parse', '--path-format=absolute', '--git-common-dir'], mergedSignal)
    )
      .toString('utf8')
      .trim()
    if (path.resolve(common) !== mapping.commonDirectory) throw new Error('Mapped repository identity changed')
    await snapshotGit(mapping.repositoryId, ['bundle', 'verify', path.join(artifacts, 'bundle')], mergedSignal)
    await snapshotGit(mapping.repositoryId, ['bundle', 'unbundle', path.join(artifacts, 'bundle')], mergedSignal)
    await snapshotGit(mapping.repositoryId, ['update-ref', 'refs/heads/' + importBranch, head, ''], mergedSignal)
    const stagedWorktree = path.join(path.dirname(artifacts), 'mapped-worktree')
    let createdWorktree = false
    let published = false
    try {
      const created = await createRepositoryWorktree(
        mapping.repositoryId,
        {
          worktreePath: stagedWorktree,
          mode: {
            kind: 'newBranch',
            newBranch: mapping.branchName,
            creationBase: { kind: 'localBranch', branch: importBranch },
          },
          syncBeforeCreate: false,
        },
        { kind: 'skip' },
        mergedSignal,
        sourceToken,
      )
      createdWorktree = (await snapshotGit(mapping.repositoryId, ['worktree', 'list', '--porcelain', '-z']))
        .toString('utf8')
        .split('\0')
        .includes('worktree ' + stagedWorktree)
      if (!created.ok) throw new Error(created.message)
      createdWorktree = true
      if (snapshot.staged!.size)
        await snapshotGit(
          stagedWorktree,
          ['apply', '--cached', '--binary', '--whitespace=nowarn', path.join(artifacts, 'staged')],
          mergedSignal,
        )
      await restoreWorkspaceSnapshotFiles(stagedWorktree, artifacts, snapshot, mergedSignal)
      const index = await snapshotGit(stagedWorktree, ['ls-files', '--stage', '-z'], mergedSignal)
      if (createHash('sha256').update(index).digest('hex') !== snapshot.repository!.indexSha256)
        throw new Error('Mapped index differs from source')
      await assertCloneDestinationAbsent(destination)
      mergedSignal.throwIfAborted()
      // Git moves the registration together with the files; a plain directory rename is invalid here.
      await snapshotGit(mapping.repositoryId, ['worktree', 'move', '--', stagedWorktree, destination])
      published = true
      return { ok: true, message: '' }
    } finally {
      if (createdWorktree && !published) {
        await snapshotGit(mapping.repositoryId, ['worktree', 'remove', '--force', '--', stagedWorktree])
        await snapshotGit(mapping.repositoryId, ['update-ref', '-d', 'refs/heads/' + mapping.branchName, head])
      }
      await snapshotGit(mapping.repositoryId, ['update-ref', '-d', 'refs/heads/' + importBranch, head]).catch(
        () => undefined,
      )
    }
  })
  if (!result.ok) throw new Error(result.message)
}
