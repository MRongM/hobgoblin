# Commit Message AI JSONL And Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Codex commit-message generation parse `codex exec --json` JSONL output and surface real provider failures instead of only showing generic generation errors.

**Architecture:** Keep the existing renderer -> server read path -> system provider flow. The system provider module becomes responsible for provider-specific command construction and output parsing, with Codex using JSONL mode and Claude staying in text mode. The renderer continues to translate only `error.*` keys and displays provider stderr text directly.

**Tech Stack:** TypeScript strip-only mode, Bun, Vitest, React 19, existing `execa` provider execution, existing commit dialog tests.

**Repo Note:** Project AGENTS instructions say not to plan or execute git commits unless explicitly requested. This plan intentionally contains verification checkpoints but no git commit steps.

---

## File Structure

- Modify: `src/system/commit-message-ai.ts`
  - Add provider-specific output modes.
  - Change Codex command shape to `codex exec --json <prompt>`.
  - Parse Codex JSONL `agent_message` events.
  - Preserve existing provider discovery, PATH fallback, prompt trimming, and binary diff omission.
- Modify: `src/system/commit-message-ai.test.ts`
  - Update Codex command expectations.
  - Add JSONL parsing tests.
  - Add empty JSONL output tests.
  - Preserve binary diff and nvm PATH regression tests.
- Modify: `src/web/components/branch-list/BranchWriteDialogs.test.tsx`
  - Add regression coverage that provider stderr text is displayed directly.
- No planned production change in `BranchWriteDialogs.tsx` unless the new renderer test fails.

---

## Task 1: Codex JSONL System Tests

**Files:**
- Modify: `src/system/commit-message-ai.test.ts`

- [ ] **Step 1: Update the Codex invocation test to expect JSONL mode**

Replace the Codex command test body with this shape:

```ts
test('invokes codex in JSONL non-interactive read-only mode', async () => {
  mocks.execa.mockResolvedValueOnce({
    exitCode: 0,
    stdout: [
      JSON.stringify({ type: 'thread.started', thread_id: 'thread_1' }),
      JSON.stringify({ type: 'turn.started' }),
      JSON.stringify({
        type: 'item.completed',
        item: { id: 'item_1', type: 'agent_message', text: 'feat: add generated summary' },
      }),
      JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 10, output_tokens: 6 } }),
    ].join('\n'),
    stderr: '',
  })
  const { generateCommitMessageFromPatch } = await import('#/system/commit-message-ai.ts')

  await expect(generateCommitMessageFromPatch('codex', 'diff --git a/a b/a\n+hello\n', { cwd: '/repo' })).resolves.toEqual({
    ok: true,
    message: 'feat: add generated summary',
  })

  expect(mocks.execa).toHaveBeenCalledWith(
    'codex',
    ['exec', '--json', expect.stringContaining('Return only the commit message.')],
    expect.objectContaining({
      cwd: '/repo',
      reject: false,
    }),
  )
  expect(mocks.execa.mock.calls[0]![2]).not.toHaveProperty('input')
})
```

- [ ] **Step 2: Add a test for choosing the final Codex agent message**

Add this test after the Codex invocation test:

```ts
test('uses the final non-empty codex agent message from JSONL output', async () => {
  mocks.execa.mockResolvedValueOnce({
    exitCode: 0,
    stdout: [
      JSON.stringify({
        type: 'item.completed',
        item: { id: 'item_1', type: 'agent_message', text: 'draft: first message' },
      }),
      JSON.stringify({
        type: 'item.completed',
        item: { id: 'item_2', type: 'tool_call', text: 'ignored tool text' },
      }),
      'not-json',
      JSON.stringify({
        type: 'item.completed',
        item: { id: 'item_3', type: 'agent_message', text: 'fix: parse codex jsonl' },
      }),
    ].join('\n'),
    stderr: '',
  })

  const { generateCommitMessageFromPatch } = await import('#/system/commit-message-ai.ts')

  await expect(generateCommitMessageFromPatch('codex', 'diff --git a/a b/a\n+hello\n')).resolves.toEqual({
    ok: true,
    message: 'fix: parse codex jsonl',
  })
})
```

- [ ] **Step 3: Add a test for Codex JSONL without an agent message**

Add this test after the final-message test:

```ts
test('returns empty-output when codex JSONL has no agent message', async () => {
  mocks.execa.mockResolvedValueOnce({
    exitCode: 0,
    stdout: [
      JSON.stringify({ type: 'thread.started', thread_id: 'thread_1' }),
      JSON.stringify({ type: 'turn.started' }),
      JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 10, output_tokens: 0 } }),
    ].join('\n'),
    stderr: '',
  })

  const { generateCommitMessageFromPatch } = await import('#/system/commit-message-ai.ts')

  await expect(generateCommitMessageFromPatch('codex', 'diff --git a/a b/a\n+hello\n')).resolves.toEqual({
    ok: false,
    message: 'error.commit-message-empty-output',
  })
})
```

- [ ] **Step 4: Update Codex fallback executable test expectations**

