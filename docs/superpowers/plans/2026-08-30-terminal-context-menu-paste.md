# Terminal Context Menu Paste Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a text-only Paste action to every controlling desktop internal-terminal context menu while preserving Copy, read-only, Mobile Web, and keyboard/binary paste behavior.

**Architecture:** Read clipboard text in the renderer through a focused terminal clipboard helper, then route it through the existing terminal session facade to xterm's public `Terminal.paste(text)` API so bracketed-paste semantics remain intact. Keep context-menu state local to `TerminalSlot`; add no Electron IPC, server state, terminal protocol, persistence, or realtime path.

**Tech Stack:** React 19, xterm.js 6, Radix/shadcn context menu, TypeScript 6 strip-only mode, Vitest 4, Bun 1.3.

---

## Scope and File Structure

- Modify `src/web/components/terminal/terminal-clipboard.ts` and `.test.ts`: add a best-effort clipboard text reader with an explicit `null` failure result.
- Modify `src/web/components/terminal/terminal-session-view.ts`, `ManagedTerminalSession.ts`, `TerminalSessionRegistry.ts`, `TerminalSessionProvider.tsx`, and `types.ts`: add one renderer-local `pasteText` command from context to xterm.
- Modify terminal facade tests and typed test contexts: prove the command delegates and keep structural fixtures complete.
- Modify `src/web/components/terminal/TerminalSlot.tsx` and `.test.tsx`: model an open controller menu without a selection, render Copy/Paste according to authority, and execute text paste.
- Modify the four `src/shared/i18n/*.ts` dictionaries: add one paste-read failure message.

## Architecture Grill

The required `.claude/skills/grill-with-docs/SKILL.md` is absent, so the plan was pressure-tested directly against every app-level design document listed by `AGENTS.md`:

- `docs/README.md`: routes the decision through UI, architecture, layering, state, renderer, and realtime guidance.
- `docs/ui-conventions.md`: reuses the existing shadcn/Radix menu and the existing localized `menu.edit.paste` label.
- `docs/arch.md`: clipboard read is supported by the shared renderer path, so no native-only `src/main` behavior is justified.
- `docs/layering.md`: menu state remains local; the existing terminal session facade is extended narrowly instead of creating a new generic service.
- `docs/state-sync.md`: captured menu target/selection is ephemeral local state and must not be synchronized or persisted.
- `docs/renderer-model.md`: Electron and Web share the same Clipboard API and terminal facade behavior.
- `docs/realtime.md`: xterm already emits pasted input through the existing terminal stream; no new realtime path is added.

The main correctness risk is bypassing xterm's bracketed-paste handling by calling raw `writeInput`. The plan explicitly calls `Terminal.paste(text)` through the renderer facade. The main authority risk is showing Paste to a viewer/unowned attachment; the menu visibility matrix and tests make controller authority mandatory.

### Task 1: Read clipboard text with an explicit failure result

**Files:**
- Modify: `src/web/components/terminal/terminal-clipboard.test.ts`
- Modify: `src/web/components/terminal/terminal-clipboard.ts`

- [ ] **Step 1: Add failing clipboard-read tests**

Extend the test helper so it can install read and write methods independently:

```ts
interface ClipboardStub {
  readText?: () => Promise<string>
  writeText?: (text: string) => Promise<void>
}

function setClipboard(clipboard: ClipboardStub | undefined): void {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard })
}
```

Import `readTerminalClipboardText` beside the writer and add:

```ts
describe('readTerminalClipboardText', () => {
  test('returns clipboard text including an empty string', async () => {
    const readText = vi.fn(async () => 'pasted text')
    setClipboard({ readText })

    await expect(readTerminalClipboardText()).resolves.toBe('pasted text')
    expect(readText).toHaveBeenCalledTimes(1)

    readText.mockResolvedValueOnce('')
    await expect(readTerminalClipboardText()).resolves.toBe('')
  })

  test.each([
    ['the API is unavailable', undefined],
    [
      'the API rejects',
      async () => {
        throw new Error('clipboard denied')
      },
    ],
  ])('returns null when %s', async (_label, readText) => {
    setClipboard(readText ? { readText } : undefined)
    await expect(readTerminalClipboardText()).resolves.toBeNull()
  })
})
```

- [ ] **Step 2: Run the read tests and verify RED**

Run:

```powershell
bun run test src/web/components/terminal/terminal-clipboard.test.ts -t "readTerminalClipboardText"
```

Expected: FAIL because `readTerminalClipboardText` is not exported.

- [ ] **Step 3: Implement the minimal clipboard reader**

Add before `writeTerminalClipboardText`:

```ts
export async function readTerminalClipboardText(): Promise<string | null> {
  const clipboard = globalThis.navigator?.clipboard
  if (typeof clipboard?.readText !== 'function') return null
  try {
    return await clipboard.readText()
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run the complete clipboard helper suite and verify GREEN**

Run:

```powershell
bun run test src/web/components/terminal/terminal-clipboard.test.ts
```

Expected: all clipboard reader and writer tests pass.

- [ ] **Step 5: Commit the clipboard reader**

```powershell
git add -- src/web/components/terminal/terminal-clipboard.ts src/web/components/terminal/terminal-clipboard.test.ts
git commit -m "feat(terminal): read clipboard text for paste"
```

### Task 2: Route programmatic paste through xterm

**Files:**
- Modify: `src/web/components/terminal/ManagedTerminalSession.test.ts`
- Modify: `src/web/components/terminal/TerminalSessionRegistry.test.ts`
- Modify: `src/web/components/terminal/TerminalSessionProvider.test.tsx`
- Modify: `src/web/components/terminal/terminal-session-view.ts`
- Modify: `src/web/components/terminal/ManagedTerminalSession.ts`
- Modify: `src/web/components/terminal/TerminalSessionRegistry.ts`
- Modify: `src/web/components/terminal/TerminalSessionProvider.tsx`
- Modify: `src/web/components/terminal/types.ts`
- Modify typed fixtures: `src/web/components/terminal/TerminalSlot.test.tsx`, `src/web/components/terminal/TerminalDeepLinkConsumer.test.tsx`, `src/web/components/branch-detail/BranchDetailToolbar.test.tsx`

- [ ] **Step 1: Add failing view/session paste coverage**

Add `paste = vi.fn()` to the test `FakeTerminal`. In the existing renderer-local selection delegation test, execute and assert the desired API:

```ts
session.pasteText('line one\nline two')
expect(term.paste).toHaveBeenCalledWith('line one\nline two')
```

- [ ] **Step 2: Add failing registry and provider paste coverage**

In the registry's renderer-local selection test, add a `pasteText` mock to the managed session, call:

```ts
registry.pasteText(key, 'registry paste')
expect(pasteText).toHaveBeenCalledWith('registry paste')
```

Update the provider context assertion to require both renderer selection read and paste write:

```ts
expect(getContext().selectionText).toBeTypeOf('function')
expect(getContext().pasteText).toBeTypeOf('function')
```

- [ ] **Step 3: Run the facade tests and verify RED**

Run:

```powershell
bun run test src/web/components/terminal/ManagedTerminalSession.test.ts src/web/components/terminal/TerminalSessionRegistry.test.ts src/web/components/terminal/TerminalSessionProvider.test.tsx -t "renderer-local|selection reader"
```

Expected: FAIL because the session, registry, and provider do not expose `pasteText`.

- [ ] **Step 4: Implement the xterm paste command through every facade layer**

Add to `TerminalSessionView` beside `selectionText`:

```ts
pasteText(text: string): void {
  this.term?.paste(text)
}
```

Add to `ManagedTerminalSession`:

```ts
pasteText(text: string): void {
  this.view.pasteText(text)
}
```

Add to `TerminalSessionRegistry`:

```ts
pasteText = (key: string, text: string): void => {
  this.sessions.get(key)?.pasteText(text)
}
```

Add to `TerminalSessionContextValue` beside `selectionText`:

```ts
pasteText: (key: string, text: string) => void
```

Expose it from `TerminalSessionProvider`:

```ts
pasteText: registry.pasteText,
```

Add `pasteText() {}` to the provider's mocked managed session. Add `pasteText: vi.fn()` to the three typed `TerminalSessionContextValue` fixtures listed above.

- [ ] **Step 5: Run the facade tests and typecheck the context contract**

Run:

```powershell
bun run test src/web/components/terminal/ManagedTerminalSession.test.ts src/web/components/terminal/TerminalSessionRegistry.test.ts src/web/components/terminal/TerminalSessionProvider.test.tsx -t "renderer-local|selection reader"
bun run typecheck
```

Expected: focused tests pass and every typed context supplies `pasteText`.

- [ ] **Step 6: Commit the terminal paste facade**

```powershell
git add -- src/web/components/terminal/terminal-session-view.ts src/web/components/terminal/ManagedTerminalSession.ts src/web/components/terminal/ManagedTerminalSession.test.ts src/web/components/terminal/TerminalSessionRegistry.ts src/web/components/terminal/TerminalSessionRegistry.test.ts src/web/components/terminal/TerminalSessionProvider.tsx src/web/components/terminal/TerminalSessionProvider.test.tsx src/web/components/terminal/types.ts src/web/components/terminal/TerminalSlot.test.tsx src/web/components/terminal/TerminalDeepLinkConsumer.test.tsx src/web/components/branch-detail/BranchDetailToolbar.test.tsx
git commit -m "feat(terminal): route text paste through xterm"
```

### Task 3: Add Paste to the desktop terminal context menu

**Files:**
- Modify: `src/web/components/terminal/TerminalSlot.test.tsx:24-266,3403-3436`
- Modify: `src/web/components/terminal/TerminalSlot.tsx:53,145-222,529-550,942-952`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`

