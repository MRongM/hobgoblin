# Cross-Platform Terminal Selection Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give macOS, Windows, and Linux desktop-class internal terminals the same selection-aware right-click Copy menu in Electron and desktop Web while preserving the mobile long-press interaction.

**Architecture:** Keep the interaction entirely in the existing React terminal slice. `TerminalSlot` reads selection text through the existing terminal facade, owns ephemeral menu state, and uses the existing Radix context menu and clipboard helper; only the Windows platform gate is removed, while the independent Windows native-image paste gate remains intact.

**Tech Stack:** React 19, xterm.js 6, Radix/shadcn context menu, TypeScript 6 strip-only mode, Vitest 4, Bun 1.3.

---

## Scope and File Structure

- Modify `src/web/components/terminal/TerminalSlot.test.tsx`: replace the macOS exclusion assertion with cross-platform desktop acceptance coverage; retain empty-selection, failure, selection-preservation, and mobile behavior coverage.
- Modify `src/web/components/terminal/TerminalSlot.tsx`: make the existing terminal selection context menu depend on desktop/mobile presentation rather than operating system; do not change the Windows-only native image-paste fallback.

No new files, state layers, IPC, server routes, protocol messages, persistence, or realtime paths are needed.

## Architecture Grill

The repository-declared `.claude/skills/grill-with-docs/SKILL.md` is absent from this worktree and the checked sibling/global locations. The plan was therefore stress-tested directly against every app-level design document named by `AGENTS.md`:

- `docs/README.md` routes this interaction to the UI, architecture, layering, state, renderer, and realtime guidance checked below.
- `docs/ui-conventions.md` favors the existing shadcn/Radix primitive and localized sentence-case action; no new copy is introduced.
- `docs/arch.md` keeps native-only behavior in `src/main`; this interaction is not native-only, so it remains in `src/web`.
- `docs/layering.md` says small component interactions and short-lived pending/error state stay local; no new read, write, source, or runtime-facade layer is justified.
- `docs/state-sync.md` classifies menu open state and captured selection as local, ephemeral state; neither is synchronized or persisted.
- `docs/renderer-model.md` requires Electron renderers to behave as specialized browser clients; removing the OS gate improves Electron/Web convergence.
- `docs/realtime.md` requires new realtime paths only for shared runtime behavior; this renderer-local copy interaction adds none.

The main regression risk is accidentally broadening the Windows-only screenshot fallback when removing selection-menu platform checks. The implementation must retain `isWindowsPlatform` for `allowNativeClipboardImage` and its paste callback dependency.

### Task 1: Make the desktop selection menu platform-neutral

**Files:**
- Modify: `src/web/components/terminal/TerminalSlot.test.tsx:141-255`
- Modify: `src/web/components/terminal/TerminalSlot.tsx:220-222,529-550,942-956`

- [ ] **Step 1: Replace the macOS exclusion test with failing macOS and Linux acceptance tests**

Keep the existing Windows success test. Replace `does not add the Windows terminal selection context menu on macOS` with a table-driven test that proves both additional desktop platforms open and execute the same action:

```tsx
test.each([
  { platform: 'MacIntel', label: 'macOS' },
  { platform: 'Linux x86_64', label: 'Linux desktop Web' },
])('opens the desktop terminal selection context menu on $label', async ({ platform }) => {
  const platformSpy = vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue(platform)
  const selectionText = vi.fn(() => 'selected output')
  const clearMobileSelection = vi.fn()
  const { container, root } = await renderTerminalSlotFixture('viewer', { selectionText, clearMobileSelection })

  try {
    clearMobileSelection.mockClear()
    const host = container.querySelector('.goblin-terminal-slot__host')
    await act(async () => {
      host?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }))
      await Promise.resolve()
    })

    const item = [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((candidate) =>
      candidate.textContent?.includes('menu.edit.copy'),
    )
    expect(item).toBeInstanceOf(HTMLElement)

    await act(async () => {
      item?.click()
      await Promise.resolve()
    })

    expect(clipboardMocks.writeTerminalClipboardText).toHaveBeenCalledWith('selected output')
    expect(clearMobileSelection).not.toHaveBeenCalled()
  } finally {
    platformSpy.mockRestore()
    await act(async () => root.unmount())
    container.remove()
  }
})
```

- [ ] **Step 2: Run the new tests and verify RED**

