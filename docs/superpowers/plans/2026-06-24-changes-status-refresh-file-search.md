# Changes Status Refresh and File Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a status-only refresh icon to the `Changes` tab and add a find-style file search to the `Files` tab with loaded-node matches and bounded whole-worktree fallback.

**Architecture:** Reuse the existing repo status refresh action for `Changes`, keeping it separate from topbar sync. Add shared file-search contracts, a local/remote repo file search read path, and renderer-local search state that reuses `ProjectFileTree`'s existing reveal flow.

**Tech Stack:** TypeScript in Node strip-only mode, React, Zustand, Hono routes, Vitest, lucide-react icons, existing repo-client/server-fetch APIs.

**Repo Constraint:** Do not create git commits or branches while executing this plan unless the user explicitly requests them. Verification replaces the usual commit checkpoint.

---

## File Structure

- Modify `src/shared/file-tree.ts`
  - Own shared file search limits, request/result types, request guard, and pure ranking helpers.
- Create `src/system/file-tree/search.ts`
  - Own local Git-backed candidate enumeration and bounded search.
- Create `src/system/file-tree/search.test.ts`
  - Test local search behavior with mocked `git`.
- Modify `src/system/ssh/commands.ts`
  - Add the remote command kind and Python script for bounded remote search.
- Modify `src/system/ssh/commands.test.ts`
  - Test remote command construction.
- Modify `src/system/ssh/git.ts`
  - Parse remote search JSON into shared result types.
- Modify `src/system/ssh/git.test.ts`
  - Test remote search parsing and command dispatch.
- Modify `src/server/modules/repo-file-tree.ts`
  - Dispatch local or remote file search based on repo id.
- Modify `src/server/modules/repo-file-tree.test.ts`
  - Test local dispatch and invalid local containment.
- Modify `src/server/modules/repo-read-paths.ts`
  - Export the read-path wrapper.
- Modify `src/server/routes/repo.ts`
  - Add `/api/repo/file-search`.
- Modify `src/server/routes/repo.test.ts`
  - Test route body normalization and module dispatch.
- Modify `src/web/repo-client.ts`
  - Add `searchRepositoryFileTree`.
- Create `src/web/components/file-tree/search.ts`
  - Own loaded-node matching and result merge helpers.
- Create `src/web/components/file-tree/search.test.ts`
  - Test renderer search ranking, dedupe, and merge behavior.
- Modify `src/web/components/repo-workspace/ProjectChangesPanel.tsx`
  - Add status-only refresh icon.
- Modify `src/web/components/repo-workspace/ProjectChangesPanel.test.tsx`
  - Test status-only refresh behavior.
- Modify `src/web/components/file-tree/ProjectFileTree.tsx`
  - Add search UI, fallback request lifecycle, match navigation, and reveal integration.
- Modify `src/web/components/file-tree/ProjectFileTree.test.tsx`
  - Test file search interaction and fallback reveal.
- Modify `src/shared/i18n/en.ts`, `src/shared/i18n/zh.ts`, `src/shared/i18n/ja.ts`, `src/shared/i18n/ko.ts`
  - Add file search and changes refresh copy.
- Existing snapshot tests cover dictionary key consistency.

## Task 1: Shared File Search Contract

**Files:**
- Modify: `src/shared/file-tree.ts`

- [ ] **Step 1: Add failing shared type/guard tests**

Append these tests to `src/shared/file-tree.test.ts`:

```ts
import {
  FILE_TREE_SEARCH_LIMIT_DEFAULT,
  FILE_TREE_SEARCH_LIMIT_MAX,
  fileTreeSearchRank,
  isRepoFileSearchRequest,
  normalizeFileTreeSearchLimit,
  sortRepoFileSearchMatches,
} from '#/shared/file-tree.ts'

describe('file tree search contract', () => {
  test('normalizes search limits into the supported range', () => {
    expect(normalizeFileTreeSearchLimit(undefined)).toBe(FILE_TREE_SEARCH_LIMIT_DEFAULT)
    expect(normalizeFileTreeSearchLimit(0)).toBe(1)
    expect(normalizeFileTreeSearchLimit(9999)).toBe(FILE_TREE_SEARCH_LIMIT_MAX)
    expect(normalizeFileTreeSearchLimit(25.8)).toBe(25)
  })

  test('validates file search requests', () => {
    expect(
      isRepoFileSearchRequest({
        repoId: '/repo',
        worktreePath: '/repo',
        query: 'button',
        limit: 50,
      }),
    ).toBe(true)
    expect(isRepoFileSearchRequest({ repoId: '/repo', worktreePath: '/repo', query: '' })).toBe(false)
    expect(isRepoFileSearchRequest({ repoId: '/repo', worktreePath: '/repo', query: '   ' })).toBe(false)
    expect(isRepoFileSearchRequest({ repoId: '/repo', worktreePath: '/repo', query: 'a', limit: '10' })).toBe(false)
  })

  test('ranks filename matches before path-only matches', () => {
    expect(fileTreeSearchRank('button', 'src/components/Button.tsx')).toBe(0)
    expect(fileTreeSearchRank('utton', 'src/components/Button.tsx')).toBe(1)
    expect(fileTreeSearchRank('src', 'src/components/Button.tsx')).toBe(2)
    expect(fileTreeSearchRank('components', 'src/components/Button.tsx')).toBe(3)
    expect(fileTreeSearchRank('missing', 'src/components/Button.tsx')).toBeNull()
  })

  test('sorts search matches by rank then relative path', () => {
    expect(
      sortRepoFileSearchMatches('button', [
        { relativePath: 'src/components/IconButton.tsx', kind: 'file' },
        { relativePath: 'docs/button-guide.md', kind: 'file' },
        { relativePath: 'src/Button.tsx', kind: 'file' },
      ]).map((match) => match.relativePath),
    ).toEqual(['src/Button.tsx', 'src/components/IconButton.tsx', 'docs/button-guide.md'])
  })
})
```

- [ ] **Step 2: Run the shared tests and verify failure**

Run:

```bash
bun test src/shared/file-tree.test.ts
```

Expected: fail because the search constants and helpers are not exported yet.

- [ ] **Step 3: Add shared search exports**

Add this code to `src/shared/file-tree.ts` after the existing constants and type declarations:

