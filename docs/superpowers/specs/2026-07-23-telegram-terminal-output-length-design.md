# Telegram Terminal Output Length Design

## Goal

Allow users to configure how many trailing visible terminal characters Telegram notifications include. The accepted range is 1–4096 Unicode code points, existing and new installations default to 400, and the complete Telegram message must never exceed Telegram's 4096-character `sendMessage` limit.

## User Experience

Settings > Notifications > Telegram adds a numeric **Terminal output characters** row immediately after **Include terminal output**. It uses the existing settings number input with a minimum of 1, a maximum of 4096, a step of 1, and a default value of 400.

The value remains editable and persisted independently of the include-output switch so users can configure it before enabling output. Invalid or incomplete drafts retain the previous valid value through the existing number-input behavior. The hint explains that consecutive spaces, tabs, and line breaks count as one space, that the value is a maximum, and that Telegram's whole-message limit can make the delivered excerpt shorter.

All four supported languages receive equivalent labels and hints.

## Settings Contract and Persistence

`TelegramNotificationSettingsSnapshot` and `TelegramNotificationSettingsUpdateInput` gain `outputTailLength: number`.

Shared constants define:

- minimum: 1;
- default: 400;
- maximum: 4096.

Server settings persist the value as `telegramOutputTailLength`. A missing or malformed persisted value migrates to 400; a finite persisted number is rounded and clamped to 1–4096. Settings writes accept only finite integers in range and otherwise return the existing `invalid-input` error. Runtime and test fallback snapshots use 400.

## Collection and Renderer Data Flow

Every managed terminal collector strips terminal control sequences and incrementally collapses consecutive spaces, tabs, and line breaks to one ordinary space before retaining at most 4096 visible Unicode code points. This is a small, fixed, per-terminal bound and avoids reconfiguring live terminal sessions when settings change. Incremental normalization ensures large whitespace runs do not evict useful output and works across output chunk boundaries.

When either a bell or output-completion notification is prepared, the renderer reads the current runtime Telegram settings, applies the same whitespace normalization defensively, and keeps only the final `outputTailLength` code points. Disabling terminal output still removes the excerpt entirely. Changing the setting therefore affects existing terminal sessions immediately while preserving the current session isolation, ANSI stripping, and reset lifecycle.

The renderer remains a best-effort producer. It does not format Telegram messages or calculate the final whole-message budget.

## Authoritative Server Enforcement

The server continues to validate structured notification context and the sanitized excerpt. It applies the same whitespace normalization before counting characters, so repeated spaces, tabs, and line breaks do not consume the configured allowance. Normalized renderer payloads may contain at most 4096 Unicode code points; larger or control-character-bearing payloads are invalid.

For an enabled notification, the server:

1. reloads the authoritative Telegram settings;
2. removes the excerpt when output inclusion is disabled;
3. collapses consecutive spaces, tabs, and line breaks and keeps only the final configured number of excerpt code points;
4. formats the localized structured prefix and output-section label;
5. applies the remaining part of the 4096-code-point whole-message budget to the excerpt, again preserving its trailing characters.

Structured project, context, directory, branch, terminal, and title fields are never discarded to make room for output. If no budget remains, the output section is omitted. The current field limits keep the structured message itself below 4096 characters.

This policy applies identically to unread-bell and terminal-output-completion messages. Test messages contain no terminal excerpt and are unchanged.

## Error, Privacy, and Compatibility

- Existing settings without the new field migrate to the new 400-character default.
- Output remains opt-in and ephemeral; increasing the configured maximum does not persist a transcript.
- Notification failures keep the current safe-code logging behavior and never log terminal output or credentials.
- Unicode truncation operates on code points rather than UTF-16 code units, avoiding split surrogate pairs.
- ANSI/VT stripping and forbidden-control filtering remain unchanged.
- No dependency, realtime protocol, terminal persistence, or Electron IPC is added.

## Testing

- Shared and server settings tests cover the 400 default, legacy migration, malformed persistence, boundary values, invalid settings writes, saving, masking, and runtime fallback values.
- Collector tests verify its default capacity is 4096 while retaining current ANSI, Unicode, and reset behavior, and verify whitespace normalization across chunks before counting.
- Bell and completion controller tests verify current settings take effect immediately and each sends the final configured suffix only when output inclusion is enabled.
- Server write-path tests verify authoritative configured truncation, 1 and 4096 boundaries, oversized rejection, Unicode suffix preservation, and a complete formatted message of at most 4096 code points.
- Settings UI tests verify rendering, editing, request payloads, saved-state refresh, and localized copy.
- Final verification runs targeted tests, `bun run typecheck`, `bun run check:architecture`, and `bun run test` sequentially.

## Out of Scope

- Separate output lengths for bell and completion notifications.
- Per-project, per-worktree, or per-terminal lengths.
- Message splitting or sending the excerpt as a second Telegram message.
- Byte-based limits or grapheme-cluster counting.
- Changes to terminal activity detection, Telegram retries, or notification delivery history.
