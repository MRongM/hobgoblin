# Windows Codex Commit Message Stdin Design

**Date:** 2026-08-13
**Scope:** Fix Codex commit-message generation on Windows without changing commit execution or the renderer flow.

## Problem

Hobgoblin passes the complete Codex prompt as the final `codex exec` command-line argument. The lightweight commit context can contain roughly 56 KB of tracked and untracked text, while Windows process creation rejects command lines near 32 KB. The failure occurs before Codex can respond and is surfaced as a spawn error.

## Decision

Invoke Codex with `-` as its prompt argument and send the complete prompt through stdin:

```text
codex exec --json --sandbox read-only --skip-git-repo-check -
```

Codex documents that a missing prompt or `-` reads instructions from stdin. This keeps the process command line bounded while preserving the full capped commit context.

## Alternatives

1. **Cap the prompt below the Windows command-line limit.** Rejected because quoting overhead is variable and useful commit context would be discarded only on Windows.
2. **Write the prompt to a temporary file.** Rejected because it adds file lifecycle, privacy, and cleanup concerns when Codex already supports stdin.
3. **Resolve and invoke the native `codex.exe` directly.** Rejected because the native executable has the same Windows command-line limit and bypasses the existing provider discovery contract.

## Boundaries

- Change only `src/system/commit-message-ai.ts` and its focused tests.
- Keep JSONL output parsing, read-only sandboxing, timeout, cancellation, executable fallback, and renderer/server API behavior unchanged.
- Keep Claude's stdin behavior and command unchanged.
- Do not add Windows-specific branching; stdin is safe and consistent on every supported platform.

## Verification

- A focused test must assert that Codex receives `-` in argv and the prompt in `input`.
- Existing prompt-content, fallback-executable, JSONL, timeout, and Claude tests must remain green.
- Run the focused test, typecheck, full test suite, and architecture check.
