# Codex Commit Message Speed And Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Hobgoblin's inline `Codex` commit-message generation faster for common local changes and more detailed by default.

**Architecture:** Add a lightweight local Git context builder for commit-message summarization, then route only local Codex generation through it. Keep the renderer API, commit execution, Codex JSONL parsing, and Claude patch-based behavior unchanged.

**Tech Stack:** TypeScript in Node strip-only mode, Bun, Vitest, Hono server routes, existing `execa`-based Git helpers, React renderer.

**Project Constraint:** This repository's AGENTS.md says not to plan or execute git commit operations unless the user explicitly asks. This plan uses verification checkpoints instead of git commit steps.

---

## File Structure

- Create `src/system/git/commit-message-context.ts`
  - Owns lightweight Git context collection for local worktrees.
  - Uses existing `git()` helper for tracked status/stat/diff.
  - Reads only capped small untracked text files.
  - Formats a stable context string for Codex prompts.

- Create `src/system/git/commit-message-context.test.ts`
  - Unit tests context formatting, truncation, untracked limits, binary detection, and empty-change detection.

- Modify `src/system/commit-message-ai.ts`
  - Add `generateCodexCommitMessageFromContext()`.
  - Keep `generateCommitMessageFromPatch()` for Claude and remote fallback.
  - Keep provider executable resolution and JSONL parsing in one module.

- Modify `src/system/commit-message-ai.test.ts`
  - Add tests for the richer Codex context prompt.
  - Preserve existing patch prompt tests.

- Modify `src/server/modules/repo-backend.ts`
  - Add an optional local backend method for lightweight commit-message context.
  - Validate the requested worktree with existing `resolveKnownWorktree()` before collecting context.

- Modify `src/server/modules/repo-read-paths.ts`
  - Route `provider === 'codex'` and `backend.kind === 'local'` through the new context path.
  - Leave Claude and remote fallback on existing `backend.getPatch()` path.

- Modify `src/server/modules/repo.test.ts`
  - Add mocks and assertions for local Codex context routing.
  - Assert Claude still uses the patch path.
  - Preserve unknown-provider behavior.

---

### Task 1: Lightweight Git Context Builder

**Files:**
- Create: `src/system/git/commit-message-context.ts`
- Create: `src/system/git/commit-message-context.test.ts`

- [ ] **Step 1: Write failing tests for lightweight context collection**

Create `src/system/git/commit-message-context.test.ts` with:

```ts
import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  git: vi.fn(),
  lstat: vi.fn(),
  readFile: vi.fn(),
}))

vi.mock('#/system/git/helper.ts', () => ({
  git: mocks.git,
}))

vi.mock('node:fs/promises', () => ({
  lstat: mocks.lstat,
  readFile: mocks.readFile,
}))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  mocks.lstat.mockResolvedValue({
    isFile: () => true,
    isSymbolicLink: () => false,
    size: 20,
  })
  mocks.readFile.mockResolvedValue(Buffer.from('untracked note\n', 'utf8'))
})

describe('getWorktreeCommitMessageContext', () => {
  test('collects status, stat, tracked diff, and small untracked text content', async () => {
    mocks.git
      .mockResolvedValueOnce(' M src/app.ts\u0000?? notes.txt\u0000')
      .mockResolvedValueOnce(' src/app.ts | 2 +-\n 1 file changed, 1 insertion(+), 1 deletion(-)')
      .mockResolvedValueOnce('diff --git a/src/app.ts b/src/app.ts\n@@ -1 +1 @@\n-old\n+new')

    const { getWorktreeCommitMessageContext, formatCommitMessageContext, isEmptyCommitMessageContext } =
      await import('#/system/git/commit-message-context.ts')

    const context = await getWorktreeCommitMessageContext('/repo/worktree')

    expect(isEmptyCommitMessageContext(context)).toBe(false)
    expect(context.status).toEqual(['M  src/app.ts', '?? notes.txt'])
    expect(context.stat).toContain('src/app.ts | 2 +-')
    expect(context.diff).toContain('+new')
    expect(context.untracked).toContain('--- notes.txt')
    expect(context.untracked).toContain('untracked note')
    expect(context.omitted).toEqual([])
    expect(context.truncated).toBe(false)
    expect(formatCommitMessageContext(context)).toContain('Changed files:')
    expect(formatCommitMessageContext(context)).toContain('Untracked file excerpts:')
  })

  test('omits binary and oversized untracked files without reading them', async () => {
    mocks.git
      .mockResolvedValueOnce('?? assets/icon.png\u0000?? fixtures/large.json\u0000')
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('')
    mocks.lstat
      .mockResolvedValueOnce({
        isFile: () => true,
        isSymbolicLink: () => false,
        size: 10,
      })
      .mockResolvedValueOnce({
        isFile: () => true,
        isSymbolicLink: () => false,
        size: 40_000,
      })
    mocks.readFile.mockResolvedValueOnce(Buffer.from([0, 1, 2, 3]))

    const { getWorktreeCommitMessageContext } = await import('#/system/git/commit-message-context.ts')

    const context = await getWorktreeCommitMessageContext('/repo/worktree')

    expect(context.untracked).toBe('')
    expect(context.omitted).toContain('binary untracked file omitted: assets/icon.png')
    expect(context.omitted).toContain('oversized untracked file omitted: fixtures/large.json')
    expect(mocks.readFile).toHaveBeenCalledTimes(1)
  })

  test('caps tracked diff and records a truncation marker', async () => {
    mocks.git
      .mockResolvedValueOnce(' M src/large.ts\u0000')
      .mockResolvedValueOnce(' src/large.ts | 9000 +++++++++++++++++++++++++++++++++')
      .mockResolvedValueOnce(`diff --git a/src/large.ts b/src/large.ts\n${'+x\n'.repeat(30_000)}`)

    const { getWorktreeCommitMessageContext, formatCommitMessageContext } =
      await import('#/system/git/commit-message-context.ts')

    const context = await getWorktreeCommitMessageContext('/repo/worktree')

    expect(context.truncated).toBe(true)
    expect(context.diff.length).toBeLessThanOrEqual(40_050)
    expect(formatCommitMessageContext(context)).toContain('[tracked diff truncated]')
  })

  test('caps untracked file excerpts and summarizes skipped files', async () => {
    const status = Array.from({ length: 12 }, (_value, index) => `?? file-${index}.txt`).join('\u0000') + '\u0000'
    mocks.git.mockResolvedValueOnce(status).mockResolvedValueOnce('').mockResolvedValueOnce('')
    mocks.readFile.mockImplementation(async (filePath: string) => Buffer.from(`content for ${filePath}\n`, 'utf8'))

    const { getWorktreeCommitMessageContext } = await import('#/system/git/commit-message-context.ts')

    const context = await getWorktreeCommitMessageContext('/repo/worktree')

    expect(context.untracked).toContain('file-0.txt')
    expect(context.untracked).toContain('file-9.txt')
    expect(context.untracked).not.toContain('file-10.txt')
    expect(context.omitted).toContain('2 untracked files omitted after limit 10')
  })

  test('reports empty context when status, stat, diff, and untracked excerpts are empty', async () => {
    mocks.git.mockResolvedValueOnce('').mockResolvedValueOnce('').mockResolvedValueOnce('')

    const { getWorktreeCommitMessageContext, isEmptyCommitMessageContext } =
      await import('#/system/git/commit-message-context.ts')

    const context = await getWorktreeCommitMessageContext('/repo/worktree')

    expect(isEmptyCommitMessageContext(context)).toBe(true)
  })
})
```

- [ ] **Step 2: Run the new tests and verify they fail**

Run:

```sh
bun run test src/system/git/commit-message-context.test.ts
```

Expected: fail because `src/system/git/commit-message-context.ts` does not exist.

- [ ] **Step 3: Implement the lightweight context builder**

Create `src/system/git/commit-message-context.ts` with:

```ts
import path from 'node:path'
import { lstat, readFile } from 'node:fs/promises'
import { git } from '#/system/git/helper.ts'
import { parseStatus } from '#/system/git/parsers.ts'

const MAX_TRACKED_DIFF_LENGTH = 40_000
const MAX_UNTRACKED_TOTAL_LENGTH = 16_000
const MAX_UNTRACKED_FILE_LENGTH = 8_000
const MAX_UNTRACKED_FILES_WITH_CONTENT = 10

export interface CommitMessageContext {
  status: string[]
  stat: string
  diff: string
  untracked: string
  omitted: string[]
  truncated: boolean
}

export async function getWorktreeCommitMessageContext(
  worktreePath: string,
  options?: { signal?: AbortSignal },
): Promise<CommitMessageContext> {
  const signal = options?.signal
  const statusOutput = await git(worktreePath, ['status', '--porcelain', '-z', '-uall'], { signal })
  const statusEntries = parseStatus(statusOutput)
  const status = statusEntries.map((entry) => {
    const code = `${entry.x}${entry.y}`.trimEnd().padEnd(2, ' ')
    return entry.originalPath ? `${code} ${entry.originalPath} -> ${entry.path}` : `${code} ${entry.path}`
  })

  const stat = await git(worktreePath, ['diff', '--stat', 'HEAD', '--'], { signal })
  const trackedDiff = await git(worktreePath, ['diff', 'HEAD', '--'], { signal })
  const cappedDiff = capText(trackedDiff, MAX_TRACKED_DIFF_LENGTH)
  const untrackedPaths = statusEntries.filter((entry) => entry.x === '?' && entry.y === '?').map((entry) => entry.path)
  const untracked = await collectUntrackedExcerpts(worktreePath, untrackedPaths, signal)

  return {
    status,
    stat,
    diff: cappedDiff.text,
    untracked: untracked.text,
    omitted: untracked.omitted,
    truncated: cappedDiff.truncated || untracked.truncated,
  }
}

export function isEmptyCommitMessageContext(context: CommitMessageContext): boolean {
  return (
    context.status.length === 0 &&
    !context.stat.trim() &&
    !context.diff.trim() &&
    !context.untracked.trim() &&
    context.omitted.length === 0
  )
}

export function formatCommitMessageContext(context: CommitMessageContext): string {
  const sections: string[] = []
  if (context.status.length > 0) {
    sections.push(['Changed files:', ...context.status].join('\n'))
  }
  if (context.stat.trim()) {
    sections.push(['Diff stat:', context.stat.trim()].join('\n'))
  }
  if (context.diff.trim()) {
    sections.push(['Tracked text diff:', context.diff.trim()].join('\n'))
  }
  if (context.untracked.trim()) {
    sections.push(['Untracked file excerpts:', context.untracked.trim()].join('\n'))
  }
  if (context.omitted.length > 0 || context.truncated) {
    const notes = [...context.omitted]
    if (context.truncated) notes.push('[tracked diff truncated]')
    sections.push(['Omissions and limits:', ...notes].join('\n'))
  }
  return sections.join('\n\n').trim()
}

async function collectUntrackedExcerpts(
  worktreePath: string,
  untrackedPaths: string[],
  signal?: AbortSignal,
): Promise<{ text: string; omitted: string[]; truncated: boolean }> {
  const excerpts: string[] = []
  const omitted: string[] = []
  let totalLength = 0
  let included = 0
  let truncated = false

  for (const relativePath of untrackedPaths) {
    if (signal?.aborted) throw new Error('cancelled')
    if (included >= MAX_UNTRACKED_FILES_WITH_CONTENT) {
      omitted.push(`${untrackedPaths.length - included} untracked files omitted after limit ${MAX_UNTRACKED_FILES_WITH_CONTENT}`)
      break
    }

    const resolved = path.resolve(worktreePath, relativePath)
    if (!isInsideWorktree(worktreePath, resolved)) {
      omitted.push(`unsafe untracked path omitted: ${relativePath}`)
      continue
    }

    const stat = await lstat(resolved)
    if (!stat.isFile() || stat.isSymbolicLink()) {
      omitted.push(`non-regular untracked path omitted: ${relativePath}`)
      continue
    }
    if (stat.size > MAX_UNTRACKED_FILE_LENGTH) {
      omitted.push(`oversized untracked file omitted: ${relativePath}`)
      continue
    }

    const content = await readFile(resolved)
    if (isBinary(content)) {
      omitted.push(`binary untracked file omitted: ${relativePath}`)
      continue
    }

    const text = content.toString('utf8')
    const nextExcerpt = `--- ${relativePath}\n${text.trimEnd()}`
    if (totalLength + nextExcerpt.length > MAX_UNTRACKED_TOTAL_LENGTH) {
      omitted.push(`untracked text excerpts truncated before: ${relativePath}`)
      truncated = true
      break
    }

    excerpts.push(nextExcerpt)
    totalLength += nextExcerpt.length
    included += 1
  }

  return { text: excerpts.join('\n\n'), omitted, truncated }
}

function capText(text: string, maxLength: number): { text: string; truncated: boolean } {
  if (text.length <= maxLength) return { text, truncated: false }
  return { text: text.slice(0, maxLength).trimEnd(), truncated: true }
}

function isBinary(content: Buffer): boolean {
  return content.includes(0)
}

function isInsideWorktree(worktreePath: string, candidate: string): boolean {
  const root = path.resolve(worktreePath)
  return candidate === root || candidate.startsWith(`${root}${path.sep}`)
}
```

