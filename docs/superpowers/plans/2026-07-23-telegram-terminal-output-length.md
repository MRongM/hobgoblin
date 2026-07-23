# Telegram Terminal Output Length Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` for inline execution. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Telegram terminal-output excerpt length configurable from 1 to 4096 characters with a 400-character default and the 4096-character whole-message limit.

**Architecture:** Persist one authoritative `outputTailLength` Telegram setting. Managed terminal sessions collapse consecutive spaces, tabs, and line breaks before retaining a fixed 4096-character sanitized tail; renderer controllers apply the current configured suffix immediately, and server write paths normalize and apply the saved setting again before fitting the suffix into the remaining whole-message budget.

**Tech Stack:** TypeScript 6 in Node.js strip-only mode, React 19, TanStack Query, Hono, Vitest, Bun.

## Global Constraints

- Accept integer values from 1 through 4096; default missing or malformed persisted data to 400.
- Keep every formatted Telegram `sendMessage` text at or below 4096 Unicode code points.
- Preserve trailing Unicode code points without splitting surrogate pairs.
- Collapse consecutive spaces, tabs, and line breaks to one space before counting or truncating output.
- Keep output opt-in, ephemeral, sanitized, and absent from logs and persisted terminal state.
- Add no dependency and no new realtime, Electron IPC, or terminal persistence path.
- Use repository aliases with explicit `.ts`/`.tsx` extensions and no strip-only-incompatible TypeScript syntax.
- Do not stage, commit, branch, or push; the user requested inline execution and did not authorize Git writes.

---

### Task 1: Extend Telegram settings contracts and persistence

**Files:**

- Modify: `src/shared/telegram-notifications.ts`
- Modify: `src/shared/settings-defaults.ts`
- Modify: `src/shared/settings-defaults.test.ts`
- Modify: `src/shared/settings-snapshot.test.ts`
- Modify: `src/server/modules/settings-source.ts`
- Modify: `src/server/modules/settings-source.test.ts`
- Modify: `src/server/modules/settings-write-paths.ts`
- Modify: `src/server/modules/settings-write-paths.test.ts`
- Modify typed Telegram settings fixtures reported by `bun run typecheck`

**Interfaces:**

- Produces `TELEGRAM_OUTPUT_TAIL_MIN_LENGTH = 1`, `TELEGRAM_OUTPUT_TAIL_DEFAULT_LENGTH = 400`, `TELEGRAM_OUTPUT_TAIL_MAX_LENGTH = 4096`, and `TELEGRAM_MESSAGE_MAX_LENGTH = 4096`.
- Produces `truncateTelegramOutputTail(value: string | undefined, maxCharacters: number): string | undefined`.
- Adds `outputTailLength: number` to both Telegram settings contracts and to the server's authoritative notification config.

- [x] **Step 1: Write failing defaults, migration, persistence, and validation tests**

Add expectations equivalent to:

```ts
expect(defaultSettingsSnapshot().telegramNotifications.outputTailLength).toBe(400)
expect(await getServerTelegramNotificationSettings()).toMatchObject({ outputTailLength: 400 })
await expect(
  updateServerTelegramNotificationSettings({ ...validInput, outputTailLength: 4097 }),
).rejects.toMatchObject({ code: 'invalid-input' })
```

Persist and reload boundary values 1 and 4096. Load legacy data without `telegramOutputTailLength` and malformed values such as `null`, `NaN`-ineligible JSON strings, and out-of-range numbers; assert 400 for malformed values and clamping for finite persisted numbers.

- [x] **Step 2: Run focused tests and observe the expected RED failures**

Run:

```bash
bun run test -- src/shared/settings-defaults.test.ts src/shared/settings-snapshot.test.ts src/server/modules/settings-source.test.ts src/server/modules/settings-write-paths.test.ts
```

Expected: failures because `outputTailLength` and the new constants do not exist.

- [x] **Step 3: Add shared limits, Unicode suffix truncation, and settings fields**

Implement the shared helper with code-point semantics:

```ts
export function truncateTelegramOutputTail(
  value: string | undefined,
  maxCharacters: number,
): string | undefined {
  if (!value || maxCharacters < 1) return undefined
  const characters = Array.from(value)
  return characters.length <= maxCharacters ? value : characters.slice(-maxCharacters).join('')
}
```

