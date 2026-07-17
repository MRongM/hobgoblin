# 文件区隐藏 tab 向右展开与收缩 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the file-area explorer tab overflow dropdown with an inline expand-right / collapse toggle whose state is remembered for the browser session.

**Architecture:** All rendering changes live in `ExplorerTabs` inside `RepoExplorerPane.tsx`. A module-level `lastOverflowExpanded` variable backs a `useState` so the expanded state survives component remounts (project switches) but resets on page reload. The overflow `DropdownMenu` is deleted; overflow tabs render inline (same styles as primary tabs) when expanded, and only the active overflow tab (if any) renders when collapsed — matching the old dropdown-trigger behavior.

**Tech Stack:** React 19 + zustand, lucide-react icons, vitest + jsdom (no testing-library; tests use `createRoot` + `act`), i18n via key dictionaries in `src/shared/i18n/{en,zh}.ts` (test harness renders raw keys as text).

## Global Constraints

- Expanded state is session-only: module variable + `useState`, never written to any persisted store (spec: 会话内记住即可).
- Collapsed state with an active overflow tab shows that one tab inline beside the toggle (spec: 沿用现状单独显示激活项).
- Toggle button is NOT `role="tab"` — it selects no panel; it uses `aria-expanded` + i18n `aria-label`.
- New i18n keys must exist in both `en.ts` and `zh.ts` (`dictionaries.test.ts` enforces parity).
- Tab buttons keep the existing ghost/border style, `h-7`, `text-[length:var(--goblin-file-tree-topbar-font-size)]`.

---

### Task 1: i18n keys + inline expand/collapse in ExplorerTabs

**Files:**
- Modify: `src/shared/i18n/en.ts` (after `'file-tree.collapse-all'` entry, ~line 361)
- Modify: `src/shared/i18n/zh.ts` (after `'file-tree.collapse-all'` entry, ~line 345)
- Modify: `src/web/components/repo-workspace/RepoExplorerPane.tsx:192-373` (`ExplorerTabs`)
- Test: `src/web/components/repo-workspace/RepoExplorerPane.test.tsx`

**Interfaces:**
- Consumes: existing `ExplorerTab` union, `useReposStore`, `ToolbarTabStripBody`, `Button`, `useT`.
- Produces: exported `resetExplorerOverflowExpanded(): void` from `RepoExplorerPane.tsx` (test-reset hook for the module-level session state); toggle button rendered with `data-testid="explorer-tabs-overflow-toggle"`; new i18n keys `file-tree.tabs.expand` / `file-tree.tabs.collapse`.

- [ ] **Step 1: Add i18n keys**

In `src/shared/i18n/en.ts`, after the `'file-tree.collapse-all'` line:

```ts
  'file-tree.tabs.expand': 'Show more tabs',
  'file-tree.tabs.collapse': 'Show fewer tabs',
```

In `src/shared/i18n/zh.ts`, after the `'file-tree.collapse-all'` line:

```ts
  'file-tree.tabs.expand': '展开更多标签页',
  'file-tree.tabs.collapse': '收起标签页',
```

Run: `bun run vitest run src/shared/i18n/dictionaries.test.ts`
Expected: PASS (key parity holds).

- [ ] **Step 2: Write failing behavior tests**

Append to the `describe('RepoExplorerPane', ...)` block in `RepoExplorerPane.test.tsx`. Also add to the existing `beforeEach` a call to the new reset export, and extend the component import:

```ts
import { RepoExplorerPane, resetExplorerOverflowExpanded } from '#/web/components/repo-workspace/RepoExplorerPane.tsx'
```

In `beforeEach` (after `resetReposStore()`):

```ts
  resetExplorerOverflowExpanded()
```

New tests:

```tsx
  test('collapses overflow tabs by default behind an expand-right toggle', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(<RepoExplorerPane repoId={REPO_ID} layout="top-bottom" showActions />)
    })

    const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'file-tree.title',
      'tab.changes',
      'tab.status',
      'tab.history',
    ])
    const toggle = container.querySelector<HTMLButtonElement>('[data-testid="explorer-tabs-overflow-toggle"]')
    expect(toggle).toBeTruthy()
    expect(toggle?.getAttribute('aria-expanded')).toBe('false')
    expect(toggle?.getAttribute('aria-label')).toBe('file-tree.tabs.expand')
    await act(async () => root.unmount())
  })

  test('expands overflow tabs inline to the right and collapses them again', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(<RepoExplorerPane repoId={REPO_ID} layout="top-bottom" showActions />)
    })

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="explorer-tabs-overflow-toggle"]')?.click()
    })

    let tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'file-tree.title',
      'tab.changes',
      'tab.status',
      'tab.history',
      'tab.local',
      'tab.remote-branches',
    ])
    const toggle = container.querySelector<HTMLButtonElement>('[data-testid="explorer-tabs-overflow-toggle"]')
    expect(toggle?.getAttribute('aria-expanded')).toBe('true')
    expect(toggle?.getAttribute('aria-label')).toBe('file-tree.tabs.collapse')

    // expanded overflow tabs are real tabs — clicking one switches the panel
    await act(async () => {
      tabs[4]?.click()
    })
    expect(container.querySelector('[data-testid="project-local-panel"]')).toBeTruthy()

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="explorer-tabs-overflow-toggle"]')?.click()
    })
    tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    // collapsed again, but the active overflow tab stays visible beside the toggle
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'file-tree.title',
      'tab.changes',
      'tab.status',
      'tab.history',
      'tab.local',
    ])
    await act(async () => root.unmount())
  })

  test('shows the active overflow tab inline while collapsed', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(<RepoExplorerPane repoId={REPO_ID} layout="top-bottom" showActions />)
    })

    await act(async () => {
      useReposStore.getState().setExplorerTab(REPO_ID, 'remoteBranches')
    })

    const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'file-tree.title',
      'tab.changes',
      'tab.status',
      'tab.history',
      'tab.remote-branches',
    ])
    expect(tabs[4]?.getAttribute('aria-selected')).toBe('true')
    expect(container.querySelector('[data-testid="project-remote-branches-panel"]')).toBeTruthy()
    await act(async () => root.unmount())
  })

  test('remembers the expanded state across remounts within the session', async () => {
    seedRepoState({ id: REPO_B_ID, selectedBranch: 'main' })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(<RepoExplorerPane repoId={REPO_ID} layout="top-bottom" showActions />)
    })

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="explorer-tabs-overflow-toggle"]')?.click()
    })
    await act(async () => root.unmount())

    const root2 = createRoot(container)
    await act(async () => {
      root2.render(<RepoExplorerPane repoId={REPO_B_ID} layout="top-bottom" showActions />)
    })
    expect(
      container.querySelector('[data-testid="explorer-tabs-overflow-toggle"]')?.getAttribute('aria-expanded'),
    ).toBe('true')
    expect(Array.from(container.querySelectorAll('[role="tab"]')).length).toBe(6)
    await act(async () => root2.unmount())
  })
```

The second test asserts `project-local-panel`; add a mock next to the other panel mocks:

```tsx
vi.mock('#/web/components/repo-workspace/ProjectLocalPanel.tsx', () => ({
  ProjectLocalPanel: ({ repoId }: { repoId: string }) => (
    <div data-testid="project-local-panel" data-repo-id={repoId} />
  ),
}))
```

- [ ] **Step 3: Run the new tests, verify they fail**

Run: `bun run vitest run src/web/components/repo-workspace/RepoExplorerPane.test.tsx`
Expected: FAIL — `resetExplorerOverflowExpanded` is not exported and `explorer-tabs-overflow-toggle` does not exist.

- [ ] **Step 4: Implement inline expand/collapse in ExplorerTabs**

In `RepoExplorerPane.tsx`:

1. Replace the lucide import: drop `ChevronDown`, add `ChevronsLeft, ChevronsRight`.
2. Delete the `DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger` import block.
3. Above `function ExplorerTabs(...)`, add the session state:

```tsx
// Session-only memory for the file-area overflow tab strip: survives
// remounts (project switches) but intentionally resets on page reload.
let lastOverflowExpanded = false

export function resetExplorerOverflowExpanded() {
  lastOverflowExpanded = false
}
```

4. Inside `ExplorerTabs`, add state after `activeVisibleTab`:

```tsx
  const [overflowExpanded, setOverflowExpanded] = useState(() => lastOverflowExpanded)
  const toggleOverflow = () =>
    setOverflowExpanded((current) => {
      lastOverflowExpanded = !current
      return !current
    })
```

