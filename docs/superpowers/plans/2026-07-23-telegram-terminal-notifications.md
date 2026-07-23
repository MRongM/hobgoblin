# Telegram Terminal Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add independently configurable Telegram unread-bell and terminal-output-completion notifications, with an opt-in sanitized 200-character output tail for both message types.

**Architecture:** Keep output-tail collection and output-activity transitions renderer-local, where existing terminal session and breathing-indicator state live. Send validated intents to focused server write paths; the server owns authoritative preference gating, localized formatting, proxy-aware delivery, and bounded cross-client completion idempotency keyed by server session ID plus final output sequence.

**Tech Stack:** TypeScript 6 in Node.js strip-only mode, React 19, TanStack Query, Hono, Vitest, Bun.

## Global Constraints

- Do not use enums, runtime namespaces, parameter properties, or TypeScript import aliases.
- Use repository aliases with explicit `.ts`/`.tsx` extensions.
- Keep Bot Tokens out of renderer snapshots, logs, tests, docs, and fixtures.
- Use privacy-safe generic paths, IDs, tokens, and terminal output.
- Add no dependency; implement the bounded collector locally.
- Native system notifications remain bell-only and never include terminal output.
- Completion is the existing breathing indicator's `active -> idle` transition, not process exit.
- Completion ignores focus, selection, and visibility; cleanup never emits it.
- One completion period produces at most one server send attempt across clients.
- Do not commit, branch, stage, or push without separate user authorization.

---

### Task 1: Persist independent Telegram preferences

**Files:**
- Modify: `src/shared/telegram-notifications.ts`
- Modify: `src/shared/settings-defaults.ts`
- Modify: `src/server/modules/settings-source.ts`
- Test: `src/shared/settings-defaults.test.ts`
- Test: `src/shared/settings-snapshot.test.ts`
- Test: `src/server/modules/settings-source.test.ts`
- Test: `src/server/modules/settings-write-paths.test.ts`
- Test: `src/web/settings-write-paths.test.ts`
- Modify typed `telegramNotifications` fixtures under `src/**/*.test.ts{,x}`

**Interfaces:**
- Produces: `TelegramNotificationSettingsSnapshot` and `TelegramNotificationSettingsUpdateInput` with `bellEnabled`, `outputCompletionEnabled`, and `includeTerminalOutput`.
- Produces: authoritative configuration consumed by Tasks 3 and 5.

- [ ] **Step 1: Write failing default, migration, persistence, and masking tests**

Use this canonical snapshot shape:

```ts
const telegramNotifications = {
  enabled: true,
  botTokenConfigured: true,
  chatId: '-100123',
  bellEnabled: true,
  outputCompletionEnabled: false,
  includeTerminalOutput: false,
}
```

Add a legacy-file test with `telegramNotificationsEnabled: true` and no new fields. Assert `bellEnabled: true`, `outputCompletionEnabled: false`, and `includeTerminalOutput: false`. Add a save test that changes all three and verifies both disk data and the masked snapshot.

- [ ] **Step 2: Verify focused tests fail**

```bash
bun run test -- src/shared/settings-defaults.test.ts src/shared/settings-snapshot.test.ts src/server/modules/settings-source.test.ts src/server/modules/settings-write-paths.test.ts src/web/settings-write-paths.test.ts
```

Expected: FAIL because the new properties do not exist.

- [ ] **Step 3: Extend shared contracts and defaults**

```ts
export interface TelegramNotificationSettingsSnapshot {
  enabled: boolean
  botTokenConfigured: boolean
  chatId: string
  bellEnabled: boolean
  outputCompletionEnabled: boolean
  includeTerminalOutput: boolean
}

export interface TelegramNotificationSettingsUpdateInput {
  enabled: boolean
  botToken?: string
  chatId: string
  bellEnabled: boolean
  outputCompletionEnabled: boolean
  includeTerminalOutput: boolean
}
```

Update `defaultSettingsSnapshot()` and all typed fixtures with the canonical defaults.

- [ ] **Step 4: Extend server persistence and compatibility normalization**

Add to `ServerSettingsData`:

```ts
telegramBellNotificationsEnabled: boolean
telegramOutputCompletionNotificationsEnabled: boolean
telegramIncludeTerminalOutput: boolean
```

Normalize legacy data with:

```ts
telegramBellNotificationsEnabled: parsed.telegramBellNotificationsEnabled !== false,
telegramOutputCompletionNotificationsEnabled: parsed.telegramOutputCompletionNotificationsEnabled === true,
telegramIncludeTerminalOutput: parsed.telegramIncludeTerminalOutput === true,
```

Project the fields from `telegramNotificationSettingsFromData`, initialize new settings data, and write all three from the update input.

- [ ] **Step 5: Verify focused tests pass**

Run Step 2's command. Expected: PASS and no Bot Token in serialized snapshots.

---

### Task 2: Collect a sanitized bounded output tail

**Files:**
- Create: `src/web/components/terminal/terminal-output-tail.ts`
- Test: `src/web/components/terminal/terminal-output-tail.test.ts`
- Modify: `src/web/components/terminal/types.ts`
- Modify: `src/web/components/terminal/ManagedTerminalSession.ts`
- Test: `src/web/components/terminal/ManagedTerminalSession.test.ts`

**Interfaces:**
- Produces: `createTerminalOutputTail(maxCharacters?: number): TerminalOutputTail`.
- Produces: `ManagedTerminalSession.outputTail(): string`.
- Produces: optional `outputTail` on `TerminalBellEvent`.

- [ ] **Step 1: Write failing collector tests**

Cover chunk-spanning ANSI/VT sequences, CR normalization, retained newlines, forbidden controls, Unicode code-point truncation, empty input, and reset:

```ts
const tail = createTerminalOutputTail(5)
tail.push('\u001b[31mhello')
tail.push('world\u001b[0m')
expect(tail.value()).toBe('world')
tail.reset()
expect(tail.value()).toBe('')
```

- [ ] **Step 2: Verify the new test fails**

```bash
bun run test -- src/web/components/terminal/terminal-output-tail.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the stateful collector**

```ts
export interface TerminalOutputTail {
  push(data: string): void
  value(): string
  reset(): void
}

export function createTerminalOutputTail(maxCharacters = 200): TerminalOutputTail
```

Track plain, ESC, CSI, OSC, and OSC-escape states so control sequences split across chunks remain excluded. Retain no more than 200 Unicode code points plus parser state.

- [ ] **Step 4: Write failing managed-session lifecycle tests**

Assert `handleOutput()` collects attached and background output, `outputTail()` returns it, hydration to a different server session resets it, and bell events carry only that session's tail.

- [ ] **Step 5: Integrate the collector**

Push `result.output` before the live/background branch, reset beside `backgroundBellScanner.reset()`, expose:

```ts
outputTail(): string {
  return this.terminalOutputTail.value()
}
```

Extend `TerminalBellEvent` with `outputTail?: string` and populate it in `handleBell()`.

- [ ] **Step 6: Verify collector and session tests pass**

```bash
bun run test -- src/web/components/terminal/terminal-output-tail.test.ts src/web/components/terminal/ManagedTerminalSession.test.ts
```

Expected: PASS.

---

### Task 3: Append optional output to unread-bell messages

**Files:**
- Modify: `src/shared/telegram-notifications.ts`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`
- Modify: `src/web/components/terminal/terminal-notification-context.ts`
- Modify: `src/web/components/terminal/terminal-bell-controller.ts`
- Modify: `src/server/modules/telegram-notification-write-paths.ts`
- Test: `src/web/components/terminal/terminal-notification-context.test.ts`
- Test: `src/web/components/terminal/terminal-bell-controller.test.ts`
- Test: `src/server/modules/telegram-notification-write-paths.test.ts`

**Interfaces:**
- Consumes: Task 1 preferences and Task 2 `TerminalBellEvent.outputTail`.
- Produces: optional `outputTail` in `TelegramBellNotificationContext` and localized output-tail formatting.

- [ ] **Step 1: Write failing renderer and server tests**

Assert an enabled request contains:

```ts
expect(requestBody).toMatchObject({ outputTail: 'tests passed\nready' })
```

Assert omission when disabled, unchanged native notification body, localized output label, and `invalid-input` for oversized or forbidden-control excerpts.

- [ ] **Step 2: Verify tests fail**

```bash
bun run test -- src/web/components/terminal/terminal-notification-context.test.ts src/web/components/terminal/terminal-bell-controller.test.ts src/server/modules/telegram-notification-write-paths.test.ts
```

Expected: FAIL on missing context, gating, validation, and formatting.

- [ ] **Step 3: Extend renderer context and gates**

