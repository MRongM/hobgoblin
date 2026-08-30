# Windows Internal Terminal Copy And Image Paste Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Windows users copy an internal-terminal selection from a right-click menu and paste a native clipboard screenshot as a temporary PNG path without changing macOS behavior.

**Architecture:** Keep selection UI and paste precedence in the React terminal slice. Add a bounded Electron-main clipboard-image reader behind the existing trusted shell bridge, then feed its PNG payload into the existing local-save or remote-upload path. Terminal protocol, PTY, server state, and realtime remain unchanged.

**Tech Stack:** Electron 42 clipboard/IPC, React 19, xterm.js 6, Radix context menu, TypeScript 6 strip-only mode, Vitest 4, Bun 1.3.

---

## Scope And File Structure

This is one clipboard feature slice rather than two independent subsystems: both changes begin at the internal-terminal renderer interaction boundary.

- Create `src/main/clipboard-image.ts`: read one native clipboard image as a bounded PNG payload.
- Create `src/main/clipboard-image.test.ts`: isolate empty, valid, oversized, and unreadable native clipboard behavior.
- Modify `src/shared/ipc-channels.ts`: declare the native clipboard-image IPC channel.
- Modify `src/shared/bootstrap.ts`: advertise the Electron-only `clipboard-image` capability.
- Modify `src/main/shell-bridge.ts` and `src/main/shell-bridge.test.ts`: expose the reader only to trusted renderer senders.
- Modify `src/preload/preload.cjs` and `src/main/preload.test.ts`: forward the new shell operation.
- Modify `src/web/renderer-bridge-types.ts` and `src/web/vite-env.d.ts`: type the optional native shell method.
- Modify `src/web/app-shell-client.ts` and `src/web/app-shell-client.test.ts`: return a payload or `null` without exposing Electron to the renderer.
- Modify `src/web/components/terminal/terminal-session-view.ts`, `ManagedTerminalSession.ts`, `TerminalSessionRegistry.ts`, `TerminalSessionProvider.tsx`, and `types.ts`: expose current xterm selection text through the terminal facade.
- Modify the matching terminal session/registry/provider tests and test fixtures: cover and supply the new facade method.
- Modify `src/web/components/terminal/TerminalSlot.tsx` and `TerminalSlot.test.tsx`: add the Windows-only selection menu and native image fallback.

Reference: `docs/superpowers/specs/2026-08-30-windows-terminal-copy-image-paste-design.md`.

### Task 1: Add The Bounded Native Clipboard Image Reader

**Files:**
- Create: `src/main/clipboard-image.ts`
- Create: `src/main/clipboard-image.test.ts`
- Reference: `src/shared/clipboard-binary-temp-files.ts`

- [ ] **Step 1: Write failing native reader tests**

Create tests that mock `electron.clipboard.readImage()` and prove the function returns `null` for an empty image, returns a copied PNG `ArrayBuffer` for a valid image, rejects a PNG over a supplied test limit, and catches `toPNG()` failures:

```ts
import { beforeEach, describe, expect, test, vi } from 'vitest'

const readImage = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({ clipboard: { readImage } }))

import { readClipboardImageFromSystem } from '#/main/clipboard-image.ts'

describe('readClipboardImageFromSystem', () => {
  beforeEach(() => vi.clearAllMocks())

  test('returns a PNG payload for a non-empty clipboard image', () => {
    readImage.mockReturnValue({ isEmpty: () => false, toPNG: () => Buffer.from([1, 2, 3]) })

    const result = readClipboardImageFromSystem(10)

    expect(result).toMatchObject({ name: 'clipboard.png', type: 'image/png' })
    expect(Array.from(new Uint8Array(result!.bytes))).toEqual([1, 2, 3])
  })

  test.each([
    { image: { isEmpty: () => true, toPNG: vi.fn() }, limit: 10 },
    { image: { isEmpty: () => false, toPNG: () => Buffer.from([1, 2, 3]) }, limit: 2 },
  ])('returns null for empty or oversized clipboard images', ({ image, limit }) => {
    readImage.mockReturnValue(image)
    expect(readClipboardImageFromSystem(limit)).toBeNull()
  })

  test('returns null when native PNG conversion fails', () => {
    readImage.mockReturnValue({
      isEmpty: () => false,
      toPNG: () => {
        throw new Error('conversion failed')
      },
    })
    expect(readClipboardImageFromSystem(10)).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```sh
