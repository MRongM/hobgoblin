# Commit Message AI Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional Codex / Claude buttons to the commit dialog that generate a commit message from the current worktree's uncommitted diff without changing the actual commit flow.

**Architecture:** Keep AI generation read-only and separate from `commitAllChanges()`. The renderer asks the server for provider availability and generated text; the server reuses the existing patch read path and delegates provider execution to a small whitelisted system module. No settings page, provider preference, or generic AI framework is added.

**Tech Stack:** React 19, Vitest, Hono server routes, Bun runtime, `execa`, existing repo server modules, existing shadcn-style UI primitives.

**Repo Note:** This repository's AGENTS instructions prohibit planning or executing git commits unless explicitly requested. This plan intentionally has verification checkpoints but no commit steps.

---

## File Structure

- Create: `src/shared/commit-message-ai.ts`
  - Owns provider/result shared types and validation helpers.
- Create: `src/system/commit-message-ai.ts`
  - Owns provider probing, CLI invocation, prompt construction, output normalization, timeout/error mapping.
- Create: `src/system/commit-message-ai.test.ts`
  - Unit tests for probe, command args, empty patch behavior, output cleanup, timeout/failure mapping.
- Modify: `src/server/modules/repo-read-paths.ts`
  - Adds `getCommitMessageProviders()` and `generateRepositoryCommitMessage()`.
- Modify: `src/server/routes/repo.ts`
  - Adds `/commit-message-providers` and `/generate-commit-message`.
- Modify: `src/server/modules/repo.test.ts`
  - Covers read-path generation behavior through mocked patch/provider helpers.
- Modify: `src/web/repo-client.ts`
  - Adds client calls for provider detection and generation.
- Modify: `src/web/repo-client.test.ts`
  - Verifies request bodies and endpoint paths.
- Modify: `src/web/components/branch-list/BranchWriteDialogs.tsx`
  - Adds provider buttons, generation loading/error state, abort handling, and replace confirmation.
- Create: `src/web/components/branch-list/BranchWriteDialogs.test.tsx`
  - Focused renderer tests for `CommitDialog`.
- Modify: `src/web/hooks/useBranchWriteActions.tsx`
  - Passes `repoId` and `worktreePath` into `CommitDialog`.
- Modify: `src/shared/i18n/en.ts`, `zh.ts`, `ja.ts`, `ko.ts`
  - Adds user-visible generation labels and error messages.

---

## Task 1: Shared Contract And i18n Keys

**Files:**
- Create: `src/shared/commit-message-ai.ts`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`

- [ ] **Step 1: Create the shared provider contract**

Create `src/shared/commit-message-ai.ts`:

```ts
export const COMMIT_MESSAGE_PROVIDERS = ['codex', 'claude'] as const

export type CommitMessageProvider = (typeof COMMIT_MESSAGE_PROVIDERS)[number]

export interface CommitMessageProviderAvailability {
  codex: boolean
  claude: boolean
}

export interface CommitMessageGenerationRequest {
  repoId: string
  worktreePath: string
  provider: CommitMessageProvider
}

export interface CommitMessageGenerationResult {
  ok: boolean
  message: string
}

export function isCommitMessageProvider(value: unknown): value is CommitMessageProvider {
  return value === 'codex' || value === 'claude'
}
```

- [ ] **Step 2: Add English i18n keys**

In `src/shared/i18n/en.ts`, near the existing `action.commit-*` keys, add:

```ts
  'action.commit-generate-codex': 'Codex',
  'action.commit-generate-claude': 'Claude',
  'action.commit-generate-loading': 'Generating…',
  'action.commit-replace-message-title': 'Replace commit message?',
  'action.commit-replace-message-body': 'This will replace the message currently in the commit box.',
  'action.commit-replace-message-confirm': 'Replace',
  'error.commit-message-empty-patch': 'No changes to summarize.',
  'error.commit-message-provider-unavailable': 'Commit message provider is unavailable.',
  'error.commit-message-timeout': 'Commit message generation timed out.',
  'error.commit-message-failed': 'Commit message generation failed.',
  'error.commit-message-empty-output': 'Commit message provider returned an empty message.',
```

- [ ] **Step 3: Add Simplified Chinese i18n keys**

In `src/shared/i18n/zh.ts`, near the existing `action.commit-*` keys, add:

```ts
  'action.commit-generate-codex': 'Codex',
  'action.commit-generate-claude': 'Claude',
  'action.commit-generate-loading': '生成中…',
  'action.commit-replace-message-title': '替换提交信息？',
  'action.commit-replace-message-body': '这会替换提交框里已有的内容。',
  'action.commit-replace-message-confirm': '替换',
  'error.commit-message-empty-patch': '没有可总结的改动。',
  'error.commit-message-provider-unavailable': '提交信息生成器不可用。',
  'error.commit-message-timeout': '提交信息生成超时。',
  'error.commit-message-failed': '提交信息生成失败。',
  'error.commit-message-empty-output': '提交信息生成器返回了空内容。',
