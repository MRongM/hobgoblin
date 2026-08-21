import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { RepoSnapshot } from '#/shared/rpc.ts'

const mocks = vi.hoisted(() => ({
  checkGitAvailable: vi.fn(),
  checkoutBranch: vi.fn(),
  checkoutTrackingBranch: vi.fn(),
  checkoutRemoteBranch: vi.fn(),
  checkoutRemoteTrackingBranch: vi.fn(),
  cloneGitRepository: vi.fn(),
  commitAllChanges: vi.fn(),
  commitRemoteChanges: vi.fn(),
  createBranch: vi.fn(),
  createLocalFileTreeFile: vi.fn(),
  createRemoteBranch: vi.fn(),
  createRemoteWorktree: vi.fn(),
  createRemoteFileTreeDirectory: vi.fn(),
  createRemoteFileTreeFile: vi.fn(),
  createRemoteFileTreeTextFile: vi.fn(),
  createRemoteTrackingBranch: vi.fn(),
  createTrackingBranch: vi.fn(),
  createWorktree: vi.fn(),
  createLocalFileTreeDirectory: vi.fn(),
  deleteBranch: vi.fn(),
  deleteLocalFileTreeEntries: vi.fn(),
  deleteRemoteBranch: vi.fn(),
  deleteLocalRemoteServerBranch: vi.fn(),
  deleteLocalRemoteServerTag: vi.fn(),
  deleteSshRemoteServerBranch: vi.fn(),
  deleteSshRemoteServerTag: vi.fn(),
  deleteRemoteFileTreeEntries: vi.fn(),
  discardChangesForPaths: vi.fn(),
  discardRemoteChangesForPaths: vi.fn(),
  deleteUpstreamBranch: vi.fn(),
  fsAccess: vi.fn(),
  fsMkdir: vi.fn(),
  fsStat: vi.fn(),
  isGitRepo: vi.fn(),
  getBranches: vi.fn(),
  getCommitDetail: vi.fn(),
  getCommitHistory: vi.fn(),
  getCurrentBranch: vi.fn(),
  getDefaultBranch: vi.fn(),
  getServerSettingsPrefs: vi.fn(),
  openInPreferredTerminal: vi.fn(),
  getRepoName: vi.fn(),
  getRepoRoot: vi.fn(),
  getRemoteInfo: vi.fn(),
  getRemoteSnapshot: vi.fn(),
  getRemoteTags: vi.fn(),
  getLocalRemoteTrackingBranchInfo: vi.fn(),
  getSshRemoteTrackingBranchInfo: vi.fn(),
  getRemoteTrackingBranches: vi.fn(),
  getRemoteWorktrees: vi.fn(),
  getUpstream: vi.fn(),
  getWorktreeCommitMessageContext: vi.fn(),
  getWorktreePatch: vi.fn(),
  getWorktrees: vi.fn(),
  isAncestor: vi.fn(),
  fetchAll: vi.fn(),
  fetchRemote: vi.fn(),
  fetchRemoteRepository: vi.fn(),
  fetchRemoteRepositoryByName: vi.fn(),
  getBackgroundSyncRepos: vi.fn(),
  bootstrapWorktreeSelectionsAfterCreate: vi.fn(),
  bootstrapRemoteWorktreeSelectionsAfterCreate: vi.fn(),
  getRemoteBrowserUrl: vi.fn(),
  getRemoteCommitDetail: vi.fn(),
  getRemoteHistory: vi.fn(),
  mergeBranch: vi.fn(),
  mergeRemoteBranch: vi.fn(),
  moveLocalFileTreeEntries: vi.fn(),
  moveRemoteFileTreeEntries: vi.fn(),
  pullBranch: vi.fn(),
  pullRemoteBranch: vi.fn(),
  pushBranch: vi.fn(),
  pushWorktreeHeadToRemoteBranch: vi.fn(),
  pushRemoteBranch: vi.fn(),
  pushRemoteWorktreeHeadToRemoteBranch: vi.fn(),
  pruneWorktrees: vi.fn(),
  pruneRemoteWorktrees: vi.fn(),
  readLocalFileTreeBinaryFile: vi.fn(),
  readLocalFileTreeTextFile: vi.fn(),
  readRemoteFileTreeBinaryFile: vi.fn(),
  readRemoteFileTreeTextFile: vi.fn(),
  renameLocalFileTreeEntry: vi.fn(),
  renameRemoteFileTreeEntry: vi.fn(),
  replaceLocalFileTreeBinaryFile: vi.fn(),
  replaceLocalFileTreeTextFile: vi.fn(),
  replaceRemoteFileTreeBinaryFile: vi.fn(),
  replaceRemoteFileTreeTextFile: vi.fn(),
  removeWorktree: vi.fn(),
  removeRemoteWorktree: vi.fn(),
  resolveRemoteTarget: vi.fn(),
  runServerCancellable: vi.fn(),
  setBackgroundSyncRepos: vi.fn(),
  publishRepoQueryInvalidation: vi.fn(),
  probeCommitMessageProviders: vi.fn(),
  generateCodexCommitMessageFromContext: vi.fn(),
  generateCommitMessageFromPatch: vi.fn(),
  resetHardToCurrentHead: vi.fn(),
  resetRemoteHard: vi.fn(),
  setBranchUpstream: vi.fn(),
  setRemoteBranchUpstream: vi.fn(),
  assertBranchWorkspaceFileMutationAllowed: vi.fn(),
  testRemoteRepository: vi.fn(),
}))

vi.mock('#/system/git/branches.ts', () => ({
  checkoutBranch: mocks.checkoutBranch,
  checkoutTrackingBranch: mocks.checkoutTrackingBranch,
  createBranch: mocks.createBranch,
  createTrackingBranch: mocks.createTrackingBranch,
  deleteBranch: mocks.deleteBranch,
  deleteRemoteServerBranch: mocks.deleteLocalRemoteServerBranch,
  deleteUpstreamBranch: mocks.deleteUpstreamBranch,
  getBranches: mocks.getBranches,
  getCurrentBranch: mocks.getCurrentBranch,
  getDefaultBranch: mocks.getDefaultBranch,
  getRepoName: mocks.getRepoName,
  getRepoRoot: mocks.getRepoRoot,
  getUpstream: mocks.getUpstream,
  isAncestor: mocks.isAncestor,
  isGitRepo: mocks.isGitRepo,
  setBranchUpstream: mocks.setBranchUpstream,
}))

vi.mock('#/server/modules/branch-workspace-protected-paths.ts', () => ({
  assertBranchWorkspaceFileMutationAllowed: mocks.assertBranchWorkspaceFileMutationAllowed,
}))

vi.mock('#/system/git/helper.ts', () => ({
  checkGitAvailable: mocks.checkGitAvailable,
}))

vi.mock('#/system/git/clone.ts', () => ({
  cloneRepository: mocks.cloneGitRepository,
}))

vi.mock('#/system/git/commit.ts', () => ({
  commitAllChanges: mocks.commitAllChanges,
}))

vi.mock('#/system/git/reset.ts', () => ({
  discardChangesForPaths: mocks.discardChangesForPaths,
  resetHardToCurrentHead: mocks.resetHardToCurrentHead,
}))

vi.mock('#/system/git/history.ts', () => ({
  getCommitDetail: mocks.getCommitDetail,
  getCommitHistory: mocks.getCommitHistory,
}))

vi.mock('#/system/git/patch.ts', () => ({
  getWorktreePatch: mocks.getWorktreePatch,
}))

vi.mock('#/system/git/commit-message-context.ts', () => ({
  getWorktreeCommitMessageContext: mocks.getWorktreeCommitMessageContext,
}))

vi.mock('#/system/commit-message-ai.ts', () => ({
  probeCommitMessageProviders: mocks.probeCommitMessageProviders,
  generateCodexCommitMessageFromContext: mocks.generateCodexCommitMessageFromContext,
  generateCommitMessageFromPatch: mocks.generateCommitMessageFromPatch,
}))

vi.mock('#/system/git/merge.ts', () => ({
  mergeBranch: mocks.mergeBranch,
}))

vi.mock('node:fs', () => ({
  promises: {
    access: mocks.fsAccess,
    mkdir: mocks.fsMkdir,
    stat: mocks.fsStat,
  },
  constants: {
    R_OK: 4,
    W_OK: 2,
  },
}))

vi.mock('#/system/git/remote.ts', () => ({
  fetchAll: mocks.fetchAll,
  fetchRemote: mocks.fetchRemote,
  getRemoteInfo: mocks.getRemoteInfo,
  pullBranch: mocks.pullBranch,
  pushBranch: mocks.pushBranch,
  pushWorktreeHeadToRemoteBranch: mocks.pushWorktreeHeadToRemoteBranch,
}))

vi.mock('#/system/git/remote-refs.ts', () => ({
  deleteRemoteServerTag: mocks.deleteLocalRemoteServerTag,
  getRemoteTags: mocks.getRemoteTags,
  getRemoteTrackingBranchInfo: mocks.getLocalRemoteTrackingBranchInfo,
  getRemoteTrackingBranches: mocks.getRemoteTrackingBranches,
}))

vi.mock('#/system/git/status.ts', () => ({
  getWorkingStatus: vi.fn(),
}))

vi.mock('#/system/git/worktrees.ts', () => ({
  createWorktree: mocks.createWorktree,
  getWorktrees: mocks.getWorktrees,
  pruneWorktrees: mocks.pruneWorktrees,
  removeWorktree: mocks.removeWorktree,
}))

vi.mock('#/system/git/worktree-bootstrap.ts', () => ({
  bootstrapWorktreeSelectionsAfterCreate: mocks.bootstrapWorktreeSelectionsAfterCreate,
}))

vi.mock('#/system/file-tree/local.ts', () => ({
  createLocalFileTreeDirectory: mocks.createLocalFileTreeDirectory,
  createLocalFileTreeFile: mocks.createLocalFileTreeFile,
  deleteLocalFileTreeEntries: mocks.deleteLocalFileTreeEntries,
  moveLocalFileTreeEntries: mocks.moveLocalFileTreeEntries,
  readLocalFileTreeBinaryFile: mocks.readLocalFileTreeBinaryFile,
  readLocalFileTreeTextFile: mocks.readLocalFileTreeTextFile,
  renameLocalFileTreeEntry: mocks.renameLocalFileTreeEntry,
  replaceLocalFileTreeBinaryFile: mocks.replaceLocalFileTreeBinaryFile,
  replaceLocalFileTreeTextFile: mocks.replaceLocalFileTreeTextFile,
}))

vi.mock('#/shared/input-validation.ts', () => ({
  MAX_IPC_PATH_LENGTH: 4096,
  isValidCwd: () => true,
  isValidRepoLocator: () => true,
}))

vi.mock('#/system/ssh/config.ts', () => ({
  resolveRemoteTarget: mocks.resolveRemoteTarget,
}))

vi.mock('#/system/ssh/diagnostics.ts', () => ({
  testRemoteRepository: mocks.testRemoteRepository,
}))

vi.mock('#/system/terminals.ts', () => ({
  openInPreferredTerminal: mocks.openInPreferredTerminal,
}))

vi.mock('#/system/ssh/git.ts', () => ({
  checkoutRemoteBranch: mocks.checkoutRemoteBranch,
  checkoutRemoteTrackingBranch: mocks.checkoutRemoteTrackingBranch,
  commitRemoteChanges: mocks.commitRemoteChanges,
  createRemoteBranch: mocks.createRemoteBranch,
  createRemoteFileTreeDirectory: mocks.createRemoteFileTreeDirectory,
  createRemoteFileTreeFile: mocks.createRemoteFileTreeFile,
  createRemoteFileTreeTextFile: mocks.createRemoteFileTreeTextFile,
  createRemoteTrackingBranch: mocks.createRemoteTrackingBranch,
  createRemoteWorktree: mocks.createRemoteWorktree,
  deleteRemoteBranch: mocks.deleteRemoteBranch,
  deleteRemoteServerBranch: mocks.deleteSshRemoteServerBranch,
  deleteRemoteServerTag: mocks.deleteSshRemoteServerTag,
  deleteRemoteFileTreeEntries: mocks.deleteRemoteFileTreeEntries,
  discardRemoteChangesForPaths: mocks.discardRemoteChangesForPaths,
  fetchRemoteRepository: mocks.fetchRemoteRepository,
  fetchRemoteRepositoryByName: mocks.fetchRemoteRepositoryByName,
  bootstrapRemoteWorktreeSelectionsAfterCreate: mocks.bootstrapRemoteWorktreeSelectionsAfterCreate,
  getRemoteBrowserUrl: mocks.getRemoteBrowserUrl,
  getRemoteCommitDetail: mocks.getRemoteCommitDetail,
  getRemoteHistory: mocks.getRemoteHistory,
  getRemotePatch: vi.fn(),
  getRemoteTags: mocks.getRemoteTags,
  getRemoteTrackingBranchInfo: mocks.getSshRemoteTrackingBranchInfo,
  getRemoteTrackingBranches: mocks.getRemoteTrackingBranches,
  getRemoteWorktrees: mocks.getRemoteWorktrees,
  getRemoteSnapshot: mocks.getRemoteSnapshot,
  getRemoteStatus: vi.fn(),
  pullRemoteBranch: mocks.pullRemoteBranch,
  pushRemoteBranch: mocks.pushRemoteBranch,
  pushRemoteWorktreeHeadToRemoteBranch: mocks.pushRemoteWorktreeHeadToRemoteBranch,
  pruneRemoteWorktrees: mocks.pruneRemoteWorktrees,
  readRemoteFileTreeBinaryFile: mocks.readRemoteFileTreeBinaryFile,
  readRemoteFileTreeTextFile: mocks.readRemoteFileTreeTextFile,
  mergeRemoteBranch: mocks.mergeRemoteBranch,
  moveRemoteFileTreeEntries: mocks.moveRemoteFileTreeEntries,
  renameRemoteFileTreeEntry: mocks.renameRemoteFileTreeEntry,
  replaceRemoteFileTreeBinaryFile: mocks.replaceRemoteFileTreeBinaryFile,
  replaceRemoteFileTreeTextFile: mocks.replaceRemoteFileTreeTextFile,
  removeRemoteWorktree: mocks.removeRemoteWorktree,
  resetRemoteHard: mocks.resetRemoteHard,
  setRemoteBranchUpstream: mocks.setRemoteBranchUpstream,
}))

vi.mock('#/server/common/network-ops.ts', () => ({
  runServerCancellable: mocks.runServerCancellable,
  abortServerNetworkOp: vi.fn(),
}))

vi.mock('#/server/modules/invalidation-broker.ts', () => ({
  publishRepoQueryInvalidation: mocks.publishRepoQueryInvalidation,
}))

vi.mock('#/server/modules/settings-source.ts', () => ({
  getServerSettingsPrefs: mocks.getServerSettingsPrefs,
}))