Add `outputTail?: string` to the bell context. Include it only when `bellEnabled && includeTerminalOutput`; gate the Telegram bell request on `bellEnabled`. Do not change unread state or native notification delivery.

- [ ] **Step 4: Add authoritative validation and formatting**

Validate at most 200 Unicode code points, normalize CR to LF, preserve LF, and reject other forbidden controls. When server config disables output, omit the renderer-provided excerpt. Append only when non-empty:

```ts
if (context.outputTail) {
  lines.push('', dict['telegram.notification.message.output-tail'], context.outputTail)
}
```

- [ ] **Step 5: Verify focused tests pass**

Run Step 2's command. Expected: PASS.

---

### Task 4: Emit completion intents from the breathing-indicator transition

**Files:**
- Modify: `src/shared/telegram-notifications.ts`
- Create: `src/web/components/terminal/terminal-output-completion-controller.ts`
- Test: `src/web/components/terminal/terminal-output-completion-controller.test.ts`
- Modify: `src/web/components/terminal/TerminalSessionRegistry.ts`
- Test: `src/web/components/terminal/TerminalSessionRegistry.test.ts`
- Modify: `src/web/settings-client.ts`
- Test: `src/web/settings-client.test.ts`

**Interfaces:**
- Produces: `TelegramOutputCompletionNotificationContext` with common context, `sessionId`, `finalOutputSeq`, and optional `outputTail`.
- Produces: `sendTelegramOutputCompletionNotification(context)` targeting `/api/telegram-notifications/output-completion`.

- [ ] **Step 1: Write failing registry transition tests**

With fake timers, sustain output until active and advance through the existing idle timeout. Assert one intent with the server session ID and last sequence. Add cases for brief output, echo, close, backing-session replacement, reset, and two distinct activity periods.

```ts
expect(onOutputCompletion).toHaveBeenCalledWith(
  expect.objectContaining({ sessionId: 'session-1', finalOutputSeq: 20 }),
)
```

- [ ] **Step 2: Verify registry tests fail**

```bash
bun run test -- src/web/components/terminal/TerminalSessionRegistry.test.ts
```

Expected: FAIL because completion intents do not exist.

- [ ] **Step 3: Refactor the existing idle transition minimally**

Track only the latest period sequence:

```ts
private readonly outputBurstLastSeq = new Map<string, number>()
```

Pass `event.seq` into `markOutputActive`. Emit after the existing idle timer successfully deletes an active key and only if the backing session is unchanged. Keep `clearOutputActive()` cleanup-only.

- [ ] **Step 4: Write failing controller and client tests**

Assert Telegram master, terminal-notification master, and `outputCompletionEnabled` gating; no focus/visibility check; optional output gating; and the dedicated endpoint.

- [ ] **Step 5: Implement the controller and client**

```ts
export interface TerminalOutputCompletionIntent {
  descriptor: TerminalDescriptor
  sessionId: string
  finalOutputSeq: number
  processName: string
  canonicalTitle?: string | null
  outputTail?: string
}
```

Reuse `terminalNotificationContext`, add the cycle identity, and submit with the same best-effort behavior as bell delivery.

- [ ] **Step 6: Verify registry, controller, and client tests pass**

```bash
bun run test -- src/web/components/terminal/TerminalSessionRegistry.test.ts src/web/components/terminal/terminal-output-completion-controller.test.ts src/web/settings-client.test.ts
```

Expected: PASS.

---

### Task 5: Add server completion delivery and cross-client idempotency