- [ ] **Step 4: Run the context tests and verify they pass**

Run:

```sh
bun run test src/system/git/commit-message-context.test.ts
```

Expected: pass.

- [ ] **Step 5: Run TypeScript validation for the new module**

Run:

```sh
bun run typecheck
```

Expected: pass.

---

### Task 2: Codex Context Prompt And Generation

**Files:**
- Modify: `src/system/commit-message-ai.ts`
- Modify: `src/system/commit-message-ai.test.ts`

- [ ] **Step 1: Add failing tests for Codex context generation**

In `src/system/commit-message-ai.test.ts`, add these tests inside `describe('commit message AI providers', () => { ... })`:

```ts
  test('generates Codex messages from lightweight context with a detailed English prompt', async () => {
    mocks.execa.mockResolvedValueOnce({
      exitCode: 0,
      stdout: JSON.stringify({
        type: 'item.completed',
        item: {
          id: 'item_1',
          type: 'agent_message',
          text: 'feat: improve commit message generation\n\n- Use compact Git context for Codex prompts.\n- Include enough detail for useful commit bodies.',
        },
      }),
      stderr: '',
    })

    const { generateCodexCommitMessageFromContext } = await import('#/system/commit-message-ai.ts')

    await expect(
      generateCodexCommitMessageFromContext(
        {
          status: ['M  src/system/commit-message-ai.ts'],
          stat: ' src/system/commit-message-ai.ts | 20 +++++++++++++++-----',
          diff: 'diff --git a/src/system/commit-message-ai.ts b/src/system/commit-message-ai.ts\n+new prompt',
          untracked: '',
          omitted: [],
          truncated: false,
        },
        { cwd: '/repo/worktree' },
      ),
    ).resolves.toEqual({
      ok: true,
      message:
        'feat: improve commit message generation\n\n- Use compact Git context for Codex prompts.\n- Include enough detail for useful commit bodies.',
    })

    const prompt = mocks.execa.mock.calls[0]![1].at(-1) as string
    expect(prompt).toContain('Write a complete Git commit message in English.')
    expect(prompt).toContain('Prefer Conventional Commits style when it fits.')
    expect(prompt).toContain('Use a subject line, a blank line, then 2 to 4 concise body bullets')
    expect(prompt).toContain('Do not invent ticket numbers, issue links, reviewers, benchmarks, or behavior not visible')
    expect(prompt).toContain('Changed files:')
    expect(prompt).toContain('Tracked text diff:')
    expect(prompt).not.toContain('add a body only when it clarifies important details')
  })

  test('rejects empty lightweight context before invoking Codex', async () => {
    const { generateCodexCommitMessageFromContext } = await import('#/system/commit-message-ai.ts')

    await expect(
      generateCodexCommitMessageFromContext({
        status: [],
        stat: '',
        diff: '',
        untracked: '',
        omitted: [],
        truncated: false,
      }),
    ).resolves.toEqual({
      ok: false,
      message: 'error.commit-message-empty-patch',
    })

    expect(mocks.execa).not.toHaveBeenCalled()
  })
```

