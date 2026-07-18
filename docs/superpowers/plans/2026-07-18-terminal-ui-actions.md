# Terminal UI Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the worktree external-terminal action with internal terminal creation, move terminal access controls into the bottom status bar, and add confirmed terminal-tab context-menu close actions.

**Architecture:** Keep all behavior in `src/web/**`. Reuse `TerminalSessionContextValue` for terminal creation/closure, isolate browser/QR URL construction in a status-bar child component, and translate tab close scopes into the existing per-session `onClose` callback.

**Tech Stack:** React 19, TypeScript strip-only mode, Radix context menu, Zustand, TanStack Query, Vitest.

## Global Constraints

- Use repo-alias imports with explicit `.ts`/`.tsx` extensions.
- Do not add server APIs or dependencies.
- Do not use TypeScript enums, runtime namespaces, parameter properties, or import aliases.
- Do not create Git commits; the user did not request them.
- Verify with focused tests, `bun run typecheck`, `bun run check:architecture`, and `bun run test`.

---

### Task 1: Worktree Internal Terminal Action

**Files:**
- Modify: `src/web/hooks/useBranchActionItems.test.tsx`
- Modify: `src/web/hooks/useBranchActionItems.tsx`

**Interfaces:**
- Consumes: `TerminalSessionContextValue.createTerminal(base)` and `MainWindowNavigationActions.showRepoDetailTab(repoId, 'terminal')`.
- Produces: existing branch action ID `terminal` with internal-terminal behavior.

- [ ] **Step 1: Write the failing action test**

Add a test that obtains the `terminal` item for a branch with a worktree, invokes `onSelect`, and expects `showRepoDetailTab('/tmp/repo', 'terminal')`, `setDetailCollapsed(false)`, and `createTerminal({ repoRoot: '/tmp/repo', branch: 'feature/internal', worktreePath: '/tmp/repo-feature' })`.

- [ ] **Step 2: Verify the test fails**

Run: `bun run test "src/web/hooks/useBranchActionItems.test.tsx"`

Expected: FAIL because the action still invokes the external-terminal function and the test context does not observe `createTerminal`.

- [ ] **Step 3: Implement the minimal action change**

Use `Terminal` from `lucide-react`, obtain `createTerminal`, navigation, and `setDetailCollapsed`, then implement:

```ts
async function handleNewTerminal(): Promise<void> {
  if (!terminalBase) return
  navigation.showRepoDetailTab(repo.id, 'terminal')
  setDetailCollapsed(false)
  await createTerminal(terminalBase)
}
```

Assign this function to the existing `terminal` item, label it with `terminal.new`, and disable it only when blocked or missing `terminalBase`.

- [ ] **Step 4: Re-run the focused test**

Run: `bun run test "src/web/hooks/useBranchActionItems.test.tsx"`

Expected: PASS.

### Task 2: Status Bar Terminal Access Controls

**Files:**
- Create: `src/web/components/terminal/TerminalStatusActions.tsx`
- Modify: `src/web/components/StatusBar.tsx`
- Modify: `src/web/components/StatusBar.test.tsx`
- Modify: `src/web/components/branch-detail/BranchDetailToolbar.tsx`
- Modify: `src/web/components/branch-detail/BranchDetailToolbar.test.tsx`

**Interfaces:**
- Consumes: selected repo branch, `useWorktreeTerminalSnapshot`, `useLanInfoQuery`, `buildTerminalDeepLinkUrl`, and `openExternalUrl`.
- Produces: `TerminalStatusActions({ repoId })` rendered by `StatusBar`.

- [ ] **Step 1: Write failing placement and link tests**

Test that `StatusBar` renders `terminal.open-in-browser` and `terminal.lan-qr` for a selected worktree, that the browser action opens the loopback deep link with the selected terminal ID, and that the detail topbar no longer contains either control.

- [ ] **Step 2: Verify the tests fail**

Run: `bun run test "src/web/components/StatusBar.test.tsx" "src/web/components/branch-detail/BranchDetailToolbar.test.tsx"`

Expected: FAIL because the controls still live in `BranchDetailToolbar`.

- [ ] **Step 3: Add the focused status action component**

Implement `TerminalStatusActions` to render two `icon-sm` buttons plus the existing QR dialog behavior. Build URLs from the selected worktree and selected terminal; return `null` without a worktree.

- [ ] **Step 4: Move ownership from topbar to status bar**

Render `<TerminalStatusActions repoId={repoId} />` in the left status-bar group. Remove `Globe`, `QrCode`, LAN query, URL calculation, QR state, and QR dialog code from `BranchDetailToolbar`.

- [ ] **Step 5: Re-run focused tests**

Run: `bun run test "src/web/components/StatusBar.test.tsx" "src/web/components/branch-detail/BranchDetailToolbar.test.tsx"`

Expected: PASS.

### Task 3: Confirmed Terminal Tab Context Menu

**Files:**
- Modify: `src/web/components/tab-strip/ToolbarClosableTab.tsx`
- Modify: `src/web/components/terminal/TerminalTabs.tsx`
- Modify: `src/web/components/terminal/TerminalTabs.test.tsx`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`

**Interfaces:**
- Consumes: `ToolbarClosableTab` native container and `TerminalTabsProps.onClose(key)`.
- Produces: optional tab context menu and close scopes `current`, `others`, and `all`.

- [ ] **Step 1: Write failing context-menu tests**

Right-click `t2`, choose each action, assert `onClose` remains untouched before confirmation, then confirm and verify target keys: `['t2']`, `['t1', 't3']`, and `['t1', 't2', 't3']`. Add a cancellation assertion.

- [ ] **Step 2: Verify the tests fail**

Run: `bun run test "src/web/components/terminal/TerminalTabs.test.tsx"`

Expected: FAIL because terminal tabs do not expose a context menu.

- [ ] **Step 3: Add generic closable-tab context menu support**

Add an optional `contextMenu: ReactNode` prop to `ToolbarClosableTab`. When present, wrap its existing native container with `ContextMenu` and `ContextMenuTrigger asChild` and render the supplied content; preserve the same container ref and classes.

- [ ] **Step 4: Implement close intents and confirmations**

Render destructive menu items for current, others, and all. Disable others when no other session exists. Compute target keys from the latest `sessions` at confirm time and call the existing `onClose` once per target.

- [ ] **Step 5: Add complete localized copy**

Add matching keys to all four dictionaries:

```ts
'terminal.close-current'
'terminal.close-others'
'terminal.close-others-confirm-title'
'terminal.close-others-confirm-body'
'terminal.close-others-confirm-confirm'
```

- [ ] **Step 6: Re-run focused tests**

Run: `bun run test "src/web/components/terminal/TerminalTabs.test.tsx" "src/shared/i18n/dictionaries.test.ts"`

Expected: PASS.

### Task 4: Full Verification

**Files:**
- Verify all modified files.

**Interfaces:**
- Consumes: repository scripts.
- Produces: validated renderer-only feature.

- [ ] **Step 1: Run type and architecture checks**

Run: `bun run typecheck && bun run check:architecture`

Expected: both commands exit 0.

- [ ] **Step 2: Run the complete test suite**

Run: `bun run test`

Expected: all tests pass with no new warnings or unhandled errors.