```ts
export const FILE_TREE_SEARCH_LIMIT_DEFAULT = 100
export const FILE_TREE_SEARCH_LIMIT_MAX = 200

export type RepoFileSearchEntryKind = RepoFileTreeEntryKind | 'other'

export interface RepoFileSearchMatch {
  relativePath: string
  kind: RepoFileSearchEntryKind
}

export interface RepoFileSearchRequest {
  repoId: string
  worktreePath: string
  query: string
  limit?: number
}

export type RepoFileSearchResult =
  | {
      ok: true
      matches: RepoFileSearchMatch[]
      truncated: boolean
      limit: number
    }
  | {
      ok: false
      message: string
    }

export function normalizeFileTreeSearchLimit(value: unknown): number {
  const parsed = typeof value === 'number' ? Math.floor(value) : Number.NaN
  if (!Number.isFinite(parsed)) return FILE_TREE_SEARCH_LIMIT_DEFAULT
  return Math.max(1, Math.min(FILE_TREE_SEARCH_LIMIT_MAX, parsed))
}

export function isRepoFileSearchRequest(value: unknown): value is RepoFileSearchRequest {
  return (
    isRecord(value) &&
    typeof value.repoId === 'string' &&
    value.repoId.length > 0 &&
    typeof value.worktreePath === 'string' &&
    value.worktreePath.length > 0 &&
    typeof value.query === 'string' &&
    value.query.trim().length > 0 &&
    (value.limit === undefined || typeof value.limit === 'number')
  )
}

function fileTreeSearchBasename(relativePath: string): string {
  const slash = relativePath.lastIndexOf('/')
  return slash < 0 ? relativePath : relativePath.slice(slash + 1)
}

export function fileTreeSearchRank(query: string, relativePath: string): number | null {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return null
  const pathValue = relativePath.toLocaleLowerCase()
  const nameValue = fileTreeSearchBasename(relativePath).toLocaleLowerCase()
  if (nameValue.startsWith(needle)) return 0
  if (nameValue.includes(needle)) return 1
  if (pathValue.startsWith(needle)) return 2
  if (pathValue.includes(needle)) return 3
  return null
}

export function sortRepoFileSearchMatches<T extends RepoFileSearchMatch>(query: string, matches: T[]): T[] {
  return [...matches].sort((a, b) => {
    const rankA = fileTreeSearchRank(query, a.relativePath) ?? Number.MAX_SAFE_INTEGER
    const rankB = fileTreeSearchRank(query, b.relativePath) ?? Number.MAX_SAFE_INTEGER
    if (rankA !== rankB) return rankA - rankB
    return a.relativePath.localeCompare(b.relativePath, undefined, { numeric: true, sensitivity: 'base' })
  })
}
```

- [ ] **Step 4: Run the shared tests and verify pass**

Run:

```bash
bun test src/shared/file-tree.test.ts
```

Expected: pass.

## Task 2: Local File Search

**Files:**
- Create: `src/system/file-tree/search.ts`
- Create: `src/system/file-tree/search.test.ts`

- [ ] **Step 1: Write failing local search tests**

Create `src/system/file-tree/search.test.ts`:

```ts
import { describe, expect, test, vi } from 'vitest'
import { searchLocalFileTree } from '#/system/file-tree/search.ts'

const git = vi.fn()

vi.mock('#/system/git/helper.ts', () => ({
  git: (...args: unknown[]) => git(...args),
}))

describe('searchLocalFileTree', () => {
  test('returns ranked file and derived directory matches from git ls-files', async () => {
    git.mockResolvedValueOnce(['src/components/Button.tsx', 'src/components/Icon.tsx', 'README.md'].join('\0'))

    const result = await searchLocalFileTree('/repo', 'button', { limit: 20 })

    expect(result).toEqual({
      ok: true,
      matches: [{ relativePath: 'src/components/Button.tsx', kind: 'file' }],
      truncated: false,
      limit: 20,
    })
    expect(git).toHaveBeenCalledWith('/repo', ['ls-files', '-co', '--exclude-standard', '-z'], { signal: undefined })
  })

  test('derives directory matches from candidate prefixes', async () => {
    git.mockResolvedValueOnce(['src/components/Button.tsx', 'src/components/Icon.tsx'].join('\0'))

    const result = await searchLocalFileTree('/repo', 'components', { limit: 20 })

    expect(result).toEqual({
      ok: true,
      matches: [
        { relativePath: 'src/components', kind: 'directory' },
        { relativePath: 'src/components/Button.tsx', kind: 'file' },
        { relativePath: 'src/components/Icon.tsx', kind: 'file' },
      ],
      truncated: false,
      limit: 20,
    })
  })

  test('skips heavy generated directories and reports truncation', async () => {
    git.mockResolvedValueOnce(
      [
        'node_modules/pkg/Button.js',
        'src/Button.tsx',
        'src/ButtonGroup.tsx',
        'dist/Button.js',
      ].join('\0'),
    )

    const result = await searchLocalFileTree('/repo', 'button', { limit: 1 })

    expect(result).toEqual({
      ok: true,
      matches: [{ relativePath: 'src/Button.tsx', kind: 'file' }],
      truncated: true,
      limit: 1,
    })
  })

  test('rejects invalid input and maps git failures', async () => {
    await expect(searchLocalFileTree('', 'button')).resolves.toEqual({ ok: false, message: 'error.invalid-arguments' })
    await expect(searchLocalFileTree('/repo', '   ')).resolves.toEqual({ ok: false, message: 'error.invalid-arguments' })

    git.mockRejectedValueOnce(new Error('fatal: not a git repository'))
    await expect(searchLocalFileTree('/repo', 'button')).resolves.toEqual({
      ok: false,
      message: 'fatal: not a git repository',
    })
  })
})
```

- [ ] **Step 2: Run local search tests and verify failure**

Run:

```bash
bun test src/system/file-tree/search.test.ts
```

Expected: fail because `src/system/file-tree/search.ts` does not exist.

- [ ] **Step 3: Implement local search**

Create `src/system/file-tree/search.ts`:

```ts
import {
  fileTreeSearchRank,
  normalizeFileTreeSearchLimit,
  sortRepoFileSearchMatches,
  type RepoFileSearchMatch,
  type RepoFileSearchResult,
} from '#/shared/file-tree.ts'
import { git } from '#/system/git/helper.ts'

const SKIPPED_SEGMENTS = new Set(['.git', 'node_modules', 'dist', 'build', '.next', '.turbo', '.cache', 'coverage'])

function validSearchInput(worktreePath: string, query: string): boolean {
  return worktreePath.length > 0 && !worktreePath.includes('\0') && query.trim().length > 0
}

function splitGitFilesOutput(output: string): string[] {
  return output.split('\0').map((item) => item.trim()).filter(Boolean)
}

function hasSkippedSegment(relativePath: string): boolean {
  return relativePath.split('/').some((segment) => SKIPPED_SEGMENTS.has(segment))
}

function directoryPrefixes(relativePath: string): string[] {
  const parts = relativePath.split('/').filter(Boolean)
  const prefixes: string[] = []
  for (let i = 1; i < parts.length; i += 1) {
    prefixes.push(parts.slice(0, i).join('/'))
  }
  return prefixes
}

function candidateMatches(query: string, paths: string[]): RepoFileSearchMatch[] {
  const files = new Map<string, RepoFileSearchMatch>()
  const directories = new Map<string, RepoFileSearchMatch>()
  for (const relativePath of paths) {
    if (!relativePath || relativePath.startsWith('/') || relativePath.includes('\0') || hasSkippedSegment(relativePath)) {
      continue
    }
    files.set(relativePath, { relativePath, kind: 'file' })
    for (const directory of directoryPrefixes(relativePath)) {
      if (!hasSkippedSegment(directory)) directories.set(directory, { relativePath: directory, kind: 'directory' })
    }
  }
  return [...directories.values(), ...files.values()].filter((match) => fileTreeSearchRank(query, match.relativePath) !== null)
}

export async function searchLocalFileTree(
  worktreePath: string,
  query: string,
  options: { limit?: number; signal?: AbortSignal } = {},
): Promise<RepoFileSearchResult> {
  if (options.signal?.aborted) return { ok: false, message: 'cancelled' }
  if (!validSearchInput(worktreePath, query)) return { ok: false, message: 'error.invalid-arguments' }
  const limit = normalizeFileTreeSearchLimit(options.limit)
  try {
    const output = await git(worktreePath, ['ls-files', '-co', '--exclude-standard', '-z'], { signal: options.signal })
    if (options.signal?.aborted) return { ok: false, message: 'cancelled' }
    const matches = sortRepoFileSearchMatches(query, candidateMatches(query, splitGitFilesOutput(output)))
    return { ok: true, matches: matches.slice(0, limit), truncated: matches.length > limit, limit }
  } catch (err) {
    if (options.signal?.aborted) return { ok: false, message: 'cancelled' }
    return { ok: false, message: err instanceof Error ? err.message : 'error.failed-read-repo' }
  }
}
```

- [ ] **Step 4: Run local search tests and verify pass**

Run:

```bash
bun test src/system/file-tree/search.test.ts
```

Expected: pass.

## Task 3: Remote File Search

**Files:**
- Modify: `src/system/ssh/commands.ts`
- Modify: `src/system/ssh/commands.test.ts`
- Modify: `src/system/ssh/git.ts`
- Modify: `src/system/ssh/git.test.ts`

- [ ] **Step 1: Add failing remote command and parser tests**

Append to `src/system/ssh/commands.test.ts`:

```ts
test('builds fixed remote file search command with JSON encoded inputs', () => {
  const invocation = buildRemoteCommandInvocation(TARGET, {
    type: 'searchFileTree',
    worktreePath: "/srv/repo/user's work",
    query: 'button',
    limit: 50,
  })

  expect(invocation.script).toContain('python3')
  expect(invocation.script).toContain('git')
  expect(invocation.script).toContain("user's work")
  expect(invocation.script).toContain('button')
  expect(invocation.script).toContain('"limit": 50')
  expect(invocation.args).toContain(TARGET.alias)
})
```

Append to `src/system/ssh/git.test.ts`:

```ts
import { searchRemoteFileTree } from '#/system/ssh/git.ts'

test('parses remote file search JSON and passes fixed command input', async () => {
  const run = vi.fn(async () =>
    okRemoteResult(
      JSON.stringify({
        ok: true,
        matches: [
          { relativePath: 'src/Button.tsx', kind: 'file' },
          { relativePath: 'src/components', kind: 'directory' },
        ],
        truncated: true,
        limit: 2,
      }),
    ),
  )

  const result = await searchRemoteFileTree(TARGET, '/srv/repo', 'button', { limit: 2, run: run as any })

  expect(result).toEqual({
    ok: true,
    matches: [
      { relativePath: 'src/Button.tsx', kind: 'file' },
      { relativePath: 'src/components', kind: 'directory' },
    ],
    truncated: true,
    limit: 2,
  })
  expect(run).toHaveBeenCalledWith(
    { type: 'searchFileTree', worktreePath: '/srv/repo', query: 'button', limit: 2 },
    TARGET,
    { signal: undefined, timeoutMs: 90_000, maxBuffer: 10 * 1024 * 1024 },
  )
})
```

- [ ] **Step 2: Run remote tests and verify failure**

Run:

```bash
bun test src/system/ssh/commands.test.ts src/system/ssh/git.test.ts
```

Expected: fail because `searchFileTree` and `searchRemoteFileTree` are not defined.

- [ ] **Step 3: Add the remote command kind and script**

In `src/system/ssh/commands.ts`, add this union member to `RemoteCommandKind`:

```ts
| { type: 'searchFileTree'; worktreePath: string; query: string; limit: number }
```

Add a switch case in `scriptForCommand`:

```ts
case 'searchFileTree':
  return remoteFileTreeSearchScript(command)
```

Add this helper near the existing file tree Python script helpers:

```ts
function remoteFileTreeSearchScript(command: Extract<RemoteCommandKind, { type: 'searchFileTree' }>): string {
  const payload = {
    worktreePath: command.worktreePath,
    query: command.query,
    limit: Math.max(1, Math.min(200, Math.floor(command.limit))),
  }
  return [
    "python3 - <<'PY'",
    'import json, os, subprocess, sys',
    `payload = ${pythonString(JSON.stringify(payload))}`,
    'data = json.loads(payload)',
    'root = os.path.normpath(data["worktreePath"])',
    'query = str(data["query"]).strip().lower()',
    'limit = int(data["limit"])',
    'skip = {".git", "node_modules", "dist", "build", ".next", ".turbo", ".cache", "coverage"}',
    'def fail(message):',
    '    print(json.dumps({"ok": False, "message": message}))',
    '    sys.exit(0)',
    'if not root or not os.path.isabs(root) or not query:',
    '    fail("error.invalid-arguments")',
    'if not os.path.isdir(root):',
    '    fail("error.path-not-directory")',
    'def basename(p):',
    '    return p.rsplit("/", 1)[-1]',
    'def rank(p):',
    '    name = basename(p).lower()',
    '    value = p.lower()',
    '    if name.startswith(query): return 0',
    '    if query in name: return 1',
    '    if value.startswith(query): return 2',
    '    if query in value: return 3',
    '    return None',
    'def skipped(p):',
    '    return any(part in skip for part in p.split("/"))',
    'try:',
    '    raw = subprocess.check_output(["git", "-C", root, "ls-files", "-co", "--exclude-standard", "-z"], stderr=subprocess.PIPE)',
    'except subprocess.CalledProcessError as exc:',
    '    fail(exc.stderr.decode("utf-8", "replace") if exc.stderr else "error.failed-read-repo")',
    'paths = [p.decode("utf-8", "surrogateescape") for p in raw.split(b"\\0") if p]',
    'items = {}',
    'for rel in paths:',
    '    if rel.startswith("/") or "\\x00" in rel or skipped(rel):',
    '        continue',
    '    items.setdefault(rel, {"relativePath": rel, "kind": "file"})',
    '    parts = [part for part in rel.split("/") if part]',
    '    for i in range(1, len(parts)):',
    '        directory = "/".join(parts[:i])',
    '        if not skipped(directory):',
    '            items.setdefault(directory, {"relativePath": directory, "kind": "directory"})',
    'matches = [item for item in items.values() if rank(item["relativePath"]) is not None]',
    'matches.sort(key=lambda item: (rank(item["relativePath"]), item["relativePath"].lower()))',
    'print(json.dumps({"ok": True, "matches": matches[:limit], "truncated": len(matches) > limit, "limit": limit}, ensure_ascii=False))',
    'PY',
  ].join('\n')
}
```