vi.mock('#/server/modules/background-sync.ts', () => ({
  getBackgroundSyncRepos: mocks.getBackgroundSyncRepos,
  setBackgroundSyncRepos: mocks.setBackgroundSyncRepos,
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.runServerCancellable.mockImplementation(async (_cwd, _kind, task) => await task(new AbortController().signal))
  mocks.assertBranchWorkspaceFileMutationAllowed.mockResolvedValue({ ok: true })
  mocks.checkGitAvailable.mockResolvedValue({ ok: true, message: '' })
  mocks.fsStat.mockResolvedValue({ isDirectory: () => true })
  mocks.fsAccess.mockResolvedValue(undefined)
  mocks.fsMkdir.mockResolvedValue(undefined)
  mocks.isGitRepo.mockResolvedValue(true)
  mocks.checkoutBranch.mockResolvedValue({ ok: true, message: 'ok' })
  mocks.checkoutTrackingBranch.mockResolvedValue({ ok: true, message: 'tracked and switched local' })
  mocks.checkoutRemoteBranch.mockResolvedValue({ ok: true, message: 'ok' })
  mocks.checkoutRemoteTrackingBranch.mockResolvedValue({ ok: true, message: 'tracked and switched remote' })
  mocks.cloneGitRepository.mockResolvedValue({ ok: true, message: 'cloned', path: '/tmp/project' })
  mocks.commitAllChanges.mockResolvedValue({ ok: true, message: 'committed local' })
  mocks.commitRemoteChanges.mockResolvedValue({ ok: true, message: 'committed remote' })
  mocks.createBranch.mockResolvedValue({ ok: true, message: 'created local' })
  mocks.createLocalFileTreeDirectory.mockResolvedValue({ ok: true, message: '' })
  mocks.createLocalFileTreeFile.mockResolvedValue({ ok: true, message: '' })
  mocks.createRemoteFileTreeDirectory.mockResolvedValue({ ok: true, message: '' })
  mocks.createRemoteFileTreeFile.mockResolvedValue({ ok: true, message: '' })
  mocks.createRemoteBranch.mockResolvedValue({ ok: true, message: 'created remote' })
  mocks.createRemoteWorktree.mockResolvedValue({ ok: true, message: 'created remote worktree' })
  mocks.createRemoteTrackingBranch.mockResolvedValue({ ok: true, message: 'tracked remote' })
  mocks.createTrackingBranch.mockResolvedValue({ ok: true, message: 'tracked local' })
  mocks.mergeBranch.mockResolvedValue({ ok: true, message: 'merged local' })
  mocks.mergeRemoteBranch.mockResolvedValue({ ok: true, message: 'merged remote' })
  mocks.moveLocalFileTreeEntries.mockResolvedValue({ ok: true, message: '' })
  mocks.moveRemoteFileTreeEntries.mockResolvedValue({ ok: true, message: '' })
  mocks.pullBranch.mockResolvedValue({ ok: true, message: 'ok' })
  mocks.pullRemoteBranch.mockResolvedValue({ ok: true, message: 'ok' })
  mocks.pushBranch.mockResolvedValue({ ok: true, message: 'ok' })
  mocks.pushWorktreeHeadToRemoteBranch.mockResolvedValue({ ok: true, message: 'pushed exact local remote branch' })
  mocks.pushRemoteBranch.mockResolvedValue({ ok: true, message: 'ok' })
  mocks.pushRemoteWorktreeHeadToRemoteBranch.mockResolvedValue({
    ok: true,
    message: 'pushed exact ssh remote branch',
  })
  mocks.pruneWorktrees.mockResolvedValue({ ok: true, message: 'pruned local' })
  mocks.pruneRemoteWorktrees.mockResolvedValue({ ok: true, message: 'pruned remote' })
  mocks.readLocalFileTreeBinaryFile.mockResolvedValue({
    ok: true,
    name: 'image.bin',
    byteLength: 3,
    bytesBase64: 'AQID',
  })
  mocks.readLocalFileTreeTextFile.mockResolvedValue({ ok: true, content: 'hello\n', byteLength: 6 })
  mocks.readRemoteFileTreeBinaryFile.mockResolvedValue({
    ok: true,
    name: 'image.bin',
    byteLength: 3,
    bytesBase64: 'AQID',
  })
  mocks.readRemoteFileTreeTextFile.mockResolvedValue({ ok: true, content: 'remote\n', byteLength: 7 })
  mocks.fetchRemoteRepository.mockResolvedValue({ ok: true, message: 'ok' })
  mocks.fetchRemote.mockResolvedValue({ ok: true, message: 'fetched exact remote' })
  mocks.fetchRemoteRepositoryByName.mockResolvedValue({ ok: true, message: 'fetched exact remote' })
  mocks.getLocalRemoteTrackingBranchInfo.mockResolvedValue([])
  mocks.getSshRemoteTrackingBranchInfo.mockResolvedValue([])
  mocks.createWorktree.mockResolvedValue({ ok: true, message: 'ok' })
  mocks.deleteRemoteBranch.mockResolvedValue({ ok: true, message: 'ok' })
  mocks.deleteLocalRemoteServerBranch.mockResolvedValue({ ok: true, message: 'deleted local remote' })
  mocks.deleteLocalRemoteServerTag.mockResolvedValue({ ok: true, message: 'deleted local remote tag' })
  mocks.deleteSshRemoteServerBranch.mockResolvedValue({ ok: true, message: 'deleted ssh remote' })
  mocks.deleteSshRemoteServerTag.mockResolvedValue({ ok: true, message: 'deleted ssh remote tag' })
  mocks.deleteBranch.mockResolvedValue({ ok: true, message: 'ok' })
  mocks.deleteLocalFileTreeEntries.mockResolvedValue({ ok: true, message: '' })
  mocks.deleteRemoteFileTreeEntries.mockResolvedValue({ ok: true, message: '' })
  mocks.deleteUpstreamBranch.mockResolvedValue({ ok: true, message: 'ok' })
  mocks.renameLocalFileTreeEntry.mockResolvedValue({ ok: true, message: '' })
  mocks.renameRemoteFileTreeEntry.mockResolvedValue({ ok: true, message: '' })
  mocks.replaceLocalFileTreeBinaryFile.mockResolvedValue({
    ok: true,
    previousBytesBase64: 'CQg=',
    previousByteLength: 2,
  })
  mocks.replaceLocalFileTreeTextFile.mockResolvedValue({ ok: true, previousContent: 'old\n', previousByteLength: 4 })
  mocks.replaceRemoteFileTreeBinaryFile.mockResolvedValue({
    ok: true,
    previousBytesBase64: 'CQg=',
    previousByteLength: 2,
  })
  mocks.replaceRemoteFileTreeTextFile.mockResolvedValue({
    ok: true,
    previousContent: 'remote old\n',
    previousByteLength: 11,
  })
  mocks.removeWorktree.mockResolvedValue({ ok: true, message: 'ok' })
  mocks.removeRemoteWorktree.mockResolvedValue({ ok: true, message: 'ok' })
  mocks.resetHardToCurrentHead.mockResolvedValue({ ok: true, message: 'reset local' })
  mocks.resetRemoteHard.mockResolvedValue({ ok: true, message: 'reset remote' })
  mocks.setBranchUpstream.mockResolvedValue({ ok: true, message: 'updated local upstream' })
  mocks.setRemoteBranchUpstream.mockResolvedValue({ ok: true, message: 'updated remote upstream' })
  mocks.discardChangesForPaths.mockResolvedValue({ ok: true, message: '' })
  mocks.discardRemoteChangesForPaths.mockResolvedValue({ ok: true, message: '' })
  mocks.getRemoteBrowserUrl.mockResolvedValue(null)
  mocks.bootstrapWorktreeSelectionsAfterCreate.mockResolvedValue({ ok: true, message: '' })
  mocks.bootstrapRemoteWorktreeSelectionsAfterCreate.mockResolvedValue({ ok: true, message: '' })
  mocks.getCommitHistory.mockResolvedValue([
    {
      hash: 'abc123456789',
      shortHash: 'abc1234',
      subject: 'feat: local',
      author: 'Alice',
      date: '2026-06-15T09:00:00+08:00',
      parents: [],
    },
  ])
  mocks.getCommitDetail.mockResolvedValue({
    hash: 'abc123456789',
    shortHash: 'abc1234',
    subject: 'feat: local',
    author: 'Alice',
    date: '2026-06-15T09:00:00+08:00',
    parents: [],
    files: [],
  })
  mocks.getRemoteHistory.mockResolvedValue([
    {
      hash: 'def123456789',
      shortHash: 'def1234',
      subject: 'feat: remote',
      author: 'Bob',
      date: '2026-06-15T09:00:00+08:00',
      parents: [],
    },
  ])
  mocks.getRemoteCommitDetail.mockResolvedValue({
    hash: 'def123456789',
    shortHash: 'def1234',
    subject: 'feat: remote',
    author: 'Bob',
    date: '2026-06-15T09:00:00+08:00',
    parents: [],
    files: [],
  })
  mocks.getRemoteSnapshot.mockResolvedValue(repoSnapshot('main'))
  mocks.testRemoteRepository.mockResolvedValue({
    target: {
      id: 'ssh-config://prod/srv/repo',
      alias: 'prod',
      host: 'example.com',
      user: 'alice',
      port: 22,
      remotePath: '/srv/repo',
      displayName: 'prod:repo',
    },
    ok: true,
    stages: [],
  })
  mocks.resolveRemoteTarget.mockResolvedValue({
    target: {
      id: 'ssh-config://prod/srv/repo',
      alias: 'prod',
      host: 'example.com',
      user: 'alice',
      port: 22,
      remotePath: '/srv/repo',
      displayName: 'prod:repo',
    },
  })
  mocks.getCurrentBranch.mockResolvedValue('main')
  mocks.getServerSettingsPrefs.mockResolvedValue({
    gitNetworkProxyEnabled: true,
    gitNetworkProxyUrl: 'socks5://127.0.0.1:7890',
    gitNetworkTimeoutSec: 240,
    terminalApp: 'auto',
    editorApp: 'auto',
  })
  mocks.openInPreferredTerminal.mockResolvedValue({ ok: true, message: '/tmp/repo-worktree' })
  mocks.getRepoName.mockResolvedValue('repo')
  mocks.getRepoRoot.mockResolvedValue('/tmp/repo')
  mocks.getWorktrees.mockResolvedValue([])
  mocks.getRemoteWorktrees.mockResolvedValue([])
  mocks.getWorktreeCommitMessageContext.mockResolvedValue({
    status: ['M  src/app.ts'],
    stat: ' src/app.ts | 2 +-',
    diff: 'diff --git a/src/app.ts b/src/app.ts\n+new',
    untracked: '',
    omitted: [],
    truncated: false,
  })
  mocks.getWorktreePatch.mockResolvedValue('diff --git a/a b/a\n+hello\n')
  mocks.getRemoteTrackingBranches.mockResolvedValue([])
  mocks.getRemoteTags.mockResolvedValue([])
  mocks.getDefaultBranch.mockResolvedValue('main')
  mocks.getUpstream.mockResolvedValue(null)
  mocks.isAncestor.mockResolvedValue(true)
  mocks.probeCommitMessageProviders.mockResolvedValue({ codex: true, claude: false })
  mocks.generateCodexCommitMessageFromContext.mockResolvedValue({ ok: true, message: 'feat: generated codex message' })
  mocks.generateCommitMessageFromPatch.mockResolvedValue({ ok: true, message: 'feat: generated message' })
})

afterEach(() => {
  vi.resetModules()
})

function repoSnapshot(branch = 'main'): RepoSnapshot {
  return {
    branches: [
      {
        name: branch,
        isCurrent: true,
        ahead: 0,
        behind: 0,
        lastCommitHash: 'hash-0',
        lastCommitMessage: 'commit 0',
        lastCommitDate: '2024-01-01T00:00:00.000Z',
        lastCommitAuthor: 'dev',
      },
    ],
    current: branch,
  }
}

describe('getRepositorySnapshot', () => {
  test('reads git state directly without publishing invalidation', async () => {
    mocks.getWorktrees.mockResolvedValueOnce([{ path: '/tmp/repo', branch: 'fresh', isBare: false, isPrimary: true }])
    const snapshot = repoSnapshot('fresh')
    mocks.getBranches.mockResolvedValueOnce(snapshot.branches)
    mocks.getCurrentBranch.mockResolvedValueOnce(snapshot.current)
    mocks.getRemoteInfo.mockResolvedValueOnce(snapshot.remote)

    const { getRepositorySnapshot } = await import('#/server/modules/repo-read-paths.ts')
    const result = await getRepositorySnapshot('/tmp/repo')

    expect(result).toEqual(snapshot)
    expect(mocks.getWorktrees).toHaveBeenCalledWith('/tmp/repo', { signal: undefined, throwOnError: true })
    expect(mocks.publishRepoQueryInvalidation).not.toHaveBeenCalled()
  })

  test('skips worktree status and remote metadata for a lightweight snapshot', async () => {
    mocks.getWorktrees.mockResolvedValueOnce([{ path: '/tmp/repo', branch: 'main', isBare: false, isPrimary: true }])
    const snapshot = repoSnapshot('main')
    mocks.getBranches.mockResolvedValueOnce(snapshot.branches)
    mocks.getCurrentBranch.mockResolvedValueOnce(snapshot.current)

    const { getRepositorySnapshot } = await import('#/server/modules/repo-read-paths.ts')
    const result = await getRepositorySnapshot('/tmp/repo', undefined, {
      includeWorktreeStatus: false,
      includeRemote: false,
    })

    expect(result).toEqual(snapshot)
    expect(mocks.getWorktrees).toHaveBeenCalledWith('/tmp/repo', {
      includeStatus: false,
      signal: undefined,
      throwOnError: true,
    })
    expect(mocks.getRemoteInfo).not.toHaveBeenCalled()
  })

  test('fails local git snapshots when the authoritative worktree list is empty', async () => {
    mocks.getWorktrees.mockResolvedValueOnce([])

    const { getRepositorySnapshot } = await import('#/server/modules/repo-read-paths.ts')

    await expect(getRepositorySnapshot('/tmp/repo')).rejects.toThrow('error.failed-read-repo')
    expect(mocks.getBranches).not.toHaveBeenCalled()
    expect(mocks.publishRepoQueryInvalidation).not.toHaveBeenCalled()
  })
})

describe('repository history read paths', () => {
  test('getRepositoryHistory delegates to local backend history reads', async () => {
    const { getRepositoryHistory } = await import('#/server/modules/repo-read-paths.ts')

    await expect(getRepositoryHistory('/tmp/repo', 'feature/history', { limit: 100, skip: 0 })).resolves.toEqual([
      {
        hash: 'abc123456789',
        shortHash: 'abc1234',
        subject: 'feat: local',
        author: 'Alice',
        date: '2026-06-15T09:00:00+08:00',
        parents: [],
      },
    ])
    expect(mocks.getCommitHistory).toHaveBeenCalledWith(
      '/tmp/repo',
      'feature/history',
      { limit: 100, skip: 0 },
      { signal: undefined },
    )
  })

  test('getRepositoryCommitDetail delegates to remote backend detail reads', async () => {
    const { getRepositoryCommitDetail } = await import('#/server/modules/repo-read-paths.ts')

    await expect(getRepositoryCommitDetail('ssh-config://prod/srv/repo', 'def1234')).resolves.toEqual({
      hash: 'def123456789',
      shortHash: 'def1234',
      subject: 'feat: remote',
      author: 'Bob',
      date: '2026-06-15T09:00:00+08:00',
      parents: [],
      files: [],
    })
    expect(mocks.getRemoteCommitDetail).toHaveBeenCalledWith(
      expect.objectContaining({ alias: 'prod', remotePath: '/srv/repo' }),
      'def1234',
      { signal: undefined },
    )
  })
})

describe('commit message AI read paths', () => {
  test('probes commit message provider availability without publishing invalidation', async () => {
    mocks.probeCommitMessageProviders.mockResolvedValueOnce({ codex: true, claude: true })
    const { getCommitMessageProviders } = await import('#/server/modules/repo-read-paths.ts')

    await expect(getCommitMessageProviders()).resolves.toEqual({ codex: true, claude: true })
    expect(mocks.probeCommitMessageProviders).toHaveBeenCalledWith(undefined)
    expect(mocks.publishRepoQueryInvalidation).not.toHaveBeenCalled()
  })

  test('generates local Codex commit messages from lightweight context', async () => {
    mocks.getWorktrees.mockResolvedValueOnce([
      { path: '/tmp/repo', branch: 'main', isBare: false, isPrimary: true, isDirty: true, changeCount: 1 },
    ])

    const { generateRepositoryCommitMessage } = await import('#/server/modules/repo-read-paths.ts')
    await expect(generateRepositoryCommitMessage('/tmp/repo', '/tmp/repo', 'codex')).resolves.toEqual({
      ok: true,
      message: 'feat: generated codex message',
    })

    expect(mocks.getWorktrees).toHaveBeenCalledWith('/tmp/repo', { includeStatus: false, signal: undefined })
    expect(mocks.getWorktreeCommitMessageContext).toHaveBeenCalledWith('/tmp/repo', { signal: undefined })
    expect(mocks.generateCodexCommitMessageFromContext).toHaveBeenCalledWith(
      {
        status: ['M  src/app.ts'],
        stat: ' src/app.ts | 2 +-',
        diff: 'diff --git a/src/app.ts b/src/app.ts\n+new',
        untracked: '',
        omitted: [],
        truncated: false,
      },
      { cwd: '/tmp/repo', signal: undefined },
    )
    expect(mocks.getWorktreePatch).not.toHaveBeenCalled()
    expect(mocks.generateCommitMessageFromPatch).not.toHaveBeenCalled()
    expect(mocks.publishRepoQueryInvalidation).not.toHaveBeenCalled()
  })

  test('keeps Claude commit-message generation on the existing patch path', async () => {
    mocks.getWorktrees.mockResolvedValueOnce([
      { path: '/tmp/repo', branch: 'main', isBare: false, isPrimary: true, isDirty: true, changeCount: 1 },
    ])
    mocks.getWorktreePatch.mockResolvedValueOnce('diff --git a/a b/a\n+hello\n')
    mocks.generateCommitMessageFromPatch.mockResolvedValueOnce({ ok: true, message: 'feat: generated claude message' })

    const { generateRepositoryCommitMessage } = await import('#/server/modules/repo-read-paths.ts')
    await expect(generateRepositoryCommitMessage('/tmp/repo', '/tmp/repo', 'claude')).resolves.toEqual({
      ok: true,
      message: 'feat: generated claude message',
    })

    expect(mocks.getWorktreePatch).toHaveBeenCalledWith('/tmp/repo', { signal: undefined })
    expect(mocks.generateCommitMessageFromPatch).toHaveBeenCalledWith('claude', 'diff --git a/a b/a\n+hello\n', {
      cwd: '/tmp/repo',
      signal: undefined,
    })
    expect(mocks.getWorktreeCommitMessageContext).not.toHaveBeenCalled()
    expect(mocks.generateCodexCommitMessageFromContext).not.toHaveBeenCalled()
  })

  test('rejects unknown commit message providers before reading the patch', async () => {
    const { generateRepositoryCommitMessage } = await import('#/server/modules/repo-read-paths.ts')

    await expect(generateRepositoryCommitMessage('/tmp/repo', '/tmp/repo', 'unknown')).resolves.toEqual({
      ok: false,
      message: 'error.commit-message-provider-unavailable',
    })

    expect(mocks.getWorktreePatch).not.toHaveBeenCalled()
    expect(mocks.generateCommitMessageFromPatch).not.toHaveBeenCalled()
    expect(mocks.getWorktreeCommitMessageContext).not.toHaveBeenCalled()
    expect(mocks.generateCodexCommitMessageFromContext).not.toHaveBeenCalled()
  })
})

describe('fetchRepository invalidation publishing', () => {
  test.each([
    ['user', 'user'],
    ['background', 'background'],
  ])('%s sync fetches prune stale remote-tracking refs', async (_name, kind) => {
    mocks.runServerCancellable.mockImplementationOnce(
      async (_cwd, _kind, task) => await task(new AbortController().signal),
    )
    mocks.fetchAll.mockResolvedValueOnce({ ok: true, message: 'fetched' })

    const { fetchRepository } = await import('#/server/modules/repo-write-paths.ts')
    const result = await fetchRepository('/tmp/repo', kind as 'user' | 'background')

    expect(result).toEqual({ ok: true, message: 'fetched' })
    expect(mocks.fetchAll).toHaveBeenCalledWith('/tmp/repo', expect.any(AbortSignal), {
      timeoutMs: 240_000,
      proxyUrl: 'socks5://127.0.0.1:7890',
    })
  })

  test('publishes snapshot invalidation after a successful sync', async () => {
    mocks.runServerCancellable.mockResolvedValueOnce({ ok: true, message: 'fetched' })

    const { fetchRepository } = await import('#/server/modules/repo-write-paths.ts')
    const result = await fetchRepository('/tmp/repo', 'user')

    expect(result).toEqual({ ok: true, message: 'fetched' })
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenNthCalledWith(1, {
      repoId: '/tmp/repo',
      query: 'repo-snapshot',
    })
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledTimes(1)
  })

  test('user sync waits for and reuses an active background sync result without duplicating invalidation', async () => {
    let resolveFetch!: (value: { ok: true; message: string }) => void
    mocks.runServerCancellable.mockImplementation(async (_cwd, _kind, task) => await task(new AbortController().signal))
    mocks.fetchAll.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve
        }),
    )

    const { fetchRepository } = await import('#/server/modules/repo-write-paths.ts')
    const background = fetchRepository('/tmp/repo', 'background')
    await vi.waitFor(() => {
      expect(mocks.fetchAll).toHaveBeenCalledTimes(1)
    })
    const user = fetchRepository('/tmp/repo', 'user')

    resolveFetch({ ok: true, message: 'fetched in background' })
    const [backgroundResult, userResult] = await Promise.all([background, user])

    expect(backgroundResult).toEqual({ ok: true, message: 'fetched in background' })
    expect(userResult).toEqual({ ok: true, message: 'fetched in background' })
    expect(mocks.runServerCancellable).toHaveBeenCalledTimes(1)
    expect(mocks.fetchAll).toHaveBeenCalledTimes(1)
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledTimes(1)
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: '/tmp/repo',
      query: 'repo-snapshot',
    })
  })

  test('does not publish invalidations after a failed sync', async () => {
    mocks.runServerCancellable.mockResolvedValueOnce({ ok: false, message: 'fatal: offline' })

    const { fetchRepository } = await import('#/server/modules/repo-write-paths.ts')
    const result = await fetchRepository('/tmp/repo', 'background')

    expect(result).toEqual({ ok: false, message: 'fatal: offline' })
    expect(mocks.publishRepoQueryInvalidation).not.toHaveBeenCalled()
  })
})

