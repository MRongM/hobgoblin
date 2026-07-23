# Telegram Completion Duration and Screen Excerpt Design

**Date:** 2026-07-23
**Status:** Approved for implementation planning

## Goal

Reduce noisy Telegram terminal-output-completion notifications by requiring a configurable minimum observed output-activity duration, without changing the terminal output activity indicator. Replace the current raw PTY-tail excerpt with text derived from the server-owned headless terminal screen so tmux and TUI redraws do not accumulate as repeated frames or leak partial control sequences.

## Confirmed Product Decisions

- The setting affects only Telegram terminal-output-completion notifications.
- The terminal output activity indicator keeps its current timing: sustained output activates it after 1 second, and 1.2 seconds of qualifying silence makes it idle.
- Telegram completion eligibility uses a configurable integer duration from 1 through 3600 seconds.
- The default is 10 seconds for both new installations and upgraded installations whose settings do not contain the new field.
- The settings UI provides 1-second, 10-second, and 30-second shortcuts plus manual integer input.
- Telegram unread-bell delivery is not duration-gated.
- Telegram bell and completion excerpts both use the corrected server-owned screen source.
- Native system bell notifications remain unchanged and never include terminal output.

## Domain Semantics

The setting is the **Telegram completion minimum activity duration**, not a process-running threshold. An observed activity period starts with its first qualifying output after input-echo suppression and ends at its last qualifying output before the existing 1.2-second idle transition. The trailing idle wait is not part of the duration.

The signal does not prove that a process exited. A long-running process that becomes quiet for 1.2 seconds can complete an observed activity period and become eligible for notification. A later active-to-idle period is evaluated independently.

## Settings Contract

Persist the exact integer duration in seconds rather than a semantic level. The shared Telegram notification settings snapshot and update input gain one field representing the minimum completion activity duration in seconds.

Validation and normalization rules:

- accepted update values are integers from 1 through 3600;
- missing persisted values normalize to 10 seconds;
- invalid persisted values normalize to 10 seconds;
- invalid update requests are rejected rather than clamped;
- the existing completion-enabled switch remains the only way to disable completion notifications.

The setting remains server-owned runtime-coherent state. Renderer settings snapshots project the authoritative value, and the existing Telegram save flow writes it with the other Telegram preferences.

## Settings UI

Add a row directly below the Telegram terminal-output-completion switch in **Settings → Notifications → Telegram**.

- Label: “完成通知最短活动时长” / “Minimum activity duration for completion notifications”.
- Hint: explain that only output periods meeting this duration can produce a Telegram completion notification and that this does not alter the terminal activity indicator.
- Provide shortcut controls for low/1 second, medium/10 seconds, and high/30 seconds.
- Provide an integer seconds input with a range of 1–3600.
- Shortcut selection and manual input edit the same local draft value.
- Save through the existing Telegram Save action.
- Preserve the value while completion notifications are disabled so users can configure it before enabling delivery.

## Activity Duration Ownership

`TerminalSessionRegistry` remains the sole owner of renderer-observed terminal output activity periods. It must not read Telegram settings.

The registry already tracks the current burst start and last output timestamps. On the existing active-to-idle transition, it computes:

```text
activityDurationMs = lastQualifyingOutputAt - burstStartAt
```

The completion intent gains this duration alongside the existing server session ID and final output sequence. Cleanup paths still clear activity without emitting completion intents.

This adds no polling, stream, timer, or per-output parsing. It reuses timestamps and the idle timer already required by the activity indicator.

## Completion Eligibility Flow

Use defense-in-depth gating without coupling terminal activity to Telegram configuration:

1. Terminal output reaches `TerminalSessionRegistry` through the existing realtime stream.
2. The existing echo, sustained-output, and idle rules produce one activity period.
3. The registry emits an intent containing `activityDurationMs` when an active period becomes idle.
4. The Renderer reads the runtime Telegram setting and skips the request when the duration is below the configured minimum.
5. A qualifying request sends the duration with the existing session and sequence identity.
6. The Server validates the duration and compares it with authoritative settings before claiming delivery.
7. Existing `sessionId + finalOutputSeq` idempotency ensures at most one send attempt across clients.

The Renderer check prevents unnecessary network traffic. The Server check preserves authoritative behavior for stale snapshots, multiple windows, and untrusted clients.

## Server-Owned Screen Excerpt

### Existing defect

The current `terminal-output-tail` collector strips a subset of escape sequences from raw PTY chunks and appends the remaining characters as a linear log. It does not apply cursor movement, line erasure, or screen overwrite semantics. Repeated tmux status redraws therefore accumulate as spinner frames. Its incomplete handling of character-set selection sequences such as `ESC ( B` also leaks the final `B`, which combines with a real tmux status `[` to produce `B[`.

### Selected source

Use the existing server-owned headless xterm render model as the terminal output excerpt source. The model already applies terminal control semantics for every server session, including sessions never opened in a particular Renderer.

When an eligible Telegram bell or completion notification requests an excerpt and the authoritative setting enables output inclusion:

1. identify the server terminal session;
2. read visible text from its active headless xterm buffer, including retained scrollback needed to satisfy the configured tail length;
3. traverse screen lines in display order and use xterm buffer cell text rather than serialized ANSI bytes;
4. collapse consecutive whitespace and compact long horizontal rules through the existing Telegram normalization contract;
5. keep only the configured final 1–4096 visible characters;
6. shorten further when necessary to keep the complete Telegram message within 4096 characters.

The visible screen is authoritative. A single tmux status row that genuinely exists on the final screen may remain, but superseded redraw frames and control-sequence fragments must not appear. Do not add content-pattern heuristics that attempt to identify and remove tmux status text.

The Renderer no longer needs to send raw output text for Telegram delivery. Notification context continues to carry terminal identity and presentation metadata; the Server resolves the optional excerpt from the same terminal session at delivery time.

## Bell Session Identity

Completion contexts already carry the server session ID. Telegram bell contexts must carry the corresponding server session ID as validated internal identity so the Server can resolve the same headless screen. This identity is not shown in the formatted Telegram message.

Native bell notification delivery and unread bell state remain independent of this addition.

## Failure, Privacy, and Security

- If the terminal session is gone or screen extraction fails, send the eligible notification without an excerpt.
- Do not fail, retry, or change unread state solely because an optional excerpt is unavailable.
- Do not read the headless screen when terminal output inclusion is disabled.
- Do not persist excerpts or add terminal contents to settings, logs, delivery history, or error messages.
- Continue validating all context fields, session identity, output sequence, and activity duration at the Server boundary.
- Continue enforcing authoritative Telegram master, trigger, and output-inclusion preferences on the Server.
- Bot Tokens, Chat IDs, excerpts, and fully formatted messages must remain absent from logs.

## Performance

Duration tracking reuses the registry’s existing maps and timestamps and performs one subtraction at the idle transition. Renderer gating means short periods generate no HTTP request. Server gating performs constant-time validation and comparison.

Headless xterm rendering already occurs for terminal correctness and reattachment. Excerpt extraction runs only for an eligible notification with output inclusion enabled and reads only enough trailing buffer content to satisfy the configured maximum. It introduces no new terminal model, polling, background task, or package.

## Testing

### Settings

- Default new and missing legacy values to 10 seconds.
- Normalize corrupt persisted values to 10 seconds.
- Accept integer boundaries 1 and 3600 and representative shortcuts 1, 10, and 30.
- Reject zero, negative, fractional, non-numeric, and greater-than-3600 updates.
- Verify snapshot masking and persistence remain privacy-safe.
- Verify shortcut controls and manual input edit and save the same draft value.

### Activity and eligibility

- Verify duration starts at the first qualifying output and ends at the last qualifying output.
- Verify the trailing 1.2-second idle wait is excluded.
- Verify the terminal output activity indicator timing is unchanged.
- Verify Renderer early gating for durations below and at the configured threshold.
- Verify Server authoritative gating with stale or malicious Renderer inputs.
- Verify distinct periods remain independently eligible and duplicate client requests remain idempotent.
- Verify Telegram bell delivery ignores the completion duration threshold.

### Screen excerpt

- Feed the headless model tmux-style `ESC ( B`, cursor positioning, line erase, carriage-return overwrite, and spinner redraw sequences.
- Assert only the final screen text remains, superseded frames are absent, and no `B[` fragment leaks from escape parsing.
- Cover normal-buffer scrollback and active alternate-buffer screen text.
- Verify configured character limits, Unicode-safe truncation, whitespace collapse, horizontal-rule compaction, and complete Telegram message limits.
- Verify a missing or closed session produces a notification without an excerpt.
- Verify both Telegram bell and completion messages use the same screen excerpt source.

### Regression gates

Run focused tests during implementation, then:

```sh
bun run typecheck
bun run check:architecture
bun run test
```

## Alternatives Considered

### Filter inside `TerminalSessionRegistry`

Rejected because it couples renderer terminal activity ownership to Telegram settings.

### Server-only duration filtering

Rejected as the sole filter because every short period would still create an avoidable request. The Server remains the authoritative second gate.

### Renderer xterm screen extraction

Rejected because a Renderer may never have opened the terminal, and multiple clients can hold different local xterm histories.

### Expand the custom raw escape parser

Rejected because correctly applying cursor, erase, alternate-buffer, and screen-overwrite semantics would recreate a partial terminal emulator and remain fragile for tmux and TUIs.

### Content-based tmux status filtering

Rejected because tmux status formats are user-configurable and indistinguishable from legitimate terminal text without brittle heuristics.

## Out of Scope

- Detecting process exit, exit status, command boundaries, success, or failure.
- Changing terminal output activity indicator timing or colors.
- Duration-gating Telegram unread-bell notifications.
- Per-project, per-worktree, or per-terminal duration overrides.
- Removing a current tmux status row through content heuristics.
- Durable notification retries, history, or terminal transcripts.
