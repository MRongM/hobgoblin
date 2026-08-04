# Built-in Terminal Button Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. The user selected inline execution; do not dispatch subagents.

**Goal:** Preseed the current first seven custom terminal buttons as editable built-in presets whose labels and sent text follow Hobgoblin's English, Simplified Chinese, Japanese, and Korean application languages.

**Architecture:** Add one optional stable preset identity to the existing literal button model. A shared catalog owns identity, order, action, fallback copy, and translation keys; the server preserves validated identities in its existing settings array, while renderer consumers resolve localized label/value projections without adding state, transport, or realtime paths.

**Tech Stack:** TypeScript 6 in Node.js strip-only mode, React 19, i18next/react-i18next, Vitest, Bun.

## Global Constraints

- Preserve explicit existing `terminalCustomButtons` arrays, including `[]`; seed only a new store or a persisted file with no such property.
- Include exactly the first seven current buttons in current order and action modes; exclude the final two current buttons and all environment-specific content.
- A preset follows application language until label, value, or action is edited; reordering and removing do not convert it.
- Unknown preset IDs degrade to literal custom buttons instead of deleting valid button content.
- Do not change Android's separate native command deck.
- Use repo-alias imports with explicit `.ts`/`.tsx` extensions and no unsupported TypeScript runtime syntax.
- Do not add dependencies, APIs, settings fields, realtime paths, re-export shims, Git commits, pushes, or branches.
- Write and run each failing test before its production implementation.

---

### Task 1: Shared preset catalog, translations, and defaults

**Files:**

- Create: `src/shared/terminal-custom-button-presets.ts`
- Create: `src/shared/terminal-custom-button-presets.test.ts`
- Modify: `src/shared/settings.ts`
- Modify: `src/shared/settings-defaults.ts`
- Modify: `src/shared/settings-defaults.test.ts`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`
- Modify: `src/shared/i18n/dictionaries.test.ts`

**Interfaces:**

- Produces: `TerminalCustomButtonPresetId`, `isTerminalCustomButtonPresetId(value)`, `createDefaultTerminalCustomButtons()`, and `resolveTerminalCustomButtonPreset(button, translate)`.
- Produces: optional `TerminalCustomButton.presetId` for persistence and renderer consumers.
- Consumes: existing `DictKey`, `TerminalCustomButton`, and `TerminalCustomButtonAction` types.

- [ ] **Step 1: Write failing catalog and default tests**

Create `src/shared/terminal-custom-button-presets.test.ts` with these assertions:

```ts
import { describe, expect, test } from 'vitest'
import { DICTS } from '#/shared/i18n/dictionaries.ts'
import {
  createDefaultTerminalCustomButtons,
  resolveTerminalCustomButtonPreset,
} from '#/shared/terminal-custom-button-presets.ts'

