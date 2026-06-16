# Terminal Custom Button Order Grid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Repository safety:** Do not run `git commit`, `git push`, branch changes, or destructive git commands unless the user explicitly asks. This project's AGENTS.md overrides the generic "frequent commits" guidance.

**Goal:** Add sortable, compact grid editing for Settings -> Terminal custom terminal buttons.

**Architecture:** Keep button order as the existing `terminalCustomButtons` array order. Add a small pure row-move helper, then refactor the existing Terminal settings editor into a sortable grid and card subcomponents that still write through the current settings controller. Terminal rendering and server settings normalization stay unchanged.

**Tech Stack:** React 19, TypeScript strip-only mode, Bun, Vitest, `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, lucide-react, existing Settings primitives.

---

## File Structure

- Create: `src/web/components/settings/terminal-custom-button-order.ts`
  - Pure row reorder helper for both drag and up/down controls.
- Create: `src/web/components/settings/terminal-custom-button-order.test.ts`
  - Unit tests for normal, boundary, and invalid row moves.
- Modify: `src/web/components/settings/pages/TerminalSettings.tsx`
  - Refactor the existing custom button editor into a sortable grid and card.
- Modify: `src/web/components/SettingsSurface.test.tsx`
  - Component coverage for move buttons, disabled edge controls, and mocked drag-end ordering.
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ko.ts`
- Modify: `src/shared/i18n/ja.ts`
  - Add labels for reorder, move up, and move down controls.

## Task 1: Pure Row Move Helper

**Files:**
- Create: `src/web/components/settings/terminal-custom-button-order.ts`
- Create: `src/web/components/settings/terminal-custom-button-order.test.ts`

- [ ] **Step 1: Write the failing helper tests**

Create `src/web/components/settings/terminal-custom-button-order.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { moveTerminalCustomButtonRow } from '#/web/components/settings/terminal-custom-button-order.ts'

describe('moveTerminalCustomButtonRow', () => {
  test('moves a row forward while preserving every row object', () => {
    const first = { id: 'first' }
    const second = { id: 'second' }
    const third = { id: 'third' }
    const rows = [first, second, third]

    const nextRows = moveTerminalCustomButtonRow(rows, 0, 2)

    expect(nextRows).toEqual([second, third, first])
    expect(nextRows[2]).toBe(first)
    expect(nextRows).not.toBe(rows)
  })

  test('moves a row backward while preserving every row object', () => {
    const first = { id: 'first' }
    const second = { id: 'second' }
    const third = { id: 'third' }
    const rows = [first, second, third]

    const nextRows = moveTerminalCustomButtonRow(rows, 2, 0)

    expect(nextRows).toEqual([third, first, second])
    expect(nextRows[0]).toBe(third)
    expect(nextRows).not.toBe(rows)
  })

  test('returns the same array for no-op and invalid moves', () => {
    const rows = [{ id: 'first' }, { id: 'second' }]

    expect(moveTerminalCustomButtonRow(rows, 0, 0)).toBe(rows)
    expect(moveTerminalCustomButtonRow(rows, -1, 1)).toBe(rows)
    expect(moveTerminalCustomButtonRow(rows, 0, -1)).toBe(rows)
    expect(moveTerminalCustomButtonRow(rows, 2, 0)).toBe(rows)
    expect(moveTerminalCustomButtonRow(rows, 0, 2)).toBe(rows)
    expect(moveTerminalCustomButtonRow(rows, 0.5, 1)).toBe(rows)
  })
})
```

- [ ] **Step 2: Run the helper test and verify it fails**

Run:

```bash
bun run test src/web/components/settings/terminal-custom-button-order.test.ts
```

Expected: FAIL with an import error for `src/web/components/settings/terminal-custom-button-order.ts`.

- [ ] **Step 3: Implement the minimal helper**

Create `src/web/components/settings/terminal-custom-button-order.ts`:

```ts
import { arrayMove } from '@dnd-kit/sortable'

export function moveTerminalCustomButtonRow<T>(rows: T[], fromIndex: number, toIndex: number): T[] {
  if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) return rows
  if (fromIndex === toIndex) return rows
  if (fromIndex < 0 || toIndex < 0) return rows
  if (fromIndex >= rows.length || toIndex >= rows.length) return rows
  return arrayMove(rows, fromIndex, toIndex)
}
```

