# Telegram Terminal Notifications Design

## Goal

Extend Telegram notifications in two related ways:

1. provide independent unread-bell and terminal-output-completion triggers;
2. optionally append the triggering internal terminal's last 200 visible characters to either notification type.

Keep the existing system-notification behavior, routing context, proxy use, and bell deduplication unchanged. This feature does not infer command completion or process exit.

Telegram `sendMessage` accepts 1–4096 characters after entity parsing. The structured Hobgoblin context plus a 200-character excerpt remains safely below that limit.

## User Experience

Settings > Notifications > Telegram keeps the existing Telegram master switch, Bot Token, Chat ID, test action, and save action. It adds three independent switches:

- **Unread bell** — sends the current Telegram notification for an eligible unread terminal bell.
- **Terminal run completed** — sends a Telegram notification whenever an internal terminal's output activity indicator changes from active to idle.
- **Include terminal output** — appends the triggering terminal's last 200 visible characters to both unread-bell and terminal-run-completed messages.

The output option is off by default because terminal output can contain commands, credentials, URLs, or other sensitive text. Empty excerpts are omitted. Native system notifications remain unchanged and never include terminal output.

The completion trigger is independent of application focus, terminal selection, and terminal visibility. The UI uses the user-facing phrase “terminal run completed” and explains that the trigger follows the terminal activity indicator. Domain types and implementation names use “terminal output completion” because the signal does not prove that a process exited.

## Domain Rules

- Terminal output activity remains the renderer-observed state already owned by `TerminalSessionRegistry`.
- Existing echo suppression, sustained-output threshold, and idle threshold remain unchanged and are the only basis for completion detection.
- A completion is the `active -> idle` transition of one observed output activity period.
- Brief output that never becomes active does not produce a completion.
- Clearing activity because a terminal closes, its backing server session changes, the registry resets, or the application exits does not produce a completion.
- Focus, selection, and visibility do not suppress a completion.
- A long-running command that becomes quiet long enough to turn off the breathing indicator completes one activity period even if the process continues. If output later becomes active and idle again, that is another completion period and may produce another notification.
- One activity period produces at most one Telegram completion delivery across all attached renderer clients.
- The excerpt belongs to the same internal terminal that triggered the bell or completion notification.
- The excerpt is ephemeral renderer state and is never written to application settings, logs, or disk.
- The excerpt is best-effort terminal output, not a complete transcript or guaranteed command result.
- ANSI/VT escape sequences and non-display control characters are removed. Newlines are retained and carriage returns are normalized.
- Truncation preserves Unicode code points and keeps the final 200 visible characters.
- Telegram delivery is best-effort. Failure does not alter unread-bell or terminal-activity state, retry an activity period, or block terminal rendering.

## Settings and Compatibility

The Telegram settings snapshot and persisted server settings add three booleans:

- `bellEnabled`
- `outputCompletionEnabled`
- `includeTerminalOutput`

The Telegram master `enabled` preference continues to gate all Telegram delivery. The existing terminal-notification master preference continues to gate Telegram delivery as it does today.

Compatibility rules:

- Existing installations with Telegram enabled migrate to `bellEnabled: true` so current bell delivery is preserved.
- New installations default `bellEnabled` to `true`, `outputCompletionEnabled` to `false`, and `includeTerminalOutput` to `false`.
- Missing or invalid persisted values normalize to those defaults.
- Saving credentials or trigger/content preferences returns only the masked settings snapshot; the Bot Token never enters the renderer cache.

## Architecture and Data Flow

### Bounded terminal output collector

`ManagedTerminalSession` maintains a bounded, in-memory plain-text tail while consuming output events. The collector works for visible and background sessions and resets when the backing server session changes.

Bell events carry the current excerpt alongside the existing process name, canonical title, and visibility state. Completion intents read the same session collector when the output activity period becomes idle. This gives both notification types terminal information from the exact triggering internal terminal without adding another server request.

### Output activity detection

`TerminalSessionRegistry` remains the sole owner of output activity detection. Its output handler records the latest canonical terminal output sequence for the current activity period. When the existing idle timer changes a terminal from active to idle, the registry emits a completion intent containing:

- the server terminal session ID;
- the final output sequence observed for the period;
- the existing terminal notification context;
- the current sanitized terminal output tail when the runtime preference enables it.

The registry does not emit from generic cleanup paths. This keeps indicator state and completion semantics DRY and prevents terminal closure from masquerading as completion.

### Renderer delivery boundary

Focused Telegram bell and completion controllers read the runtime Telegram settings and submit only enabled notification types. Both reuse the existing notification-context projection for project, workspace/worktree, directory, branch, terminal index, and terminal title. They include the excerpt only when `includeTerminalOutput` is enabled.

The renderer does not format Telegram text and does not attempt cross-window coordination.

### Server validation and global idempotency

The existing bell endpoint remains in place. Add a dedicated completion endpoint and write path beside it. Boundaries validate all untrusted fields and delegate formatting, preference checks, deduplication, and delivery to the write layer.

