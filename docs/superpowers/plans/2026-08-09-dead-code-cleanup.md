# Dead Code And Redundancy Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove production-unreachable code, obsolete build outputs, redundant resources, and duplicated helpers without changing supported runtime behavior or compatibility contracts.

**Architecture:** Work in independently verifiable slices: low-risk TypeScript/Web cleanup, Android cleanup, worktree-bootstrap legacy removal, server-build cleanup, and shared-helper extraction. Preserve registered APIs, persisted-settings migrations, current best-effort bootstrap behavior, and runtime-loaded TypeScript source packaging.

**Tech Stack:** Bun, TypeScript strip-only mode, React, Electron, Hono, Vitest, Kotlin, Jetpack Compose, Gradle Android lint.

## Global Constraints

- Do not add TypeScript enums, runtime namespaces, parameter properties, or import aliases.
- Keep repo-alias imports with explicit `.ts`/`.tsx` extensions.
- Do not remove `/api/workspace/pull/*`, persisted global-shortcut compatibility fields, tmux legacy handling, RPC/preload migrations, manual release tools, or externally managed Pages configuration.
- Do not modify or revert the existing `README*.md` and `docs/index.html` worktree changes.
- Do not run `git commit`, `git push`, branch, reset, or checkout commands.
- Delete only candidates with a verified production reference count of zero.
- After every slice, run the closest focused tests; finish with `bun run typecheck`, `bun run test`, and Android lint.

---

### Task 1: Remove Low-Risk TypeScript And Web Orphans

**Files:**

- Delete: `src/main/shortcuts.ts`
- Modify: `src/main/main.test.ts`
- Delete: `src/web/components/repo-workspace/WorkspaceConfigurationDialog.tsx`
- Delete: `src/web/components/repo-workspace/WorkspaceConfigurationDialog.test.tsx`
- Delete: `src/web/components/repo-workspace/WorkspacePullDialog.tsx`
- Delete: `src/web/components/repo-workspace/WorkspacePullDialog.test.tsx`
- Delete: `src/web/hooks/useWorkspacePullActions.ts`
- Delete: `src/web/hooks/useWorkspacePullActions.test.tsx`
- Modify: `src/web/workspace-client.ts`
- Modify: `src/main/menu.ts`
- Modify: `src/main/rpc.test.ts`
- Modify: `src/server/modules/repo-write-paths.ts`
- Modify: `src/web/hooks/useKeyboard.test.tsx`
- Modify: `src/shared/accelerator.ts`
- Modify: `src/web/lib/detail-tabs.ts`
- Modify: `src/shared/renderer-effect-intents.ts`
- Modify: `src/web/hooks/renderer-effect-intent-plans.test.ts`
- Modify: `src/web/components/repo-workspace/history-graph.ts`
- Modify: `src/web/ai-terminal-handoff.ts`
- Modify: `src/web/components/terminal/TerminalScopeContextMenu.tsx`
- Modify: `src/web/components/terminal/terminal-session-store.ts`
- Modify: `src/web/components/terminal/terminal-path-links.ts`
- Modify or delete the tests that only exercise the removed exports.

**Interfaces:**

- Consumes: current live callers found through TypeScript import/reference scans.
- Produces: the same public runtime behavior with test-only production implementations removed.

- [ ] **Step 1: Re-run exact reference searches for every whole-file deletion**

  Run `rg -n "WorkspaceConfigurationDialog|WorkspacePullDialog|useWorkspacePullActions|main/shortcuts" src` and require that matches outside declarations are test-only.

- [ ] **Step 2: Delete the four production-orphan modules and their obsolete tests**

  Remove the inert shortcut file, the two dialog modules, the pull hook, and tests that exclusively preserve those removed implementations. Remove the stale `shortcuts.ts` mock from `main.test.ts` and the three unused renderer client wrappers `planWorkspacePull`, `executeWorkspacePull`, and `abortWorkspacePull` only after confirming no remaining renderer caller.

- [ ] **Step 3: Remove compiler-confirmed unused declarations**

  Delete `accelerator()` and the unused `state` parameter from `createRendererCommandMenuItem`, adjusting all calls. Delete unused imports `getSettingsPrefs`, `isValidRepositoryWorktreePath`, `node:path`, and `vi` at their reported sites.

