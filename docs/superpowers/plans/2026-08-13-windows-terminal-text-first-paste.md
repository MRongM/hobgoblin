# Windows Terminal Text-First Paste Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Windows 11 `Ctrl+V` enter ordinary clipboard text into the internal terminal before considering file or image paste, so Codex does not receive a raw image-paste shortcut for text content.

**Architecture:** Electron main registers the standard non-macOS edit accelerators so `Ctrl+V` becomes a browser paste event instead of PTY input. `TerminalSlot` keeps content routing local: non-empty `text/plain` is left to xterm, while empty-text events inspect files/items and use the existing binary/file-path flow. No server, PTY, IPC, or Codex changes are required.

**Tech Stack:** Electron 42 menu roles, React 19, xterm.js 6, TypeScript 6 strip-only mode, Vitest 4, Bun 1.3.

---

## Current Worktree Constraints

The worktree is intentionally dirty with unrelated user changes. The relevant menu accelerator candidate and tests already exist in `src/main/menu.ts` and `src/main/menu.test.ts`; verify and preserve them instead of deleting working code merely to manufacture a red test. `TerminalSlot.tsx` and its test file also contain unrelated autofocus, selection-copy, and terminal work, so never stage those files wholesale. Use selective hunk staging and inspect the staged diff before every commit.

## File Structure

- Modify `src/main/menu.ts`: own platform-specific native edit accelerators.
- Modify `src/main/menu.test.ts`: prove macOS omits explicit accelerators and Windows/Linux register the standard ones.
- Modify `src/web/components/terminal/TerminalSlot.tsx`: keep text-first paste routing and remove the Windows-only clipboard-item probe exclusion.
- Modify `src/web/components/terminal/TerminalSlot.test.tsx`: prove Windows image fallback, mixed-content text priority, whitespace text priority, and empty clipboard behavior.
- Reference `docs/superpowers/specs/2026-08-13-windows-terminal-text-first-paste-design.md`: authoritative approved behavior.

### Task 1: Preserve and verify the native paste accelerator

**Files:**
- Modify: `src/main/menu.ts:96,174-204`
- Test: `src/main/menu.test.ts:311-387`

- [ ] **Step 1: Confirm the existing non-macOS regression test is present**

Keep the existing macOS assertions in `includes standard edit roles and full screen in the menu`, including the all-`undefined` accelerator array. Keep this non-macOS test exactly:

```ts
test('registers standard edit accelerators outside macOS', async () => {
  const { buildAppMenu, platform } = await import('#/main/menu.ts')
  vi.mocked(platform.isMacOS).mockReturnValue(false)

  buildAppMenu()

  const editMenu = mocks.template.find((entry) => entry.label === 'menu.edit')
  expect(editMenu?.submenu?.map((entry: any) => entry.role)).toEqual([
    'undo',
    'redo',
    undefined,
    'cut',
    'copy',
    'paste',
    'pasteAndMatchStyle',
    'delete',
    'selectAll',
  ])
  expect(editMenu?.submenu?.map((entry: any) => entry.accelerator)).toEqual([
    'CmdOrCtrl+Z',
    'Ctrl+Y',
    undefined,
    'CmdOrCtrl+X',
    'CmdOrCtrl+C',
    'CmdOrCtrl+V',
    'CmdOrCtrl+Shift+V',
    undefined,
    'CmdOrCtrl+A',
  ])
})
```

- [ ] **Step 2: Confirm the existing menu implementation matches the approved platform policy**

`createAppMenuTemplate` must call `createEditMenu(state.isMac)`. The edit-menu implementation must remain:

```ts
function createEditMenu(isMac: boolean): MenuItemConstructorOptions {
  const editAccelerators = isMac
    ? {}
    : ({
        undo: 'CmdOrCtrl+Z',
        redo: 'Ctrl+Y',
        cut: 'CmdOrCtrl+X',
        copy: 'CmdOrCtrl+C',
        paste: 'CmdOrCtrl+V',
        pasteAndMatchStyle: 'CmdOrCtrl+Shift+V',
        selectAll: 'CmdOrCtrl+A',
      } as const)
  return {
    label: t('menu.edit'),
    submenu: [
      { role: 'undo', label: t('menu.edit.undo'), accelerator: editAccelerators.undo },
      { role: 'redo', label: t('menu.edit.redo'), accelerator: editAccelerators.redo },
      separator(),
      { role: 'cut', label: t('menu.edit.cut'), accelerator: editAccelerators.cut },
      { role: 'copy', label: t('menu.edit.copy'), accelerator: editAccelerators.copy },
      { role: 'paste', label: t('menu.edit.paste'), accelerator: editAccelerators.paste },
      {
        role: 'pasteAndMatchStyle',
        label: t('menu.edit.paste-match-style'),
        accelerator: editAccelerators.pasteAndMatchStyle,
      },
      { role: 'delete', label: t('menu.edit.delete') },
      { role: 'selectAll', label: t('menu.edit.select-all'), accelerator: editAccelerators.selectAll },
    ],
  }
}
```

- [ ] **Step 3: Run the menu regression tests**

Run:

```sh
bun run test src/main/menu.test.ts -t "standard edit"
```

Expected: both macOS role coverage and non-macOS accelerator coverage pass. This candidate predates this plan, so a passing first run verifies aligned pre-existing work rather than a new TDD cycle.

- [ ] **Step 4: Commit only the menu change**

```sh
git add -- src/main/menu.ts src/main/menu.test.ts
git diff --cached --check
git diff --cached -- src/main/menu.ts src/main/menu.test.ts
git commit -m "fix(windows): register standard edit accelerators"
```

Expected staged diff: only `createEditMenu(state.isMac)`, the edit accelerator map/usages, and their two platform tests.

### Task 2: Restore Windows file/image fallback with a failing test

**Files:**
- Modify: `src/web/components/terminal/TerminalSlot.test.tsx:2644-2700`
- Modify: `src/web/components/terminal/TerminalSlot.tsx:639-652,1149-1156`

- [ ] **Step 1: Replace the contrary Windows probe test with the desired regression**

Replace `does not probe unavailable clipboard image items during terminal paste` with:

```tsx
test('reads a Windows clipboard image item after finding no text', async () => {
  const platformSpy = vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue('Win32')
  appShellMocks.saveClipboardBinaryFilesFromPaste.mockResolvedValue({
    ok: true,
    paths: ['C:/project/tmp/pasted-image.png'],
  })
  const writeInput = vi.fn()
  const file = new File([new Uint8Array([1, 2, 3])], 'image.png', { type: 'image/png' })
  const getAsFile = vi.fn(() => file)
  const { container, root } = await renderTerminalSlotFixture('controller', { writeInput })

  try {
    const host = container.querySelector('.goblin-terminal-slot__host')
    expect(host).toBeInstanceOf(HTMLDivElement)
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', {
      value: {
        getData: () => '',
        files: [],
        items: [{ kind: 'file', type: 'image/png', getAsFile }],
      },
    })

    await act(async () => {
      host?.dispatchEvent(event)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(event.defaultPrevented).toBe(true)
    expect(getAsFile).toHaveBeenCalledTimes(1)
    expect(appShellMocks.saveClipboardBinaryFilesFromPaste).toHaveBeenCalledWith({
      worktreePath: '/worktree',
      temporaryFilesDirectory: '',
      files: [{ name: 'image.png', type: 'image/png', bytes: expect.any(ArrayBuffer) }],
    })
    expect(writeInput).toHaveBeenCalledWith('terminal-1', 'C:/project/tmp/pasted-image.png')
  } finally {
    platformSpy.mockRestore()
    await act(async () => root.unmount())
    container.remove()
  }
})
```