- [ ] **Step 2: Run the focused AI tests and verify they fail**

Run:

```sh
bun run test src/system/commit-message-ai.test.ts
```

Expected: fail because `generateCodexCommitMessageFromContext()` is not exported.

- [ ] **Step 3: Add context-based Codex generation**

Modify `src/system/commit-message-ai.ts`.

Add this import near the existing imports:

```ts
import {
  formatCommitMessageContext,
  isEmptyCommitMessageContext,
  type CommitMessageContext,
} from '#/system/git/commit-message-context.ts'
```

Add this exported function after `generateCommitMessageFromPatch()`:

```ts
export async function generateCodexCommitMessageFromContext(
  context: CommitMessageContext,
  options?: GenerateCommitMessageOptions,
): Promise<CommitMessageGenerationResult> {
  if (isEmptyCommitMessageContext(context)) return { ok: false, message: 'error.commit-message-empty-patch' }

  const command = PROVIDER_COMMANDS.codex
  const prompt = buildCodexCommitMessagePrompt(context)

  try {
    const result = await runGenerationCommand(command.command, command.args(prompt), command.input?.(prompt), options)
    if (isCommandNotFound(result)) return await generateCodexWithResolvedExecutable(command, prompt, options)
    return mapGenerationResult(result, command.outputMode, options?.signal)
  } catch (err) {
    if (isCommandNotFound(err)) {
      return await generateCodexWithResolvedExecutable(command, prompt, options)
    }
    return mapGenerationError(err, options?.signal)
  }
}
```

Add this helper after `generateWithResolvedExecutable()`:

```ts
async function generateCodexWithResolvedExecutable(
  command: ProviderCommand,
  prompt: string,
  options?: GenerateCommitMessageOptions,
): Promise<CommitMessageGenerationResult> {
  const executable = await resolveProviderExecutable('codex', options?.signal, { skipDirect: true })
  if (!executable) return { ok: false, message: 'error.commit-message-provider-unavailable' }
  try {
    return mapGenerationResult(
      await runGenerationCommand(executable, command.args(prompt), command.input?.(prompt), options),
      command.outputMode,
      options?.signal,
    )
  } catch (err) {
    return mapGenerationError(err, options?.signal)
  }
}
```

Add this prompt builder near `buildCommitMessagePrompt()`:

```ts
function buildCodexCommitMessagePrompt(context: CommitMessageContext): string {
  return [
    'Write a complete Git commit message in English.',
    'Return only the commit message.',
    'Prefer Conventional Commits style when it fits.',
    'Use an imperative subject line.',
    'Use a subject line, a blank line, then 2 to 4 concise body bullets when there is enough signal.',
    'For a truly trivial change, a single subject line is acceptable.',
    'Mention concrete changed areas and user-visible impact only when visible from the context.',
    'Mention tests or verification only when the context shows test changes or verification artifacts.',
    'Do not invent ticket numbers, issue links, reviewers, benchmarks, or behavior not visible in the context.',
    'Do not mention Codex or this prompt.',
    'Do not use Markdown fences.',
    '',
    'Commit context:',
    formatCommitMessageContext(context),
  ].join('\n')
}
```

- [ ] **Step 4: Run the focused AI tests and verify they pass**

Run:

```sh
bun run test src/system/commit-message-ai.test.ts
```

Expected: pass.