In `generates with a resolved user install executable when direct PATH lookup fails`, update the expected call to:

```ts
expect(mocks.execa).toHaveBeenLastCalledWith(
  codexPath,
  ['exec', '--json', expect.stringContaining('Return only the commit message.')],
  expect.objectContaining({
    cwd: '/repo',
    env: expect.objectContaining({ PATH: expect.stringContaining('/Users/test/.nvm/versions/node/v22.16.0/bin') }),
    reject: false,
  }),
)
expect(mocks.execa.mock.calls.at(-1)![2]).not.toHaveProperty('input')
```

- [ ] **Step 5: Move text-output normalization coverage to Claude**

Change the existing fenced/prefixed output normalization test to call `generateCommitMessageFromPatch('claude', ...)` instead of Codex:

```ts
await expect(generateCommitMessageFromPatch('claude', 'diff --git a/a b/a\n+hello\n')).resolves.toEqual({
  ok: true,
  message: 'feat: generate commit messages\n\nAdd Codex and Claude buttons.',
})
```

- [ ] **Step 6: Run the system test to verify RED**

Run:

```sh
bun run test src/system/commit-message-ai.test.ts
```

Expected: FAIL. The Codex command expectation should still see the old `['exec', '--ephemeral', '--sandbox', 'read-only', '--color', 'never', '-']` shape, or JSONL output should be treated as plain text instead of parsed.

---

## Task 2: Codex JSONL Implementation

**Files:**
- Modify: `src/system/commit-message-ai.ts`

- [ ] **Step 1: Introduce provider command metadata**

Replace the current `PROVIDER_COMMANDS` type and value with:

```ts
type ProviderOutputMode = 'text' | 'codex-jsonl'

interface ProviderCommand {
  command: string
  args: (prompt: string) => string[]
  input?: (prompt: string) => string
  outputMode: ProviderOutputMode
}

const PROVIDER_COMMANDS: Record<CommitMessageProvider, ProviderCommand> = {
  codex: {
    command: 'codex',
    args: (prompt) => ['exec', '--json', prompt],
    outputMode: 'codex-jsonl',
  },
  claude: {
    command: 'claude',
    args: () => ['--print', '--output-format', 'text', '--tools', '', '--no-session-persistence'],
    input: (prompt) => prompt,
    outputMode: 'text',
  },
}
```

- [ ] **Step 2: Update generation command execution**

Change the direct provider call from:

```ts
return mapGenerationResult(await runGenerationCommand(command.command, command.args, prompt, options), options?.signal)
```

to:

```ts
return mapGenerationResult(
  await runGenerationCommand(command.command, command.args(prompt), command.input?.(prompt), options),
  command.outputMode,
  options?.signal,
)
```

Change the fallback provider call from:

```ts
return mapGenerationResult(await runGenerationCommand(executable, command.args, prompt, options), options?.signal)
```

to:

```ts
return mapGenerationResult(
  await runGenerationCommand(executable, command.args(prompt), command.input?.(prompt), options),
  command.outputMode,
  options?.signal,
)
```

- [ ] **Step 3: Update `runGenerationCommand` signature**

Replace:

```ts
async function runGenerationCommand(
  executable: string,
  args: string[],
  prompt: string,
  options?: GenerateCommitMessageOptions,
) {
  const env = envForExecutable(executable)
  return await execa(executable, args, {
    ...(options?.cwd ? { cwd: options.cwd } : {}),
    ...(env ? { env } : {}),
    input: prompt,
    timeout: GENERATION_TIMEOUT_MS,
    cancelSignal: options?.signal,
    forceKillAfterDelay: 500,
    maxBuffer: 10 * 1024 * 1024,
    reject: false,
  })
}
```

with:

```ts
async function runGenerationCommand(
  executable: string,
  args: string[],
  input: string | undefined,
  options?: GenerateCommitMessageOptions,
) {
  const env = envForExecutable(executable)
  return await execa(executable, args, {
    ...(options?.cwd ? { cwd: options.cwd } : {}),
    ...(env ? { env } : {}),
    ...(input !== undefined ? { input } : {}),
    timeout: GENERATION_TIMEOUT_MS,
    cancelSignal: options?.signal,
    forceKillAfterDelay: 500,
    maxBuffer: 10 * 1024 * 1024,
    reject: false,
  })
}
```

- [ ] **Step 4: Update result mapping to support output modes**

Replace:

```ts
function mapGenerationResult(
  result: Awaited<ReturnType<typeof runGenerationCommand>>,
  signal?: AbortSignal,
): CommitMessageGenerationResult {
```

with:

```ts
function mapGenerationResult(
  result: Awaited<ReturnType<typeof runGenerationCommand>>,
  outputMode: ProviderOutputMode,
  signal?: AbortSignal,
): CommitMessageGenerationResult {
```

Then replace:

```ts
const message = normalizeProviderOutput(result.stdout)
```

with:

```ts
const message =
  outputMode === 'codex-jsonl'
    ? parseCodexJsonlMessage(result.stdout)
    : normalizeProviderOutput(result.stdout)
```

