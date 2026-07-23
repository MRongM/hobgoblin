# Telegram Completion Duration and Screen Excerpt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate Telegram terminal-output-completion notifications by a configurable 1–3600 second observed activity duration and generate Telegram output excerpts from the server-owned headless terminal screen instead of raw PTY chunks.

**Architecture:** `TerminalSessionRegistry` continues to own output-activity periods and reports their measured duration without reading Telegram settings. The Renderer performs an early preference gate, the Server rechecks the authoritative duration preference, and the existing server terminal worker exposes a bounded plain-text excerpt from its canonical headless xterm buffer for both Telegram bell and completion delivery.

**Tech Stack:** TypeScript 6 in Node.js strip-only mode, React 19, Hono, TanStack Query, xterm.js/headless, Vitest, Bun 1.3 / Node.js 24.

## Global Constraints

- Preserve the terminal output activity indicator thresholds: 500 ms input-echo suppression, 1 second sustained-output activation, and 1.2 seconds idle transition.
- The new duration affects only Telegram terminal-output-completion eligibility; it does not affect the activity indicator, unread bell state, Telegram bell delivery, or native system notifications.
- Persist an integer `outputCompletionMinimumActivitySeconds` from 1 through 3600; default missing, corrupt, and new values to 10.
- Provide 1, 10, and 30 second shortcuts plus manual integer input.
- Derive Telegram excerpts from the server-owned active headless xterm buffer and retained normal-buffer scrollback, never from Renderer raw PTY chunks.
- Keep excerpt inclusion opt-in, bounded by the existing 1–4096 character setting, ephemeral, and absent from logs and persistence.
- Add no package; reuse `@xterm/headless` and the existing terminal worker protocol.
- Use repo-alias imports with explicit `.ts`/`.tsx` extensions and do not add re-export shims.
- Do not use enums, runtime namespaces, parameter properties, or TypeScript import aliases.
- Keep examples and tests privacy-safe with generic paths, IDs, tokens, and output.
- Do not stage, commit, branch, or push. Replace the skill's normal commit steps with review checkpoints because the project forbids Git writes without separate authorization.
- Before deleting `src/web/components/terminal/terminal-output-tail.ts` and its test, obtain the project-required explicit destructive-operation confirmation.

---

## File Responsibility Map

### Shared contracts and text normalization

- `src/shared/telegram-notifications.ts`: Telegram setting constants, setting snapshots/update inputs, renderer-to-server notification contexts.
- `src/shared/terminal-output-excerpt.ts`: canonical whitespace collapse, horizontal-rule compaction, and Unicode-safe excerpt truncation shared by the terminal worker and Telegram formatter.
- `src/shared/telegram-notifications.test.ts`: normalization/truncation contract tests using the new canonical module.

### Settings persistence and UI

- `src/shared/settings-defaults.ts`: default Telegram snapshot value.
- `src/server/modules/settings-source.ts`: persisted field, legacy normalization, update validation, and masked snapshot projection.
- `src/web/runtime-settings-telegram-notifications.ts`: Renderer fallback snapshot.
- `src/web/settings-queries.ts`: bootstrap fallback snapshot.
- `src/web/components/settings/pages/NotificationSettings.tsx`: Telegram duration draft, shortcuts, manual input, dirty tracking, and save payload.
- `src/shared/i18n/{en,zh,ja,ko}.ts`: label, hint, shortcut labels, and seconds unit.

### Activity duration and Renderer gating

- `src/web/components/terminal/types.ts`: `activityDurationMs` on the completion intent and server session identity on bell events.
- `src/web/components/terminal/TerminalSessionRegistry.ts`: compute activity duration from existing burst timestamps.
- `src/web/components/terminal/terminal-output-completion-controller.ts`: skip sub-threshold requests and send duration to the Server.

### Server-owned screen excerpt

- `src/shared/terminal.ts`: worker-crossing excerpt input/result types.
- `src/server/terminal/terminal-render-state.ts`: wait for parsed writes, traverse the active xterm buffer, and return a bounded normalized text tail.
- `src/server/terminal/terminal-session-manager.ts`: resolve a session and delegate excerpt extraction.
- `src/server/terminal/terminal.ts`: validate excerpt input and expose the terminal operation.
- `src/server/terminal/terminal-worker-protocol.ts`: add the `output-excerpt` worker request/response action.
- `src/server/terminal/terminal-facade.ts`: expose the action to direct worker runtime use.
- `src/server/terminal/terminal-worker-runtime.ts`: dispatch the action.
- `src/server/terminal/terminal-host.ts`: add the main-process host method.
- `src/server/terminal/terminal-worker-host.ts`: proxy the method across IPC.

### Telegram delivery integration

- `src/server/routes/telegram-notifications.ts`: inject terminal excerpt reading into notification write paths.
- `src/server/app-factory.ts`: pass the worker-backed terminal host to Telegram routes.
- `src/server/modules/telegram-notification-write-paths.ts`: validate duration, perform authoritative gating, read the canonical excerpt, and format delivery.
- `src/web/components/terminal/ManagedTerminalSession.ts`: attach server session identity to bell events and stop collecting raw Telegram output.
- `src/web/components/terminal/terminal-notification-context.ts`: include optional server session identity, not raw output.
- `src/web/components/terminal/terminal-bell-controller.ts`: stop truncating/sending Renderer output text.
- `src/web/components/terminal/terminal-output-tail.ts`: delete after explicit confirmation because the canonical server excerpt makes it unused.
- `src/web/components/terminal/terminal-output-tail.test.ts`: delete with the obsolete collector after explicit confirmation.

---

### Task 1: Persist and Validate the Telegram Completion Duration

**Files:**

- Modify: `src/shared/telegram-notifications.ts`
- Modify: `src/shared/settings-defaults.ts`
- Modify: `src/server/modules/settings-source.ts`
- Modify: `src/web/runtime-settings-telegram-notifications.ts`
- Modify: `src/web/settings-queries.ts`
- Test: `src/shared/settings-defaults.test.ts`
- Test: `src/shared/settings-snapshot.test.ts`
- Test: `src/server/modules/settings-source.test.ts`
- Test: `src/server/modules/settings-write-paths.test.ts`
- Test: `src/server/modules/settings.test.ts`
- Test: `src/server/routes/settings.test.ts`
- Test: `src/web/settings-write-paths.test.ts`
- Modify typed Telegram fixtures in: `src/web/components/SettingsSurface.test.tsx`
- Modify typed Telegram fixtures in: `src/web/components/terminal/terminal-bell-controller.test.ts`
- Modify typed Telegram fixtures in: `src/web/components/terminal/terminal-output-completion-controller.test.ts`
- Modify typed Telegram fixtures in: `src/server/modules/telegram-notification-write-paths.test.ts`

**Interfaces:**

- Produces constants:

```ts
export const TELEGRAM_OUTPUT_COMPLETION_MIN_ACTIVITY_SECONDS = 1
export const TELEGRAM_OUTPUT_COMPLETION_DEFAULT_ACTIVITY_SECONDS = 10
export const TELEGRAM_OUTPUT_COMPLETION_MAX_ACTIVITY_SECONDS = 3_600
```

- Produces `TelegramNotificationSettingsSnapshot.outputCompletionMinimumActivitySeconds: number`.
- Produces `TelegramNotificationSettingsUpdateInput.outputCompletionMinimumActivitySeconds: number`.
- Produces persisted `ServerSettingsData.telegramOutputCompletionMinimumActivitySeconds: number`.
- Consumed by Tasks 2, 3, and 5.

- [ ] **Step 1: Add failing shared default and snapshot assertions**

Extend the canonical Telegram snapshot expectations in `src/shared/settings-defaults.test.ts` and `src/shared/settings-snapshot.test.ts`:

```ts
expect(snapshot.telegramNotifications).toMatchObject({
  outputCompletionEnabled: false,
  outputCompletionMinimumActivitySeconds: 10,
  outputTailLength: 400,
})
```

Add the field to every explicit `TelegramNotificationSettingsSnapshot` fixture listed above with `10` unless that test intentionally exercises another value.

- [ ] **Step 2: Add failing persistence, migration, and validation tests**

In `src/server/modules/settings-source.test.ts`, add this focused update-input helper beside `writeSettingsFile`:

```ts
function telegramSettingsUpdate(
  overrides: Partial<{
    enabled: boolean
    botToken: string
    chatId: string
    bellEnabled: boolean
    outputCompletionEnabled: boolean
    outputCompletionMinimumActivitySeconds: number
    includeTerminalOutput: boolean
    outputTailLength: number
  }> = {},
) {
  return {
    enabled: false,
    botToken: '',
    chatId: '',
    bellEnabled: true,
    outputCompletionEnabled: false,
    outputCompletionMinimumActivitySeconds: 10,
    includeTerminalOutput: false,
    outputTailLength: 400,
    ...overrides,
  }
}
```

Then add these cases using the file's existing `useTempServerSettingsDir`, `writeSettingsFile`, module reset, and dynamic-import pattern:

```ts
test('defaults missing Telegram completion activity duration to ten seconds', async () => {
  useTempServerSettingsDir()
  writeSettingsFile({ telegramOutputCompletionNotificationsEnabled: true })
  const mod = await import('#/server/modules/settings-source.ts')

  await expect(mod.getServerTelegramNotificationSettings()).resolves.toMatchObject({
    outputCompletionMinimumActivitySeconds: 10,
  })
})

test.each([0, -1, 1.5, 3_601, '30'])(
  'normalizes corrupt persisted completion activity duration %p to ten seconds',
  async (value) => {
    useTempServerSettingsDir()
    writeSettingsFile({ telegramOutputCompletionMinimumActivitySeconds: value })
    const mod = await import('#/server/modules/settings-source.ts')

    await expect(mod.getServerTelegramNotificationSettings()).resolves.toMatchObject({
      outputCompletionMinimumActivitySeconds: 10,
    })
  },
)

test.each([1, 10, 30, 3_600])('persists valid completion activity duration %i', async (seconds) => {
  useTempServerSettingsDir()
  const mod = await import('#/server/modules/settings-source.ts')

  await mod.updateServerTelegramNotificationSettings(
    telegramSettingsUpdate({
      outputCompletionMinimumActivitySeconds: seconds,
    }),
  )

  await expect(mod.getServerTelegramNotificationSettings()).resolves.toMatchObject({
    outputCompletionMinimumActivitySeconds: seconds,
  })
})

test.each([0, -1, 1.5, 3_601, Number.NaN])(
  'rejects invalid completion activity duration update %p',
  async (seconds) => {
    useTempServerSettingsDir()
    const mod = await import('#/server/modules/settings-source.ts')

    await expect(
      mod.updateServerTelegramNotificationSettings(
        telegramSettingsUpdate({
          outputCompletionMinimumActivitySeconds: seconds,
        }),
      ),
    ).rejects.toMatchObject({ code: 'invalid-input' })
  },
)
```

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```sh
bun run test -- src/shared/settings-defaults.test.ts src/shared/settings-snapshot.test.ts src/server/modules/settings-source.test.ts src/server/modules/settings-write-paths.test.ts src/server/modules/settings.test.ts src/server/routes/settings.test.ts src/web/settings-write-paths.test.ts
```

Expected: FAIL because the shared settings types and default/persistence projection do not contain `outputCompletionMinimumActivitySeconds`.

- [ ] **Step 4: Add the shared constants and contracts**

In `src/shared/telegram-notifications.ts` add:

```ts
export const TELEGRAM_OUTPUT_COMPLETION_MIN_ACTIVITY_SECONDS = 1
export const TELEGRAM_OUTPUT_COMPLETION_DEFAULT_ACTIVITY_SECONDS = 10
export const TELEGRAM_OUTPUT_COMPLETION_MAX_ACTIVITY_SECONDS = 3_600
```

Extend both interfaces:

```ts
export interface TelegramNotificationSettingsSnapshot {
  enabled: boolean
  botTokenConfigured: boolean
  chatId: string
  bellEnabled: boolean
  outputCompletionEnabled: boolean
  outputCompletionMinimumActivitySeconds: number
  includeTerminalOutput: boolean
  outputTailLength: number
}

export interface TelegramNotificationSettingsUpdateInput {
  enabled: boolean
  botToken?: string
  chatId: string
  bellEnabled: boolean
  outputCompletionEnabled: boolean
  outputCompletionMinimumActivitySeconds: number
  includeTerminalOutput: boolean
  outputTailLength: number
}
```

- [ ] **Step 5: Implement default projection and persisted normalization**

Add `outputCompletionMinimumActivitySeconds: TELEGRAM_OUTPUT_COMPLETION_DEFAULT_ACTIVITY_SECONDS` to `defaultSettingsSnapshot()` and both Renderer fallback snapshots.

In `ServerSettingsData` add:

```ts
telegramOutputCompletionMinimumActivitySeconds: number
```

Use one focused normalizer in `src/server/modules/settings-source.ts`:

```ts
function normalizeTelegramOutputCompletionMinimumActivitySeconds(value: unknown): number {
  return Number.isInteger(value) &&
    Number(value) >= TELEGRAM_OUTPUT_COMPLETION_MIN_ACTIVITY_SECONDS &&
    Number(value) <= TELEGRAM_OUTPUT_COMPLETION_MAX_ACTIVITY_SECONDS
    ? Number(value)
    : TELEGRAM_OUTPUT_COMPLETION_DEFAULT_ACTIVITY_SECONDS
}
```

Apply it when parsing persisted data, initializing new data, and projecting `telegramNotificationSettingsFromData`. Missing legacy values therefore become `10`.

- [ ] **Step 6: Validate and persist updates without clamping**

Before mutating settings data in `updateServerTelegramNotificationSettings`, add:

```ts
if (
  !Number.isInteger(input.outputCompletionMinimumActivitySeconds) ||
  input.outputCompletionMinimumActivitySeconds < TELEGRAM_OUTPUT_COMPLETION_MIN_ACTIVITY_SECONDS ||
  input.outputCompletionMinimumActivitySeconds > TELEGRAM_OUTPUT_COMPLETION_MAX_ACTIVITY_SECONDS
) {
  throw new TelegramNotificationSettingsError('invalid-input')
}
```

Persist the validated value exactly:

```ts
data.telegramOutputCompletionMinimumActivitySeconds = input.outputCompletionMinimumActivitySeconds
```

- [ ] **Step 7: Update all typed fixtures and write-path payload expectations**

Add this property to every Telegram settings fixture and full update request listed in the Files block:

```ts
outputCompletionMinimumActivitySeconds: 10,
```

In tests that verify round-tripping, use a non-default value such as `30` and assert the same value appears in the saved masked snapshot.

- [ ] **Step 8: Run the focused tests and verify GREEN**

Run the Step 3 command.

Expected: all focused settings tests PASS; serialized snapshots still omit the Bot Token.

- [ ] **Step 9: Review checkpoint (no Git commit)**

Review only the Task 1 diff. Confirm the setting is server-owned, missing/corrupt values become `10`, invalid writes reject rather than clamp, and no terminal activity code changed.

---

### Task 2: Add Telegram Duration Shortcuts and Manual Input

**Files:**

