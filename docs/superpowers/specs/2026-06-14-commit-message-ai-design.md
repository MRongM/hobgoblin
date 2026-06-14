# Commit Message AI Generation Design

**Date:** 2026-06-14
**Scope:** Add optional Codex / Claude-powered commit message generation to the existing commit dialog.

## Goal

When a user opens the `Commit all changes` dialog, Hobgoblin should detect whether the local system can run `codex` and/or `claude`. If either tool is available, the dialog shows a compact button for that provider. Clicking the button generates a commit message from the current worktree's uncommitted changes.

The generated message fills the existing commit message textarea. The actual Git commit flow remains unchanged and still runs only when the user clicks `Commit`.

## Non-Goals

- No automatic commit execution after message generation.
- No AI settings page or default-provider preference in this phase.
- No remote hosted AI API integration.
- No arbitrary command configuration.
- No branch history summary, PR summary, or issue-linking workflow.
- No generation from only staged changes.

## Existing Context

The commit dialog currently lives in `src/web/components/branch-list/BranchWriteDialogs.tsx`. `CommitDialog` renders one textarea and calls `onCommit(message)` when confirmed.

The existing commit action already commits all changes by running `git add -A` before `git commit -m`:

- Web client: `src/web/repo-client.ts`
- Server route: `src/server/routes/repo.ts`
- Server backend: `src/server/modules/repo-backend.ts`
- Git command: `src/system/git/commit.ts`

Patch generation already exists for the copy-patch action and produces an apply-equivalent patch for the selected worktree:

- Route: `POST /api/repo/patch`
- Read path: `getRepositoryPatch()`
- Backend method: `getPatch(worktreePath)`
- Local system helper: `getWorktreePatch(worktreePath)`

The AI generation feature should reuse this patch source so the generated message describes the same change set that `Commit all changes` will commit: staged tracked changes, unstaged tracked changes, and untracked files.

## UI Behavior

Use the approved layout A.

In `CommitDialog`, render a small provider button area on the `Commit message` label row:

- Show `Codex` only when the provider detector reports `codex: true`.
- Show `Claude` only when the provider detector reports `claude: true`.
- If both are unavailable, show no generation UI.
- If both are available, show both buttons.

Button behavior:

1. User clicks `Codex` or `Claude`.
2. The clicked provider button enters loading state.
3. Other generation buttons and the `Commit` button are disabled while generation is running.
4. The textarea remains editable while generation runs.
5. On success:
   - If the textarea is empty, fill it with the generated message.
   - If the textarea already contains text, ask for confirmation before replacing it.
6. On failure, show an inline error in the dialog and keep the dialog open.

The provider buttons should use the existing compact `Button` component with `size="sm"`. Do not add a large AI panel or explanatory in-app copy. The dialog remains a commit dialog, not a separate AI workflow.

## Frontend Data Flow

Add small client functions in `src/web/repo-client.ts`:

```ts
type CommitMessageProvider = 'codex' | 'claude'

interface CommitMessageProviderAvailability {
  codex: boolean
  claude: boolean
}

interface CommitMessageGenerationResult {
  ok: boolean
  message: string
}
```

Client calls:

- `getCommitMessageProviders(signal?)`
- `generateCommitMessage(repoId, worktreePath, provider, signal?)`

`CommitDialog` should receive enough context to request generation:

- `repoId`
- `worktreePath`

The existing `onCommit(message)` contract remains unchanged.

Provider availability can be fetched when the dialog opens. The first version does not need global caching. If the dialog closes while detection or generation is running, abort the request.

## Server API

Add two read-only endpoints under `src/server/routes/repo.ts`:

```text
POST /api/repo/commit-message-providers
```

Returns provider availability:

```ts
{
  codex: boolean
  claude: boolean
}
```

```text
POST /api/repo/generate-commit-message
```

Request:

```ts
{
  repoId: string
  worktreePath: string
  provider: 'codex' | 'claude'
}
```

Response:

```ts
{ ok: true, message: string }
| { ok: false, message: string }
```

The generation endpoint validates the repository and worktree using the same backend path used by patch generation. It must not call the AI provider if the patch is empty.

## System Layer

Add a small provider module, for example `src/system/commit-message-ai.ts`.

Responsibilities:

- Define the provider union: `'codex' | 'claude'`.
- Probe availability for each provider without shell string interpolation.
- Generate a commit message from a patch using only whitelisted provider commands.
- Apply timeouts and cancellation.
- Normalize provider output into a commit message string.

Suggested public functions:

```ts
export type CommitMessageProvider = 'codex' | 'claude'

export interface CommitMessageProviderAvailability {
  codex: boolean
  claude: boolean
}

export async function probeCommitMessageProviders(signal?: AbortSignal): Promise<CommitMessageProviderAvailability>

export async function generateCommitMessageFromPatch(
  provider: CommitMessageProvider,
  patch: string,
  options?: { cwd?: string; signal?: AbortSignal },
): Promise<{ ok: true; message: string } | { ok: false; message: string }>
```

The provider module should call CLIs with `execa` argument arrays, never through a concatenated shell command.

Local command evidence from this environment:

- `codex` supports non-interactive generation through `codex exec`.
- `codex exec` supports stdin with `-`, `--ephemeral`, `--sandbox read-only`, and `--color never`.
- `claude` supports non-interactive output through `claude --print`.
- `claude --print` supports text output and can disable tools with `--tools ""`.

The implementation should keep these details behind provider adapters so future CLI changes do not leak into the UI or route code.

## Prompt Contract

The provider prompt should include only the necessary instruction and the patch text.

Requirements for the generated output:

- Return only the commit message.
- First line is a concise summary.
- Use a body only when useful.
- No Markdown fences.
- No explanation of reasoning.
- Do not mention provider names.
- Do not invent changes outside the patch.
- Prefer imperative mood when natural.

The prompt should explain that the patch represents the complete current commit candidate: staged, unstaged, and untracked worktree changes.

## Output Normalization

Normalize provider output before returning to the renderer:

- Trim leading and trailing whitespace.
- Strip surrounding Markdown code fences if present.
- Strip common prefixes such as `Commit message:` when the rest is usable.
- Preserve multi-line commit messages.
- Reject empty output with a user-visible error.
- Cap output length to a reasonable bound, for example 2000 characters.

Do not log the patch or generated message body. Error logging may include provider name and exit code but not the diff content.

## Error Handling

User-visible errors should stay inside the commit dialog.

Expected cases:

- No provider available: no buttons are rendered.
- Provider unavailable at generation time: return an error and do not fall back to another provider.
- Empty patch: return an error such as `error.commit-message-empty-patch`.
- CLI timeout: return an error such as `error.commit-message-timeout`.
- CLI exits non-zero: return stderr if concise and safe, otherwise use a generic provider failure message.
- Request aborted: do not show a stale error after the dialog closes.

Existing manual commit behavior must continue to work even if provider detection or generation fails.

Add i18n keys for new user-visible messages in every existing dictionary under `src/shared/i18n/`:

- Empty patch.
- Provider unavailable.
- Provider timeout.
- Provider failed.
- Confirm replacing an existing commit message.

## Privacy and Safety

The current worktree patch is sent to the selected local CLI. That CLI may use its own configured model provider. Hobgoblin should not send the patch anywhere else.

Safety boundaries:

- Provider command names are fixed by the provider enum.
- The renderer cannot pass arbitrary executable names.
- The provider adapters use non-interactive modes.
- Generation is read-only and separate from `commitAllChanges()`.
- Codex should run with a read-only sandbox.
- Claude should run with tools disabled for this task.
- No generated message is committed automatically.

## Testing

System tests:

- Provider probe returns booleans for installed and missing commands.
- Unknown provider cannot be generated.
- Empty patch does not call any CLI.
- Provider invocation uses argument arrays and the expected non-interactive flags.
- Output normalization handles plain output, fenced output, prefixed output, empty output, and multi-line output.
- Timeout and non-zero exit paths return structured errors.

Server tests:

- Provider route returns availability.
- Generate route validates provider.
- Generate route validates repo/worktree through the existing backend path.
- Generate route does not call provider for empty patch.
- Generate route returns provider output on success.
- Generate route propagates safe error messages on failure.

Renderer tests:

- No provider buttons render when both providers are unavailable.
- Only `Codex` renders when only Codex is available.
- Only `Claude` renders when only Claude is available.
- Both buttons render when both providers are available.
- Empty textarea is filled automatically after generation.
- Non-empty textarea requires confirmation before replacement.
- Generation loading disables generation and commit buttons but leaves textarea editable.
- Generation errors are shown inline and do not close the dialog.

Verification:

```sh
bun run typecheck
bun run test
```

## Implementation Notes

Keep the change small:

- Do not add settings state.
- Do not add provider preference persistence.
- Do not alter the existing commit execution path.
- Do not add a generic AI framework.
- Do not refactor unrelated branch action code.

The first implementation should deliver the complete user path for local CLI-backed generation and keep provider details isolated behind a small system module.