- [ ] **Step 4: Add remote parser function**

In `src/system/ssh/git.ts`, import `normalizeFileTreeSearchLimit` and `RepoFileSearchResult` from `#/shared/file-tree.ts`.

Add this interface near `RemoteFileTreeJson`:

```ts
interface RemoteFileTreeSearchJson {
  ok?: boolean
  message?: string
  limit?: unknown
  truncated?: unknown
  matches?: Array<{ relativePath?: unknown; kind?: unknown }>
}
```

Add this exported function near `listRemoteFileTreeDirectory`:

```ts
export async function searchRemoteFileTree(
  target: RemoteRepoTarget,
  worktreePath: string,
  query: string,
  options: { limit?: number; signal?: AbortSignal; run?: RemoteGitRunner } = {},
): Promise<RepoFileSearchResult> {
  const run: RemoteGitRunner = options.run ?? ((command, t, runOptions) => runRemoteCommand(t, command, runOptions))
  const limit = normalizeFileTreeSearchLimit(options.limit)
  const result = await run({ type: 'searchFileTree', worktreePath, query, limit }, target, {
    signal: options.signal,
    timeoutMs: REMOTE_FILE_TRANSFER_TIMEOUT_MS,
    maxBuffer: 10 * 1024 * 1024,
  })
  if (options.signal?.aborted) return { ok: false, message: 'cancelled' }
  if (!result.ok && !result.stdout) return { ok: false, message: result.message || 'error.failed-read-repo' }

  let parsed: RemoteFileTreeSearchJson
  try {
    parsed = JSON.parse(result.stdout) as RemoteFileTreeSearchJson
  } catch {
    return { ok: false, message: 'error.failed-read-repo' }
  }
  if (parsed.ok !== true) return { ok: false, message: parsed.message || 'error.failed-read-repo' }

  const matches = (parsed.matches ?? [])
    .filter((match): match is { relativePath: string; kind: 'file' | 'directory' | 'symlink' | 'other' } => {
      return (
        typeof match.relativePath === 'string' &&
        match.relativePath.length > 0 &&
        !match.relativePath.startsWith('/') &&
        (match.kind === 'file' || match.kind === 'directory' || match.kind === 'symlink' || match.kind === 'other')
      )
    })
    .map((match) => ({ relativePath: match.relativePath, kind: match.kind }))

  return {
    ok: true,
    matches,
    truncated: parsed.truncated === true,
    limit: normalizeFileTreeSearchLimit(parsed.limit),
  }
}
```

- [ ] **Step 5: Run remote tests and verify pass**

Run:

```bash
bun test src/system/ssh/commands.test.ts src/system/ssh/git.test.ts
```

Expected: pass.

## Task 4: Server Route and Client Integration

**Files:**
- Modify: `src/server/modules/repo-file-tree.ts`
- Modify: `src/server/modules/repo-file-tree.test.ts`
- Modify: `src/server/modules/repo-read-paths.ts`
- Modify: `src/server/routes/repo.ts`
- Modify: `src/server/routes/repo.test.ts`
- Modify: `src/web/repo-client.ts`

- [ ] **Step 1: Write failing integration tests**

Append to `src/server/modules/repo-file-tree.test.ts`:

```ts
import { searchRepositoryFileTree } from '#/server/modules/repo-file-tree.ts'

test('searches local repository file tree', async () => {
  const root = await mkdtemp(join(tmpdir(), 'goblin-repo-file-search-'))
  const result = await searchRepositoryFileTree(root, root, 'readme', 10)
  expect(result.ok).toBe(false)
  expect(result.message).toBeTruthy()
})
```

Update the `repo-read-paths` mock in `src/server/routes/repo.test.ts` to include:

```ts
searchRepositoryFileTree: mocks.searchRepositoryFileTree,
```

Add `searchRepositoryFileTree: vi.fn(),` to the hoisted mocks object, set it in `beforeEach`:

```ts
mocks.searchRepositoryFileTree.mockResolvedValue({
  ok: true,
  matches: [{ relativePath: 'src/Button.tsx', kind: 'file' }],
  truncated: false,
  limit: 20,
})
```

Append this route test:

```ts
test('routes repository file search with normalized body values', async () => {
  const { createRepoRoutes } = await import('#/server/routes/repo.ts')
  const app = createRepoRoutes()

  const response = await app.request('http://localhost/file-search', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ repoId: '/repo', worktreePath: '/repo', query: 'button', limit: 500 }),
  })

  expect(response.status).toBe(200)
  await expect(response.json()).resolves.toEqual({
    ok: true,
    matches: [{ relativePath: 'src/Button.tsx', kind: 'file' }],
    truncated: false,
    limit: 20,
  })
  expect(mocks.searchRepositoryFileTree).toHaveBeenCalledWith('/repo', '/repo', 'button', 200, expect.any(AbortSignal))
})
```

- [ ] **Step 2: Run route/module tests and verify failure**

Run:

```bash
bun test src/server/modules/repo-file-tree.test.ts src/server/routes/repo.test.ts
```

Expected: fail because the search route and wrapper are not implemented.

- [ ] **Step 3: Wire backend module and read path**

Modify `src/server/modules/repo-file-tree.ts`:

```ts
import type { RepoFileSearchResult, RepoFileTreeResult } from '#/shared/file-tree.ts'
import { searchLocalFileTree } from '#/system/file-tree/search.ts'
import { listRemoteFileTreeDirectory, searchRemoteFileTree } from '#/system/ssh/git.ts'

export async function searchRepositoryFileTree(
  repoId: string,
  worktreePath: string,
  query: string,
  limit?: number,
  signal?: AbortSignal,
): Promise<RepoFileSearchResult> {
  if (signal?.aborted) return { ok: false, message: 'cancelled' }
  if (isRemoteRepoId(repoId)) {
    const target = await resolveRemoteRepoTarget(repoId)
    return await searchRemoteFileTree(target, worktreePath, query, { limit, signal })
  }
  return await searchLocalFileTree(worktreePath, query, { limit, signal })
}
```

