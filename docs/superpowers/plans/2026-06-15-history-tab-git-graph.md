# History Tab Git Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only `History` tab that shows the selected branch's commit graph and selected commit file statistics.

**Architecture:** Extend the existing repo backend with structured history/detail read methods, expose those reads through repo routes and `repo-client.ts`, then render the feature in a component-local `ProjectHistoryPanel`. Keep history data out of persisted repo/session state.

**Tech Stack:** Bun, Vitest, React, Zustand store selectors, Hono routes, local Git helpers, SSH remote command helpers, TypeScript in Node strip-only mode.

---

## File Map

- Modify `src/shared/git-types.ts`: shared `CommitHistoryEntry`, `CommitFileChange`, `CommitDetail`, and status union.
- Modify `src/web/types.ts`: re-export the new shared history types.
- Modify `src/system/git/parsers.ts`: pure parsers for history output, name-status output, numstat output, and file-change merging.
- Modify `src/system/git/parsers.test.ts`: parser coverage for parents, merge commits, rename/copy records, binary stats, spaces, and unicode.
- Create `src/system/git/history.ts`: local Git command wrapper for branch history and commit detail.
- Create `src/system/git/history.test.ts`: command construction and validation tests for local history reads.
- Modify `src/system/ssh/commands.ts`: remote command variants for structured history, commit metadata, commit name-status, and commit numstat.
- Modify `src/system/ssh/commands.test.ts`: command script tests for the new remote read commands.
- Modify `src/system/ssh/git.ts`: remote wrappers returning `CommitHistoryEntry[]` and `CommitDetail | null`.
- Modify `src/system/ssh/git.test.ts`: remote wrapper behavior and validation tests.
- Modify `src/server/modules/repo-backend.ts`: add backend interface methods and local/remote implementations.
- Modify `src/server/modules/repo-read-paths.ts`: application read functions for history and commit detail.
- Modify `src/server/modules/repo.test.ts`: backend/read-path tests using existing mocks.
- Modify `src/server/routes/repo.ts`: add `/history` and `/commit-detail` routes.
- Create `src/server/routes/repo.test.ts`: route body normalization and fallback tests.
- Modify `src/web/repo-client.ts`: add renderer client functions.
- Modify `src/web/repo-client.test.ts`: client payload tests.
- Create `src/web/components/repo-workspace/history-graph.ts`: lightweight lane calculation and display helpers.
- Create `src/web/components/repo-workspace/history-graph.test.ts`: lane calculation tests.
- Create `src/web/components/repo-workspace/ProjectHistoryPanel.tsx`: main History tab UI.
- Create `src/web/components/repo-workspace/ProjectHistoryPanel.test.tsx`: component load, click, paging, error, and reveal tests.
- Modify `src/web/components/repo-workspace/RepoExplorerPane.tsx`: add the `History` tab and pass file reveal callback.
- Modify `src/web/components/repo-workspace/RepoExplorerPane.test.tsx`: tab integration and reveal tests.
- Modify `src/shared/i18n/en.ts`, `src/shared/i18n/zh.ts`, `src/shared/i18n/ja.ts`, `src/shared/i18n/ko.ts`: compact labels for history UI.
- Modify `src/shared/i18n/dictionaries.test.ts` and `src/shared/i18n/snapshot.test.ts` only when their test output names a concrete snapshot or dictionary assertion that must be updated for the new keys.

## Task 1: Shared Types And Pure Parsers

**Files:**
- Modify: `src/shared/git-types.ts`
- Modify: `src/web/types.ts`
- Modify: `src/system/git/parsers.ts`
- Modify: `src/system/git/parsers.test.ts`

- [ ] **Step 1: Add failing parser tests**

Append these tests to `src/system/git/parsers.test.ts` after the existing `parseLog` block:

```ts
describe('parseCommitHistory', () => {
  test('parses parents for regular and merge commits', () => {
    const out = [
      ['abc123456789', 'abc1234', 'feat: history', 'Alice', '2026-06-15T09:00:00+08:00', 'def456 ghi789'].join(SEP),
      ['def456789012', 'def4567', 'fix: unicode 中文', 'Bob Smith', '2026-06-14T09:00:00+08:00', ''].join(SEP),
    ].join('\n')

    expect(parseCommitHistory(out)).toEqual([
      {
        hash: 'abc123456789',
        shortHash: 'abc1234',
        subject: 'feat: history',
        author: 'Alice',
        date: '2026-06-15T09:00:00+08:00',
        parents: ['def456', 'ghi789'],
      },
      {
        hash: 'def456789012',
        shortHash: 'def4567',
        subject: 'fix: unicode 中文',
        author: 'Bob Smith',
        date: '2026-06-14T09:00:00+08:00',
        parents: [],
      },
    ])
  })
})

describe('parseCommitFileChanges', () => {
  test('merges name-status and numstat records including rename, copy, and binary stats', () => {
    const nameStatus = [
      'A',
      'src/new.ts',
      'M',
      'src/edit.ts',
      'D',
      'src/deleted.ts',
      'R050',
      'src/old name.ts',
      'src/new name.ts',
      'C100',
      'src/source.ts',
      'src/copied.ts',
      'X',
      'assets/logo.png',
    ].join('\0') + '\0'
    const numstat = [
      '10\t0\tsrc/new.ts',
      '2\t3\tsrc/edit.ts',
      '0\t8\tsrc/deleted.ts',
      '1\t1\t',
      'src/old name.ts',
      'src/new name.ts',
      '5\t0\t',
      'src/source.ts',
      'src/copied.ts',
      '-\t-\tassets/logo.png',
    ].join('\0') + '\0'

    expect(parseCommitFileChanges(nameStatus, numstat)).toEqual([
      { path: 'src/new.ts', status: 'added', additions: 10, deletions: 0 },
      { path: 'src/edit.ts', status: 'modified', additions: 2, deletions: 3 },
      { path: 'src/deleted.ts', status: 'deleted', additions: 0, deletions: 8 },
      { path: 'src/new name.ts', oldPath: 'src/old name.ts', status: 'renamed', additions: 1, deletions: 1 },
      { path: 'src/copied.ts', oldPath: 'src/source.ts', status: 'copied', additions: 5, deletions: 0 },
      { path: 'assets/logo.png', status: 'unknown', additions: 0, deletions: 0 },
    ])
  })
})
```

Also update the import line in the same file:

```ts
import {
  FIELD_SEP,
  parseBranches,
  parseCommitFileChanges,
  parseCommitHistory,
  parseLog,
  parseStatus,
  parseWorktrees,
} from '#/system/git/parsers.ts'
```

- [ ] **Step 2: Run parser tests and verify failure**

Run:

```bash
bun run test src/system/git/parsers.test.ts
```

Expected: FAIL because `parseCommitHistory` and `parseCommitFileChanges` are not exported.

- [ ] **Step 3: Add shared types**

Append to `src/shared/git-types.ts` near the existing `LogEntry` interface:

```ts
export interface CommitHistoryEntry {
  hash: string
  shortHash: string
  subject: string
  author: string
  date: string
  parents: string[]
}

export type CommitFileChangeStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'unknown'

export interface CommitFileChange {
  path: string
  status: CommitFileChangeStatus
  additions: number
  deletions: number
  oldPath?: string
}

export interface CommitDetail {
  hash: string
  shortHash: string
  subject: string
  author: string
  date: string
  parents: string[]
  files: CommitFileChange[]
}
```

Update `src/web/types.ts` re-exports:

```ts
export type {
  BranchSnapshotInfo,
  CommitDetail,
  CommitFileChange,
  CommitFileChangeStatus,
  CommitHistoryEntry,
  GitRemoteInfo,
  StatusEntry,
  WorktreeStatus,
  LogEntry,
  ExecResult,
  PullRequestInfo,
  PullRequestFetchMode,
  BrowserRemoteProvider,
} from '#/shared/git-types.ts'
```

- [ ] **Step 4: Implement parser functions**

Update the import in `src/system/git/parsers.ts`:

```ts
import type {
  BranchSnapshotInfo,
  CommitFileChange,
  CommitFileChangeStatus,
  CommitHistoryEntry,
  LogEntry,
  StatusEntry,
  WorktreeInfo,
} from '#/shared/git-types.ts'
```

Add these functions after `parseLog`:

```ts
/**
 * Parse `git log --format=<%H, %h, %s, %an, %aI, %P joined by FIELD_SEP>`.
 */
export function parseCommitHistory(output: string): CommitHistoryEntry[] {
  if (!output) return []
  return output
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(FIELD_SEP)
      const parents = (parts[5] ?? '')
        .split(' ')
        .map((part) => part.trim())
        .filter(Boolean)
      return {
        hash: parts[0] ?? '',
        shortHash: parts[1] ?? '',
        subject: parts[2] ?? '',
        author: parts[3] ?? '',
        date: parts[4] ?? '',
        parents,
      }
    })
}

interface ParsedNameStatusChange {
  path: string
  oldPath?: string
  status: CommitFileChangeStatus
}

interface ParsedNumstatChange {
  path: string
  oldPath?: string
  additions: number
  deletions: number
}

function statusFromNameStatus(code: string): CommitFileChangeStatus {
  const kind = code[0] ?? ''
  if (kind === 'A') return 'added'
  if (kind === 'M') return 'modified'
  if (kind === 'D') return 'deleted'
  if (kind === 'R') return 'renamed'
  if (kind === 'C') return 'copied'
  return 'unknown'
}

function parseNumstatCount(value: string | undefined): number {
  if (!value || value === '-') return 0
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

export function parseCommitNameStatus(output: string): ParsedNameStatusChange[] {
  const records = output.split('\0').filter(Boolean)
  const changes: ParsedNameStatusChange[] = []
  for (let i = 0; i < records.length; i += 1) {
    const code = records[i] ?? ''
    const status = statusFromNameStatus(code)
    if (status === 'renamed' || status === 'copied') {
      const oldPath = records[i + 1] ?? ''
      const newPath = records[i + 2] ?? ''
      i += 2
      if (newPath) changes.push({ path: newPath, oldPath, status })
      continue
    }
    const filePath = records[i + 1] ?? ''
    i += 1
    if (filePath) changes.push({ path: filePath, status })
  }
  return changes
}

export function parseCommitNumstat(output: string): ParsedNumstatChange[] {
  const records = output.split('\0').filter(Boolean)
  const changes: ParsedNumstatChange[] = []
  for (let i = 0; i < records.length; i += 1) {
    const head = records[i] ?? ''
    const parts = head.split('\t')
    const additions = parseNumstatCount(parts[0])
    const deletions = parseNumstatCount(parts[1])
    const inlinePath = parts[2] ?? ''
    if (inlinePath) {
      changes.push({ path: inlinePath, additions, deletions })
      continue
    }
    const oldPath = records[i + 1] ?? ''
    const newPath = records[i + 2] ?? ''
    i += 2
    if (newPath) changes.push({ path: newPath, oldPath, additions, deletions })
  }
  return changes
}

export function parseCommitFileChanges(nameStatusOutput: string, numstatOutput: string): CommitFileChange[] {
  const statusEntries = parseCommitNameStatus(nameStatusOutput)
  const statByPath = new Map(parseCommitNumstat(numstatOutput).map((entry) => [entry.path, entry]))
  return statusEntries.map((entry) => {
    const stats = statByPath.get(entry.path)
    return {
      path: entry.path,
      status: entry.status,
      additions: stats?.additions ?? 0,
      deletions: stats?.deletions ?? 0,
      ...(entry.oldPath ? { oldPath: entry.oldPath } : {}),
    }
  })
}
```

- [ ] **Step 5: Run parser tests and verify pass**

Run:

```bash
bun run test src/system/git/parsers.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit checkpoint after explicit confirmation**

Before committing, ask for explicit confirmation because project instructions treat `git commit` as high risk. After confirmation, run:

```bash
git add src/shared/git-types.ts src/web/types.ts src/system/git/parsers.ts src/system/git/parsers.test.ts
git commit -m "feat(history): add commit history parsers"
```

## Task 2: Local Git History Read Helpers

**Files:**
- Create: `src/system/git/history.ts`
- Create: `src/system/git/history.test.ts`
- Modify: `src/system/git/branches.ts`

- [ ] **Step 1: Add failing local history tests**

Create `src/system/git/history.test.ts`:

```ts
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { FIELD_SEP } from '#/system/git/parsers.ts'

const gitMock = vi.hoisted(() => vi.fn())

vi.mock('#/system/git/helper.ts', () => ({
  git: gitMock,
}))

