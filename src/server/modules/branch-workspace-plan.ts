import { createHash } from 'node:crypto'
import path from 'node:path'
import {
  fingerprintBranchWorkspaceEntry,
  inspectBranchWorkspacePath,
  listBranchWorkspaceChildren,
} from '#/server/modules/branch-workspace-materialization-source.ts'
import { readBranchWorkspaceManifests } from '#/server/modules/branch-workspace-source.ts'
import type { RepoSnapshotOptions } from '#/server/modules/repo-backend.ts'
import { readWorkspaceConfig } from '#/server/modules/workspace-config-source.ts'
import {
  branchWorkspaceDirectoryName,
  branchWorkspacePath,
  workspacePathExists,
  workspaceRepositoryId,
  workspaceRepositoryPath,
  workspaceRootId,
} from '#/server/modules/workspace-paths.ts'
import { getRepositorySnapshot, getRepositoryWorktreeBootstrapPreflight } from '#/server/modules/repo-read-paths.ts'
import {
  normalizeBranchWorkspacePlanRequest,
  type BranchWorkspaceApproval,
  type BranchWorkspaceAuxiliaryPlan,
  type BranchWorkspaceManifest,
  type BranchWorkspacePlan,
  type BranchWorkspacePlanRequest,
  type BranchWorkspacePlanResult,
  type BranchWorkspaceRepositoryPlan,
} from '#/shared/branch-workspaces.ts'
import { isRemoteRepoId } from '#/shared/remote-repo.ts'
import { PROTECTED_BRANCHES } from '#/shared/git-types.ts'
import { isProtectedRemoteBranchRef, parseRemoteBranchRef } from '#/shared/remote-branches.ts'
import { isSafeBranchName } from '#/shared/refnames.ts'
import type { RepoSnapshot } from '#/shared/rpc.ts'
import type { TerminalSessionSummary } from '#/shared/terminal.ts'
import type { WorkspaceConfigSnapshot } from '#/shared/workspace.ts'
import type {
  WorktreeBootstrapCandidateScope,
  WorktreeBootstrapDecision,
  WorktreeBootstrapPreflightResult,
} from '#/shared/worktree-bootstrap-summary.ts'

export interface BranchWorkspacePlanDependencies {
  readConfig?: (rootId: string) => Promise<WorkspaceConfigSnapshot>
  readManifests?: typeof readBranchWorkspaceManifests
  getSnapshot?: (repoId: string, signal?: AbortSignal, options?: RepoSnapshotOptions) => Promise<RepoSnapshot | null>
  getBootstrapPreflight?: (
    repoId: string,
    signal?: AbortSignal,
    candidateScope?: WorktreeBootstrapCandidateScope,
    sourceWorktreePath?: string,
  ) => Promise<WorktreeBootstrapPreflightResult>
  inspectPath?: typeof inspectBranchWorkspacePath
  pathExists?: (repoId: string, candidatePath: string) => Promise<boolean>
  fingerprintEntry?: typeof fingerprintBranchWorkspaceEntry
  listChildren?: typeof listBranchWorkspaceChildren
  listTerminalSessions?: (repoId: string) => Promise<TerminalSessionSummary[]>
}