5. Replace the whole `{primaryTabs.map(...)}` + `{overflowTabs.length > 0 && (<DropdownMenu>...)}` body of `ToolbarTabStripBody` with a shared render function. Remove the now-unused `overflowActive` const. Full replacement:

```tsx
  const renderTab = (tab: (typeof tabs)[number]) => {
    const selected = activeVisibleTab === tab.id
    const Icon = tab.icon
    return (
      <Button
        key={tab.id}
        type="button"
        variant="ghost"
        role="tab"
        aria-selected={selected}
        aria-controls={`repo-explorer-${tab.id}-panel`}
        tabIndex={selected ? 0 : -1}
        onClick={() => onTabChange(tab.id)}
        className={cn(
          'h-7 gap-1.5 border px-2.5 text-[length:var(--goblin-file-tree-topbar-font-size)] font-normal',
          selected
            ? 'border-transparent bg-tab-active text-foreground'
            : 'border-separator text-muted-foreground hover:bg-tab-hover hover:text-foreground',
        )}
      >
        <Icon className="size-3.5 shrink-0" aria-hidden="true" />
        {tab.label}
        {tab.id === 'changes' && changeCount > 0 && (
          <Badge variant="attention" className="font-normal font-mono tabular-nums">
            {changeCount}
          </Badge>
        )}
      </Button>
    )
  }
```

And inside `ToolbarTabStripBody`:

```tsx
              {primaryTabs.map(renderTab)}
              {overflowTabs.length > 0 && (
                <>
                  {(overflowExpanded
                    ? overflowTabs
                    : overflowTabs.filter((tab) => tab.id === activeVisibleTab)
                  ).map(renderTab)}
                  <Button
                    type="button"
                    variant="ghost"
                    data-testid="explorer-tabs-overflow-toggle"
                    aria-expanded={overflowExpanded}
                    aria-label={t(overflowExpanded ? 'file-tree.tabs.collapse' : 'file-tree.tabs.expand')}
                    onClick={toggleOverflow}
                    className="h-7 border border-separator px-2 text-muted-foreground hover:bg-tab-hover hover:text-foreground"
                  >
                    {overflowExpanded ? (
                      <ChevronsLeft className="size-3.5 shrink-0" aria-hidden="true" />
                    ) : (
                      <ChevronsRight className="size-3.5 shrink-0" aria-hidden="true" />
                    )}
                  </Button>
                </>
              )}
```

- [ ] **Step 5: Update existing tests that assumed the dropdown trigger**

All in `RepoExplorerPane.test.tsx`; the old trigger had `role="tab"` with empty text, so tab counts/text lists change:

1. `matches file and branch toolbar height...`: `expect(tabIcons).toHaveLength(5)` → `4`.
2. `switches the local explorer area...`: expected tab text array drops the trailing `''` (4 entries).
3. `keeps the ports tab available for remote repositories`: expected text array drops `''`; keep activating ports via the store action, and delete the stale "dropdown" comment (ports stays reachable inline after expand, but store activation keeps the test focused).
4. `renders remote branches tab for git repositories`: replace the `overflowTrigger = tabs[4]` + store-action workaround with real interaction — click `[data-testid="explorer-tabs-overflow-toggle"]`, re-query tabs, click the one with text `tab.remote-branches`, assert the panel renders.
5. `uses the shared scroll row contract...`: `expect(container.querySelectorAll('[role="tab"]').length).toBe(5)` → `4`.

- [ ] **Step 6: Run the component suite, verify green**

Run: `bun run vitest run src/web/components/repo-workspace/RepoExplorerPane.test.tsx src/shared/i18n/dictionaries.test.ts`
Expected: PASS, including the 4 new tests.

- [ ] **Step 7: Full verification**

Run: `bun run vitest run` and the repo's typecheck/lint (`bun run check` if present, else `bunx tsc -p tsconfig.web.json --noEmit`).
Expected: PASS / no new errors.

- [ ] **Step 8: Commit**

```bash
git add src/web/components/repo-workspace/RepoExplorerPane.tsx \
        src/web/components/repo-workspace/RepoExplorerPane.test.tsx \
        src/shared/i18n/en.ts src/shared/i18n/zh.ts \
        docs/superpowers/plans/2026-07-17-file-area-tab-overflow-expand.md
git commit -m "feat(web): expand file-area overflow tabs inline instead of a dropdown"
```