describe('git history helpers', () => {
  beforeEach(() => {
    gitMock.mockReset()
  })

  test('reads branch history with normalized pagination', async () => {
    gitMock.mockResolvedValue(['abc123456789', 'abc1234', 'feat: history', 'Alice', '2026-06-15T09:00:00+08:00', 'def456'].join(FIELD_SEP))

    const { getCommitHistory } = await import('#/system/git/history.ts')
    await expect(getCommitHistory('/repo', 'feature/history', { limit: 500, skip: -5 })).resolves.toEqual([
      {
        hash: 'abc123456789',
        shortHash: 'abc1234',
        subject: 'feat: history',
        author: 'Alice',
        date: '2026-06-15T09:00:00+08:00',
        parents: ['def456'],
      },
    ])

    expect(gitMock).toHaveBeenCalledWith(
      '/repo',
      [
        'log',
        `--format=${['%H', '%h', '%s', '%an', '%aI', '%P'].join(FIELD_SEP)}`,
        '--max-count=200',
        '--skip=0',
        'feature/history',
        '--',
      ],
      { signal: undefined },
    )
  })

  test('rejects invalid branch before running git', async () => {
    const { getCommitHistory } = await import('#/system/git/history.ts')

    await expect(getCommitHistory('/repo', '-bad', { limit: 100, skip: 0 })).resolves.toEqual([])
    expect(gitMock).not.toHaveBeenCalled()
  })

  test('reads commit detail metadata and file stats', async () => {
    gitMock
      .mockResolvedValueOnce(['abc123456789', 'abc1234', 'feat: detail', 'Alice', '2026-06-15T09:00:00+08:00', 'def456'].join(FIELD_SEP))
      .mockResolvedValueOnce(['M', 'src/app.ts'].join('\0') + '\0')
      .mockResolvedValueOnce('3\t1\tsrc/app.ts\0')

    const { getCommitDetail } = await import('#/system/git/history.ts')
    await expect(getCommitDetail('/repo', 'abc1234')).resolves.toEqual({
      hash: 'abc123456789',
      shortHash: 'abc1234',
      subject: 'feat: detail',
      author: 'Alice',
      date: '2026-06-15T09:00:00+08:00',
      parents: ['def456'],
      files: [{ path: 'src/app.ts', status: 'modified', additions: 3, deletions: 1 }],
    })

    expect(gitMock).toHaveBeenNthCalledWith(
      1,
      '/repo',
      ['show', '-s', `--format=${['%H', '%h', '%s', '%an', '%aI', '%P'].join(FIELD_SEP)}`, 'abc1234'],
      { signal: undefined },
    )
    expect(gitMock).toHaveBeenNthCalledWith(
      2,
      '/repo',
      ['diff-tree', '--no-commit-id', '--name-status', '-r', '-M', '-C', '--root', '-z', 'abc1234'],
      { signal: undefined },
    )
    expect(gitMock).toHaveBeenNthCalledWith(
      3,
      '/repo',
      ['diff-tree', '--no-commit-id', '--numstat', '-r', '-M', '-C', '--root', '-z', 'abc1234'],
      { signal: undefined },
    )
  })

  test('rejects invalid commit before running git', async () => {
    const { getCommitDetail } = await import('#/system/git/history.ts')

    await expect(getCommitDetail('/repo', 'not-a-hash')).resolves.toBeNull()
    expect(gitMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run local history tests and verify failure**

Run:

```bash
bun run test src/system/git/history.test.ts
```

Expected: FAIL because `src/system/git/history.ts` does not exist.

- [ ] **Step 3: Implement local helper module**

Create `src/system/git/history.ts`:

```ts
import { git } from '#/system/git/helper.ts'
import { FIELD_SEP, parseCommitFileChanges, parseCommitHistory } from '#/system/git/parsers.ts'
import { GIT_HASH_RE, type CommitDetail, type CommitHistoryEntry } from '#/shared/git-types.ts'
import { isSafeBranchName } from '#/shared/refnames.ts'

export interface CommitHistoryPageInput {
  limit: number
  skip: number
}

export function normalizeCommitHistoryPage(input: CommitHistoryPageInput): CommitHistoryPageInput {
  return {
    limit: Math.max(1, Math.min(200, Math.floor(input.limit))),
    skip: Math.max(0, Math.floor(input.skip)),
  }
}

function commitFormat(): string {
  return ['%H', '%h', '%s', '%an', '%aI', '%P'].join(FIELD_SEP)
}

export async function getCommitHistory(
  cwd: string,
  branch: string,
  input: CommitHistoryPageInput,
  options?: { signal?: AbortSignal },
): Promise<CommitHistoryEntry[]> {
  if (!isSafeBranchName(branch)) return []
  const page = normalizeCommitHistoryPage(input)
  try {
    const output = await git(
      cwd,
      ['log', `--format=${commitFormat()}`, `--max-count=${page.limit}`, `--skip=${page.skip}`, branch, '--'],
      { signal: options?.signal },
    )
    return options?.signal?.aborted ? [] : parseCommitHistory(output)
  } catch {
    return []
  }
}

export async function getCommitDetail(
  cwd: string,
  commit: string,
  options?: { signal?: AbortSignal },
): Promise<CommitDetail | null> {
  if (!GIT_HASH_RE.test(commit)) return null
  try {
    const [metadata, nameStatus, numstat] = await Promise.all([
      git(cwd, ['show', '-s', `--format=${commitFormat()}`, commit], { signal: options?.signal }),
      git(cwd, ['diff-tree', '--no-commit-id', '--name-status', '-r', '-M', '-C', '--root', '-z', commit], {
        signal: options?.signal,
      }),
      git(cwd, ['diff-tree', '--no-commit-id', '--numstat', '-r', '-M', '-C', '--root', '-z', commit], {
        signal: options?.signal,
      }),
    ])
    if (options?.signal?.aborted) return null
    const [entry] = parseCommitHistory(metadata)
    if (!entry) return null
    return { ...entry, files: parseCommitFileChanges(nameStatus, numstat) }
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Re-export or replace old log helper only where needed**

Keep `getLog()` in `src/system/git/branches.ts` unchanged for compatibility. Do not route the new feature through `LogEntry`; import `getCommitHistory` and `getCommitDetail` from the new `history.ts` module in backend code in later tasks.

- [ ] **Step 5: Run local history tests and verify pass**

Run:

```bash
bun run test src/system/git/history.test.ts src/system/git/parsers.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit checkpoint after explicit confirmation**

Before committing, ask for explicit confirmation. After confirmation, run:

```bash
git add src/system/git/history.ts src/system/git/history.test.ts
git commit -m "feat(history): add local git history reads"
```

## Task 3: SSH Remote History Reads

**Files:**
- Modify: `src/system/ssh/commands.ts`
- Modify: `src/system/ssh/commands.test.ts`
- Modify: `src/system/ssh/git.ts`
- Modify: `src/system/ssh/git.test.ts`

- [ ] **Step 1: Add failing remote command tests**

Append tests to `src/system/ssh/commands.test.ts`:

```ts
test('builds structured git history command', () => {
  const invocation = buildRemoteCommandInvocation(TARGET, {
    type: 'gitHistory',
    path: '/srv/repo',
    branch: 'feature/history',
    limit: 500,
    skip: -1,
  })

  expect(invocation.script).toContain("git -C '/srv/repo' log")
  expect(invocation.script).toContain('--max-count=200')
  expect(invocation.script).toContain('--skip=0')
  expect(invocation.script).toContain("'feature/history'")
  expect(invocation.script).toContain('%P')
})

test('builds structured git commit detail commands', () => {
  expect(
    buildRemoteCommandInvocation(TARGET, {
      type: 'gitCommitMetadata',
      path: '/srv/repo',
      commit: 'abc1234',
    }).script,
  ).toContain("git -C '/srv/repo' show -s")

  expect(
    buildRemoteCommandInvocation(TARGET, {
      type: 'gitCommitNameStatus',
      path: '/srv/repo',
      commit: 'abc1234',
    }).script,
  ).toContain('diff-tree --no-commit-id --name-status -r -M -C --root -z')

  expect(
    buildRemoteCommandInvocation(TARGET, {
      type: 'gitCommitNumstat',
      path: '/srv/repo',
      commit: 'abc1234',
    }).script,
  ).toContain('diff-tree --no-commit-id --numstat -r -M -C --root -z')
})
```

- [ ] **Step 2: Add failing remote wrapper tests**

Update imports in `src/system/ssh/git.test.ts`:

```ts
import {
  checkoutRemoteBranch,
  commitRemoteChanges,
  createRemoteBranch,
  createRemoteTrackingBranch,
  createRemoteWorktree,
  deleteRemoteBranch,
  deleteRemoteFileTreeEntries,
  getRemoteBrowserUrl,
  getRemoteCommitDetail,
  getRemoteHistory,
  getRemoteSnapshot,
  inventoryRemoteFileTransfer,
  listRemoteFileTreeDirectory,
  mergeRemoteBranch,
  pullRemoteBranch,
  fetchRemoteRepository,
  pushRemoteBranch,
  readRemoteFileBase64,
  remoteExecResult,
  renameRemoteFileTreeEntry,
  removeRemoteWorktree,
  writeRemoteFileBase64,
} from '#/system/ssh/git.ts'
```

Add tests inside `describe('remote git helpers', () => { ... })`:

```ts
test('reads structured remote history', async () => {
  const run = vi.fn(async () =>
    okRemoteResult('abc123456789\x1fabc1234\x1ffeat: remote history\x1fAlice\x1f2026-06-15T09:00:00+08:00\x1fdef456'),
  )

  await expect(getRemoteHistory(TARGET, 'feature/history', { limit: 100, skip: 20 }, { run: run as any })).resolves.toEqual([
    {
      hash: 'abc123456789',
      shortHash: 'abc1234',
      subject: 'feat: remote history',
      author: 'Alice',
      date: '2026-06-15T09:00:00+08:00',
      parents: ['def456'],
    },
  ])
  expect(run).toHaveBeenCalledWith(
    { type: 'gitHistory', path: '/srv/repo', branch: 'feature/history', limit: 100, skip: 20 },
    TARGET,
    { signal: undefined },
  )
})

test('reads structured remote commit detail', async () => {
  const run = vi
    .fn()
    .mockResolvedValueOnce(okRemoteResult('abc123456789\x1fabc1234\x1ffeat: detail\x1fAlice\x1f2026-06-15T09:00:00+08:00\x1fdef456'))
    .mockResolvedValueOnce(okRemoteResult('M\0src/app.ts\0'))
    .mockResolvedValueOnce(okRemoteResult('4\t2\tsrc/app.ts\0'))

  await expect(getRemoteCommitDetail(TARGET, 'abc1234', { run: run as any })).resolves.toEqual({
    hash: 'abc123456789',
    shortHash: 'abc1234',
    subject: 'feat: detail',
    author: 'Alice',
    date: '2026-06-15T09:00:00+08:00',
    parents: ['def456'],
    files: [{ path: 'src/app.ts', status: 'modified', additions: 4, deletions: 2 }],
  })
})
```

- [ ] **Step 3: Run remote tests and verify failure**

Run:

```bash
bun run test src/system/ssh/commands.test.ts src/system/ssh/git.test.ts
```

Expected: FAIL because `gitHistory`, `gitCommitMetadata`, `gitCommitNameStatus`, `gitCommitNumstat`, `getRemoteHistory`, and `getRemoteCommitDetail` are not implemented.

- [ ] **Step 4: Implement remote command variants**

Update `RemoteCommandKind` in `src/system/ssh/commands.ts`:

```ts
  | { type: 'gitHistory'; path: string; branch: string; limit?: number; skip?: number }
  | { type: 'gitCommitMetadata'; path: string; commit: string }
  | { type: 'gitCommitNameStatus'; path: string; commit: string }
  | { type: 'gitCommitNumstat'; path: string; commit: string }
```

Add switch cases near the existing `gitLog` case:

```ts
    case 'gitHistory': {
      const limit = Math.max(1, Math.min(200, Math.floor(command.limit ?? 100)))
      const skip = Math.max(0, Math.floor(command.skip ?? 0))
      const format = ['%H', '%h', '%s', '%an', '%aI', '%P'].join(FIELD_SEP)
      return [
        `git -C ${shellQuote(command.path)} log`,
        `--format=${shellQuote(format)}`,
        `--max-count=${limit}`,
        `--skip=${skip}`,
        shellQuote(command.branch),
        '--',
      ].join(' ')
    }
    case 'gitCommitMetadata': {
      const format = ['%H', '%h', '%s', '%an', '%aI', '%P'].join(FIELD_SEP)
      return `git -C ${shellQuote(command.path)} show -s --format=${shellQuote(format)} ${shellQuote(command.commit)}`
    }
    case 'gitCommitNameStatus':
      return `git -C ${shellQuote(command.path)} diff-tree --no-commit-id --name-status -r -M -C --root -z ${shellQuote(command.commit)}`
    case 'gitCommitNumstat':
      return `git -C ${shellQuote(command.path)} diff-tree --no-commit-id --numstat -r -M -C --root -z ${shellQuote(command.commit)}`
```

- [ ] **Step 5: Implement remote wrappers**

Update imports in `src/system/ssh/git.ts`:

```ts
import { parseBranches, parseCommitFileChanges, parseCommitHistory, parseLog, parseStatus, parseWorktrees } from '#/system/git/parsers.ts'
import { GIT_HASH_RE, type BranchSnapshotInfo, type CommitDetail, type CommitHistoryEntry, type ExecResult, type GitRemoteInfo, type LogEntry, type RepoRemoteInfo, type WorktreeInfo, type WorktreeStatus } from '#/shared/git-types.ts'
```

Add functions after `getRemoteLog`:

```ts
export async function getRemoteHistory(
  target: RemoteRepoTarget,
  branch: string,
  input: { limit: number; skip: number },
  options: { signal?: AbortSignal; run?: RemoteGitRunner } = {},
): Promise<CommitHistoryEntry[]> {
  if (!isSafeBranchName(branch)) return []
  const run: RemoteGitRunner = options.run ?? ((command, t, runOptions) => runRemoteCommand(t, command, runOptions))
  const result = await run({ type: 'gitHistory', path: target.remotePath, branch, limit: input.limit, skip: input.skip }, target, {
    signal: options.signal,
  })
  if (!result.ok || options.signal?.aborted) return []
  return parseCommitHistory(result.stdout)
}

export async function getRemoteCommitDetail(
  target: RemoteRepoTarget,
  commit: string,
  options: { signal?: AbortSignal; run?: RemoteGitRunner } = {},
): Promise<CommitDetail | null> {
  if (!GIT_HASH_RE.test(commit)) return null
  const run: RemoteGitRunner = options.run ?? ((command, t, runOptions) => runRemoteCommand(t, command, runOptions))
  const [metadata, nameStatus, numstat] = await Promise.all([
    run({ type: 'gitCommitMetadata', path: target.remotePath, commit }, target, { signal: options.signal }),
    run({ type: 'gitCommitNameStatus', path: target.remotePath, commit }, target, { signal: options.signal }),
    run({ type: 'gitCommitNumstat', path: target.remotePath, commit }, target, { signal: options.signal }),
  ])
  if (options.signal?.aborted || !metadata.ok || !nameStatus.ok || !numstat.ok) return null
  const [entry] = parseCommitHistory(metadata.stdout)
  if (!entry) return null
  return { ...entry, files: parseCommitFileChanges(nameStatus.stdout, numstat.stdout) }
}
```

- [ ] **Step 6: Run remote tests and verify pass**

Run:

```bash
bun run test src/system/ssh/commands.test.ts src/system/ssh/git.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit checkpoint after explicit confirmation**

Before committing, ask for explicit confirmation. After confirmation, run:

```bash
git add src/system/ssh/commands.ts src/system/ssh/commands.test.ts src/system/ssh/git.ts src/system/ssh/git.test.ts
git commit -m "feat(history): add remote git history reads"
```

## Task 4: Backend, Routes, And Renderer Client

**Files:**
- Modify: `src/server/modules/repo-backend.ts`
- Modify: `src/server/modules/repo-read-paths.ts`
- Modify: `src/server/modules/repo.test.ts`
- Modify: `src/server/routes/repo.ts`
- Create: `src/server/routes/repo.test.ts`
- Modify: `src/web/repo-client.ts`
- Modify: `src/web/repo-client.test.ts`

- [ ] **Step 1: Add failing backend tests**

Update `src/server/modules/repo.test.ts` mocks:

```ts
  getCommitDetail: vi.fn(),
  getCommitHistory: vi.fn(),
  getRemoteCommitDetail: vi.fn(),
  getRemoteHistory: vi.fn(),
```

Add mock exports:

```ts
vi.mock('#/system/git/history.ts', () => ({
  getCommitDetail: mocks.getCommitDetail,
  getCommitHistory: mocks.getCommitHistory,
}))
```

Add to the existing `vi.mock('#/system/ssh/git.ts', ...)` block:

```ts
  getRemoteCommitDetail: mocks.getRemoteCommitDetail,
  getRemoteHistory: mocks.getRemoteHistory,
```

Add defaults in `beforeEach`:

```ts
  mocks.getCommitHistory.mockResolvedValue([{ hash: 'abc123456789', shortHash: 'abc1234', subject: 'feat: local', author: 'Alice', date: '2026-06-15T09:00:00+08:00', parents: [] }])
  mocks.getCommitDetail.mockResolvedValue({ hash: 'abc123456789', shortHash: 'abc1234', subject: 'feat: local', author: 'Alice', date: '2026-06-15T09:00:00+08:00', parents: [], files: [] })
  mocks.getRemoteHistory.mockResolvedValue([{ hash: 'def123456789', shortHash: 'def1234', subject: 'feat: remote', author: 'Bob', date: '2026-06-15T09:00:00+08:00', parents: [] }])
  mocks.getRemoteCommitDetail.mockResolvedValue({ hash: 'def123456789', shortHash: 'def1234', subject: 'feat: remote', author: 'Bob', date: '2026-06-15T09:00:00+08:00', parents: [], files: [] })
```

Add tests:

```ts
test('getRepositoryHistory delegates to local backend history reads', async () => {
  const { getRepositoryHistory } = await import('#/server/modules/repo-read-paths.ts')

  await expect(getRepositoryHistory('/tmp/repo', 'feature/history', { limit: 100, skip: 0 })).resolves.toEqual([
    { hash: 'abc123456789', shortHash: 'abc1234', subject: 'feat: local', author: 'Alice', date: '2026-06-15T09:00:00+08:00', parents: [] },
  ])
  expect(mocks.getCommitHistory).toHaveBeenCalledWith('/tmp/repo', 'feature/history', { limit: 100, skip: 0 }, { signal: undefined })
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
```

- [ ] **Step 2: Add failing route tests**

Create `src/server/routes/repo.test.ts`:

```ts
import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getRepositoryHistory: vi.fn(),
  getRepositoryCommitDetail: vi.fn(),
}))

vi.mock('#/server/modules/repo-read-paths.ts', () => ({
  generateRepositoryCommitMessage: vi.fn(),
  getCommitMessageProviders: vi.fn(async () => ({ codex: false, claude: false })),
  getRepositoryCommitDetail: mocks.getRepositoryCommitDetail,
  getRepositoryFileTree: vi.fn(),
  getRepositoryHistory: mocks.getRepositoryHistory,
  getRepositoryPatch: vi.fn(),
  getRepositoryPullRequests: vi.fn(),
  getRepositorySnapshot: vi.fn(),
  getRepositoryStatus: vi.fn(),
  probeRepository: vi.fn(),
}))

vi.mock('#/server/modules/repo-write-paths.ts', () => ({
  abortCloneOperation: vi.fn(),
  abortRepositoryOperation: vi.fn(),
  checkoutRepositoryBranch: vi.fn(),
  checkoutWorktreeBranch: vi.fn(),
  cloneRepository: vi.fn(),
  commitRepositoryChanges: vi.fn(),
  createRepositoryBranch: vi.fn(),
  createRepositoryWorktree: vi.fn(),
  deleteRepositoryBranch: vi.fn(),
  deleteRepositoryFileTreeEntries: vi.fn(),
  fetchRepository: vi.fn(),
  getRepositoryRemoteBranches: vi.fn(),
  mergeRepositoryBranch: vi.fn(),
  openRepositoryEditor: vi.fn(),
  openRepositoryRemote: vi.fn(),
  openRepositoryTerminal: vi.fn(),
  pullRepositoryBranch: vi.fn(),
  pushRepositoryBranch: vi.fn(),
  renameRepositoryFileTreeEntry: vi.fn(),
  removeRepositoryWorktree: vi.fn(),
  resetRepositoryHard: vi.fn(),
  trackRepositoryRemoteBranch: vi.fn(),
}))

vi.mock('#/server/modules/repo-file-transfer.ts', () => ({
  transferRepositoryFiles: vi.fn(),
}))

vi.mock('#/server/modules/background-sync.ts', () => ({
  getBackgroundSyncRepos: vi.fn(() => []),
  setBackgroundSyncRepos: vi.fn(),
}))

vi.mock('#/server/modules/settings-source.ts', () => ({
  getServerFetchIntervalSec: vi.fn(async () => 0),
}))

describe('repo routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getRepositoryHistory.mockResolvedValue([{ hash: 'abc123456789', shortHash: 'abc1234', subject: 'feat: route', author: 'Alice', date: '2026-06-15T09:00:00+08:00', parents: [] }])
    mocks.getRepositoryCommitDetail.mockResolvedValue({ hash: 'abc123456789', shortHash: 'abc1234', subject: 'feat: route', author: 'Alice', date: '2026-06-15T09:00:00+08:00', parents: [], files: [] })
  })

  test('serves repository history with normalized body values', async () => {
    const { createRepoRoutes } = await import('#/server/routes/repo.ts')
    const app = createRepoRoutes()

    const response = await app.request('http://localhost/history', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ repoId: '/repo', branch: 'feature/history', limit: 500, skip: -2 }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual([
      { hash: 'abc123456789', shortHash: 'abc1234', subject: 'feat: route', author: 'Alice', date: '2026-06-15T09:00:00+08:00', parents: [] },
    ])
    expect(mocks.getRepositoryHistory).toHaveBeenCalledWith('/repo', 'feature/history', { limit: 200, skip: 0 }, expect.any(AbortSignal))
  })

  test('serves repository commit detail', async () => {
    const { createRepoRoutes } = await import('#/server/routes/repo.ts')
    const app = createRepoRoutes()

    const response = await app.request('http://localhost/commit-detail', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ repoId: '/repo', commit: 'abc1234' }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      hash: 'abc123456789',
      shortHash: 'abc1234',
      subject: 'feat: route',
      author: 'Alice',
      date: '2026-06-15T09:00:00+08:00',
      parents: [],
      files: [],
    })
    expect(mocks.getRepositoryCommitDetail).toHaveBeenCalledWith('/repo', 'abc1234', expect.any(AbortSignal))
  })
})
```

- [ ] **Step 3: Add failing client tests**

Append to `src/web/repo-client.test.ts`:

```ts
  test('requests repository history and commit detail', async () => {
    installWebBootstrap(webBootstrap({ initialServer: { url: 'http://127.0.0.1:32100/', secret: 'secret' } }))
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ hash: 'abc123456789', shortHash: 'abc1234', subject: 'feat: history', author: 'Alice', date: '2026-06-15T09:00:00+08:00', parents: [] }],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ hash: 'abc123456789', shortHash: 'abc1234', subject: 'feat: history', author: 'Alice', date: '2026-06-15T09:00:00+08:00', parents: [], files: [] }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const { getRepositoryCommitDetail, getRepositoryHistory } = await import('#/web/repo-client.ts')
    await expect(getRepositoryHistory('/repo', 'feature/history', { limit: 100, skip: 0 })).resolves.toEqual([
      { hash: 'abc123456789', shortHash: 'abc1234', subject: 'feat: history', author: 'Alice', date: '2026-06-15T09:00:00+08:00', parents: [] },
    ])
    await expect(getRepositoryCommitDetail('/repo', 'abc1234')).resolves.toEqual({
      hash: 'abc123456789',
      shortHash: 'abc1234',
      subject: 'feat: history',
      author: 'Alice',
      date: '2026-06-15T09:00:00+08:00',
      parents: [],
      files: [],
    })
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://127.0.0.1:32100/api/repo/history',
      expect.objectContaining({ body: JSON.stringify({ repoId: '/repo', branch: 'feature/history', limit: 100, skip: 0 }) }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:32100/api/repo/commit-detail',
      expect.objectContaining({ body: JSON.stringify({ repoId: '/repo', commit: 'abc1234' }) }),
    )
  })