- Modify: `src/web/components/settings/pages/NotificationSettings.tsx`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`
- Test: `src/web/components/SettingsSurface.test.tsx`

**Interfaces:**

- Consumes `TelegramNotificationSettingsSnapshot.outputCompletionMinimumActivitySeconds` from Task 1.
- Consumes Task 1 constants for the manual input bounds.
- Produces a full `TelegramNotificationSettingsUpdateInput` through the existing Telegram Save action.

- [ ] **Step 1: Add failing settings-surface tests for default, shortcuts, and manual input**

Extend the SettingsSurface Telegram mock response with:

```ts
outputCompletionMinimumActivitySeconds: 10,
```

Add a test that locates these controls:

```ts
const durationInput = document.getElementById('settings-telegram-output-completion-min-activity')
const lowPreset = document.getElementById('settings-telegram-output-completion-min-activity-low')
const mediumPreset = document.getElementById('settings-telegram-output-completion-min-activity-medium')
const highPreset = document.getElementById('settings-telegram-output-completion-min-activity-high')

expect(durationInput).toBeInstanceOf(HTMLInputElement)
expect((durationInput as HTMLInputElement).value).toBe('10')
expect((durationInput as HTMLInputElement).min).toBe('1')
expect((durationInput as HTMLInputElement).max).toBe('3600')
expect(lowPreset).not.toBeNull()
expect(mediumPreset).not.toBeNull()
expect(highPreset).not.toBeNull()
```

Click the 30-second preset, save, and assert the request contains:

```ts
expect(savedTelegramInput).toMatchObject({
  outputCompletionMinimumActivitySeconds: 30,
})
```

Then set the number input to `125`, save again, and assert the request contains `125`.

Use the test file's existing `act`, `setInputValue`, and fetch-body inspection helpers:

```ts
await act(async () => {
  highPreset?.click()
  await Promise.resolve()
})
expect((durationInput as HTMLInputElement).value).toBe('30')

await act(async () => {
  setInputValue(durationInput as HTMLInputElement, '125')
  await Promise.resolve()
  buttonByText('settings.telegram.save').click()
  await Promise.resolve()
  await Promise.resolve()
})

const durationWrite = fetchMock.mock.calls.findLast((call) => {
  const [url] = call as unknown as [unknown, RequestInit | undefined]
  return new URL(String(url)).pathname === '/api/settings/telegram'
})
const [, durationWriteOptions] = durationWrite as unknown as [unknown, RequestInit]
expect(JSON.parse(String(durationWriteOptions.body))).toMatchObject({
  outputCompletionMinimumActivitySeconds: 125,
})
```

- [ ] **Step 2: Run the UI test and verify RED**

Run:

```sh
bun run test -- src/web/components/SettingsSurface.test.tsx
```

Expected: FAIL because the duration controls do not exist.

- [ ] **Step 3: Add local draft state, synchronization, and dirty tracking**

In `NotificationSettings`, initialize:

```ts
const [telegramOutputCompletionMinimumActivitySeconds, setTelegramOutputCompletionMinimumActivitySeconds] = useState(
  telegramSettings.outputCompletionMinimumActivitySeconds,
)
```

Synchronize it in the existing settings effect and dependency list. Extend `telegramChanged` with:

```ts
telegramOutputCompletionMinimumActivitySeconds !==
  telegramSettings.outputCompletionMinimumActivitySeconds ||
```

Include it in the save payload and apply the saved value after success.

- [ ] **Step 4: Render the shortcut buttons and bounded integer input**

Import the three Task 1 constants, `SettingsNumberInput`, and the existing `Button`. Add a `SettingsRow` immediately below the completion switch:

```tsx
<SettingsRow
  controlId="settings-telegram-output-completion-min-activity"
  label={t('settings.telegram.output-completion-min-activity')}
  hint={t('settings.telegram.output-completion-min-activity-hint')}
  control={
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {(
        [
          ['low', 1],
          ['medium', 10],
          ['high', 30],
        ] as const
      ).map(([level, seconds]) => (
        <Button
          key={level}
          id={`settings-telegram-output-completion-min-activity-${level}`}
          type="button"
          variant={telegramOutputCompletionMinimumActivitySeconds === seconds ? 'default' : 'outline'}
          size="sm"
          onClick={() => setTelegramOutputCompletionMinimumActivitySeconds(seconds)}
        >
          {t(`settings.telegram.output-completion-min-activity-${level}`)}
        </Button>
      ))}
      <SettingsNumberInput
        id="settings-telegram-output-completion-min-activity"
        min={TELEGRAM_OUTPUT_COMPLETION_MIN_ACTIVITY_SECONDS}
        max={TELEGRAM_OUTPUT_COMPLETION_MAX_ACTIVITY_SECONDS}
        value={telegramOutputCompletionMinimumActivitySeconds}
        onChange={setTelegramOutputCompletionMinimumActivitySeconds}
      />
      <span className="text-xs text-muted-foreground">
        {t('settings.telegram.output-completion-min-activity-unit')}
      </span>
    </div>
  }
/>
```

Do not disable or clear the value when completion notifications are off.

- [ ] **Step 5: Add localized copy in all four dictionaries**

Use these English and Chinese strings exactly:

```ts
// en.ts
'settings.telegram.output-completion-min-activity': 'Minimum completion activity',
'settings.telegram.output-completion-min-activity-hint':
  'Send a Telegram completion notification only when terminal output was active for at least this long. This does not change the terminal activity indicator.',
'settings.telegram.output-completion-min-activity-low': 'Low · 1s',
'settings.telegram.output-completion-min-activity-medium': 'Medium · 10s',
'settings.telegram.output-completion-min-activity-high': 'High · 30s',
'settings.telegram.output-completion-min-activity-unit': 'seconds',

// zh.ts
'settings.telegram.output-completion-min-activity': '完成通知最短活动时长',
'settings.telegram.output-completion-min-activity-hint':
  '仅当终端输出活动达到此时长时发送 Telegram 完成通知；不会改变终端活动呼吸灯。',
'settings.telegram.output-completion-min-activity-low': '低 · 1 秒',
'settings.telegram.output-completion-min-activity-medium': '中 · 10 秒',
'settings.telegram.output-completion-min-activity-high': '高 · 30 秒',
'settings.telegram.output-completion-min-activity-unit': '秒',
```

Use these Japanese and Korean strings:

```ts
// ja.ts
'settings.telegram.output-completion-min-activity': '完了通知の最小アクティビティ時間',
'settings.telegram.output-completion-min-activity-hint':
  'ターミナル出力のアクティビティがこの時間以上続いた場合のみ、Telegram の完了通知を送信します。ターミナルのアクティビティインジケーターには影響しません。',
'settings.telegram.output-completion-min-activity-low': '低 · 1秒',
'settings.telegram.output-completion-min-activity-medium': '中 · 10秒',
'settings.telegram.output-completion-min-activity-high': '高 · 30秒',
'settings.telegram.output-completion-min-activity-unit': '秒',

// ko.ts
'settings.telegram.output-completion-min-activity': '완료 알림 최소 활동 시간',
'settings.telegram.output-completion-min-activity-hint':
  '터미널 출력 활동이 이 시간 이상 지속된 경우에만 Telegram 완료 알림을 보냅니다. 터미널 활동 표시기에는 영향을 주지 않습니다.',