- [ ] **Step 5: Run the context and AI tests together**

Run:

```sh
bun run test src/system/git/commit-message-context.test.ts src/system/commit-message-ai.test.ts
```

Expected: pass.

---

### Task 3: Server And Backend Routing

**Files:**
- Modify: `src/server/modules/repo-backend.ts`
- Modify: `src/server/modules/repo-read-paths.ts`
- Modify: `src/server/modules/repo.test.ts`

- [ ] **Step 1: Add failing server tests for provider-specific routing**

Modify the hoisted mocks in `src/server/modules/repo.test.ts` to include:

```ts
  getWorktreeCommitMessageContext: vi.fn(),
  generateCodexCommitMessageFromContext: vi.fn(),
```

Add this module mock near the existing `#/system/git/patch.ts` mock:

```ts
vi.mock('#/system/git/commit-message-context.ts', () => ({
  getWorktreeCommitMessageContext: mocks.getWorktreeCommitMessageContext,
}))
```

Update the existing `#/system/commit-message-ai.ts` mock to export the new function:

```ts
vi.mock('#/system/commit-message-ai.ts', () => ({
  probeCommitMessageProviders: mocks.probeCommitMessageProviders,
  generateCommitMessageFromPatch: mocks.generateCommitMessageFromPatch,
  generateCodexCommitMessageFromContext: mocks.generateCodexCommitMessageFromContext,
}))
```

In `beforeEach`, add:

```ts
  mocks.generateCodexCommitMessageFromContext.mockResolvedValue({ ok: true, message: 'feat: generated codex message' })
  mocks.getWorktreeCommitMessageContext.mockResolvedValue({
    status: ['M  src/app.ts'],
    stat: ' src/app.ts | 2 +-',
    diff: 'diff --git a/src/app.ts b/src/app.ts\n+new',
    untracked: '',
    omitted: [],
    truncated: false,
  })
```

Replace the existing Codex read-path test under `describe('commit message AI read paths', () => { ... })` with:

```ts
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
    expect(mocks.generateCommitMessageFromPatch).toHaveBeenCalledWith(
      'claude',
      'diff --git a/a b/a\n+hello\n',
      { cwd: '/tmp/repo', signal: undefined },
    )
    expect(mocks.getWorktreeCommitMessageContext).not.toHaveBeenCalled()
    expect(mocks.generateCodexCommitMessageFromContext).not.toHaveBeenCalled()
  })
```

- [ ] **Step 2: Run server tests and verify they fail**

Run:

```sh
bun run test src/server/modules/repo.test.ts
```

Expected: fail because the backend and read path still route Codex through `getPatch()`.

- [ ] **Step 3: Add local backend context validation**

Modify `src/server/modules/repo-backend.ts`.

Add imports near the existing patch import:

```ts
import {
  getWorktreeCommitMessageContext,
  type CommitMessageContext,
} from '#/system/git/commit-message-context.ts'
```

Add this result type near `RepoBackendCapabilities`:

```ts
export type CommitMessageContextResult =
  | { ok: true; worktreePath: string; context: CommitMessageContext }
  | { ok: false; message: string }
```

Add this optional method to `RepoBackend`:

```ts
  getCommitMessageContext?(worktreePath: string, signal?: AbortSignal): Promise<CommitMessageContextResult>
```

In the local backend object, add this method before `getPatch()`:

```ts
    async getCommitMessageContext(worktreePath, signal) {
      if (!isValidCwd(repoId)) return { ok: false, message: 'error.invalid-arguments' }
      const worktrees = await getWorktrees(repoId, { includeStatus: false, signal })
      const known = resolveKnownWorktree(worktrees, worktreePath)
      if (!known.ok) return { ok: false, message: known.message }
      try {
        return {
          ok: true,
          worktreePath: known.path,
          context: await getWorktreeCommitMessageContext(known.path, { signal }),
        }
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : String(err) }
      }
    },
```

Do not add a remote implementation. The method is optional so remote backends fall back to the existing patch path.