Add `outputTailLength` to the snapshot/update interfaces and every default snapshot using `TELEGRAM_OUTPUT_TAIL_DEFAULT_LENGTH`.

- [x] **Step 4: Persist and validate the authoritative setting**

Add `telegramOutputTailLength: number` to `ServerSettingsData`. Normalize persisted data with a focused function:

```ts
function normalizeTelegramOutputTailLength(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return TELEGRAM_OUTPUT_TAIL_DEFAULT_LENGTH
  return Math.max(TELEGRAM_OUTPUT_TAIL_MIN_LENGTH, Math.min(TELEGRAM_OUTPUT_TAIL_MAX_LENGTH, Math.round(value)))
}
```

Default missing data to 400, project it to snapshots/config, and reject settings-write values unless they are finite integers in the inclusive range. Route bodies must forward the numeric field rather than substituting a boolean-style fallback.

- [x] **Step 5: Run focused tests and typecheck**

Run the Step 2 command, then:

```bash
bun run typecheck
```

Expected: focused tests pass; typecheck identifies any remaining typed fixtures, which must be updated to use 400 before rerunning to exit 0.

---

### Task 2: Apply the current length in terminal collection and renderer controllers

**Files:**

- Modify: `src/web/components/terminal/terminal-output-tail.ts`
- Modify: `src/web/components/terminal/terminal-output-tail.test.ts`
- Modify: `src/web/components/terminal/terminal-bell-controller.ts`
- Modify: `src/web/components/terminal/terminal-bell-controller.test.ts`
- Modify: `src/web/components/terminal/terminal-output-completion-controller.ts`
- Modify: `src/web/components/terminal/terminal-output-completion-controller.test.ts`
- Modify: `src/web/runtime-settings-telegram-notifications.ts`

**Interfaces:**

- Consumes shared limits and `truncateTelegramOutputTail` from Task 1.
- Existing `ManagedTerminalSession.outputTail()` continues to expose one sanitized tail, now bounded to 4096 by the collector's default.
- Both Telegram controllers send at most the runtime snapshot's `outputTailLength` suffix.

- [x] **Step 1: Write failing collector and controller tests**

Verify the default collector keeps a 4096-character suffix:

```ts
const tail = createTerminalOutputTail()
tail.push(`${'a'.repeat(4096)}end`)
expect(Array.from(tail.value())).toHaveLength(4096)
expect(tail.value()).toMatch(/end$/u)
```

For bell and completion controllers, provide `outputTail: 'abcdef'` with `outputTailLength: 3` and assert the request contains `outputTail: 'def'`. Add a supplementary Unicode character case and retain the disabled-output omission assertion.

- [x] **Step 2: Run renderer tests and observe RED failures**

Run:

```bash
bun run test -- src/web/components/terminal/terminal-output-tail.test.ts src/web/components/terminal/terminal-bell-controller.test.ts src/web/components/terminal/terminal-output-completion-controller.test.ts
```

Expected: the collector still retains 200 by default and controllers submit the untrimmed value.

- [x] **Step 3: Increase only the bounded collector capacity**

Import `TELEGRAM_OUTPUT_TAIL_MAX_LENGTH` into `terminal-output-tail.ts` and use it as `createTerminalOutputTail`'s default. Do not add runtime settings to `ManagedTerminalSession`; this preserves its lifecycle boundary and makes existing sessions immediately compatible with larger settings.

- [x] **Step 4: Trim notification contexts using the live runtime value**

In each controller, retain the current include-output gate and otherwise assign:

```ts
context.outputTail = truncateTelegramOutputTail(context.outputTail, telegram.outputTailLength)
```

Add `outputTailLength: TELEGRAM_OUTPUT_TAIL_DEFAULT_LENGTH` to the runtime fallback settings.

- [x] **Step 5: Run renderer tests to GREEN**

Run the Step 2 command. Expected: all targeted tests pass with suffix-preserving Unicode truncation.

---

### Task 3: Enforce the configured and whole-message limits on the server

**Files:**

- Modify: `src/server/modules/telegram-notification-write-paths.ts`
- Modify: `src/server/modules/telegram-notification-write-paths.test.ts`