- [ ] **Step 1: Add failing controller menu and successful Paste tests**

Extend the clipboard mock:

```ts
const clipboardMocks = vi.hoisted(() => ({
  readTerminalClipboardText: vi.fn(async (): Promise<string | null> => ''),
  writeTerminalClipboardText: vi.fn(async () => true),
}))
```

Expose it in the module mock and reset it to `''` in `afterEach`.

Replace the current empty-controller-selection exclusion test with:

```tsx
test('opens Paste for a controlling desktop terminal without a selection', async () => {
  clipboardMocks.readTerminalClipboardText.mockResolvedValue('echo pasted')
  const pasteText = vi.fn()
  const focusTerminal = vi.fn()
  const { container, root } = await renderTerminalSlotFixture('controller', {
    selectionText: vi.fn(() => ''),
    pasteText,
    focusTerminal,
  })

  try {
    const host = container.querySelector('.goblin-terminal-slot__host')
    await act(async () => {
      host?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }))
      await Promise.resolve()
    })
    const items = [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')]
    expect(items.map((item) => item.textContent)).toEqual(['menu.edit.paste'])

    await act(async () => {
      items[0]?.click()
      await Promise.resolve()
    })

    expect(clipboardMocks.readTerminalClipboardText).toHaveBeenCalledTimes(1)
    expect(pasteText).toHaveBeenCalledWith('terminal-1', 'echo pasted')
    expect(focusTerminal).toHaveBeenCalledWith('terminal-1')
  } finally {
    await act(async () => root.unmount())
    container.remove()
  }
})
```

Add a selected-controller test asserting menu order is `menu.edit.copy`, then `menu.edit.paste`.

- [ ] **Step 2: Add failing authority and failure-path tests**

Add table-driven viewer/unowned tests proving a selection exposes only Copy, plus one unowned/no-selection test proving no menu opens.

Add a clipboard failure test:

```tsx
clipboardMocks.readTerminalClipboardText.mockResolvedValue(null)
i18nMocks.translations['terminal.clipboard-paste-failed'] = 'Paste failed'
```

Open the controller menu, select Paste, and assert `toast.error('Paste failed')`; `pasteText` and `focusTerminal` remain uncalled. Add an empty-text case asserting no toast and no terminal call.

- [ ] **Step 3: Run context-menu tests and verify RED**

Run:

```powershell
bun run test src/web/components/terminal/TerminalSlot.test.tsx -t "desktop terminal|Paste|paste"
```

Expected: new controller, authority, and failure-path tests fail because the menu still requires a selection and has no Paste action.

- [ ] **Step 4: Implement captured desktop context-menu state and Paste behavior**

Import both clipboard helpers:

```ts
import {
  readTerminalClipboardText,
  writeTerminalClipboardText,
} from '#/web/components/terminal/terminal-clipboard.ts'
```

Define local state shape:

```ts
interface DesktopTerminalContextMenuState {
  key: string
  selectionText: string
}
```

Replace `desktopSelectionCopyText` with:

```ts
const [desktopContextMenu, setDesktopContextMenu] = useState<DesktopTerminalContextMenuState | null>(null)
```

Destructure `pasteText` from the terminal context. Clear menu state when mobile classification, selected key, or attachment role changes.

Replace the open handler with:

```ts
const handleDesktopContextMenuOpenChange = useCallback(
  (open: boolean) => {
    if (!open) {
      setDesktopContextMenu(null)
      return
    }
    if (isMobile || !key) return
    const capturedSelectionText = selectionText(key)
    if (!capturedSelectionText && !isController) return
    setDesktopContextMenu({ key, selectionText: capturedSelectionText })
  },
  [isController, isMobile, key, selectionText],
)
```

Update Copy to use `desktopContextMenu.selectionText`. Add Paste:

```ts
const pasteDesktopTerminalText = useCallback(async () => {
  const action = desktopContextMenu
  if (!action || !isController || action.key !== key) return
  const text = await readTerminalClipboardText()
  if (text === null) {
    toast.error(t('terminal.clipboard-paste-failed'))
    return
  }
  if (!text) return
  pasteText(action.key, text)
  focusTerminal(action.key)
}, [desktopContextMenu, focusTerminal, isController, key, pasteText, t])
```