```

- [ ] **Step 4: Add Japanese i18n keys**

In `src/shared/i18n/ja.ts`, near the existing `action.commit-*` keys, add:

```ts
  'action.commit-generate-codex': 'Codex',
  'action.commit-generate-claude': 'Claude',
  'action.commit-generate-loading': '生成中…',
  'action.commit-replace-message-title': 'コミットメッセージを置き換えますか？',
  'action.commit-replace-message-body': 'コミット欄の現在の内容を置き換えます。',
  'action.commit-replace-message-confirm': '置き換え',
  'error.commit-message-empty-patch': '要約する変更がありません。',
  'error.commit-message-provider-unavailable': 'コミットメッセージ生成ツールを利用できません。',
  'error.commit-message-timeout': 'コミットメッセージ生成がタイムアウトしました。',
  'error.commit-message-failed': 'コミットメッセージ生成に失敗しました。',
  'error.commit-message-empty-output': 'コミットメッセージ生成ツールが空のメッセージを返しました。',
```

- [ ] **Step 5: Add Korean i18n keys**

In `src/shared/i18n/ko.ts`, near the existing `action.commit-*` keys, add:

```ts
  'action.commit-generate-codex': 'Codex',
  'action.commit-generate-claude': 'Claude',
  'action.commit-generate-loading': '생성 중…',
  'action.commit-replace-message-title': '커밋 메시지를 바꿀까요?',
  'action.commit-replace-message-body': '커밋 입력란의 현재 내용을 바꿉니다.',
  'action.commit-replace-message-confirm': '바꾸기',
  'error.commit-message-empty-patch': '요약할 변경 사항이 없습니다.',
  'error.commit-message-provider-unavailable': '커밋 메시지 생성기를 사용할 수 없습니다.',
  'error.commit-message-timeout': '커밋 메시지 생성 시간이 초과되었습니다.',
  'error.commit-message-failed': '커밋 메시지 생성에 실패했습니다.',
  'error.commit-message-empty-output': '커밋 메시지 생성기가 빈 메시지를 반환했습니다.',
```

- [ ] **Step 6: Verify shared contract typechecks**

Run:

```sh
bun run typecheck
```

Expected: `all projects passed`.

---

## Task 2: System Provider Module

**Files:**
- Create: `src/system/commit-message-ai.test.ts`
- Create: `src/system/commit-message-ai.ts`

- [ ] **Step 1: Write failing system tests**

Create `src/system/commit-message-ai.test.ts`:

```ts
import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  execa: vi.fn(),
}))

vi.mock('execa', () => ({
  execa: mocks.execa,
}))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
})

