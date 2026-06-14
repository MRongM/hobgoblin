# Commit Message AI JSONL And Diagnostics Design

## Context

The commit dialog already probes local `codex` and `claude` CLIs and can request a generated commit message from the current worktree diff. The current failure mode is poor: when Codex generation fails, the dialog only shows the translated generic message `提交信息生成失败`, which hides the real provider error.

The current implementation also treats Codex output as plain text. The desired Codex invocation is:

```sh
codex exec --json "<prompt>"
```

Codex emits JSONL events. The generated answer is in an `item.completed` event whose `item.type` is `agent_message` and whose `item.text` contains the response.

## Goals

- Generate commit messages through Codex by parsing JSONL event output.
- Extract the final non-empty Codex `agent_message` text from JSONL.
- Preserve existing protections:
  - provider probing for `codex` and `claude`
  - fallback executable discovery for GUI app PATH differences
  - nvm executable PATH repair
  - binary diff payload omission
  - prompt size cap
- Surface useful provider failures in the commit dialog instead of collapsing every failure to `提交信息生成失败`.
- Keep the API shape compatible with the existing renderer path: `{ ok: boolean, message: string }`.

## Non-Goals

- Do not add an AI settings page.
- Do not store API keys or call model APIs directly from the app.
- Do not change the commit operation itself.
- Do not auto-commit generated messages.
- Do not redesign the commit dialog layout.
- Do not change Claude to structured JSON mode in this pass.

## Architecture

The change stays inside the existing three-layer flow:

1. Renderer commit dialog calls `generateRepositoryCommitMessage(repoId, worktreePath, provider)`.
2. Server read path fetches the worktree patch through the existing repo backend.
3. System provider module prepares an AI-safe prompt and invokes the selected CLI.

The main implementation boundary remains `src/system/commit-message-ai.ts`. That module owns provider-specific command args, output parsing, prompt preparation, and failure mapping.

## Codex JSONL Handling

Codex should use a JSONL command shape:

```sh
codex exec --json "<prompt>"
```

The parser will:

- Split stdout into lines.
- Ignore empty lines.
- Attempt `JSON.parse` on each line.
- Ignore malformed lines instead of failing the whole response.
- Track events where:
  - `type === "item.completed"`
  - `item.type === "agent_message"`
  - `item.text` is a non-empty string
- Return the last non-empty `item.text`.

The parser ignores lifecycle events such as:

- `thread.started`
- `turn.started`
- `turn.completed`

If no agent message is found, generation returns:

```ts
{ ok: false, message: 'error.commit-message-empty-output' }
```

## Provider Commands

Codex command:

```ts
command: 'codex'
args: ['exec', '--json', prompt]
```

The prompt is passed as an argument rather than stdin. This matches the intended user reference and avoids depending on plain text stdout behavior.

Claude remains text mode:

```ts
command: 'claude'
args: ['--print', '--output-format', 'text', '--tools', '', '--no-session-persistence']
```

Claude continues to receive the prompt through the existing input path. This pass does not change Claude's command shape.

## Error Diagnostics

The backend keeps returning the existing result shape:

```ts
interface CommitMessageGenerationResult {
  ok: boolean
  message: string
}
```

Failure mapping rules:

- Timeout returns `error.commit-message-timeout`.
- Missing provider returns `error.commit-message-provider-unavailable`.
- Empty parsed provider output returns `error.commit-message-empty-output`.
- Non-zero provider exit prefers trimmed stderr.
- If stderr is empty, use trimmed stdout.
- If both are empty, use `error.commit-message-failed`.

The renderer displays errors as follows:

- If `message` starts with `error.`, translate it through i18n.
- Otherwise, display the provider text directly.

This keeps user-facing errors actionable. Examples include authentication failures, unknown flags, permission problems, and command startup failures.

## Prompt Preparation

The existing prompt preparation behavior remains required:

- Build a commit-message-specific instruction prompt.
- Omit `GIT binary patch` payloads.
- Replace binary sections with a concise marker such as:

```text
[binary diff omitted: assets/icon.png]
```

- Cap the diff portion to about 120 KB.
- Include a truncation marker if the diff is capped.

This keeps large worktrees and asset changes from overwhelming Codex or Claude.

## Testing

System tests should cover:

- Codex invokes `codex exec --json <prompt>`.
- Codex JSONL parsing extracts `item.completed.item.text` from `agent_message`.
- Multiple agent messages choose the final non-empty text.
- Missing agent messages return `error.commit-message-empty-output`.
- Non-zero provider exit returns stderr text when present.
- Existing binary diff omission and prompt cap tests continue to pass.
- Existing provider discovery and nvm PATH tests continue to pass.

Renderer tests should cover:

- Provider stderr text is displayed directly in the commit dialog.
- `error.*` messages are still translated.
- Empty message auto-fill and replace-confirm behavior remain unchanged.

Verification commands:

```sh
bun run test src/system/commit-message-ai.test.ts src/web/components/branch-list/BranchWriteDialogs.test.tsx
bun run typecheck
bun run test
```

## Rollout

After implementation and verification, rebuild and install the desktop app so the packaged `app.asar` contains the new provider logic:

```sh
bun scripts/build.ts install
```

The installed app must be restarted before testing the commit dialog.