bun run test src/main/clipboard-image.test.ts
```

Expected: FAIL because `src/main/clipboard-image.ts` does not exist.

- [ ] **Step 3: Implement the minimal native reader**

Create a main-only module that imports Electron and reuses the binary clipboard size limit:

```ts
import { clipboard } from 'electron'
import {
  MAX_CLIPBOARD_BINARY_FILE_BYTES,
  type ClipboardBinaryFilePayload,
} from '#/shared/clipboard-binary-temp-files.ts'

export function readClipboardImageFromSystem(
  maxBytes = MAX_CLIPBOARD_BINARY_FILE_BYTES,
): ClipboardBinaryFilePayload | null {
  try {
    const image = clipboard.readImage()
    if (image.isEmpty()) return null
    const png = image.toPNG()
    if (png.byteLength === 0 || png.byteLength > maxBytes) return null
    return {
      name: 'clipboard.png',
      type: 'image/png',
      bytes: Uint8Array.from(png).buffer,
    }
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run the test and verify GREEN**

Run `bun run test src/main/clipboard-image.test.ts`.

Expected: PASS.

- [ ] **Step 5: Commit the reader**

```sh
git add -- src/main/clipboard-image.ts src/main/clipboard-image.test.ts
git diff --cached --check
git commit -m "feat(windows): read native clipboard images"
```

### Task 2: Wire The Trusted Native Shell Capability

**Files:**
- Modify: `src/shared/ipc-channels.ts`
- Modify: `src/shared/bootstrap.ts`
- Modify: `src/main/shell-bridge.ts`
- Modify: `src/main/shell-bridge.test.ts`
- Modify: `src/preload/preload.cjs`
- Modify: `src/main/preload.test.ts`
- Modify: `src/web/renderer-bridge-types.ts`
- Modify: `src/web/vite-env.d.ts`
- Modify: `src/web/app-shell-client.ts`
- Modify: `src/web/app-shell-client.test.ts`

- [ ] **Step 1: Add failing bridge and client tests**

Add `SHELL_READ_CLIPBOARD_IMAGE_CHANNEL` expectations to the shell bridge and preload suites. In `shell-bridge.test.ts`, mock `readClipboardImageFromSystem`, assert a trusted sender receives its payload, and assert an untrusted sender receives `null` without calling the reader. In `app-shell-client.test.ts`, add:

```ts
test('reads a native clipboard image through the shell bridge', async () => {
  const bridgeModule = await import('#/web/renderer-bridge.ts')
  const payload = { name: 'clipboard.png', type: 'image/png', bytes: new ArrayBuffer(3) }
  const readClipboardImage = vi.fn(async () => payload)
  bridgeModule.setRendererBridgeForTests(
    testBridge({
      shell: () => ({
        openSettingsWindow: vi.fn(),
        openExternalUrl: vi.fn(),
        openDirectoryDialog: vi.fn(),
        consumeExternalOpenPaths: vi.fn(),
        openInFinder: vi.fn(),
        readClipboardImage,
      }),
    }),
  )

  const { readSystemClipboardImage } = await import('#/web/app-shell-client.ts')
  await expect(readSystemClipboardImage()).resolves.toBe(payload)
})

test('returns null without a native clipboard image bridge', async () => {
  const { readSystemClipboardImage } = await import('#/web/app-shell-client.ts')
  await expect(readSystemClipboardImage()).resolves.toBeNull()
})
```

- [ ] **Step 2: Run focused bridge tests and verify RED**

Run:

```sh
bun run test src/main/shell-bridge.test.ts src/main/preload.test.ts src/web/app-shell-client.test.ts
```

Expected: FAIL because the IPC channel and bridge methods are absent.

- [ ] **Step 3: Add the channel, capability, types, and preload forwarding**

Add:

```ts
export const SHELL_READ_CLIPBOARD_IMAGE_CHANNEL = 'goblin:shell-read-clipboard-image'
```

Add `'clipboard-image'` to `RendererNativeCapability` and `ELECTRON_RENDERER_CAPABILITIES`. Add this optional method to both renderer shell bridge declarations:

```ts
readClipboardImage?: () => Promise<ClipboardBinaryFilePayload | null>
```

Add the channel to preload's `IPC.shell` table and expose:

```js
readClipboardImage: () => safeInvoke(IPC.shell.readClipboardImage),
```

- [ ] **Step 4: Register the trusted main handler and renderer client**

In `shell-bridge.ts`, import the channel and reader, then register:

```ts
ipcMain.handle(
  SHELL_READ_CLIPBOARD_IMAGE_CHANNEL,
  async (event): Promise<ClipboardBinaryFilePayload | null> =>
    isTrustedIpcEvent(event) ? readClipboardImageFromSystem() : null,
)
```

In `app-shell-client.ts`, expose:

```ts
export async function readSystemClipboardImage(): Promise<ClipboardBinaryFilePayload | null> {
  return (await nativeShell()?.readClipboardImage?.()) ?? null
}
```

- [ ] **Step 5: Run focused bridge tests and verify GREEN**

Run `bun run test src/main/shell-bridge.test.ts src/main/preload.test.ts src/web/app-shell-client.test.ts`.

Expected: PASS.

- [ ] **Step 6: Commit the bridge**

```sh
git add -- src/shared/ipc-channels.ts src/shared/bootstrap.ts src/main/shell-bridge.ts src/main/shell-bridge.test.ts src/preload/preload.cjs src/main/preload.test.ts src/web/renderer-bridge-types.ts src/web/vite-env.d.ts src/web/app-shell-client.ts src/web/app-shell-client.test.ts
git diff --cached --check
git commit -m "feat(windows): bridge clipboard image reads"
```

### Task 3: Route Windows Screenshot Paste Through Existing File Flows

**Files:**
- Modify: `src/web/components/terminal/TerminalSlot.tsx`
- Modify: `src/web/components/terminal/TerminalSlot.test.tsx`

- [ ] **Step 1: Add failing local and remote Windows screenshot tests**

Extend the app-shell mock with `readSystemClipboardImage`. Add one local-controller test where `text/plain`, `files`, `items`, and native file paths are empty but the native image method returns a PNG payload. Assert `saveClipboardBinaryFilesFromPaste` receives that payload and the returned path is shell-escaped into `writeInput`.

Add one remote-controller test with the same clipboard setup. Assert `transferRepositoryFiles` receives one `uploadedItems` entry whose MIME type is `image/png`, byte count matches the payload, and destination path is written to the terminal.

- [ ] **Step 2: Add precedence and platform regression tests**

Add table coverage proving:

```ts
// Windows text wins; native image is not read.
getData: (format: string) => (format === 'text/plain' ? 'copied text' : '')

// A Windows DOM File wins; native image is not read.
files: [new File([new Uint8Array([1])], 'image.png', { type: 'image/png' })]

// A copied native file path wins; native image is not read.
readSystemClipboardFilePaths.mockResolvedValue(['C:/Users/example/report.pdf'])

// macOS with an empty DOM payload does not invoke the Windows fallback.
navigator.platform === 'MacIntel'
```

- [ ] **Step 3: Run the new terminal paste tests and verify RED**

Run:

```sh
bun run test src/web/components/terminal/TerminalSlot.test.tsx -t "native clipboard image|native image fallback"
```

Expected: FAIL because the Windows native image client is not called.

- [ ] **Step 4: Implement payload resolution and reuse existing destinations**

Pass an `allowNativeClipboardImage` boolean from the paste handler using a strict Windows navigator check. Refactor resolution so source paths stay first, DOM `File` objects are converted with the existing `fileToClipboardPayload`, and only an otherwise-empty Windows paste calls `readSystemClipboardImage()`:

```ts
async function pastedBinaryPayloads(
  files: File[],
  allowNativeClipboardImage: boolean,
): Promise<ClipboardBinaryFilePayload[]> {
  if (files.length > 0) return await Promise.all(files.map(fileToClipboardPayload))
  if (!allowNativeClipboardImage) return []
  const image = await readSystemClipboardImage()
  return image ? [image] : []
}
```

For local repositories, pass the payload array to `saveClipboardBinaryFilesFromPaste`. For remote repositories, convert each payload into a renderer `File` and reuse `uploadedItemFromFile`:

```ts
function fileFromClipboardPayload(payload: ClipboardBinaryFilePayload): File {
  return new File([payload.bytes], payload.name ?? 'clipboard', { type: payload.type ?? '' })
}
```

Keep text checking in `handlePasteCapture` before any file, path, or image work.

- [ ] **Step 5: Run the complete paste regression group and verify GREEN**

Run:

```sh
bun run test src/web/components/terminal/TerminalSlot.test.tsx -t "paste|clipboard image|clipboard file paths"
```

Expected: all matching tests pass; text, DOM files, and copied file paths do not trigger a redundant native image read.

- [ ] **Step 6: Commit the paste path**

```sh
git add -- src/web/components/terminal/TerminalSlot.tsx src/web/components/terminal/TerminalSlot.test.tsx
git diff --cached --check
git commit -m "fix(windows): paste screenshots into terminals"
```

### Task 4: Add The Windows Selection Copy Context Menu

**Files:**
- Modify: `src/web/components/terminal/terminal-session-view.ts`
- Modify: `src/web/components/terminal/ManagedTerminalSession.ts`
- Modify: `src/web/components/terminal/TerminalSessionRegistry.ts`
- Modify: `src/web/components/terminal/TerminalSessionProvider.tsx`
- Modify: `src/web/components/terminal/types.ts`
- Modify: `src/web/components/terminal/ManagedTerminalSession.test.ts`
- Modify: `src/web/components/terminal/TerminalSessionRegistry.test.ts`
- Modify: `src/web/components/terminal/TerminalSessionProvider.test.tsx`
- Modify: `src/web/components/terminal/TerminalSlot.tsx`
- Modify: `src/web/components/terminal/TerminalSlot.test.tsx`

- [ ] **Step 1: Add failing terminal-facade selection tests**

Add a platform-neutral `selectionText()` expectation next to the existing mobile selection tests:

```ts
term.selectionText = 'selected output'
expect(session.selectionText()).toBe('selected output')
```

Add registry/provider assertions that `selectionText(key)` delegates to the selected managed session and is exposed on `TerminalSessionContextValue`.

- [ ] **Step 2: Run the facade tests and verify RED**

Run:

```sh
bun run test src/web/components/terminal/ManagedTerminalSession.test.ts src/web/components/terminal/TerminalSessionRegistry.test.ts src/web/components/terminal/TerminalSessionProvider.test.tsx -t "selectionText"
```

Expected: FAIL because the generic reader is not exposed.

- [ ] **Step 3: Implement the generic selection reader through the facade**

Add these delegations without changing mobile selection behavior:

```ts
// terminal-session-view.ts
selectionText(): string {
  return this.term?.getSelection() ?? ''
}

// ManagedTerminalSession.ts
selectionText(): string {
  return this.view.selectionText()
}

// TerminalSessionRegistry.ts
selectionText = (key: string): string => this.sessions.get(key)?.selectionText() ?? ''
```

Add `selectionText: (key: string) => string` to `TerminalSessionContextValue` and wire it in `TerminalSessionProvider`. Update typed test fixtures to include `selectionText: vi.fn(() => '')`.

- [ ] **Step 4: Run the facade tests and verify GREEN**

Run the command from Step 2.

Expected: PASS.

- [ ] **Step 5: Add failing context-menu behavior tests**

In `TerminalSlot.test.tsx`, add tests that set `navigator.platform` to `Win32`, open a `contextmenu` event on the xterm host, and prove:

- empty selection creates no Hobgoblin menu item;
- non-empty selection creates one `menu.edit.copy` item;
- selecting it calls `writeTerminalClipboardText('selected output')`;
- `clearMobileSelection` is not called, so the selection remains;
- a rejected clipboard write shows `terminal.selection-copy-failed` and still does not clear selection;
- `MacIntel` does not create the new menu.

Run:

```sh
bun run test src/web/components/terminal/TerminalSlot.test.tsx -t "Windows terminal selection context menu"
```

Expected: FAIL because no desktop terminal context menu exists.

- [ ] **Step 6: Implement the controlled Windows context menu**

Import `ContextMenu`, `ContextMenuTrigger`, `ContextMenuContent`, and `ContextMenuItem`. Wrap only the terminal host element, keep current mobile pointer handlers unchanged, and control menu open state from a captured non-empty selection:

```tsx
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
```

`handleDesktopContextMenuOpenChange(true)` must read `selectionText(key)` and only set state on Windows, non-mobile renderers with non-empty text. `copyDesktopTerminalSelection` calls `writeTerminalClipboardText`, closes on success, keeps xterm selection intact, and reports the existing failure toast on failure.

- [ ] **Step 7: Run the context-menu and terminal suites**

Run:

```sh
bun run test src/web/components/terminal/TerminalSlot.test.tsx src/web/components/terminal/ManagedTerminalSession.test.ts src/web/components/terminal/TerminalSessionRegistry.test.ts src/web/components/terminal/TerminalSessionProvider.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit the context menu**

```sh
git add -- src/web/components/terminal/terminal-session-view.ts src/web/components/terminal/ManagedTerminalSession.ts src/web/components/terminal/TerminalSessionRegistry.ts src/web/components/terminal/TerminalSessionProvider.tsx src/web/components/terminal/types.ts src/web/components/terminal/ManagedTerminalSession.test.ts src/web/components/terminal/TerminalSessionRegistry.test.ts src/web/components/terminal/TerminalSessionProvider.test.tsx src/web/components/terminal/TerminalSlot.tsx src/web/components/terminal/TerminalSlot.test.tsx
git diff --cached --check
git commit -m "feat(windows): copy terminal selections from context menu"
```

### Task 5: Verify The Complete Feature

**Files:**
- Verify all files listed in Tasks 1–4.

- [ ] **Step 1: Run focused clipboard and terminal tests**

```sh
bun run test src/main/clipboard-image.test.ts src/main/shell-bridge.test.ts src/main/preload.test.ts src/web/app-shell-client.test.ts src/web/components/terminal/TerminalSlot.test.tsx src/web/components/terminal/ManagedTerminalSession.test.ts src/web/components/terminal/TerminalSessionRegistry.test.ts src/web/components/terminal/TerminalSessionProvider.test.tsx
```

Expected: zero failed tests.

- [ ] **Step 2: Run type checking**

```sh
bun run typecheck
```

Expected: exit code 0.

- [ ] **Step 3: Run the architecture guard**

```sh
bun run check:architecture
```

Expected: exit code 0 with no forbidden imports.

- [ ] **Step 4: Run the full test suite**

```sh
bun run test
```

Expected: zero failed test files and zero failed tests.

- [ ] **Step 5: Audit repository state and commit scope**

```sh
git status --short
git diff --check
git log -5 --oneline --decorate
```

Expected: no uncommitted feature changes; commits are limited to the design, native reader, bridge, image paste, context menu, and this plan.

- [ ] **Step 6: Record manual acceptance limitations**

If an interactive Windows Electron instance is available, verify selection Copy, text paste, screenshot paste, and read-only Copy. If macOS is unavailable, explicitly report that automated regression coverage passed but the macOS smoke test was not run.
