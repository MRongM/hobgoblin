# Status Copy Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task inline. Steps use checkbox (`- [ ]`) syntax for tracking. Do not dispatch subagents for this plan.

**Goal:** Remove Status-tab row copy buttons while retaining the complete Copy all action.

**Architecture:** Keep aggregate clipboard serialization in `BranchStatus.tsx`, but render each row as display-only text. Remove the now-unused row-copy helper and translation keys without touching copy controls owned by other surfaces.

**Tech Stack:** React 19, TypeScript, Vitest, jsdom.

## Global Constraints

- Change only Status-tab copy controls.
- Preserve every displayed value and the Copy all clipboard payload.
- Preserve all pre-existing worktree changes.
- Do not create a branch, worktree, commit, or push.

---

### Task 1: Remove per-row copy actions with regression coverage

**Files:**

- Modify: `src/web/components/repo-workspace/ProjectStatusPanel.test.tsx`
- Modify: `src/web/components/branch-detail/BranchStatus.tsx`
- Modify: `src/web/components/branch-detail/status-ui.tsx`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`

**Interfaces:**

- Consumes: `branchStatusClipboardText(...)` and the existing toolbar `CopyButton`.
- Produces: one Status-tab copy control, labelled `branch-status.copy-all`.

- [ ] **Step 1: Change the component test to require one aggregate copy action**

Assert the rendered Status panel contains exactly one copy button, none of the prior row-copy aria-labels exist, and clicking Copy all writes the unchanged multiline summary exactly once.

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
bun run test -- src/web/components/repo-workspace/ProjectStatusPanel.test.tsx
```

Expected: FAIL because row-level copy buttons still render.

- [ ] **Step 3: Replace row copy wrappers with display-only values**

Keep truncation, monospace styling, titles, formatted commit time, status chips, and aggregate serialization. Remove `CopyableValue`, row-level `CopyButton` usage, copy-only props, and unused per-row translation entries.

- [ ] **Step 4: Verify the focused test and translation parity**

Run:

```bash
bun run test -- src/web/components/repo-workspace/ProjectStatusPanel.test.tsx src/shared/i18n/dictionaries.test.ts
```

Expected: both tests pass.

- [ ] **Step 5: Run repository regression gates**

Run:

```bash
bun run typecheck
bun run test
bun run check:architecture
bun run format:check
git diff --check
```

Expected: every command succeeds and unrelated copy controls remain unchanged.