describe('commit message AI providers', () => {
  test('probes codex and claude availability without shell interpolation', async () => {
    mocks.execa
      .mockResolvedValueOnce({ exitCode: 0 })
      .mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'ENOENT' }))

    const { probeCommitMessageProviders } = await import('#/system/commit-message-ai.ts')
    await expect(probeCommitMessageProviders()).resolves.toEqual({ codex: true, claude: false })

    expect(mocks.execa).toHaveBeenNthCalledWith(1, 'codex', ['--version'], expect.objectContaining({ reject: false }))
    expect(mocks.execa).toHaveBeenNthCalledWith(2, 'claude', ['--version'], expect.objectContaining({ reject: false }))
  })

  test('rejects empty patches before invoking a provider', async () => {
    const { generateCommitMessageFromPatch } = await import('#/system/commit-message-ai.ts')
    await expect(generateCommitMessageFromPatch('codex', '   ')).resolves.toEqual({
      ok: false,
      message: 'error.commit-message-empty-patch',
    })
    expect(mocks.execa).not.toHaveBeenCalled()
  })

  test('invokes codex in non-interactive read-only mode', async () => {
    mocks.execa.mockResolvedValueOnce({ exitCode: 0, stdout: 'feat: add generated summary', stderr: '' })
    const { generateCommitMessageFromPatch } = await import('#/system/commit-message-ai.ts')

    await expect(generateCommitMessageFromPatch('codex', 'diff --git a/a b/a\n+hello\n', { cwd: '/repo' })).resolves.toEqual({
      ok: true,
      message: 'feat: add generated summary',
    })

    expect(mocks.execa).toHaveBeenCalledWith(
      'codex',
      ['exec', '--ephemeral', '--sandbox', 'read-only', '--color', 'never', '-'],
      expect.objectContaining({
        cwd: '/repo',
        input: expect.stringContaining('Return only the commit message.'),
        reject: false,
      }),
    )
  })

  test('invokes claude with print mode and tools disabled', async () => {
    mocks.execa.mockResolvedValueOnce({ exitCode: 0, stdout: 'fix: handle dialog state', stderr: '' })
    const { generateCommitMessageFromPatch } = await import('#/system/commit-message-ai.ts')

    await expect(generateCommitMessageFromPatch('claude', 'diff --git a/a b/a\n+hello\n')).resolves.toEqual({
      ok: true,
      message: 'fix: handle dialog state',
    })

    expect(mocks.execa).toHaveBeenCalledWith(
      'claude',
      ['--print', '--output-format', 'text', '--tools', '', '--no-session-persistence'],
      expect.objectContaining({
        input: expect.stringContaining('Return only the commit message.'),
        reject: false,
      }),
    )
  })

  test('normalizes fenced and prefixed provider output', async () => {
    mocks.execa.mockResolvedValueOnce({
      exitCode: 0,
      stdout: '```text\nCommit message: feat: generate commit messages\n\nAdd Codex and Claude buttons.\n```',
      stderr: '',
    })
    const { generateCommitMessageFromPatch } = await import('#/system/commit-message-ai.ts')

    await expect(generateCommitMessageFromPatch('codex', 'diff --git a/a b/a\n+hello\n')).resolves.toEqual({
      ok: true,
      message: 'feat: generate commit messages\n\nAdd Codex and Claude buttons.',
    })
  })

  test('maps timeout and empty output to stable errors', async () => {
    mocks.execa
      .mockRejectedValueOnce(Object.assign(new Error('timed out'), { timedOut: true }))
      .mockResolvedValueOnce({ exitCode: 0, stdout: '   ', stderr: '' })
    const { generateCommitMessageFromPatch } = await import('#/system/commit-message-ai.ts')

    await expect(generateCommitMessageFromPatch('codex', 'diff --git a/a b/a\n+hello\n')).resolves.toEqual({
      ok: false,
      message: 'error.commit-message-timeout',
    })
    await expect(generateCommitMessageFromPatch('claude', 'diff --git a/a b/a\n+hello\n')).resolves.toEqual({
      ok: false,
      message: 'error.commit-message-empty-output',
    })
  })

  test('returns concise stderr for provider failures', async () => {
    mocks.execa.mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: 'not logged in' })
    const { generateCommitMessageFromPatch } = await import('#/system/commit-message-ai.ts')

    await expect(generateCommitMessageFromPatch('claude', 'diff --git a/a b/a\n+hello\n')).resolves.toEqual({
      ok: false,
      message: 'not logged in',
    })
  })
})
```

- [ ] **Step 2: Run the system test and verify it fails**

Run:

```sh
bun run test src/system/commit-message-ai.test.ts
```

Expected: fails because `src/system/commit-message-ai.ts` does not exist.

- [ ] **Step 3: Implement the provider module**

Create `src/system/commit-message-ai.ts`:

```ts
import { execa } from 'execa'
import type { CommitMessageGenerationResult, CommitMessageProvider, CommitMessageProviderAvailability } from '#/shared/commit-message-ai.ts'

const GENERATION_TIMEOUT_MS = 60_000
const PROBE_TIMEOUT_MS = 5_000
const MAX_MESSAGE_LENGTH = 2_000

const PROVIDER_COMMANDS: Record<CommitMessageProvider, { command: string; args: string[] }> = {
  codex: {
    command: 'codex',
    args: ['exec', '--ephemeral', '--sandbox', 'read-only', '--color', 'never', '-'],
  },
  claude: {
    command: 'claude',
    args: ['--print', '--output-format', 'text', '--tools', '', '--no-session-persistence'],
  },
}

export async function probeCommitMessageProviders(signal?: AbortSignal): Promise<CommitMessageProviderAvailability> {
  const [codex, claude] = await Promise.all([probeCommand('codex', signal), probeCommand('claude', signal)])
  return { codex, claude }
}

export async function generateCommitMessageFromPatch(
  provider: CommitMessageProvider,
  patch: string,
  options?: { cwd?: string; signal?: AbortSignal },
): Promise<CommitMessageGenerationResult> {
  if (!patch.trim()) return { ok: false, message: 'error.commit-message-empty-patch' }
  const command = PROVIDER_COMMANDS[provider]
  if (!command) return { ok: false, message: 'error.commit-message-provider-unavailable' }

  try {
    const result = await execa(command.command, command.args, {
      cwd: options?.cwd,
      input: buildPrompt(patch),
      timeout: GENERATION_TIMEOUT_MS,
      cancelSignal: options?.signal,
      forceKillAfterDelay: 500,
      maxBuffer: 2 * 1024 * 1024,
      reject: false,
    })
    if (options?.signal?.aborted || result.isCanceled) return { ok: false, message: 'cancelled' }
    if (result.exitCode !== 0) return { ok: false, message: safeFailureMessage(result.stderr) }

    const normalized = normalizeCommitMessage(result.stdout)
    if (!normalized) return { ok: false, message: 'error.commit-message-empty-output' }
    return { ok: true, message: normalized }
  } catch (err) {
    if (options?.signal?.aborted) return { ok: false, message: 'cancelled' }
    if (isTimeoutError(err)) return { ok: false, message: 'error.commit-message-timeout' }
    if (isMissingCommandError(err)) return { ok: false, message: 'error.commit-message-provider-unavailable' }
    return { ok: false, message: 'error.commit-message-failed' }
  }
}