describe('git network settings for local repository network operations', () => {
  test('fetchRepository passes configured network options to local fetch', async () => {
    mocks.fetchAll.mockResolvedValueOnce({ ok: true, message: 'fetched' })
    const { fetchRepository } = await import('#/server/modules/repo-write-paths.ts')

    await expect(fetchRepository('/tmp/repo', 'user')).resolves.toEqual({ ok: true, message: 'fetched' })

    expect(mocks.fetchAll).toHaveBeenCalledWith('/tmp/repo', expect.any(AbortSignal), {
      timeoutMs: 240_000,
      proxyUrl: 'socks5://127.0.0.1:7890',
    })
  })

  test('pullRepositoryBranch passes configured network options to local pull', async () => {
    const { pullRepositoryBranch } = await import('#/server/modules/repo-write-paths.ts')

    await expect(pullRepositoryBranch('/tmp/repo', 'feature/a')).resolves.toEqual({ ok: true, message: 'ok' })

    expect(mocks.pullBranch).toHaveBeenCalledWith('/tmp/repo', 'feature/a', undefined, expect.any(AbortSignal), {
      timeoutMs: 240_000,
      proxyUrl: 'socks5://127.0.0.1:7890',
    })
  })

  test('pushRepositoryBranch passes configured network options to local push', async () => {
    const { pushRepositoryBranch } = await import('#/server/modules/repo-write-paths.ts')

    await expect(pushRepositoryBranch('/tmp/repo', 'feature/a')).resolves.toEqual({ ok: true, message: 'ok' })

    expect(mocks.pushBranch).toHaveBeenCalledWith('/tmp/repo', 'feature/a', expect.any(AbortSignal), {
      timeoutMs: 240_000,
      proxyUrl: 'socks5://127.0.0.1:7890',
    })
  })

  test('fetchRepositoryRemote fetches the exact local remote with configured network options', async () => {
    const { fetchRepositoryRemote } = await import('#/server/modules/repo-write-paths.ts')

    await expect(fetchRepositoryRemote('/tmp/repo', 'upstream')).resolves.toEqual({
      ok: true,
      message: 'fetched exact remote',
    })

    expect(mocks.fetchRemote).toHaveBeenCalledWith('/tmp/repo', 'upstream', expect.any(AbortSignal), {
      timeoutMs: 240_000,
      proxyUrl: 'socks5://127.0.0.1:7890',
    })
  })

  test('pushRepositoryWorktreeHeadToRemoteBranch pushes exact local remote ref with configured network options', async () => {
    const { pushRepositoryWorktreeHeadToRemoteBranch } = await import('#/server/modules/repo-write-paths.ts')

    await expect(
      pushRepositoryWorktreeHeadToRemoteBranch('/tmp/repo', '/tmp/hobgoblin-merge-out', 'origin/release/v2'),
    ).resolves.toEqual({ ok: true, message: 'pushed exact local remote branch' })

    expect(mocks.pushWorktreeHeadToRemoteBranch).toHaveBeenCalledWith(
      '/tmp/hobgoblin-merge-out',
      'origin',
      'release/v2',
      expect.any(AbortSignal),
      { timeoutMs: 240_000, proxyUrl: 'socks5://127.0.0.1:7890' },
    )
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: '/tmp/repo',
      query: 'repo-snapshot',
    })
  })

  test('pushRepositoryWorktreeHeadToRemoteBranch rejects malformed remote refs before dispatch', async () => {
    const { pushRepositoryWorktreeHeadToRemoteBranch } = await import('#/server/modules/repo-write-paths.ts')

    await expect(
      pushRepositoryWorktreeHeadToRemoteBranch('/tmp/repo', '/tmp/hobgoblin-merge-out', 'origin/HEAD'),
    ).resolves.toEqual({ ok: false, message: 'error.invalid-arguments' })

    expect(mocks.pushWorktreeHeadToRemoteBranch).not.toHaveBeenCalled()
    expect(mocks.pushRemoteWorktreeHeadToRemoteBranch).not.toHaveBeenCalled()
  })

  test('deleteRepositoryRemoteBranch passes configured network options to local push delete', async () => {
    const { deleteRepositoryRemoteBranch } = await import('#/server/modules/repo-write-paths.ts')

    await expect(deleteRepositoryRemoteBranch('/tmp/repo', 'origin', 'feature/remove-me')).resolves.toEqual({
      ok: true,
      message: 'deleted local remote',
    })

    expect(mocks.deleteLocalRemoteServerBranch).toHaveBeenCalledWith(
      '/tmp/repo',
      'origin',
      'feature/remove-me',
      expect.any(AbortSignal),
      { timeoutMs: 240_000, proxyUrl: 'socks5://127.0.0.1:7890' },
    )
  })

  test('deleteRepositoryRemoteTag passes configured network options to local push delete', async () => {
    const { deleteRepositoryRemoteTag } = await import('#/server/modules/repo-write-paths.ts')

    await expect(deleteRepositoryRemoteTag('/tmp/repo', 'origin', 'release/v1.0.0')).resolves.toEqual({
      ok: true,
      message: 'deleted local remote tag',
    })

    expect(mocks.deleteLocalRemoteServerTag).toHaveBeenCalledWith(
      '/tmp/repo',
      'origin',
      'release/v1.0.0',
      expect.any(AbortSignal),
      { timeoutMs: 240_000, proxyUrl: 'socks5://127.0.0.1:7890' },
    )
  })

  test('deleteRepositoryRemoteBranch publishes snapshot invalidation after success', async () => {
    const { deleteRepositoryRemoteBranch } = await import('#/server/modules/repo-write-paths.ts')

    await expect(deleteRepositoryRemoteBranch('/tmp/repo', 'origin', 'feature/remove-me')).resolves.toEqual({
      ok: true,
      message: 'deleted local remote',
    })

    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: '/tmp/repo',
      query: 'repo-snapshot',
    })
  })

  test('deleteRepositoryRemoteTag publishes snapshot invalidation after success', async () => {
    const { deleteRepositoryRemoteTag } = await import('#/server/modules/repo-write-paths.ts')

    await expect(deleteRepositoryRemoteTag('/tmp/repo', 'origin', 'release/v1.0.0')).resolves.toEqual({
      ok: true,
      message: 'deleted local remote tag',
    })

    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: '/tmp/repo',
      query: 'repo-snapshot',
    })
  })

  test('deleteRepositoryRemoteBranch rejects protected refs before backend dispatch', async () => {
    const { deleteRepositoryRemoteBranch } = await import('#/server/modules/repo-write-paths.ts')

    await expect(deleteRepositoryRemoteBranch('/tmp/repo', 'origin', 'main')).resolves.toEqual({
      ok: false,
      message: 'error.invalid-arguments',
    })

    expect(mocks.deleteLocalRemoteServerBranch).not.toHaveBeenCalled()
    expect(mocks.deleteSshRemoteServerBranch).not.toHaveBeenCalled()
  })

  test('deleteRepositoryRemoteTag rejects invalid refs before backend dispatch', async () => {
    const { deleteRepositoryRemoteTag } = await import('#/server/modules/repo-write-paths.ts')

    await expect(deleteRepositoryRemoteTag('/tmp/repo', 'origin', '-bad')).resolves.toEqual({
      ok: false,
      message: 'error.invalid-arguments',
    })

    expect(mocks.deleteLocalRemoteServerTag).not.toHaveBeenCalled()
    expect(mocks.deleteSshRemoteServerTag).not.toHaveBeenCalled()
  })

  test('cloneRepository passes configured network options to local clone', async () => {
    const { cloneRepository } = await import('#/server/modules/repo-write-paths.ts')

    await expect(
      cloneRepository('clone-1', 'https://example.com/acme/project.git', '/tmp', 'project'),
    ).resolves.toEqual({ ok: true, message: 'cloned', path: '/tmp/project' })

    expect(mocks.cloneGitRepository).toHaveBeenCalledWith(
      '/tmp',
      'project',
      'https://example.com/acme/project.git',
      expect.any(AbortSignal),
      { timeoutMs: 240_000, proxyUrl: 'socks5://127.0.0.1:7890' },
    )
  })
})

describe('git network settings for SSH repository network operations', () => {
  test('remote fetch does not pass local git network options into SSH helper', async () => {
    const { fetchRepository } = await import('#/server/modules/repo-write-paths.ts')

    await expect(fetchRepository('ssh-config://prod/srv/repo', 'user')).resolves.toEqual({ ok: true, message: 'ok' })

    expect(mocks.fetchRemoteRepository).toHaveBeenCalledWith(
      expect.objectContaining({ alias: 'prod', remotePath: '/srv/repo' }),
      { signal: expect.any(AbortSignal) },
    )
  })

  test('fetchRepositoryRemote fetches the exact SSH-side Git remote', async () => {
    const { fetchRepositoryRemote } = await import('#/server/modules/repo-write-paths.ts')

    await expect(fetchRepositoryRemote('ssh-config://prod/srv/repo', 'upstream')).resolves.toEqual({
      ok: true,
      message: 'fetched exact remote',
    })

    expect(mocks.fetchRemoteRepositoryByName).toHaveBeenCalledWith(
      expect.objectContaining({ alias: 'prod', remotePath: '/srv/repo' }),
      'upstream',
      { signal: expect.any(AbortSignal) },
    )
  })

  test('pushRepositoryWorktreeHeadToRemoteBranch dispatches exact SSH-side push without local network options', async () => {
    const { pushRepositoryWorktreeHeadToRemoteBranch } = await import('#/server/modules/repo-write-paths.ts')

    await expect(
      pushRepositoryWorktreeHeadToRemoteBranch(
        'ssh-config://prod/srv/repo',
        '/srv/hobgoblin-merge-out',
        'origin/release/v2',
      ),
    ).resolves.toEqual({ ok: true, message: 'pushed exact ssh remote branch' })

    expect(mocks.pushRemoteWorktreeHeadToRemoteBranch).toHaveBeenCalledWith(
      expect.objectContaining({ alias: 'prod', remotePath: '/srv/repo' }),
      '/srv/hobgoblin-merge-out',
      'origin',
      'release/v2',
      { signal: expect.any(AbortSignal) },
    )
  })

  test('deleteRepositoryRemoteBranch dispatches SSH repos without local network options', async () => {
    const { deleteRepositoryRemoteBranch } = await import('#/server/modules/repo-write-paths.ts')

    await expect(
      deleteRepositoryRemoteBranch('ssh-config://prod/srv/repo', 'origin', 'feature/remove-me'),
    ).resolves.toEqual({
      ok: true,
      message: 'deleted ssh remote',
    })

    expect(mocks.deleteSshRemoteServerBranch).toHaveBeenCalledWith(
      expect.objectContaining({ alias: 'prod', remotePath: '/srv/repo' }),
      { remote: 'origin', branch: 'feature/remove-me', signal: expect.any(AbortSignal) },
    )
  })

  test('deleteRepositoryRemoteTag dispatches SSH repos without local network options', async () => {
    const { deleteRepositoryRemoteTag } = await import('#/server/modules/repo-write-paths.ts')

    await expect(deleteRepositoryRemoteTag('ssh-config://prod/srv/repo', 'origin', 'release/v1.0.0')).resolves.toEqual({
      ok: true,
      message: 'deleted ssh remote tag',
    })

    expect(mocks.deleteSshRemoteServerTag).toHaveBeenCalledWith(
      expect.objectContaining({ alias: 'prod', remotePath: '/srv/repo' }),
      { remote: 'origin', tag: 'release/v1.0.0', signal: expect.any(AbortSignal) },
    )
  })
})