Modify `src/server/modules/repo-read-paths.ts`:

```ts
import {
  getRepositoryFileTree as getRepositoryFileTreeRead,
  searchRepositoryFileTree as searchRepositoryFileTreeRead,
} from '#/server/modules/repo-file-tree.ts'
import type { RepoFileSearchResult, RepoFileTreeResult } from '#/shared/file-tree.ts'

export async function searchRepositoryFileTree(
  repoId: string,
  worktreePath: string,
  query: string,
  limit?: number,
  signal?: AbortSignal,
): Promise<RepoFileSearchResult> {
  return signal?.aborted
    ? { ok: false, message: 'cancelled' }
    : await searchRepositoryFileTreeRead(repoId, worktreePath, query, limit, signal)
}
```

- [ ] **Step 4: Wire route and web client**

Modify imports in `src/server/routes/repo.ts` to include `searchRepositoryFileTree` from read paths and `normalizeFileTreeSearchLimit` from shared file-tree.

Add the route after `/file-tree`:

```ts
app.post('/file-search', async (c) => {
  const body = await c.req.json().catch(() => null)
  const repoId = typeof body?.repoId === 'string' ? body.repoId : ''
  const worktreePath = typeof body?.worktreePath === 'string' ? body.worktreePath : ''
  const query = typeof body?.query === 'string' ? body.query : ''
  const limit = normalizeFileTreeSearchLimit(body?.limit)
  return c.json(
    await jsonOr(
      () => searchRepositoryFileTree(repoId, worktreePath, query, limit, c.req.raw.signal),
      { ok: false, message: 'error.failed-read-repo' },
      'file-search',
    ),
  )
})
```

Modify `src/web/repo-client.ts` imports:

```ts
import type {
  RepoFileSearchResult,
  RepoFileTransferRequest,
  RepoFileTransferResult,
  RepoFileTreeResult,
} from '#/shared/file-tree.ts'
```

Add:

```ts
export async function searchRepositoryFileTree(
  repoId: string,
  worktreePath: string,
  query: string,
  limit?: number,
  signal?: AbortSignal,
): Promise<RepoFileSearchResult> {
  return await postServerJson('/api/repo/file-search', { repoId, worktreePath, query, limit }, { signal })
}
```

- [ ] **Step 5: Run route/module tests and verify pass**

Run:

```bash
bun test src/server/modules/repo-file-tree.test.ts src/server/routes/repo.test.ts
```

Expected: pass.

## Task 5: Changes Tab Status-Only Refresh Button

**Files:**
- Modify: `src/web/components/repo-workspace/ProjectChangesPanel.tsx`
- Modify: `src/web/components/repo-workspace/ProjectChangesPanel.test.tsx`

- [ ] **Step 1: Write failing component test**

Append to `ProjectChangesPanel.test.tsx`:

```ts
test('refresh icon refreshes only selected repository status', async () => {
  const refreshStatus = vi.fn(async () => undefined)
  const syncAndRefresh = vi.fn(async () => undefined)
  useReposStore.setState({ refreshStatus, syncAndRefresh } as Partial<ReturnType<typeof useReposStore.getState>>)
  seedRepoState({
    id: REPO_ID,
    branches: [createRepoBranch('feature/worktree', { worktree: { path: WORKTREE_PATH } })],
    selectedBranch: 'feature/worktree',
    statusLoaded: true,
    status: [
      {
        path: WORKTREE_PATH,
        branch: 'feature/worktree',
        isMain: true,
        entries: [{ x: 'M', y: ' ', path: 'src/app.ts' }],
      },
    ],
  })
  const token = useReposStore.getState().repos[REPO_ID]!.instanceToken

  await act(async () => {
    root!.render(
      <InlineCommitDraftProvider>
        <ProjectChangesPanel repoId={REPO_ID} />
      </InlineCommitDraftProvider>,
    )
  })

  await act(async () => {
    container?.querySelector<HTMLButtonElement>('button[aria-label="changes.refresh"]')?.click()
    await Promise.resolve()
  })

  expect(refreshStatus).toHaveBeenCalledWith(REPO_ID, { token })
  expect(syncAndRefresh).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run the component test and verify failure**

Run:

```bash
bun test src/web/components/repo-workspace/ProjectChangesPanel.test.tsx
```

Expected: fail because the refresh button is missing.

- [ ] **Step 3: Implement the button**

In `ProjectChangesPanel.tsx`, add imports:

```ts
import { FolderTree, RefreshCw, RotateCcw } from 'lucide-react'
import { resourceBusy } from '#/web/stores/repos/resources.ts'
import { AsyncButton } from '#/web/components/AsyncButton.tsx'
```

Include `resources.status` in the selected repo shape and equality check if it is not already covered by `a.resources.status === b.resources.status`.

Pass `statusRefreshing={resourceBusy(repo.resources.status)}` to `ProjectChangesActionBar`.

Update `ProjectChangesActionBar` props:

```ts
statusRefreshing: boolean
onRefreshStatus: () => void
```

Render this button before the commit controls:

```tsx
<AsyncButton
  type="button"
  size="icon-xs"
  variant="ghost"
  loading={statusRefreshing}
  disabled={statusRefreshing}
  aria-label={t('changes.refresh')}
  title={t('changes.refresh')}
  onClick={onRefreshStatus}
>
  {({ busy }) => <RefreshCw className={busy ? 'size-3.5 animate-spin' : 'size-3.5'} />}
</AsyncButton>
```

Pass the handler from `ProjectChangesPanel`:

```ts
onRefreshStatus={() => {
  void useReposStore.getState().refreshStatus(repo.id, { token: repo.instanceToken })
}}
```

- [ ] **Step 4: Run the component test and verify pass**

Run:

```bash
bun test src/web/components/repo-workspace/ProjectChangesPanel.test.tsx
```

Expected: pass.

## Task 6: Renderer Search Helpers

**Files:**
- Create: `src/web/components/file-tree/search.ts`
- Create: `src/web/components/file-tree/search.test.ts`

- [ ] **Step 1: Write failing helper tests**

Create `src/web/components/file-tree/search.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import {
  mergeFileTreeSearchMatches,
  searchLoadedFileTreeNodes,
  type FileTreeSearchNode,
} from '#/web/components/file-tree/search.ts'