```

- [ ] **Step 4: Run backend/client tests and verify failure**

Run:

```bash
bun run test src/server/modules/repo.test.ts src/server/routes/repo.test.ts src/web/repo-client.test.ts
```

Expected: FAIL because backend interface methods, route handlers, and client functions are missing.

- [ ] **Step 5: Implement backend and read paths**

Update imports in `src/server/modules/repo-backend.ts`:

```ts
import { getCommitDetail, getCommitHistory } from '#/system/git/history.ts'
import { type BranchSnapshotInfo, type CommitDetail, type CommitHistoryEntry, type ExecResult, type PullRequestFetchMode, type PullRequestInfo, type WorktreeStatus } from '#/shared/git-types.ts'
```

Add to `RepoBackend`:

```ts
  getHistory(branch: string, input: { limit: number; skip: number }, signal?: AbortSignal): Promise<CommitHistoryEntry[]>
  getCommitDetail(commit: string, signal?: AbortSignal): Promise<CommitDetail | null>
```

Add local backend methods:

```ts
    async getHistory(branch, input, signal) {
      if (!isValidCwd(repoId)) return []
      const available = await probeGitRepository(repoId)
      if (!available.ok) throw new Error(available.message)
      return await getCommitHistory(repoId, branch, input, { signal })
    },
    async getCommitDetail(commit, signal) {
      if (!isValidCwd(repoId)) return null
      const available = await probeGitRepository(repoId)
      if (!available.ok) throw new Error(available.message)
      return await getCommitDetail(repoId, commit, { signal })
    },