describe('probeRepository path errors', () => {
  test('reports missing paths specifically', async () => {
    mocks.fsStat.mockRejectedValueOnce({ code: 'ENOENT' })

    const { probeRepository } = await import('#/server/modules/repo-read-paths.ts')
    await expect(probeRepository('/tmp/missing')).resolves.toEqual({ ok: false, message: 'error.path-not-found' })
  })

  test('reports non-directory paths specifically', async () => {
    mocks.fsStat.mockResolvedValueOnce({ isDirectory: () => false })

    const { probeRepository } = await import('#/server/modules/repo-read-paths.ts')
    await expect(probeRepository('/tmp/file')).resolves.toEqual({ ok: false, message: 'error.path-not-directory' })
  })

  test('reports permission-denied paths specifically', async () => {
    mocks.fsAccess.mockRejectedValueOnce({ code: 'EACCES' })

    const { probeRepository } = await import('#/server/modules/repo-read-paths.ts')
    await expect(probeRepository('/tmp/private')).resolves.toEqual({
      ok: false,
      message: 'error.path-permission-denied',
    })
  })

  test('returns ok with isGitRepo:false for readable non-git directory', async () => {
    mocks.fsStat.mockResolvedValueOnce({ isDirectory: () => true })
    mocks.fsAccess.mockResolvedValueOnce(undefined)
    mocks.isGitRepo.mockResolvedValueOnce(false)

    const { probeRepository } = await import('#/server/modules/repo-read-paths.ts')
    await expect(probeRepository('/tmp/notgit')).resolves.toEqual({
      ok: true,
      root: '/tmp/notgit',
      name: 'notgit',
      isGitRepo: false,
    })
  })

  test('keeps a readable nested directory as a plain workspace when it is not the git root', async () => {
    mocks.fsStat.mockResolvedValueOnce({ isDirectory: () => true })
    mocks.fsAccess.mockResolvedValueOnce(undefined)
    mocks.isGitRepo.mockResolvedValueOnce(true)
    mocks.getRepoRoot.mockResolvedValueOnce('/tmp/parent')

    const { probeRepository } = await import('#/server/modules/repo-read-paths.ts')
    await expect(probeRepository('/tmp/parent/plain-project')).resolves.toEqual({
      ok: true,
      root: '/tmp/parent/plain-project',
      name: 'plain-project',
      isGitRepo: false,
    })
  })

  test('falls back to a plain workspace when git is unavailable', async () => {
    mocks.fsStat.mockResolvedValueOnce({ isDirectory: () => true })
    mocks.fsAccess.mockResolvedValueOnce(undefined)
    mocks.checkGitAvailable.mockResolvedValueOnce({ ok: false, message: 'error.git-not-found' })

    const { probeRepository } = await import('#/server/modules/repo-read-paths.ts')
    await expect(probeRepository('/tmp/plain')).resolves.toEqual({
      ok: true,
      root: '/tmp/plain',
      name: 'plain',
      isGitRepo: false,
    })
  })

  test('returns ok with isGitRepo:true for git repositories', async () => {
    mocks.getRepoRoot.mockResolvedValueOnce('/tmp/repo-root')
    mocks.getRepoName.mockResolvedValueOnce('repo-root')

    const { probeRepository } = await import('#/server/modules/repo-read-paths.ts')
    await expect(probeRepository('/tmp/repo')).resolves.toEqual({
      ok: true,
      root: '/tmp/repo-root',
      name: 'repo-root',
      isGitRepo: true,
    })
  })

  test('returns ok with isGitRepo:false for readable remote non-git directories', async () => {
    mocks.getRemoteSnapshot.mockResolvedValueOnce(null)

    const { probeRepository } = await import('#/server/modules/repo-read-paths.ts')
    await expect(probeRepository('ssh-config://prod/srv/repo')).resolves.toEqual({
      ok: true,
      root: 'ssh-config://prod/srv/repo',
      name: 'prod:repo',
      isGitRepo: false,
    })
    expect(mocks.testRemoteRepository).toHaveBeenCalledWith(
      expect.objectContaining({ alias: 'prod', remotePath: '/srv/repo' }),
    )
    expect(mocks.getRemoteSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ alias: 'prod', remotePath: '/srv/repo' }),
    )
  })
})