async function probeCommand(command: CommitMessageProvider, signal?: AbortSignal): Promise<boolean> {
  try {
    const result = await execa(command, ['--version'], {
      timeout: PROBE_TIMEOUT_MS,
      cancelSignal: signal,
      reject: false,
    })
    return !signal?.aborted && result.exitCode === 0
  } catch (err) {
    if (signal?.aborted) return false
    if (isMissingCommandError(err)) return false
    return false
  }
}

function buildPrompt(patch: string): string {
  return [
    'Return only the commit message.',
    'Use the current worktree patch below. It includes staged, unstaged, and untracked changes that will be committed together.',
    'First line: concise imperative summary.',
    'Add a body only when it helps.',
    'Do not include Markdown fences, explanations, provider names, or changes not present in the patch.',
    '',
    'Patch:',
    patch,
  ].join('\n')
}

function normalizeCommitMessage(output: string): string {
  let text = output.trim()
  text = text.replace(/^```(?:text|markdown|md)?\s*/i, '').replace(/\s*```$/i, '').trim()
  text = text.replace(/^commit message:\s*/i, '').trim()
  if (text.length > MAX_MESSAGE_LENGTH) text = text.slice(0, MAX_MESSAGE_LENGTH).trimEnd()
  return text
}

function safeFailureMessage(stderr: string | undefined): string {
  const message = stderr?.trim()
  if (!message) return 'error.commit-message-failed'
  if (message.length > 300) return 'error.commit-message-failed'
  return message
}

function isMissingCommandError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: unknown }).code === 'ENOENT'
}

function isTimeoutError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'timedOut' in err && (err as { timedOut?: unknown }).timedOut === true
}
```

- [ ] **Step 4: Run the system test and verify it passes**

Run:

```sh
bun run test src/system/commit-message-ai.test.ts
```

Expected: one test file passes.

---

## Task 3: Server Routes And Web Client

**Files:**
- Modify: `src/server/modules/repo-read-paths.ts`
- Modify: `src/server/routes/repo.ts`
- Modify: `src/server/modules/repo.test.ts`
- Modify: `src/web/repo-client.ts`
- Modify: `src/web/repo-client.test.ts`

- [ ] **Step 1: Add failing server module tests**

In `src/server/modules/repo.test.ts`, extend the hoisted mocks:

```ts
  generateCommitMessageFromPatch: vi.fn(),
  probeCommitMessageProviders: vi.fn(),
```

Add the mock module near the other `vi.mock(...)` calls:

```ts
vi.mock('#/system/commit-message-ai.ts', () => ({
  generateCommitMessageFromPatch: mocks.generateCommitMessageFromPatch,
  probeCommitMessageProviders: mocks.probeCommitMessageProviders,
}))
```

Add defaults in `beforeEach`:

```ts
  mocks.probeCommitMessageProviders.mockResolvedValue({ codex: true, claude: false })
  mocks.generateCommitMessageFromPatch.mockResolvedValue({ ok: true, message: 'feat: generated summary' })
```

Add tests near patch-related tests:

```ts
describe('commit message AI read paths', () => {
  test('returns provider availability', async () => {
    const { getCommitMessageProviders } = await import('#/server/modules/repo-read-paths.ts')

    await expect(getCommitMessageProviders()).resolves.toEqual({ codex: true, claude: false })
    expect(mocks.probeCommitMessageProviders).toHaveBeenCalled()
  })

  test('generates from the known worktree patch', async () => {
    mocks.getWorktrees.mockResolvedValueOnce([{ path: '/tmp/repo-worktree', branch: 'feature/test', isMain: false }])
    const patchModule = await import('#/system/git/patch.ts')
    vi.mocked(patchModule.getWorktreePatch).mockResolvedValueOnce('diff --git a/a b/a\n+hello\n')

    const { generateRepositoryCommitMessage } = await import('#/server/modules/repo-read-paths.ts')
    await expect(generateRepositoryCommitMessage('/tmp/repo', '/tmp/repo-worktree', 'codex')).resolves.toEqual({
      ok: true,
      message: 'feat: generated summary',
    })
    expect(mocks.generateCommitMessageFromPatch).toHaveBeenCalledWith('codex', 'diff --git a/a b/a\n+hello\n', {
      cwd: '/tmp/repo-worktree',
      signal: undefined,
    })
  })

  test('does not call provider for an empty patch', async () => {
    mocks.getWorktrees.mockResolvedValueOnce([{ path: '/tmp/repo-worktree', branch: 'feature/test', isMain: false }])
    const patchModule = await import('#/system/git/patch.ts')
    vi.mocked(patchModule.getWorktreePatch).mockResolvedValueOnce('')

    const { generateRepositoryCommitMessage } = await import('#/server/modules/repo-read-paths.ts')
    await expect(generateRepositoryCommitMessage('/tmp/repo', '/tmp/repo-worktree', 'claude')).resolves.toEqual({
      ok: false,
      message: 'error.commit-message-empty-patch',
    })
    expect(mocks.generateCommitMessageFromPatch).not.toHaveBeenCalled()
  })

  test('rejects unknown providers before reading a patch', async () => {
    const { generateRepositoryCommitMessage } = await import('#/server/modules/repo-read-paths.ts')
    await expect(generateRepositoryCommitMessage('/tmp/repo', '/tmp/repo-worktree', 'other')).resolves.toEqual({
      ok: false,
      message: 'error.commit-message-provider-unavailable',
    })
    expect(mocks.generateCommitMessageFromPatch).not.toHaveBeenCalled()
  })
})
```

If `src/system/git/patch.ts` is not mocked in this file yet, add:

```ts
  getWorktreePatch: vi.fn(),