export async function buildBranchWorkspacePlan(
  rootId: string,
  request: BranchWorkspacePlanRequest,
  dependencies: BranchWorkspacePlanDependencies = {},
  signal?: AbortSignal,
): Promise<BranchWorkspacePlanResult> {
  const normalized = normalizeBranchWorkspacePlanRequest(request)
  if (!normalized.ok) return normalized
  if (normalized.request.operation !== 'create') {
    return await buildExistingBranchWorkspacePlan(rootId, normalized.request, dependencies, signal)
  }
  const createRequest = normalized.request
  if (!isSafeBranchName(createRequest.branch)) {
    return { ok: false, message: 'workspace.branch-workspace.invalid-branch' }
  }
  if (createRequest.repositories.some((repository) => !isSafeBranchName(repository.baseBranch))) {
    return { ok: false, message: 'workspace.branch-workspace.base-unavailable' }
  }

  const normalizedRootId = workspaceRootId(rootId)
  const resources = await readPlanResources(normalizedRootId, dependencies)
  if (!resources.ok) return resources
  const { config, manifests } = resources
  const selectedRepositories = new Map(
    createRequest.repositories.map((repository) => [repository.repositoryName, repository]),
  )
  if ([...selectedRepositories.keys()].some((name) => !config.repo.includes(name))) {
    return { ok: false, message: 'workspace.branch-workspace.repository-unavailable' }
  }
  if (createRequest.auxiliaryEntries.some((entry) => config.repo.includes(entry.name))) {
    return { ok: false, message: 'workspace.branch-workspace.invalid-entry' }
  }

  const existing = manifests.find((manifest) => manifest.branch === createRequest.branch)
  if (existing?.operation) return { ok: false, message: 'workspace.branch-workspace.operation-incomplete' }
  const location = await resolveBranchWorkspaceLocation(
    normalizedRootId,
    createRequest.branch,
    existing,
    manifests,
    dependencies,
    signal,
  )
  if (!location.ok) return location

  const fixedRepositories = new Map(existing?.repositories.map((member) => [member.repositoryName, member]) ?? [])
  const fixedAuxiliaryEntries = new Map(existing?.auxiliaryEntries.map((entry) => [entry.name, entry]) ?? [])
  for (const selection of createRequest.repositories) {
    const fixed = fixedRepositories.get(selection.repositoryName)
    if (fixed && fixed.baseBranch !== selection.baseBranch) {
      return { ok: false, message: 'workspace.branch-workspace.member-fixed' }
    }
    if (fixedAuxiliaryEntries.has(selection.repositoryName)) {
      return { ok: false, message: 'workspace.branch-workspace.member-fixed' }
    }
  }
  for (const selection of createRequest.auxiliaryEntries) {
    const fixed = fixedAuxiliaryEntries.get(selection.name)
    if (fixed && fixed.mode !== selection.mode) {
      return { ok: false, message: 'workspace.branch-workspace.member-fixed' }
    }
    if (fixedRepositories.has(selection.name)) {
      return { ok: false, message: 'workspace.branch-workspace.member-fixed' }
    }
  }

  const repositorySelections = config.repo.flatMap((repositoryName) => {
    const selection = selectedRepositories.get(repositoryName)
    return !selection || fixedRepositories.has(repositoryName) ? [] : [selection]
  })
  const plannedRepositories = await Promise.all(
    repositorySelections.map(async (selection) => {
      signal?.throwIfAborted()
      return await planRepository(
        normalizedRootId,
        location.path,
        createRequest.branch,
        selection.repositoryName,
        selection.baseBranch,
        selection.worktreeBootstrap,
        dependencies,
        signal,
      )
    }),
  )
  const repositories: BranchWorkspaceRepositoryPlan[] = []
  for (const planned of plannedRepositories) {
    if (!planned.ok) return planned
    repositories.push(planned.repository)
  }

  const auxiliaryEntries: BranchWorkspaceAuxiliaryPlan[] = []
  for (const selection of createRequest.auxiliaryEntries) {
    signal?.throwIfAborted()
    if (fixedAuxiliaryEntries.has(selection.name)) continue
    const planned = await planAuxiliaryEntry(
      normalizedRootId,
      location.path,
      selection.name,
      selection.mode,
      dependencies,
      signal,
    )
    if (!planned.ok) return planned
    auxiliaryEntries.push(planned.entry)
  }
  if (existing && repositories.length === 0 && auxiliaryEntries.length === 0) {
    return { ok: false, message: 'workspace.branch-workspace.nothing-to-add' }
  }

  const branchWorkspaceId = existing?.id ?? stableBranchWorkspaceId(normalizedRootId, createRequest.branch)
  const manifest: BranchWorkspaceManifest = {
    id: branchWorkspaceId,
    rootId: normalizedRootId,
    branch: createRequest.branch,
    directoryName: location.directoryName,
    path: location.path,
    repositories: [
      ...(existing?.repositories.map((member) => ({ ...member })) ?? []),
      ...repositories.map((member) => ({
        repositoryName: member.repositoryName,
        targetBranch: member.targetBranch,
        baseBranch: member.baseBranch,
        branchOrigin: member.branchOrigin,
        worktreePath: member.worktreePath,
        progress: member.satisfied ? ('complete' as const) : ('pending' as const),
      })),
    ],
    auxiliaryEntries: [
      ...(existing?.auxiliaryEntries.map((entry) => ({ ...entry })) ?? []),
      ...auxiliaryEntries.map((entry) => ({
        name: entry.name,
        mode: entry.mode,
        sourcePath: entry.sourcePath,
        targetPath: entry.targetPath,
        progress: entry.satisfied ? ('complete' as const) : ('pending' as const),
      })),
    ],
  }
  const requiredApprovals: BranchWorkspaceApproval[] = []
  if (auxiliaryEntries.some((entry) => entry.outsideRoot)) requiredApprovals.push('outside-root-source')
  if (repositories.some((repository) => repository.confirmationRequired)) {
    requiredApprovals.push('worktree-bootstrap')
  }
  const planWithoutToken: Omit<BranchWorkspacePlan, 'token'> = {
    rootId: normalizedRootId,
    operation: existing ? 'extend' : 'create',
    branchWorkspaceId,
    branch: createRequest.branch,
    directoryName: location.directoryName,
    path: location.path,
    manifest,
    repositories,
    auxiliaryEntries,
    requiredApprovals,
    steps: buildSteps(!existing, location.directoryName, repositories, auxiliaryEntries),
    terminalSessionIds: [],
  }
  return { ok: true, plan: { token: planToken(planWithoutToken), ...planWithoutToken } }
}

async function buildExistingBranchWorkspacePlan(
  rootId: string,
  request: Exclude<BranchWorkspacePlanRequest, { operation: 'create' }>,
  dependencies: BranchWorkspacePlanDependencies,
  signal?: AbortSignal,
): Promise<BranchWorkspacePlanResult> {
  const normalizedRootId = workspaceRootId(rootId)
  const resources = await readPlanResources(normalizedRootId, dependencies)
  if (!resources.ok) return resources
  const manifest = resources.manifests.find((candidate) => candidate.id === request.branchWorkspaceId)
  if (!manifest) return { ok: false, message: 'workspace.branch-workspace.manifest-missing' }
  if (request.operation === 'repair') {
    if (manifest.operation?.kind === 'remove') {
      return { ok: false, message: 'workspace.branch-workspace.operation-incomplete' }
    }
    return await buildRepairPlan(manifest, resources.config.repo, dependencies, signal)
  }
  if (request.operation === 'reduce') {
    return await buildReducePlan(manifest, resources.config.repo, request, dependencies, signal)
  }
  return await buildRemovePlan(manifest, resources.config.repo, request, dependencies, signal)
}