- [ ] **Step 5: Add the Codex JSONL parser**

Add this helper near `normalizeProviderOutput`:

```ts
function parseCodexJsonlMessage(output: string): string {
  let lastMessage = ''
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      continue
    }
    if (!isCodexAgentMessageEvent(parsed)) continue
    const text = parsed.item.text.trim()
    if (text) lastMessage = text
  }
  return normalizeProviderOutput(lastMessage)
}

function isCodexAgentMessageEvent(
  value: unknown,
): value is { type: 'item.completed'; item: { type: 'agent_message'; text: string } } {
  if (typeof value !== 'object' || value === null) return false
  const event = value as { type?: unknown; item?: unknown }
  if (event.type !== 'item.completed') return false
  if (typeof event.item !== 'object' || event.item === null) return false
  const item = event.item as { type?: unknown; text?: unknown }
  return item.type === 'agent_message' && typeof item.text === 'string'
}
```

- [ ] **Step 6: Run system tests to verify GREEN**

Run:

```sh
bun run test src/system/commit-message-ai.test.ts
```

Expected: PASS.

---

## Task 3: Renderer Error Display Regression

**Files:**
- Modify: `src/web/components/branch-list/BranchWriteDialogs.test.tsx`
- Modify only if needed: `src/web/components/branch-list/BranchWriteDialogs.tsx`

- [ ] **Step 1: Add a renderer test for raw provider errors**

Add this test to `describe('CommitDialog AI generation', ...)`:

```tsx
test('shows raw provider errors without translating them as generic failures', async () => {
  mocks.getCommitMessageProviders.mockResolvedValueOnce({ codex: true, claude: false })
  mocks.generateRepositoryCommitMessage.mockResolvedValueOnce({ ok: false, message: 'Codex auth token expired' })

  render(<CommitDialog open repoId="/repo" worktreePath="/repo" onClose={vi.fn()} onCommit={vi.fn()} />)
  await flush()

  clickButtonByProvider('codex')
  await flush()

  expect(document.body.textContent).toContain('Codex auth token expired')
  expect(document.body.textContent).not.toContain('error.commit-message-failed')
})
```

- [ ] **Step 2: Run renderer test**

Run:

```sh
bun run test src/web/components/branch-list/BranchWriteDialogs.test.tsx
```

Expected: PASS if the current `formatCommitMessageGenerationError()` behavior is already correct. If it fails, continue to Step 3.

- [ ] **Step 3: Fix renderer error formatting only if Step 2 fails**

Ensure `formatCommitMessageGenerationError()` has this exact behavior:

```ts
function formatCommitMessageGenerationError(t: (key: string) => string, message: string): string {
  if (message === 'cancelled') return ''
  return message.startsWith('error.') ? t(message) : message
}
```

- [ ] **Step 4: Re-run renderer test**

Run:

```sh
bun run test src/web/components/branch-list/BranchWriteDialogs.test.tsx
```

Expected: PASS.

---

## Task 4: Targeted Verification

**Files:**
- No edits unless a verification failure identifies a direct regression.

- [ ] **Step 1: Run target tests together**

Run:

```sh
bun run test src/system/commit-message-ai.test.ts src/web/components/branch-list/BranchWriteDialogs.test.tsx
```

Expected: both files PASS.

- [ ] **Step 2: Run typecheck**

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

Expected: all test files pass.

---

## Task 5: Packaging Verification

**Files:**
- Build output only.
- Installed app only if user approves the install step.

- [ ] **Step 1: Build and install the app after user approval**

This command replaces `~/Applications/Hobgoblin.app`, so ask for approval before running it:

```sh
bun scripts/build.ts install
```

Expected:

- `typecheck` passes during build.
- web and server bundles are rebuilt.
- Electron app is packaged.
- old Hobgoblin process is closed.
- `/Users/longjiang/Applications/Hobgoblin.app` is replaced and re-signed.

- [ ] **Step 2: Verify packaged server bundle contains the JSONL parser**

Run:

```sh
bun -e "import { createRequire } from 'node:module'; const require=createRequire(import.meta.url); const asar=require('@electron/asar'); const buf=asar.extractFile('/Users/longjiang/Applications/Hobgoblin.app/Contents/Resources/app.asar','dist/server/main.js'); const text=buf.toString('utf8'); for (const s of ['codex-jsonl','parseCodexJsonlMessage','binary diff omitted']) console.log(s, text.includes(s));"
```

Expected:

```text
codex-jsonl true
parseCodexJsonlMessage true
binary diff omitted true
```

- [ ] **Step 3: Start the installed app**

Run:

```sh
open -a "/Users/longjiang/Applications/Hobgoblin.app"
```

Expected: Hobgoblin launches using the newly installed app bundle.

- [ ] **Step 4: Manual UAT**

In the app:

1. Open the commit dialog for a worktree with changes.
2. Click `Codex`.
3. If generation succeeds, confirm the text area is filled.
4. If generation fails, confirm the dialog shows the real provider error text instead of only `提交信息生成失败`.

Expected: Codex either generates a commit message or shows an actionable raw provider error.