'settings.telegram.output-completion-min-activity-low': '낮음 · 1초',
'settings.telegram.output-completion-min-activity-medium': '중간 · 10초',
'settings.telegram.output-completion-min-activity-high': '높음 · 30초',
'settings.telegram.output-completion-min-activity-unit': '초',
```

- [ ] **Step 6: Run UI tests and verify GREEN**

Run:

```sh
bun run test -- src/web/components/SettingsSurface.test.tsx src/web/settings-write-paths.test.ts
```

Expected: PASS for default 10 seconds, all three shortcuts, custom 125 seconds, dirty/save behavior, and the existing Telegram settings.

- [ ] **Step 7: Review checkpoint (no Git commit)**

Confirm the setting lives only under Notifications → Telegram, the indicator copy explicitly says it is unaffected, and the Save button remains the single mutation boundary.

---

### Task 3: Measure Activity Duration and Gate Renderer Requests

**Files:**

- Modify: `src/shared/telegram-notifications.ts`
- Modify: `src/web/components/terminal/types.ts`
- Modify: `src/web/components/terminal/TerminalSessionRegistry.ts`
- Modify: `src/web/components/terminal/terminal-output-completion-controller.ts`
- Test: `src/web/components/terminal/TerminalSessionRegistry.test.ts`
- Test: `src/web/components/terminal/terminal-output-completion-controller.test.ts`
- Test: `src/web/components/terminal/TerminalSessionProvider.test.tsx`

**Interfaces:**

- Produces `TerminalOutputCompletionIntent.activityDurationMs: number`.
- Produces `TelegramOutputCompletionNotificationContext.activityDurationMs: number`.
- Consumes `outputCompletionMinimumActivitySeconds` from Task 1.
- The Registry remains independent of Telegram settings.

- [ ] **Step 1: Add failing registry duration tests**

Extend the existing sustained-output test with precise fake-timer timestamps:

```ts
for (let elapsed = 0; elapsed <= 10_000; elapsed += 1_000) {
  registry.handleOutput({
    sessionId: 'session-a',
    data: 'tick',
    seq: elapsed,
    processName: 'bash',
  })
  if (elapsed < 10_000) vi.advanceTimersByTime(1_000)
}

vi.advanceTimersByTime(1_200)

expect(outputCompletions).toEqual([
  expect.objectContaining({
    sessionId: 'session-a',
    finalOutputSeq: 10_000,
    activityDurationMs: 10_000,
  }),
])
```

Add a separate assertion that advancing the trailing idle timer from 1,199 to 1,200 milliseconds does not add 1,200 to `activityDurationMs`.

Also prove consecutive activity periods are measured independently:

```ts
function emitBurst(sequenceBase: number, durationMs: number): void {
  for (let elapsed = 0; elapsed <= durationMs; elapsed += 1_000) {
    registry.handleOutput({
      sessionId: 'session-a',
      data: 'tick',
      seq: sequenceBase + elapsed,
      processName: 'bash',
    })
    if (elapsed < durationMs) vi.advanceTimersByTime(1_000)
  }
  vi.advanceTimersByTime(1_200)
}

emitBurst(0, 10_000)
emitBurst(100_000, 30_000)

expect(outputCompletions.map((intent) => intent.activityDurationMs)).toEqual([10_000, 30_000])
```

- [ ] **Step 2: Add failing Renderer gate tests**

In `terminal-output-completion-controller.test.ts`, add `activityDurationMs: 9_999` to one intent and configure `outputCompletionMinimumActivitySeconds: 10`; assert no send. Then use `10_000` and assert one send with the same duration:

```ts
expect(mocks.send).not.toHaveBeenCalled()

notifyTerminalOutputCompletion({ ...intent, activityDurationMs: 10_000 })

expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ activityDurationMs: 10_000 }))
```

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```sh
bun run test -- src/web/components/terminal/TerminalSessionRegistry.test.ts src/web/components/terminal/terminal-output-completion-controller.test.ts src/web/components/terminal/TerminalSessionProvider.test.tsx
```

Expected: FAIL because completion intents and contexts do not carry duration and the controller does not gate.

- [ ] **Step 4: Extend the completion intent and transport context**

Add the field to both types:

```ts
export interface TerminalOutputCompletionIntent {
  descriptor: TerminalDescriptor
  sessionId: string
  finalOutputSeq: number
  activityDurationMs: number
  processName: string
  canonicalTitle?: string | null
  outputTail?: string
}

export interface TelegramOutputCompletionNotificationContext extends TelegramBellNotificationContext {
  sessionId: string
  finalOutputSeq: number
  activityDurationMs: number
}
```

The `outputTail` property remains temporarily until Task 5 removes the Renderer raw-tail path.

- [ ] **Step 5: Compute duration from existing burst timestamps**

In the existing idle callback, read timestamps before emitting:

```ts
const burstStartAt = this.outputBurstStartAt.get(key)
const lastOutputAt = this.outputBurstLastAt.get(key)
const activityDurationMs =
  burstStartAt !== undefined && lastOutputAt !== undefined ? Math.max(0, lastOutputAt - burstStartAt) : 0
```

Include `activityDurationMs` in `onOutputCompletion`. Do not create a new timer, map, or setting dependency.

- [ ] **Step 6: Add the Renderer early gate**

After reading Telegram settings and before building context:

```ts
if (intent.activityDurationMs < telegram.outputCompletionMinimumActivitySeconds * 1_000) return
```

Include the duration in the request context:

```ts
activityDurationMs: intent.activityDurationMs,
```

- [ ] **Step 7: Update Provider fakes and typed fixtures**

Every fake Registry completion callback or explicit completion intent in `TerminalSessionProvider.test.tsx` must provide a finite non-negative `activityDurationMs`. Use `10_000` for ordinary eligible fixtures.

- [ ] **Step 8: Run focused tests and verify GREEN**

Run the Step 3 command.

Expected: PASS; existing 1-second activation and 1.2-second idle indicator assertions remain unchanged.

- [ ] **Step 9: Review checkpoint (no Git commit)**

Confirm Registry imports no settings or Telegram module and that duration excludes the 1.2-second idle wait.

---

### Task 4: Expose a Bounded Headless Screen Excerpt Through the Terminal Worker

**Files:**

- Create: `src/shared/terminal-output-excerpt.ts`
- Modify: `src/shared/telegram-notifications.ts`
- Test: `src/shared/telegram-notifications.test.ts`
- Modify: `src/web/components/terminal/terminal-bell-controller.ts`
- Modify: `src/web/components/terminal/terminal-output-completion-controller.ts`
- Modify: `src/shared/terminal.ts`
- Modify: `src/server/terminal/terminal-render-state.ts`
- Modify: `src/server/terminal/terminal-session-manager.ts`
- Modify: `src/server/terminal/terminal.ts`
- Modify: `src/server/terminal/terminal-worker-protocol.ts`
- Modify: `src/server/terminal/terminal-facade.ts`
- Modify: `src/server/terminal/terminal-worker-runtime.ts`
- Modify: `src/server/terminal/terminal-host.ts`
- Modify: `src/server/terminal/terminal-worker-host.ts`
- Test: `src/server/terminal/terminal-render-state.test.ts`
- Test: `src/server/terminal/terminal-session-manager.test.ts`
- Test: `src/server/terminal/terminal-worker-runtime.test.ts`
- Test: `src/server/terminal/terminal-worker-host.test.ts`
- Test: `src/server/terminal/terminal.test.ts`

**Interfaces:**

- Produces shared normalization:

```ts
normalizeTerminalOutputExcerpt(value: string | undefined): string | undefined
truncateTerminalOutputExcerpt(value: string | undefined, maxCharacters: number): string | undefined
```

- Produces worker types:

```ts
export interface TerminalOutputExcerptInput {
  sessionId: string
  maxCharacters: number
}