async function buildReducePlan(
  manifest: BranchWorkspaceManifest,
  configuredRepositories: string[],
  request: Extract<BranchWorkspacePlanRequest, { operation: 'reduce' }>,
  dependencies: BranchWorkspacePlanDependencies,
  signal?: AbortSignal,
): Promise<BranchWorkspacePlanResult> {
  if (manifest.operation && manifest.operation.kind !== 'reduce') {
    return { ok: false, message: 'workspace.branch-workspace.operation-incomplete' }
  }
  const requestedNames = new Set(request.repositories)
  const memberByName = new Map(manifest.repositories.map((member) => [member.repositoryName, member]))
  if ([...requestedNames].some((name) => !memberByName.has(name))) {
    return { ok: false, message: 'workspace.branch-workspace.member-unavailable' }
  }
  if (requestedNames.size >= manifest.repositories.length) {
    return { ok: false, message: 'workspace.branch-workspace.member-required' }
  }
  if (manifest.operation?.kind === 'reduce') {
    const persistedNames = new Set(
      manifest.repositories.filter((member) => member.progress !== 'complete').map((member) => member.repositoryName),
    )
    if (!sameStringSet(requestedNames, persistedNames)) {
      return { ok: false, message: 'workspace.branch-workspace.operation-incomplete' }
    }
  } else if (
    manifest.repositories.some((member) => member.progress !== 'complete')
  ) {
    return { ok: false, message: 'workspace.branch-workspace.needs-repair' }
  }

  const root = await (dependencies.inspectPath ?? inspectBranchWorkspacePath)(
    manifest.rootId,
    manifest.path,
    signal,
  ).catch(() => null)
  if (!root?.exists || root.kind !== 'directory') {
    return { ok: false, message: 'workspace.branch-workspace.needs-repair' }
  }
  const inspect = dependencies.inspectPath ?? inspectBranchWorkspacePath
  const selectedMembers = configuredRepositories.flatMap((repositoryName) => {
    const member = memberByName.get(repositoryName)
    return member && requestedNames.has(repositoryName) ? [member] : []
  })
  if (selectedMembers.length !== requestedNames.size) {
    return { ok: false, message: 'workspace.branch-workspace.repository-unavailable' }
  }

  const repositorySnapshots = new Map<string, { repoId: string; snapshot: RepoSnapshot }>()
  for (const member of manifest.repositories) {
    signal?.throwIfAborted()
    if (member.progress === 'removed' && manifest.operation?.kind === 'reduce') continue
    const repoId = workspaceRepositoryId(manifest.rootId, member.repositoryName)
    if (!repoId || !configuredRepositories.includes(member.repositoryName)) {
      return { ok: false, message: 'workspace.branch-workspace.repository-unavailable' }
    }
    const snapshot = await (dependencies.getSnapshot ?? getRepositorySnapshot)(repoId, signal, {
      includeWorktreeStatus: true,
      includeRemote: false,
    }).catch(() => null)
    if (!snapshot) return { ok: false, message: 'workspace.branch-workspace.repository-unavailable' }
    repositorySnapshots.set(member.repositoryName, { repoId, snapshot })
    if (requestedNames.has(member.repositoryName)) continue
    const worktree = snapshot.branches.find((branch) => branch.name === member.targetBranch)?.worktree
    if (!worktree) return { ok: false, message: 'workspace.branch-workspace.needs-repair' }
    if (!sameHostPath(manifest.rootId, worktree.path, member.worktreePath)) {
      return { ok: false, message: 'workspace.branch-workspace.needs-repair' }
    }
  }

  const repositories: BranchWorkspaceRepositoryPlan[] = []
  for (const member of selectedMembers) {
    signal?.throwIfAborted()
    const repoId = workspaceRepositoryId(manifest.rootId, member.repositoryName)
    if (!repoId) return { ok: false, message: 'workspace.branch-workspace.repository-unavailable' }
    if (member.progress === 'removed' && manifest.operation?.kind === 'reduce') {
      repositories.push(reduceRepositoryPlan(member, repoId, false, true))
      continue
    }
    const snapshot = repositorySnapshots.get(member.repositoryName)?.snapshot
    if (!snapshot) return { ok: false, message: 'workspace.branch-workspace.repository-unavailable' }
    const registered = registeredWorktreeAtPath(manifest.rootId, snapshot, member.worktreePath)
    if (!registered) {
      const target = await inspect(manifest.rootId, member.worktreePath, signal).catch(() => null)
      if (!target) return { ok: false, message: 'workspace.branch-workspace.read-failed' }
      if (target.exists) {
        return { ok: false, message: 'workspace.branch-workspace.member-path-not-worktree' }
      }
      repositories.push(reduceRepositoryPlan(member, repoId, false, true))
      continue
    }
    const { branch: checkedOutBranch, worktree } = registered
    if (worktree.isPrimary) return { ok: false, message: 'workspace.branch-workspace.primary-worktree' }
    if (worktree.isLocked) return { ok: false, message: 'workspace.branch-workspace.locked-worktree' }
    if (typeof worktree.summary?.dirty !== 'boolean') {
      return { ok: false, message: 'workspace.branch-workspace.dirty-state-unknown' }
    }
    repositories.push(reduceRepositoryPlan(member, repoId, worktree.summary.dirty, false, checkedOutBranch))
  }

  const terminalSessionIds = await terminalSessionIdsForPaths(
    manifest,
    configuredRepositories,
    selectedMembers.map((member) => member.worktreePath),
    dependencies,
  )
  if (!terminalSessionIds) return { ok: false, message: 'workspace.branch-workspace.terminal-read-failed' }
  const requiredApprovals: BranchWorkspaceApproval[] = []
  if (repositories.some((repository) => repository.dirty)) requiredApprovals.push('discard-member-changes')
  if (terminalSessionIds.length > 0) requiredApprovals.push('close-terminals')
  const reducingManifest: BranchWorkspaceManifest = {
    ...manifest,
    repositories: manifest.repositories.map((member) =>
      requestedNames.has(member.repositoryName) && member.progress !== 'removed'
        ? { ...member, progress: 'pending', lastError: undefined }
        : { ...member },
    ),
    auxiliaryEntries: manifest.auxiliaryEntries.map((entry) => ({ ...entry })),
  }
  const steps = repositories.flatMap((repository) =>
    repository.satisfied
      ? []
      : [
          {
            id: `repository:${repository.repositoryName}`,
            kind: 'remove-worktree' as const,
            label: repository.repositoryName,
            repositoryName: repository.repositoryName,
          },
        ],
  )
  const planWithoutToken: Omit<BranchWorkspacePlan, 'token'> = {
    rootId: manifest.rootId,
    operation: 'reduce',
    branchWorkspaceId: manifest.id,
    branch: manifest.branch,
    directoryName: manifest.directoryName,
    path: manifest.path,
    manifest: reducingManifest,
    repositories,
    auxiliaryEntries: [],
    requiredApprovals,
    steps,
    terminalSessionIds,
  }
  return { ok: true, plan: { token: planToken(planWithoutToken), ...planWithoutToken } }
}

function reduceRepositoryPlan(
  member: BranchWorkspaceManifest['repositories'][number],
  repoId: string,
  dirty: boolean,
  satisfied: boolean,
  checkedOutBranch?: string,
): BranchWorkspaceRepositoryPlan {
  return {
    repositoryName: member.repositoryName,
    repoId,
    targetBranch: member.targetBranch,
    ...(checkedOutBranch ? { checkedOutBranch } : {}),
    baseBranch: member.baseBranch,
    branchOrigin: member.branchOrigin,
    worktreePath: member.worktreePath,
    mode: { kind: 'existingBranch', branch: member.targetBranch },
    worktreeBootstrap: { kind: 'skip' },
    confirmationRequired: false,
    satisfied,
    action: satisfied ? 'satisfied' : 'remove-worktree',
    worktreePresent: !satisfied,
    dirty,
  }
}