describe('terminal custom button presets', () => {
  test('creates exactly the seven approved presets in order', () => {
    expect(createDefaultTerminalCustomButtons().map(({ presetId, action }) => ({ presetId, action }))).toEqual([
      { presetId: 'confirm-continue', action: 'execute' },
      { presetId: 'try-if-needed', action: 'execute' },
      { presetId: 'show-progress', action: 'execute' },
      { presetId: 'autonomous-decisions', action: 'execute' },
      { presetId: 'commit-and-push', action: 'input' },
      { presetId: 'ship-release', action: 'input' },
      { presetId: 'batch-operations', action: 'input' },
    ])
  })

  test('resolves every preset in every supported language', () => {
    for (const lang of ['en', 'zh', 'ja', 'ko'] as const) {
      const resolved = createDefaultTerminalCustomButtons().map((button) =>
        resolveTerminalCustomButtonPreset(button, (key) => DICTS[lang][key]),
      )
      expect(resolved).toHaveLength(7)
      expect(resolved.every((button) => button.label.trim() && button.value.trim())).toBe(true)
    }
  })

  test('preserves literal custom buttons and falls back for unknown preset ids', () => {
    const literal = { label: 'Status', value: 'git status', action: 'execute' as const }
    expect(resolveTerminalCustomButtonPreset(literal, (key) => key)).toBe(literal)
    expect(
      resolveTerminalCustomButtonPreset(
        { ...literal, presetId: 'newer-version-id' as never },
        (key) => `translated:${key}`,
      ),
    ).toEqual({ ...literal, presetId: 'newer-version-id' })
  })
})
```

Extend `settings-defaults.test.ts` with this reference-isolation assertion:

```ts
const first = defaultSettingsPrefs().terminalCustomButtons
const second = defaultSettingsPrefs().terminalCustomButtons
expect(first).toHaveLength(7)
expect(second).toEqual(first)
expect(second).not.toBe(first)
expect(second[0]).not.toBe(first[0])
```

Extend `dictionaries.test.ts` to assert that all fourteen preset keys exist in every locale and that the resolved label arrays exactly match:

```ts
expect(labels.en).toEqual([
  'Confirm, continue',
  'Try if needed',
  'Progress',
  'Decide autonomously',
  'Commit, push',
  'Merge and release',
  'Batch operations',
])
expect(labels.zh).toEqual(['确认、继续', '试试、需要', '进度', '自主决策', '提交、推送', '提推合发更', '批量操作'])
expect(labels.ja).toEqual([
  '確認・続行',
  '必要なら試す',
  '進捗',
  '自律判断',
  'コミット・プッシュ',
  'マージ・リリース',
  '一括操作',
])
expect(labels.ko).toEqual([
  '확인·계속',
  '필요하면 시도',
  '진행 상황',
  '자율 결정',
  '커밋·푸시',
  '병합·릴리스',
  '일괄 작업',
])
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```sh
bun run test -- src/shared/terminal-custom-button-presets.test.ts src/shared/settings-defaults.test.ts src/shared/i18n/dictionaries.test.ts
```

Expected: FAIL because `terminal-custom-button-presets.ts`, `presetId`, and the translation keys do not exist.

- [ ] **Step 3: Add the type, catalog, resolver, and fresh defaults**

Add the optional identity in `src/shared/settings.ts`:

```ts
import type { TerminalCustomButtonPresetId } from '#/shared/terminal-custom-button-presets.ts'

export interface TerminalCustomButton {
  label: string
  value: string
  action?: TerminalCustomButtonAction
  presetId?: TerminalCustomButtonPresetId
}
```

Implement the shared catalog as a single ordered `as const` array. Each definition has `id`, `action`, `fallbackLabel`, `fallbackValue`, `labelKey`, and `valueKey`. Derive `TerminalCustomButtonPresetId` from the array, validate with a `Set`, create fresh default objects with `.map`, and resolve known IDs through the translator. When a translator returns its key or an empty value, use the definition's English fallback. Return an ordinary or unknown-ID button unchanged.

Use these English fallback pairs:

```ts
;[
  ['Confirm, continue', 'Confirm and continue'],
  ['Try if needed', 'Try it if needed'],
  ['Progress', 'What is the current progress?'],
  [
    'Decide autonomously',
    'Confirmed. Make decisions autonomously and execute the plan inline. Defer anything requiring my confirmation until the end.',
  ],
  ['Commit, push', 'Generate the commit message, commit the changes, and push them to the remote.'],
  [
    'Merge and release',
    'Merge into main, create a tag, generate an English release description, create a new release, and update Pages.',
  ],
  [
    'Batch operations',
    "1. Pull and update the current repository's source branch. 2. Batch-merge it into the current branch.",
  ],
]
```

Change `defaultSettingsPrefs()` to call `createDefaultTerminalCustomButtons()` when no override is supplied. Keep `DEFAULT_TERMINAL_CUSTOM_BUTTONS` as a snapshot for compatibility, but never return its mutable references from the factory.

- [ ] **Step 4: Add all four localized label/value pairs**

Add `terminal.custom-button-presets.<id>.label` and `.value` keys to each dictionary. Chinese values must preserve the current first-seven content exactly:

```ts
;[
  ['确认、继续', '确认、继续'],
  ['试试、需要', '试试 需要'],
  ['进度', '现在进度如何'],
  ['自主决策', '确认 自主决策并且使用inline的方式执行计划,需要我确认的留到最后'],
  ['提交、推送', '生成提交内容，提交，并且推送到远程'],
  ['提推合发更', '合并进入main,生成tag, 生成release 英文描述，生成新的release, 更新pages'],
  ['批量操作', '1.拉取、更新当前仓库的来源分支，2.批量合入到当前分支内'],
]
```

Use these exact Japanese pairs:

```ts
;[
  ['確認・続行', '確認して続行してください'],
  ['必要なら試す', '必要なら試してみてください'],
  ['進捗', '現在の進捗はどうなっていますか'],
  [
    '自律判断',
    '確認しました。自律的に判断し、inline方式で計画を実行してください。私の確認が必要な項目は最後にまとめてください。',
  ],
  ['コミット・プッシュ', 'コミット内容を生成し、コミットしてリモートへプッシュしてください。'],
  [
    'マージ・リリース',
    'main にマージし、tag を生成し、英語の release 説明を生成して新しい release を作成し、Pages を更新してください。',
  ],
  ['一括操作', '1. 現在のリポジトリの元ブランチをプルして更新する。2. 現在のブランチへ一括でマージする。'],
]
```

Use these exact Korean pairs:

```ts
;[
  ['확인·계속', '확인하고 계속 진행해 주세요'],
  ['필요하면 시도', '필요하면 시도해 주세요'],
  ['진행 상황', '현재 진행 상황이 어떻게 되나요?'],
  [
    '자율 결정',
    '확인했습니다. 자율적으로 결정하고 inline 방식으로 계획을 실행해 주세요. 제 확인이 필요한 항목은 마지막에 모아 주세요.',
  ],
  ['커밋·푸시', '커밋 내용을 생성하고 커밋한 다음 원격에 푸시해 주세요.'],
  ['병합·릴리스', 'main에 병합하고 tag를 생성한 뒤 영어 release 설명과 새 release를 만들고 Pages를 업데이트해 주세요.'],
  ['일괄 작업', '1. 현재 리포지토리의 원본 브랜치를 풀하여 업데이트합니다. 2. 현재 브랜치에 일괄 병합합니다.'],
]
```

Do not introduce any text from the excluded entries.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run the Step 2 command. Expected: PASS with zero failed tests.

---

### Task 2: Persist known preset identities without overwriting existing lists

**Files:**

- Modify: `src/server/modules/settings-source.test.ts`
- Modify: `src/server/modules/settings-source.ts`

**Interfaces:**

- Consumes: `createDefaultTerminalCustomButtons()` and `isTerminalCustomButtonPresetId(value)` from Task 1.
- Produces: normalized server snapshots that preserve only known `presetId` values.

- [ ] **Step 1: Write failing settings-source tests**

Add four focused cases:

```ts
test('seeds presets when terminal custom buttons were never persisted', async () => {
  useTempServerSettingsDir()
  writeSettingsFile({ lang: 'zh' })
  const mod = await import('#/server/modules/settings-source.ts')
  expect((await mod.getServerSettingsPrefs()).terminalCustomButtons.map((button) => button.presetId)).toEqual([
    'confirm-continue',
    'try-if-needed',
    'show-progress',
    'autonomous-decisions',
    'commit-and-push',
    'ship-release',
    'batch-operations',
  ])
})

test('preserves an explicitly empty terminal custom button list', async () => {
  useTempServerSettingsDir()
  writeSettingsFile({ terminalCustomButtons: [] })
  const mod = await import('#/server/modules/settings-source.ts')
  expect((await mod.getServerSettingsPrefs()).terminalCustomButtons).toEqual([])
})
```

Add the known- and unknown-ID cases explicitly:

```ts
test('preserves known terminal custom button preset ids', async () => {
  useTempServerSettingsDir()
  writeSettingsFile({
    terminalCustomButtons: [
      { label: 'Confirm, continue', value: 'Confirm and continue', action: 'execute', presetId: 'confirm-continue' },
    ],
  })
  const mod = await import('#/server/modules/settings-source.ts')
  expect((await mod.getServerSettingsPrefs()).terminalCustomButtons[0]).toEqual({
    label: 'Confirm, continue',
    value: 'Confirm and continue',
    action: 'execute',
    presetId: 'confirm-continue',
  })
})

test('drops unknown preset ids without dropping valid literal button data', async () => {
  useTempServerSettingsDir()
  writeSettingsFile({
    terminalCustomButtons: [{ label: 'Status', value: 'git status', action: 'execute', presetId: 'unknown-preset' }],
  })
  const mod = await import('#/server/modules/settings-source.ts')
  expect((await mod.getServerSettingsPrefs()).terminalCustomButtons[0]).toEqual({
    label: 'Status',
    value: 'git status',
    action: 'execute',
  })
})
```

- [ ] **Step 2: Run the settings-source test and verify RED**

Run:

```sh
bun run test -- src/server/modules/settings-source.test.ts
```

Expected: FAIL because a missing property still normalizes to `[]` and normalization discards every `presetId`.

- [ ] **Step 3: Implement minimal normalization and missing-property seeding**

Import the Task 1 helpers directly. In `normalizeTerminalCustomButtons`, build the existing normalized literal and conditionally add `presetId` only when `isTerminalCustomButtonPresetId(button.presetId)` is true:

```ts
const normalizedButton: TerminalCustomButton = {
  label,
  value: button.value,
  action: normalizeTerminalCustomButtonAction(button.action),
}
if (isTerminalCustomButtonPresetId(button.presetId)) normalizedButton.presetId = button.presetId
normalized.push(normalizedButton)
```

When reading a parsed file, use fresh defaults only for `parsed.terminalCustomButtons === undefined`; pass every other value, including `[]` and `null`, through existing normalization.

- [ ] **Step 4: Run the settings-source test and verify GREEN**

Run the Step 2 command. Expected: PASS with zero failed tests.

---

### Task 3: Preserve or detach preset identity in Terminal settings

**Files:**

- Modify: `src/web/components/SettingsSurface.test.tsx`
- Modify: `src/web/components/settings/pages/TerminalSettings.tsx`

**Interfaces:**

- Consumes: `resolveTerminalCustomButtonPreset(button, translate)` from Task 1.
- Produces: save payloads that retain `presetId` after reorder/remove-only edits and omit it after label/value/action edits.

- [ ] **Step 1: Write failing settings UI tests**

Make the settings test fixture's initial `terminalCustomButtons` array mutable per test and typed as `TerminalCustomButton[]`. Add tests that:

1. Seed a `confirm-continue` preset, set the i18n store dictionary to Chinese, render the Terminal page, and expect the label/value inputs to contain `确认、继续`.
2. Seed a preset plus a literal custom button, move the preset, save, and expect the preset row in `lastTerminalCustomButtonsPayload()` to retain `presetId: 'confirm-continue'`.
3. Seed the preset, edit its label, save, and expect the payload row not to have `presetId` while retaining the edited literal label.

- [ ] **Step 2: Run the settings UI test and verify RED**

Run:

```sh
bun run test -- src/web/components/SettingsSurface.test.tsx
```

Expected: FAIL because the editor neither resolves nor preserves `presetId`.

- [ ] **Step 3: Implement localized editable rows and detach-on-edit**

Read the current dictionary from `useI18nStore` and memoize editable rows by `[buttons, dict]`. Resolve each source button before filling its editable `label` and `value`, but retain the source `presetId` on the row. Include `presetId` in the stable row ID.

Update `validButtons` to preserve a known row `presetId` in the save payload. Update `replaceRow` so every label, value, or action patch removes `presetId` before applying the patch:

```ts
function replaceRow(rowId: string, patch: Partial<Omit<EditableTerminalCustomButton, 'id'>>) {
  updateRows(
    rows.map((item) => {
      if (item.id !== rowId) return item
      const { presetId: _presetId, ...literal } = item
      return { ...literal, ...patch }
    }),
  )
}
```