export interface TerminalOutputExcerpt {
  sessionId: string
  output: string
  sequence: number
}
```

- Produces `ServerTerminalHost.getOutputExcerpt(input): MaybePromise<TerminalOutputExcerpt | null>`.
- Consumed by Task 5.

- [ ] **Step 1: Move canonical normalization behind a generic terminal-excerpt module with failing import tests**

Change `src/shared/telegram-notifications.test.ts` to import:

```ts
import { normalizeTerminalOutputExcerpt, truncateTerminalOutputExcerpt } from '#/shared/terminal-output-excerpt.ts'
```

Rename the assertions to the new function names while retaining all existing whitespace, long-horizontal-rule, Unicode, and suffix tests.

- [ ] **Step 2: Add failing headless tmux redraw and buffer tests**

In `terminal-render-state.test.ts`, import the planned `readTerminalRenderOutputExcerpt` and add:

```ts
test('returns final headless screen text without tmux redraw frames or SCS residue', async () => {
  const state = createEmptyTerminalRenderState()
  state.model = createTerminalRenderModel(60, 6)
  try {
    queueTerminalRenderWrite(state, 'build complete\r\n')
    queueTerminalRenderWrite(state, '\x1b[6;1H\x1b[2K\x1b(B[hobgoblin0:node* "⠴ workspace"]')
    queueTerminalRenderWrite(state, '\x1b[6;1H\x1b[2K\x1b(B[hobgoblin0:node* "done workspace"]')

    const excerpt = await readTerminalRenderOutputExcerpt('term_1234567890123456', state, 400)

    expect(excerpt).toMatchObject({ sessionId: 'term_1234567890123456' })
    expect(excerpt?.output).toContain('build complete')
    expect(excerpt?.output).toContain('[hobgoblin0:node* "done workspace"]')
    expect(excerpt?.output).not.toContain('⠴')
    expect(excerpt?.output).not.toContain('B[')
  } finally {
    state.model.term.dispose()
  }
})
```

Add tests for wrapped lines, active alternate buffer, an empty screen, Unicode-safe limits, and a 1-character boundary.

Use these concrete assertions:

```ts
test('joins wrapped screen lines before truncating', async () => {
  const state = createEmptyTerminalRenderState()
  state.model = createTerminalRenderModel(5, 3)
  try {
    queueTerminalRenderWrite(state, 'abcdefghij')
    await expect(readTerminalRenderOutputExcerpt('term_1234567890123456', state, 20)).resolves.toMatchObject({
      output: 'abcdefghij',
    })
  } finally {
    state.model.term.dispose()
  }
})

test('reads the active alternate screen and applies Unicode-safe bounds', async () => {
  const state = createEmptyTerminalRenderState()
  state.model = createTerminalRenderModel(20, 3)
  try {
    queueTerminalRenderWrite(state, 'normal screen\x1b[?1049halt ab🙂de')
    await expect(readTerminalRenderOutputExcerpt('term_1234567890123456', state, 3)).resolves.toMatchObject({
      output: '🙂de',
    })
    await expect(readTerminalRenderOutputExcerpt('term_1234567890123456', state, 1)).resolves.toMatchObject({
      output: 'e',
    })
  } finally {
    state.model.term.dispose()
  }
})

test('returns an empty excerpt for an empty screen', async () => {
  const state = createEmptyTerminalRenderState()
  state.model = createTerminalRenderModel(20, 3)
  try {
    await expect(readTerminalRenderOutputExcerpt('term_1234567890123456', state, 400)).resolves.toMatchObject({
      output: '',
    })
  } finally {
    state.model.term.dispose()
  }
})

test('includes retained normal-buffer scrollback', async () => {
  const state = createEmptyTerminalRenderState()
  state.model = createTerminalRenderModel(20, 2)
  try {
    queueTerminalRenderWrite(state, 'one\r\ntwo\r\nthree')
    await expect(readTerminalRenderOutputExcerpt('term_1234567890123456', state, 400)).resolves.toMatchObject({
      output: 'one two three',
    })
  } finally {
    state.model.term.dispose()
  }
})
```

- [ ] **Step 3: Add failing protocol/host round-trip tests**

Extend worker runtime and worker host tests with an `output-excerpt` request:

```ts
const input = { sessionId: 'term_1234567890123456', maxCharacters: 400 }
const expected = {
  sessionId: input.sessionId,
  output: 'tests passed',
  sequence: 42,
}

await expect(host.getOutputExcerpt(input)).resolves.toEqual(expected)
expect(worker.send).toHaveBeenCalledWith(
  expect.objectContaining({
    type: 'request',
    action: 'output-excerpt',
    clientId: 'server',
    input,
  }),
)
```

Add this method to `createTerminalFacadeStub()` so the new interface remains complete:

```ts
getOutputExcerpt: vi.fn(async () => null),
```

Dispatch the runtime request and assert the exact call/result:

```ts
await runtime.handleMessage({
  type: 'request',
  requestId: 'req_excerpt',
  action: 'output-excerpt',
  clientId: 'server',
  input,
})
expect(service.getOutputExcerpt).toHaveBeenCalledWith(input)
expect(emitted.at(-1)).toEqual({
  type: 'response',
  requestId: 'req_excerpt',
  ok: true,
  payload: null,
})
```

- [ ] **Step 4: Run focused tests and verify RED**

Run:

```sh
bun run test -- src/shared/telegram-notifications.test.ts src/server/terminal/terminal-render-state.test.ts src/server/terminal/terminal-session-manager.test.ts src/server/terminal/terminal-worker-runtime.test.ts src/server/terminal/terminal-worker-host.test.ts src/server/terminal/terminal.test.ts
```

Expected: FAIL on missing canonical module, excerpt reader, worker action, and host method.

- [ ] **Step 5: Create canonical normalization and update direct imports**

Create `src/shared/terminal-output-excerpt.ts`:

```ts
export function normalizeTerminalOutputExcerpt(value: string | undefined): string | undefined {
  if (!value) return undefined
  const normalized = value
    .replace(/[ \t\r\n]+/gu, ' ')
    .replace(/─{4,}/gu, '───')
    .trim()
  return normalized || undefined
}

export function truncateTerminalOutputExcerpt(value: string | undefined, maxCharacters: number): string | undefined {
  if (maxCharacters < 1) return undefined
  const normalized = normalizeTerminalOutputExcerpt(value)
  if (!normalized) return undefined
  const characters = Array.from(normalized)
  if (characters.length <= maxCharacters) return normalized
  const suffix = characters.slice(-maxCharacters)
  if (suffix[0] === ' ') suffix.shift()
  return suffix.join('') || undefined
}
```

Remove the old normalization functions from `src/shared/telegram-notifications.ts`. Update `src/server/modules/telegram-notification-write-paths.ts`, `src/web/components/terminal/terminal-bell-controller.ts`, and `src/web/components/terminal/terminal-output-completion-controller.ts` to import the canonical functions directly from `#/shared/terminal-output-excerpt.ts`. Do not leave re-export shims.

- [ ] **Step 6: Add excerpt input/result types**

In `src/shared/terminal.ts` add:

```ts
export interface TerminalOutputExcerptInput {
  sessionId: string
  maxCharacters: number
}

export interface TerminalOutputExcerpt {
  sessionId: string
  output: string
  sequence: number
}
```

- [ ] **Step 7: Implement exact bounded traversal of logical xterm lines**

Import the shared excerpt type and helpers:

```ts
import type { TerminalOutputExcerpt } from '#/shared/terminal.ts'
import { normalizeTerminalOutputExcerpt, truncateTerminalOutputExcerpt } from '#/shared/terminal-output-excerpt.ts'
```

Extend `HeadlessTerminalLike` with the exact public buffer subset used from `@xterm/headless`:

```ts
interface HeadlessBufferLineLike {
  readonly isWrapped: boolean
  translateToString(trimRight?: boolean, startColumn?: number, endColumn?: number): string
}

interface HeadlessBufferLike {
  readonly length: number
  getLine(y: number): HeadlessBufferLineLike | undefined
}

export interface HeadlessTerminalLike {
  readonly buffer: { readonly active: HeadlessBufferLike }
  write(data: string | Uint8Array, callback?: () => void): void
  resize(cols: number, rows: number): void
  loadAddon(addon: XTermSerializeAddon): void
  onTitleChange(listener: (title: string) => void): { dispose(): void }
  dispose(): void
}
```