- [ ] **Step 2: Run the new test and verify RED**

Run:

```sh
bun run test src/web/components/terminal/TerminalSlot.test.tsx -t "reads a Windows clipboard image item after finding no text"
```

Expected: FAIL because `getAsFile` is called zero times. The current `allowItemProbe: isMacPlatform` gate incorrectly disables the fallback on Windows.

- [ ] **Step 3: Remove platform-specific binary-item suppression**

Keep the text check first, then make file inspection content-based:

```tsx
const handlePasteCapture = useCallback(
  (event: ClipboardEvent<HTMLDivElement>) => {
    if (!key || !isController) return
    if (event.clipboardData.getData('text/plain').length > 0) return

    const files = binaryPasteFiles(event.clipboardData)
    event.preventDefault()
    event.stopPropagation()
    void resolvePastedFilePaths(files, { repoRoot, worktreePath, temporaryFilesDirectory }).then((paths) => {
      if (paths.length === 0) return
      writeInput(key, paths.map(shellEscapePath).join(' '))
    })
  },
  [isController, key, repoRoot, temporaryFilesDirectory, worktreePath, writeInput],
)
```

Restore the platform-neutral helper:

```ts
function binaryPasteFiles(data: DataTransfer): File[] {
  const directFiles = Array.from(data.files).filter((file) => file.size > 0)
  if (directFiles.length > 0) return directFiles
  return Array.from(data.items)
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((file): file is File => !!file && file.size > 0)
}
```

- [ ] **Step 4: Run the Windows test and verify GREEN**

Run:

```sh
bun run test src/web/components/terminal/TerminalSlot.test.tsx -t "reads a Windows clipboard image item after finding no text"
```

Expected: PASS; the item is read, saved, and its path is written once.

- [ ] **Step 5: Verify existing direct-file and macOS item paths remain green**

Run:

```sh
bun run test src/web/components/terminal/TerminalSlot.test.tsx -t "saves binary paste files|macOS terminal paste"
```

Expected: both tests pass.

### Task 3: Lock text-first precedence and empty clipboard behavior

**Files:**
- Modify: `src/web/components/terminal/TerminalSlot.test.tsx` immediately before the binary paste tests near line 2581

- [ ] **Step 1: Add text and mixed-content characterization coverage**

Add this table-driven component test:

```tsx
test.each(['copied text', ' \n'])(
  'leaves Windows terminal paste to xterm when text/plain is %j',
  async (clipboardText) => {
    const platformSpy = vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue('Win32')
    const writeInput = vi.fn()
    const getAsFile = vi.fn(
      () => new File([new Uint8Array([1])], 'image.png', { type: 'image/png' }),
    )
    const getData = vi.fn((format: string) => (format === 'text/plain' ? clipboardText : ''))
    const { container, root } = await renderTerminalSlotFixture('controller', { writeInput })

    try {
      const host = container.querySelector('.goblin-terminal-slot__host')
      expect(host).toBeInstanceOf(HTMLDivElement)
      const event = new Event('paste', { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'clipboardData', {
        value: {
          getData,
          files: [],
          items: [{ kind: 'file', type: 'image/png', getAsFile }],
        },
      })

      await act(async () => {
        host?.dispatchEvent(event)
        await Promise.resolve()
      })

      expect(getData).toHaveBeenCalledWith('text/plain')
      expect(event.defaultPrevented).toBe(false)
      expect(getAsFile).not.toHaveBeenCalled()
      expect(appShellMocks.readSystemClipboardFilePaths).not.toHaveBeenCalled()
      expect(appShellMocks.saveClipboardBinaryFilesFromPaste).not.toHaveBeenCalled()
      expect(writeInput).not.toHaveBeenCalled()
    } finally {
      platformSpy.mockRestore()
      await act(async () => root.unmount())
      container.remove()
    }
  },
)
```