- [ ] **Step 4: Remove superseded exported subgraphs while preserving live siblings**

  Remove `globalShortcutFromKeyboardEvent`, `formatAccelerator`, `acceleratorToKeyLabels`, and their now-private dead constants/helpers while preserving `parseGlobalShortcut` and `normalizeGlobalShortcut`. In `detail-tabs.ts`, preserve `detailTabForWorktree` and remove the unreferenced tab-navigation subgraph. Remove `RendererEffectIntentType` and `isRendererEffectIntent` plus the obsolete validator test. Remove only the test-only history graph, AI handoff provider, terminal context-menu component, selected-descriptor hook, and single-line path-link API; retain the live helpers in those files.

- [ ] **Step 5: Run focused Web/Main tests**

  Run the affected Vitest files that remain, then run strict TypeScript unused checks for `tsconfig.main.json` and `tsconfig.web.json`. Expected result: no TS6133 diagnostics from this slice; exhaustive-guard TS7027 diagnostics may remain in the explicit audit command.

### Task 2: Remove Android Production-Unreachable Implementations And Resources

**Files:**

- Delete: `android/app/src/main/java/com/mrongm/hobgoblin/terminals/TerminalRendererDecision.kt`
- Delete: `android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/placeholders/PlaceholderScreens.kt`
- Delete or update tests that only inspect placeholder helpers.
- Delete: `android/app/src/main/java/com/mrongm/hobgoblin/ssh/RemoteBranchService.kt`
- Delete: `android/app/src/test/java/com/mrongm/hobgoblin/ssh/RemoteBranchServiceTest.kt`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/diagnostics/DiagnosticsScreen.kt`
- Modify: Android production files containing test-only helpers identified in the audit.
- Modify: all four Android string resource locales.
- Delete: `android/app/src/main/assets/icon.png`
- Delete: `android/app/src/main/assets/icon-mac-1024.png`
- Move: `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml` to `android/app/src/main/res/mipmap-anydpi/ic_launcher.xml`
- Move: `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml` to `android/app/src/main/res/mipmap-anydpi/ic_launcher_round.xml`

**Interfaces:**

- Consumes: `AppRoute`, `HobgoblinAndroidApp`, and the current terminal/diagnostic service graph.
- Produces: unchanged Android navigation and runtime behavior with smaller APK/resources.

- [ ] **Step 1: Verify navigation and DI references are still absent**

  Search declarations across `android/app/src/main`, Manifest, and tests. Require zero production references for `TerminalRendererDecision`, the three placeholder screens, `RemoteBranchService`, and the top-level `DiagnosticsScreen` wrapper.

- [ ] **Step 2: Delete whole dead files and obsolete tests**

  Delete the renderer decision, placeholder screens, branch service, and tests that only cover those implementations. In `DiagnosticsScreen.kt`, remove only `DiagnosticsScreen` and `targetPreview`; retain `HostDiagnosticsContent` and all live types/helpers used by `AddHostScreen`.

- [ ] **Step 3: Remove test-only production helpers**

  Remove `projectActionLabelResources`, `localProjectReorderIds`, `repositoryTmuxDiscoveryPaths`, `repositoriesAfterLocalDelete`, `worktreeRemovalConfirmationText`, the unused quick-input/stick-to-bottom helpers, `terminalWithinTouchSlop`, `recoverOrGetTmuxSession`, `mostRecentSessionForWorkspace`, and `visibleText`. Update or delete tests so they exercise the current runtime path instead of removed production test seams.

- [ ] **Step 4: Remove resource and asset redundancy**

  Delete all `placeholder_*`, `workspace_title`, and `host_tmux_terminal_label` translations from four locale files. Remove the irrelevant `one` quantities for Japanese, Korean, and Simplified Chinese. Move adaptive icon XML resources out of the redundant `v26` directory without changing their content. Delete the two Android asset images after reconfirming no `AssetManager` or filename reference.

- [ ] **Step 5: Verify Android**

  Run `./gradlew :app:testDebugUnitTest :app:lintDebug --console=plain` from `android/`. Expected: tests and lint succeed; `UnusedResources`, `UnusedQuantity`, and `ObsoleteSdkInt` findings targeted by this task disappear.

### Task 3: Remove The Legacy Strict Worktree-Bootstrap Subgraph

**Files:**

- Modify: `src/system/git/worktree-bootstrap.ts`
- Modify: `src/system/git/worktree-bootstrap.test.ts`
- Modify: `src/system/ssh/git.ts`
- Modify: SSH bootstrap tests.
- Modify: `src/system/ssh/commands.ts`
- Modify: SSH command tests and snapshots.
- Modify: `src/shared/worktree-bootstrap-summary.ts`
- Modify: consumers/tests importing target-preflight types.

**Interfaces:**

- Consumes: current `bootstrapWorktreeSelectionsAfterCreate` and remote best-effort bootstrap calls.
- Produces: unchanged best-effort copy/symlink materialization; no inspect-only, replacement, or target-preflight protocol.

- [ ] **Step 1: Lock the live boundary**

  Verify the production remote call still passes `bestEffort: true`. Record live shared helpers at `worktree-bootstrap.ts` around `firstSymlinkAncestor`, path normalization, source stat, and best-effort summary handling; these must remain.

- [ ] **Step 2: Remove the local strict preflight/materialization closure**

  Delete `getWorktreeBootstrapTargetPreflight`, `materializePlan`, `materializeCopy`, strict target-entry comparison/exclusion helpers, `bootstrapSummary`, `bootstrapFailure`, and `pathsForMode` only when their reference count becomes zero. Preserve best-effort execution and every helper it still calls.

- [ ] **Step 3: Remove the remote strict protocol**

  Delete `getRemoteWorktreeBootstrapTargetPreflight`, its parser/safe-path closure, command fields `inspectOnly` and `replaceExisting`, and the non-best-effort body of `remoteBootstrapInnerScript`. Make `remoteBootstrapInnerScript` directly return the best-effort script or rename the best-effort helper to the canonical function.

- [ ] **Step 4: Remove obsolete shared types and tests**

  Remove `WorktreeBootstrapTargetDecision`, `WorktreeBootstrapTargetEntry`, `WorktreeBootstrapTargetPreflight`, and the target-preflight result type after all imports are gone. Delete tests for strict inspection/replacement behavior; retain path-safety and best-effort regression coverage.

- [ ] **Step 5: Run focused bootstrap and SSH tests**

  Run the affected worktree-bootstrap, SSH git, SSH command, and branch-workspace tests. Expected: current copy/symlink best-effort scenarios remain green and no strict-protocol symbol is referenced.

### Task 4: Remove The Unused Server Bundle And Public Test Artifact

**Files:**

- Modify: `package.json`
- Modify: `scripts/build.ts`
- Modify: `scripts/build-release-artifacts.ts`
- Modify: `electron-builder.ts`
- Modify: `src/system/build-script.test.ts`
- Move: `src/web/public/boot.test.ts` to a test location outside `public`.

**Interfaces:**

- Consumes: source entrypoints packaged under `src/server/**/*.ts` and the Vite Web bundle.
- Produces: Electron packages that load server and terminal-worker TypeScript source directly, without `dist/server`.

- [ ] **Step 1: Remove server bundle production**

  Delete the `build:server` script, the `build:server` step and artifact assertions from `scripts/build.ts`, `buildServerBundle()` plus its call/assertions from `build-release-artifacts.ts`, and the `dist/server/**/*` builder glob. Preserve all `src/main`, `src/system`, `src/server`, `src/shared`, preload, and `dist/web` globs.

- [ ] **Step 2: Update build contract tests**

  Replace assertions requiring `dist/server/main.js` and `dist/server/terminal-worker.js` with assertions that source server entrypoints remain packaged and that only Web build artifacts are required.

- [ ] **Step 3: Move the public boot test**

  Move the Vitest source outside `src/web/public` while preserving its test logic and discovery by `vitest.config.ts`. Verify a fresh Web build contains `boot.js` but not `boot.test.ts`.

- [ ] **Step 4: Run build tests and packaged smoke checks**

  Run `bun run build:web`, the build-script tests, and an unpacked Electron builder smoke check appropriate for the host. Verify the packaged app contains source server entrypoints and no `dist/server` requirement.

### Task 5: Remove Redundant Repository Assets And Stale Configuration

**Files:**

- Delete: `goblin.toml`
- Modify: `src/web/components/settings/pages/AboutSettings.tsx`
- Keep one canonical Web PNG and remove the duplicate production emission.
- Delete: `docs/screenshot-20260626-143532.png`
- Delete: `docs/screenshot-20260626-144523.png`
- Delete: `src/preload/package.json`
- Modify: Google Play scripts with hard-coded `0.1.0` defaults.
- Modify: `package.json` only if `pngjs` is explicitly added or the test is migrated to `sharp`.

**Interfaces:**

- Consumes: Web absolute `/goblin.png`, Electron-relative asset loading, and existing brand-asset tests.
- Produces: one canonical icon per packaging context and version-aware Play tooling.

- [ ] **Step 1: Delete definitively obsolete repository files**

  Delete root `goblin.toml`, the two unreferenced docs screenshots, and the redundant preload package boundary. Re-run repository-wide filename searches before deletion.

- [ ] **Step 2: Deduplicate the Web icon without breaking base paths**

  Reuse the public `/goblin.png` URL in `AboutSettings` or import a single canonical asset in both contexts. Update brand-asset tests so they verify canonical sources rather than requiring identical copies.

- [ ] **Step 3: Fix stale tooling without deleting manual workflows**

  Replace Google Play `0.1.0` defaults with an explicit required argument or a value derived from the current package/Gradle version. Keep the scripts callable manually. Replace the test's transitive `pngjs` dependency with already-declared `sharp` when equivalent, otherwise add an exactly pinned devDependency.

- [ ] **Step 4: Run brand and script tests**

  Run the brand-asset and shell-script contract tests. Build Web and confirm the duplicate hashed icon is gone while favicon and About UI remain valid.

### Task 6: Extract Two Proven Duplicate Helpers

**Files:**

- Create: `src/server/modules/queued-json-registry.ts`
- Modify: `src/server/modules/workspace-config-source.ts`
- Modify: `src/server/modules/branch-workspace-source.ts`
- Create: `src/server/modules/repository-status-plan.ts`
- Modify: `src/server/modules/repository-branch-merge-plan.ts`
- Modify: `src/server/modules/branch-workspace-git-action-plan.ts`
- Test: existing workspace config, branch workspace, merge plan, and git-action plan tests.

**Interfaces:**

- Produces: `writeJsonRegistryAtomically(dataFile: string, value: unknown, randomId: string): Promise<void>`.
- Produces: `enqueueFileWrite(queues: Map<string, Promise<void>>, dataFile: string, write: () => Promise<void>): Promise<void>`.
- Produces: `findRepositoryStatus`, `normalizeRepositoryPath`, `normalizedStatusEntries`, and `repositoryPlanFingerprint`.

- [ ] **Step 1: Add the atomic registry helper**

  Implement the existing exact behavior: create the parent directory, create an exclusive dot-prefixed temporary file, serialize pretty JSON with a trailing newline, rename atomically, and best-effort unlink the temporary file on failure. Accept each caller's queue map so queue ownership and test isolation do not change.

- [ ] **Step 2: Migrate both registry modules**

  Replace their local `writeRegistry` and `enqueueWrite` definitions with canonical helper imports. Preserve registry schema normalization and feature-specific errors in the callers.

- [ ] **Step 3: Add the repository status-plan helper**

  Move the byte-for-byte equivalent path normalization, status lookup, entry normalization/sort key, and SHA-256 fingerprint functions into one server module. Keep feature-specific `safeMessage` functions local because their fallback messages differ.

- [ ] **Step 4: Migrate both plan modules and verify**

  Replace local helper calls/imports, remove unused `node:crypto`, `node:path`, and remote-id imports, then run the four focused test groups.

### Task 7: Final Verification And Audit Closure

**Files:**

- Modify only files required to address failures caused by Tasks 1-6.

**Interfaces:**

- Produces: a clean supported runtime surface with no known high-confidence dead-code candidates from the audit scope.

- [ ] **Step 1: Run strict unused checks**

  Run all three TypeScript projects with `--noUnusedLocals --noUnusedParameters`. Do not treat intentional exhaustive-switch guards as removable behavior.

- [ ] **Step 2: Run project verification**

  Run `bun run typecheck`, `bun run test`, `bun run check:architecture`, Android unit tests, and Android lint. Require zero failures.

- [ ] **Step 3: Verify production artifacts**

  Build Web and an unpacked Electron artifact. Confirm no public test source, duplicate Web icon, or `dist/server` runtime dependency is packaged. Confirm Android no longer packages the two obsolete assets.

- [ ] **Step 4: Review the final diff**

  Use read-only Git commands to ensure all changes belong to this cleanup, the existing README/docs-index edits were preserved, no generated build output is tracked, and no compatibility exclusions were modified.