Add to `terminal-render-state.ts`:

```ts
export async function readTerminalRenderOutputExcerpt(
  sessionId: string,
  state: TerminalRenderState,
  maxCharacters: number,
): Promise<TerminalOutputExcerpt | null> {
  const model = state.model
  if (!model || !Number.isInteger(maxCharacters) || maxCharacters < 1) return null
  const sequence = state.sequence
  try {
    await model.chain
  } catch {}
  if (state.model !== model) return null

  const buffer = model.term.buffer.active
  let output: string | undefined
  let wrappedParts: string[] = []

  for (let index = buffer.length - 1; index >= 0; index -= 1) {
    const line = buffer.getLine(index)
    if (!line) continue
    wrappedParts.unshift(line.translateToString(true))
    if (line.isWrapped && index > 0) continue

    const logicalLine = normalizeTerminalOutputExcerpt(wrappedParts.join(''))
    wrappedParts = []
    if (!logicalLine) continue
    output = truncateTerminalOutputExcerpt(output ? `${logicalLine} ${output}` : logicalLine, maxCharacters)
    if (output && Array.from(output).length >= maxCharacters) break
  }

  return { sessionId, output: output ?? '', sequence }
}
```

This uses xterm screen semantics before text extraction; it never parses raw escape sequences itself.

- [ ] **Step 8: Delegate through manager and validate at the terminal boundary**

Add to `TerminalSessionManager`:

```ts
async outputExcerpt(sessionId: string, maxCharacters: number): Promise<TerminalOutputExcerpt | null> {
  const session = this.sessionsById.get(sessionId)
  if (!session) return null
  return await readTerminalRenderOutputExcerpt(sessionId, session.render, maxCharacters)
}
```

Add to `terminal.ts`:

```ts
export async function getServerTerminalOutputExcerpt(
  input: TerminalOutputExcerptInput,
): Promise<TerminalOutputExcerpt | null> {
  if (!isValidTerminalSessionId(input?.sessionId)) return null
  if (!Number.isInteger(input?.maxCharacters) || input.maxCharacters < 1 || input.maxCharacters > 4_096) return null
  return await manager.outputExcerpt(input.sessionId, input.maxCharacters)
}
```

The 4096 boundary matches the existing Telegram excerpt maximum without accepting arbitrary worker scan sizes.

- [ ] **Step 9: Thread the operation through the worker protocol**

Add `'output-excerpt': TerminalOutputExcerptInput` and its response type to `TerminalWorkerRequestInputs` and `TerminalWorkerResponseOutputs`. Expose the method on `TerminalFacade`, return `getServerTerminalOutputExcerpt(input)` from `createTerminalFacade`, and dispatch it in `TerminalWorkerRuntime`:

```ts
case 'output-excerpt':
  return await this.options.service.getOutputExcerpt(message.input)
```

Add to `ServerTerminalHost`:

```ts
getOutputExcerpt(input: TerminalOutputExcerptInput): MaybePromise<TerminalOutputExcerpt | null>
```

Implement the worker-backed proxy:

```ts
getOutputExcerpt(input: TerminalOutputExcerptInput): Promise<TerminalOutputExcerpt | null> {
  return this.request('output-excerpt', 'server', input)
}
```

- [ ] **Step 10: Run focused tests and verify GREEN**

Run the Step 4 command.

Expected: PASS for canonical normalization, real headless tmux redraw behavior, alternate/normal buffers, missing sessions, worker dispatch, and host proxying.

- [ ] **Step 11: Review checkpoint (no Git commit)**

Confirm no new terminal emulator or raw ANSI parser was introduced, screen extraction waits for the existing render chain, traversal stops at the configured bound, and the worker action is internal-only.

---

### Task 5: Apply Server Authoritative Gating and Canonical Excerpts to Telegram Delivery

**Files:**

- Modify: `src/shared/telegram-notifications.ts`
- Modify: `src/web/components/terminal/types.ts`
- Modify: `src/web/components/terminal/ManagedTerminalSession.ts`
- Modify: `src/web/components/terminal/terminal-notification-context.ts`
- Modify: `src/web/components/terminal/terminal-bell-controller.ts`
- Modify: `src/web/components/terminal/terminal-output-completion-controller.ts`
- Modify: `src/server/routes/telegram-notifications.ts`
- Modify: `src/server/app-factory.ts`
- Modify: `src/server/modules/telegram-notification-write-paths.ts`
- Delete after explicit confirmation: `src/web/components/terminal/terminal-output-tail.ts`
- Delete after explicit confirmation: `src/web/components/terminal/terminal-output-tail.test.ts`
- Test: `src/web/components/terminal/ManagedTerminalSession.test.ts`
- Test: `src/web/components/terminal/terminal-notification-context.test.ts`
- Test: `src/web/components/terminal/terminal-bell-controller.test.ts`
- Test: `src/web/components/terminal/terminal-output-completion-controller.test.ts`
- Test: `src/server/routes/telegram-notifications.test.ts`
- Test: `src/server/modules/telegram-notification-write-paths.test.ts`
- Test: `src/server/app-factory.test.ts`

**Interfaces:**

- Consumes Task 4 `ServerTerminalHost.getOutputExcerpt`.
- `TelegramBellNotificationContext` gains optional `sessionId?: string` and no longer accepts Renderer `outputTail`.
- `TelegramOutputCompletionNotificationContext` retains required `sessionId`, `finalOutputSeq`, and `activityDurationMs`.
- Produces one Server-only delivery context with optional `outputTail` after authoritative excerpt lookup.

- [ ] **Step 1: Add failing Server duration gate tests**

In `telegram-notification-write-paths.test.ts`, add a typed completion helper:

```ts
function completionContext(
  overrides: Partial<TelegramOutputCompletionNotificationContext> = {},
): TelegramOutputCompletionNotificationContext {
  return {
    ...context(),
    sessionId: 'session-1',
    finalOutputSeq: 42,
    activityDurationMs: 10_000,
    ...overrides,
  }
}
```

Configure a 10-second minimum and assert:

```ts
await expect(
  sendConfiguredTelegramOutputCompletionNotification(completionContext({ activityDurationMs: 9_999 }), dependencies),
).resolves.toEqual({ ok: true })
expect(dependencies.sendMessage).not.toHaveBeenCalled()

await sendConfiguredTelegramOutputCompletionNotification(
  completionContext({ activityDurationMs: 10_000 }),
  dependencies,
)
expect(dependencies.sendMessage).toHaveBeenCalledTimes(1)
```

Add invalid-input cases with this table:

```ts
test.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
  'rejects invalid activity duration %p',
  async (activityDurationMs) => {
    await expect(
      sendConfiguredTelegramOutputCompletionNotification(completionContext({ activityDurationMs }), dependencies),
    ).resolves.toEqual({ ok: false, error: { code: 'invalid-input' } })
  },
)
```

Verify a below-threshold request does not occupy the idempotency key by sending the same session/sequence later with `activityDurationMs: 10_000` and asserting delivery occurs once.

Prove the same threshold does not gate Telegram bell delivery:

```ts
const bellDeps = dependencies({
  getTelegramConfig: vi.fn(async () => ({
    ...telegramConfig(),
    outputCompletionMinimumActivitySeconds: 3_600,
  })),
})
await sendConfiguredTelegramBellNotification(context({ terminalKey: 'bell-not-duration-gated' }), bellDeps)
expect(bellDeps.sendMessage).toHaveBeenCalledTimes(1)
```

- [ ] **Step 2: Add failing canonical excerpt tests for bell and completion**

Inject a read dependency:

```ts
const readTerminalOutputExcerpt = vi.fn(async ({ sessionId, maxCharacters }) => ({
  sessionId,
  output: 'build passed [hobgoblin0:node* "done workspace"]',
  sequence: 42,
}))
```