const nodes: FileTreeSearchNode[] = [
  { id: 'src', name: 'src', relativePath: 'src', kind: 'directory' },
  { id: 'src/Button.tsx', name: 'Button.tsx', relativePath: 'src/Button.tsx', kind: 'file' },
  { id: 'docs/button-guide.md', name: 'button-guide.md', relativePath: 'docs/button-guide.md', kind: 'file' },
]

describe('file tree search helpers', () => {
  test('finds loaded nodes by file name and path rank', () => {
    expect(searchLoadedFileTreeNodes('button', nodes).map((match) => match.relativePath)).toEqual([
      'src/Button.tsx',
      'docs/button-guide.md',
    ])
  })

  test('merges fallback results without duplicating loaded nodes', () => {
    expect(
      mergeFileTreeSearchMatches(
        'button',
        [{ source: 'loaded', id: 'src/Button.tsx', relativePath: 'src/Button.tsx', kind: 'file' }],
        [
          { relativePath: 'src/Button.tsx', kind: 'file' },
          { relativePath: 'src/components/IconButton.tsx', kind: 'file' },
        ],
      ),
    ).toEqual([
      { source: 'loaded', id: 'src/Button.tsx', relativePath: 'src/Button.tsx', kind: 'file' },
      { source: 'fallback', relativePath: 'src/components/IconButton.tsx', kind: 'file' },
    ])
  })
})
```

- [ ] **Step 2: Run helper tests and verify failure**

Run:

```bash
bun test src/web/components/file-tree/search.test.ts
```

Expected: fail because the helper file does not exist.

- [ ] **Step 3: Implement helper file**

Create `src/web/components/file-tree/search.ts`:

```ts
import {
  fileTreeSearchRank,
  sortRepoFileSearchMatches,
  type RepoFileSearchEntryKind,
  type RepoFileSearchMatch,
} from '#/shared/file-tree.ts'

export interface FileTreeSearchNode {
  id: string
  name: string
  relativePath: string
  kind: RepoFileSearchEntryKind
}

export type FileTreeSearchMatch =
  | {
      source: 'loaded'
      id: string
      relativePath: string
      kind: RepoFileSearchEntryKind
    }
  | {
      source: 'fallback'
      relativePath: string
      kind: RepoFileSearchEntryKind
    }

export function searchLoadedFileTreeNodes(query: string, nodes: FileTreeSearchNode[]): FileTreeSearchMatch[] {
  const trimmed = query.trim()
  if (!trimmed) return []
  return sortRepoFileSearchMatches(
    trimmed,
    nodes
      .filter((node) => fileTreeSearchRank(trimmed, node.relativePath) !== null || fileTreeSearchRank(trimmed, node.name) !== null)
      .map((node) => ({
        source: 'loaded' as const,
        id: node.id,
        relativePath: node.relativePath,
        kind: node.kind,
      })),
  )
}

export function mergeFileTreeSearchMatches(
  query: string,
  loaded: FileTreeSearchMatch[],
  fallback: RepoFileSearchMatch[],
): FileTreeSearchMatch[] {
  const seen = new Set(loaded.map((match) => match.relativePath))
  const fallbackOnly: FileTreeSearchMatch[] = fallback
    .filter((match) => {
      if (seen.has(match.relativePath)) return false
      seen.add(match.relativePath)
      return true
    })
    .map((match) => ({
      source: 'fallback' as const,
      relativePath: match.relativePath,
      kind: match.kind,
    }))
  return sortRepoFileSearchMatches(query, [...loaded, ...fallbackOnly])
}
```

- [ ] **Step 4: Run helper tests and verify pass**

Run:

```bash
bun test src/web/components/file-tree/search.test.ts
```

Expected: pass.

## Task 7: Files Tab Search UI

**Files:**
- Modify: `src/web/components/file-tree/ProjectFileTree.tsx`
- Modify: `src/web/components/file-tree/ProjectFileTree.test.tsx`

- [ ] **Step 1: Extend file tree client mock and add failing search tests**

In `ProjectFileTree.test.tsx`, add the mock:

```ts
const searchRepositoryFileTree = vi.fn(async () => ({
  ok: true as const,
  matches: [{ relativePath: 'src/app.ts', kind: 'file' as const }],
  truncated: false,
  limit: 100,
}))
```

Add it to the repo-client mock:

```ts
searchRepositoryFileTree: (...args: unknown[]) => searchRepositoryFileTree(...args),
```

Clear it in `beforeEach`.

Append tests:

```ts
test('searches loaded file tree nodes and jumps between matches', async () => {
  seedRepoWithSelectedBranch({ hasWorktree: true })

  await render(<ProjectFileTree repoId="/repo" />)

  const input = container?.querySelector<HTMLInputElement>('input[aria-label="file-tree.search-label"]')
  expect(input).toBeTruthy()
  await act(async () => {
    input!.value = 'readme'
    input!.dispatchEvent(new Event('input', { bubbles: true }))
    await Promise.resolve()
  })

  expect(container?.textContent).toContain('1 / 1')
  expect(treeItemByText('README.md').getAttribute('aria-selected')).toBe('true')
  expect(searchRepositoryFileTree).not.toHaveBeenCalled()
})