- [ ] **Step 4: Route local Codex through lightweight context**

Modify `src/server/modules/repo-read-paths.ts`.

Change the import from `src/system/commit-message-ai.ts` to:

```ts
import {
  generateCodexCommitMessageFromContext,
  generateCommitMessageFromPatch,
  probeCommitMessageProviders,
} from '#/system/commit-message-ai.ts'
```

Update `generateRepositoryCommitMessage()` to:

```ts
export async function generateRepositoryCommitMessage(
  cwd: string,
  worktreePath: string,
  provider: unknown,
  signal?: AbortSignal,
): Promise<CommitMessageGenerationResult> {
  if (!isCommitMessageProvider(provider)) return { ok: false, message: 'error.commit-message-provider-unavailable' }
  return await runWithRepoBackend(cwd, async (backend) => {
    if (provider === 'codex' && backend.kind === 'local' && backend.getCommitMessageContext) {
      const context = await backend.getCommitMessageContext(worktreePath, signal)
      if (!context.ok) return { ok: false, message: context.message }
      return await generateCodexCommitMessageFromContext(context.context, {
        cwd: context.worktreePath,
        signal,
      })
    }

    const patch = await backend.getPatch(worktreePath, signal)
    if (!patch.ok) return patch
    const generationCwd = backend.kind === 'local' ? worktreePath : undefined
    return await generateCommitMessageFromPatch(provider, patch.message, { cwd: generationCwd, signal })
  })
}
```

- [ ] **Step 5: Run server tests and verify they pass**

Run:

```sh
bun run test src/server/modules/repo.test.ts
```

Expected: pass.

- [ ] **Step 6: Run focused cross-layer tests**

Run:

```sh
bun run test src/system/git/commit-message-context.test.ts src/system/commit-message-ai.test.ts src/server/modules/repo.test.ts
```

Expected: pass.

---

### Task 4: Regression Verification

**Files:**
- No source edits in this task.

- [ ] **Step 1: Run existing inline commit draft tests**

Run:

```sh
bun run test src/web/components/branch-list/InlineCommitDraftProvider.test.tsx src/web/components/branch-list/BranchWriteDialogs.test.tsx
```

Expected: pass. These verify the unchanged UI fill, replacement confirmation, and provider error display behavior.

- [ ] **Step 2: Run typecheck**

Run:

```sh
bun run typecheck
```

Expected: pass.

- [ ] **Step 3: Run architecture guard**

Run:

```sh
bun run check:architecture
```

Expected: pass. The new system helper must not import web, main, server, or electron modules.

- [ ] **Step 4: Run the full test suite**

Run:

```sh
bun run test
```

Expected: pass.

- [ ] **Step 5: Manual local smoke check**

Open Hobgoblin, use a local repository with a small text change, then:

1. Open the branch row `Commit` form.
2. Click `Codex`.
3. Confirm the textarea fills with an English commit message.
4. Confirm the message usually has:
   - one Conventional Commit style subject
   - a blank line
   - 2 to 4 useful detail lines for non-trivial changes
5. Confirm the Git commit still only runs after clicking `Commit`.

Expected: common small local changes return faster than the old patch path and no commit is executed by generation alone.

---

## Self-Review Checklist

- Spec coverage:
  - Local Hobgoblin inline `Codex` generation is covered by Tasks 1 through 3.
  - More detailed English prompt is covered by Task 2.
  - Claude unchanged is covered by Task 3.
  - UI unchanged is covered by Task 4 regression tests.
  - Remote fallback is covered by keeping the optional backend method local-only and retaining the patch path for all other cases.

- Type consistency:
  - `CommitMessageContext` is defined in `src/system/git/commit-message-context.ts`.
  - `generateCodexCommitMessageFromContext()` accepts `CommitMessageContext`.
  - `RepoBackend.getCommitMessageContext()` returns `CommitMessageContextResult`.

- Project safety:
  - No git commit steps are included.
  - No destructive Git operation is introduced.
  - Commit execution remains unchanged.