```

Add remote backend methods:

```ts
    async getHistory(branch, input, signal) {
      return await getRemoteHistory(target, branch, input, { signal })
    },
    async getCommitDetail(commit, signal) {
      return await getRemoteCommitDetail(target, commit, { signal })
    },
```

Update imports for remote functions:

```ts
  getRemoteCommitDetail,
  getRemoteHistory,
```

Add to `src/server/modules/repo-read-paths.ts`:

```ts
import type { CommitDetail, CommitHistoryEntry } from '#/shared/git-types.ts'

export async function getRepositoryHistory(
  cwd: string,
  branch: string,
  input: { limit: number; skip: number },
  signal?: AbortSignal,
): Promise<CommitHistoryEntry[]> {
  return signal?.aborted ? [] : await runWithRepoBackend(cwd, async (backend) => await backend.getHistory(branch, input, signal))
}

export async function getRepositoryCommitDetail(
  cwd: string,
  commit: string,
  signal?: AbortSignal,
): Promise<CommitDetail | null> {
  return signal?.aborted ? null : await runWithRepoBackend(cwd, async (backend) => await backend.getCommitDetail(commit, signal))
}
```

- [ ] **Step 6: Implement routes**

Update `src/server/routes/repo.ts` imports:

```ts
  getRepositoryCommitDetail,
  getRepositoryHistory,
```

Add helper near `jsonOr`:

```ts
  function boundedInt(value: unknown, fallback: number, min: number, max: number): number {
    const parsed = typeof value === 'number' ? Math.floor(value) : Number.NaN
    if (!Number.isFinite(parsed)) return fallback
    return Math.max(min, Math.min(max, parsed))
  }
```

Add routes after `/status`:

```ts
  app.post('/history', async (c) => {
    const body = await c.req.json().catch(() => null)
    const repoId = typeof body?.repoId === 'string' ? body.repoId : ''
    const branch = typeof body?.branch === 'string' ? body.branch : ''
    const limit = boundedInt(body?.limit, 100, 1, 200)
    const skip = boundedInt(body?.skip, 0, 0, Number.MAX_SAFE_INTEGER)
    return c.json(await jsonOr(() => getRepositoryHistory(repoId, branch, { limit, skip }, c.req.raw.signal), [], 'history'))
  })
  app.post('/commit-detail', async (c) => {
    const body = await c.req.json().catch(() => null)
    const repoId = typeof body?.repoId === 'string' ? body.repoId : ''
    const commit = typeof body?.commit === 'string' ? body.commit : ''
    return c.json(await jsonOr(() => getRepositoryCommitDetail(repoId, commit, c.req.raw.signal), null, 'commit-detail'))
  })
```

- [ ] **Step 7: Implement renderer client**

Update import in `src/web/repo-client.ts`:

```ts
import type { CommitDetail, CommitHistoryEntry, ExecResult, PullRequestFetchMode, WorktreeStatus } from '#/shared/git-types.ts'
```

Add functions near `getRepositoryStatus`:

```ts
export async function getRepositoryHistory(
  repoId: string,
  branch: string,
  input: { limit: number; skip: number },
  signal?: AbortSignal,
): Promise<CommitHistoryEntry[]> {
  return await postServerJson('/api/repo/history', { repoId, branch, limit: input.limit, skip: input.skip }, { signal })
}

export async function getRepositoryCommitDetail(
  repoId: string,
  commit: string,
  signal?: AbortSignal,
): Promise<CommitDetail | null> {
  return await postServerJson('/api/repo/commit-detail', { repoId, commit }, { signal })
}
```

- [ ] **Step 8: Run backend/client tests and verify pass**

Run:

```bash
bun run test src/server/modules/repo.test.ts src/server/routes/repo.test.ts src/web/repo-client.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit checkpoint after explicit confirmation**

Before committing, ask for explicit confirmation. After confirmation, run:

```bash
git add src/server/modules/repo-backend.ts src/server/modules/repo-read-paths.ts src/server/modules/repo.test.ts src/server/routes/repo.ts src/server/routes/repo.test.ts src/web/repo-client.ts src/web/repo-client.test.ts
git commit -m "feat(history): expose repository history API"
```

## Task 5: Graph Lane Model

**Files:**
- Create: `src/web/components/repo-workspace/history-graph.ts`
- Create: `src/web/components/repo-workspace/history-graph.test.ts`

- [ ] **Step 1: Add failing graph model tests**

Create `src/web/components/repo-workspace/history-graph.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { buildHistoryGraphRows, commitFileStatusTone, formatHistoryDate } from '#/web/components/repo-workspace/history-graph.ts'
import type { CommitHistoryEntry } from '#/web/types.ts'

function entry(hash: string, parents: string[] = []): CommitHistoryEntry {
  return {
    hash,
    shortHash: hash.slice(0, 7),
    subject: `commit ${hash}`,
    author: 'Alice',
    date: '2026-06-15T09:00:00+08:00',
    parents,
  }
}

describe('history graph model', () => {
  test('keeps a straight line for single-parent history', () => {
    expect(buildHistoryGraphRows([entry('c3', ['c2']), entry('c2', ['c1']), entry('c1')])).toEqual([
      { commit: entry('c3', ['c2']), lane: 0, laneCount: 1, parentLanes: [0] },
      { commit: entry('c2', ['c1']), lane: 0, laneCount: 1, parentLanes: [0] },
      { commit: entry('c1'), lane: 0, laneCount: 1, parentLanes: [] },
    ])
  })

  test('adds lanes for merge parents', () => {
    const rows = buildHistoryGraphRows([entry('m1', ['a1', 'b1']), entry('a1'), entry('b1')])

    expect(rows[0]).toEqual({ commit: entry('m1', ['a1', 'b1']), lane: 0, laneCount: 2, parentLanes: [0, 1] })
    expect(rows[1]?.lane).toBe(0)
    expect(rows[2]?.lane).toBe(1)
  })

  test('maps file status tones', () => {
    expect(commitFileStatusTone('added')).toBe('text-success')
    expect(commitFileStatusTone('deleted')).toBe('text-danger')
    expect(commitFileStatusTone('modified')).toBe('text-warning')
    expect(commitFileStatusTone('unknown')).toBe('text-muted-foreground')
  })

  test('formats dates defensively', () => {
    expect(formatHistoryDate('2026-06-15T09:00:00+08:00')).toContain('2026')
    expect(formatHistoryDate('not-a-date')).toBe('not-a-date')
  })
})
```