```

and:

```ts
vi.mock('#/system/git/patch.ts', () => ({
  getWorktreePatch: mocks.getWorktreePatch,
}))
```

- [ ] **Step 2: Run the server tests and verify they fail**

Run:

```sh
bun run test src/server/modules/repo.test.ts
```

Expected: fails because `getCommitMessageProviders()` and `generateRepositoryCommitMessage()` are not implemented yet.

- [ ] **Step 3: Implement server read-path helpers**

Modify `src/server/modules/repo-read-paths.ts` imports:

```ts
import {
  isCommitMessageProvider,
  type CommitMessageGenerationResult,
  type CommitMessageProviderAvailability,
} from '#/shared/commit-message-ai.ts'
import { generateCommitMessageFromPatch, probeCommitMessageProviders } from '#/system/commit-message-ai.ts'
```

Add functions:

```ts
export async function getCommitMessageProviders(signal?: AbortSignal): Promise<CommitMessageProviderAvailability> {
  return await probeCommitMessageProviders(signal)
}

export async function generateRepositoryCommitMessage(
  cwd: string,
  worktreePath: string,
  provider: unknown,
  signal?: AbortSignal,
): Promise<CommitMessageGenerationResult> {
  if (!isCommitMessageProvider(provider)) {
    return { ok: false, message: 'error.commit-message-provider-unavailable' }
  }
  const patch = await getRepositoryPatch(cwd, worktreePath, signal)
  if (!patch.ok) return patch
  if (!patch.message.trim()) return { ok: false, message: 'error.commit-message-empty-patch' }
  return await generateCommitMessageFromPatch(provider, patch.message, { cwd: worktreePath, signal })
}
```

- [ ] **Step 4: Add routes**

Modify `src/server/routes/repo.ts` imports from `repo-read-paths.ts`:

```ts
  generateRepositoryCommitMessage,
  getCommitMessageProviders,
```

Add routes after `/patch`:

```ts
  app.post('/commit-message-providers', async (c) => {
    return c.json(
      await jsonOr(
        () => getCommitMessageProviders(c.req.raw.signal),
        { codex: false, claude: false },
        'commit-message-providers',
      ),
    )
  })
  app.post('/generate-commit-message', async (c) => {
    const body = await c.req.json().catch(() => null)
    const repoId = typeof body?.repoId === 'string' ? body.repoId : ''
    const worktreePath = typeof body?.worktreePath === 'string' ? body.worktreePath : ''
    const provider = body?.provider
    return c.json(
      await jsonOr(
        () => generateRepositoryCommitMessage(repoId, worktreePath, provider, c.req.raw.signal),
        { ok: false, message: 'error.commit-message-failed' },
        'generate-commit-message',
      ),
    )
  })
```

- [ ] **Step 5: Add failing web client tests**

In `src/web/repo-client.test.ts`, add:

```ts
  test('requests commit message provider availability', async () => {
    installWebBootstrap(webBootstrap({ initialServer: { url: 'http://127.0.0.1:32100/', secret: 'secret' } }))
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ codex: true, claude: false }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { getCommitMessageProviders } = await import('#/web/repo-client.ts')
    await expect(getCommitMessageProviders()).resolves.toEqual({ codex: true, claude: false })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:32100/api/repo/commit-message-providers',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-goblin-internal-secret': 'secret' }),
        body: JSON.stringify({}),
      }),
    )
  })

  test('requests commit message generation for a provider', async () => {
    installWebBootstrap(webBootstrap({ initialServer: { url: 'http://127.0.0.1:32100/', secret: 'secret' } }))
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, message: 'feat: generated summary' }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { generateCommitMessage } = await import('#/web/repo-client.ts')
    await expect(generateCommitMessage('/repo', '/repo/worktree', 'codex')).resolves.toEqual({
      ok: true,
      message: 'feat: generated summary',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:32100/api/repo/generate-commit-message',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-goblin-internal-secret': 'secret' }),
        body: JSON.stringify({ repoId: '/repo', worktreePath: '/repo/worktree', provider: 'codex' }),
      }),
    )
  })