async function buildRepairPlan(
  manifest: BranchWorkspaceManifest,
  configuredRepositories: string[],
  dependencies: BranchWorkspacePlanDependencies,
  signal?: AbortSignal,
): Promise<BranchWorkspacePlanResult> {
  const inspect = dependencies.inspectPath ?? inspectBranchWorkspacePath
  const root = await inspect(manifest.rootId, manifest.path, signal).catch(() => null)
  if (!root) return { ok: false, message: 'workspace.branch-workspace.read-failed' }
  if (root.exists && root.kind !== 'directory') {
    return { ok: false, message: 'workspace.branch-workspace.target-exists' }
  }

  const repositoryChecks = Promise.allSettled(
    manifest.repositories.map(async (member) => {
      signal?.throwIfAborted()
      if (!configuredRepositories.includes(member.repositoryName)) {
        return { ok: false as const, message: 'workspace.branch-workspace.repository-unavailable' }
      }
      return await planRepairRepository(manifest, member, dependencies, signal)
    }),
  )
  const plannedRepositories = await repositoryChecks
  const repositories: BranchWorkspaceRepositoryPlan[] = []
  for (const settled of plannedRepositories) {
    if (settled.status === 'rejected') throw settled.reason
    const planned = settled.value
    if (!planned.ok) return planned
    repositories.push(planned.repository)
  }
  const auxiliaryEntries: BranchWorkspaceAuxiliaryPlan[] = []

  const requiredApprovals: BranchWorkspaceApproval[] = []
  const repositoryByName = new Map(repositories.map((repository) => [repository.repositoryName, repository]))
  const repairedManifest: BranchWorkspaceManifest = {
    ...manifest,
    repositories: manifest.repositories.map((member) => ({
      ...member,
      progress: repositoryByName.get(member.repositoryName)?.satisfied ? 'complete' : 'pending',
      lastError: undefined,
    })),
    auxiliaryEntries: [],
  }
  const steps: BranchWorkspacePlan['steps'] = [
    ...(!root.exists ? [{ id: 'directory', kind: 'create-directory' as const, label: manifest.directoryName }] : []),
    ...repositories.flatMap((repository) => {
      if (repository.satisfied) return []
      return [
        {
          id: `repository:${repository.repositoryName}`,
          kind: 'create-worktree' as const,
          label: repository.repositoryName,
          repositoryName: repository.repositoryName,
        },
      ]
    }),
  ]
  if (steps.length === 0 && !manifest.operation && manifest.auxiliaryEntries.length === 0) {
    return { ok: false, message: 'workspace.branch-workspace.nothing-to-repair' }
  }
  const planWithoutToken: Omit<BranchWorkspacePlan, 'token'> = {
    rootId: manifest.rootId,
    operation: 'repair',
    branchWorkspaceId: manifest.id,
    branch: manifest.branch,
    directoryName: manifest.directoryName,
    path: manifest.path,
    manifest: repairedManifest,
    repositories,
    auxiliaryEntries,
    requiredApprovals,
    steps,
    terminalSessionIds: [],
  }
  return { ok: true, plan: { token: planToken(planWithoutToken), ...planWithoutToken } }
}

async function planRepairRepository(
  manifest: BranchWorkspaceManifest,
  member: BranchWorkspaceManifest['repositories'][number],
  dependencies: BranchWorkspacePlanDependencies,
  signal?: AbortSignal,
): Promise<{ ok: true; repository: BranchWorkspaceRepositoryPlan } | { ok: false; message: string }> {
  const repoId = workspaceRepositoryId(manifest.rootId, member.repositoryName)
  if (!repoId) return { ok: false, message: 'workspace.branch-workspace.repository-unavailable' }
  const snapshot = await (dependencies.getSnapshot ?? getRepositorySnapshot)(repoId, signal, {
    includeWorktreeStatus: false,
    includeRemote: false,
  }).catch(() => null)
  if (!snapshot) return { ok: false, message: 'workspace.branch-workspace.repository-unavailable' }
  const branch = snapshot.branches.find((candidate) => candidate.name === member.targetBranch)
  if (branch?.worktree) {
    if (!sameHostPath(manifest.rootId, branch.worktree.path, member.worktreePath)) {
      return { ok: false, message: 'workspace.branch-workspace.worktree-elsewhere' }
    }
    return {
      ok: true,
      repository: {
        ...repairRepositoryPlan(member, repoId, { kind: 'existingBranch', branch: member.targetBranch }, true),
      },
    }
  }
  const target = await (dependencies.inspectPath ?? inspectBranchWorkspacePath)(
    manifest.rootId,
    member.worktreePath,
    signal,
  ).catch(() => null)
  if (!target) return { ok: false, message: 'workspace.branch-workspace.read-failed' }
  if (target.exists) return { ok: false, message: 'workspace.branch-workspace.target-exists' }
  if (!branch && !snapshot.branches.some((candidate) => candidate.name === member.baseBranch)) {
    return { ok: false, message: 'workspace.branch-workspace.base-unavailable' }
  }
  const mode = branch
    ? ({ kind: 'existingBranch', branch: member.targetBranch } as const)
    : ({ kind: 'newBranch', newBranch: member.targetBranch, baseRef: member.baseBranch } as const)
  return {
    ok: true,
    repository: repairRepositoryPlan(member, repoId, mode, false),
  }
}

function repairRepositoryPlan(
  member: BranchWorkspaceManifest['repositories'][number],
  repoId: string,
  mode: BranchWorkspaceRepositoryPlan['mode'],
  satisfied: boolean,
): BranchWorkspaceRepositoryPlan {
  return {
    repositoryName: member.repositoryName,
    repoId,
    targetBranch: member.targetBranch,
    baseBranch: member.baseBranch,
    branchOrigin: member.branchOrigin,
    worktreePath: member.worktreePath,
    mode,
    worktreeBootstrap: { kind: 'skip' },
    confirmationRequired: false,
    satisfied,
    action: satisfied ? 'satisfied' : 'create-worktree',
  }
}