- [ ] **Step 2: Run graph model tests and verify failure**

Run:

```bash
bun run test src/web/components/repo-workspace/history-graph.test.ts
```

Expected: FAIL because `history-graph.ts` does not exist.

- [ ] **Step 3: Implement graph model**

Create `src/web/components/repo-workspace/history-graph.ts`:

```ts
import type { CommitFileChangeStatus, CommitHistoryEntry } from '#/web/types.ts'

export interface HistoryGraphRow {
  commit: CommitHistoryEntry
  lane: number
  laneCount: number
  parentLanes: number[]
}

export function buildHistoryGraphRows(commits: CommitHistoryEntry[]): HistoryGraphRow[] {
  const active: string[] = []
  const rows: HistoryGraphRow[] = []

  for (const commit of commits) {
    let lane = active.indexOf(commit.hash)
    if (lane === -1) {
      lane = active.length
      active.push(commit.hash)
    }

    const parentLanes = commit.parents.map((parent, index) => lane + index)
    active.splice(lane, 1, ...commit.parents)

    rows.push({
      commit,
      lane,
      laneCount: Math.max(1, active.length, lane + 1),
      parentLanes,
    })
  }

  return rows
}

export function commitFileStatusLabel(status: CommitFileChangeStatus): string {
  switch (status) {
    case 'added':
      return 'A'
    case 'modified':
      return 'M'
    case 'deleted':
      return 'D'
    case 'renamed':
      return 'R'
    case 'copied':
      return 'C'
    case 'unknown':
      return '?'
  }
  const exhaustive: never = status
  return exhaustive
}

export function commitFileStatusTone(status: CommitFileChangeStatus): string {
  switch (status) {
    case 'added':
    case 'copied':
      return 'text-success'
    case 'deleted':
      return 'text-danger'
    case 'modified':
    case 'renamed':
      return 'text-warning'
    case 'unknown':
      return 'text-muted-foreground'
  }
  const exhaustive: never = status
  return exhaustive
}

export function formatHistoryDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
```

- [ ] **Step 4: Run graph model tests and verify pass**

Run:

```bash
bun run test src/web/components/repo-workspace/history-graph.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit checkpoint after explicit confirmation**

Before committing, ask for explicit confirmation. After confirmation, run:

```bash
git add src/web/components/repo-workspace/history-graph.ts src/web/components/repo-workspace/history-graph.test.ts
git commit -m "feat(history): add commit graph model"
```

## Task 6: ProjectHistoryPanel Component

**Files:**
- Create: `src/web/components/repo-workspace/ProjectHistoryPanel.tsx`
- Create: `src/web/components/repo-workspace/ProjectHistoryPanel.test.tsx`

- [ ] **Step 1: Add failing component tests**

Create `src/web/components/repo-workspace/ProjectHistoryPanel.test.tsx`:

```tsx
// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ProjectHistoryPanel } from '#/web/components/repo-workspace/ProjectHistoryPanel.tsx'
import { createRepoBranch, resetReposStore, seedRepoState } from '#/web/stores/repos/test-utils.ts'

const REPO_ID = '/tmp/gbl-history-repo'
const WORKTREE_PATH = '/tmp/gbl-history-repo'

const mocks = vi.hoisted(() => ({
  getRepositoryCommitDetail: vi.fn(),
  getRepositoryHistory: vi.fn(),
}))

vi.mock('#/web/repo-client.ts', () => ({
  getRepositoryCommitDetail: mocks.getRepositoryCommitDetail,
  getRepositoryHistory: mocks.getRepositoryHistory,
}))

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string) => key,
}))

let container: HTMLDivElement | null = null
let root: Root | null = null
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  resetReposStore()
  mocks.getRepositoryHistory.mockResolvedValue([
    { hash: 'abc123456789', shortHash: 'abc1234', subject: 'feat: first', author: 'Alice', date: '2026-06-15T09:00:00+08:00', parents: ['def456'] },
    { hash: 'def456789012', shortHash: 'def4567', subject: 'fix: second', author: 'Bob', date: '2026-06-14T09:00:00+08:00', parents: [] },
  ])
  mocks.getRepositoryCommitDetail.mockResolvedValue({
    hash: 'abc123456789',
    shortHash: 'abc1234',
    subject: 'feat: first',
    author: 'Alice',
    date: '2026-06-15T09:00:00+08:00',
    parents: ['def456'],
    files: [{ path: 'src/app.ts', status: 'modified', additions: 3, deletions: 1 }],
  })
  seedRepoState({
    id: REPO_ID,
    branches: [createRepoBranch('feature/history', { worktree: { path: WORKTREE_PATH } })],
    selectedBranch: 'feature/history',
  })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => {
    root?.unmount()
  })
  container?.remove()
  root = null
  container = null
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

describe('ProjectHistoryPanel', () => {
  test('loads selected branch history and first commit detail', async () => {
    await act(async () => {
      root!.render(<ProjectHistoryPanel repoId={REPO_ID} onRevealPath={vi.fn()} />)
    })
    await act(async () => {})

    expect(mocks.getRepositoryHistory).toHaveBeenCalledWith(REPO_ID, 'feature/history', { limit: 100, skip: 0 }, expect.any(AbortSignal))
    expect(mocks.getRepositoryCommitDetail).toHaveBeenCalledWith(REPO_ID, 'abc123456789', expect.any(AbortSignal))
    expect(container?.textContent).toContain('feat: first')
    expect(container?.textContent).toContain('abc123456789')
    expect(container?.textContent).toContain('src/app.ts')
    expect(container?.textContent).toContain('+3')
    expect(container?.textContent).toContain('-1')
  })

  test('loads more history entries', async () => {
    mocks.getRepositoryHistory
      .mockResolvedValueOnce([{ hash: 'abc123456789', shortHash: 'abc1234', subject: 'feat: first', author: 'Alice', date: '2026-06-15T09:00:00+08:00', parents: [] }])
      .mockResolvedValueOnce([{ hash: 'fed999999999', shortHash: 'fed9999', subject: 'feat: more', author: 'Carol', date: '2026-06-13T09:00:00+08:00', parents: [] }])

    await act(async () => {
      root!.render(<ProjectHistoryPanel repoId={REPO_ID} onRevealPath={vi.fn()} />)
    })
    await act(async () => {})

    await act(async () => {
      container?.querySelector<HTMLButtonElement>('[data-testid="history-load-more"]')?.click()
    })
    await act(async () => {})

    expect(mocks.getRepositoryHistory).toHaveBeenNthCalledWith(2, REPO_ID, 'feature/history', { limit: 100, skip: 1 }, expect.any(AbortSignal))
    expect(container?.textContent).toContain('feat: more')
  })

  test('reveals a file path when detail file row is clicked', async () => {
    const onRevealPath = vi.fn()
    await act(async () => {
      root!.render(<ProjectHistoryPanel repoId={REPO_ID} onRevealPath={onRevealPath} />)
    })
    await act(async () => {})

    await act(async () => {
      container?.querySelector<HTMLButtonElement>('button[aria-label="src/app.ts"]')?.click()
    })

    expect(onRevealPath).toHaveBeenCalledWith('src/app.ts')
  })

  test('shows detail errors without clearing the history list', async () => {
    mocks.getRepositoryCommitDetail.mockResolvedValueOnce(null)

    await act(async () => {
      root!.render(<ProjectHistoryPanel repoId={REPO_ID} onRevealPath={vi.fn()} />)
    })
    await act(async () => {})

    expect(container?.textContent).toContain('feat: first')
    expect(container?.textContent).toContain('history.detail-error')
  })
})
```

- [ ] **Step 2: Run component tests and verify failure**

Run:

```bash
bun run test src/web/components/repo-workspace/ProjectHistoryPanel.test.tsx
```

Expected: FAIL because `ProjectHistoryPanel.tsx` does not exist.

- [ ] **Step 3: Implement ProjectHistoryPanel**

Create `src/web/components/repo-workspace/ProjectHistoryPanel.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { FolderTree } from 'lucide-react'
import { useStoreWithEqualityFn } from 'zustand/traditional'
import { EmptyState, ScrollPane } from '#/web/components/Layout.tsx'
import { Button } from '#/web/components/ui/button.tsx'
import { FilePathText } from '#/web/components/FilePathText.tsx'
import { getRepositoryCommitDetail, getRepositoryHistory } from '#/web/repo-client.ts'
import { useT } from '#/web/stores/i18n.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { cn } from '#/web/lib/cn.ts'
import type { CommitDetail, CommitFileChange, CommitHistoryEntry } from '#/web/types.ts'
import {
  buildHistoryGraphRows,
  commitFileStatusLabel,
  commitFileStatusTone,
  formatHistoryDate,
} from '#/web/components/repo-workspace/history-graph.ts'

const HISTORY_PAGE_SIZE = 100

interface ProjectHistoryPanelProps {
  repoId: string
  onRevealPath?: (relativePath: string) => void
}

