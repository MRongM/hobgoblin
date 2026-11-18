import { randomUUID } from 'node:crypto'
import { lstat, realpath } from 'node:fs/promises'
import path from 'node:path'
import { readBranchWorkspaceCatalog } from '#/server/modules/branch-workspace-catalog-read.ts'
import { readBranchWorkspaceManifests } from '#/server/modules/branch-workspace-source.ts'
import { branchWorkspacePath, workspaceRootId } from '#/server/modules/workspace-paths.ts'
import {
  inspectWorkspaceSnapshot,
  resolveWorkspaceSnapshotSource,
} from '#/server/modules/branch-workspace-clone-source.ts'
import { snapshotGit, validateSnapshotDestinationEntries } from '#/system/git/workspace-snapshot.ts'
import { isSafeBranchWorkspaceFolderName } from '#/shared/branch-workspaces.ts'
import { isRemoteRepoId } from '#/shared/remote-repo.ts'
import {
  isWorkspaceSnapshotRelativePath,
  type BranchWorkspaceClonePlan,
  type BranchWorkspaceCloneRequest,
} from '#/shared/branch-workspace-clone.ts'

export async function assertCloneDestinationParent(directory: string): Promise<string> {
  if (!path.isAbsolute(directory)) throw new Error('Clone destination must be an absolute directory on this server')
  const normalized = path.resolve(directory)
  let current = path.parse(normalized).root
  for (const part of normalized.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part)
    const info = await lstat(current)
    if (!info.isDirectory() || info.isSymbolicLink())
      throw new Error('Clone destination parent must not traverse symbolic links')
  }
  return await realpath(normalized)
}

