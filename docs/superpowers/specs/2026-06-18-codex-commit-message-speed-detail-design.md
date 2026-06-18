# Codex Commit Message Speed And Detail Design

**Date:** 2026-06-18
**Scope:** Improve Hobgoblin inline commit-message generation when the user clicks the `Codex` provider button.

## Goal

Codex commit-message generation in the inline commit form should feel faster for normal small changes and produce more useful commit messages by default.

Target behavior:

- Optimize the Hobgoblin app's inline `Commit` form only.
- Optimize `Codex` only. Keep `Claude` behavior unchanged.
- Keep generated commit messages in English.
- Prefer Conventional Commit style when it fits.
- Generate a complete message by default:
  - one concise subject line
  - a blank line
  - a short body with 2 to 4 useful details when the diff supports them
- Target common small changes returning in about 5 to 10 seconds.

## Non-Goals

- Do not change the Git commit operation.
- Do not auto-commit generated messages.
- Do not add an AI settings page.
- Do not add a provider preference.
- Do not change Claude's command, prompt, or output parsing.
- Do not redesign the commit form.
- Do not add a local rule-based draft plus background replacement workflow.
- Do not persist generated messages beyond the existing inline draft behavior.
- Do not commit this design document unless explicitly requested by the user.

## Current State

The inline commit form calls:

- `generateRepositoryCommitMessage()` in `src/web/repo-client.ts`
- `/api/repo/generate-commit-message` in `src/server/routes/repo.ts`
- `generateRepositoryCommitMessage()` in `src/server/modules/repo-read-paths.ts`
- `generateCommitMessageFromPatch()` in `src/system/commit-message-ai.ts`

The server currently gets an apply-equivalent patch through `backend.getPatch(worktreePath, signal)`. For local repositories this uses `getWorktreePatch()` in `src/system/git/patch.ts`.

That patch is designed for replay with `git apply --binary`, not for fast commit-message summarization. It includes staged and unstaged tracked changes, untracked files, and binary patch payloads before the AI layer later removes binary payloads and caps prompt size.

This is correct for export/copy-patch behavior, but too heavy for commit-message generation:

- Large binary diffs are gathered before they are omitted.
- Many untracked files require bounded concurrent `git diff --no-index` calls.
- The prompt currently asks for a short subject and a body only when useful, which encourages sparse output.
- Each generation starts a fresh `codex exec` process, so reducing input preparation and prompt size is the main practical speed lever in this phase.

## Recommended Approach

Add a Codex-specific lightweight commit context path for commit-message generation.

Keep the existing public renderer and route shape:

```ts
generateRepositoryCommitMessage(repoId, worktreePath, provider, signal)
```

At the server/system boundary, branch by provider:

- `codex`: build a lightweight commit-message context and use a richer Codex prompt.
- `claude`: keep the existing patch-based behavior.

This keeps the change focused, avoids UI churn, and does not alter commit execution.

## Architecture

### Existing Boundaries

Keep these responsibilities:

- UI owns the inline form state, replacement confirmation, and error display.
- Server route parses input and delegates.
- Repo read path validates provider and repo/worktree ownership.
- System layer owns Git context collection, prompt construction, provider command args, output parsing, timeout, and cancellation.

### New System Helper

Add a lightweight commit context builder in the system layer. A suitable shape is:

```ts
export interface CommitMessageContext {
  status: string
  stat: string
  diff: string
  omitted: string[]
  truncated: boolean
}

export async function getCommitMessageContext(
  worktreePath: string,
  options?: { signal?: AbortSignal },
): Promise<CommitMessageContext>
```

The exact module can be either:

- `src/system/git/commit-message-context.ts`
- or a small focused helper inside `src/system/commit-message-ai.ts` if it remains easy to review

Prefer a separate `src/system/git/commit-message-context.ts` if the helper needs multiple Git commands and truncation policy tests.

### Local Repository Flow

For local repositories and `provider === 'codex'`:

1. Read status with `git status --porcelain -z -uall`.
2. Read summary with `git diff --stat HEAD`.
3. Read textual diff with a size cap using `git diff HEAD --` without `--binary`.
4. Include limited untracked text file context.
5. Mark binary, oversized, or omitted content explicitly.
6. Build the Codex prompt from this context.
7. Invoke Codex with the existing JSONL non-interactive command shape.

### Remote Repository Flow

Keep remote repositories conservative.

If the lightweight context can be implemented reliably through the existing remote Git backend, use it. Otherwise, remote Codex generation can keep the current patch path for this phase. That prevents this optimization from destabilizing SSH behavior.

The design goal is to improve the common local path first without regressing remote repositories.

## Lightweight Context Contract

The context should be optimized for summarization, not replay.

Include:

- A status section with changed paths and porcelain status.
- A diff stat section from `git diff --stat HEAD`.
- A text diff section capped by total bytes.
- A limited untracked section for small text files.
- An omissions section for binary files, oversized files, skipped untracked files, and truncation.

Do not include:

- `GIT binary patch` payloads.
- Full large file contents.
- Full contents for every untracked file when many are present.
- Real paths beyond what Git reports for the worktree diff.

Suggested caps:

- Total context text: about 40 KB to 60 KB.
- Tracked text diff: about 40 KB.
- Untracked text content: about 16 KB total.
- Untracked files with content: about 10 files.

The exact caps can be constants in the context helper and covered by tests. The values should be simple and static in this phase.

## Codex Prompt Contract

Codex should receive a prompt tailored to richer commit messages:

- Return only the commit message.
- Write in English.
- Prefer Conventional Commits when it fits.
- Use an imperative subject line.
- Include a body by default when there is enough signal.
- Body should be 2 to 4 bullets or short lines.
- Mention concrete changed areas and user-visible impact when visible from the diff.
- Mention tests or verification only if the diff shows test changes or verification artifacts.
- Do not invent ticket numbers, issue links, reviewers, benchmarks, or behavior not visible in the context.
- Do not mention Codex or the prompt.
- Do not use Markdown fences.

This replaces the current sparse instruction:

```text
Use a short subject line and add a body only when it clarifies important details.
```

with a more explicit default-body instruction for Codex only.

## Provider Commands

Keep the current Codex invocation unless implementation evidence shows a smaller safe adjustment is needed:

```ts
['exec', '--json', '--sandbox', 'read-only', '--skip-git-repo-check', prompt]
```

Keep JSONL parsing unchanged:

- Split stdout into lines.
- Parse JSON objects.
- Use the final non-empty `item.completed` event where `item.type === 'agent_message'`.
- Normalize the provider output.

Keep the 60 second timeout for now. The user-visible performance target comes from reducing input preparation and prompt size, not from shortening the timeout.

## UI Behavior

No layout redesign.

The existing inline commit form behavior remains:

- `Codex` button starts generation.
- The selected provider button shows loading.
- Other generation buttons and commit action are disabled while generation is running.
- The textarea remains editable unless a commit is in progress.
- Empty textarea is filled automatically.
- Non-empty textarea triggers replacement confirmation.
- Errors remain inline.

No progress stages or cancel button are required in this phase. If generation remains slow after lightweight context optimization, progress/cancel can be a separate follow-up.

## Error Handling

Existing errors remain:

- Empty changes: `error.commit-message-empty-patch` or an equivalent stable key.
- Provider unavailable: `error.commit-message-provider-unavailable`.
- Timeout: `error.commit-message-timeout`.
- Empty Codex output: `error.commit-message-empty-output`.
- Non-zero Codex exit: show safe stderr/stdout text when available.
- Abort: do not show stale errors.

New lightweight-context edge cases:

- If status and diff are empty, return the existing empty-change error before invoking Codex.
- If content is truncated, include a clear truncation marker in the prompt context.
- If binary or oversized files are omitted, include a concise omission marker with the path.
- If untracked files exceed caps, include an omission marker with the count.

Codex must be told to avoid inventing details for omitted or truncated content.

## Testing

Add focused tests rather than broad UI rewrites.

System tests:

- Codex generation uses lightweight commit context for local repositories.
- Claude generation still uses the existing patch path.
- The Codex prompt asks for English, Conventional Commit style, and a body with 2 to 4 useful details.
- Binary patch payloads are not collected or passed in Codex context.
- Large diffs are truncated with an explicit marker.
- Many untracked files are capped and summarized.
- Empty context returns the existing empty-change error without invoking Codex.
- Codex JSONL parsing behavior remains unchanged.

Server tests:

- `generateRepositoryCommitMessage()` branches by provider.
- Local Codex path passes `cwd: worktreePath` and the lightweight context.
- Unknown provider still returns provider unavailable before reading Git state.

Renderer tests:

- Existing inline form generation fill behavior remains unchanged.
- Replacement confirmation remains unchanged.
- Provider error display remains unchanged.

Verification commands:

```sh
bun run test src/system/commit-message-ai.test.ts src/server/modules/repo.test.ts src/web/components/branch-list/InlineCommitDraftProvider.test.tsx src/web/components/branch-list/BranchWriteDialogs.test.tsx
bun run typecheck
bun run test
```

## Risks And Tradeoffs

- Lightweight context is not replayable. This is acceptable because commit-message generation only needs summarization.
- A capped context can miss details in huge changes. The prompt must state when content is omitted or truncated.
- Remote repositories may not receive the optimization in the first implementation if the remote backend lacks a clean lightweight context path.
- More detailed output may sometimes be too verbose for tiny changes. The prompt should say to use a single-line message only when the change is truly trivial.

## Acceptance Criteria

- Clicking `Codex` in the inline commit form still fills the existing textarea.
- For ordinary local text changes, Codex receives a smaller prompt than the current apply-equivalent patch path.
- Generated Codex messages are usually a subject plus useful body rather than only a terse subject.
- Claude behavior is unchanged.
- Commit execution is unchanged.
- Existing cancellation, timeout, replacement confirmation, and error behavior remain intact.
- Typecheck and relevant tests pass.
