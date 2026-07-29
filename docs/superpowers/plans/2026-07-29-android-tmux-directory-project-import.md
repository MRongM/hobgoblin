# Android tmux Directory Project Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task inline. Do not dispatch subagents for this plan.

**Goal:** Let an Android user manually import one tmux-scanned directory through the existing project setup and validation flow.

**Architecture:** The tmux UI emits only an import-directory intent. A parameterized `AppRoute.AddRepository` carries the selected host, scanned path, and tmux return context into `RepositorySetupScreen`; that screen keeps the existing inspect-and-save write path. Existing local project records are projected into the tmux screen only to suppress an exact host/path duplicate action.

**Tech Stack:** Kotlin, Jetpack Compose Material 3, Android string resources, JUnit 4, Gradle.

## Global Constraints

- Do not modify the remote tmux discovery, identity, recovery, close, or delete protocols.
- Do not add dependencies or change the project persistence format.
- Keep form and navigation state device-local; `RemoteRepositoryStore` remains the only persistence boundary.
- Preserve all four Android resource catalogs: English, Simplified Chinese, Japanese, and Korean.
- Do not create a branch, worktree, Git commit, or Git push unless the user explicitly requests it.
- Verify Android changes plus the repository architecture boundary.

---

### Task 1: Parameterize project setup navigation

**Files:**
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/navigation/AppRoute.kt`
- Test: `android/app/src/test/java/com/mrongm/hobgoblin/navigation/AppRouteTest.kt`

**Interfaces:**
- Produces: `AppRoute.AddRepository(initialHostId: String? = null, initialRemotePath: String? = null, tmuxReturn: TmuxReturn? = null)`.
- Produces: `projectSetupReturnRoute(route: AppRoute.AddRepository): AppRoute` returning the source tmux visit or `AppRoute.Projects`.

- [ ] **Step 1: Add failing route tests**

```kotlin
@Test
fun `ordinary project setup has no import context`() {
    assertEquals(AppRoute.Projects, projectSetupReturnRoute(AppRoute.AddRepository()))
}

@Test
fun `tmux directory import retains prefill and return context`() {
    val route = AppRoute.AddRepository(
        initialHostId = "host-1",
        initialRemotePath = "/srv/app",
        tmuxReturn = TmuxReturn("host-1"),
    )
    assertEquals("host-1", route.initialHostId)
    assertEquals("/srv/app", route.initialRemotePath)
    assertEquals(AppRoute.Tmux("host-1"), projectSetupReturnRoute(route))
}
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `./gradlew testDebugUnitTest --tests 'com.mrongm.hobgoblin.navigation.AppRouteTest'` from `android/`.

Expected: compilation fails because `AddRepository` has no constructor and `projectSetupReturnRoute` is missing.

- [ ] **Step 3: Implement the route contract**

Replace the object with the data class above. Add:

```kotlin
internal fun projectSetupReturnRoute(route: AppRoute.AddRepository): AppRoute =
    route.tmuxReturn?.let { AppRoute.Tmux(selectedHostId = it.hostId) } ?: AppRoute.Projects
```

- [ ] **Step 4: Run the focused route test**

Expected: `AppRouteTest` passes.

### Task 2: Initialize the shared setup form from tmux context

**Files:**
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/repositories/RepositorySetupScreen.kt`
- Test: `android/app/src/test/java/com/mrongm/hobgoblin/ui/screens/repositories/RepositorySetupStateTest.kt`

**Interfaces:**
- Consumes: nullable route prefill values from Task 1.
- Produces: `initialRepositoryHost(authenticatedHosts, initialHostId)` and `initialRepositoryPath(initialRemotePath)` pure state helpers.
- Produces: optional `initialHostId` and `initialRemotePath` parameters on `RepositorySetupScreen`.

- [ ] **Step 1: Add failing state tests**

```kotlin
@Test
fun `project setup prefers an authenticated preselected host`() {
    val first = host(id = "host-1", identityRefId = "identity-1")
    val selected = host(id = "host-2", identityRefId = "identity-2")
    assertEquals(selected, initialRepositoryHost(listOf(first, selected), "host-2"))
    assertEquals(first, initialRepositoryHost(listOf(first, selected), "missing"))
}