export async function assertCloneDestinationAbsent(destination: string): Promise<void> {
  try {
    await lstat(destination)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
  throw new Error('Clone destination already exists')
}

export async function buildBranchWorkspaceClonePlan(
  request: BranchWorkspaceCloneRequest,
  signal?: AbortSignal,
): Promise<BranchWorkspaceClonePlan> {
  if (
    !request ||
    typeof request.sourceRootId !== 'string' ||
    typeof request.targetRootId !== 'string' ||
    typeof request.sourceBranchWorkspaceId !== 'string' ||
    !isSafeBranchWorkspaceFolderName(request.directoryName)
  )
    throw new Error('Invalid working-copy clone request')
  if (!isRemoteRepoId(request.sourceRootId) || isRemoteRepoId(request.targetRootId))
    throw new Error('Select an SSH or WSL source and a local workspace on this server')
  const sourceRootId = workspaceRootId(request.sourceRootId)
  const targetRootId = workspaceRootId(request.targetRootId)
  await assertCloneDestinationParent(targetRootId)
  const parentDirectory = request.parentDirectory === undefined ? targetRootId : request.parentDirectory
  if (typeof parentDirectory !== 'string') throw new Error('Invalid clone destination directory')
  await assertCloneDestinationParent(parentDirectory)
  const destination = branchWorkspacePath(targetRootId, request.directoryName, parentDirectory)
  await assertCloneDestinationAbsent(destination)
  const registry = await readBranchWorkspaceManifests(targetRootId)
  if (registry.kind === 'invalid') throw new Error(registry.message)
  if (registry.kind === 'ready' && registry.manifests.some((manifest) => manifest.path === destination))
    throw new Error('Clone destination is already registered')
  const catalog = await readBranchWorkspaceCatalog(sourceRootId, signal, {
    target: { branchWorkspaceId: request.sourceBranchWorkspaceId },
  })
  const source =
    catalog.kind === 'ready'
      ? catalog.manifests.find((manifest) => manifest.id === request.sourceBranchWorkspaceId)
      : undefined
  if (!source || source.operation || source.repositories.some((member) => member.progress !== 'complete'))
    throw new Error('Source subworkspace is missing or has an unfinished operation')
  const isSourceRoot = (memberPath: string) => path.posix.resolve(memberPath) === path.posix.resolve(source.path)
  const rootRepository = source.repositories.some((member) => isSourceRoot(member.worktreePath))
  if (rootRepository && source.repositories.length !== 1)
    throw new Error('Repository-root snapshot cannot also contain nested members')
  const names = source.repositories.map((member) => member.repositoryName)
  if (new Set(names.map((name) => name.normalize('NFC').toLowerCase())).size !== names.length)
    throw new Error('Source member names collide on the destination')
  const ignoredPaths = request.ignoredPaths ?? {}
  if (typeof ignoredPaths !== 'object' || Array.isArray(ignoredPaths)) throw new Error('Invalid ignored-file selection')
  for (const [name, selections] of Object.entries(ignoredPaths)) {
    if (
      !names.includes(name) ||
      !Array.isArray(selections) ||
      selections.length > 12_000 ||
      selections.some((entry) => typeof entry !== 'string' || !isWorkspaceSnapshotRelativePath(entry))
    )
      throw new Error('Invalid ignored-file selection')
  }
  const mappings = request.mappings ?? {}
  if (
    typeof mappings !== 'object' ||
    Array.isArray(mappings) ||
    Object.keys(mappings).some((name) => !names.includes(name))
  )
    throw new Error('Invalid member mapping')
  const target = await resolveWorkspaceSnapshotSource(sourceRootId, signal)
  const members: BranchWorkspaceClonePlan['members'] = []
  for (const member of source.repositories) {
    signal?.throwIfAborted()
    const atRoot = isSourceRoot(member.worktreePath)
    if (
      !atRoot &&
      (!isSafeBranchWorkspaceFolderName(member.repositoryName) ||
        path.posix.resolve(member.worktreePath) !== path.posix.resolve(source.path, member.repositoryName))
    )
      throw new Error('Source member has an unexpected path')
    const snapshot = await inspectWorkspaceSnapshot(
      target,
      {
        rootPath: member.worktreePath,
        repository: true,
        excludeNames: [],
        ignoredPaths: Object.hasOwn(ignoredPaths, member.repositoryName) ? ignoredPaths[member.repositoryName]! : [],
      },
      signal,
    )
    if (!snapshot.repository) throw new Error('Snapshot source did not provide Git metadata')
    validateSnapshotDestinationEntries(snapshot.entries)
    let mapping: BranchWorkspaceClonePlan['members'][number]['mapping']
    const selected = Object.hasOwn(mappings, member.repositoryName) ? mappings[member.repositoryName] : undefined
    if (selected) {
      if (
        typeof selected.repositoryId !== 'string' ||
        isRemoteRepoId(selected.repositoryId) ||
        !path.isAbsolute(selected.repositoryId) ||
        typeof selected.branchName !== 'string'
      )
        throw new Error('Mapped repository must be local to this server')
      const repositoryId = await realpath(selected.repositoryId)
      await snapshotGit(repositoryId, ['check-ref-format', 'refs/heads/' + selected.branchName], signal)
      const format = (await snapshotGit(repositoryId, ['rev-parse', '--show-object-format'], signal))
        .toString('utf8')
        .trim()
      if (format !== snapshot.repository.objectFormat)
        throw new Error('Mapped repository has an incompatible Git object format')
      for (const key of ['core.autocrlf', 'core.eol']) {
        const expected =
          snapshot.repository.config.find((entry) => entry.key === key)?.value ??
          (key === 'core.autocrlf' ? 'false' : 'native')
        const actual = await snapshotGit(repositoryId, ['config', '--get', key], signal)
          .then((value) => value.toString('utf8').trim())
          .catch((error) => {
            signal?.throwIfAborted()
            if (String(error).includes('Git snapshot restore failed'))
              return key === 'core.autocrlf' ? 'false' : 'native'
            throw error
          })
        if (actual !== expected) throw new Error('Mapped repository uses different text conversion settings: ' + key)
      }
      const refs = (
        await snapshotGit(
          repositoryId,
          ['for-each-ref', '--format=%(refname)', 'refs/heads/' + selected.branchName],
          signal,
        )
      )
        .toString('utf8')
        .trim()
      if (refs) throw new Error('Mapped destination branch already exists')
      const common = (
        await snapshotGit(repositoryId, ['rev-parse', '--path-format=absolute', '--git-common-dir'], signal)
      )
        .toString('utf8')
        .trim()
      mapping = { repositoryId, branchName: selected.branchName, commonDirectory: await realpath(common) }
      if (
        members.some(
          (previous) =>
            previous.mapping?.commonDirectory === mapping!.commonDirectory &&
            previous.mapping.branchName === mapping!.branchName,
        )
      )
        throw new Error('Two members cannot create the same mapped branch')
    }
    members.push({
      ...(mapping ? { mapping } : {}),
      repositoryName: member.repositoryName,
      sourcePath: member.worktreePath,
      targetPath: atRoot ? destination : path.join(destination, member.repositoryName),
      snapshot,
    })
  }
  const rootSnapshot = rootRepository
    ? null
    : await inspectWorkspaceSnapshot(
        target,
        { rootPath: source.path, repository: false, excludeNames: names, ignoredPaths: [] },
        signal,
      )
  if (rootSnapshot) validateSnapshotDestinationEntries(rootSnapshot.entries)
  for (const entry of rootSnapshot?.entries ?? []) {
    const top = entry.path.split('/')[0]!
    if (names.some((name) => name.normalize('NFC').toLowerCase() === top.normalize('NFC').toLowerCase()))
      throw new Error('Root file collides with a repository member')
  }
  return {
    token: randomUUID(),
    sourceRootId,
    sourceBranchWorkspaceId: source.id,
    sourcePath: source.path,
    targetRootId,
    parentDirectory,
    directoryName: request.directoryName,
    path: destination,
    branchWorkspaceId: randomUUID(),
    members,
    rootSnapshot,
    ignoredPaths: structuredClone(ignoredPaths),
  }
}