This is characterization coverage for the text-first guard that already existed before the accelerator fix. It is expected to pass immediately; do not alter production code to force an artificial failure.

- [ ] **Step 2: Add empty clipboard coverage**

Add:

```tsx
test('swallows an empty Windows paste without writing Ctrl+V into the terminal', async () => {
  const platformSpy = vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue('Win32')
  const writeInput = vi.fn()
  const { container, root } = await renderTerminalSlotFixture('controller', { writeInput })

  try {
    const host = container.querySelector('.goblin-terminal-slot__host')
    expect(host).toBeInstanceOf(HTMLDivElement)
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', {
      value: { getData: () => '', files: [], items: [] },
    })

    await act(async () => {
      host?.dispatchEvent(event)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(event.defaultPrevented).toBe(true)
    expect(appShellMocks.readSystemClipboardFilePaths).toHaveBeenCalledTimes(1)
    expect(appShellMocks.saveClipboardBinaryFilesFromPaste).not.toHaveBeenCalled()
    expect(writeInput).not.toHaveBeenCalled()
  } finally {
    platformSpy.mockRestore()
    await act(async () => root.unmount())
    container.remove()
  }
})
```

- [ ] **Step 3: Run all paste precedence tests**

Run:

```sh
bun run test src/web/components/terminal/TerminalSlot.test.tsx -t "text/plain|Windows clipboard image item|empty Windows paste|saves binary paste files|macOS terminal paste"
```

Expected: all selected tests pass. Text and whitespace do not prevent the event or inspect binary data; binary and empty events are prevented and never write raw `Ctrl+V`.

- [ ] **Step 4: Stage only the new paste-test hunks**

Because this test file contains unrelated user edits, stage interactively:

```sh
git add -p -- src/web/components/terminal/TerminalSlot.test.tsx
git diff --cached --check
git diff --cached -- src/web/components/terminal/TerminalSlot.test.tsx
```

Stage only the Windows image-item replacement plus the text-first and empty-paste tests. Do not stage autofocus or `Ctrl+C` selection-copy tests. `TerminalSlot.tsx` should not need staging for this task because removing the uncommitted Windows-only gate restores its paste code to the committed platform-neutral implementation.

- [ ] **Step 5: Commit the paste regressions**

```sh
git commit -m "test(terminal): cover text-first Windows paste"
```

### Task 4: Verify the complete fix and preserve unrelated work

**Files:**
- Verify: `src/main/menu.ts`
- Verify: `src/main/menu.test.ts`
- Verify: `src/web/components/terminal/TerminalSlot.tsx`
- Verify: `src/web/components/terminal/TerminalSlot.test.tsx`

- [ ] **Step 1: Run the focused feature suite**

```sh
bun run test src/main/menu.test.ts src/web/components/terminal/TerminalSlot.test.tsx
```

Expected: both files pass with zero failures.

- [ ] **Step 2: Run type checking**

```sh
bun run typecheck
```

Expected: exit code 0 with no TypeScript errors.

- [ ] **Step 3: Run the full test suite**

```sh
bun run test
```

Expected: exit code 0 with zero failed test files and zero failed tests.

- [ ] **Step 4: Run the architecture guard**

```sh
bun run check:architecture
```

Expected: exit code 0; no forbidden main/web/server/shared imports.

- [ ] **Step 5: Audit the final diff and commit scope**

```sh
git status --short
git diff --check
git show -2 --stat --oneline
```

Expected: the feature commits contain only the menu accelerator changes and paste regression tests. All unrelated dirty worktree changes remain present and uncommitted.

- [ ] **Step 6: Perform Windows 11 acceptance when the interactive app is available**

Start Codex in Hobgoblin's internal terminal. Verify ordinary text, multiline text, whitespace-only text, a real image with no text representation, and mixed text/image content against the five acceptance cases in the approved design. Record any environment limitation instead of claiming manual acceptance without observing it.