@Test
fun `project setup trims its initial remote path`() {
    assertEquals("/srv/app", initialRepositoryPath(" /srv/app "))
    assertEquals("", initialRepositoryPath(null))
}
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `./gradlew testDebugUnitTest --tests 'com.mrongm.hobgoblin.ui.screens.repositories.RepositorySetupStateTest'` from `android/`.

Expected: compilation fails for the two missing helpers.

- [ ] **Step 3: Implement minimal initialization helpers and parameters**

```kotlin
internal fun initialRepositoryHost(
    authenticated: List<SshHostProfile>,
    initialHostId: String?,
): SshHostProfile? = authenticated.firstOrNull { it.id == initialHostId }
    ?: defaultAuthenticatedHost(authenticated)

internal fun initialRepositoryPath(initialRemotePath: String?): String =
    initialRemotePath?.trim().orEmpty()
```

Initialize Compose state with `remember(authenticated, initialHostId)` and `remember(initialRemotePath)` so route changes cannot retain a prior form's host or path.

- [ ] **Step 4: Run the focused setup tests**

Expected: `RepositorySetupStateTest` passes.

### Task 3: Add directory-level import presentation

**Files:**
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/tmux/TmuxCatalogPresentation.kt`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/tmux/TmuxScreen.kt`
- Test: `android/app/src/test/java/com/mrongm/hobgoblin/ui/screens/tmux/TmuxCatalogPresentationTest.kt`
- Test: `android/app/src/test/java/com/mrongm/hobgoblin/ui/screens/tmux/TmuxScreenContractTest.kt`

**Interfaces:**
- Consumes: selected host id, `List<RemoteRepositoryProfile>`, and group `initialPath`.
- Produces: `hostTmuxPathIsImported(hostId, initialPath, repositories): Boolean`.
- Produces: `TmuxScreen(... repositories, onImportDirectory)` and a directory-heading action.

- [ ] **Step 1: Add failing imported-path policy tests**

Cover exact same host/path, normalized trailing slash, different host, and different path. The positive assertion must use:

```kotlin
assertTrue(hostTmuxPathIsImported("host-1", "/srv/app/", listOf(project)))
```

and the negative assertions must prove that another host or `/srv/api` does not match.

- [ ] **Step 2: Run tmux presentation tests and confirm failure**

Run: `./gradlew testDebugUnitTest --tests 'com.mrongm.hobgoblin.ui.screens.tmux.*'` from `android/`.

Expected: compilation fails for `hostTmuxPathIsImported` or the contract assertion fails because no import callback/resource exists.

- [ ] **Step 3: Implement exact normalized matching**

```kotlin
internal fun hostTmuxPathIsImported(
    hostId: String,
    initialPath: String,
    repositories: List<RemoteRepositoryProfile>,
): Boolean {
    val normalizedPath = TmuxSessionProtocol.normalizePath(initialPath)
    return repositories.any { repository ->
        repository.hostProfileId == hostId &&
            TmuxSessionProtocol.normalizePath(repository.remotePath) == normalizedPath
    }
}
```

Thread `repositories` and `onImportDirectory` through `TmuxScreen`, `HostTmuxCatalog`, and `HostTmuxGroups`. Render a `TextButton` in each directory heading row; use the imported label and disabled state for a match, otherwise invoke `onImportDirectory(group.initialPath)`.

- [ ] **Step 4: Extend the source contract test**

Assert that `TmuxScreen.kt` contains `onImportDirectory`, `hostTmuxPathIsImported`, `R.string.tmux_import_project`, and `R.string.tmux_project_imported`.

- [ ] **Step 5: Run focused tmux tests**

Expected: all `ui.screens.tmux` tests pass.

### Task 4: Wire import navigation and return behavior