async function buildRemovePlan(
  manifest: BranchWorkspaceManifest,
  configuredRepositories: string[],
  request: Extract<BranchWorkspacePlanRequest, { operation: 'remove' }>,
  dependencies: BranchWorkspacePlanDependencies,
  signal?: AbortSignal,
): Promise<BranchWorkspacePlanResult> {
  const inspect = dependencies.inspectPath ?? inspectBranchWorkspacePath
  const root = await inspect(manifest.rootId, manifest.path, signal).catch(() => null)
  if (!root) return { ok: false, message: 'workspace.branch-workspace.read-failed' }
  if (root.exists && root.kind !== 'directory') {
    return { ok: false, message: 'workspace.branch-workspace.root-not-directory' }
  }

  const repositories: BranchWorkspaceRepositoryPlan[] = []
  const unmanagedMemberEntries: string[] = []
  for (const member of manifest.repositories) {
    signal?.throwIfAborted()
    if (!configuredRepositories.includes(member.repositoryName)) {
      return { ok: false, message: 'workspace.branch-workspace.repository-unavailable' }
    }
    const repository = await planRemoveRepository(manifest, member, request, dependencies, signal)
    if (!repository.ok) return repository
    repositories.push(repository.repository)
    if (repository.unmanagedEntry) unmanagedMemberEntries.push(repository.unmanagedEntry)
  }

  const auxiliaryEntries: BranchWorkspaceAuxiliaryPlan[] = []
  let modifiedCopy = false
  let unsafeManagedEntry = false
  for (const entry of manifest.auxiliaryEntries) {
    signal?.throwIfAborted()
    const target = await inspect(manifest.rootId, entry.targetPath, signal).catch(() => null)
    if (!target) return { ok: false, message: 'workspace.branch-workspace.read-failed' }
    let modified = false
    if (target.exists && entry.mode === 'copy') {
      const fingerprint = await (dependencies.fingerprintEntry ?? fingerprintBranchWorkspaceEntry)(
        manifest.rootId,
        entry.targetPath,
        signal,
      ).catch(() => null)
      if (!fingerprint) return { ok: false, message: 'workspace.branch-workspace.read-failed' }
      modified = !entry.copyBaseline || fingerprint !== entry.copyBaseline
      modifiedCopy ||= modified
    }
    if (target.exists && entry.mode === 'symlink' && target.kind !== 'symlink') unsafeManagedEntry = true
    auxiliaryEntries.push({
      name: entry.name,
      mode: entry.mode,
      sourcePath: entry.sourcePath,
      targetPath: entry.targetPath,
      outsideRoot: false,
      satisfied: !target.exists,
      action: target.exists ? 'remove' : 'satisfied',
      ...(modified ? { modified: true } : {}),
    })
  }

  let unmanagedEntries: string[] = [...unmanagedMemberEntries]
  if (root.exists) {
    const children = await (dependencies.listChildren ?? listBranchWorkspaceChildren)(
      manifest.rootId,
      manifest.path,
      signal,
    ).catch(() => null)
    if (!children) return { ok: false, message: 'workspace.branch-workspace.read-failed' }
    const managed = new Set([
      ...manifest.repositories
        .map((member) => member.repositoryName)
        .filter((repositoryName) => !unmanagedMemberEntries.includes(repositoryName)),
      ...manifest.auxiliaryEntries.map((entry) => entry.name),
    ])
    unmanagedEntries = [...new Set([...unmanagedEntries, ...children.filter((name) => !managed.has(name))])]
  }

  const terminalSessionIds = await descendantTerminalSessionIds(manifest, configuredRepositories, dependencies)
  if (!terminalSessionIds) return { ok: false, message: 'workspace.branch-workspace.terminal-read-failed' }
  const requiredApprovals: BranchWorkspaceApproval[] = []
  if (modifiedCopy) requiredApprovals.push('modified-copy')
  if (unsafeManagedEntry || unmanagedEntries.length > 0) requiredApprovals.push('unmanaged-content')
  if (terminalSessionIds.length > 0) requiredApprovals.push('close-terminals')

  const repositoryByName = new Map(repositories.map((repository) => [repository.repositoryName, repository]))
  const auxiliaryByName = new Map(auxiliaryEntries.map((entry) => [entry.name, entry]))
  const removingManifest: BranchWorkspaceManifest = {
    ...manifest,
    repositories: manifest.repositories.map((member) => ({
      ...member,
      progress: repositoryByName.get(member.repositoryName)?.satisfied ? 'removed' : 'pending',
      ...(repositoryByName.get(member.repositoryName)?.deleteBranch
        ? { branchCleanupProgress: 'pending' as const }
        : {}),
      ...(repositoryByName.get(member.repositoryName)?.deleteUpstream
        ? { upstreamCleanupProgress: 'pending' as const }
        : {}),
      lastError: undefined,
    })),
    auxiliaryEntries: manifest.auxiliaryEntries.map((entry) => ({
      ...entry,
      progress: auxiliaryByName.get(entry.name)?.satisfied ? 'removed' : 'pending',
      lastError: undefined,
    })),
  }
  const steps = buildRemoveSteps(repositories, auxiliaryEntries, unmanagedEntries, root.exists, manifest.directoryName)
  const planWithoutToken: Omit<BranchWorkspacePlan, 'token'> = {
    rootId: manifest.rootId,
    operation: 'remove',
    branchWorkspaceId: manifest.id,
    branch: manifest.branch,
    directoryName: manifest.directoryName,
    path: manifest.path,
    manifest: removingManifest,
    repositories,
    auxiliaryEntries,
    requiredApprovals,
    steps,
    terminalSessionIds,
    unmanagedEntries,
    removalOptions: {
      alsoDeleteBranch: request.alsoDeleteBranch,
      alsoDeleteUpstream: request.alsoDeleteUpstream,
    },
  }
  return { ok: true, plan: { token: planToken(planWithoutToken), ...planWithoutToken } }
}