- [ ] **Step 4: Run the helper test and verify it passes**

Run:

```bash
bun run test src/web/components/settings/terminal-custom-button-order.test.ts
```

Expected: PASS for all `moveTerminalCustomButtonRow` tests.

- [ ] **Step 5: Checkpoint the diff**

Run:

```bash
git diff -- src/web/components/settings/terminal-custom-button-order.ts src/web/components/settings/terminal-custom-button-order.test.ts
```

Expected: diff only contains the helper and its tests. Do not commit.

## Task 2: Component Tests for Sorting Behavior

**Files:**
- Modify: `src/web/components/SettingsSurface.test.tsx`

- [ ] **Step 1: Add dnd test wiring to the SettingsSurface test**

Modify the top of `src/web/components/SettingsSurface.test.tsx`.

Change the React import:

```ts
import { act, type ReactNode } from 'react'
```

Add this type and hoisted state after the existing `toastMocks` declaration:

```ts
type TestDragEndEvent = { active: { id: string }; over: { id: string } | null }

const dndState = vi.hoisted(() => ({
  lastDragEnd: null as ((event: TestDragEndEvent) => void) | null,
}))
```

Add these mocks after the existing `vi.mock('sonner', ...)` block:

```tsx
vi.mock('@dnd-kit/core', async () => {
  const actual = await vi.importActual<typeof import('@dnd-kit/core')>('@dnd-kit/core')
  return {
    ...actual,
    DndContext: ({ children, onDragEnd }: { children: ReactNode; onDragEnd: (event: TestDragEndEvent) => void }) => {
      dndState.lastDragEnd = onDragEnd
      return <>{children}</>
    },
    PointerSensor: vi.fn(),
    KeyboardSensor: vi.fn(),
    closestCenter: vi.fn(),
    useSensor: () => ({}),
    useSensors: () => [],
  }
})

vi.mock('@dnd-kit/sortable', async () => {
  const actual = await vi.importActual<typeof import('@dnd-kit/sortable')>('@dnd-kit/sortable')
  return {
    ...actual,
    SortableContext: ({ children }: { children: ReactNode }) => <>{children}</>,
    rectSortingStrategy: vi.fn(),
    sortableKeyboardCoordinates: vi.fn(),
    useSortable: ({ id }: { id: string }) => ({
      attributes: { 'data-sortable-id': id },
      listeners: {},
      setNodeRef: vi.fn(),
      setActivatorNodeRef: vi.fn(),
      transform: null,
      transition: undefined,
      isDragging: false,
    }),
  }
})
```

In `beforeEach`, add:

```ts
dndState.lastDragEnd = null
```

- [ ] **Step 2: Add local test helpers for terminal button rows and payload parsing**

Add these helpers near the existing `buttonByText`, `setInputValue`, and `setTextAreaValue` helpers:

```ts
async function addTerminalCustomButton(label: string, value: string) {
  await act(async () => {
    buttonByText('settings.terminal-custom-buttons.add').click()
    await Promise.resolve()
  })

  const index = document.querySelectorAll('[id^="terminal-custom-button-label-"]').length - 1
  const labelInput = document.getElementById(`terminal-custom-button-label-${index}`)
  const valueInput = document.getElementById(`terminal-custom-button-value-${index}`)
  if (!(labelInput instanceof HTMLInputElement) || !(valueInput instanceof HTMLTextAreaElement)) {
    throw new Error(`Missing terminal custom button fields at index ${index}`)
  }

  await act(async () => {
    setInputValue(labelInput, label)
    setTextAreaValue(valueInput, value)
    await Promise.resolve()
  })
}

function buttonsByLabel(label: string): HTMLButtonElement[] {
  return Array.from(document.body.querySelectorAll(`button[aria-label="${label}"]`)).filter(
    (button): button is HTMLButtonElement => button instanceof HTMLButtonElement,
  )
}

function lastTerminalCustomButtonsPayload(): unknown[] {
  const matchingCalls = fetchMock.mock.calls.filter((call) => {
    const [url] = call as unknown as [unknown, RequestInit | undefined]
    return new URL(String(url)).pathname === '/api/settings/prefs'
  })
  const [, options] = matchingCalls[matchingCalls.length - 1] as unknown as [unknown, RequestInit | undefined]
  const body = JSON.parse(String(options?.body ?? '{}')) as {
    settings?: { terminalCustomButtons?: unknown[] }
  }
  return body.settings?.terminalCustomButtons ?? []
}

function terminalCustomButtonLabelsFromPayload() {
  return lastTerminalCustomButtonsPayload().map((button) =>
    typeof button === 'object' && button && 'label' in button ? String(button.label) : '',
  )
}
```