**Files:**
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/HobgoblinAndroidApp.kt`
- Test: `android/app/src/test/java/com/mrongm/hobgoblin/ui/screens/tmux/TmuxScreenContractTest.kt`

**Interfaces:**
- Consumes: Task 1 route and Task 2/3 Compose parameters.
- Produces: end-to-end renderer-local navigation from tmux directory to shared project setup and back.

- [ ] **Step 1: Add failing application wiring assertions**

Read `HobgoblinAndroidApp.kt` in the contract test and assert it contains the tmux import route construction with `initialHostId`, `initialRemotePath`, and `TmuxReturn`, plus `projectSetupReturnRoute(currentRoute)` for Back.

- [ ] **Step 2: Run the contract test and confirm failure**

Expected: the new source assertions fail.

- [ ] **Step 3: Wire the route**

Use `AppRoute.AddRepository()` for the global Add Project action. In `TmuxScreen`, pass current repositories and create:

```kotlin
onImportDirectory = { initialPath ->
    val hostId = requireNotNull(tmuxVisit.selectedHostId)
    route = AppRoute.AddRepository(
        initialHostId = hostId,
        initialRemotePath = initialPath,
        tmuxReturn = TmuxReturn(hostId),
    )
}
```

Handle `is AppRoute.AddRepository`; pass both initial values to `RepositorySetupScreen`. Back uses `projectSetupReturnRoute(currentRoute)`. After a successful save, reload projects and return only when `tmuxReturn != null`; ordinary Add Project preserves its current stay-on-form behavior.

- [ ] **Step 4: Run navigation, setup, and tmux tests together**

Expected: the focused suites pass.

### Task 5: Add localized copy and project terminology

**Files:**
- Modify: `android/app/src/main/res/values/strings.xml`
- Modify: `android/app/src/main/res/values-b+zh+Hans/strings.xml`
- Modify: `android/app/src/main/res/values-ja/strings.xml`
- Modify: `android/app/src/main/res/values-ko/strings.xml`
- Modify: `android/app/src/test/java/com/mrongm/hobgoblin/AndroidLocalizationContractTest.kt`
- Modify: `CONTEXT.md`

**Interfaces:**
- Produces: `tmux_import_project` and `tmux_project_imported` in all catalogs.

- [ ] **Step 1: Add failing localization key assertions**

Extend the tmux copy key set with `string:tmux_import_project` and `string:tmux_project_imported`.

- [ ] **Step 2: Run localization tests and confirm failure**

Run: `./gradlew testDebugUnitTest --tests 'com.mrongm.hobgoblin.AndroidLocalizationContractTest'` from `android/`.

Expected: the new key assertion fails.

- [ ] **Step 3: Add concise sentence-case translations**

- English: `Import project`, `Imported`
- Simplified Chinese: `导入项目`, `已导入`
- Japanese: `プロジェクトをインポート`, `インポート済み`
- Korean: `프로젝트 가져오기`, `가져옴`

Add one concise `CONTEXT.md` term describing Android tmux directory project import as an explicit, device-local project setup action, distinct from automatic tmux discovery and automatic import.

- [ ] **Step 4: Run localization tests**

Expected: localization key parity and tmux key coverage pass.

### Task 6: Full verification

**Files:**
- Verify all files changed by Tasks 1–5.

- [ ] **Step 1: Run all Android unit tests**

Run: `./gradlew testDebugUnitTest` from `android/`.

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 2: Build the Android debug APK**

Run: `./gradlew assembleDebug` from `android/`.

Expected: `BUILD SUCCESSFUL` and a debug APK under `android/app/build/outputs/apk/debug/`.

- [ ] **Step 3: Run root type checking and tests**

Run from repository root: `bun run typecheck` and `bun run test`.

Expected: both commands exit successfully.

- [ ] **Step 4: Run the architecture guard**

Run from repository root: `bun run check:architecture`.

Expected: command exits successfully with no boundary violations.

- [ ] **Step 5: Inspect the final diff and workspace state**

Run: `git diff --check`, `git diff --stat`, and `git status --short`.

Expected: no whitespace errors; only feature files and the two planning documents are modified/untracked; no commit is created.