The completion idempotency key is the server terminal session ID plus the final output sequence of the completed activity period. Every renderer observing the same streamed period sees the same final sequence, so duplicate requests converge on one key. The server records accepted keys in a bounded in-memory cache before awaiting Telegram delivery. Concurrent requests for the same key therefore produce at most one send attempt.

The cache is runtime-only and bounded by age and entry count. A server restart may forget prior keys, which is acceptable because renderer activity state is also runtime-only. Different completion periods for the same terminal have different final output sequences and remain independently eligible.

For both endpoints, the server independently checks the authoritative trigger and output preferences. It validates and sanitizes the optional excerpt and omits it when terminal output is disabled. It does not trust renderer gating.

### Message formatting

Bell and completion messages use distinct localized titles and otherwise share the structured context formatter. When enabled and non-empty, each message adds a localized “Output tail” section containing at most 200 visible Unicode characters.

Completion messages do not add elapsed time, command text, exit status, or inferred success/failure because those values are not available from the activity signal.

### End-to-end flows

Unread bell:

1. Terminal output updates the bounded collector.
2. An eligible background bell produces the existing unread state.
3. The renderer checks the bell and output preferences and posts the context plus optional excerpt.
4. The server rechecks authoritative settings, validates input, formats the message, and uses the existing proxy-aware Telegram source.

Output completion:

1. Terminal output arrives through the existing realtime stream with a server session ID and monotonically increasing output sequence.
2. `TerminalSessionRegistry` applies the existing echo, sustained-output, and idle rules; the breathing indicator becomes active.
3. The existing idle timer expires and changes activity to idle.
4. The registry emits one completion intent unless the transition is a cleanup operation.
5. The renderer checks runtime preferences and posts the intent with the current optional excerpt.
6. The server validates settings and input, claims the idempotency key, formats localized text, and uses the existing Telegram source.

No polling, new realtime stream, Electron-specific IPC, durable notification queue, or terminal persistence is introduced.

## Alternatives Considered

### Always include output

This is the smallest UI change but can silently transmit sensitive terminal content. Rejected in favor of explicit opt-in.

### Query the server terminal model when sending

The server owns a canonical headless terminal model, but exposing a tail lookup through the notification path would add session identity authorization and terminal-host coupling. That complexity is unnecessary for a short best-effort excerpt.

### Observe React summary changes

This minimizes changes to the registry but makes mount/unmount behavior and snapshot replay part of completion correctness. It also risks duplicate transitions. Rejected.

### Recompute activity on the server

This could centralize activity across clients but duplicates the established breathing-indicator algorithm and creates two sources of truth unless the UI is also migrated. Rejected.

### Deduplicate completion only by time

A short server debounce can suppress legitimate adjacent periods or allow duplicates from delayed clients. Rejected in favor of the stable session-and-sequence idempotency key.

### Renderer collector plus registry transition and server idempotency (selected)

This reuses one output collector and one activity definition, preserves existing thresholds, avoids another terminal-content query, and provides global at-most-once completion delivery.

## Error, Security, and Privacy Handling

- The Telegram routes use the existing application authentication boundary.
- Server terminal session IDs, output sequences, context fields, and excerpts use explicit type and size limits.
- Invalid, oversized, or control-character-bearing excerpts are rejected as invalid input before Telegram delivery.
- Empty or fully stripped excerpts do not fail the notification; the structured context is sent alone.
- The server checks authoritative settings rather than trusting renderer gating.
- Delivery failures retain the existing safe error-code logging and never log the excerpt, Bot Token, Chat ID, or formatted message.
- Enabling terminal output explicitly communicates that shell content may contain sensitive information.

## Testing

- Unit-test stateful ANSI/VT stripping across output chunk boundaries, Unicode-safe truncation, reset behavior, and empty output.
- Verify visible and background sessions maintain isolated tails and each notification uses only its triggering terminal's tail.
- Settings source tests cover defaults, migration, normalization, persistence, and masked snapshots for all three preferences.
- Settings UI tests cover independent switches, simultaneous enablement, dirty/save behavior, privacy hints, and localization.
- Bell controller tests verify bell gating and excerpt inclusion/omission without changing native notification content.
- Registry tests verify inactive-to-active-to-idle completion, brief-output exclusion, echo exclusion, repeated periods, and no completion on close, backing-session replacement, or reset.
- Completion controller tests verify master gating, focus independence, context reuse, and excerpt inclusion/omission.
- Route and write-path tests verify validation, authoritative setting gates, localized formatting, the 200-character maximum, and safe error handling.
- Idempotency tests send concurrent and sequential duplicate completion requests from simulated clients and assert one send attempt, while distinct final output sequences remain eligible.
- Run targeted tests, `bun run typecheck`, `bun run check:architecture`, and `bun run test` without concurrent resource contention.

## Out of Scope

- Detecting shell prompt state, child-process exit, exit status, success, or failure.
- User-configurable activity thresholds or notification delays.
- Completion notifications through the native system-notification channel.
- Durable retries, delivery history, or terminal transcripts.
- Per-project, per-worktree, or per-terminal trigger overrides.
