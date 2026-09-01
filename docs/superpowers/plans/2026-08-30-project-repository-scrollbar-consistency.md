# Project and Repository Scrollbar Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the sidebar project list and its workspace Git repository list use the same thin, theme-aware native vertical scrollbar without changing any other scrolling surface.

**Architecture:** Add one semantic `project-list-scrollbar` WebKit pseudo-element contract to the existing web theme contract and attach it to the two native overflow containers. Give the Electron/Chromium path an exact `8px` track instead of retaining a platform-sized compatibility fallback. Keep native scrolling, component structure, resizing, drag-and-drop, and state ownership unchanged; verify both the CSS contract and the component opt-in points with focused Vitest coverage.

**Tech Stack:** React 19, Tailwind CSS 4 utility classes, CSS scrollbar properties, Vitest 4, Bun

---

## File structure

- Modify `src/web/theme/contract.css`: own the shared project/repository list scrollbar visual contract.
- Modify `src/web/theme/theme-contract.test.ts`: lock the thin width and theme-aware transparent-track CSS contract.
- Modify `src/web/components/repo-workspace/SidebarProjectList.tsx`: opt the project list's native scroll container into the shared contract.
- Modify `src/web/components/repo-workspace/SidebarProjectList.test.tsx`: lock the project-list opt-in.
- Modify `src/web/components/repo-workspace/WorkspaceRepositoryListPane.tsx`: opt the Git repository list's native scroll container into the shared contract.
- Modify `src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx`: lock the repository-list opt-in through its rendered rail.

### Task 1: Define the shared theme contract

**Files:**

- Modify: `src/web/theme/theme-contract.test.ts`
- Modify: `src/web/theme/contract.css`

- [ ] **Step 1: Write the failing CSS contract test**

Add this test next to the existing navigation/file-area scrollbar test in `src/web/theme/theme-contract.test.ts`:

```ts
test('uses one exact thin WebKit scrollbar contract for project and repository lists', () => {
  const contract = readText(new URL('contract.css', THEME_ROOT))
  const scrollbar = cssRule(contract, '.project-list-scrollbar::-webkit-scrollbar')
  const thumb = cssRule(contract, '.project-list-scrollbar::-webkit-scrollbar-thumb')

  expect(contract).not.toMatch(/\.project-list-scrollbar\s*\{[^}]*scrollbar-(?:color|width):/s)
  expect(scrollbar).toContain('width: 8px;')
  expect(thumb).toContain('border: 2px solid transparent;')
  expect(thumb).toContain('background-color: var(--color-scrollbar-thumb);')
})
```

- [ ] **Step 2: Run the theme test to verify RED**

Run:

```sh
bun run test src/web/theme/theme-contract.test.ts
```

Expected: FAIL because `cssRule` cannot find the exact `.project-list-scrollbar::-webkit-scrollbar` contract in `contract.css`.

- [ ] **Step 3: Add the minimal shared CSS rule**

Add these rules after the broader navigation/file-area native scrollbar rules in `src/web/theme/contract.css` so the repository list overrides their existing `10px` width:

```css
.project-list-scrollbar::-webkit-scrollbar {
  width: 8px;
}

.project-list-scrollbar::-webkit-scrollbar-track,
.project-list-scrollbar::-webkit-scrollbar-corner {
  background-color: transparent;
}

.project-list-scrollbar::-webkit-scrollbar-button {
  display: none;
}

.project-list-scrollbar::-webkit-scrollbar-thumb {
  border: 2px solid transparent;
  border-radius: 999px;
  background-color: var(--color-scrollbar-thumb);
  background-clip: content-box;
}
```

Add the existing hover and active token colors for the target thumb. Do not retain `scrollbar-width` or `scrollbar-color` on `.project-list-scrollbar`; the target contract intentionally uses one exact Electron/Chromium rendering path and is limited to the two confirmed lists.

- [ ] **Step 4: Run the theme test to verify GREEN**

Run:

```sh
bun run test src/web/theme/theme-contract.test.ts
```

Expected: PASS with all tests in `theme-contract.test.ts` green.

- [ ] **Step 5: Commit the theme contract**

```sh
git add src/web/theme/contract.css src/web/theme/theme-contract.test.ts
git commit -m "style(ui): define shared project list scrollbar"
```

### Task 2: Bind both native list containers to the contract

**Files:**

