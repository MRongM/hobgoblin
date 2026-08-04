# Android tmux Dual Project Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task inline. Steps use checkbox (`- [ ]`) syntax for tracking. Do not dispatch subagents for this plan.

**Goal:** Let an Android user import a tmux-scanned Git worktree either as its primary Git repository or as a plain workspace rooted at the current worktree, with independent imported-state checks.

**Architecture:** Keep tmux discovery unchanged, then resolve all scanned and saved project paths in one lightweight Git-oriented SSH batch. Project the results into independent Git/plain import options and reuse the existing project setup screen for authoritative validation and persistence.

**Tech Stack:** Kotlin, Jetpack Compose Material 3, SSHJ, JUnit 4, Gradle.

## Global Constraints

- Execute inline in this session; do not dispatch subagents.
- Do not create a branch, worktree, Git commit, or Git push.
- Do not change remote tmux discovery, recovery, close, or delete protocol formats.
- Do not add dependencies or change the persisted repository codec.
- Preserve English, Simplified Chinese, Japanese, and Korean resource parity.
- Use `Repository primary worktree` exactly as defined in `CONTEXT.md`; it is not a branch named `main`.
- Follow RED → GREEN → REFACTOR for every production behavior.

---

### Task 1: Represent and resolve primary/current project paths

**Files:**
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/domain/ssh/RemoteRepositorySnapshot.kt`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/ssh/RemoteRepositoryGitService.kt`
- Test: `android/app/src/test/java/com/mrongm/hobgoblin/ssh/RemoteRepositoryGitServiceTest.kt`

**Interfaces:**
- Produces: `RemoteProjectPathResolution(requestedPath, kind, projectPath, worktreePath)`.
- Produces: `RemoteProjectInspection.worktreePath` with a compatibility default equal to `resolvedPath`.
- Produces: `RemoteRepositoryGitService.resolveProjectPaths(target, remotePaths): Map<String, RemoteProjectPathResolution>`.
- Produces: `parseRemoteProjectPathResolutions(output): Map<String, RemoteProjectPathResolution>`.

- [x] **Step 1: Add failing parser and service tests**

Add tests proving a Git record keeps distinct primary/current paths, a plain record uses one path, malformed records are ignored, empty input avoids SSH, and a batch uses one trusted command. Use representative output:

```kotlin
val output = listOf(
    "/srv/app-feature\u0000git\u0000/srv/app-feature\u0000/srv/app",
    "/srv/scripts\u0000plain\u0000/srv/scripts\u0000/srv/scripts",
).joinToString("\n")

val resolutions = parseRemoteProjectPathResolutions(output)

assertEquals("/srv/app", resolutions.getValue("/srv/app-feature").projectPath)
assertEquals("/srv/app-feature", resolutions.getValue("/srv/app-feature").worktreePath)
assertEquals(RemoteProjectKind.PlainWorkspace, resolutions.getValue("/srv/scripts").kind)
```

Extend the existing single-inspection test output with `__HOBGOBLIN_ANDROID_PROJECT_WORKTREE__` and assert `inspection.worktreePath == "/srv/app-feature"` while `resolvedPath == "/srv/app"`.

- [x] **Step 2: Run focused tests and verify RED**

Run from `android/`:

```bash
./gradlew testDebugUnitTest --tests 'com.mrongm.hobgoblin.ssh.RemoteRepositoryGitServiceTest'
```

Expected: compilation fails because `RemoteProjectPathResolution`, `worktreePath`, and `resolveProjectPaths` do not exist.

- [x] **Step 3: Add the minimal path-resolution model**

Add to `RemoteRepositorySnapshot.kt`:

```kotlin
data class RemoteProjectPathResolution(
    val requestedPath: String,
    val kind: RemoteProjectKind,
    val projectPath: String,
    val worktreePath: String,
)

data class RemoteProjectInspection(
    val requestedPath: String,
    val resolvedPath: String,
    val kind: RemoteProjectKind,
    val currentRef: String?,
    val defaultBranch: String?,
    val worktreePath: String = resolvedPath,
)
```

- [x] **Step 4: Implement single and batch SSH resolution**

Keep `projectInspectionScript` authoritative and emit the current worktree before replacing `resolved` with primary:

```sh
top=$(git -C "$resolved" rev-parse --show-toplevel 2>/dev/null || true)
if [ -n "$top" ]; then
  kind=git
  worktree=$top
  primary_worktree=$(git -C "$top" worktree list --porcelain 2>/dev/null | awk '/^worktree / { print substr($0, 10); exit }')
  if [ -n "$primary_worktree" ]; then resolved=$primary_worktree; else resolved=$top; fi
else
  kind=plain
  worktree=$resolved
fi
```

Add `ProjectWorktreeMarker`, parse it with fallback to `resolvedPath`, and add a batch command that prints one NUL-separated line per readable path:

```sh
printf '%s\000%s\000%s\000%s\n' "$requested" "$kind" "$worktree" "$project"
```

`resolveProjectPaths` must deduplicate input paths, return immediately for an empty list, fetch host trust once, run one command, require command success, and return the parser map. A path that cannot be read produces no record rather than failing the whole batch.

- [x] **Step 5: Run focused tests and verify GREEN**

Run the Task 1 command again.

Expected: `RemoteRepositoryGitServiceTest` passes with one fingerprint read and one batch command.

### Task 2: Project two independent tmux import options

**Files:**
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/tmux/TmuxCatalogPresentation.kt`
- Test: `android/app/src/test/java/com/mrongm/hobgoblin/ui/screens/tmux/TmuxCatalogPresentationTest.kt`

**Interfaces:**
- Consumes: `RemoteProjectPathResolution` from Task 1.
- Produces: `HostTmuxProjectImportOption(kind, remotePath, imported)` where `kind == null` is the existing auto-inspection fallback.
- Produces: `hostTmuxProjectImportOptions(hostId, initialPath, resolution, savedPathResolutions, repositories)`.

- [x] **Step 1: Add failing option-policy tests**

Cover these exact scenarios:

```kotlin
val resolution = RemoteProjectPathResolution(
    requestedPath = "/srv/app-feature",
    kind = RemoteProjectKind.GitRepository,
    projectPath = "/srv/app",
    worktreePath = "/srv/app-feature",
)
```

- No saved projects produces Git `/srv/app` and Plain `/srv/app-feature` options.
- Saved Git `/srv/app` disables only the Git option.
- Saved Plain `/srv/app-feature` disables only the Plain option.
- Both records disable both options.
- A saved Git linked-worktree path resolves to `/srv/app` and therefore disables the Git option.
- A non-Git resolution produces only the Plain option.
- Missing resolution produces one nullable-kind fallback using `initialPath` and existing exact matching.
- Another host never disables an option.

- [x] **Step 2: Run focused tests and verify RED**

Run from `android/`:

```bash
./gradlew testDebugUnitTest --tests 'com.mrongm.hobgoblin.ui.screens.tmux.TmuxCatalogPresentationTest'
```

Expected: compilation fails because the import option model and policy are missing.

- [x] **Step 3: Implement the pure import-option policy**

Use `TmuxSessionProtocol.normalizePath` for comparison. For each saved repository, choose its comparison path by kind:

```kotlin
val savedIdentityPath = savedPathResolutions[repository.remotePath]?.let { saved ->
    when (repository.kind) {
        RemoteProjectKind.GitRepository -> saved.projectPath
        RemoteProjectKind.PlainWorkspace -> saved.worktreePath
    }
} ?: repository.remotePath
```

For Git resolutions return options in this order: Git primary, Plain current. For Plain resolutions return only Plain. For no resolution retain one auto option so a Git-resolution outage never hides the existing import flow.

- [x] **Step 4: Run focused tests and verify GREEN**

Run the Task 2 command again.

Expected: all `TmuxCatalogPresentationTest` tests pass.

### Task 3: Carry explicit import kind through setup and save

**Files:**
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/navigation/AppRoute.kt`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/repositories/RepositorySetupScreen.kt`
- Test: `android/app/src/test/java/com/mrongm/hobgoblin/navigation/AppRouteTest.kt`
- Test: `android/app/src/test/java/com/mrongm/hobgoblin/ui/screens/repositories/RepositorySetupStateTest.kt`

**Interfaces:**
- Consumes: `RemoteProjectInspection.worktreePath` from Task 1.
- Produces: `AppRoute.AddRepository.initialProjectKind: RemoteProjectKind?`.
- Produces: `RepositorySetupScreen(initialProjectKind: RemoteProjectKind? = null, ...)`.
- Extends: `createProjectFromInspection(host, alias, inspection, importKind: RemoteProjectKind? = null)`.

- [x] **Step 1: Add failing route and save-policy tests**

Add a route assertion that tmux context retains `RemoteProjectKind.PlainWorkspace`. Add setup assertions:

```kotlin
val inspection = RemoteProjectInspection(
    requestedPath = "/srv/app-feature/subdir",
    resolvedPath = "/srv/app",
    kind = RemoteProjectKind.GitRepository,
    currentRef = "feature/example",
    defaultBranch = "main",
    worktreePath = "/srv/app-feature",
)