test('falls back to whole-worktree search when loaded nodes do not match', async () => {
  vi.useFakeTimers()
  seedRepoWithSelectedBranch({ hasWorktree: true })

  await render(<ProjectFileTree repoId="/repo" />)

  const input = container?.querySelector<HTMLInputElement>('input[aria-label="file-tree.search-label"]')
  await act(async () => {
    input!.value = 'app'
    input!.dispatchEvent(new Event('input', { bubbles: true }))
    vi.advanceTimersByTime(300)
    await Promise.resolve()
    await Promise.resolve()
  })

  expect(searchRepositoryFileTree).toHaveBeenCalledWith('/repo', '/repo', 'app', 100, expect.any(AbortSignal))
  expect(getRepositoryFileTree).toHaveBeenCalledWith('/repo', '/repo', '/repo/src', undefined)
  expect(treeItemByText('app.ts').getAttribute('aria-selected')).toBe('true')
  vi.useRealTimers()
})
```

- [ ] **Step 2: Run file tree tests and verify failure**

Run:

```bash
bun test src/web/components/file-tree/ProjectFileTree.test.tsx
```

Expected: fail because the search UI is missing.

- [ ] **Step 3: Add imports and search state**

In `ProjectFileTree.tsx`, add imports:

```ts
import { Search, ChevronUp, ChevronDown as ChevronDownIcon, Loader2, X } from 'lucide-react'
import { searchRepositoryFileTree } from '#/web/repo-client.ts'
import type { RepoFileSearchMatch } from '#/shared/file-tree.ts'
import {
  mergeFileTreeSearchMatches,
  searchLoadedFileTreeNodes,
  type FileTreeSearchMatch,
} from '#/web/components/file-tree/search.ts'
```

Add state near existing file tree state:

```ts
const [searchQuery, setSearchQuery] = useState('')
const [searchIndex, setSearchIndex] = useState(0)
const [fallbackSearch, setFallbackSearch] = useState<{
  query: string
  matches: RepoFileSearchMatch[]
  truncated: boolean
  loading: boolean
  error: string | null
}>({ query: '', matches: [], truncated: false, loading: false, error: null })
```

Reset search state in the existing `useEffect` that resets tree state on `worktreePath` changes:

```ts
setSearchQuery('')
setSearchIndex(0)
setFallbackSearch({ query: '', matches: [], truncated: false, loading: false, error: null })
```

- [ ] **Step 4: Extract reveal helper, then compute matches and fallback lifecycle**

Before adding search effects, extract the existing reveal `useEffect` body into a reusable callback inside `ProjectFileTree`:

```ts
const revealRelativePath = useCallback(
  async (relativePath: string, requestId: number | null = null) => {
    if (!worktreePath) return
    const activeWorktreePath = worktreePath

    async function ensureDirectory(relativePathToLoad: string, absolutePath: string): Promise<RepoFileTreeEntry[] | null> {
      const state = directoriesRef.current[relativePathToLoad]
      if (state?.entries) return state.entries
      const result = await loadDirectory(relativePathToLoad, absolutePath)
      if (!result?.ok) return null
      return result.entries
    }

    let entries = await ensureDirectory(ROOT_DIR, activeWorktreePath)
    if (!entries) return

    for (const directoryRelativePath of parentRelativePaths(relativePath)) {
      const entry = findEntry(entries, directoryRelativePath)
      if (!entry) return
      setExpandedDirs((current) => new Set(current).add(entry.relativePath))
      entries = await ensureDirectory(entry.relativePath, entry.absolutePath)
      if (!entries) return
    }

    const finalEntry = findEntry(entries, relativePath)
    const targetId = finalEntry ? finalEntry.relativePath : `virtual:${relativePath}`
    if (requestId !== null) revealRequestRef.current = requestId
    setSelection({ selected: new Set([targetId]), anchor: targetId })
    setFocusedNodeId(targetId)
    scheduleFileTreeNodeScroll(targetId)
  },
  [loadDirectory, worktreePath],
)
```

Replace the current external reveal effect with:

```ts
useEffect(() => {
  if (!worktreePath || !revealRequest) return
  const request = revealRequest
  if (revealRequestRef.current === request.id) return
  let cancelled = false
  void revealRelativePath(request.relativePath, request.id).then(() => {
    if (cancelled) return
  })
  return () => {
    cancelled = true
  }
}, [revealRelativePath, revealRequest, worktreePath])
```

Add after `flatNodes` is computed:

```ts
const loadedSearchMatches = useMemo(
  () =>
    searchLoadedFileTreeNodes(
      searchQuery,
      flatNodes.map((node) => ({
        id: node.id,
        name: node.name,
        relativePath: node.relativePath,
        kind: node.kind === 'virtual' ? 'other' : node.kind,
      })),
    ),
  [flatNodes, searchQuery],
)
const activeFallbackMatches = fallbackSearch.query === searchQuery.trim() ? fallbackSearch.matches : []
const searchMatches = useMemo(
  () => mergeFileTreeSearchMatches(searchQuery, loadedSearchMatches, activeFallbackMatches),
  [activeFallbackMatches, loadedSearchMatches, searchQuery],
)
const activeSearchMatch = searchMatches[searchMatches.length === 0 ? -1 : searchIndex % searchMatches.length] ?? null
```

Add fallback effect:

```ts
useEffect(() => {
  const query = searchQuery.trim()
  if (!worktreePath || !query || loadedSearchMatches.length > 0) return
  const controller = new AbortController()
  const timer = window.setTimeout(() => {
    setFallbackSearch({ query, matches: [], truncated: false, loading: true, error: null })
    void searchRepositoryFileTree(repoId, worktreePath, query, 100, controller.signal).then((result) => {
      if (controller.signal.aborted) return
      setFallbackSearch(
        result.ok
          ? { query, matches: result.matches, truncated: result.truncated, loading: false, error: null }
          : { query, matches: [], truncated: false, loading: false, error: result.message },
      )
    })
  }, 300)
  return () => {
    controller.abort()
    window.clearTimeout(timer)
  }
}, [loadedSearchMatches.length, repoId, searchQuery, worktreePath])
```

Add active match reveal effect:

```ts
useEffect(() => {
  if (!activeSearchMatch) return
  if (activeSearchMatch.source === 'loaded') {
    setSelection({ selected: new Set([activeSearchMatch.id]), anchor: activeSearchMatch.id })
    setFocusedNodeId(activeSearchMatch.id)
    scheduleFileTreeNodeScroll(activeSearchMatch.id)
    return
  }
  void revealRelativePath(activeSearchMatch.relativePath)
}, [activeSearchMatch, revealRelativePath])
```

- [ ] **Step 5: Add toolbar UI**

Replace `FileTreeToolbar` with props:

```ts
function FileTreeToolbar({
  searchQuery,
  searchCount,
  searchIndex,
  searchLoading,
  searchError,
  searchTruncated,
  searchDisabled,
  onSearchQueryChange,
  onSearchNext,
  onSearchPrevious,
  onSearchClear,
  onCreateDirectory,
  onRefresh,
}: {
  searchQuery: string
  searchCount: number
  searchIndex: number
  searchLoading: boolean
  searchError: string | null
  searchTruncated: boolean
  searchDisabled: boolean
  onSearchQueryChange: (value: string) => void
  onSearchNext: () => void
  onSearchPrevious: () => void
  onSearchClear: () => void
  onCreateDirectory: () => void
  onRefresh: () => void
}) {
```

Render this search control before the existing folder and refresh buttons:

```tsx
<div className="mr-auto flex min-w-0 flex-1 items-center gap-1">
  <Search className="size-3.5 shrink-0 text-muted-foreground" />
  <Input
    aria-label={t('file-tree.search-label')}
    placeholder={t('file-tree.search-placeholder')}
    value={searchQuery}
    disabled={searchDisabled}
    onChange={(event) => onSearchQueryChange(event.currentTarget.value)}
    onKeyDown={(event) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        if (event.shiftKey) onSearchPrevious()
        else onSearchNext()
      }
      event.stopPropagation()
    }}
    className="h-6 min-w-0 flex-1 px-2 py-0 text-[length:var(--goblin-file-tree-font-size)]"
  />
  {searchLoading ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" /> : null}
  {searchQuery && !searchLoading ? (
    <Button type="button" size="icon-xs" variant="ghost" aria-label={t('file-tree.search-clear')} onClick={onSearchClear}>
      <X className="size-3.5" />
    </Button>
  ) : null}
  {searchQuery ? (
    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
      {searchCount > 0 ? `${searchIndex + 1} / ${searchCount}` : t('file-tree.search-no-results')}
      {searchTruncated ? ` ${t('file-tree.search-truncated')}` : ''}
    </span>
  ) : null}
  <Button type="button" size="icon-xs" variant="ghost" disabled={searchCount === 0} aria-label={t('file-tree.search-previous')} onClick={onSearchPrevious}>
    <ChevronUp className="size-3.5" />
  </Button>
  <Button type="button" size="icon-xs" variant="ghost" disabled={searchCount === 0} aria-label={t('file-tree.search-next')} onClick={onSearchNext}>
    <ChevronDownIcon className="size-3.5" />
  </Button>
  {searchError ? <span className="truncate text-[11px] text-danger">{t(searchError)}</span> : null}
</div>
```

Pass props from `ProjectFileTree`:

```tsx
<FileTreeToolbar
  searchQuery={searchQuery}
  searchCount={searchMatches.length}
  searchIndex={searchMatches.length > 0 ? searchIndex % searchMatches.length : 0}
  searchLoading={fallbackSearch.loading}
  searchError={fallbackSearch.error}
  searchTruncated={fallbackSearch.query === searchQuery.trim() && fallbackSearch.truncated}
  searchDisabled={!worktreePath}
  onSearchQueryChange={(value) => {
    setSearchQuery(value)
    setSearchIndex(0)
  }}
  onSearchNext={() => setSearchIndex((current) => (searchMatches.length === 0 ? 0 : (current + 1) % searchMatches.length))}
  onSearchPrevious={() =>
    setSearchIndex((current) => (searchMatches.length === 0 ? 0 : (current - 1 + searchMatches.length) % searchMatches.length))
  }
  onSearchClear={() => {
    setSearchQuery('')
    setSearchIndex(0)
    setFallbackSearch({ query: '', matches: [], truncated: false, loading: false, error: null })
  }}
  onCreateDirectory={() => beginCreateDirectory(rootCreateDirectoryTarget())}
  onRefresh={() => refreshTreeDirectory(rootCreateDirectoryTarget())}
/>
```

- [ ] **Step 6: Run file tree tests and verify pass**

Run:

```bash
bun test src/web/components/file-tree/ProjectFileTree.test.tsx src/web/components/file-tree/search.test.ts
```

Expected: pass.

## Task 8: I18n and Final Verification

**Files:**
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`

- [ ] **Step 1: Add i18n keys**

Add these keys to all four dictionaries. English:

```ts
'changes.refresh': 'Refresh changes',
'file-tree.search-label': 'Search files',
'file-tree.search-placeholder': 'Search files',
'file-tree.search-clear': 'Clear file search',
'file-tree.search-next': 'Next file match',
'file-tree.search-previous': 'Previous file match',
'file-tree.search-no-results': '0 results',
'file-tree.search-truncated': 'first results',
```

Simplified Chinese:

```ts
'changes.refresh': '刷新变更',
'file-tree.search-label': '搜索文件',
'file-tree.search-placeholder': '搜索文件',
'file-tree.search-clear': '清除文件搜索',
'file-tree.search-next': '下一个文件匹配',
'file-tree.search-previous': '上一个文件匹配',
'file-tree.search-no-results': '0 个结果',
'file-tree.search-truncated': '前若干项',
```

Japanese:

```ts
'changes.refresh': '変更を更新',
'file-tree.search-label': 'ファイルを検索',
'file-tree.search-placeholder': 'ファイルを検索',
'file-tree.search-clear': 'ファイル検索をクリア',
'file-tree.search-next': '次のファイル一致',
'file-tree.search-previous': '前のファイル一致',
'file-tree.search-no-results': '0 件',
'file-tree.search-truncated': '先頭のみ',
```

Korean:

```ts
'changes.refresh': '변경 새로고침',
'file-tree.search-label': '파일 검색',
'file-tree.search-placeholder': '파일 검색',
'file-tree.search-clear': '파일 검색 지우기',
'file-tree.search-next': '다음 파일 일치',
'file-tree.search-previous': '이전 파일 일치',
'file-tree.search-no-results': '0개 결과',
'file-tree.search-truncated': '상위 결과',
```

- [ ] **Step 2: Run dictionary tests**

Run:

```bash
bun test src/shared/i18n/dictionaries.test.ts src/shared/i18n/snapshot.test.ts
```

Expected: pass. If snapshots are intentionally updated by the test harness, review the diff and keep only dictionary-key changes.

- [ ] **Step 3: Run targeted tests**

Run:

```bash
bun test src/shared/file-tree.test.ts src/system/file-tree/search.test.ts src/system/ssh/commands.test.ts src/system/ssh/git.test.ts src/server/modules/repo-file-tree.test.ts src/server/routes/repo.test.ts src/web/components/repo-workspace/ProjectChangesPanel.test.tsx src/web/components/file-tree/search.test.ts src/web/components/file-tree/ProjectFileTree.test.tsx
```

Expected: pass.

- [ ] **Step 4: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: pass.

- [ ] **Step 5: Run full test suite if targeted tests or typecheck expose shared-state regressions**

Run:

```bash
bun run test
```

Expected: pass.

- [ ] **Step 6: Review changed files without committing**

Run:

```bash
git status --short
git diff -- docs/superpowers/specs/2026-06-24-changes-status-refresh-file-search-design.md docs/superpowers/plans/2026-06-24-changes-status-refresh-file-search.md src/shared/file-tree.ts src/system/file-tree/search.ts src/system/file-tree/search.test.ts src/system/ssh/commands.ts src/system/ssh/commands.test.ts src/system/ssh/git.ts src/system/ssh/git.test.ts src/server/modules/repo-file-tree.ts src/server/modules/repo-file-tree.test.ts src/server/modules/repo-read-paths.ts src/server/routes/repo.ts src/server/routes/repo.test.ts src/web/repo-client.ts src/web/components/file-tree/search.ts src/web/components/file-tree/search.test.ts src/web/components/repo-workspace/ProjectChangesPanel.tsx src/web/components/repo-workspace/ProjectChangesPanel.test.tsx src/web/components/file-tree/ProjectFileTree.tsx src/web/components/file-tree/ProjectFileTree.test.tsx src/shared/i18n/en.ts src/shared/i18n/zh.ts src/shared/i18n/ja.ts src/shared/i18n/ko.ts
```

Expected: only this feature's docs, source, and tests are listed. Existing unrelated dirty files remain untouched.