Use it for both notification paths and prove that an untrusted legacy `outputTail` property is ignored:

```ts
const deps = dependencies({ readTerminalOutputExcerpt })
const maliciousBell = {
  ...context({ terminalKey: 'bell-with-screen', sessionId: 'session-bell' }),
  outputTail: 'renderer supplied text',
} as unknown as TelegramBellNotificationContext

await sendConfiguredTelegramBellNotification(maliciousBell, deps)
await sendConfiguredTelegramOutputCompletionNotification(
  {
    ...context({ terminalKey: 'completion-with-screen' }),
    sessionId: 'session-completion',
    finalOutputSeq: 42,
    activityDurationMs: 10_000,
  },
  deps,
)

expect(readTerminalOutputExcerpt).toHaveBeenNthCalledWith(1, {
  sessionId: 'session-bell',
  maxCharacters: 400,
})
expect(readTerminalOutputExcerpt).toHaveBeenNthCalledWith(2, {
  sessionId: 'session-completion',
  maxCharacters: 400,
})
for (const call of deps.sendMessage.mock.calls) {
  expect(call[0].text).toContain('build passed [hobgoblin0:node* "done workspace"]')
  expect(call[0].text).not.toContain('renderer supplied text')
}
```

Add two independent cases:

```ts
test('does not read terminal text when output inclusion is disabled', async () => {
  const readTerminalOutputExcerpt = vi.fn()
  const deps = dependencies({
    readTerminalOutputExcerpt,
    getTelegramConfig: vi.fn(async () => ({
      ...telegramConfig(),
      includeTerminalOutput: false,
    })),
  })

  await sendConfiguredTelegramBellNotification(
    context({ terminalKey: 'bell-without-output', sessionId: 'session-bell' }),
    deps,
  )

  expect(readTerminalOutputExcerpt).not.toHaveBeenCalled()
  expect(deps.sendMessage.mock.calls[0]?.[0].text).not.toContain('── 终端输出 ──')
})

test('falls back to metadata when the terminal screen is unavailable', async () => {
  const deps = dependencies({ readTerminalOutputExcerpt: vi.fn(async () => null) })

  await sendConfiguredTelegramOutputCompletionNotification(
    {
      ...context({ terminalKey: 'completion-missing-screen' }),
      sessionId: 'missing-session',
      finalOutputSeq: 7,
      activityDurationMs: 10_000,
    },
    deps,
  )

  expect(deps.sendMessage).toHaveBeenCalledTimes(1)
  expect(deps.sendMessage.mock.calls[0]?.[0].text).not.toContain('── 终端输出 ──')
})
```

Extract the existing repeated config literal in this test file to `telegramConfig()` and include `outputCompletionMinimumActivitySeconds: 10` so every test uses the complete authoritative contract.

- [ ] **Step 3: Add failing route/app dependency-injection tests**

Change route tests to construct:

```ts
const readTerminalOutputExcerpt = vi.fn()
const app = createTelegramNotificationRoutes({ readTerminalOutputExcerpt })
```

For both `/bell` and `/output-completion`, assert the write path receives the reader in its second argument:

```ts
expect(mocks.sendBell).toHaveBeenCalledWith(context, {
  acceptLanguage: 'en-US',
  readTerminalOutputExcerpt,
})
expect(mocks.sendCompletion).toHaveBeenCalledWith(completionContext, {
  acceptLanguage: 'zh-CN',
  readTerminalOutputExcerpt,
})
```

In `app-factory.test.ts`, add `getOutputExcerpt` to `terminalHostStub`:

```ts
getOutputExcerpt: vi.fn(async ({ sessionId }) => ({
  sessionId,
  output: 'server screen output',
  sequence: 42,
})),
```

Add these functions to the hoisted app-factory mocks:

```ts
getServerTelegramNotificationConfig: vi.fn(async () => ({
  enabled: true,
  botTokenConfigured: true,
  botToken: '123456:test-token',
  chatId: '-100123',
  bellEnabled: true,
  outputCompletionEnabled: true,
  outputCompletionMinimumActivitySeconds: 10,
  includeTerminalOutput: true,
  outputTailLength: 400,
})),
sendTelegramMessage: vi.fn(async () => ({ ok: true as const })),
telegramProxyUrlFromPrefs: vi.fn(() => undefined),
```

Export `getServerTelegramNotificationConfig` from the existing `settings-source.ts` mock and add this network-free source mock:

```ts
vi.mock('#/server/modules/telegram-notification-source.ts', () => ({
  sendTelegramMessage: mocks.sendTelegramMessage,
  telegramProxyUrlFromPrefs: mocks.telegramProxyUrlFromPrefs,
}))
```

Then prove the authenticated application route reaches the host:

```ts
const currentPrefs = await mocks.getServerSettingsPrefs()
mocks.getServerSettingsPrefs.mockResolvedValueOnce({
  ...currentPrefs,
  lang: 'zh',
  terminalNotificationsEnabled: true,
})
terminalHostStub.getOutputExcerpt.mockClear()

const response = await app.request('http://127.0.0.1:32100/api/telegram-notifications/output-completion', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-goblin-internal-secret': 'secret',
  },
  body: JSON.stringify({
    terminalKey: 'terminal-1',
    project: 'api',
    contextKind: 'directory',
    context: 'api',
    directory: '~/src/api',
    terminalIndex: 1,
    sessionId: 'session-1',
    finalOutputSeq: 42,
    activityDurationMs: 10_000,
  }),
})

expect(response.status).toBe(200)
expect(terminalHostStub.getOutputExcerpt).toHaveBeenCalledWith({
  sessionId: 'session-1',
  maxCharacters: 400,
})
expect(mocks.sendTelegramMessage).toHaveBeenCalledWith(
  expect.objectContaining({ text: expect.stringContaining('server screen output') }),
)
```

- [ ] **Step 4: Add failing Renderer tests showing raw output is no longer sent**

Update bell and completion controller tests so outgoing contexts contain `sessionId` but never `outputTail`, even when `includeTerminalOutput` is true:

```ts
expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'session-1' }))
expect(mocks.send.mock.calls[0]?.[0]).not.toHaveProperty('outputTail')
```

Update `ManagedTerminalSession.test.ts` to assert bell events carry the current server session ID and do not carry raw output text.

Change the three current bell expectations to the exact payload shape:

```ts
expect(onBell).toHaveBeenCalledWith(descriptor, {
  processName: 'zsh',
  canonicalTitle: null,
  visible: true,
  sessionId: 'session-1',
})

expect(onBell).toHaveBeenCalledWith(descriptor, {
  processName: 'claude',
  canonicalTitle: null,
  visible: false,
  sessionId: 'session-1',
})
expect(onBell.mock.calls[0]?.[1]).not.toHaveProperty('outputTail')
```

For the viewer case use the exact expectation:

```ts
expect(onBell).toHaveBeenCalledWith(descriptor, {
  processName: 'zsh',
  canonicalTitle: null,
  visible: false,
  sessionId: 'session-1',
})
expect(onBell.mock.calls[0]?.[1]).not.toHaveProperty('outputTail')
```

- [ ] **Step 5: Run focused tests and verify RED**

Run:

```sh
bun run test -- src/server/modules/telegram-notification-write-paths.test.ts src/server/routes/telegram-notifications.test.ts src/server/app-factory.test.ts src/web/components/terminal/ManagedTerminalSession.test.ts src/web/components/terminal/terminal-notification-context.test.ts src/web/components/terminal/terminal-bell-controller.test.ts src/web/components/terminal/terminal-output-completion-controller.test.ts
```

Expected: FAIL because Server gating/excerpt injection and Renderer session-only contexts are not implemented.

- [ ] **Step 6: Validate duration and gate before idempotency claim**