```

- [ ] **Step 6: Implement web client calls**

Modify `src/web/repo-client.ts` imports:

```ts
import type {
  CommitMessageGenerationResult,
  CommitMessageProvider,
  CommitMessageProviderAvailability,
} from '#/shared/commit-message-ai.ts'
```

Add functions near `getRepositoryPatch()` / commit functions:

```ts
export async function getCommitMessageProviders(signal?: AbortSignal): Promise<CommitMessageProviderAvailability> {
  return await postServerJson('/api/repo/commit-message-providers', {}, { signal })
}

export async function generateCommitMessage(
  repoId: string,
  worktreePath: string,
  provider: CommitMessageProvider,
  signal?: AbortSignal,
): Promise<CommitMessageGenerationResult> {
  return await postServerJson('/api/repo/generate-commit-message', { repoId, worktreePath, provider }, { signal })
}
```

- [ ] **Step 7: Run API tests**

Run:

```sh
bun run test src/system/commit-message-ai.test.ts src/server/modules/repo.test.ts src/web/repo-client.test.ts
```

Expected: all selected tests pass.

---

## Task 4: Commit Dialog UI

**Files:**
- Create: `src/web/components/branch-list/BranchWriteDialogs.test.tsx`
- Modify: `src/web/components/branch-list/BranchWriteDialogs.tsx`
- Modify: `src/web/hooks/useBranchWriteActions.tsx`

- [ ] **Step 1: Write focused renderer tests**

Create `src/web/components/branch-list/BranchWriteDialogs.test.tsx`:

```tsx
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCommitMessageProviders: vi.fn(),
  generateCommitMessage: vi.fn(),
}))

vi.mock('#/web/repo-client.ts', () => ({
  getCommitMessageProviders: mocks.getCommitMessageProviders,
  generateCommitMessage: mocks.generateCommitMessage,
}))

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string) => key,
}))

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.clearAllMocks()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  mocks.getCommitMessageProviders.mockResolvedValue({ codex: false, claude: false })
  mocks.generateCommitMessage.mockResolvedValue({ ok: true, message: 'feat: generated summary' })
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  container.remove()
})

async function renderCommitDialog() {
  const { CommitDialog } = await import('#/web/components/branch-list/BranchWriteDialogs.tsx')
  await act(async () => {
    root.render(
      <CommitDialog
        open
        repoId="/repo"
        worktreePath="/repo/worktree"
        onClose={vi.fn()}
        onCommit={vi.fn()}
      />,
    )
  })
  await act(async () => {
    await Promise.resolve()
  })
}

function textarea(): HTMLTextAreaElement {
  const node = container.querySelector<HTMLTextAreaElement>('#commit-message')
  if (!node) throw new Error('missing textarea')
  return node
}