interface HistoryView {
  branchName: string | null
  worktreePath: string | null
}

export function ProjectHistoryPanel({ repoId, onRevealPath }: ProjectHistoryPanelProps) {
  const t = useT()
  const view = useProjectHistoryView(repoId)
  const [commits, setCommits] = useState<CommitHistoryEntry[]>([])
  const [selectedHash, setSelectedHash] = useState<string | null>(null)
  const [detailByHash, setDetailByHash] = useState<Record<string, CommitDetail | null>>({})
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const requestSeq = useRef(0)

  useEffect(() => {
    requestSeq.current += 1
    const seq = requestSeq.current
    setCommits([])
    setSelectedHash(null)
    setDetailByHash({})
    setHistoryError(null)
    setDetailError(null)
    setHasMore(false)
    if (!view.branchName) return
    const controller = new AbortController()
    setHistoryLoading(true)
    void getRepositoryHistory(repoId, view.branchName, { limit: HISTORY_PAGE_SIZE, skip: 0 }, controller.signal)
      .then((entries) => {
        if (controller.signal.aborted || requestSeq.current !== seq) return
        setCommits(entries)
        setSelectedHash(entries[0]?.hash ?? null)
        setHasMore(entries.length === HISTORY_PAGE_SIZE)
      })
      .catch((err) => {
        if (controller.signal.aborted || requestSeq.current !== seq) return
        setHistoryError(err instanceof Error ? err.message : 'history.load-error')
      })
      .finally(() => {
        if (!controller.signal.aborted && requestSeq.current === seq) setHistoryLoading(false)
      })
    return () => controller.abort()
  }, [repoId, view.branchName])

  useEffect(() => {
    if (!selectedHash || detailByHash[selectedHash] !== undefined) return
    const controller = new AbortController()
    setDetailLoading(true)
    setDetailError(null)
    void getRepositoryCommitDetail(repoId, selectedHash, controller.signal)
      .then((detail) => {
        if (controller.signal.aborted) return
        setDetailByHash((current) => ({ ...current, [selectedHash]: detail }))
        if (!detail) setDetailError('history.detail-error')
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        setDetailError(err instanceof Error ? err.message : 'history.detail-error')
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailLoading(false)
      })
    return () => controller.abort()
  }, [detailByHash, repoId, selectedHash])

  async function loadMore() {
    if (!view.branchName || historyLoading) return
    setHistoryLoading(true)
    setHistoryError(null)
    try {
      const entries = await getRepositoryHistory(repoId, view.branchName, {
        limit: HISTORY_PAGE_SIZE,
        skip: commits.length,
      })
      setCommits((current) => [...current, ...entries])
      setHasMore(entries.length === HISTORY_PAGE_SIZE)
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : 'history.load-error')
    } finally {
      setHistoryLoading(false)
    }
  }

  if (!view.branchName) {
    return <EmptyState icon={<FolderTree size={16} />} title={t('branches.empty')} body={t('history.no-branch')} />
  }

  const selectedDetail = selectedHash ? detailByHash[selectedHash] : null

  return (
    <section className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] border-t border-separator/70">
      <HistoryList
        commits={commits}
        selectedHash={selectedHash}
        loading={historyLoading}
        error={historyError}
        hasMore={hasMore}
        onSelect={setSelectedHash}
        onLoadMore={loadMore}
      />
      <CommitDetailPane
        detail={selectedDetail ?? null}
        loading={detailLoading}
        error={detailError}
        canReveal={!!view.worktreePath}
        onRevealPath={onRevealPath}
      />
    </section>
  )
}

function useProjectHistoryView(repoId: string): HistoryView {
  return useStoreWithEqualityFn(
    useReposStore,
    (state) => {
      const repo = state.repos[repoId]
      const branchName = repo?.ui.selectedBranch ?? null
      const branch = repo?.data.branches.find((entry) => entry.name === branchName)
      return { branchName, worktreePath: branch?.worktree?.path ?? null }
    },
    (a, b) => a.branchName === b.branchName && a.worktreePath === b.worktreePath,
  )
}

