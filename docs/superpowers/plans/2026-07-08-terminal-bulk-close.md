# Terminal Bulk Close Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a confirmed `Close all terminals` action to the compact terminal dropdown for the current `TerminalTabs` session list.

**Architecture:** Keep the feature local to `TerminalTabs`: the dropdown opens a bulk-close confirmation, and confirmation composes the existing `onClose(key)` callback for each currently rendered session. Add i18n copy beside existing terminal close strings and cover behavior with `TerminalTabs.test.tsx` plus dictionary consistency tests.

**Tech Stack:** React 19, TypeScript strip-only mode, Vitest/jsdom, existing shadcn-style `DropdownMenu` and `ConfirmDialog`, existing i18n dictionaries.

---

## File Structure

- Modify: `src/web/components/terminal/TerminalTabs.tsx`
  - Owns compact terminal dropdown, close confirmations, and session close callbacks.
  - Add bulk confirmation state and dropdown item.
- Modify: `src/web/components/terminal/TerminalTabs.test.tsx`
  - Add compact dropdown tests for bulk close confirmation and cancellation.
  - Add small local helpers for opening the compact dropdown and clicking buttons by text.
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`
  - Add terminal bulk close labels and confirmation copy in every dictionary.

No new backend, terminal registry, or store API is needed.

## Task 1: Add Failing TerminalTabs Tests

**Files:**
- Modify: `src/web/components/terminal/TerminalTabs.test.tsx`

- [ ] **Step 1: Add local dropdown and button helpers near the existing `flushTimers` helper**

Add these helpers near the bottom of `src/web/components/terminal/TerminalTabs.test.tsx`, before `async function flushTimers()`:

```tsx
async function openCompactTerminalDropdown() {
  const trigger = document.body.querySelector('button[aria-label="terminal.sessions"]')
  if (!(trigger instanceof HTMLButtonElement)) throw new Error('missing terminal menu trigger')

  await act(async () => {
    trigger.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
    trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }))
    await Promise.resolve()
  })
}

function buttonByText(text: string): HTMLButtonElement {
  const button = [...document.body.querySelectorAll('button')].find((candidate) =>
    candidate.textContent?.includes(text),
  )
  if (!(button instanceof HTMLButtonElement)) throw new Error(`missing button: ${text}`)
  return button
}

function clickButtonByText(text: string) {
  const button = buttonByText(text)
  act(() => {
    button.click()
  })
}
```

- [ ] **Step 2: Replace inline dropdown opening in the existing compact dropdown test**

In the test named `keeps the selected terminal in the collapsed dropdown and still offers new terminal`, replace this block:

```tsx
const trigger = document.body.querySelector('button[aria-label="terminal.sessions"]')
if (!(trigger instanceof HTMLButtonElement)) throw new Error('missing terminal menu trigger')