async function planRemoveRepository(
  manifest: BranchWorkspaceManifest,
  member: BranchWorkspaceManifest['repositories'][number],
  request: Extract<BranchWorkspacePlanRequest, { operation: 'remove' }>,
  dependencies: BranchWorkspacePlanDependencies,
  signal?: AbortSignal,
): Promise<
  { ok: true; repository: BranchWorkspaceRepositoryPlan; unmanagedEntry?: string } | { ok: false; message: string }
> {
  const repoId = workspaceRepositoryId(manifest.rootId, member.repositoryName)
  if (!repoId) return { ok: false, message: 'workspace.branch-workspace.repository-unavailable' }
  const snapshot = await (dependencies.getSnapshot ?? getRepositorySnapshot)(repoId, signal).catch(() => null)
  if (!snapshot) return { ok: false, message: 'workspace.branch-workspace.repository-unavailable' }
  const branch = snapshot.branches.find((candidate) => candidate.name === member.targetBranch)
  const registered = registeredWorktreeAtPath(manifest.rootId, snapshot, member.worktreePath)
  const worktree = registered?.worktree
  if (worktree?.isPrimary) return { ok: false, message: 'workspace.branch-workspace.primary-worktree' }
  if (worktree?.isLocked) return { ok: false, message: 'workspace.branch-workspace.locked-worktree' }
  let unmanagedEntry: string | undefined
  if (!worktree) {
    const target = await (dependencies.inspectPath ?? inspectBranchWorkspacePath)(
      manifest.rootId,
      member.worktreePath,
      signal,
    ).catch(() => null)
    if (!target) return { ok: false, message: 'workspace.branch-workspace.read-failed' }
    if (target.exists) unmanagedEntry = member.repositoryName
  }

  const targetCheckedOutElsewhere =
    !!branch?.worktree && !sameHostPath(manifest.rootId, branch.worktree.path, member.worktreePath)
  const deleteBranch =
    request.alsoDeleteBranch && member.branchOrigin === 'created' && !!branch && !targetCheckedOutElsewhere
  if (deleteBranch && PROTECTED_BRANCHES.has(member.targetBranch)) {
    return { ok: false, message: 'workspace.branch-workspace.protected-branch' }
  }
  const deleteUpstreamRequested = request.alsoDeleteUpstream && deleteBranch
  const upstream = branch?.tracking ? parseRemoteBranchRef(branch.tracking) : null
  const upstreamAlreadyAbsent = branch?.trackingGone === true && upstream !== null
  const deleteUpstream = deleteUpstreamRequested && !upstreamAlreadyAbsent
  if (deleteUpstream && (!upstream || isProtectedRemoteBranchRef(upstream.fullRef))) {
    return { ok: false, message: 'workspace.branch-workspace.upstream-unavailable' }
  }
  const satisfied = !worktree && !deleteBranch
  return {
    ok: true,
    repository: {
      repositoryName: member.repositoryName,
      repoId,
      targetBranch: member.targetBranch,
      ...(registered ? { checkedOutBranch: registered.branch } : {}),
      baseBranch: member.baseBranch,
      branchOrigin: member.branchOrigin,
      worktreePath: member.worktreePath,
      mode: { kind: 'existingBranch', branch: member.targetBranch },
      worktreeBootstrap: { kind: 'skip' },
      confirmationRequired: false,
      satisfied,
      action: satisfied ? 'satisfied' : worktree ? 'remove-worktree' : 'delete-branch',
      worktreePresent: !!worktree,
      deleteBranch,
      deleteUpstream,
      ...(deleteUpstream && branch?.tracking ? { upstream: branch.tracking } : {}),
    },
    ...(unmanagedEntry ? { unmanagedEntry } : {}),
  }
}

async function descendantTerminalSessionIds(
  manifest: BranchWorkspaceManifest,
  configuredRepositories: string[],
  dependencies: BranchWorkspacePlanDependencies,
): Promise<string[] | null> {
  if (!dependencies.listTerminalSessions) return []
  const scopes = [
    manifest.rootId,
    ...configuredRepositories
      .map((repositoryName) => workspaceRepositoryId(manifest.rootId, repositoryName))
      .filter((repoId): repoId is string => !!repoId),
  ]
  try {
    const sessions = (
      await Promise.all(scopes.map(async (scope) => await dependencies.listTerminalSessions!(scope)))
    ).flat()
    const ids: string[] = []
    const seen = new Set<string>()
    for (const session of sessions) {
      const targetPath = terminalTargetPath(session)
      if (
        !targetPath ||
        !sameHostDescendant(manifest.rootId, manifest.path, targetPath) ||
        seen.has(session.sessionId)
      ) {
        continue
      }
      seen.add(session.sessionId)
      ids.push(session.sessionId)
    }
    return ids
  } catch {
    return null
  }
}

async function terminalSessionIdsForPaths(
  manifest: BranchWorkspaceManifest,
  configuredRepositories: string[],
  selectedPaths: string[],
  dependencies: BranchWorkspacePlanDependencies,
): Promise<string[] | null> {
  if (!dependencies.listTerminalSessions) return []
  const scopes = [
    manifest.rootId,
    ...configuredRepositories
      .map((repositoryName) => workspaceRepositoryId(manifest.rootId, repositoryName))
      .filter((repoId): repoId is string => !!repoId),
  ]
  try {
    const sessions = (
      await Promise.all(scopes.map(async (scope) => await dependencies.listTerminalSessions!(scope)))
    ).flat()
    const ids: string[] = []
    const seen = new Set<string>()
    for (const session of sessions) {
      const targetPath = terminalTargetPath(session)
      if (
        !targetPath ||
        !selectedPaths.some((selectedPath) => sameHostDescendant(manifest.rootId, selectedPath, targetPath)) ||
        seen.has(session.sessionId)
      ) {
        continue
      }
      seen.add(session.sessionId)
      ids.push(session.sessionId)
    }
    return ids
  } catch {
    return null
  }
}

function terminalTargetPath(session: TerminalSessionSummary): string | null {
  const parts = session.key.split('\0')
  return parts.length >= 3 && parts[1] ? parts[1] : null
}