- [ ] **Step 3: Add failing tests for up/down and disabled edge controls**

Inside the existing `describe('SettingsSurface', () => { ... })`, near the existing terminal settings tests, add:

```tsx
  test('reorders terminal custom buttons with move buttons before saving', async () => {
    await render(<SettingsSurface page="terminal" onPageChange={() => {}} />)
    await addTerminalCustomButton('alpha', 'echo alpha')
    await addTerminalCustomButton('beta', 'echo beta')
    await addTerminalCustomButton('gamma', 'echo gamma')

    await act(async () => {
      buttonsByLabel('settings.terminal-custom-buttons.move-down')[0]?.click()
      await Promise.resolve()
    })
    await act(async () => {
      buttonsByLabel('settings.terminal-custom-buttons.move-up')[2]?.click()
      await Promise.resolve()
    })
    await act(async () => {
      buttonByText('settings.terminal-custom-buttons.save').click()
      await Promise.resolve()
    })

    expect(terminalCustomButtonLabelsFromPayload()).toEqual(['beta', 'gamma', 'alpha'])
  })

  test('disables terminal custom button move controls at list boundaries', async () => {
    await render(<SettingsSurface page="terminal" onPageChange={() => {}} />)
    await addTerminalCustomButton('alpha', 'echo alpha')
    await addTerminalCustomButton('beta', 'echo beta')

    const moveUpButtons = buttonsByLabel('settings.terminal-custom-buttons.move-up')
    const moveDownButtons = buttonsByLabel('settings.terminal-custom-buttons.move-down')

    expect(moveUpButtons).toHaveLength(2)
    expect(moveDownButtons).toHaveLength(2)
    expect(moveUpButtons[0]?.disabled).toBe(true)
    expect(moveUpButtons[1]?.disabled).toBe(false)
    expect(moveDownButtons[0]?.disabled).toBe(false)
    expect(moveDownButtons[1]?.disabled).toBe(true)
  })
```

- [ ] **Step 4: Add a failing test for mocked drag-end ordering**

Add this test after the move button tests:

```tsx
  test('reorders terminal custom buttons from drag end before saving', async () => {
    await render(<SettingsSurface page="terminal" onPageChange={() => {}} />)
    await addTerminalCustomButton('alpha', 'echo alpha')
    await addTerminalCustomButton('beta', 'echo beta')
    await addTerminalCustomButton('gamma', 'echo gamma')

    const sortableHandles = Array.from(document.body.querySelectorAll('[data-sortable-id]'))
    const firstId = sortableHandles[0]?.getAttribute('data-sortable-id')
    const thirdId = sortableHandles[2]?.getAttribute('data-sortable-id')
    if (!firstId || !thirdId) throw new Error('Missing sortable ids for custom terminal buttons')

    await act(async () => {
      dndState.lastDragEnd?.({ active: { id: firstId }, over: { id: thirdId } })
      await Promise.resolve()
    })
    await act(async () => {
      buttonByText('settings.terminal-custom-buttons.save').click()
      await Promise.resolve()
    })

    expect(terminalCustomButtonLabelsFromPayload()).toEqual(['beta', 'gamma', 'alpha'])
  })
```

- [ ] **Step 5: Run the component tests and verify the new tests fail**

Run:

```bash
bun run test src/web/components/SettingsSurface.test.tsx
```