describe('repo mutation invalidation publishing', () => {
  test('createRepositoryWorktree pulls an eligible local creation source before creating', async () => {
    const order: string[] = []
    mocks.getWorktrees.mockResolvedValueOnce([{ path: '/tmp/repo', branch: 'main', isBare: false, isPrimary: true }])
    mocks.getBranches.mockResolvedValueOnce([
      {
        ...repoSnapshot('main').branches[0]!,
        tracking: 'origin/main',
        worktree: { path: '/tmp/repo', isPrimary: true },
      },
    ])
    mocks.pullBranch.mockImplementationOnce(async () => {
      order.push('pull:main')
      return { ok: true, message: 'updated main' }
    })
    mocks.createWorktree.mockImplementationOnce(async () => {
      order.push('create')
      return { ok: true, message: 'created' }
    })
    const { createRepositoryWorktree } = await import('#/server/modules/repo-write-paths.ts')

    const result = await createRepositoryWorktree(
      '/tmp/repo',
      {
        worktreePath: '/tmp/repo-feature',
        mode: {
          kind: 'newBranch',
          newBranch: 'feature/a',
          creationBase: { kind: 'localBranch', branch: 'main' },
        },
        syncBeforeCreate: true,
      },
      { kind: 'skip' },
    )

    expect(result).toEqual({ ok: true, message: 'created' })
    expect(order).toEqual(['pull:main', 'create'])
    expect(mocks.pullBranch).toHaveBeenCalledWith('/tmp/repo', 'main', '/tmp/repo', expect.any(AbortSignal), {
      proxyUrl: 'socks5://127.0.0.1:7890',
      timeoutMs: 240_000,
    })
  })

  test('createRepositoryWorktree fetches the exact remote creation source before creating', async () => {
    const order: string[] = []
    mocks.fetchRemote.mockImplementationOnce(async () => {
      order.push('fetch:upstream')
      return { ok: true, message: 'updated upstream' }
    })
    mocks.createWorktree.mockImplementationOnce(async () => {
      order.push('create')
      return { ok: true, message: 'created' }
    })
    const { createRepositoryWorktree } = await import('#/server/modules/repo-write-paths.ts')

    const result = await createRepositoryWorktree(
      '/tmp/repo',
      {
        worktreePath: '/tmp/repo-feature',
        mode: {
          kind: 'newBranch',
          newBranch: 'feature/a',
          creationBase: { kind: 'remoteBranch', remoteRef: 'upstream/release' },
        },
        syncBeforeCreate: true,
      },
      { kind: 'skip' },
    )

    expect(result).toEqual({ ok: true, message: 'created' })
    expect(order).toEqual(['fetch:upstream', 'create'])
    expect(mocks.fetchRemote).toHaveBeenCalledWith('/tmp/repo', 'upstream', expect.any(AbortSignal), {
      proxyUrl: 'socks5://127.0.0.1:7890',
      timeoutMs: 240_000,
    })
  })

  test('createRepositoryWorktree stops when source synchronization fails', async () => {
    mocks.fetchRemote.mockResolvedValueOnce({ ok: false, message: 'fatal: fetch failed' })
    const { createRepositoryWorktree } = await import('#/server/modules/repo-write-paths.ts')

    const result = await createRepositoryWorktree(
      '/tmp/repo',
      {
        worktreePath: '/tmp/repo-feature',
        mode: {
          kind: 'newBranch',
          newBranch: 'feature/a',
          creationBase: { kind: 'remoteBranch', remoteRef: 'upstream/main' },
        },
        syncBeforeCreate: true,
      },
      { kind: 'skip' },
    )

    expect(result).toEqual({ ok: false, message: 'fatal: fetch failed' })
    expect(mocks.createWorktree).not.toHaveBeenCalled()
    expect(mocks.publishRepoQueryInvalidation).not.toHaveBeenCalled()
  })

  test('createRepositoryWorktree rejects synchronization for a gone local upstream', async () => {
    mocks.getWorktrees.mockResolvedValueOnce([{ path: '/tmp/repo', branch: 'main', isBare: false, isPrimary: true }])
    mocks.getBranches.mockResolvedValueOnce([
      {
        ...repoSnapshot('main').branches[0]!,
        tracking: 'origin/main',
        trackingGone: true,
        worktree: { path: '/tmp/repo', isPrimary: true },
      },
    ])
    const { createRepositoryWorktree } = await import('#/server/modules/repo-write-paths.ts')

    const result = await createRepositoryWorktree(
      '/tmp/repo',
      {
        worktreePath: '/tmp/repo-feature',
        mode: { kind: 'existingBranch', branch: 'main' },
        syncBeforeCreate: true,
      },
      { kind: 'skip' },
    )

    expect(result).toEqual({ ok: false, message: 'error.worktree-sync-unavailable' })
    expect(mocks.pullBranch).not.toHaveBeenCalled()
    expect(mocks.createWorktree).not.toHaveBeenCalled()
  })

  test('createRepositoryWorktree preserves cancellation through source synchronization', async () => {
    const controller = new AbortController()
    mocks.runServerCancellable.mockImplementationOnce(async (_cwd, _kind, task) => await task(controller.signal))
    mocks.fetchRemote.mockImplementationOnce(async (_cwd, _remote, signal) => {
      expect(signal).toBe(controller.signal)
      controller.abort()
      return { ok: false, message: 'cancelled' }
    })
    const { createRepositoryWorktree } = await import('#/server/modules/repo-write-paths.ts')

    const result = await createRepositoryWorktree(
      '/tmp/repo',
      {
        worktreePath: '/tmp/repo-feature',
        mode: {
          kind: 'newBranch',
          newBranch: 'feature/a',
          creationBase: { kind: 'remoteBranch', remoteRef: 'upstream/main' },
        },
        syncBeforeCreate: true,
      },
      { kind: 'skip' },
    )

    expect(result).toEqual({ ok: false, message: 'cancelled' })
    expect(mocks.fetchRemote).toHaveBeenCalledWith('/tmp/repo', 'upstream', controller.signal, expect.anything())
    expect(mocks.createWorktree).not.toHaveBeenCalled()
  })

  test('createRepositoryWorktree retains repoChanged when create fails after synchronization', async () => {
    mocks.fetchRemote.mockResolvedValueOnce({ ok: true, message: 'updated upstream' })
    mocks.createWorktree.mockResolvedValueOnce({ ok: false, message: 'fatal: worktree failed' })
    const { createRepositoryWorktree } = await import('#/server/modules/repo-write-paths.ts')

    const result = await createRepositoryWorktree(
      '/tmp/repo',
      {
        worktreePath: '/tmp/repo-feature',
        mode: {
          kind: 'newBranch',
          newBranch: 'feature/a',
          creationBase: { kind: 'remoteBranch', remoteRef: 'upstream/main' },
        },
        syncBeforeCreate: true,
      },
      { kind: 'skip' },
    )

    expect(result).toEqual({ ok: false, message: 'fatal: worktree failed', repoChanged: true })
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: '/tmp/repo',
      query: 'repo-snapshot',
    })
  })

  test('createRepositoryWorktree passes object-shaped input to the backend and publishes source-token invalidation', async () => {
    const { createRepositoryWorktree } = await import('#/server/modules/repo-write-paths.ts')

    const result = await createRepositoryWorktree(
      '/tmp/repo',
      {
        worktreePath: '/tmp/repo-feature',
        mode: { kind: 'existingBranch', branch: 'feature/a' },
        syncBeforeCreate: false,
      },
      { kind: 'skip' },
      undefined,
      'repo_branch_test',
    )

    expect(result).toEqual({ ok: true, message: 'ok' })
    expect(mocks.createWorktree).toHaveBeenCalledWith(
      '/tmp/repo',
      {
        worktreePath: '/tmp/repo-feature',
        mode: { kind: 'existingBranch', branch: 'feature/a' },
        syncBeforeCreate: false,
      },
      undefined,
    )
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: '/tmp/repo',
      query: 'repo-snapshot',
      sourceToken: 'repo_branch_test',
    })
  })

  test('createRepositoryWorktree creates Git worktree before materializing known-source selections', async () => {
    const selections = [
      { path: 'backend/.venv', mode: 'copy' as const },
      { path: 'frontend/node_modules', mode: 'symlink' as const },
    ]
    const callOrder: string[] = []
    mocks.createWorktree.mockImplementationOnce(async () => {
      callOrder.push('create-worktree')
      return { ok: true, message: 'created' }
    })
    mocks.getWorktrees.mockImplementationOnce(async () => {
      callOrder.push('resolve-source')
      return [{ path: '/tmp/repo', branch: 'main', isBare: false, isPrimary: true }]
    })
    mocks.bootstrapWorktreeSelectionsAfterCreate.mockImplementationOnce(async () => {
      callOrder.push('bootstrap-dependencies')
      return {
        ok: true,
        message: 'Copied 1 path: backend/.venv\nSymlinked 1 path: frontend/node_modules',
      }
    })

    const { createRepositoryWorktree } = await import('#/server/modules/repo-write-paths.ts')
    const result = await createRepositoryWorktree(
      '/tmp/repo',
      {
        worktreePath: '/tmp/repo-feature',
        mode: { kind: 'existingBranch', branch: 'feature/a' },
        syncBeforeCreate: false,
      },
      { kind: 'materialize', selections, sourceWorktreePath: '/tmp/repo' },
    )

    expect(result).toEqual({
      ok: true,
      message: 'created\nCopied 1 path: backend/.venv\nSymlinked 1 path: frontend/node_modules',
    })
    expect(callOrder).toEqual(['create-worktree', 'resolve-source', 'bootstrap-dependencies'])
    expect(mocks.bootstrapWorktreeSelectionsAfterCreate).toHaveBeenCalledWith(
      '/tmp/repo',
      '/tmp/repo-feature',
      selections,
      { signal: undefined },
    )
  })

  test('createRepositoryWorktree materializes from another known local worktree', async () => {
    const selections = [{ path: '.env.local', mode: 'copy' as const }]
    mocks.createWorktree.mockResolvedValueOnce({ ok: true, message: 'created' })
    mocks.getWorktrees.mockResolvedValueOnce([
      { path: '/tmp/repo', branch: 'main', isBare: false, isPrimary: true },
      { path: '/tmp/repo-source', head: 'abcdef0', isBare: false, isPrimary: false },
    ])
    mocks.bootstrapWorktreeSelectionsAfterCreate.mockResolvedValueOnce({ ok: true, message: 'copied' })
    const { createRepositoryWorktree } = await import('#/server/modules/repo-write-paths.ts')

    await expect(
      createRepositoryWorktree(
        '/tmp/repo',
        {
          worktreePath: '/tmp/repo-feature',
          mode: { kind: 'existingBranch', branch: 'feature/a' },
          syncBeforeCreate: false,
        },
        { kind: 'materialize', selections, sourceWorktreePath: '/tmp/repo-source' },
      ),
    ).resolves.toMatchObject({ ok: true })
    expect(mocks.bootstrapWorktreeSelectionsAfterCreate).toHaveBeenCalledWith(
      '/tmp/repo-source',
      '/tmp/repo-feature',
      selections,
      { signal: undefined },
    )
  })

  test('createRepositoryWorktree materializes remote selections from a known source worktree', async () => {
    const selections = [{ path: 'backend/.venv', mode: 'copy' as const }]
    mocks.getRemoteWorktrees.mockResolvedValueOnce([
      { path: '/srv/repo', branch: 'main', isBare: false, isPrimary: true },
      { path: '/srv/repo-source', head: 'abcdef0', isBare: false, isPrimary: false },
    ])
    mocks.bootstrapRemoteWorktreeSelectionsAfterCreate.mockResolvedValueOnce({ ok: true, message: 'copied remote' })
    const { createRepositoryWorktree } = await import('#/server/modules/repo-write-paths.ts')

    await expect(
      createRepositoryWorktree(
        'ssh-config://prod/srv/repo',
        {
          worktreePath: '/srv/repo-feature',
          mode: { kind: 'existingBranch', branch: 'feature/a' },
          syncBeforeCreate: false,
        },
        { kind: 'materialize', selections, sourceWorktreePath: '/srv/repo-source' },
      ),
    ).resolves.toMatchObject({ ok: true })
    expect(mocks.createRemoteWorktree).toHaveBeenCalledWith(
      expect.objectContaining({ alias: 'prod', remotePath: '/srv/repo' }),
      expect.objectContaining({ worktreePath: '/srv/repo-feature' }),
    )
    expect(mocks.bootstrapRemoteWorktreeSelectionsAfterCreate).toHaveBeenCalledWith(
      expect.objectContaining({ alias: 'prod', remotePath: '/srv/repo-source' }),
      '/srv/repo-feature',
      selections,
      { signal: undefined },
    )
  })

  test('createRepositoryWorktree skips remote dependencies when their source disappears', async () => {
    mocks.getRemoteWorktrees.mockResolvedValueOnce([])
    const { createRepositoryWorktree } = await import('#/server/modules/repo-write-paths.ts')

    await expect(
      createRepositoryWorktree(
        'ssh-config://prod/srv/repo',
        {
          worktreePath: '/srv/repo-feature',
          mode: { kind: 'existingBranch', branch: 'feature/a' },
          syncBeforeCreate: false,
        },
        {
          kind: 'materialize',
          selections: [{ path: 'backend/.venv', mode: 'copy' }],
          sourceWorktreePath: '/srv/repo-source',
        },
      ),
    ).resolves.toEqual({ ok: true, message: 'created remote worktree' })
    expect(mocks.createRemoteWorktree).toHaveBeenCalled()
    expect(mocks.bootstrapRemoteWorktreeSelectionsAfterCreate).not.toHaveBeenCalled()
  })

  test('createRepositoryWorktree preserves remote Git success when dependency materialization fails', async () => {
    mocks.getRemoteWorktrees.mockResolvedValueOnce([
      { path: '/srv/repo-source', head: 'abcdef0', isBare: false, isPrimary: false },
    ])
    mocks.bootstrapRemoteWorktreeSelectionsAfterCreate.mockRejectedValueOnce(new Error('remote copy failed'))
    const { createRepositoryWorktree } = await import('#/server/modules/repo-write-paths.ts')

    await expect(
      createRepositoryWorktree(
        'ssh-config://prod/srv/repo',
        {
          worktreePath: '/srv/repo-feature',
          mode: { kind: 'existingBranch', branch: 'feature/a' },
          syncBeforeCreate: false,
        },
        {
          kind: 'materialize',
          selections: [{ path: 'backend/.venv', mode: 'copy' }],
          sourceWorktreePath: '/srv/repo-source',
        },
      ),
    ).resolves.toEqual({ ok: true, message: 'created remote worktree' })
  })

  test('createRepositoryWorktree does not inspect remote dependencies when Git creation fails', async () => {
    mocks.createRemoteWorktree.mockResolvedValueOnce({ ok: false, message: 'remote Git failed' })
    const { createRepositoryWorktree } = await import('#/server/modules/repo-write-paths.ts')

    await expect(
      createRepositoryWorktree(
        'ssh-config://prod/srv/repo',
        {
          worktreePath: '/srv/repo-feature',
          mode: { kind: 'existingBranch', branch: 'feature/a' },
          syncBeforeCreate: false,
        },
        {
          kind: 'materialize',
          selections: [{ path: 'backend/.venv', mode: 'copy' }],
          sourceWorktreePath: '/srv/repo-source',
        },
      ),
    ).resolves.toEqual({ ok: false, message: 'remote Git failed' })
    expect(mocks.getRemoteWorktrees).not.toHaveBeenCalled()
    expect(mocks.bootstrapRemoteWorktreeSelectionsAfterCreate).not.toHaveBeenCalled()
  })

  test('createRepositoryWorktree skips dependencies when the source worktree has disappeared', async () => {
    mocks.createWorktree.mockResolvedValueOnce({ ok: true, message: 'created' })
    mocks.getWorktrees.mockResolvedValueOnce([])
    const { createRepositoryWorktree } = await import('#/server/modules/repo-write-paths.ts')
    const result = await createRepositoryWorktree(
      '/tmp/repo',
      {
        worktreePath: '/tmp/repo-feature',
        mode: { kind: 'existingBranch', branch: 'feature/a' },
        syncBeforeCreate: false,
      },
      {
        kind: 'materialize',
        selections: [{ path: '.env', mode: 'copy' }],
        sourceWorktreePath: '/tmp/repo-source',
      },
    )

    expect(result).toEqual({ ok: true, message: 'created' })
    expect(mocks.createWorktree).toHaveBeenCalled()
    expect(mocks.bootstrapWorktreeSelectionsAfterCreate).not.toHaveBeenCalled()
  })

  test('createRepositoryWorktree preserves Git success when local dependency materialization throws', async () => {
    mocks.createWorktree.mockResolvedValueOnce({ ok: true, message: 'created' })
    mocks.getWorktrees.mockResolvedValueOnce([
      { path: '/tmp/repo-source', head: 'abcdef0', isBare: false, isPrimary: false },
    ])
    mocks.bootstrapWorktreeSelectionsAfterCreate.mockRejectedValueOnce(new Error('copy failed'))

    const { createRepositoryWorktree } = await import('#/server/modules/repo-write-paths.ts')
    const result = await createRepositoryWorktree(
      '/tmp/repo',
      {
        worktreePath: '/tmp/repo-feature',
        mode: { kind: 'existingBranch', branch: 'feature/a' },
        syncBeforeCreate: false,
      },
      {
        kind: 'materialize',
        selections: [{ path: '.env', mode: 'copy' }],
        sourceWorktreePath: '/tmp/repo-source',
      },
    )

    expect(result).toEqual({ ok: true, message: 'created' })
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: '/tmp/repo',
      query: 'repo-snapshot',
    })
  })

  test('createRepositoryWorktree does not inspect dependencies when Git creation fails', async () => {
    mocks.createWorktree.mockResolvedValueOnce({ ok: false, message: 'git failed' })
    const { createRepositoryWorktree } = await import('#/server/modules/repo-write-paths.ts')

    await expect(
      createRepositoryWorktree(
        '/tmp/repo',
        {
          worktreePath: '/tmp/repo-feature',
          mode: { kind: 'existingBranch', branch: 'feature/a' },
          syncBeforeCreate: false,
        },
        {
          kind: 'materialize',
          selections: [{ path: '.env', mode: 'copy' }],
          sourceWorktreePath: '/tmp/repo',
        },
      ),
    ).resolves.toEqual({ ok: false, message: 'git failed' })
    expect(mocks.getWorktrees).not.toHaveBeenCalled()
    expect(mocks.bootstrapWorktreeSelectionsAfterCreate).not.toHaveBeenCalled()
  })

  test('createRepositoryWorktree preserves Git success when cancelled immediately after creation', async () => {
    const controller = new AbortController()
    mocks.createWorktree.mockImplementationOnce(async () => {
      controller.abort()
      return { ok: true, message: 'created' }
    })
    const { createRepositoryWorktree } = await import('#/server/modules/repo-write-paths.ts')

    await expect(
      createRepositoryWorktree(
        '/tmp/repo',
        {
          worktreePath: '/tmp/repo-feature',
          mode: { kind: 'existingBranch', branch: 'feature/a' },
          syncBeforeCreate: false,
        },
        {
          kind: 'materialize',
          selections: [{ path: '.env', mode: 'copy' }],
          sourceWorktreePath: '/tmp/repo',
        },
        controller.signal,
      ),
    ).resolves.toEqual({ ok: true, message: 'created' })
    expect(mocks.getWorktrees).not.toHaveBeenCalled()
    expect(mocks.bootstrapWorktreeSelectionsAfterCreate).not.toHaveBeenCalled()
  })

  test('createRepositoryBranch creates a local branch and publishes source-token invalidation', async () => {
    const { createRepositoryBranch } = await import('#/server/modules/repo-write-paths.ts')

    const result = await createRepositoryBranch('/tmp/repo', 'feature/new', 'main', undefined, 'repo_branch_test')

    expect(result).toEqual({ ok: true, message: 'created local' })
    expect(mocks.createBranch).toHaveBeenCalledWith('/tmp/repo', 'feature/new', 'main', undefined)
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: '/tmp/repo',
      query: 'repo-snapshot',
      sourceToken: 'repo_branch_test',
    })
  })

  test('trackRepositoryRemoteBranch creates a local tracking branch and publishes source-token invalidation', async () => {
    const { trackRepositoryRemoteBranch } = await import('#/server/modules/repo-write-paths.ts')

    const result = await trackRepositoryRemoteBranch(
      '/tmp/repo',
      'feature/new',
      'origin/feature/new',
      undefined,
      'repo_branch_test',
    )

    expect(result).toEqual({ ok: true, message: 'tracked local' })
    expect(mocks.createTrackingBranch).toHaveBeenCalledWith('/tmp/repo', 'feature/new', 'origin/feature/new', undefined)
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: '/tmp/repo',
      query: 'repo-snapshot',
      sourceToken: 'repo_branch_test',
    })
  })

  test('setRepositoryBranchUpstream updates a local branch and publishes source-token invalidation', async () => {
    const module = await import('#/server/modules/repo-write-paths.ts')
    const setRepositoryBranchUpstream = (module as Record<string, unknown>).setRepositoryBranchUpstream
    expect(setRepositoryBranchUpstream).toBeTypeOf('function')

    const result = await (
      setRepositoryBranchUpstream as (
        cwd: string,
        branch: string,
        remoteRef: string | null,
        signal?: AbortSignal,
        sourceToken?: string,
      ) => Promise<unknown>
    )('/tmp/repo', 'feature/local', 'origin/release', undefined, 'repo_branch_test')

    expect(result).toEqual({ ok: true, message: 'updated local upstream' })
    expect(mocks.setBranchUpstream).toHaveBeenCalledWith('/tmp/repo', 'feature/local', 'origin/release', undefined)
    expect(mocks.setRemoteBranchUpstream).not.toHaveBeenCalled()
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: '/tmp/repo',
      query: 'repo-snapshot',
      sourceToken: 'repo_branch_test',
    })
  })

  test('setRepositoryBranchUpstream can defer invalidation after a successful update', async () => {
    const { setRepositoryBranchUpstream } = await import('#/server/modules/repo-write-paths.ts')

    await expect(
      setRepositoryBranchUpstream(
        '/tmp/repo',
        'feature/local',
        'origin/release',
        undefined,
        'repo_branch_test',
        { publishInvalidation: false },
      ),
    ).resolves.toEqual({ ok: true, message: 'updated local upstream' })

    expect(mocks.setBranchUpstream).toHaveBeenCalledWith('/tmp/repo', 'feature/local', 'origin/release', undefined)
    expect(mocks.publishRepoQueryInvalidation).not.toHaveBeenCalled()
  })

  test('setRepositoryBranchUpstream removes an SSH branch upstream through the remote backend', async () => {
    const module = await import('#/server/modules/repo-write-paths.ts')
    const setRepositoryBranchUpstream = (module as Record<string, unknown>).setRepositoryBranchUpstream
    expect(setRepositoryBranchUpstream).toBeTypeOf('function')

    const result = await (
      setRepositoryBranchUpstream as (
        cwd: string,
        branch: string,
        remoteRef: string | null,
        signal?: AbortSignal,
        sourceToken?: string,
      ) => Promise<unknown>
    )('ssh-config://prod/srv/repo', 'feature/local', null, undefined, 'repo_branch_test')

    expect(result).toEqual({ ok: true, message: 'updated remote upstream' })
    expect(mocks.setBranchUpstream).not.toHaveBeenCalled()
    expect(mocks.setRemoteBranchUpstream).toHaveBeenCalledWith(
      expect.objectContaining({ alias: 'prod', remotePath: '/srv/repo' }),
      { branch: 'feature/local', remoteRef: null, signal: undefined },
    )
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: 'ssh-config://prod/srv/repo',
      query: 'repo-snapshot',
      sourceToken: 'repo_branch_test',
    })
  })

  test('getRepositoryRemoteBranches returns local remote-tracking refs', async () => {
    mocks.getRemoteTrackingBranches.mockResolvedValueOnce(['origin/main', 'origin/feature/a'])
    const { getRepositoryRemoteBranches } = await import('#/server/modules/repo-write-paths.ts')

    await expect(getRepositoryRemoteBranches('/tmp/repo')).resolves.toEqual(['origin/main', 'origin/feature/a'])
    expect(mocks.getRemoteTrackingBranches).toHaveBeenCalledWith('/tmp/repo', undefined)
  })

  test('getRepositoryRemoteBranchInfo returns local remote-tracking refs with object ids', async () => {
    const mainHead = 'a'.repeat(40)
    mocks.getLocalRemoteTrackingBranchInfo.mockResolvedValueOnce([{ remoteRef: 'origin/main', head: mainHead }])
    const { getRepositoryRemoteBranchInfo } = await import('#/server/modules/repo-read-paths.ts')

    await expect(getRepositoryRemoteBranchInfo('/tmp/repo')).resolves.toEqual([
      { remoteRef: 'origin/main', head: mainHead },
    ])
    expect(mocks.getLocalRemoteTrackingBranchInfo).toHaveBeenCalledWith('/tmp/repo', undefined)
  })

  test('getRepositoryRemoteBranchInfo returns SSH remote-tracking refs with object ids', async () => {
    const releaseHead = 'b'.repeat(40)
    mocks.getSshRemoteTrackingBranchInfo.mockResolvedValueOnce([
      { remoteRef: 'upstream/release/v2', head: releaseHead },
    ])
    const { getRepositoryRemoteBranchInfo } = await import('#/server/modules/repo-read-paths.ts')

    await expect(getRepositoryRemoteBranchInfo('ssh-config://prod/srv/repo')).resolves.toEqual([
      { remoteRef: 'upstream/release/v2', head: releaseHead },
    ])
    expect(mocks.getSshRemoteTrackingBranchInfo).toHaveBeenCalledWith(
      expect.objectContaining({ alias: 'prod', remotePath: '/srv/repo' }),
      { signal: undefined },
    )
  })

  test('getRepositoryRemoteTags returns remote tag refs', async () => {
    mocks.getRemoteTags.mockResolvedValueOnce(['origin/v1.0.0', 'upstream/release/1.0'])
    const { getRepositoryRemoteTags } = await import('#/server/modules/repo-write-paths.ts')

    await expect(getRepositoryRemoteTags('/tmp/repo')).resolves.toEqual(['origin/v1.0.0', 'upstream/release/1.0'])
    expect(mocks.getRemoteTags).toHaveBeenCalledWith('/tmp/repo', undefined, {
      timeoutMs: 240_000,
      proxyUrl: 'socks5://127.0.0.1:7890',
    })
  })

  test('renameRepositoryFileTreeEntry publishes snapshot invalidation after local success', async () => {
    const { renameRepositoryFileTreeEntry } = await import('#/server/modules/repo-write-paths.ts')

    const result = await renameRepositoryFileTreeEntry('/tmp/repo', '/tmp/repo', '/tmp/repo/README.md', 'README2.md')

    expect(result).toEqual({ ok: true, message: '' })
    expect(mocks.renameLocalFileTreeEntry).toHaveBeenCalledWith('/tmp/repo', '/tmp/repo/README.md', 'README2.md')
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: '/tmp/repo',
      query: 'repo-snapshot',
    })
  })

  test('deleteRepositoryFileTreeEntries publishes snapshot invalidation after local success', async () => {
    const { deleteRepositoryFileTreeEntries } = await import('#/server/modules/repo-write-paths.ts')

    const result = await deleteRepositoryFileTreeEntries('/tmp/repo', '/tmp/repo', ['/tmp/repo/README.md'])

    expect(result).toEqual({ ok: true, message: '' })
    expect(mocks.deleteLocalFileTreeEntries).toHaveBeenCalledWith('/tmp/repo', ['/tmp/repo/README.md'])
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: '/tmp/repo',
      query: 'repo-snapshot',
    })
  })

  test('renameRepositoryFileTreeEntry dispatches remote repos to the SSH helper', async () => {
    const { renameRepositoryFileTreeEntry } = await import('#/server/modules/repo-write-paths.ts')

    const result = await renameRepositoryFileTreeEntry(
      'ssh-config://prod/srv/repo',
      '/srv/repo',
      '/srv/repo/README.md',
      'README2.md',
    )

    expect(result).toEqual({ ok: true, message: '' })
    expect(mocks.renameRemoteFileTreeEntry).toHaveBeenCalledWith(
      expect.objectContaining({ alias: 'prod', remotePath: '/srv/repo' }),
      '/srv/repo',
      '/srv/repo/README.md',
      'README2.md',
      { signal: undefined },
    )
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: 'ssh-config://prod/srv/repo',
      query: 'repo-snapshot',
    })
  })

  test('deleteRepositoryFileTreeEntries dispatches remote repos to the SSH helper', async () => {
    const { deleteRepositoryFileTreeEntries } = await import('#/server/modules/repo-write-paths.ts')

    const result = await deleteRepositoryFileTreeEntries('ssh-config://prod/srv/repo', '/srv/repo', ['/srv/repo/src'])

    expect(result).toEqual({ ok: true, message: '' })
    expect(mocks.deleteRemoteFileTreeEntries).toHaveBeenCalledWith(
      expect.objectContaining({ alias: 'prod', remotePath: '/srv/repo' }),
      '/srv/repo',
      ['/srv/repo/src'],
      { signal: undefined },
    )
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: 'ssh-config://prod/srv/repo',
      query: 'repo-snapshot',
    })
  })

  test('moveRepositoryFileTreeEntries publishes snapshot invalidation after local success', async () => {
    const { moveRepositoryFileTreeEntries } = await import('#/server/modules/repo-write-paths.ts')

    const result = await moveRepositoryFileTreeEntries(
      '/tmp/repo',
      '/tmp/repo',
      ['/tmp/repo/README.md'],
      '/tmp/repo/docs',
    )

    expect(result).toEqual({ ok: true, message: '' })
    expect(mocks.moveLocalFileTreeEntries).toHaveBeenCalledWith('/tmp/repo', ['/tmp/repo/README.md'], '/tmp/repo/docs')
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: '/tmp/repo',
      query: 'repo-snapshot',
    })
  })

  test('moveRepositoryFileTreeEntries dispatches remote repos to the SSH helper', async () => {
    const { moveRepositoryFileTreeEntries } = await import('#/server/modules/repo-write-paths.ts')

    const result = await moveRepositoryFileTreeEntries(
      'ssh-config://prod/srv/repo',
      '/srv/repo',
      ['/srv/repo/README.md'],
      '/srv/repo/docs',
    )

    expect(result).toEqual({ ok: true, message: '' })
    expect(mocks.moveRemoteFileTreeEntries).toHaveBeenCalledWith(
      expect.objectContaining({ alias: 'prod', remotePath: '/srv/repo' }),
      '/srv/repo',
      ['/srv/repo/README.md'],
      '/srv/repo/docs',
      { signal: undefined },
    )
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: 'ssh-config://prod/srv/repo',
      query: 'repo-snapshot',
    })
  })

  test('rename, delete, and move stop before filesystem dispatch when a branch workspace root is protected', async () => {
    mocks.assertBranchWorkspaceFileMutationAllowed.mockResolvedValue({
      ok: false,
      message: 'branch-workspace.managed-path-protected',
    })
    const { deleteRepositoryFileTreeEntries, moveRepositoryFileTreeEntries, renameRepositoryFileTreeEntry } =
      await import('#/server/modules/repo-write-paths.ts')

    await expect(
      renameRepositoryFileTreeEntry('/workspace', '/workspace', '/workspace/goblin-feature', 'renamed'),
    ).resolves.toEqual({ ok: false, message: 'branch-workspace.managed-path-protected' })
    await expect(
      deleteRepositoryFileTreeEntries('/workspace', '/workspace', ['/workspace/goblin-feature']),
    ).resolves.toEqual({ ok: false, message: 'branch-workspace.managed-path-protected' })
    await expect(
      moveRepositoryFileTreeEntries('/workspace', '/workspace', ['/workspace/goblin-feature'], '/workspace/archive'),
    ).resolves.toEqual({ ok: false, message: 'branch-workspace.managed-path-protected' })

    expect(mocks.renameLocalFileTreeEntry).not.toHaveBeenCalled()
    expect(mocks.deleteLocalFileTreeEntries).not.toHaveBeenCalled()
    expect(mocks.moveLocalFileTreeEntries).not.toHaveBeenCalled()
    expect(mocks.assertBranchWorkspaceFileMutationAllowed).toHaveBeenNthCalledWith(1, {
      rootId: '/workspace',
      kind: 'rename',
      worktreePath: '/workspace',
      paths: ['/workspace/goblin-feature'],
      newName: 'renamed',
    })
  })

  test('createRepositoryFileTreeDirectory publishes snapshot invalidation after local success', async () => {
    const { createRepositoryFileTreeDirectory } = await import('#/server/modules/repo-write-paths.ts')

    const result = await createRepositoryFileTreeDirectory('/tmp/repo', '/tmp/repo', '/tmp/repo/src', 'components')

    expect(result).toEqual({ ok: true, message: '' })
    expect(mocks.createLocalFileTreeDirectory).toHaveBeenCalledWith('/tmp/repo', '/tmp/repo/src', 'components')
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: '/tmp/repo',
      query: 'repo-snapshot',
    })
  })

  test('createRepositoryFileTreeDirectory dispatches remote repos to the SSH helper', async () => {
    const { createRepositoryFileTreeDirectory } = await import('#/server/modules/repo-write-paths.ts')

    const result = await createRepositoryFileTreeDirectory(
      'ssh-config://prod/srv/repo',
      '/srv/repo',
      '/srv/repo/src',
      'components',
    )

    expect(result).toEqual({ ok: true, message: '' })
    expect(mocks.createRemoteFileTreeDirectory).toHaveBeenCalledWith(
      expect.objectContaining({ alias: 'prod', remotePath: '/srv/repo' }),
      '/srv/repo',
      '/srv/repo/src',
      'components',
      { signal: undefined },
    )
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: 'ssh-config://prod/srv/repo',
      query: 'repo-snapshot',
    })
  })

  test('createRepositoryFileTreeFile publishes snapshot invalidation after local success', async () => {
    const { createRepositoryFileTreeFile } = await import('#/server/modules/repo-write-paths.ts')

    const result = await createRepositoryFileTreeFile('/tmp/repo', '/tmp/repo', '/tmp/repo/src', 'index.ts')

    expect(result).toEqual({ ok: true, message: '' })
    expect(mocks.createLocalFileTreeFile).toHaveBeenCalledWith('/tmp/repo', '/tmp/repo/src', 'index.ts')
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: '/tmp/repo',
      query: 'repo-snapshot',
    })
  })

  test('readRepositoryFileTreeTextFile dispatches local and remote repos', async () => {
    const { readRepositoryFileTreeTextFile } = await import('#/server/modules/repo-read-paths.ts')

    await expect(readRepositoryFileTreeTextFile('/tmp/repo', '/tmp/repo', '/tmp/repo/README.md')).resolves.toEqual({
      ok: true,
      content: 'hello\n',
      byteLength: 6,
    })
    await expect(
      readRepositoryFileTreeTextFile('ssh-config://prod/srv/repo', '/srv/repo', '/srv/repo/README.md'),
    ).resolves.toEqual({
      ok: true,
      content: 'remote\n',
      byteLength: 7,
    })
    expect(mocks.readLocalFileTreeTextFile).toHaveBeenCalledWith('/tmp/repo', '/tmp/repo/README.md')
    expect(mocks.readRemoteFileTreeTextFile).toHaveBeenCalledWith(
      expect.objectContaining({ alias: 'prod', remotePath: '/srv/repo' }),
      '/srv/repo',
      '/srv/repo/README.md',
      { signal: undefined },
    )
  })

  test('readRepositoryFileTreeBinaryFile dispatches local and remote repos', async () => {
    const { readRepositoryFileTreeBinaryFile } = await import('#/server/modules/repo-read-paths.ts')

    await expect(
      readRepositoryFileTreeBinaryFile('/tmp/repo', '/tmp/repo', '/tmp/repo/image.bin', 30),
    ).resolves.toEqual({
      ok: true,
      name: 'image.bin',
      byteLength: 3,
      bytesBase64: 'AQID',
    })
    await expect(
      readRepositoryFileTreeBinaryFile('ssh-config://prod/srv/repo', '/srv/repo', '/srv/repo/image.bin', 30),
    ).resolves.toEqual({
      ok: true,
      name: 'image.bin',
      byteLength: 3,
      bytesBase64: 'AQID',
    })
    expect(mocks.readLocalFileTreeBinaryFile).toHaveBeenCalledWith('/tmp/repo', '/tmp/repo/image.bin', 30)
    expect(mocks.readRemoteFileTreeBinaryFile).toHaveBeenCalledWith(
      expect.objectContaining({ alias: 'prod', remotePath: '/srv/repo' }),
      '/srv/repo',
      '/srv/repo/image.bin',
      30,
      { signal: undefined },
    )
  })

  test('replaceRepositoryFileTreeTextFile publishes snapshot invalidation after local success', async () => {
    const { replaceRepositoryFileTreeTextFile } = await import('#/server/modules/repo-write-paths.ts')

    const result = await replaceRepositoryFileTreeTextFile('/tmp/repo', '/tmp/repo', '/tmp/repo/README.md', 'new\n')

    expect(result).toEqual({ ok: true, previousContent: 'old\n', previousByteLength: 4 })
    expect(mocks.replaceLocalFileTreeTextFile).toHaveBeenCalledWith('/tmp/repo', '/tmp/repo/README.md', 'new\n')
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: '/tmp/repo',
      query: 'repo-snapshot',
    })
  })

  test('replaceRepositoryFileTreeBinaryFile publishes snapshot invalidation after local success', async () => {
    const { replaceRepositoryFileTreeBinaryFile } = await import('#/server/modules/repo-write-paths.ts')

    const result = await replaceRepositoryFileTreeBinaryFile(
      '/tmp/repo',
      '/tmp/repo',
      '/tmp/repo/image.bin',
      'AQI=',
      30,
      undefined,
      'client_123',
    )

    expect(result).toEqual({ ok: true, previousBytesBase64: 'CQg=', previousByteLength: 2 })
    expect(mocks.replaceLocalFileTreeBinaryFile).toHaveBeenCalledWith('/tmp/repo', '/tmp/repo/image.bin', 'AQI=', 30)
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: '/tmp/repo',
      query: 'repo-snapshot',
      sourceToken: 'client_123',
    })
  })

  test('resetRepositoryHard dispatches remote repos through the backend', async () => {
    const { resetRepositoryHard } = await import('#/server/modules/repo-write-paths.ts')

    const result = await resetRepositoryHard('ssh-config://prod/srv/repo', '/srv/repo')

    expect(result).toEqual({ ok: true, message: 'reset remote' })
    expect(mocks.resetRemoteHard).toHaveBeenCalledWith(
      expect.objectContaining({ alias: 'prod', remotePath: '/srv/repo' }),
      '/srv/repo',
      { signal: undefined },
    )
    expect(mocks.resetHardToCurrentHead).not.toHaveBeenCalled()
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: 'ssh-config://prod/srv/repo',
      query: 'repo-snapshot',
    })
  })

  test('file tree write failures do not publish snapshot invalidation', async () => {
    mocks.renameLocalFileTreeEntry.mockResolvedValueOnce({ ok: false, message: 'error.file-exists' })
    const { renameRepositoryFileTreeEntry } = await import('#/server/modules/repo-write-paths.ts')

    const result = await renameRepositoryFileTreeEntry('/tmp/repo', '/tmp/repo', '/tmp/repo/README.md', 'README2.md')

    expect(result).toEqual({ ok: false, message: 'error.file-exists' })
    expect(mocks.publishRepoQueryInvalidation).not.toHaveBeenCalled()
  })

  test.each([
    [
      'checkoutRepositoryBranch',
      async (repo: typeof import('#/server/modules/repo-write-paths.ts')) =>
        repo.checkoutRepositoryBranch('/tmp/repo', 'feature/a'),
    ],
    [
      'pullRepositoryBranch',
      async (repo: typeof import('#/server/modules/repo-write-paths.ts')) =>
        repo.pullRepositoryBranch('/tmp/repo', 'feature/a'),
    ],
    [
      'pushRepositoryBranch',
      async (repo: typeof import('#/server/modules/repo-write-paths.ts')) =>
        repo.pushRepositoryBranch('/tmp/repo', 'feature/a'),
    ],
    [
      'createRepositoryWorktree',
      async (repo: typeof import('#/server/modules/repo-write-paths.ts')) =>
        repo.createRepositoryWorktree(
          '/tmp/repo',
          {
            worktreePath: '/tmp/repo-worktree',
            mode: {
              kind: 'newBranch',
              newBranch: 'feature/a',
              creationBase: { kind: 'localBranch', branch: 'main' },
            },
            syncBeforeCreate: false,
          },
          { kind: 'skip' },
        ),
    ],
  ])('%s publishes snapshot invalidation after success', async (_name, run) => {
    const repo = await import('#/server/modules/repo-write-paths.ts')

    const result = await run(repo)

    expect(result).toEqual({ ok: true, message: 'ok' })
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: '/tmp/repo',
      query: 'repo-snapshot',
    })
  })

  test('pullRepositoryBranch can defer its snapshot invalidation', async () => {
    const { pullRepositoryBranch } = await import('#/server/modules/repo-write-paths.ts')

    const result = await pullRepositoryBranch('/tmp/repo', 'feature/a', undefined, undefined, undefined, {
      publishInvalidation: false,
    })

    expect(result).toEqual({ ok: true, message: 'ok' })
    expect(mocks.publishRepoQueryInvalidation).not.toHaveBeenCalled()
  })

  test('commitRepositoryChanges can defer its snapshot invalidation', async () => {
    const { commitRepositoryChanges } = await import('#/server/modules/repo-write-paths.ts')

    const result = await commitRepositoryChanges(
      '/tmp/repo',
      '/tmp/repo-worktree',
      'feat: local commit',
      undefined,
      undefined,
      { publishInvalidation: false },
    )

    expect(result).toEqual({ ok: true, message: 'committed local' })
    expect(mocks.publishRepoQueryInvalidation).not.toHaveBeenCalled()
  })

  test('publishRepositorySnapshotInvalidation publishes the canonical snapshot event', async () => {
    const { publishRepositorySnapshotInvalidation } = await import('#/server/modules/repo-write-paths.ts')

    publishRepositorySnapshotInvalidation('/tmp/repo', 'batch_1')

    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: '/tmp/repo',
      query: 'repo-snapshot',
      sourceToken: 'batch_1',
    })
  })

  test.each([
    [
      'pullRepositoryBranch',
      async (repo: typeof import('#/server/modules/repo-write-paths.ts')) =>
        repo.pullRepositoryBranch('/tmp/repo', 'feature/a'),
    ],
    [
      'pushRepositoryBranch',
      async (repo: typeof import('#/server/modules/repo-write-paths.ts')) =>
        repo.pushRepositoryBranch('/tmp/repo', 'feature/a'),
    ],
  ])('%s runs inside the repo network-op gate', async (_name, run) => {
    const repo = await import('#/server/modules/repo-write-paths.ts')

    const result = await run(repo)

    expect(result).toEqual({ ok: true, message: 'ok' })
    expect(mocks.runServerCancellable).toHaveBeenCalledWith('/tmp/repo', 'user', expect.any(Function))
  })

  test.each([
    [
      'checkoutRepositoryBranch',
      () => mocks.checkoutBranch.mockResolvedValueOnce({ ok: false, message: 'fatal: checkout failed' }),
      async (repo: typeof import('#/server/modules/repo-write-paths.ts')) =>
        repo.checkoutRepositoryBranch('/tmp/repo', 'feature/a'),
    ],
    [
      'pullRepositoryBranch',
      () => mocks.pullBranch.mockResolvedValueOnce({ ok: false, message: 'fatal: pull failed' }),
      async (repo: typeof import('#/server/modules/repo-write-paths.ts')) =>
        repo.pullRepositoryBranch('/tmp/repo', 'feature/a'),
    ],
    [
      'pushRepositoryBranch',
      () => mocks.pushBranch.mockResolvedValueOnce({ ok: false, message: 'fatal: push failed' }),
      async (repo: typeof import('#/server/modules/repo-write-paths.ts')) =>
        repo.pushRepositoryBranch('/tmp/repo', 'feature/a'),
    ],
    [
      'createRepositoryWorktree',
      () => mocks.createWorktree.mockResolvedValueOnce({ ok: false, message: 'fatal: worktree failed' }),
      async (repo: typeof import('#/server/modules/repo-write-paths.ts')) =>
        repo.createRepositoryWorktree(
          '/tmp/repo',
          {
            worktreePath: '/tmp/repo-worktree',
            mode: {
              kind: 'newBranch',
              newBranch: 'feature/a',
              creationBase: { kind: 'localBranch', branch: 'main' },
            },
            syncBeforeCreate: false,
          },
          { kind: 'skip' },
        ),
    ],
  ])('%s does not publish snapshot invalidation after failure', async (_name, setup, run) => {
    setup()
    const repo = await import('#/server/modules/repo-write-paths.ts')

    await run(repo)

    expect(mocks.publishRepoQueryInvalidation).not.toHaveBeenCalled()
  })

  test('createRepositoryWorktree rejects non-absolute paths before calling git', async () => {
    const { createRepositoryWorktree } = await import('#/server/modules/repo-write-paths.ts')

    const result = await createRepositoryWorktree(
      '/tmp/repo',
      {
        worktreePath: 'relative/path',
        mode: {
          kind: 'newBranch',
          newBranch: 'feature/a',
          creationBase: { kind: 'localBranch', branch: 'main' },
        },
        syncBeforeCreate: false,
      },
      { kind: 'skip' },
    )

    expect(result).toEqual({ ok: false, message: 'error.invalid-path' })
    expect(mocks.createWorktree).not.toHaveBeenCalled()
    expect(mocks.publishRepoQueryInvalidation).not.toHaveBeenCalled()
  })

  test('deleteRepositoryBranch publishes snapshot invalidation after success', async () => {
    const { deleteRepositoryBranch } = await import('#/server/modules/repo-write-paths.ts')

    const result = await deleteRepositoryBranch('/tmp/repo', 'feature/a')

    expect(result).toEqual({ ok: true, message: 'ok' })
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: '/tmp/repo',
      query: 'repo-snapshot',
    })
  })

  test('deleteRepositoryBranch refuses protected branches before touching git', async () => {
    mocks.getCurrentBranch.mockResolvedValueOnce('feature/current')
    const { deleteRepositoryBranch } = await import('#/server/modules/repo-write-paths.ts')

    const result = await deleteRepositoryBranch('/tmp/repo', 'main')

    expect(result).toEqual({ ok: false, message: 'error.cannot-delete-protected-branch' })
    expect(mocks.deleteBranch).not.toHaveBeenCalled()
    expect(mocks.publishRepoQueryInvalidation).not.toHaveBeenCalled()
  })

  test('deleteRepositoryBranch refuses to delete a protected upstream before deleting the local branch', async () => {
    mocks.getCurrentBranch.mockResolvedValueOnce('feature/current')
    mocks.getUpstream.mockResolvedValueOnce('origin/main')
    const { deleteRepositoryBranch } = await import('#/server/modules/repo-write-paths.ts')

    const result = await deleteRepositoryBranch('/tmp/repo', 'feature/local', {
      force: true,
      alsoDeleteUpstream: true,
    })

    expect(result).toEqual({ ok: false, message: 'error.cannot-delete-protected-branch' })
    expect(mocks.deleteBranch).not.toHaveBeenCalled()
    expect(mocks.deleteUpstreamBranch).not.toHaveBeenCalled()
  })

  test('deleteRepositoryBranch keeps a shared upstream and the selected local branch', async () => {
    mocks.getCurrentBranch.mockResolvedValueOnce('feature/current')
    mocks.getUpstream.mockResolvedValueOnce('origin/release')
    mocks.getBranches.mockResolvedValueOnce([
      { ...repoSnapshot('feature/local').branches[0]!, tracking: 'origin/release' },
      { ...repoSnapshot('feature/other').branches[0]!, tracking: 'origin/release' },
    ])
    const { deleteRepositoryBranch } = await import('#/server/modules/repo-write-paths.ts')

    const result = await deleteRepositoryBranch('/tmp/repo', 'feature/local', {
      force: true,
      alsoDeleteUpstream: true,
    })

    expect(result).toEqual({ ok: false, message: 'error.upstream-shared' })
    expect(mocks.deleteBranch).not.toHaveBeenCalled()
    expect(mocks.deleteUpstreamBranch).not.toHaveBeenCalled()
  })

  test('deleteRepositoryBranch deletes a unique upstream after deleting the local branch', async () => {
    mocks.getCurrentBranch.mockResolvedValueOnce('feature/current')
    mocks.getUpstream.mockResolvedValueOnce('origin/release')
    mocks.getBranches.mockResolvedValueOnce([
      { ...repoSnapshot('feature/local').branches[0]!, tracking: 'origin/release' },
    ])
    const { deleteRepositoryBranch } = await import('#/server/modules/repo-write-paths.ts')

    const result = await deleteRepositoryBranch('/tmp/repo', 'feature/local', {
      force: true,
      alsoDeleteUpstream: true,
    })

    expect(result).toEqual({ ok: true, message: 'ok' })
    expect(mocks.deleteBranch).toHaveBeenCalled()
    expect(mocks.deleteUpstreamBranch).toHaveBeenCalledWith('/tmp/repo', 'origin', 'release', undefined)
  })

  test('deleteRepositoryBranch enforces shared-upstream safety for SSH repositories', async () => {
    mocks.getRemoteSnapshot.mockResolvedValueOnce({
      branches: [
        { ...repoSnapshot('feature/local').branches[0]!, tracking: 'origin/release' },
        { ...repoSnapshot('feature/other').branches[0]!, tracking: 'origin/release' },
      ],
      current: 'main',
    })
    const { deleteRepositoryBranch } = await import('#/server/modules/repo-write-paths.ts')

    const result = await deleteRepositoryBranch('ssh-config://prod/srv/repo', 'feature/local', {
      force: true,
      alsoDeleteUpstream: true,
    })

    expect(result).toEqual({ ok: false, message: 'error.upstream-shared' })
    expect(mocks.deleteRemoteBranch).not.toHaveBeenCalled()
    expect(mocks.deleteSshRemoteServerBranch).not.toHaveBeenCalled()
  })

  test('deleteRepositoryBranch deletes a unique upstream for SSH repositories', async () => {
    mocks.getRemoteSnapshot.mockResolvedValueOnce({
      branches: [{ ...repoSnapshot('feature/local').branches[0]!, tracking: 'origin/release' }],
      current: 'main',
    })
    const { deleteRepositoryBranch } = await import('#/server/modules/repo-write-paths.ts')

    const result = await deleteRepositoryBranch('ssh-config://prod/srv/repo', 'feature/local', {
      force: true,
      alsoDeleteUpstream: true,
    })

    expect(result).toEqual({ ok: true, message: 'deleted ssh remote' })
    expect(mocks.deleteRemoteBranch).toHaveBeenCalled()
    expect(mocks.deleteSshRemoteServerBranch).toHaveBeenCalledWith(
      expect.objectContaining({ remotePath: '/srv/repo' }),
      { remote: 'origin', branch: 'release', signal: undefined },
    )
  })

  test('deleteRepositoryBranch uses current HEAD semantics for safe deletes', async () => {
    mocks.getCurrentBranch.mockResolvedValueOnce('release/1.0')
    mocks.getWorktrees.mockResolvedValueOnce([])
    mocks.isAncestor.mockImplementationOnce(async (_cwd, _branch, descendant) => descendant === 'release/1.0')
    mocks.getUpstream.mockResolvedValueOnce(null)
    const { deleteRepositoryBranch } = await import('#/server/modules/repo-write-paths.ts')

    const result = await deleteRepositoryBranch('/tmp/repo', 'feature/a')

    expect(result).toEqual({ ok: true, message: 'ok' })
    expect(mocks.isAncestor).toHaveBeenCalledWith('/tmp/repo', 'feature/a', 'release/1.0', undefined)
    expect(mocks.deleteBranch).toHaveBeenCalledWith('/tmp/repo', 'feature/a', { force: undefined, signal: undefined })
  })

  test('deleteRepositoryBranch does not publish snapshot invalidation after failure', async () => {
    mocks.deleteBranch.mockResolvedValueOnce({ ok: false, message: 'fatal: delete failed' })
    const { deleteRepositoryBranch } = await import('#/server/modules/repo-write-paths.ts')

    await deleteRepositoryBranch('/tmp/repo', 'feature/a')

    expect(mocks.publishRepoQueryInvalidation).not.toHaveBeenCalled()
  })

  test('removeRepositoryWorktree publishes snapshot invalidation after worktree removal success', async () => {
    mocks.getWorktrees.mockResolvedValueOnce([
      {
        path: '/tmp/repo-worktree',
        branch: 'feature/a',
        isBare: false,
        isPrimary: false,
        isDirty: false,
        changeCount: 0,
      },
    ])
    const { removeRepositoryWorktree } = await import('#/server/modules/repo-write-paths.ts')

    const result = await removeRepositoryWorktree('/tmp/repo', {
      branch: 'feature/a',
      worktreePath: '/tmp/repo-worktree',
      alsoDeleteBranch: false,
    })

    expect(result).toEqual({ ok: true, message: 'ok' })
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: '/tmp/repo',
      query: 'repo-snapshot',
    })
  })

  test('removeRepositoryWorktree can force-remove without reading worktree status', async () => {
    mocks.getWorktrees.mockResolvedValueOnce([
      {
        path: '/tmp/repo-worktree',
        branch: 'feature/a',
        isBare: false,
        isPrimary: false,
      },
    ])
    const { removeRepositoryWorktree } = await import('#/server/modules/repo-write-paths.ts')

    const result = await removeRepositoryWorktree('/tmp/repo', {
      branch: 'feature/a',
      worktreePath: '/tmp/repo-worktree',
      alsoDeleteBranch: false,
      forceRemoveWorktree: true,
      skipWorktreeStatus: true,
      forceDeleteBranch: false,
    })

    expect(result).toEqual({ ok: true, message: 'ok' })
    expect(mocks.getWorktrees).toHaveBeenCalledWith('/tmp/repo', {
      includeStatus: false,
      signal: undefined,
    })
    expect(mocks.removeWorktree).toHaveBeenCalledWith('/tmp/repo', '/tmp/repo-worktree', {
      force: true,
      signal: undefined,
    })
    expect(mocks.deleteBranch).not.toHaveBeenCalled()
  })

  test('removeRepositoryWorktree removes a detached worktree by exact path when retaining branches', async () => {
    mocks.getWorktrees.mockResolvedValueOnce([
      {
        path: '/tmp/repo-worktree',
        head: 'abcdef0',
        isBare: false,
        isPrimary: false,
      },
    ])
    const { removeRepositoryWorktree } = await import('#/server/modules/repo-write-paths.ts')

    const result = await removeRepositoryWorktree('/tmp/repo', {
      branch: 'feature/a',
      worktreePath: '/tmp/repo-worktree',
      alsoDeleteBranch: false,
      forceRemoveWorktree: true,
      skipWorktreeStatus: true,
    })

    expect(result).toEqual({ ok: true, message: 'ok' })
    expect(mocks.removeWorktree).toHaveBeenCalledWith('/tmp/repo', '/tmp/repo-worktree', {
      force: true,
      signal: undefined,
    })
    expect(mocks.deleteBranch).not.toHaveBeenCalled()
  })

  test('removeRepositoryWorktree publishes snapshot invalidation once after worktree and branch deletion success', async () => {
    mocks.getWorktrees.mockResolvedValueOnce([
      {
        path: '/tmp/repo-worktree',
        branch: 'feature/a',
        isBare: false,
        isPrimary: false,
        isDirty: false,
        changeCount: 0,
      },
    ])
    const { removeRepositoryWorktree } = await import('#/server/modules/repo-write-paths.ts')

    const result = await removeRepositoryWorktree('/tmp/repo', {
      branch: 'feature/a',
      worktreePath: '/tmp/repo-worktree',
      alsoDeleteBranch: true,
    })

    expect(result).toEqual({ ok: true, message: 'ok' })
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledTimes(1)
  })

  test('removeRepositoryWorktree checks shared upstream safety before removing the worktree', async () => {
    mocks.getWorktrees.mockResolvedValue([
      {
        path: '/tmp/repo-worktree',
        branch: 'feature/local',
        isBare: false,
        isPrimary: false,
        isDirty: false,
        changeCount: 0,
      },
    ])
    mocks.getCurrentBranch.mockResolvedValueOnce('main')
    mocks.getUpstream.mockResolvedValueOnce('origin/release')
    mocks.getBranches.mockResolvedValueOnce([
      { ...repoSnapshot('feature/local').branches[0]!, tracking: 'origin/release' },
      { ...repoSnapshot('feature/other').branches[0]!, tracking: 'origin/release' },
    ])
    const { removeRepositoryWorktree } = await import('#/server/modules/repo-write-paths.ts')

    const result = await removeRepositoryWorktree('/tmp/repo', {
      branch: 'feature/local',
      worktreePath: '/tmp/repo-worktree',
      alsoDeleteBranch: true,
      forceDeleteBranch: true,
      alsoDeleteUpstream: true,
    })

    expect(result).toEqual({ ok: false, message: 'error.upstream-shared' })
    expect(mocks.removeWorktree).not.toHaveBeenCalled()
    expect(mocks.deleteBranch).not.toHaveBeenCalled()
  })

  test('removeRepositoryWorktree refuses before removing when branch deletion would fail', async () => {
    mocks.getWorktrees.mockResolvedValueOnce([
      {
        path: '/tmp/repo-worktree',
        branch: 'feature/a',
        isBare: false,
        isPrimary: false,
        isDirty: false,
        changeCount: 0,
      },
    ])
    mocks.isAncestor.mockResolvedValueOnce(false)
    mocks.getUpstream.mockResolvedValueOnce(null)
    const { removeRepositoryWorktree } = await import('#/server/modules/repo-write-paths.ts')

    const result = await removeRepositoryWorktree('/tmp/repo', {
      branch: 'feature/a',
      worktreePath: '/tmp/repo-worktree',
      alsoDeleteBranch: true,
    })

    expect(result).toEqual({ ok: false, message: 'error.cannot-remove-unpushed-worktree' })
    expect(mocks.removeWorktree).not.toHaveBeenCalled()
    expect(mocks.deleteBranch).not.toHaveBeenCalled()
    expect(mocks.publishRepoQueryInvalidation).not.toHaveBeenCalled()
  })

  test('removeRepositoryWorktree refuses locked worktrees before calling git remove', async () => {
    mocks.getWorktrees.mockResolvedValueOnce([
      {
        path: '/tmp/repo-worktree',
        branch: 'feature/a',
        isBare: false,
        isPrimary: false,
        isDirty: false,
        isLocked: true,
      },
    ])
    const { removeRepositoryWorktree } = await import('#/server/modules/repo-write-paths.ts')

    const result = await removeRepositoryWorktree('/tmp/repo', {
      branch: 'feature/a',
      worktreePath: '/tmp/repo-worktree',
      alsoDeleteBranch: false,
      forceRemoveWorktree: true,
    })

    expect(result).toEqual({ ok: false, message: 'error.cannot-remove-locked-worktree' })
    expect(mocks.removeWorktree).not.toHaveBeenCalled()
  })

  test('removeRepositoryWorktree refuses when worktree status could not be read', async () => {
    mocks.getWorktrees.mockResolvedValueOnce([
      { path: '/tmp/repo-worktree', branch: 'feature/a', isBare: false, isPrimary: false },
    ])
    const { removeRepositoryWorktree } = await import('#/server/modules/repo-write-paths.ts')

    const result = await removeRepositoryWorktree('/tmp/repo', {
      branch: 'feature/a',
      worktreePath: '/tmp/repo-worktree',
      alsoDeleteBranch: false,
      forceRemoveWorktree: true,
    })

    expect(result).toEqual({ ok: false, message: 'error.cannot-remove-dirty-worktree' })
    expect(mocks.removeWorktree).not.toHaveBeenCalled()
  })

  test('local backend revalidates a prunable worktree before pruning', async () => {
    mocks.getWorktrees.mockResolvedValueOnce([
      {
        path: '/tmp/repo-stale',
        branch: 'feature/stale',
        isBare: false,
        isPrimary: false,
        isPrunable: true,
      },
    ])
    const { resolveRepoBackend } = await import('#/server/modules/repo-backend.ts')
    const backend = await resolveRepoBackend('/tmp/repo')
    const cleanupWorktree = (backend as unknown as { cleanupWorktree?: (path: string) => Promise<unknown> })
      .cleanupWorktree
    expect(cleanupWorktree).toBeTypeOf('function')

    const result = await cleanupWorktree!('/tmp/repo-stale')

    expect(result).toEqual({ ok: true, message: 'pruned local' })
    expect(mocks.getWorktrees).toHaveBeenCalledWith('/tmp/repo', { includeStatus: false, signal: undefined })
    expect(mocks.pruneWorktrees).toHaveBeenCalledWith('/tmp/repo', { signal: undefined })
  })

  test('local backend refuses cleanup when the selected worktree is no longer prunable', async () => {
    mocks.getWorktrees.mockResolvedValueOnce([
      {
        path: '/tmp/repo-stale',
        branch: 'feature/stale',
        isBare: false,
        isPrimary: false,
        isPrunable: false,
      },
    ])
    const { resolveRepoBackend } = await import('#/server/modules/repo-backend.ts')
    const backend = await resolveRepoBackend('/tmp/repo')
    const cleanupWorktree = (backend as unknown as { cleanupWorktree?: (path: string) => Promise<unknown> })
      .cleanupWorktree
    expect(cleanupWorktree).toBeTypeOf('function')

    const result = await cleanupWorktree!('/tmp/repo-stale')

    expect(result).toEqual({ ok: false, message: 'error.worktree-not-prunable' })
    expect(mocks.pruneWorktrees).not.toHaveBeenCalled()
  })

  test('cleanupRepositoryWorktree publishes snapshot invalidation after success', async () => {
    mocks.getWorktrees.mockResolvedValueOnce([
      {
        path: '/tmp/repo-stale',
        branch: 'feature/stale',
        isBare: false,
        isPrimary: false,
        isPrunable: true,
      },
    ])
    const repoWritePaths = await import('#/server/modules/repo-write-paths.ts')
    const cleanupRepositoryWorktree = (repoWritePaths as Record<string, unknown>).cleanupRepositoryWorktree
    expect(cleanupRepositoryWorktree).toBeTypeOf('function')

    const result = await (
      cleanupRepositoryWorktree as (
        cwd: string,
        worktreePath: string,
        signal?: AbortSignal,
        sourceToken?: string,
      ) => Promise<unknown>
    )('/tmp/repo', '/tmp/repo-stale', undefined, 'client_123')

    expect(result).toEqual({ ok: true, message: 'pruned local' })
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: '/tmp/repo',
      query: 'repo-snapshot',
      sourceToken: 'client_123',
    })
  })

  test('remote backend delegates cleanup to the revalidating remote helper', async () => {
    const { resolveRepoBackend } = await import('#/server/modules/repo-backend.ts')
    const backend = await resolveRepoBackend('ssh-config://prod/srv/repo')
    const cleanupWorktree = (backend as unknown as { cleanupWorktree?: (path: string) => Promise<unknown> })
      .cleanupWorktree
    expect(cleanupWorktree).toBeTypeOf('function')

    const result = await cleanupWorktree!('/srv/repo-stale')

    expect(result).toEqual({ ok: true, message: 'pruned remote' })
    expect(mocks.pruneRemoteWorktrees).toHaveBeenCalledWith(expect.objectContaining({ remotePath: '/srv/repo' }), {
      worktreePath: '/srv/repo-stale',
      signal: undefined,
    })
  })

  test('commitRepositoryChanges commits local worktrees through the local backend and publishes invalidation', async () => {
    const { commitRepositoryChanges } = await import('#/server/modules/repo-write-paths.ts')

    const result = await commitRepositoryChanges('/tmp/repo', '/tmp/repo-worktree', 'feat: local commit')

    expect(result).toEqual({ ok: true, message: 'committed local' })
    expect(mocks.commitAllChanges).toHaveBeenCalledWith('/tmp/repo-worktree', 'feat: local commit', undefined)
    expect(mocks.commitRemoteChanges).not.toHaveBeenCalled()
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: '/tmp/repo',
      query: 'repo-snapshot',
    })
  })

  test('commitRepositoryChanges commits remote worktrees through the remote backend and publishes invalidation', async () => {
    const { commitRepositoryChanges } = await import('#/server/modules/repo-write-paths.ts')

    const result = await commitRepositoryChanges(
      'ssh-config://prod/srv/repo',
      '/data/deer-flow-runtime1',
      'feat: remote commit',
    )

    expect(result).toEqual({ ok: true, message: 'committed remote' })
    expect(mocks.commitAllChanges).not.toHaveBeenCalled()
    expect(mocks.commitRemoteChanges).toHaveBeenCalledWith(
      expect.objectContaining({ alias: 'prod', remotePath: '/srv/repo' }),
      '/data/deer-flow-runtime1',
      'feat: remote commit',
      { signal: undefined },
    )
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: 'ssh-config://prod/srv/repo',
      query: 'repo-snapshot',
    })
  })

  test('discardRepositoryChanges dispatches local paths and publishes invalidation on success', async () => {
    const { discardRepositoryChanges } = await import('#/server/modules/repo-write-paths.ts')

    const result = await discardRepositoryChanges('/tmp/repo', '/tmp/repo-worktree', ['src/app.ts', 'docs'])

    expect(result).toEqual({ ok: true, message: '' })
    expect(mocks.discardChangesForPaths).toHaveBeenCalledWith('/tmp/repo-worktree', ['src/app.ts', 'docs'], undefined)
    expect(mocks.discardRemoteChangesForPaths).not.toHaveBeenCalled()
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: '/tmp/repo',
      query: 'repo-snapshot',
    })
  })

  test('discardRepositoryChanges dispatches remote paths and publishes invalidation on success', async () => {
    const { discardRepositoryChanges } = await import('#/server/modules/repo-write-paths.ts')

    const result = await discardRepositoryChanges('ssh-config://prod/srv/repo', '/srv/repo', ['src/app.ts'])

    expect(result).toEqual({ ok: true, message: '' })
    expect(mocks.discardChangesForPaths).not.toHaveBeenCalled()
    expect(mocks.discardRemoteChangesForPaths).toHaveBeenCalledWith(
      expect.objectContaining({ alias: 'prod', remotePath: '/srv/repo' }),
      '/srv/repo',
      ['src/app.ts'],
      { signal: undefined },
    )
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: 'ssh-config://prod/srv/repo',
      query: 'repo-snapshot',
    })
  })

  test('discardRepositoryChanges publishes invalidation when Git was attempted and failed', async () => {
    mocks.discardChangesForPaths.mockResolvedValueOnce({ ok: false, message: 'fatal: clean failed' })
    const { discardRepositoryChanges } = await import('#/server/modules/repo-write-paths.ts')

    const result = await discardRepositoryChanges('/tmp/repo', '/tmp/repo-worktree', ['src/app.ts'])

    expect(result).toEqual({ ok: false, message: 'fatal: clean failed' })
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: '/tmp/repo',
      query: 'repo-snapshot',
    })
  })

  test('discardRepositoryChanges can defer invalidation for a coordinated batch', async () => {
    const { discardRepositoryChanges } = await import('#/server/modules/repo-write-paths.ts')

    const result = await discardRepositoryChanges(
      '/tmp/repo',
      '/tmp/repo-worktree',
      ['src/app.ts'],
      undefined,
      undefined,
      { publishInvalidation: false },
    )

    expect(result).toEqual({ ok: true, message: '' })
    expect(mocks.discardChangesForPaths).toHaveBeenCalledWith('/tmp/repo-worktree', ['src/app.ts'], undefined)
    expect(mocks.publishRepoQueryInvalidation).not.toHaveBeenCalled()
  })

  test.each([[[]], [['']], [['/absolute/path']], [['../outside']], [['src/../outside']]])(
    'discardRepositoryChanges rejects invalid paths %o before publishing invalidation',
    async (paths) => {
      const { discardRepositoryChanges } = await import('#/server/modules/repo-write-paths.ts')

      const result = await discardRepositoryChanges('/tmp/repo', '/tmp/repo-worktree', paths)

      expect(result).toEqual({ ok: false, message: 'error.invalid-arguments' })
      expect(mocks.discardChangesForPaths).not.toHaveBeenCalled()
      expect(mocks.discardRemoteChangesForPaths).not.toHaveBeenCalled()
      expect(mocks.publishRepoQueryInvalidation).not.toHaveBeenCalled()
    },
  )

  test('mergeRepositoryBranch merges local worktrees through the local backend and publishes invalidation', async () => {
    const { mergeRepositoryBranch } = await import('#/server/modules/repo-write-paths.ts')

    const result = await mergeRepositoryBranch('/tmp/repo', '/tmp/repo-worktree', 'feature/a')

    expect(result).toEqual({ ok: true, message: 'merged local' })
    expect(mocks.mergeBranch).toHaveBeenCalledWith('/tmp/repo-worktree', 'feature/a', undefined)
    expect(mocks.mergeRemoteBranch).not.toHaveBeenCalled()
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: '/tmp/repo',
      query: 'repo-snapshot',
    })
  })

  test('mergeRepositoryBranchSelection merges a local source by its full local ref', async () => {
    const { mergeRepositoryBranchSelection } = await import('#/server/modules/repo-write-paths.ts')

    const result = await mergeRepositoryBranchSelection('/tmp/repo', '/tmp/repo-worktree', {
      kind: 'local',
      branch: 'feature/a',
    })

    expect(result).toEqual({ ok: true, message: 'merged local' })
    expect(mocks.fetchRemote).not.toHaveBeenCalled()
    expect(mocks.mergeBranch).toHaveBeenCalledWith('/tmp/repo-worktree', 'refs/heads/feature/a', undefined)
  })

  test('mergeRepositoryBranchSelection fetches and revalidates a remote source before merging its full ref', async () => {
    const head = 'a'.repeat(40)
    mocks.getLocalRemoteTrackingBranchInfo.mockResolvedValueOnce([
      { remoteRef: 'origin/feature/a', head },
    ])
    const { mergeRepositoryBranchSelection } = await import('#/server/modules/repo-write-paths.ts')

    const result = await mergeRepositoryBranchSelection('/tmp/repo', '/tmp/repo-worktree', {
      kind: 'remote',
      remoteRef: 'origin/feature/a',
    })

    expect(result).toEqual({ ok: true, message: 'merged local' })
    expect(mocks.fetchRemote).toHaveBeenCalledWith('/tmp/repo', 'origin', expect.any(AbortSignal), {
      timeoutMs: 240_000,
      proxyUrl: 'socks5://127.0.0.1:7890',
    })
    expect(mocks.getLocalRemoteTrackingBranchInfo).toHaveBeenCalledWith('/tmp/repo', undefined)
    expect(mocks.mergeBranch).toHaveBeenCalledWith('/tmp/repo-worktree', 'refs/remotes/origin/feature/a', undefined)
    expect(mocks.fetchRemote.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.getLocalRemoteTrackingBranchInfo.mock.invocationCallOrder[0]!,
    )
    expect(mocks.getLocalRemoteTrackingBranchInfo.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.mergeBranch.mock.invocationCallOrder[0]!,
    )
  })

  test('mergeRepositoryBranchSelection stops when exact remote fetch fails', async () => {
    mocks.fetchRemote.mockResolvedValueOnce({ ok: false, message: 'offline' })
    const { mergeRepositoryBranchSelection } = await import('#/server/modules/repo-write-paths.ts')

    await expect(
      mergeRepositoryBranchSelection('/tmp/repo', '/tmp/repo-worktree', {
        kind: 'remote',
        remoteRef: 'origin/feature/a',
      }),
    ).resolves.toEqual({ ok: false, message: 'offline' })

    expect(mocks.getLocalRemoteTrackingBranchInfo).not.toHaveBeenCalled()
    expect(mocks.mergeBranch).not.toHaveBeenCalled()
  })

  test('mergeRepositoryBranchSelection stops when the fetched remote source no longer exists', async () => {
    mocks.getLocalRemoteTrackingBranchInfo.mockResolvedValueOnce([])
    const { mergeRepositoryBranchSelection } = await import('#/server/modules/repo-write-paths.ts')

    await expect(
      mergeRepositoryBranchSelection('/tmp/repo', '/tmp/repo-worktree', {
        kind: 'remote',
        remoteRef: 'origin/feature/a',
      }),
    ).resolves.toEqual({ ok: false, message: 'error.remote-branch-not-found' })

    expect(mocks.mergeBranch).not.toHaveBeenCalled()
  })

  test('mergeRepositoryBranch merges remote worktrees through the SSH backend and publishes invalidation', async () => {
    const { mergeRepositoryBranch } = await import('#/server/modules/repo-write-paths.ts')

    const result = await mergeRepositoryBranch(
      'ssh-config://prod/srv/repo',
      '/data/deer-flow-release-release_20260609',
      'feature/coop_agentrun',
    )

    expect(result).toEqual({ ok: true, message: 'merged remote' })
    expect(mocks.mergeBranch).not.toHaveBeenCalled()
    expect(mocks.mergeRemoteBranch).toHaveBeenCalledWith(
      expect.objectContaining({ alias: 'prod', remotePath: '/srv/repo' }),
      '/data/deer-flow-release-release_20260609',
      'feature/coop_agentrun',
      { signal: undefined },
    )
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: 'ssh-config://prod/srv/repo',
      query: 'repo-snapshot',
    })
  })

  test('checkoutWorktreeBranch switches remote worktrees through the SSH backend and publishes invalidation', async () => {
    const { checkoutWorktreeBranch } = await import('#/server/modules/repo-write-paths.ts')

    const result = await checkoutWorktreeBranch('ssh-config://prod/srv/repo', '/data/deer-flow-bugfix_409', {
      kind: 'localBranch',
      branch: 'feat/agent-task',
    })

    expect(result).toEqual({ ok: true, message: 'ok' })
    expect(mocks.checkoutBranch).not.toHaveBeenCalled()
    expect(mocks.checkoutRemoteBranch).toHaveBeenCalledWith(
      expect.objectContaining({ alias: 'prod', remotePath: '/srv/repo' }),
      'feat/agent-task',
      '/data/deer-flow-bugfix_409',
      { signal: undefined },
    )
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: 'ssh-config://prod/srv/repo',
      query: 'repo-snapshot',
    })
  })

  test('checkoutWorktreeBranch creates and switches to a local tracking branch atomically', async () => {
    const { checkoutWorktreeBranch } = await import('#/server/modules/repo-write-paths.ts')

    const result = await checkoutWorktreeBranch('/tmp/repo', '/tmp/repo-worktree', {
      kind: 'remoteBranch',
      remoteRef: 'origin/feature/remote',
      localBranch: 'feature/remote',
    })

    expect(result).toEqual({ ok: true, message: 'tracked and switched local' })
    expect(mocks.checkoutBranch).not.toHaveBeenCalled()
    expect(mocks.checkoutTrackingBranch).toHaveBeenCalledWith(
      '/tmp/repo-worktree',
      'feature/remote',
      'origin/feature/remote',
      undefined,
    )
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: '/tmp/repo',
      query: 'repo-snapshot',
    })
  })

  test('checkoutWorktreeBranch creates and switches to an SSH tracking branch atomically', async () => {
    const { checkoutWorktreeBranch } = await import('#/server/modules/repo-write-paths.ts')

    const result = await checkoutWorktreeBranch('ssh-config://prod/srv/repo', '/data/repo-feature', {
      kind: 'remoteBranch',
      remoteRef: 'origin/feature/remote',
      localBranch: 'feature/remote',
    })

    expect(result).toEqual({ ok: true, message: 'tracked and switched remote' })
    expect(mocks.checkoutRemoteBranch).not.toHaveBeenCalled()
    expect(mocks.checkoutRemoteTrackingBranch).toHaveBeenCalledWith(
      expect.objectContaining({ alias: 'prod', remotePath: '/srv/repo' }),
      {
        worktreePath: '/data/repo-feature',
        localBranch: 'feature/remote',
        remoteRef: 'origin/feature/remote',
        signal: undefined,
      },
    )
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: 'ssh-config://prod/srv/repo',
      query: 'repo-snapshot',
    })
  })

  test('opens local external terminal-1 with the native login shell', async () => {
    mocks.getServerSettingsPrefs.mockResolvedValue({
      terminalApp: 'ghostty',
    })
    const { openRepositoryTerminal } = await import('#/server/modules/repo-write-paths.ts')

    await expect(
      openRepositoryTerminal({ projectRoot: '/tmp/repo', workingDirectory: '/tmp/repo-worktree' }),
    ).resolves.toEqual({ ok: true, message: '/tmp/repo-worktree' })

    expect(mocks.openInPreferredTerminal).toHaveBeenCalledWith(
      {
        projectRoot: '/tmp/repo',
        workingDirectory: '/tmp/repo-worktree',
        terminalNumber: 1,
      },
      'ghostty',
    )
  })
})