describe('CommitDialog AI generation', () => {
  test('hides generation buttons when providers are unavailable', async () => {
    await renderCommitDialog()

    expect(container.textContent).not.toContain('action.commit-generate-codex')
    expect(container.textContent).not.toContain('action.commit-generate-claude')
  })

  test('shows only available provider buttons', async () => {
    mocks.getCommitMessageProviders.mockResolvedValueOnce({ codex: true, claude: false })
    await renderCommitDialog()

    expect(container.textContent).toContain('action.commit-generate-codex')
    expect(container.textContent).not.toContain('action.commit-generate-claude')
  })

  test('fills an empty textarea after generation', async () => {
    mocks.getCommitMessageProviders.mockResolvedValueOnce({ codex: true, claude: false })
    await renderCommitDialog()

    const button = [...container.querySelectorAll('button')].find((item) =>
      item.textContent?.includes('action.commit-generate-codex'),
    )
    if (!button) throw new Error('missing codex button')

    await act(async () => {
      button.click()
      await Promise.resolve()
    })

    expect(textarea().value).toBe('feat: generated summary')
    expect(mocks.generateCommitMessage).toHaveBeenCalledWith('/repo', '/repo/worktree', 'codex', expect.any(AbortSignal))
  })

  test('requires confirmation before replacing existing text', async () => {
    mocks.getCommitMessageProviders.mockResolvedValueOnce({ codex: true, claude: false })
    await renderCommitDialog()
    await act(async () => {
      textarea().value = 'manual message'
      textarea().dispatchEvent(new Event('input', { bubbles: true }))
    })

    const button = [...container.querySelectorAll('button')].find((item) =>
      item.textContent?.includes('action.commit-generate-codex'),
    )
    if (!button) throw new Error('missing codex button')

    await act(async () => {
      button.click()
      await Promise.resolve()
    })

    expect(textarea().value).toBe('manual message')
    expect(document.body.textContent).toContain('action.commit-replace-message-title')

    const replace = [...document.body.querySelectorAll('button')].find((item) =>
      item.textContent?.includes('action.commit-replace-message-confirm'),
    )
    if (!replace) throw new Error('missing replace button')

    await act(async () => {
      replace.click()
      await Promise.resolve()
    })

    expect(textarea().value).toBe('feat: generated summary')
  })

  test('shows generation errors inline without closing the dialog', async () => {
    mocks.getCommitMessageProviders.mockResolvedValueOnce({ codex: true, claude: false })
    mocks.generateCommitMessage.mockResolvedValueOnce({ ok: false, message: 'error.commit-message-empty-patch' })
    await renderCommitDialog()

    const button = [...container.querySelectorAll('button')].find((item) =>
      item.textContent?.includes('action.commit-generate-codex'),
    )
    if (!button) throw new Error('missing codex button')

    await act(async () => {
      button.click()
      await Promise.resolve()
    })

    expect(container.textContent).toContain('error.commit-message-empty-patch')
    expect(container.querySelector('#commit-message')).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run renderer test and verify it fails**

Run:

```sh
bun run test src/web/components/branch-list/BranchWriteDialogs.test.tsx
```

Expected: fails because `CommitDialog` does not accept `repoId` / `worktreePath` and has no provider UI.

- [ ] **Step 3: Update `CommitDialog` props and imports**

Modify `src/web/components/branch-list/BranchWriteDialogs.tsx` imports:

```tsx
import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '#/web/components/ui/button.tsx'
import { ConfirmDialog } from '#/web/components/ConfirmDialog.tsx'
import { DialogFooter } from '#/web/components/ui/dialog.tsx'
import { FormDialog } from '#/web/components/ui/form-dialog.tsx'
import { Field, FieldLabel } from '#/web/components/ui/field.tsx'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/web/components/ui/select.tsx'
import { DialogError } from '#/web/components/ui/dialog-error.tsx'
import { getCommitMessageProviders, generateCommitMessage } from '#/web/repo-client.ts'
import { useT } from '#/web/stores/i18n.ts'
import { useAsyncPending } from '#/web/hooks/useAsyncPending.ts'
import type { CommitMessageProvider, CommitMessageProviderAvailability } from '#/shared/commit-message-ai.ts'
import type { RepoBranchState } from '#/web/stores/repos/types.ts'
```

Update props:

```tsx
interface CommitDialogProps {
  open: boolean
  repoId: string
  worktreePath: string
  onClose: () => void
  onCommit: (message: string) => Promise<void>
}
```

- [ ] **Step 4: Implement provider state inside `CommitDialog`**

Inside `CommitDialog`, add state:

```tsx
  const [providers, setProviders] = useState<CommitMessageProviderAvailability>({ codex: false, claude: false })
  const [generating, setGenerating] = useState<CommitMessageProvider | null>(null)
  const [pendingGeneratedMessage, setPendingGeneratedMessage] = useState<string | null>(null)
  const generationAbortRef = useRef<AbortController | null>(null)
```

Add effect:

```tsx
  useEffect(() => {
    if (!open) {
      setProviders({ codex: false, claude: false })
      return
    }
    const ctrl = new AbortController()
    void getCommitMessageProviders(ctrl.signal)
      .then((next) => {
        if (!ctrl.signal.aborted) setProviders(next)
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setProviders({ codex: false, claude: false })
      })
    return () => ctrl.abort()
  }, [open])
```

In the existing close reset effect, also reset:

```tsx
      generationAbortRef.current?.abort()
      generationAbortRef.current = null
      setProviders({ codex: false, claude: false })
      setGenerating(null)
      setPendingGeneratedMessage(null)
```

- [ ] **Step 5: Implement generation handler**

Inside `CommitDialog`, add:

```tsx
  async function handleGenerate(provider: CommitMessageProvider) {
    setError(null)
    setGenerating(provider)
    generationAbortRef.current?.abort()
    const ctrl = new AbortController()
    generationAbortRef.current = ctrl
    try {
      const result = await generateCommitMessage(repoId, worktreePath, provider, ctrl.signal)
      if (ctrl.signal.aborted) return
      if (!result.ok) {
        if (result.message === 'cancelled') return
        setError(t(result.message))
        return
      }
      if (message.trim()) {
        setPendingGeneratedMessage(result.message)
        return
      }
      setMessage(result.message)
    } catch (err) {
      if (ctrl.signal.aborted) return
      setError(err instanceof Error ? err.message : t('error.commit-message-failed'))
    } finally {
      if (generationAbortRef.current === ctrl) {
        generationAbortRef.current = null
        setGenerating(null)
      }
    }
  }

  function applyPendingGeneratedMessage() {
    if (!pendingGeneratedMessage) return
    setMessage(pendingGeneratedMessage)
    setPendingGeneratedMessage(null)
  }
```

- [ ] **Step 6: Render provider buttons on the label row**

Replace the commit label block:

```tsx
          <FieldLabel htmlFor="commit-message">{t('action.commit-message-label')}</FieldLabel>
```

with:

```tsx
          <div className="flex items-center justify-between gap-2">
            <FieldLabel htmlFor="commit-message">{t('action.commit-message-label')}</FieldLabel>
            <div className="flex items-center gap-1">
              {providers.codex ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isPending || generating !== null}
                  onClick={() => void handleGenerate('codex')}
                >
                  {generating === 'codex' ? <Loader2 className="animate-spin" /> : null}
                  {generating === 'codex' ? t('action.commit-generate-loading') : t('action.commit-generate-codex')}
                </Button>
              ) : null}
              {providers.claude ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isPending || generating !== null}
                  onClick={() => void handleGenerate('claude')}
                >
                  {generating === 'claude' ? <Loader2 className="animate-spin" /> : null}
                  {generating === 'claude' ? t('action.commit-generate-loading') : t('action.commit-generate-claude')}
                </Button>
              ) : null}
            </div>
          </div>
```

Update the commit submit button disabled condition:

```tsx
disabled={!message.trim() || isPending || generating !== null}
```

Wrap the existing `FormDialog` return in a fragment and add this `ConfirmDialog` as a sibling immediately after `</FormDialog>`:

```tsx
      <ConfirmDialog
        open={pendingGeneratedMessage !== null}
        title={t('action.commit-replace-message-title')}
        message={t('action.commit-replace-message-body')}
        confirmLabel={t('action.commit-replace-message-confirm')}
        onCancel={() => setPendingGeneratedMessage(null)}
        onConfirm={async () => applyPendingGeneratedMessage()}
      />
```

Also update `FormDialog`'s `onOpenChange` guard:

```tsx
      onOpenChange={(o) => {
        if (!o && !isPending && generating === null) onClose()
      }}
```

- [ ] **Step 7: Pass repo/worktree props from write actions**

Modify `src/web/hooks/useBranchWriteActions.tsx` where `CommitDialog` is rendered. Pass:

```tsx
      <CommitDialog
        open={commitDialog.open}
        repoId={repo.id}
        worktreePath={worktreePath ?? ''}
        onClose={commitDialog.close}
        onCommit={handleCommit}
      />
```

This replaces the current render:

```tsx
      <CommitDialog
        open={commitDialog.open}
        onClose={commitDialog.close}
        onCommit={handleCommit}
      />
```

- [ ] **Step 8: Run renderer test**

Run:

```sh
bun run test src/web/components/branch-list/BranchWriteDialogs.test.tsx
```

Expected: new tests pass.

---

## Task 5: Final Integration And Verification

**Files:**
- All files from Tasks 1-4

- [ ] **Step 1: Run focused tests**

Run:

```sh
bun run test src/system/commit-message-ai.test.ts src/server/modules/repo.test.ts src/web/repo-client.test.ts src/web/components/branch-list/BranchWriteDialogs.test.tsx
```

Expected: all selected tests pass.

- [ ] **Step 2: Run full typecheck**

Run:

```sh
bun run typecheck
```

Expected: `all projects passed`.

- [ ] **Step 3: Run full test suite**

Run:

```sh
bun run test
```

Expected: all test files pass. Existing jsdom warnings about unimplemented canvas/focus may appear and are acceptable only if exit code is 0.

- [ ] **Step 4: Manual local smoke check**

Run the app:

```sh
bun run dev
```

Expected:

- Open a local repository with uncommitted changes.
- Open `Commit all changes`.
- If `codex` is installed, `Codex` appears.
- If `claude` is installed, `Claude` appears.
- Clicking a provider generates text without committing.
- Empty textarea fills directly.
- Non-empty textarea asks before replacing.
- Manual commit still requires clicking `Commit`.

Stop the dev server after the smoke check.

- [ ] **Step 5: Review final diff**

Run:

```sh
git diff --stat
git diff -- src/shared/commit-message-ai.ts src/system/commit-message-ai.ts src/server/modules/repo-read-paths.ts src/server/routes/repo.ts src/web/repo-client.ts src/web/components/branch-list/BranchWriteDialogs.tsx src/web/hooks/useBranchWriteActions.tsx
```

Expected:

- AI generation is read-only and separate from `commitAllChanges()`.
- No patch content is logged.
- Provider commands are fixed to `codex` and `claude`.
- No settings page or provider preference was added.
- No unrelated UI refactor is included.

---

## Spec Coverage Checklist

- Provider-specific buttons: Task 4.
- Hide unavailable providers: Task 4.
- Empty textarea auto-fill: Task 4.
- Non-empty textarea confirmation: Task 4.
- Worktree uncommitted diff scope: Task 3 uses existing patch path.
- No automatic commit: Task 4 only writes textarea; existing `onCommit` remains unchanged.
- Provider probing: Task 2 and Task 3.
- Whitelisted CLI execution: Task 2.
- Error handling: Tasks 1, 2, 3, 4.
- i18n: Task 1.
- Tests and verification: Tasks 2-5.
