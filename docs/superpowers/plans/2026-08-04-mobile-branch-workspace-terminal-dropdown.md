# Mobile Branch Workspace Terminal Dropdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse branch workspace root terminal sessions into the existing dropdown switcher on Mobile Web while preserving horizontal desktop tabs.

**Architecture:** Keep the change renderer-local in `BranchWorkspaceTerminalPanel`. Read the canonical compact UI state with `useIsCompactUi` and pass it to the existing `TerminalTabs.responsiveCompact` input, matching Git repository and plain workspace terminal composition without changing shared terminal behavior.

**Tech Stack:** React 19, TypeScript 6, Vitest 4, existing Hobgoblin responsive UI and terminal-tab components.

## Global Constraints

- Change only the branch workspace root terminal panel and its focused component test.
- Keep desktop terminal tabs horizontal.
- Keep branch workspace member worktrees unchanged.
- Do not add dependencies, translations, persisted state, server behavior, or shared-component policy.
- Use repo-alias imports with explicit `.ts`/`.tsx` extensions.
- Do not use TypeScript enums, runtime namespaces, parameter properties, or import aliases.
- Do not perform Git commits because the user did not request them.

---

### Task 1: Connect compact branch workspace terminals to the shared dropdown

**Files:**

- Modify: `src/web/components/repo-workspace/BranchWorkspaceTerminalPanel.test.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceTerminalPanel.tsx`

**Interfaces:**

- Consumes: `useIsCompactUi(): boolean` from `#/web/hooks/useResponsiveUiMode.tsx`.
- Consumes: existing optional `TerminalTabs` prop `responsiveCompact?: boolean`.
- Produces: no new public interface; the branch workspace panel forwards its current compact presentation state.

- [x] **Step 1: Write the failing compact-presentation regression test**

Add a mutable responsive test value and module mock near the existing test globals:

```tsx
let compactUi = false

vi.mock('#/web/hooks/useResponsiveUiMode.tsx', () => ({
  useIsCompactUi: () => compactUi,
}))
```

Reset it in `beforeEach`:

```tsx
compactUi = false
```

Add this focused test inside `describe('BranchWorkspaceTerminalPanel', ...)`:

```tsx
test('collapses the branch-workspace terminal list in compact UI like a Git workspace', async () => {
  compactUi = true

  await renderPanel()

  expect(terminalTabsProps.at(-1)?.responsiveCompact).toBe(true)
})
```

- [x] **Step 2: Run the focused test and verify the missing behavior fails**

Run:

```bash
bun run test -- src/web/components/repo-workspace/BranchWorkspaceTerminalPanel.test.tsx -t "collapses the branch-workspace terminal list"
```

Expected: FAIL because `terminalTabsProps.at(-1)?.responsiveCompact` is `undefined` instead of `true`.

- [x] **Step 3: Implement the minimal responsive prop wiring**

Import the existing hook in `BranchWorkspaceTerminalPanel.tsx`:

```tsx
import { useIsCompactUi } from '#/web/hooks/useResponsiveUiMode.tsx'
```

Read the responsive presentation state at the top of the component:

```tsx
const compact = useIsCompactUi()
```

Pass it to the shared terminal tabs:

```tsx
<TerminalTabs
  worktreeTerminalKey={terminalWorktreeKey}
  sessions={snapshot.sessions}
  detailId={`branch-workspace-terminal-${context.id}`}
  responsiveCompact={compact}
  panelActive
```

- [x] **Step 4: Run the focused component test and verify it passes**

Run:

```bash
bun run test -- src/web/components/repo-workspace/BranchWorkspaceTerminalPanel.test.tsx
```

Expected: PASS with every `BranchWorkspaceTerminalPanel` test green.

- [x] **Step 5: Run full project verification**

Run:

```bash
bun run typecheck
bun run test
bun run check:architecture
```

Expected: every command exits with status 0 and reports no failures.