Render menu items from the visibility matrix:

```tsx
<ContextMenu open={desktopContextMenu !== null} onOpenChange={handleDesktopContextMenuOpenChange}>
  <ContextMenuTrigger asChild>{terminalHost}</ContextMenuTrigger>
  {desktopContextMenu !== null && (
    <ContextMenuContent>
      {desktopContextMenu.selectionText && (
        <ContextMenuItem onSelect={() => void copyDesktopTerminalSelection()}>
          {t('menu.edit.copy')}
        </ContextMenuItem>
      )}
      {isController && desktopContextMenu.key === key && (
        <ContextMenuItem onSelect={() => void pasteDesktopTerminalText()}>
          {t('menu.edit.paste')}
        </ContextMenuItem>
      )}
    </ContextMenuContent>
  )}
</ContextMenu>
```

- [ ] **Step 5: Add localized clipboard-paste failure copy**

Add `terminal.clipboard-paste-failed` beside `terminal.selection-copy-failed` in every dictionary:

```ts
// en.ts
'terminal.clipboard-paste-failed': 'Could not read clipboard text. Try the keyboard paste shortcut.',

// zh.ts
'terminal.clipboard-paste-failed': '无法读取剪贴板文本，请尝试使用键盘粘贴快捷键。',

// ja.ts
'terminal.clipboard-paste-failed': 'クリップボードのテキストを読み取れませんでした。キーボードの貼り付けショートカットをお試しください。',

// ko.ts
'terminal.clipboard-paste-failed': '클립보드 텍스트를 읽을 수 없습니다. 키보드 붙여넣기 단축키를 사용해 보세요.',
```

- [ ] **Step 6: Run the complete TerminalSlot and dictionary suites**

Run:

```powershell
bun run test src/web/components/terminal/TerminalSlot.test.tsx src/shared/i18n/dictionaries.test.ts
```

Expected: all desktop context-menu, mobile selection, keyboard/binary paste, and dictionary parity tests pass.

- [ ] **Step 7: Commit the context-menu behavior**

```powershell
git add -- src/web/components/terminal/TerminalSlot.tsx src/web/components/terminal/TerminalSlot.test.tsx src/shared/i18n/en.ts src/shared/i18n/zh.ts src/shared/i18n/ja.ts src/shared/i18n/ko.ts
git commit -m "feat(terminal): paste text from context menu"
```

### Task 4: Verify repository-wide contracts

**Files:**
- Verify all source, test, design, and plan files changed by Tasks 1-3.

- [ ] **Step 1: Run focused terminal suites**

```powershell
bun run test src/web/components/terminal/terminal-clipboard.test.ts src/web/components/terminal/ManagedTerminalSession.test.ts src/web/components/terminal/TerminalSessionRegistry.test.ts src/web/components/terminal/TerminalSessionProvider.test.tsx src/web/components/terminal/TerminalSlot.test.tsx src/shared/i18n/dictionaries.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 2: Run type checking**

```powershell
bun run typecheck
```

Expected: all main, Web, and test TypeScript projects pass.

- [ ] **Step 3: Run the complete test suite**

```powershell
bun run test
```

Expected: exit code 0. If the known Windows environment reproduces its pre-existing broad failures or Electron download hang, capture the output separately and do not attribute it to this feature when the same baseline signature remains.

- [ ] **Step 4: Run the architecture guard**

```powershell
bun run check:architecture
```

Expected: `[architecture] import boundaries passed`.

- [ ] **Step 5: Inspect final diff and branch state**

```powershell
git diff --check HEAD~4..HEAD
git status --short
git log -5 --oneline --decorate
```

Expected: no whitespace errors, a clean worktree, and separate design, plan, clipboard, facade, and UI commits at the branch tip.

## Plan Self-Review

- Spec coverage: text-only scope, controller authority, no-selection Paste, Copy preservation, clipboard failure, empty text, xterm paste semantics, Mobile Web exclusion, and unchanged binary paste are each mapped to tests and implementation steps.
- Architecture: local UI state stays in `TerminalSlot`; clipboard reading stays in the terminal feature; the existing terminal renderer facade is extended narrowly; no Electron, server, persistence, or realtime layer is added.
- Type consistency: every task uses the same `pasteText(key, text)` context signature and `readTerminalClipboardText(): Promise<string | null>` result contract.
- Placeholder scan: the plan contains no deferred implementation, incomplete code path, or unspecified acceptance test.