**Files:**
- Modify: `src/server/routes/telegram-notifications.ts`
- Test: `src/server/routes/telegram-notifications.test.ts`
- Modify: `src/server/modules/telegram-notification-write-paths.ts`
- Test: `src/server/modules/telegram-notification-write-paths.test.ts`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`

**Interfaces:**
- Consumes: `TelegramOutputCompletionNotificationContext`.
- Produces: `sendConfiguredTelegramOutputCompletionNotification()` and `POST /api/telegram-notifications/output-completion`.

- [ ] **Step 1: Write failing validation, formatting, preference, and concurrency tests**

Test invalid session IDs/sequences, disabled gates, localized completion titles, output preference enforcement, concurrent duplicates, sequential duplicates, and distinct final sequences:

```ts
await Promise.all([
  sendConfiguredTelegramOutputCompletionNotification(context, options),
  sendConfiguredTelegramOutputCompletionNotification(context, options),
])
expect(sendMessage).toHaveBeenCalledTimes(1)
```

- [ ] **Step 2: Verify server tests fail**

```bash
bun run test -- src/server/modules/telegram-notification-write-paths.test.ts src/server/routes/telegram-notifications.test.ts
```

Expected: FAIL because the formatter, write path, and route do not exist.

- [ ] **Step 3: Implement strict validation and localized formatting**

Require a safe non-empty session ID and a non-negative safe-integer sequence. Share structured context lines but retain distinct bell/completion titles. Do not claim exit status or success.

- [ ] **Step 4: Implement bounded claim-before-send idempotency**

```ts
const completionKey = `${safeContext.sessionId}\u0000${safeContext.finalOutputSeq}`
```

Claim synchronously before awaiting delivery. When the map exceeds 1,000 entries, remove entries older than 24 hours. Clear it in `resetTelegramNotificationWritePathsForTests()`.

- [ ] **Step 5: Add the thin Hono route**

Parse JSON, delegate with `accept-language`, and return the existing `TelegramNotificationResult`. Keep validation and policy out of the route.

- [ ] **Step 6: Verify server tests pass**

Run Step 2's command. Expected: PASS; duplicate cycles send once and distinct sequences send independently.

---

### Task 6: Expose all Telegram options in Settings

**Files:**
- Modify: `src/web/components/settings/pages/NotificationSettings.tsx`
- Test: `src/web/components/SettingsSurface.test.tsx`
- Modify: `src/web/runtime-settings-telegram-notifications.ts`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`

**Interfaces:**
- Consumes: Task 1 snapshot and update contracts.
- Produces: three independent saved switches.

- [ ] **Step 1: Write failing UI tests**

Assert these control IDs:

```text
settings-telegram-bell-enabled
settings-telegram-output-completion-enabled
settings-telegram-include-terminal-output
```

Toggle each independently, save, and assert all booleans plus unchanged credentials reach the controller. Verify sensitive-output and activity-indicator help text.

- [ ] **Step 2: Verify UI tests fail**

```bash
bun run test -- src/web/components/SettingsSurface.test.tsx src/web/runtime-settings-hooks.test.tsx src/web/settings-write-paths.test.ts
```

Expected: FAIL because controls and defaults are missing.

- [ ] **Step 3: Extend draft state and dirty tracking**

Add one local boolean per preference, synchronize all three in the existing effect, include them in `telegramChanged`, and send them through the existing save action. Keep credentials and preferences in one mutation.

- [ ] **Step 4: Render with existing Settings primitives**

Place trigger switches after the Telegram master, followed by “Include terminal output”, then credentials. Keep the privacy warning visible and preserve current configuration validation and test behavior.

- [ ] **Step 5: Add complete translations**

Add semantic equivalents in English, Chinese, Japanese, and Korean for both triggers, activity-indicator semantics, output inclusion, and sensitive-content warning.

- [ ] **Step 6: Verify UI tests pass**

Run Step 2's command. Expected: PASS.

---

### Task 7: Full verification

**Files:**
- Modify only files required to correct regressions introduced by Tasks 1–6.

**Interfaces:**
- Consumes all previous task deliverables.
- Produces a verified, architecture-compliant feature ready for review.

- [ ] **Step 1: Run focused feature tests**

```bash
bun run test -- src/server/modules/settings-source.test.ts src/server/modules/telegram-notification-write-paths.test.ts src/server/routes/telegram-notifications.test.ts src/web/components/SettingsSurface.test.tsx src/web/components/terminal/terminal-output-tail.test.ts src/web/components/terminal/ManagedTerminalSession.test.ts src/web/components/terminal/TerminalSessionRegistry.test.ts src/web/components/terminal/terminal-bell-controller.test.ts src/web/components/terminal/terminal-output-completion-controller.test.ts src/web/settings-client.test.ts src/web/settings-write-paths.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run type checking**

```bash
bun run typecheck
```

Expected: exit code 0.

- [ ] **Step 3: Run architecture checks**

```bash
bun run check:architecture
```

Expected: exit code 0 and no process-boundary violations.

- [ ] **Step 4: Run the full test suite**

```bash
bun run test
```

Expected: all Vitest suites pass.

- [ ] **Step 5: Inspect without committing**

```bash
git diff --check
git status --short
```

Expected: no whitespace errors and only intended feature/docs changes. Do not stage or commit.