Run:

```powershell
bun run test src/web/components/terminal/TerminalSlot.test.tsx -t "opens the desktop terminal selection context menu on"
```

Expected: both table cases fail because the menu item is absent under the current `isWindowsPlatform && !isMobile` gate.

- [ ] **Step 3: Remove the operating-system gate only from selection-menu behavior**

In `TerminalSlot.tsx`, keep `isWindowsPlatform` for the native clipboard-image paste path. Make only these selection-menu changes:

```tsx
useEffect(() => {
  setDesktopSelectionCopyText(null)
}, [isMobile, key])
```

```tsx
const handleDesktopContextMenuOpenChange = useCallback(
  (open: boolean) => {
    if (!open) {
      setDesktopSelectionCopyText(null)
      return
    }
    if (isMobile || !key) return
    const text = selectionText(key)
    setDesktopSelectionCopyText(text || null)
  },
  [isMobile, key, selectionText],
)
```

```tsx
const terminalHostSurface =
  !isMobile ? (
    <ContextMenu open={desktopSelectionCopyText !== null} onOpenChange={handleDesktopContextMenuOpenChange}>
      <ContextMenuTrigger asChild>{terminalHost}</ContextMenuTrigger>
      {desktopSelectionCopyText !== null && (
        <ContextMenuContent>
          <ContextMenuItem onSelect={() => void copyDesktopTerminalSelection()}>
            {t('menu.edit.copy')}
          </ContextMenuItem>
        </ContextMenuContent>
      )}
    </ContextMenu>
  ) : (
    terminalHost
  )
```

Do not alter either of these Windows screenshot guards:

```tsx
allowNativeClipboardImage: isWindowsPlatform
```

```tsx
[isController, isWindowsPlatform, key, repoRoot, temporaryFilesDirectory, worktreePath, writeInput]
```

- [ ] **Step 4: Run focused selection tests and verify GREEN**

Run:

```powershell
bun run test src/web/components/terminal/TerminalSlot.test.tsx -t "terminal selection context menu|opens the desktop terminal selection context menu on"
```

Expected: Windows success, empty-selection, failure-preservation, macOS, and Linux cases pass.

- [ ] **Step 5: Run the complete terminal slot suite**

Run:

```powershell
bun run test src/web/components/terminal/TerminalSlot.test.tsx
```

Expected: all `TerminalSlot` tests pass, including existing mobile long-press selection and Windows native image-paste regressions.

- [ ] **Step 6: Commit the behavior change**

```powershell
git add -- src/web/components/terminal/TerminalSlot.tsx src/web/components/terminal/TerminalSlot.test.tsx
git commit -m "feat(terminal): copy desktop selections across platforms"
```

### Task 2: Verify repository-wide contracts

**Files:**
- Verify: `src/web/components/terminal/TerminalSlot.tsx`
- Verify: `src/web/components/terminal/TerminalSlot.test.tsx`
- Verify: `docs/superpowers/specs/2026-08-30-cross-platform-terminal-selection-copy-design.md`

- [ ] **Step 1: Run type checking**

Run:

```powershell
bun run typecheck
```

Expected: exit code 0 with no TypeScript errors.

- [ ] **Step 2: Run the complete test suite**

Run:

```powershell
bun run test
```

Expected: exit code 0 with no failed tests.

- [ ] **Step 3: Run the architecture guard**

Run:

```powershell
bun run check:architecture
```

Expected: exit code 0 with all import boundaries intact.

- [ ] **Step 4: Inspect the final diff and repository state**

Run:

```powershell
git diff --check HEAD~2..HEAD
git status --short
git log -3 --oneline --decorate
```

Expected: no whitespace errors, no uncommitted feature changes, and separate design, plan, and implementation commits at the branch tip.

## Plan Self-Review

- Spec coverage: desktop macOS/Windows/Linux, Electron/Web convergence, empty selection, copy failure, selection preservation, and unchanged mobile behavior are mapped to Task 1 tests and implementation.
- Scope boundary: Windows native image paste retains its platform gate; server, Electron main, terminal protocol, and state synchronization remain untouched.
- Type consistency: the plan uses the existing `selectionText`, `desktopSelectionCopyText`, `writeTerminalClipboardText`, and `isMobile` APIs without introducing new signatures.
- Placeholder scan: the plan contains no deferred implementation or unspecified test steps.