Extend the Server `TelegramConfig` with `outputCompletionMinimumActivitySeconds`. Remove `validatedOutputTail`; Renderer output is no longer a request field. Update `validatedContext` to validate optional `sessionId` but never copy an unknown legacy `outputTail` property:

```ts
const sessionId = value.sessionId === undefined ? undefined : validatedTerminalKey(value.sessionId)
// Include in the invalid branch:
(value.sessionId !== undefined && !sessionId)
// Include in the returned safe context:
...(sessionId ? { sessionId } : {})
```

Keep `activityDurationMs` out of the base bell validator because it is completion-specific. In `sendConfiguredTelegramOutputCompletionNotification`, validate:

```ts
const activityDurationMs = context?.activityDurationMs
if (!Number.isSafeInteger(activityDurationMs) || activityDurationMs < 0) {
  return { ok: false, error: { code: 'invalid-input' } }
}

if (activityDurationMs < config.outputCompletionMinimumActivitySeconds * 1_000) {
  return { ok: true }
}
```

Read the completion session identity from `safeContext.sessionId`, require it there, and place the duration check before writing to `completionAtByCycle` so rejected short periods do not consume an idempotency key. Keep duration out of `TelegramTerminalDeliveryContext`; it is control metadata, not message content.

- [ ] **Step 7: Inject the terminal excerpt reader into routes and write paths**

Extend `TelegramNotificationWriteOptions`:

```ts
readTerminalOutputExcerpt?: (
  input: TerminalOutputExcerptInput,
) => Promise<TerminalOutputExcerpt | null>
```

Return the selected reader from `writeDependencies` unchanged. Define the focused route dependency:

```ts
export interface TelegramNotificationRouteOptions {
  readTerminalOutputExcerpt?: TelegramNotificationWriteOptions['readTerminalOutputExcerpt']
}

export function createTelegramNotificationRoutes(options: TelegramNotificationRouteOptions = {}) {
```

Pass `options.readTerminalOutputExcerpt` to bell/completion write paths together with `acceptLanguage`; the `/test` route does not need terminal access. In `createApp` wire:

```ts
createTelegramNotificationRoutes({
  readTerminalOutputExcerpt: (input) => Promise.resolve(options.terminalHost.getOutputExcerpt(input)),
})
```

- [ ] **Step 8: Build a Server-only delivery context**

Remove `outputTail` from shared renderer request contexts. Use this local type in the write path:

```ts
type TelegramTerminalDeliveryContext = TelegramBellNotificationContext & {
  outputTail?: string
}
```

Change `formatTelegramBellMessage`, `formatTelegramOutputCompletionMessage`, and their private common formatter to accept `TelegramTerminalDeliveryContext`. Update the direct formatter test that supplies output to construct `{ ...context(...), outputTail: 'tests passed' }` at the call site instead of passing `outputTail` through the typed Renderer context helper.

Add:

```ts
async function deliveryContextWithOutput(
  context: TelegramBellNotificationContext,
  sessionId: string | undefined,
  config: TelegramConfig,
  dependencies: ReturnType<typeof writeDependencies>,
): Promise<TelegramTerminalDeliveryContext> {
  if (!config.includeTerminalOutput || !sessionId || !dependencies.readTerminalOutputExcerpt) return context
  const excerpt = await dependencies
    .readTerminalOutputExcerpt({ sessionId, maxCharacters: config.outputTailLength })
    .catch(() => null)
  const outputTail = truncateTerminalOutputExcerpt(excerpt?.output, config.outputTailLength)
  return outputTail ? { ...context, outputTail } : context
}
```

Call it after trigger/config/idempotency checks and before formatting for both bell and completion. Keep message formatting and the `── Terminal output ──` heading unchanged.

- [ ] **Step 9: Send only server session identity from the Renderer**

Change `TerminalBellEvent` from `outputTail?: string` to:

```ts
sessionId?: string
```

In `ManagedTerminalSession.handleBell`, populate:

```ts
const sessionId = this.runtime.currentSessionId()
this.onBell?.(this.descriptor, {
  processName: this.runtime.processName(),
  canonicalTitle: this.runtime.canonicalTitle(),
  visible: this.view.isVisible(),
  ...(sessionId ? { sessionId } : {}),
})
```

Have `terminalNotificationContext` copy optional `sessionId`. Remove Renderer truncation and `outputTail` mutation from both bell and completion controllers.

- [ ] **Step 10: Remove the obsolete raw PTY collector after explicit confirmation**

Before this step, present the required destructive-operation confirmation naming exactly:

```text
src/web/components/terminal/terminal-output-tail.ts
src/web/components/terminal/terminal-output-tail.test.ts
```

After confirmation:

- remove the collector import and field from `ManagedTerminalSession`;
- remove `push`, `reset`, and `outputTail()` calls;
- remove `outputTail` from `TerminalOutputCompletionIntent`;
- delete the two obsolete files using the approved file-deletion workflow;
- run `rg -n "terminal-output-tail|outputTail\(\)" src` and expect no obsolete Renderer collector references.

- [ ] **Step 11: Run focused tests and verify GREEN**

Run the Step 5 command.

Expected: PASS for duration gates, route injection, canonical output lookup, graceful missing-session fallback, no Renderer output payload, unchanged native bell behavior, and existing idempotency.

- [ ] **Step 12: Review checkpoint (no Git commit)**

Confirm terminal text is read only when `includeTerminalOutput` is enabled, no text/token/message is logged, Telegram bell ignores duration, and missing excerpt data never suppresses an otherwise eligible notification.

---

### Task 6: Run Architecture and Full Regression Gates

**Files:**

- Verify: `CONTEXT.md`
- Verify: `docs/superpowers/specs/2026-07-23-telegram-completion-duration-and-screen-excerpt-design.md`
- Verify all files modified by Tasks 1–5.

**Interfaces:**

- Consumes all previous tasks.
- Produces a verified implementation with no remaining raw Renderer Telegram output collector.

- [ ] **Step 1: Run formatting and inspect its diff**

Run:

```sh
bun run format
git diff --check
```

Expected: formatter succeeds and `git diff --check` prints no errors. Inspect formatter changes and keep only task-related formatting.

- [ ] **Step 2: Run type checking**

Run:

```sh
bun run typecheck
```

Expected: PASS with no strip-only TypeScript violations and no incomplete Telegram fixtures.

- [ ] **Step 3: Run the architecture guard**

Run:

```sh
bun run check:architecture
```

Expected: PASS; no forbidden `main`/`web`/`server`/Electron import boundary is introduced.

- [ ] **Step 4: Run the complete test suite**

Run:

```sh
bun run test
```

Expected: PASS for the complete Vitest suite.

- [ ] **Step 5: Run targeted semantic searches**

Run:

```sh
rg -n "outputCompletionMinimumActivitySeconds" src
rg -n "terminal-output-tail|outputTail\(\)" src
rg -n "activityDurationMs" src
```

Expected:

- the setting appears in shared contracts, defaults, Server persistence, UI, Renderer gate, Server gate, and tests;
- no obsolete Renderer raw-tail collector references remain;
- activity duration appears only in the completion intent/request/gates and tests, not in activity-indicator rendering.

- [ ] **Step 6: Manually review privacy and fallback paths**

Verify from the final diff:

- output text is never persisted or logged;
- output extraction is not called when inclusion is disabled;
- missing terminal sessions produce metadata-only notifications;
- native notifications contain no terminal excerpt;
- bell delivery has no duration gate;
- the default and legacy migration value are both 10 seconds;
- 1, 10, and 30 second shortcuts and 1–3600 manual input share one saved value.

- [ ] **Step 7: Final review checkpoint (no Git commit)**

Report the exact commands and results, list the two removed obsolete files, summarize any unrelated pre-existing working-tree changes left untouched, and stop without staging or committing.