**Interfaces:**

- Consumes authoritative `outputTailLength`, `TELEGRAM_MESSAGE_MAX_LENGTH`, and `truncateTelegramOutputTail`.
- `formatTelegramBellMessage` and `formatTelegramOutputCompletionMessage` keep their signatures and guarantee a result no longer than 4096 code points.

- [x] **Step 1: Write failing authoritative-limit and message-budget tests**

Add tests that send a six-character tail with an authoritative length of three and assert the delivered message ends in `def`. Send a 4096-character tail with long but valid context fields and assert:

```ts
const text = deps.sendMessage.mock.calls[0]?.[0].text
expect(Array.from(text)).toHaveLength(4096)
expect(text).toMatch(/z+$/u)
```

Retain rejection of payload tails longer than 4096 and add a Unicode suffix case.

- [x] **Step 2: Run the server test and observe RED failures**

Run:

```bash
bun run test -- src/server/modules/telegram-notification-write-paths.test.ts
```

Expected: requests are not constrained by the saved length and formatted messages can exceed 4096.

- [x] **Step 3: Apply the authoritative configured suffix**

Extend the local `TelegramConfig` with `outputTailLength`. Before formatting either notification, remove output when inclusion is disabled; otherwise apply `truncateTelegramOutputTail(safeContext.outputTail, config.outputTailLength)`.

- [x] **Step 4: Fit the output section into the final message budget**

Build the structured prefix first. When output exists, calculate the code-point length of `prefix + "\n\n" + outputLabel + "\n"`, use the remaining `4096 - length` as the suffix budget, and omit the section when the remaining budget is below one. Keep structured context intact and preserve the final output characters.

- [x] **Step 5: Run the server test to GREEN**

Run the Step 2 command. Expected: all server notification tests pass and every captured message is at most 4096 code points.

---

### Task 4: Expose the setting in the Telegram UI and complete documentation

**Files:**

- Modify: `src/web/components/settings/pages/NotificationSettings.tsx`
- Modify: `src/web/components/SettingsSurface.test.tsx`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`
- Modify: `CONTEXT.md`
- Create: `docs/superpowers/specs/2026-07-23-telegram-terminal-output-length-design.md`

**Interfaces:**

- Consumes the settings snapshot/update field and shared min/default/max constants.
- Adds the `settings-telegram-output-tail-length` numeric control directly after the include-output switch.

- [x] **Step 1: Write the failing Settings UI test**

Assert the numeric input renders with value 400, min 1, max 4096; change it to 1024 and assert the Telegram settings request includes:

```ts
expect(JSON.parse(String(options.body))).toMatchObject({ outputTailLength: 1024 })
```

Also assert the saved response updates the input and the new i18n label/hint keys render.

- [x] **Step 2: Run the UI test and observe RED failure**

Run:

```bash
bun run test -- src/web/components/SettingsSurface.test.tsx
```

Expected: the numeric control is absent and the request body lacks `outputTailLength`.

- [x] **Step 3: Add local settings state and the existing number input primitive**

Use `SettingsNumberInput` with shared min/max constants. Synchronize local state from the query snapshot, include it in dirty detection and the save request, and refresh it from the saved snapshot. Keep it editable independently of the include-output switch.

- [x] **Step 4: Add localized copy and finalize docs**

Add equivalent keys in all dictionaries for “Terminal output characters” and a hint that states the 1–4096 range, 400 default, privacy implication, and possible whole-message shortening. Keep `CONTEXT.md` limited to the domain definition and the design document limited to this feature.

- [x] **Step 5: Run targeted and full verification sequentially**

Run:

```bash
bun run test -- src/shared/settings-defaults.test.ts src/shared/settings-snapshot.test.ts src/server/modules/settings-source.test.ts src/server/modules/settings-write-paths.test.ts src/web/components/terminal/terminal-output-tail.test.ts src/web/components/terminal/terminal-bell-controller.test.ts src/web/components/terminal/terminal-output-completion-controller.test.ts src/server/modules/telegram-notification-write-paths.test.ts src/web/components/SettingsSurface.test.tsx
bun run typecheck
bun run check:architecture
bun run test
```

Expected: every command exits 0 with no architecture violations or test failures.