Expected: FAIL because `settings.terminal-custom-buttons.move-up`, `settings.terminal-custom-buttons.move-down`, and sortable drag handles do not exist yet.

## Task 3: Sortable Grid Implementation

**Files:**
- Modify: `src/web/components/settings/pages/TerminalSettings.tsx`

- [ ] **Step 1: Update imports**

Replace the current first imports in `src/web/components/settings/pages/TerminalSettings.tsx` with:

```tsx
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowDown, ArrowUp, GripVertical, Plus, Save, Trash2 } from 'lucide-react'
```

Add the helper import below the Settings primitives import block:

```ts
import { moveTerminalCustomButtonRow } from '#/web/components/settings/terminal-custom-button-order.ts'
```

- [ ] **Step 2: Add row update helpers inside `TerminalSettings`**

Inside `TerminalSettings`, after `updateRows`, add:

```ts
  function addRow() {
    updateRows([...rows, { id: `new:${Date.now()}:${rows.length}`, label: '', value: '', action: 'execute' }])
  }

  function replaceRow(rowId: string, patch: Partial<Omit<EditableTerminalCustomButton, 'id'>>) {
    updateRows(rows.map((item) => (item.id === rowId ? { ...item, ...patch } : item)))
  }

  function removeRow(rowId: string) {
    updateRows(rows.filter((item) => item.id !== rowId))
  }

  function moveRow(fromIndex: number, toIndex: number) {
    const nextRows = moveTerminalCustomButtonRow(rows, fromIndex, toIndex)
    if (nextRows !== rows) updateRows(nextRows)
  }
```

- [ ] **Step 3: Replace the Add button inline handler**

In the `SettingsGroup` action button, replace:

```tsx
            onClick={() => {
              updateRows([...rows, { id: `new:${Date.now()}`, label: '', value: '', action: 'execute' }])
            }}
```

with:

```tsx
            onClick={addRow}
```

- [ ] **Step 4: Replace the old list editor with the grid component**

Replace the current `<SettingsCard>...</SettingsCard>` block that maps `rows.map(...)` with:

```tsx
        {rows.length === 0 ? (
          <SettingsCard>
            <SettingsListItem size="lg">
              <p className="text-sm text-muted-foreground">{t('settings.terminal-custom-buttons.empty')}</p>
            </SettingsListItem>
          </SettingsCard>
        ) : (
          <TerminalCustomButtonGrid
            rows={rows}
            onRowChange={replaceRow}
            onRowRemove={removeRow}
            onRowMove={moveRow}
          />
        )}
```

- [ ] **Step 5: Add `TerminalCustomButtonGrid` below `TerminalSettings`**

Append this component after the closing brace of `TerminalSettings`:

```tsx
function TerminalCustomButtonGrid({
  rows,
  onRowChange,
  onRowRemove,
  onRowMove,
}: {
  rows: EditableTerminalCustomButton[]
  onRowChange: (rowId: string, patch: Partial<Omit<EditableTerminalCustomButton, 'id'>>) => void
  onRowRemove: (rowId: string) => void
  onRowMove: (fromIndex: number, toIndex: number) => void
}) {
  const rowIds = useMemo(() => rows.map((row) => row.id), [rows])
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id)
    const overId = event.over ? String(event.over.id) : null
    if (!overId || activeId === overId) return
    const fromIndex = rows.findIndex((row) => row.id === activeId)
    const toIndex = rows.findIndex((row) => row.id === overId)
    onRowMove(fromIndex, toIndex)
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={rowIds} strategy={rectSortingStrategy}>
        <div className="grid gap-3 px-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((row, index) => (
            <TerminalCustomButtonCard
              key={row.id}
              row={row}
              index={index}
              rowCount={rows.length}
              onChange={onRowChange}
              onRemove={onRowRemove}
              onMove={onRowMove}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
```

- [ ] **Step 6: Add `TerminalCustomButtonCard` below the grid component**

Append this component below `TerminalCustomButtonGrid`:

```tsx
function TerminalCustomButtonCard({
  row,
  index,
  rowCount,
  onChange,
  onRemove,
  onMove,
}: {
  row: EditableTerminalCustomButton
  index: number
  rowCount: number
  onChange: (rowId: string, patch: Partial<Omit<EditableTerminalCustomButton, 'id'>>) => void
  onRemove: (rowId: string) => void
  onMove: (fromIndex: number, toIndex: number) => void
}) {
  const t = useT()
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
  })
  const cardStyle: CSSProperties = {
    transform: CSS.Transform.toString(transform ? { ...transform, scaleX: 1, scaleY: 1 } : null),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={cardStyle}
      className={[
        'min-w-0 rounded-lg border border-border/60 bg-background/85 p-2 shadow-[var(--shadow-inset-highlight)]',
        isDragging ? 'z-10 shadow-sm' : '',
      ].join(' ')}
    >
      <div className="mb-2 flex min-w-0 items-center gap-1.5">
        <button
          ref={setActivatorNodeRef}
          type="button"
          data-interactive
          {...attributes}
          {...listeners}
          aria-label={t('settings.terminal-custom-buttons.reorder')}
          title={t('settings.terminal-custom-buttons.reorder')}
          className="flex size-6 touch-none cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground active:cursor-grabbing"
        >
          <GripVertical className="size-3.5" />
        </button>
        <span className="flex size-6 shrink-0 items-center justify-center rounded bg-muted text-[11px] text-muted-foreground">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <SettingsSelect<'execute' | 'input'>
            id={`terminal-custom-button-action-${index}`}
            value={row.action}
            options={[
              { value: 'execute', label: t('settings.terminal-custom-buttons.action-execute') },
              { value: 'input', label: t('settings.terminal-custom-buttons.action-input') },
            ]}
            onChange={(action) => onChange(row.id, { action })}
          />
        </div>
        <Button
          type="button"
          data-interactive
          variant="ghost"
          size="icon-sm"
          disabled={index === 0}
          aria-label={t('settings.terminal-custom-buttons.move-up')}
          title={t('settings.terminal-custom-buttons.move-up')}
          onClick={() => onMove(index, index - 1)}
        >
          <ArrowUp className="size-3.5" />
        </Button>
        <Button
          type="button"
          data-interactive
          variant="ghost"
          size="icon-sm"
          disabled={index === rowCount - 1}
          aria-label={t('settings.terminal-custom-buttons.move-down')}
          title={t('settings.terminal-custom-buttons.move-down')}
          onClick={() => onMove(index, index + 1)}
        >
          <ArrowDown className="size-3.5" />
        </Button>
        <Button
          type="button"
          data-interactive
          variant="ghost"
          size="icon-sm"
          aria-label={t('settings.terminal-custom-buttons.remove')}
          onClick={() => onRemove(row.id)}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
      <div className="grid min-w-0 gap-2">
        <Input
          id={`terminal-custom-button-label-${index}`}
          value={row.label}
          placeholder={t('settings.terminal-custom-buttons.label-placeholder')}
          aria-label={t('settings.terminal-custom-buttons.label')}
          onChange={(event) => onChange(row.id, { label: event.target.value })}
        />
        <textarea
          id={`terminal-custom-button-value-${index}`}
          className="min-h-[52px] max-h-40 w-full resize-y rounded-md border border-input bg-control px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          value={row.value}
          placeholder={t('settings.terminal-custom-buttons.value-placeholder')}
          aria-label={t('settings.terminal-custom-buttons.value')}
          onChange={(event) => onChange(row.id, { value: event.target.value })}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Run tests and expect only i18n key assertions to remain failing**

Run:

```bash
bun run test src/web/components/settings/terminal-custom-button-order.test.ts src/web/components/SettingsSurface.test.tsx
```

Expected: helper and SettingsSurface tests pass. Dictionary parity is verified after i18n keys are added in Task 4.

## Task 4: I18n Labels

**Files:**
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ko.ts`
- Modify: `src/shared/i18n/ja.ts`

- [ ] **Step 1: Add English labels**

In `src/shared/i18n/en.ts`, near the existing `settings.terminal-custom-buttons.*` keys, add:

```ts
  'settings.terminal-custom-buttons.reorder': 'Reorder custom terminal button',
  'settings.terminal-custom-buttons.move-up': 'Move custom terminal button up',
  'settings.terminal-custom-buttons.move-down': 'Move custom terminal button down',
```

- [ ] **Step 2: Add Chinese labels**

In `src/shared/i18n/zh.ts`, near the existing `settings.terminal-custom-buttons.*` keys, add:

```ts
  'settings.terminal-custom-buttons.reorder': '排序自定义终端按钮',
  'settings.terminal-custom-buttons.move-up': '上移自定义终端按钮',
  'settings.terminal-custom-buttons.move-down': '下移自定义终端按钮',
```

- [ ] **Step 3: Add Korean labels**

In `src/shared/i18n/ko.ts`, near the existing `settings.terminal-custom-buttons.*` keys, add:

```ts
  'settings.terminal-custom-buttons.reorder': '사용자 지정 터미널 버튼 순서 변경',
  'settings.terminal-custom-buttons.move-up': '사용자 지정 터미널 버튼 위로 이동',
  'settings.terminal-custom-buttons.move-down': '사용자 지정 터미널 버튼 아래로 이동',
```

- [ ] **Step 4: Add Japanese labels**

In `src/shared/i18n/ja.ts`, near the existing `settings.terminal-custom-buttons.*` keys, add:

```ts
  'settings.terminal-custom-buttons.reorder': 'カスタムターミナルボタンを並べ替え',
  'settings.terminal-custom-buttons.move-up': 'カスタムターミナルボタンを上へ移動',
  'settings.terminal-custom-buttons.move-down': 'カスタムターミナルボタンを下へ移動',
```

- [ ] **Step 5: Run dictionary and component tests**

Run:

```bash
bun run test src/shared/i18n/dictionaries.test.ts src/web/components/settings/terminal-custom-button-order.test.ts src/web/components/SettingsSurface.test.tsx
```

Expected: PASS.

## Task 5: Full Verification

**Files:**
- Read-only verification across changed files.

- [ ] **Step 1: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: PASS.

- [ ] **Step 2: Run focused tests**

Run:

```bash
bun run test src/shared/i18n/dictionaries.test.ts src/web/components/settings/terminal-custom-button-order.test.ts src/web/components/SettingsSurface.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run the full test suite if focused verification passes**

Run:

```bash
bun run test
```

Expected: PASS.

- [ ] **Step 4: Run architecture guard**

Run:

```bash
bun run check:architecture
```

Expected: PASS.

- [ ] **Step 5: Inspect final diff without reverting unrelated work**

Run:

```bash
git diff -- src/web/components/settings/terminal-custom-button-order.ts src/web/components/settings/terminal-custom-button-order.test.ts src/web/components/settings/pages/TerminalSettings.tsx src/web/components/SettingsSurface.test.tsx src/shared/i18n/en.ts src/shared/i18n/zh.ts src/shared/i18n/ko.ts src/shared/i18n/ja.ts docs/superpowers/specs/2026-06-16-terminal-custom-button-order-grid-design.md docs/superpowers/plans/2026-06-16-terminal-custom-button-order-grid.md
```

Expected: diff only includes the helper, sortable grid UI, tests, i18n labels, and planning docs. Do not revert unrelated modified files already present in the worktree.

## Self-Review Checklist

- Spec coverage:
  - Sort support: Task 2 and Task 3 cover move buttons and drag end.
  - Grid editing: Task 3 replaces the single-column editor with a responsive grid.
  - Compact value editing: Task 3 sets a two-line-ish `min-h-[52px]` textarea with `resize-y`.
  - No schema change: no task modifies shared settings types or server normalization.
  - Save-on-click behavior: Task 3 keeps `dirty` and `save()` unchanged.
- Placeholder scan: no task uses unresolved markers, "similar to", or unspecified validation.
- Type consistency:
  - `EditableTerminalCustomButton` remains local to `TerminalSettings.tsx`.
  - `moveTerminalCustomButtonRow<T>(rows: T[], fromIndex: number, toIndex: number): T[]` is used by `moveRow`.
  - i18n keys used by the component are added to all four dictionaries.
