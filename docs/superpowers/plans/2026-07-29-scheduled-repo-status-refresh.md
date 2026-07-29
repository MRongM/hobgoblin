# Scheduled Repository Status Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the branch-workspace “Refresh changes” menu action and add a persisted scheduled status refresh setting that updates change counts for the active project.

**Architecture:** Add `statusRefreshIntervalSec` beside `fetchIntervalSec` in the server-owned settings snapshot and update it through the existing prefs write path. A main-renderer hook resolves repositories from the active top-level project and calls the existing `refreshStatus` action on each timer tick. Remove the obsolete branch-workspace row action without changing the separate list-refresh action.

**Tech Stack:** TypeScript, React, Zustand, TanStack Query, Hono, Vitest, Bun

## Global Constraints

- Work inline in the existing linked `feat/ws` worktree; do not use subagents.
- Do not create Git commits or branches.
- Keep the title-bar branch-workspace list refresh separate from repository status refresh.
- Reuse the exact interval choices `0, 30, 60, 120, 180, 300, 900` seconds.
- Default `statusRefreshIntervalSec` to `120` seconds and normalize it to an integer in `0..3600`.
- Keep settings server-owned and runtime-coherent through existing invalidation/refetch paths.
- Do not add dependencies or a new realtime protocol.

---

### Task 1: Persist and project the status refresh interval

**Files:**
- Modify: `src/shared/settings.ts`
- Modify: `src/shared/settings-defaults.ts`
- Modify: `src/shared/bootstrap.ts`
- Modify: `src/shared/settings-snapshot.ts`
- Modify: `src/server/modules/settings-source.ts`
- Test: `src/shared/settings-defaults.test.ts`
- Test: `src/shared/settings-snapshot.test.ts`
- Test: `src/server/modules/settings-source.test.ts`

**Interfaces:**
- Produces: `SettingsPrefs.statusRefreshIntervalSec: number` and its runtime/bootstrap projection.
- Consumes: the existing fetch interval normalization range and settings persistence flow.

- [ ] Add failing assertions for a 120-second default, explicit overrides, settings snapshot projection, persisted reads, and invalid-value fallback.
- [ ] Run the three focused test files and verify the new assertions fail because the field is missing.
- [ ] Add `DEFAULT_STATUS_REFRESH_INTERVAL_SEC = 120`, project the field through shared settings/bootstrap snapshots, and normalize/read/write it in `settings-source.ts`.
- [ ] Re-run the focused tests and keep the existing fetch interval listener semantics unchanged.

### Task 2: Expose the setting in the Refresh page

**Files:**
- Modify: `src/web/settings-client.ts`
- Modify: `src/web/settings-write-paths.ts`
- Modify: `src/web/runtime-settings-fetch.ts`
- Modify: `src/web/settings-read-projection.ts`
- Modify: `src/web/components/settings/pages/SyncSettings.tsx`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`
- Test: `src/web/settings-write-paths.test.ts`
- Test: `src/web/runtime-settings-hooks.test.tsx`
- Test: `src/web/components/SettingsSurface.test.tsx`
- Test: `src/shared/i18n/dictionaries.test.ts`

**Interfaces:**
- Produces: `setStatusRefreshInterval(sec)`, `setStatusRefreshIntervalPreference(sec)`, and `useRuntimeFetchSettings().statusRefreshIntervalSec`.
- Consumes: `POST /api/settings/prefs` and the current settings Query cache.

- [ ] Add failing tests that read the runtime interval, persist a changed interval, update Query cache, and render the new group/row with the same seven choices as auto-sync.
- [ ] Run the focused tests and verify failures are caused by the missing setting API and UI.
- [ ] Add the client/write/controller functions and update the Query cache from the authoritative response.
- [ ] Extract one interval-options constant inside `SyncSettings.tsx`, render separate Sync and Status refresh groups, and add four-language copy.
- [ ] Re-run the focused tests and verify both settings remain independent.

### Task 3: Schedule status refresh for the active project

**Files:**
- Create: `src/web/hooks/useScheduledRepoStatusRefresh.ts`
- Create: `src/web/hooks/useScheduledRepoStatusRefresh.test.tsx`
- Modify: `src/web/App.tsx`
- Modify: `src/web/App.test.tsx`

**Interfaces:**
- Produces: `scheduledStatusRefreshRepoIdsFromStore(state): string[]` and `useScheduledRepoStatusRefresh(): void`.
- Consumes: `activeProjectId`, `projectRepositoryIds`, `useRuntimeFetchSettings`, and `useReposStore.getState().refreshStatus(id, { token })`.

- [ ] Write fake-timer tests proving no immediate refresh, one refresh per eligible active-project repository after the interval, exclusion of background/unavailable/non-Git repos, disabled behavior at zero, and timer reset/cleanup.
- [ ] Run the hook test and verify it fails because the module does not exist.
- [ ] Implement the pure target selector and interval effect; read the latest token at tick time and use `Promise.allSettled` so one failure does not abort the batch.
- [ ] Mount the hook beside existing application lifecycle hooks and update the App mock.
- [ ] Re-run hook and App tests.

### Task 4: Remove the branch-workspace menu action

**Files:**
- Modify: `src/web/components/repo-workspace/BranchWorkspaceList.tsx`
- Modify: `src/web/components/repo-workspace/WorkspaceRepositoryRail.tsx`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`
- Test: `src/web/components/repo-workspace/BranchWorkspaceList.test.tsx`
- Test: `src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx`
- Test: `src/shared/i18n/dictionaries.test.ts`

**Interfaces:**
- Removes: `refreshingChangeIds` and `onRefreshChanges` from `BranchWorkspaceListProps`.
- Preserves: `reloadBranchWorkspaces()` as a list-only `branchQuery.refresh()` action.

- [ ] Update exact menu expectations and Rail props tests first so current production code fails due to the extra action/props.
- [ ] Run the two component tests and verify the expected RED failures.
- [ ] Remove the row action, props, icon import, Rail pending state/ref/coordinator, and i18n keys.
- [ ] Re-run the component and dictionary tests.

### Task 5: Full verification

**Files:**
- Review: all files changed by Tasks 1–4

**Interfaces:**
- Consumes: the complete implementation and test suite.
- Produces: verification evidence without a Git commit.

- [ ] Run all focused tests changed by this plan.
- [ ] Run `bun run typecheck` and fix every reported propagation gap.
- [ ] Run `bun run check:architecture`.
- [ ] Run `bun run test` and report the exact pass/fail totals.
- [ ] Review `git diff --check`, `git status --short`, and the final diff for accidental changes or stale menu code.

## Self-Review

- Spec coverage: persistence, UI, scheduling scope, menu removal, list-refresh separation, and full verification each map to one task.
- Placeholder scan: no deferred implementation or unspecified error handling remains.
- Type consistency: the field is consistently named `statusRefreshIntervalSec`; the controller/action names consistently use `setStatusRefreshInterval`; the hook refreshes by the existing `refreshStatus(id, { token })` signature.