function HistoryList({
  commits,
  selectedHash,
  loading,
  error,
  hasMore,
  onSelect,
  onLoadMore,
}: {
  commits: CommitHistoryEntry[]
  selectedHash: string | null
  loading: boolean
  error: string | null
  hasMore: boolean
  onSelect: (hash: string) => void
  onLoadMore: () => void
}) {
  const t = useT()
  const rows = useMemo(() => buildHistoryGraphRows(commits), [commits])
  if (error && commits.length === 0) return <EmptyState title={t('history.load-error')} body={t(error)} />
  if (!loading && commits.length === 0) return <EmptyState title={t('history.empty-title')} body={t('history.empty-body')} />

  return (
    <div className="flex min-h-0 flex-col border-r border-separator/70">
      <ScrollPane>
        <ul className="py-1.5">
          {rows.map((row) => (
            <li key={row.commit.hash}>
              <button
                type="button"
                aria-label={row.commit.hash}
                onClick={() => onSelect(row.commit.hash)}
                className={cn(
                  'grid w-full grid-cols-[64px_minmax(0,1fr)] gap-2 px-2 py-1.5 text-left hover:bg-accent/50',
                  selectedHash === row.commit.hash && 'bg-selected text-selected-foreground',
                )}
              >
                <HistoryGraphCell lane={row.lane} laneCount={row.laneCount} />
                <span className="min-w-0">
                  <span className="block truncate text-sm">{row.commit.subject}</span>
                  <span className="block truncate font-mono text-xs text-muted-foreground">
                    {row.commit.shortHash} · {row.commit.author} · {formatHistoryDate(row.commit.date)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </ScrollPane>
      <div className="flex min-h-9 items-center justify-end border-t border-separator/70 px-2">
        {error && <span className="mr-auto text-xs text-danger">{t(error)}</span>}
        <Button data-testid="history-load-more" type="button" size="sm" variant="ghost" disabled={loading || !hasMore} onClick={onLoadMore}>
          {loading ? t('common.loading') : t('history.load-more')}
        </Button>
      </div>
    </div>
  )
}

function HistoryGraphCell({ lane, laneCount }: { lane: number; laneCount: number }) {
  return (
    <span
      aria-hidden="true"
      className="grid h-9 items-center"
      style={{ gridTemplateColumns: `repeat(${Math.max(1, laneCount)}, minmax(10px, 1fr))` }}
    >
      {Array.from({ length: Math.max(1, laneCount) }, (_, index) => (
        <span key={index} className="relative flex h-full items-center justify-center">
          {index === lane && <span className="h-2.5 w-2.5 rounded-full bg-brand-text" />}
          <span className="absolute inset-y-0 w-px bg-separator/80" />
        </span>
      ))}
    </span>
  )
}

function CommitDetailPane({
  detail,
  loading,
  error,
  canReveal,
  onRevealPath,
}: {
  detail: CommitDetail | null
  loading: boolean
  error: string | null
  canReveal: boolean
  onRevealPath?: (relativePath: string) => void
}) {
  const t = useT()
  if (loading && !detail) return <EmptyState title={t('history.detail-loading')} />
  if (error && !detail) return <EmptyState title={t('history.detail-error')} body={t(error)} />
  if (!detail) return <EmptyState title={t('history.detail-empty')} />

  return (
    <div className="flex min-h-0 flex-col">
      <div className="border-b border-separator/70 px-3 py-2">
        <h3 className="truncate text-sm font-medium">{detail.subject}</h3>
        <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{detail.hash}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {detail.author} · {formatHistoryDate(detail.date)}
        </p>
        <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
          {t('history.parents')}: {detail.parents.length > 0 ? detail.parents.map((parent) => parent.slice(0, 7)).join(', ') : '-'}
        </p>
      </div>
      <ScrollPane>
        <ul className="py-1.5">
          {detail.files.map((file) => (
            <CommitFileRow key={`${file.status}-${file.path}-${file.oldPath ?? ''}`} file={file} canReveal={canReveal} onRevealPath={onRevealPath} />
          ))}
        </ul>
      </ScrollPane>
    </div>
  )
}

function CommitFileRow({
  file,
  canReveal,
  onRevealPath,
}: {
  file: CommitFileChange
  canReveal: boolean
  onRevealPath?: (relativePath: string) => void
}) {
  const content = (
    <>
      <span className={cn('inline-flex w-[2ch] justify-center font-mono text-sm font-semibold', commitFileStatusTone(file.status))}>
        {commitFileStatusLabel(file.status)}
      </span>
      <span className="min-w-0 truncate">
        <FilePathText path={file.path} />
      </span>
      <span className="font-mono text-xs text-success">+{file.additions}</span>
      <span className="font-mono text-xs text-danger">-{file.deletions}</span>
    </>
  )
  return (
    <li className="grid grid-cols-[2ch_minmax(0,1fr)_auto_auto] items-center gap-3 px-2 py-0.5">
      {canReveal && onRevealPath ? (
        <button
          type="button"
          aria-label={file.path}
          className="contents"
          onClick={() => onRevealPath(file.path)}
        >
          {content}
        </button>
      ) : (
        content
      )}
    </li>
  )
}
```

- [ ] **Step 4: Run component tests and adjust only for real failures**

Run:

```bash
bun run test src/web/components/repo-workspace/ProjectHistoryPanel.test.tsx
```

Expected: PASS after adjusting import formatting or exact class names only when the failure output shows a concrete mismatch.

- [ ] **Step 5: Commit checkpoint after explicit confirmation**

Before committing, ask for explicit confirmation. After confirmation, run:

```bash
git add src/web/components/repo-workspace/ProjectHistoryPanel.tsx src/web/components/repo-workspace/ProjectHistoryPanel.test.tsx
git commit -m "feat(history): add project history panel"
```

## Task 7: Explorer Tab Integration And I18n

**Files:**
- Modify: `src/web/components/repo-workspace/RepoExplorerPane.tsx`
- Modify: `src/web/components/repo-workspace/RepoExplorerPane.test.tsx`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`

- [ ] **Step 1: Add failing explorer integration tests**

Update mocks in `src/web/components/repo-workspace/RepoExplorerPane.test.tsx`:

```tsx
vi.mock('#/web/components/repo-workspace/ProjectHistoryPanel.tsx', () => ({
  ProjectHistoryPanel: ({ onRevealPath }: { onRevealPath?: (path: string) => void }) => (
    <button type="button" data-testid="project-history-panel" onClick={() => onRevealPath?.('src/from-history.ts')}>
      history
    </button>
  ),
}))
```

Update tab expectations:

```ts
expect(tabs.map((tab) => tab.textContent)).toEqual(['file-tree.title', 'tab.changes', 'tab.status', 'tab.history'])
```

Remote tab expectation:

```ts
expect(tabs.map((tab) => tab.textContent)).toEqual(['file-tree.title', 'tab.changes', 'tab.status', 'tab.history', 'ports.title'])
```

Add test:

```tsx
  test('history file clicks switch back to files with a reveal request', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(<RepoExplorerPane repoId="/repo" layout="top-bottom" showActions />)
    })

    const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    await act(async () => {
      tabs[3]?.click()
    })
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="project-history-panel"]')?.click()
    })

    expect(container.querySelector('[data-testid="project-file-tree"]')?.getAttribute('data-reveal-path')).toBe('src/from-history.ts')
    await act(async () => root.unmount())
  })
```

- [ ] **Step 2: Run explorer tests and verify failure**

Run:

```bash
bun run test src/web/components/repo-workspace/RepoExplorerPane.test.tsx
```

Expected: FAIL because the `History` tab is not integrated.

- [ ] **Step 3: Integrate tab**

Update imports in `src/web/components/repo-workspace/RepoExplorerPane.tsx`:

```ts
import { ProjectHistoryPanel } from '#/web/components/repo-workspace/ProjectHistoryPanel.tsx'
```

Update tab union:

```ts
type ExplorerTab = 'files' | 'changes' | 'status' | 'history' | 'ports'
```

Update tabs array:

```ts
  const tabs = [
    { id: 'files' as const, label: t('file-tree.title') },
    { id: 'changes' as const, label: t('tab.changes') },
    { id: 'status' as const, label: t('tab.status') },
    { id: 'history' as const, label: t('tab.history') },
    ...(isRemoteRepo ? [{ id: 'ports' as const, label: t('ports.title') }] : []),
  ] satisfies { id: ExplorerTab; label: string }[]
```

Update panel render branch:

```tsx
        {activeVisibleTab === 'files' ? (
          <ProjectFileTree repoId={repoId} revealRequest={revealRequest} />
        ) : activeVisibleTab === 'changes' ? (
          <ProjectChangesPanel repoId={repoId} onRevealPath={handleRevealPath} />
        ) : activeVisibleTab === 'status' ? (
          <ProjectStatusPanel repoId={repoId} layout={layout} />
        ) : activeVisibleTab === 'history' ? (
          <ProjectHistoryPanel repoId={repoId} onRevealPath={handleRevealPath} />
        ) : (
          <ProjectPortsPanel repoId={repoId} />
        )}
```

- [ ] **Step 4: Add i18n keys**

Add these keys to `src/shared/i18n/en.ts`:

```ts
  'tab.history': 'History',
  'history.no-branch': 'Select a branch to view history.',
  'history.empty-title': 'No commits',
  'history.empty-body': 'This branch has no commits to show.',
  'history.load-error': 'Failed to load history',
  'history.detail-empty': 'Select a commit',
  'history.detail-loading': 'Loading commit',
  'history.detail-error': 'Failed to load commit',
  'history.load-more': 'Load more',
  'history.parents': 'Parents',
```

Add these keys to `src/shared/i18n/zh.ts`:

```ts
  'tab.history': '历史',
  'history.no-branch': '选择分支后查看历史。',
  'history.empty-title': '没有提交',
  'history.empty-body': '该分支没有可显示的提交。',
  'history.load-error': '历史加载失败',
  'history.detail-empty': '选择一个提交',
  'history.detail-loading': '正在加载提交',
  'history.detail-error': '提交加载失败',
  'history.load-more': '加载更多',
  'history.parents': '父提交',
```

Add these exact English fallback strings to `src/shared/i18n/ja.ts` and `src/shared/i18n/ko.ts`:

```ts
  'tab.history': 'History',
  'history.no-branch': 'Select a branch to view history.',
  'history.empty-title': 'No commits',
  'history.empty-body': 'This branch has no commits to show.',
  'history.load-error': 'Failed to load history',
  'history.detail-empty': 'Select a commit',
  'history.detail-loading': 'Loading commit',
  'history.detail-error': 'Failed to load commit',
  'history.load-more': 'Load more',
  'history.parents': 'Parents',
```

- [ ] **Step 5: Run explorer and i18n tests**

Run:

```bash
bun run test src/web/components/repo-workspace/RepoExplorerPane.test.tsx src/shared/i18n/dictionaries.test.ts src/shared/i18n/snapshot.test.ts
```

Expected: PASS. If `snapshot.test.ts` fails because snapshots are generated from dictionaries, inspect its failure and update the expected snapshot file through the existing project snapshot workflow used by that test.

- [ ] **Step 6: Commit checkpoint after explicit confirmation**

Before committing, ask for explicit confirmation. After confirmation, run:

```bash
git add src/web/components/repo-workspace/RepoExplorerPane.tsx src/web/components/repo-workspace/RepoExplorerPane.test.tsx src/shared/i18n/en.ts src/shared/i18n/zh.ts src/shared/i18n/ja.ts src/shared/i18n/ko.ts src/shared/i18n/dictionaries.test.ts src/shared/i18n/snapshot.test.ts
git commit -m "feat(history): add explorer history tab"
```

## Task 8: Verification And Architecture Guard

**Files:**
- No new feature files unless earlier tests expose a concrete defect.

- [ ] **Step 1: Run focused history test suite**

Run:

```bash
bun run test src/system/git/parsers.test.ts src/system/git/history.test.ts src/system/ssh/commands.test.ts src/system/ssh/git.test.ts src/server/modules/repo.test.ts src/server/routes/repo.test.ts src/web/repo-client.test.ts src/web/components/repo-workspace/history-graph.test.ts src/web/components/repo-workspace/ProjectHistoryPanel.test.tsx src/web/components/repo-workspace/RepoExplorerPane.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run architecture guard**

Run:

```bash
bun run check:architecture
```

Expected: PASS. This validates that `src/web/**` still does not import `src/server/**` or `src/main/**`, and `src/server/**` does not import Electron.

- [ ] **Step 4: Run full test suite if shared behavior changed**

Run this because the implementation touches shared Git types, parser code, routes, and renderer components:

```bash
bun run test
```

Expected: PASS.

- [ ] **Step 5: Manual smoke test**

Run the app with the repo's normal dev command:

```bash
bun run dev
```

Expected:

- A repository opens normally.
- The explorer tab bar contains `History`.
- Selecting `History` loads the selected branch history.
- Clicking a commit shows full hash, author, date, parents, and file stats.
- Clicking a file row switches to `Files` and reveals the file when the branch has a worktree.
- `Load more` requests the next page and appends rows.

- [ ] **Step 6: Confirm no uncommitted history feature work remains**

Run:

```bash
git status --short
```

Expected: no uncommitted files from the history feature. If verification produced a fix, return to the task that owns that file, rerun that task's focused tests, and use that task's explicit commit checkpoint after requesting confirmation.

## Self-Review

- Spec coverage: The plan covers current-branch history, pagination, graph rendering, commit metadata, parent ids, file stats, file reveal, local and SSH remote repositories, i18n, error states, tests, typecheck, and architecture guard.
- Scope check: The plan does not add full-repository graph, PR-only filters, full patch rendering, refs/tags decoration, graph dependencies, or session persistence.
- Type consistency: The same `CommitHistoryEntry`, `CommitFileChange`, and `CommitDetail` types are introduced in Task 1 and used by backend, routes, client, graph model, and UI tasks.
- Safety check: Every commit step explicitly requires confirmation before running `git commit`.
