# Clear Cache Confirmation Dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The "清除缓存" (clear cache) item in the repo tab strip "+" dropdown opens a confirmation dialog instead of immediately wiping localStorage/sessionStorage and reloading.

**Architecture:** Lift clear-cache execution out of `OpenRepoMenuItems` into `RepoTabStrip`, which owns a `confirmClearCacheOpen` state and renders one shared `ConfirmDialog` (the codebase's standard destructive-confirm component) outside both dropdown menus. Menu items only request the dialog; the storage clear + reload runs on confirm.

**Tech Stack:** React 19, zustand, shadcn/radix (`ConfirmDialog` on AlertDialog), vitest + jsdom, i18n dictionaries in `src/shared/i18n/{en,zh,ko,ja}.ts`.

**Spec:** `docs/superpowers/specs/2026-07-16-clear-cache-confirm-design.md`

## Global Constraints

- i18n keys (exact): `repo-tabs.clear-cache-confirm-title`, `repo-tabs.clear-cache-confirm-message`, `repo-tabs.clear-cache-confirm`. All four dictionaries (en/zh/ko/ja) must be updated together — the `Dict` type enforces key parity, and `src/shared/i18n/dictionaries.test.ts` enforces placeholder parity.
- The confirm action must keep the existing behavior verbatim: `localStorage.clear()`, `sessionStorage.clear()`, `window.location.reload()` inside a try/catch that logs `'[gbl] failed to clear cache'`.
- `ErrorBoundary.tsx`'s clear-cache button is out of scope — do not touch it.
- The existing dropdown item label keeps using the `error.clear-cache` key (`labels.clearCache`) — do not rename it.
- Tests: `bun run test <path>` (wraps `vitest run`). Typecheck: `bun run typecheck`.
- Commit messages follow the repo's conventional style (`feat:`, `test:`, `i18n` bodies as shown).

---

### Task 1: i18n keys for the confirmation dialog

**Files:**
- Modify: `src/shared/i18n/en.ts` (after `'repo-tabs.clone-opened'`, ~line 114)
- Modify: `src/shared/i18n/zh.ts` (after `'repo-tabs.clone-opened'`, ~line 106)
- Modify: `src/shared/i18n/ko.ts` (after `'repo-tabs.clone-opened'`, ~line 107)
- Modify: `src/shared/i18n/ja.ts` (after `'repo-tabs.clone-opened'`, ~line 114)
- Test (existing, must stay green): `src/shared/i18n/dictionaries.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: dictionary keys `repo-tabs.clear-cache-confirm-title`, `repo-tabs.clear-cache-confirm-message`, `repo-tabs.clear-cache-confirm` — Task 2's `RepoTabs.tsx` wiring calls `t()` with exactly these keys.

- [ ] **Step 1: Add the three keys to all four dictionaries**

In each file, insert directly below the `'repo-tabs.clone-opened'` entry.

`src/shared/i18n/en.ts`:

```ts
  'repo-tabs.clear-cache-confirm-title': 'Clear cache?',
  'repo-tabs.clear-cache-confirm-message':
    'This clears the locally cached data for all repositories on this server and reloads the page. Server data is not affected; repositories will reload from the server.',
  'repo-tabs.clear-cache-confirm': 'Clear and reload',
```

`src/shared/i18n/zh.ts`:

```ts
  'repo-tabs.clear-cache-confirm-title': '清除缓存？',
  'repo-tabs.clear-cache-confirm-message': '将清除此服务器下所有仓库的本地缓存并刷新页面。服务器数据不受影响，仓库将重新加载。',
  'repo-tabs.clear-cache-confirm': '清除并刷新',
```

`src/shared/i18n/ko.ts`:

```ts
  'repo-tabs.clear-cache-confirm-title': '캐시를 지울까요?',
  'repo-tabs.clear-cache-confirm-message': '이 서버의 모든 리포지토리 로컬 캐시를 지우고 페이지를 새로 고칩니다. 서버 데이터는 영향을 받지 않으며 리포지토리는 다시 로드됩니다.',
  'repo-tabs.clear-cache-confirm': '지우고 새로 고침',
```

`src/shared/i18n/ja.ts`:

```ts
  'repo-tabs.clear-cache-confirm-title': 'キャッシュをクリアしますか？',
  'repo-tabs.clear-cache-confirm-message': 'このサーバー上のすべてのリポジトリのローカルキャッシュをクリアし、ページを再読み込みします。サーバーのデータには影響せず、リポジトリは再読み込みされます。',
  'repo-tabs.clear-cache-confirm': 'クリアして再読み込み',
```

- [ ] **Step 2: Run the dictionary parity tests**

Run: `bun run test src/shared/i18n/dictionaries.test.ts`
Expected: PASS (no empty values, placeholders aligned — the new strings have no `{}` placeholders).

- [ ] **Step 3: Commit**

```bash
git add src/shared/i18n/en.ts src/shared/i18n/zh.ts src/shared/i18n/ko.ts src/shared/i18n/ja.ts
git commit -m "feat: add i18n strings for clear-cache confirmation dialog"
```

---

### Task 2: Confirmation dialog in RepoTabStrip

**Files:**
- Modify: `src/web/components/repo-tabs/types.ts` (`RepoTabStripLabels`, lines 13-27)
- Modify: `src/web/components/repo-tabs/RepoTabStrip.tsx` (`OpenRepoMenuItems` lines 113-153, `RepoTabStrip` lines 261-409)
- Modify: `src/web/components/RepoTabs.tsx` (labels object, lines 79-93)
- Test: `src/web/components/repo-tabs/RepoTabStrip.test.tsx` (new tests + `labels` fixture at line 447)
- Modify: `src/web/components/repo-tabs/RepoTabStrip.keyboard.test.tsx` (`labels` fixture only, line 110)

**Interfaces:**
- Consumes: `ConfirmDialog` from `#/web/components/ConfirmDialog.tsx` with props `{ open: boolean; title: string; message: React.ReactNode; confirmLabel: string; destructive?: boolean; onCancel: () => void; onConfirm: () => void | Promise<void> }`; i18n keys from Task 1.
- Produces: `RepoTabStripLabels` gains three required string fields: `clearCacheConfirmTitle`, `clearCacheConfirmMessage`, `clearCacheConfirmLabel`. `OpenRepoMenuItems` gains a required `onClearCache: () => void` prop (internal to `RepoTabStrip.tsx`).

- [ ] **Step 1: Write the failing tests**

In `src/web/components/repo-tabs/RepoTabStrip.test.tsx`:

1. Extend the `labels` fixture (bottom of file, line ~447) with:

```ts
  clearCacheConfirmTitle: 'Clear cache?',
  clearCacheConfirmMessage: 'Clears cached data for all repositories on this server and reloads the page.',
  clearCacheConfirmLabel: 'Clear and reload',
```

2. Add helpers near the other bottom-of-file helpers (`repo`, `createMatchMedia`):

```tsx
function renderEmptyStrip() {
  render(
    <RepoTabStrip
      repos={[]}
      activeId={null}
      labels={labels}
      onActivate={() => {}}
      onClose={() => {}}
      onReorder={() => {}}
      onOpenLocal={() => {}}
      onOpenRemote={() => {}}
      onClone={() => {}}
    />,
  )
}

async function selectClearCacheMenuItem() {
  const trigger = document.body.querySelector('button[aria-label="Open"]')
  if (!(trigger instanceof HTMLButtonElement)) throw new Error('missing open trigger')
  await act(async () => {
    trigger.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
    trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }))
    await Promise.resolve()
  })
  await act(async () => {
    Array.from(document.body.querySelectorAll<HTMLElement>('[role="menuitem"]'))
      .find((item) => item.textContent?.includes('Clear cache'))
      ?.click()
    await Promise.resolve()
  })
}

function stubLocationReload(): { reload: ReturnType<typeof vi.fn>; restore: () => void } {
  const originalLocation = window.location
  const reload = vi.fn()
  Object.defineProperty(window, 'location', { configurable: true, value: { reload } })
  return {
    reload,
    restore: () => Object.defineProperty(window, 'location', { configurable: true, value: originalLocation }),
  }
}
```

(Rendering with `repos={[]}` makes `RepoTabStrip` render the plain "+" open menu directly — no compact/more-menu indirection — and the default `matchMedia` stub from `beforeEach` is irrelevant to it.)

3. Add three tests inside the existing `describe('RepoTabStrip', ...)` block:

```tsx
  test('asks for confirmation before clearing cache', async () => {
    localStorage.setItem('probe', 'kept')
    const location = stubLocationReload()
    try {
      renderEmptyStrip()
      await selectClearCacheMenuItem()

      expect(document.body.querySelector('[role="alertdialog"]')).not.toBeNull()
      expect(document.body.textContent).toContain('Clear cache?')
      expect(localStorage.getItem('probe')).toBe('kept')
      expect(location.reload).not.toHaveBeenCalled()
    } finally {
      location.restore()
      localStorage.clear()
    }
  })

  test('clears storage and reloads after confirming', async () => {
    localStorage.setItem('probe', 'kept')
    sessionStorage.setItem('probe-session', 'kept')
    const location = stubLocationReload()
    try {
      renderEmptyStrip()
      await selectClearCacheMenuItem()

      await act(async () => {
        Array.from(document.body.querySelectorAll<HTMLButtonElement>('[role="alertdialog"] button'))
          .find((button) => button.textContent?.includes('Clear and reload'))
          ?.click()
        await Promise.resolve()
      })

      expect(localStorage.getItem('probe')).toBeNull()
      expect(sessionStorage.getItem('probe-session')).toBeNull()
      expect(location.reload).toHaveBeenCalledTimes(1)
    } finally {
      location.restore()
      localStorage.clear()
      sessionStorage.clear()
    }
  })

  test('cancelling the clear-cache dialog has no side effects', async () => {
    localStorage.setItem('probe', 'kept')
    const location = stubLocationReload()
    try {
      renderEmptyStrip()
      await selectClearCacheMenuItem()

      await act(async () => {
        Array.from(document.body.querySelectorAll<HTMLButtonElement>('[role="alertdialog"] button'))
          .find((button) => button.textContent?.includes('dialog.cancel'))
          ?.click()
        await Promise.resolve()
      })

      expect(document.body.querySelector('[role="alertdialog"]')).toBeNull()
      expect(localStorage.getItem('probe')).toBe('kept')
      expect(location.reload).not.toHaveBeenCalled()
    } finally {
      location.restore()
      localStorage.clear()
    }
  })
```

(In this test suite there is no i18n dictionary loaded, so `useT` echoes keys — the `ConfirmDialog` cancel button renders the literal text `dialog.cancel`; existing tests rely on the same echo behavior, e.g. `terminal.bell-unread` at line 99.)

4. In `src/web/components/repo-tabs/RepoTabStrip.keyboard.test.tsx`, extend its `labels` fixture (line ~110) with the same three fields:

```ts
  clearCacheConfirmTitle: 'Clear cache?',
  clearCacheConfirmMessage: 'Clears cached data for all repositories on this server and reloads the page.',
  clearCacheConfirmLabel: 'Clear and reload',
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `bun run test src/web/components/repo-tabs/RepoTabStrip.test.tsx`
Expected: the three new tests FAIL — today selecting the menu item clears storage immediately, so no `[role="alertdialog"]` appears (test 1 fails on the null dialog, and `probe` is already gone). Existing tests still pass.

- [ ] **Step 3: Extend `RepoTabStripLabels`**

In `src/web/components/repo-tabs/types.ts`, after `clearCache: string`:

```ts
  clearCacheConfirmTitle: string
  clearCacheConfirmMessage: string
  clearCacheConfirmLabel: string
```

- [ ] **Step 4: Implement the dialog in `RepoTabStrip.tsx`**

1. Add the import:

```ts
import { ConfirmDialog } from '#/web/components/ConfirmDialog.tsx'
```

2. Replace `OpenRepoMenuItems` (lines 113-153) — the clear-cache logic moves out; the component gains `onClearCache`:

```tsx
function OpenRepoMenuItems({
  labels,
  onOpenLocal,
  onOpenRemote,
  onClone,
  onClearCache,
}: Pick<RepoTabStripProps, 'labels' | 'onOpenLocal' | 'onOpenRemote' | 'onClone'> & { onClearCache: () => void }) {
  return (
    <>
      <DropdownMenuItem className="whitespace-nowrap" onSelect={onOpenLocal}>
        <FolderOpen />
        {labels.openLocal}
        {labels.openLocalShortcut && <DropdownMenuShortcut>{labels.openLocalShortcut}</DropdownMenuShortcut>}
      </DropdownMenuItem>
      <DropdownMenuItem className="whitespace-nowrap" onSelect={onOpenRemote}>
        <Server />
        {labels.openRemote}
        {labels.openRemoteShortcut && <DropdownMenuShortcut>{labels.openRemoteShortcut}</DropdownMenuShortcut>}
      </DropdownMenuItem>
      <DropdownMenuItem className="whitespace-nowrap" onSelect={onClone}>
        <Download />
        {labels.clone}
        {labels.cloneShortcut && <DropdownMenuShortcut>{labels.cloneShortcut}</DropdownMenuShortcut>}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem className="whitespace-nowrap" onSelect={onClearCache}>
        <Trash2 />
        {labels.clearCache}
      </DropdownMenuItem>
    </>
  )
}
```

3. In the `RepoTabStrip` component body (after the `hoveredId` state at line ~273), add:

```tsx
  const [confirmClearCacheOpen, setConfirmClearCacheOpen] = useState(false)

  const requestClearCache = () => setConfirmClearCacheOpen(true)

  const handleClearCacheConfirmed = () => {
    // Clears the storage for ALL repos on this origin (goblin.repo-store,
    // terminal client id) — hence the confirm gate before it runs.
    try {
      localStorage.clear()
      sessionStorage.clear()
      window.location.reload()
    } catch (err) {
      console.error('[gbl] failed to clear cache', err)
    } finally {
      setConfirmClearCacheOpen(false)
    }
  }
```

4. Pass `onClearCache={requestClearCache}` at **both** `OpenRepoMenuItems` render sites — inside `openMenu` (line ~327) and inside the compact `moreMenu` (line ~377):

```tsx
          <OpenRepoMenuItems labels={labels} onOpenLocal={onOpenLocal} onOpenRemote={onOpenRemote} onClone={onClone} onClearCache={requestClearCache} />
```

5. Render the shared dialog once, as a sibling of the tab strip inside the root `<nav>` (so it exists in both the empty-strip and populated-strip branches). The component's return becomes:

```tsx
  return (
    <nav className="flex h-full min-w-0 flex-1 items-center" aria-label={labels.repositories}>
      {repos.length === 0 ? (
        openMenu
      ) : (
        <ToolbarTabStrip
          ...existing props unchanged...
        />
      )}
      <ConfirmDialog
        open={confirmClearCacheOpen}
        title={labels.clearCacheConfirmTitle}
        message={labels.clearCacheConfirmMessage}
        confirmLabel={labels.clearCacheConfirmLabel}
        destructive
        onCancel={() => setConfirmClearCacheOpen(false)}
        onConfirm={handleClearCacheConfirmed}
      />
    </nav>
  )
```

(`...existing props unchanged...` = keep the current `ToolbarTabStrip` block exactly as is; only the `ConfirmDialog` sibling is new.)

- [ ] **Step 5: Wire the new labels in `RepoTabs.tsx`**

In the `labels={{ ... }}` object, after `clearCache: t('error.clear-cache'),` (line 91):

```ts
        clearCacheConfirmTitle: t('repo-tabs.clear-cache-confirm-title'),
        clearCacheConfirmMessage: t('repo-tabs.clear-cache-confirm-message'),
        clearCacheConfirmLabel: t('repo-tabs.clear-cache-confirm'),
```

- [ ] **Step 6: Run the strip tests to verify they pass**

Run: `bun run test src/web/components/repo-tabs/`
Expected: PASS — all tests in `RepoTabStrip.test.tsx`, `RepoTabStrip.keyboard.test.tsx`, and any sibling repo-tabs suites.

- [ ] **Step 7: Typecheck**

Run: `bun run typecheck`
Expected: PASS. (This is what catches any consumer of `RepoTabStripLabels` missing the three new required fields.)

- [ ] **Step 8: Commit**

```bash
git add src/web/components/repo-tabs/types.ts src/web/components/repo-tabs/RepoTabStrip.tsx src/web/components/RepoTabs.tsx src/web/components/repo-tabs/RepoTabStrip.test.tsx src/web/components/repo-tabs/RepoTabStrip.keyboard.test.tsx
git commit -m "feat: confirm before clearing cache from repo tab dropdown"
```