function sameHostDescendant(rootId: string, parentPath: string, candidatePath: string): boolean {
  const pathApi = isRemoteRepoId(rootId) ? path.posix : path
  const parent = pathApi.resolve(parentPath)
  const candidate = pathApi.resolve(candidatePath)
  const relative = pathApi.relative(parent, candidate)
  return (
    relative === '' || (!relative.startsWith(`..${pathApi.sep}`) && relative !== '..' && !pathApi.isAbsolute(relative))
  )
}

function sameStringSet(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && [...left].every((value) => right.has(value))
}

function buildRemoveSteps(
  repositories: BranchWorkspaceRepositoryPlan[],
  auxiliaryEntries: BranchWorkspaceAuxiliaryPlan[],
  unmanagedEntries: string[],
  removeDirectory: boolean,
  directoryName: string,
): BranchWorkspacePlan['steps'] {
  return [
    ...repositories.flatMap((repository) => {
      if (repository.satisfied) return []
      return [
        ...(repository.worktreePresent
          ? [
              {
                id: `repository:${repository.repositoryName}`,
                kind: 'remove-worktree' as const,
                label: repository.repositoryName,
                repositoryName: repository.repositoryName,
              },
            ]
          : []),
        ...(repository.deleteBranch
          ? [
              {
                id: `branch:${repository.repositoryName}`,
                kind: 'delete-local-branch' as const,
                label: repository.targetBranch,
                repositoryName: repository.repositoryName,
              },
            ]
          : []),
        ...(repository.deleteUpstream
          ? [
              {
                id: `upstream:${repository.repositoryName}`,
                kind: 'delete-upstream-branch' as const,
                label: repository.upstream ?? repository.targetBranch,
                repositoryName: repository.repositoryName,
              },
            ]
          : []),
      ]
    }),
    ...auxiliaryEntries
      .filter((entry) => !entry.satisfied)
      .map((entry) => ({
        id: `auxiliary:${entry.name}`,
        kind: 'remove-entry' as const,
        label: entry.name,
        entryName: entry.name,
      })),
    ...unmanagedEntries.map((entryName) => ({
      id: `unmanaged:${entryName}`,
      kind: 'remove-entry' as const,
      label: entryName,
      entryName,
    })),
    ...(removeDirectory ? [{ id: 'directory', kind: 'remove-directory' as const, label: directoryName }] : []),
  ]
}

async function readPlanResources(
  rootId: string,
  dependencies: BranchWorkspacePlanDependencies,
): Promise<
  | {
      ok: true
      config: Extract<WorkspaceConfigSnapshot, { kind: 'ready' }>['config']
      manifests: BranchWorkspaceManifest[]
    }
  | { ok: false; message: string }
> {
  try {
    const [configSnapshot, manifestSnapshot] = await Promise.all([
      (dependencies.readConfig ?? readWorkspaceConfig)(rootId),
      (dependencies.readManifests ?? readBranchWorkspaceManifests)(rootId),
    ])
    if (configSnapshot.kind !== 'ready') return { ok: false, message: 'workspace.configuration-required' }
    if (manifestSnapshot.kind === 'invalid') return { ok: false, message: manifestSnapshot.message }
    return {
      ok: true,
      config: configSnapshot.config,
      manifests: manifestSnapshot.kind === 'ready' ? manifestSnapshot.manifests : [],
    }
  } catch (error) {
    return { ok: false, message: safePlanMessage(error, 'workspace.branch-workspace.read-failed') }
  }
}

async function resolveBranchWorkspaceLocation(
  rootId: string,
  branch: string,
  existing: BranchWorkspaceManifest | undefined,
  manifests: BranchWorkspaceManifest[],
  dependencies: BranchWorkspacePlanDependencies,
  signal?: AbortSignal,
): Promise<{ ok: true; directoryName: string; path: string } | { ok: false; message: string }> {
  const inspect = dependencies.inspectPath ?? inspectBranchWorkspacePath
  if (existing) {
    const observed = await inspect(rootId, existing.path, signal).catch(() => null)
    return observed?.exists && observed.kind === 'directory'
      ? { ok: true, directoryName: existing.directoryName, path: existing.path }
      : { ok: false, message: 'workspace.branch-workspace.needs-repair' }
  }

  const occupied = new Set(manifests.map((manifest) => manifest.directoryName))
  while (true) {
    const directoryName = branchWorkspaceDirectoryName(branch, occupied)
    const candidatePath = branchWorkspacePath(rootId, directoryName)
    const observed = await inspect(rootId, candidatePath, signal).catch(() => null)
    if (!observed) return { ok: false, message: 'workspace.branch-workspace.read-failed' }
    if (!observed.exists) return { ok: true, directoryName, path: candidatePath }
    occupied.add(directoryName)
  }
}