assertEquals(
    "/srv/app",
    createProjectFromInspection(host, "App", inspection, RemoteProjectKind.GitRepository).remotePath,
)
assertEquals(
    "/srv/app-feature",
    createProjectFromInspection(host, "Feature", inspection, RemoteProjectKind.PlainWorkspace).remotePath,
)
```

Also assert the Plain result has `kind == PlainWorkspace`, auto mode remains Git, and explicit Git rejects a `PlainWorkspace` inspection.

- [x] **Step 2: Run focused tests and verify RED**

Run from `android/`:

```bash
./gradlew testDebugUnitTest \
  --tests 'com.mrongm.hobgoblin.navigation.AppRouteTest' \
  --tests 'com.mrongm.hobgoblin.ui.screens.repositories.RepositorySetupStateTest'
```

Expected: compilation fails for the new route field and `createProjectFromInspection` argument.

- [x] **Step 3: Implement route and save semantics**

Add the nullable kind to the route and setup screen. Derive the persisted kind/path exactly as follows:

```kotlin
val targetKind = importKind ?: inspection.kind
val targetPath = when (targetKind) {
    RemoteProjectKind.GitRepository -> {
        require(inspection.kind == RemoteProjectKind.GitRepository) {
            "The selected directory is not a Git repository."
        }
        inspection.resolvedPath
    }
    RemoteProjectKind.PlainWorkspace -> inspection.worktreePath
}
```

Pass `targetKind` and `targetPath` to `RemoteRepositoryProfile.create`. The ordinary Add Project route keeps `initialProjectKind = null` and therefore preserves automatic classification.

- [x] **Step 4: Run focused tests and verify GREEN**

Run the Task 3 command again.

Expected: route and setup state tests pass.

### Task 4: Enrich the tmux scan snapshot and render inline choices

**Files:**
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/tmux/TmuxScreenState.kt`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/tmux/TmuxScreen.kt`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/HobgoblinAndroidApp.kt`
- Test: `android/app/src/test/java/com/mrongm/hobgoblin/ui/screens/tmux/TmuxScreenStateTest.kt`
- Test: `android/app/src/test/java/com/mrongm/hobgoblin/ui/screens/tmux/TmuxScreenContractTest.kt`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: `HostTmuxCatalogSnapshot(groups, projectPathResolutions)`.
- Changes: `TmuxScreen.tmuxState` to `ResourceState<HostTmuxCatalogSnapshot>`.
- Changes: `onImportDirectory` to `(RemoteProjectKind?, String) -> Unit`.

- [x] **Step 1: Add failing snapshot and UI contract tests**

Assert the snapshot preserves groups and resolution map. Extend source contracts to require:

- `hostTmuxProjectImportOptions`
- `DropdownMenu`
- both explicit import strings
- per-option `enabled = !option.imported`
- `resolveProjectPaths`
- `initialProjectKind = projectKind`
- tmux discovery still uses the unchanged `discoverHostSessions` call.

- [x] **Step 2: Run focused tmux tests and verify RED**

Run from `android/`:

```bash
./gradlew testDebugUnitTest --tests 'com.mrongm.hobgoblin.ui.screens.tmux.*'
```

Expected: compilation or contract failures because the enriched snapshot and menu wiring are missing.

- [x] **Step 3: Build the enriched runtime snapshot**

After successful tmux discovery:

```kotlin
val groups = HostTmuxPathGroup.from(result.sessions)
val paths = buildList {
    addAll(groups.map(HostTmuxPathGroup::initialPath))
    addAll(currentRepositories().filter { it.hostProfileId == host.id }.map { it.remotePath })
}
val resolutions = runCatching {
    remoteRepositoryGitService.resolveProjectPaths(RemoteTarget.fromHostProfile(host), paths)
}.getOrDefault(emptyMap())
HostTmuxCatalogSnapshot(groups, resolutions)
```

Use the snapshot as one coherent `ResourceState` value. A resolution failure must not convert a successful tmux scan into an error.

- [x] **Step 4: Render the inline Git/plain menu**

For each directory, compute options from Task 2. If there is one available option, preserve a direct action. If there are two options, open a `DropdownMenu`; render imported options disabled with the existing imported text. Disable and relabel the heading button only when every option is imported.

The callback passes the selected `kind` and canonical `remotePath` into:

```kotlin
AppRoute.AddRepository(
    initialHostId = hostId,
    initialRemotePath = remotePath,
    initialProjectKind = projectKind,
    tmuxReturn = TmuxReturn(hostId),
)
```

Pass `currentRoute.initialProjectKind` into `RepositorySetupScreen`.

- [x] **Step 5: Run focused tmux tests and verify GREEN**

Run the Task 4 command again.

Expected: all tmux state, presentation, and contract tests pass.

### Task 5: Add localized mode copy and sharpen domain language

**Files:**
- Modify: `android/app/src/main/res/values/strings.xml`
- Modify: `android/app/src/main/res/values-b+zh+Hans/strings.xml`
- Modify: `android/app/src/main/res/values-ja/strings.xml`
- Modify: `android/app/src/main/res/values-ko/strings.xml`
- Modify: `android/app/src/test/java/com/mrongm/hobgoblin/AndroidLocalizationContractTest.kt`
- Modify: `CONTEXT.md`

**Interfaces:**
- Produces: `tmux_import_as_git_repository` and `tmux_import_as_plain_workspace` in all four catalogs.
- Produces: glossary entries for the two Android tmux import modes and independent identities.

- [x] **Step 1: Add failing localization key assertions**

Extend the tmux localization contract with:

```kotlin
"string:tmux_import_as_git_repository",
"string:tmux_import_as_plain_workspace",
```

- [x] **Step 2: Run localization test and verify RED**

Run from `android/`:

```bash
./gradlew testDebugUnitTest --tests 'com.mrongm.hobgoblin.AndroidLocalizationContractTest'
```

Expected: missing-key assertions fail.

- [x] **Step 3: Add exact localized copy and glossary definitions**

Use:

| Locale | Git | Plain |
|---|---|---|
| en | Import as Git repository | Import as plain workspace |
| zh-Hans | 作为 Git 仓库导入 | 作为普通工作区导入 |
| ja | Git リポジトリとしてインポート | プレーンワークスペースとしてインポート |
| ko | Git 저장소로 가져오기 | 일반 작업 공간으로 가져오기 |

Update `CONTEXT.md` without implementation details: Git mode identifies the repository by primary worktree; plain mode identifies the current worktree root; both may coexist and imported state is type-sensitive.

- [x] **Step 4: Run localization test and verify GREEN**

Run the Task 5 command again.

Expected: resource parity passes.

### Task 6: Full verification and final review

**Files:**
- Verify all files changed by Tasks 1–5 and both planning documents.

**Interfaces:**
- Consumes: the complete feature.
- Produces: evidence that Android and root-project regression gates remain green.

- [x] **Step 1: Run all Android unit tests**

Run from `android/`:

```bash
./gradlew testDebugUnitTest
```

Expected: `BUILD SUCCESSFUL`.

- [x] **Step 2: Build the Android debug APK**

Run from `android/`:

```bash
./gradlew assembleDebug
```

Expected: `BUILD SUCCESSFUL` and an APK under `app/build/outputs/apk/debug/`.

- [x] **Step 3: Run root checks**

Run from repository root:

```bash
bun run typecheck
bun run test
bun run check:architecture
```

Expected: all commands exit successfully without architecture violations.

- [x] **Step 4: Review formatting and scope**

Run from repository root:

```bash
git diff --check
git diff --stat
git status --short
```

Expected: no whitespace errors; only dual-import implementation, tests, localization, glossary, design, and plan files are changed. No commit is created.