await act(async () => {
  trigger.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
  trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }))
  await Promise.resolve()
})
```

with:

```tsx
await openCompactTerminalDropdown()
```

- [ ] **Step 3: Add a failing test for confirmed bulk close**

Add this test inside `describe('TerminalTabs', () => { ... })`, directly after the existing compact dropdown test:

```tsx
test('requires confirmation before closing all compact dropdown terminals', async () => {
  const onClose = vi.fn()

  render(
    <TerminalTabs
      worktreeTerminalKey="/repo\0/repo/worktree"
      detailId="detail"
      responsiveCompact
      sessions={[
        session({ key: 't1', selected: false, title: 'term-1' }),
        session({ key: 't2', selected: true, title: 'term-2' }),
        session({ key: 't3', selected: false, title: 'term-3' }),
      ]}
      onNew={() => {}}
      onSelect={() => {}}
      onScrollToBottom={() => {}}
      onClose={onClose}
      onReorder={() => {}}
    />,
  )

  await openCompactTerminalDropdown()
  clickButtonByText('terminal.close-all')

  expect(onClose).not.toHaveBeenCalled()
  expect(document.body.textContent).toContain('terminal.close-all-confirm-title')
  expect(document.body.textContent).toContain('terminal.close-all-confirm-body')

  clickButtonByText('terminal.close-all-confirm-confirm')

  expect(onClose.mock.calls).toEqual([['t1'], ['t2'], ['t3']])
})
```

- [ ] **Step 4: Add a failing test for canceling bulk close**

Add this test immediately after the confirmed bulk close test:

```tsx
test('cancels compact dropdown bulk close without closing terminals', async () => {
  const onClose = vi.fn()

  render(
    <TerminalTabs
      worktreeTerminalKey="/repo\0/repo/worktree"
      detailId="detail"
      responsiveCompact
      sessions={[
        session({ key: 't1', selected: true, title: 'term-1' }),
        session({ key: 't2', selected: false, title: 'term-2' }),
      ]}
      onNew={() => {}}
      onSelect={() => {}}
      onScrollToBottom={() => {}}
      onClose={onClose}
      onReorder={() => {}}
    />,
  )

  await openCompactTerminalDropdown()
  clickButtonByText('terminal.close-all')
  clickButtonByText('dialog.cancel')

  expect(onClose).not.toHaveBeenCalled()
  expect(document.body.textContent).not.toContain('terminal.close-all-confirm-title')
})
```

- [ ] **Step 5: Run the focused test and verify RED**

Run:

```bash
bun run test "src/web/components/terminal/TerminalTabs.test.tsx"
```

Expected output:

```text
Test Files  1 failed
```

Expected failure reason:

```text
missing button: terminal.close-all
```

If the failure is TypeScript syntax or an act/render setup error, fix the test before implementing production code.

## Task 2: Implement Bulk Close UI and Copy

**Files:**
- Modify: `src/web/components/terminal/TerminalTabs.tsx`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`

- [ ] **Step 1: Add bulk close state and confirm callback in `TerminalTabs`**

In `src/web/components/terminal/TerminalTabs.tsx`, after the existing `pendingCloseKey` state:

```tsx
const [bulkCloseConfirmOpen, setBulkCloseConfirmOpen] = useState(false)
```

After the existing `confirmClose` callback, add:

```tsx
const confirmBulkClose = useCallback(() => {
  setBulkCloseConfirmOpen(false)
  for (const key of sessions.map((session) => session.key)) {
    onClose(key)
  }
}, [onClose, sessions])
```

This uses the current rendered `sessions` list at confirm time, matching the spec when the list changes while confirmation is open.

- [ ] **Step 2: Add the compact dropdown menu item**

In `renderCompactTabsBody`, after the existing `New terminal` dropdown item:

```tsx
<DropdownMenuSeparator />
<DropdownMenuItem
  className="gap-2 text-destructive focus:text-destructive"
  onSelect={() => setBulkCloseConfirmOpen(true)}
>
  <X size={14} />
  {t('terminal.close-all')}
</DropdownMenuItem>
```

The compact dropdown only renders when `sessions.length > 0`, so no extra visibility guard is needed.

- [ ] **Step 3: Add the bulk confirmation dialog**

In the component return fragment, after the existing single-terminal `ConfirmDialog`, add:

```tsx
<ConfirmDialog
  open={bulkCloseConfirmOpen}
  title={t('terminal.close-all-confirm-title')}
  message={t('terminal.close-all-confirm-body', { count: sessions.length })}
  confirmLabel={t('terminal.close-all-confirm-confirm')}
  destructive
  onCancel={() => setBulkCloseConfirmOpen(false)}
  onConfirm={confirmBulkClose}
/>
```

- [ ] **Step 4: Add English i18n keys**

In `src/shared/i18n/en.ts`, directly after `terminal.close-confirm-confirm`:

```ts
'terminal.close-all': 'Close all terminals',
'terminal.close-all-confirm-title': 'Close all terminals?',
'terminal.close-all-confirm-body': 'This will close {count} terminals and end their running shell sessions.',
'terminal.close-all-confirm-confirm': 'Close all terminals',
```

- [ ] **Step 5: Add Chinese i18n keys**

In `src/shared/i18n/zh.ts`, directly after `terminal.close-confirm-confirm`:

```ts
'terminal.close-all': '关闭全部终端',
'terminal.close-all-confirm-title': '关闭全部终端？',
'terminal.close-all-confirm-body': '将关闭 {count} 个终端并结束其中运行的 Shell 会话。',
'terminal.close-all-confirm-confirm': '关闭全部终端',
```

- [ ] **Step 6: Add Japanese i18n keys**

In `src/shared/i18n/ja.ts`, directly after `terminal.close-confirm-confirm`:

```ts
'terminal.close-all': 'すべてのターミナルを閉じる',
'terminal.close-all-confirm-title': 'すべてのターミナルを閉じますか？',
'terminal.close-all-confirm-body': '{count} 個のターミナルを閉じ、実行中のシェルセッションを終了します。',
'terminal.close-all-confirm-confirm': 'すべてのターミナルを閉じる',
```

- [ ] **Step 7: Add Korean i18n keys**

In `src/shared/i18n/ko.ts`, directly after `terminal.close-confirm-confirm`:

```ts
'terminal.close-all': '모든 터미널 닫기',
'terminal.close-all-confirm-title': '모든 터미널을 닫을까요?',
'terminal.close-all-confirm-body': '{count}개 터미널을 닫고 실행 중인 셸 세션을 종료합니다.',
'terminal.close-all-confirm-confirm': '모든 터미널 닫기',
```

- [ ] **Step 8: Run focused tests and verify GREEN**

Run:

```bash
bun run test "src/web/components/terminal/TerminalTabs.test.tsx"
```

Expected output:

```text
Test Files  1 passed
```

The new tests should pass and existing single-terminal close tests should remain green.

## Task 3: Verify Dictionary Consistency and Full Project

**Files:**
- Verify: `src/shared/i18n/dictionaries.test.ts`
- Verify: project typecheck and full test suite

- [ ] **Step 1: Run dictionary tests**

Run:

```bash
bun run test "src/shared/i18n/dictionaries.test.ts"
```

Expected output:

```text
Test Files  1 passed
```

This confirms all dictionaries have the new keys and matching `{count}` placeholder usage.

- [ ] **Step 2: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected output:

```text
[typecheck] all projects passed
```

- [ ] **Step 3: Run the full test suite**

Run:

```bash
bun run test
```

Expected output:

```text
Test Files  <all passed>
```

The exact test count depends on the current repository state. Treat exit code 0 with no failed tests as passing, and treat any failed test as blocking.

- [ ] **Step 4: Review changed files**

Run:

```bash
git diff --stat
git diff -- "src/web/components/terminal/TerminalTabs.tsx" "src/web/components/terminal/TerminalTabs.test.tsx" "src/shared/i18n/en.ts" "src/shared/i18n/zh.ts" "src/shared/i18n/ja.ts" "src/shared/i18n/ko.ts"
```

Expected changed files:

```text
src/web/components/terminal/TerminalTabs.tsx
src/web/components/terminal/TerminalTabs.test.tsx
src/shared/i18n/en.ts
src/shared/i18n/zh.ts
src/shared/i18n/ja.ts
src/shared/i18n/ko.ts
```

Do not include unrelated files in this feature change.

## Notes

- This plan intentionally omits git commit steps because `AGENTS.md` says not to plan or execute git commit/branch operations unless the user explicitly asks.
- Preserve TypeScript strip-only compatibility: do not add enums, namespaces with runtime code, constructor parameter properties, or import aliases.
- Keep the implementation KISS/YAGNI: no new batch-close API, no global terminal close scope, no keyboard shortcut.