Reorder and remove paths continue to operate on whole rows, so no extra logic is added there. Preserve the existing dirty guard so a dictionary change cannot overwrite unsaved edits.

- [ ] **Step 4: Run the settings UI test and verify GREEN**

Run the Step 2 command. Expected: PASS with zero failed tests.

---

### Task 4: Resolve preset copy in the terminal button dock

**Files:**

- Modify: `src/web/components/terminal/TerminalSlot.test.tsx`
- Modify: `src/web/components/terminal/TerminalSlot.tsx`

**Interfaces:**

- Consumes: `resolveTerminalCustomButtonPreset(button, translate)` from Task 1 and the existing `useT()` translator.
- Produces: localized button label, tooltip, and sent terminal value with unchanged `execute`/`input` behavior.

- [ ] **Step 1: Write a failing terminal integration test**

Type the runtime test fixture as `TerminalCustomButton[]` and make the i18n mock return per-test translations. Configure a `confirm-continue` preset whose stored fallback is English, provide Chinese translations for its label/value keys, render a controller terminal, click the `确认、继续` button, and assert:

```ts
expect(writeInput).toHaveBeenCalledWith('terminal-1', '确认、继续\r')
expect(focusTerminal).toHaveBeenCalledWith('terminal-1')
```

Reset translations after every test. Keep the existing literal execute and input tests unchanged.

- [ ] **Step 2: Run the terminal slot test and verify RED**

Run:

```sh
bun run test -- src/web/components/terminal/TerminalSlot.test.tsx
```

Expected: FAIL because the dock still uses stored literal labels and values.

- [ ] **Step 3: Resolve before filtering and rendering**

Map buttons through `resolveTerminalCustomButtonPreset(button, t)` before the existing non-empty filter. Use the resolved object for label, tooltip, `writeInput`, and React key; prefer `presetId` in the key when present. Do not change controller visibility, carriage-return, focus, size, dock measurement, or session behavior.

- [ ] **Step 4: Run the terminal slot test and verify GREEN**

Run the Step 2 command. Expected: PASS with zero failed tests.

---

### Task 5: Documentation, formatting, and full verification

**Files:**

- Modify: `CONTEXT.md`
- Create: `docs/superpowers/specs/2026-08-04-terminal-button-presets-design.md`
- Create: `docs/superpowers/plans/2026-08-04-terminal-button-presets.md`
- Format: every TypeScript and Markdown file listed in Tasks 1–5

**Interfaces:**

- Consumes: all prior task deliverables.
- Produces: documented domain terminology and fresh verification evidence.

- [ ] **Step 1: Confirm documentation and privacy boundaries**

Verify the glossary defines “Built-in terminal button preset,” the design records language/edit/migration semantics, and neither excluded button content nor environment-specific identifiers appear in new source, tests, docs, or snapshots.

- [ ] **Step 2: Format only files changed by this feature**

Run `bunx prettier --write` with the explicit changed file paths. Do not run a broad rewrite over unrelated files.

- [ ] **Step 3: Run focused tests together**

```sh
bun run test -- src/shared/terminal-custom-button-presets.test.ts src/shared/settings-defaults.test.ts src/shared/i18n/dictionaries.test.ts src/server/modules/settings-source.test.ts src/web/components/SettingsSurface.test.tsx src/web/components/terminal/TerminalSlot.test.tsx
```

Expected: PASS with zero failed tests.

- [ ] **Step 4: Run required full verification**

Run, in order:

```sh
bun run typecheck
bun run test
bun run check:architecture
git diff --check
```

Expected: every command exits `0`; Vitest reports zero failed tests; architecture reports no boundary violations; Git reports no whitespace errors.

- [ ] **Step 5: Review the final diff without committing**

Use `git status --short` and `git diff --stat` to confirm only the documented feature files changed. Do not commit or push; hand the verified worktree back to the user.