async function planRepository(
  rootId: string,
  workspacePath: string,
  targetBranch: string,
  repositoryName: string,
  baseBranch: string,
  requestedBootstrap: WorktreeBootstrapDecision | undefined,
  dependencies: BranchWorkspacePlanDependencies,
  signal?: AbortSignal,
): Promise<{ ok: true; repository: BranchWorkspaceRepositoryPlan } | { ok: false; message: string }> {
  const repoId = workspaceRepositoryId(rootId, repositoryName)
  if (!repoId) return { ok: false, message: 'workspace.branch-workspace.repository-unavailable' }
  let snapshot: RepoSnapshot | null
  try {
    snapshot = await (dependencies.getSnapshot ?? getRepositorySnapshot)(repoId, signal, {
      includeWorktreeStatus: false,
      includeRemote: false,
    })
  } catch {
    snapshot = null
  }
  if (!snapshot) return { ok: false, message: 'workspace.branch-workspace.repository-unavailable' }
  const pathApi = isRemoteRepoId(rootId) ? path.posix : path
  const worktreePath = pathApi.join(workspacePath, repositoryName)
  const target = snapshot.branches.find((candidate) => candidate.name === targetBranch)
  if (target?.worktree) {
    if (!sameHostPath(rootId, target.worktree.path, worktreePath)) {
      return { ok: false, message: 'workspace.branch-workspace.worktree-elsewhere' }
    }
    return {
      ok: true,
      repository: {
        repositoryName,
        repoId,
        targetBranch,
        baseBranch,
        branchOrigin: 'pre-existing',
        worktreePath,
        mode: { kind: 'existingBranch', branch: targetBranch },
        worktreeBootstrap: { kind: 'skip' },
        confirmationRequired: false,
        satisfied: true,
      },
    }
  }

  const mode = target
    ? ({ kind: 'existingBranch', branch: targetBranch } as const)
    : ({ kind: 'newBranch', newBranch: targetBranch, baseRef: baseBranch } as const)
  if (!target && !snapshot.branches.some((candidate) => candidate.name === baseBranch)) {
    return { ok: false, message: 'workspace.branch-workspace.base-unavailable' }
  }
  try {
    if (await (dependencies.pathExists ?? workspacePathExists)(repoId, worktreePath)) {
      return { ok: false, message: 'workspace.branch-workspace.target-exists' }
    }
  } catch (error) {
    return { ok: false, message: safePlanMessage(error, 'workspace.branch-workspace.repository-unavailable') }
  }

  const sourceWorktreePath = snapshot.branches.find((candidate) => candidate.name === baseBranch)?.worktree?.path

  const bootstrap = await (dependencies.getBootstrapPreflight ?? getRepositoryWorktreeBootstrapPreflight)(
    repoId,
    signal,
    'all-untracked',
    sourceWorktreePath,
  )
  if (!bootstrap.ok) return bootstrap
  const decision = requestedBootstrap ?? { kind: 'skip' }
  if (decision.kind === 'materialize') {
    const candidates = new Set(bootstrap.preflight.candidates.map((candidate) => candidate.path))
    if (decision.selections.some((selection) => !candidates.has(selection.path))) {
      return { ok: false, message: 'error.worktree-bootstrap-selection-stale' }
    }
  }
  return {
    ok: true,
    repository: {
      repositoryName,
      repoId,
      targetBranch,
      baseBranch,
      branchOrigin: target ? 'pre-existing' : 'created',
      worktreePath,
      mode,
      worktreeBootstrap:
        decision.kind === 'materialize'
          ? {
              kind: 'materialize',
              candidateScope: 'all-untracked',
              selections: decision.selections.map((selection) => ({ ...selection })),
              ...(sourceWorktreePath ? { sourceWorktreePath } : {}),
            }
          : { kind: 'skip' },
      confirmationRequired: false,
      satisfied: false,
    },
  }
}

async function planAuxiliaryEntry(
  rootId: string,
  workspacePath: string,
  name: string,
  mode: BranchWorkspaceAuxiliaryPlan['mode'],
  dependencies: BranchWorkspacePlanDependencies,
  signal?: AbortSignal,
): Promise<{ ok: true; entry: BranchWorkspaceAuxiliaryPlan } | { ok: false; message: string }> {
  const rootPath = workspaceRepositoryPath(rootId)
  if (!rootPath) return { ok: false, message: 'workspace.branch-workspace.invalid-root' }
  const pathApi = isRemoteRepoId(rootId) ? path.posix : path
  const sourcePath = pathApi.join(rootPath, name)
  const targetPath = pathApi.join(workspacePath, name)
  const inspect = dependencies.inspectPath ?? inspectBranchWorkspacePath
  const [source, target] = await Promise.all([
    inspect(rootId, sourcePath, signal).catch(() => null),
    inspect(rootId, targetPath, signal).catch(() => null),
  ])
  if (!source?.exists || !source.directChild) {
    return { ok: false, message: 'workspace.branch-workspace.source-unavailable' }
  }
  if (!target || target.exists) return { ok: false, message: 'workspace.branch-workspace.target-exists' }
  return {
    ok: true,
    entry: {
      name,
      mode,
      sourcePath,
      targetPath,
      ...(source.resolvedPath ? { resolvedSourcePath: source.resolvedPath } : {}),
      outsideRoot: source.outsideRoot,
      satisfied: false,
    },
  }
}

function buildSteps(
  createDirectory: boolean,
  directoryName: string,
  repositories: BranchWorkspaceRepositoryPlan[],
  auxiliaryEntries: BranchWorkspaceAuxiliaryPlan[],
): BranchWorkspacePlan['steps'] {
  return [
    ...(createDirectory ? [{ id: 'directory', kind: 'create-directory' as const, label: directoryName }] : []),
    ...repositories
      .filter((repository) => !repository.satisfied)
      .map((repository) => ({
        id: `repository:${repository.repositoryName}`,
        kind: 'create-worktree' as const,
        label: repository.repositoryName,
        repositoryName: repository.repositoryName,
      })),
    ...auxiliaryEntries
      .filter((entry) => !entry.satisfied)
      .map((entry) => ({
        id: `auxiliary:${entry.name}`,
        kind: entry.mode === 'symlink' ? ('symlink-entry' as const) : ('copy-entry' as const),
        label: entry.name,
        entryName: entry.name,
      })),
  ]
}

function stableBranchWorkspaceId(rootId: string, branch: string): string {
  return `branch-workspace:${createHash('sha256').update(`${rootId}\0${branch}`).digest('hex').slice(0, 16)}`
}

function planToken(plan: Omit<BranchWorkspacePlan, 'token'>): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(plan), 'utf8').digest('hex')}`
}

function sameHostPath(rootId: string, left: string, right: string): boolean {
  return isRemoteRepoId(rootId)
    ? path.posix.normalize(left) === path.posix.normalize(right)
    : path.resolve(left) === path.resolve(right)
}

function registeredWorktreeAtPath(
  rootId: string,
  snapshot: RepoSnapshot,
  worktreePath: string,
): {
  branch: string
  worktree: NonNullable<RepoSnapshot['branches'][number]['worktree']>
} | null {
  for (const branch of snapshot.branches) {
    if (branch.worktree && sameHostPath(rootId, branch.worktree.path, worktreePath)) {
      return { branch: branch.name, worktree: branch.worktree }
    }
  }
  return null
}

function safePlanMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : ''
  return message === 'cancelled' || message.startsWith('workspace.') || message.startsWith('error.')
    ? message
    : fallback
}