- Modify: `src/web/components/repo-workspace/SidebarProjectList.test.tsx`
- Modify: `src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx`
- Modify: `src/web/components/repo-workspace/SidebarProjectList.tsx`
- Modify: `src/web/components/repo-workspace/WorkspaceRepositoryListPane.tsx`

- [ ] **Step 1: Write the failing project-list component test**

Add this test at the start of the `SidebarProjectList` describe block in `src/web/components/repo-workspace/SidebarProjectList.test.tsx`:

```tsx
test('uses the shared project list scrollbar contract', () => {
  renderList()

  expect(container!.querySelector('#project-list')?.classList.contains('project-list-scrollbar')).toBe(true)
})
```

- [ ] **Step 2: Write the failing repository-list component test**

Add this test near the existing resizable repository-list tests in `src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx`:

```tsx
test('uses the shared project list scrollbar contract for the repository list', () => {
  renderRail()

  const upperList = container?.querySelector<HTMLElement>('[data-testid="workspace-repository-upper-list"]')
  expect(upperList?.classList.contains('project-list-scrollbar')).toBe(true)
})
```

- [ ] **Step 3: Run both component tests to verify RED**

Run:

```sh
bun run test src/web/components/repo-workspace/SidebarProjectList.test.tsx src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx
```

Expected: FAIL in the two new assertions because neither native scroll container has `project-list-scrollbar` yet.

- [ ] **Step 4: Opt the project list into the shared class**

Change the list element in `src/web/components/repo-workspace/SidebarProjectList.tsx` to:

```tsx
<ul id={id} className="project-list-scrollbar max-h-72 overflow-y-auto px-1.5 pb-2">
```

- [ ] **Step 5: Opt the repository list into the shared class**

Change the `cn` base class in `src/web/components/repo-workspace/WorkspaceRepositoryListPane.tsx` to:

```tsx
className={cn('project-list-scrollbar relative overflow-y-auto px-1.5 pb-1.5', compact && 'max-h-40')}
```

- [ ] **Step 6: Run both component tests to verify GREEN**

Run:

```sh
bun run test src/web/components/repo-workspace/SidebarProjectList.test.tsx src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx
```

Expected: PASS with both new assertions and all existing list interaction/resize tests green.

- [ ] **Step 7: Commit the component bindings**

```sh
git add src/web/components/repo-workspace/SidebarProjectList.tsx src/web/components/repo-workspace/SidebarProjectList.test.tsx src/web/components/repo-workspace/WorkspaceRepositoryListPane.tsx src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx
git commit -m "fix(ui): unify project repository scrollbars"
```

### Task 3: Verify the complete change

**Files:**

- Verify: `src/web/theme/contract.css`
- Verify: `src/web/theme/theme-contract.test.ts`
- Verify: `src/web/components/repo-workspace/SidebarProjectList.tsx`
- Verify: `src/web/components/repo-workspace/SidebarProjectList.test.tsx`
- Verify: `src/web/components/repo-workspace/WorkspaceRepositoryListPane.tsx`
- Verify: `src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx`

- [ ] **Step 1: Run all focused regression tests together**

```sh
bun run test src/web/theme/theme-contract.test.ts src/web/components/repo-workspace/SidebarProjectList.test.tsx src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx
```

Expected: PASS with zero failures.

- [ ] **Step 2: Run formatting checks for touched files**

```sh
bunx prettier --check src/web/theme/contract.css src/web/theme/theme-contract.test.ts src/web/components/repo-workspace/SidebarProjectList.tsx src/web/components/repo-workspace/SidebarProjectList.test.tsx src/web/components/repo-workspace/WorkspaceRepositoryListPane.tsx src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx docs/superpowers/specs/2026-08-30-project-repository-scrollbar-consistency-design.md docs/superpowers/plans/2026-08-30-project-repository-scrollbar-consistency.md
```

Expected: `All matched files use Prettier code style!`.

- [ ] **Step 3: Run TypeScript checks**

```sh
bun run typecheck
```

Expected: exit code 0 with no TypeScript errors.

- [ ] **Step 4: Run the complete test suite**

```sh
bun run test
```

Expected: exit code 0 with zero failed tests.

- [ ] **Step 5: Run the architecture guard**

```sh
bun run check:architecture
```

Expected: exit code 0 with all enforced import boundaries green.

- [ ] **Step 6: Check patch integrity and final scope**

```sh
git diff --check HEAD~2..HEAD
git status --short
```

Expected: no whitespace errors; the working tree is clean; only the design, plan, theme contract, and two list components/tests are changed by this work.
