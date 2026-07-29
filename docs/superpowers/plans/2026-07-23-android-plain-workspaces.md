# Android Plain Workspaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow Android to save and open readable remote directories without Git metadata as Plain workspace projects.

**Architecture:** Add a persisted project kind to the existing Android remote-project profile, classify selected paths through the current trusted SSH boundary, and derive workspace capabilities from that kind. Existing Git records decode as Git projects, while Plain workspaces skip all Git snapshot and mutation paths and reuse the root terminal experience.

**Tech Stack:** Kotlin 2.3.21, Jetpack Compose Material 3, SSHJ 0.40.0, JUnit 4, Gradle 9.5.1

## Global Constraints

- Work inline in the current linked worktree; do not create branches, commits, pushes, or pull requests.
- Use the canonical term `Plain workspace`; never call it a non-Git repository.
- Add no dependencies.
- Preserve existing four-field project records by decoding them as Git repositories.
- Keep the existing terminal record `repositoryId` field for storage compatibility.
- Plain workspaces must never invoke Git snapshot, branch, or worktree operations.
- Keep UI copy in sentence case and status/kind labels stable.
- Verify Android-only changes with Gradle unit tests and Debug APK assembly; do not run the TypeScript/Vitest gate.

---

### Task 1: Persist an explicit project kind

**Files:**
- Modify: `android/app/src/main/java/dev/hobgoblin/android/domain/ssh/RemoteRepositoryProfile.kt`
- Modify: `android/app/src/main/java/dev/hobgoblin/android/data/RemoteRepositoryStore.kt`
- Test: `android/app/src/test/java/dev/hobgoblin/android/data/RemoteRepositoryStoreTest.kt`

**Interfaces:**
- Produces: `RemoteProjectKind`, `RemoteRepositoryProfile.kind`, `RemoteRepositoryProfile.isGitRepository`.
- Compatibility: four-field codec records decode as `RemoteProjectKind.GitRepository`; five-field records preserve their kind.

- [x] **Step 1: Write failing profile and codec tests**

Add tests asserting:

```kotlin
val plain = RemoteRepositoryProfile.create(
    hostProfileId = "host-1",
    alias = "Scripts",
    remotePath = "/srv/scripts",
    kind = RemoteProjectKind.PlainWorkspace,
)
assertFalse(plain.isGitRepository)
assertEquals(listOf(plain), RemoteRepositoryCodec.decode(RemoteRepositoryCodec.encode(listOf(plain))))
```

Also encode a legacy four-field Base64 record and assert its decoded kind is `GitRepository`.

- [x] **Step 2: Run the store tests and verify RED**

```bash
./gradlew testDebugUnitTest --tests "dev.hobgoblin.android.data.RemoteRepositoryStoreTest"
```

Expected: compilation fails because `RemoteProjectKind` and `kind` do not exist.

- [x] **Step 3: Add the project kind and compatible codec**

Implement:

```kotlin
enum class RemoteProjectKind(val storageValue: String) {
    GitRepository("git"),
    PlainWorkspace("plain"),
}

data class RemoteRepositoryProfile(
    // existing fields
    val kind: RemoteProjectKind = RemoteProjectKind.GitRepository,
) {
    val isGitRepository: Boolean = kind == RemoteProjectKind.GitRepository
}
```

Encode five fields. Decode four fields as `GitRepository`, decode five fields from the known storage value, and skip records containing an unknown kind value.

- [x] **Step 4: Run the store tests and verify GREEN**

Run the Step 2 command. Expected: all store tests pass.

### Task 2: Classify a remote path as Git or Plain

**Files:**
- Modify: `android/app/src/main/java/dev/hobgoblin/android/domain/ssh/RemoteRepositorySnapshot.kt`
- Modify: `android/app/src/main/java/dev/hobgoblin/android/ssh/RemoteRepositoryGitService.kt`
- Test: `android/app/src/test/java/dev/hobgoblin/android/ssh/RemoteRepositoryGitServiceTest.kt`

**Interfaces:**
- Produces: `RemoteProjectInspection`, `RemoteRepositoryGitService.inspectProject(target)`.
- Requires: the existing trusted host-key and private-key SSH command boundary.

- [x] **Step 1: Write failing classification tests**

Cover marked output for both kinds:

```kotlin
assertEquals(RemoteProjectKind.GitRepository, git.kind)
assertEquals("/srv/app", git.resolvedPath)
assertEquals(RemoteProjectKind.PlainWorkspace, plain.kind)
assertEquals("/srv/scripts", plain.resolvedPath)
```

Change the previous non-Git rejection test so a successful `plain` inspection is accepted. Keep a command failure test asserting an unreadable path throws and is not classified.

- [x] **Step 2: Run the SSH service tests and verify RED**

```bash
./gradlew testDebugUnitTest --tests "dev.hobgoblin.android.ssh.RemoteRepositoryGitServiceTest"
```

Expected: compilation fails because project inspection APIs do not exist.

- [x] **Step 3: Add project inspection output and parser**

Create:

```kotlin
data class RemoteProjectInspection(
    val requestedPath: String,
    val resolvedPath: String,
    val kind: RemoteProjectKind,
    val currentRef: String?,
    val defaultBranch: String?,
)
```

The SSH script must first require a readable directory, resolve it with `pwd -P`, then attempt `git rev-parse --show-toplevel`. Emit explicit kind/path/current/default markers. A missing Git work tree emits `plain` and succeeds; path access failure keeps a non-zero command result.

- [x] **Step 4: Keep Git-only APIs strict**

Do not change `loadSnapshot`, branch services, or worktree services. They continue to reject paths that are not Git repositories.

- [x] **Step 5: Run the SSH service tests and verify GREEN**

Run the Step 2 command. Expected: all service tests pass.

### Task 3: Build and list both project kinds

**Files:**
- Modify: `android/app/src/main/java/dev/hobgoblin/android/ui/screens/repositories/RepositorySetupScreen.kt`
- Modify: `android/app/src/main/java/dev/hobgoblin/android/ui/screens/projects/ProjectsScreen.kt`
- Test: `android/app/src/test/java/dev/hobgoblin/android/ui/screens/repositories/RepositorySetupStateTest.kt`
- Test: `android/app/src/test/java/dev/hobgoblin/android/ui/screens/projects/ProjectsScreenStateTest.kt`

**Interfaces:**
- Consumes: `RemoteProjectInspection`.
- Produces: `createProjectFromInspection`, `projectKindLabel`, capability-derived workspace tabs and initial tab.

- [x] **Step 1: Write failing setup and list tests**

Assert that inspection creates the matching kind and resolved path, and that labels are stable:

```kotlin
assertEquals("Git repository", projectKindLabel(gitProject))
assertEquals("Plain workspace", projectKindLabel(plainProject))
assertEquals(listOf(RepositoryWorkspaceTab.Terminal), repositoryWorkspaceTabs(plainProject))
assertEquals(
    RepositoryWorkspaceTab.Terminal,
    initialRepositoryWorkspaceTab(plainProject, initialTerminalWorkspacePath = null),
)
```

Update empty-state copy to mention both remote Git repositories and Plain workspaces.

- [x] **Step 2: Run focused UI state tests and verify RED**

```bash
./gradlew testDebugUnitTest \
  --tests "dev.hobgoblin.android.ui.screens.repositories.RepositorySetupStateTest" \
  --tests "dev.hobgoblin.android.ui.screens.projects.ProjectsScreenStateTest"
```

Expected: new assertions fail because all projects are currently treated as Git repositories.

- [x] **Step 3: Generalize setup construction**

Replace `createRepositoryFromInspection` with `createProjectFromInspection`, copying `inspection.resolvedPath` and `inspection.kind`. Rename the setup callback to `onInspectProject` and use `Project validation failed` copy.

- [x] **Step 4: Render project kind in the list**

Add one secondary label beneath the title/path using `projectKindLabel`. Preserve Open, Terminals, and Delete actions for both kinds.

- [x] **Step 5: Gate workspace tabs and refresh by capability**

Return Branches/Worktrees/Terminals for Git projects and Terminals only for Plain workspaces. Initialize Plain workspaces on Terminal, skip the initial snapshot `LaunchedEffect`, and hide the Git Refresh action for Plain workspaces.

- [x] **Step 6: Run focused UI state tests and verify GREEN**

Run the Step 2 command. Expected: all focused tests pass.

### Task 4: Wire project inspection and verify end to end

**Files:**
- Modify: `android/app/src/main/java/dev/hobgoblin/android/HobgoblinAndroidApp.kt`
- Modify as required by signatures: Android project tests and call sites.
- Verify: `android/`

**Interfaces:**
- Consumes: `RemoteRepositoryGitService.inspectProject` and capability-driven `RepositoryWorkspaceScreen`.
- Produces: saved Plain workspace records that open root-scoped internal and external terminals without Git calls.

- [x] **Step 1: Wire setup to project inspection**

Pass:

```kotlin
onInspectProject = { host, remotePath ->
    remoteRepositoryGitService.inspectProject(RemoteTarget.fromHostProfile(host, remotePath))
}
```

Keep terminal creation using the project's `remotePath` and current project id association.

- [x] **Step 2: Run all focused feature tests**

```bash
./gradlew testDebugUnitTest \
  --tests "dev.hobgoblin.android.data.RemoteRepositoryStoreTest" \
  --tests "dev.hobgoblin.android.ssh.RemoteRepositoryGitServiceTest" \
  --tests "dev.hobgoblin.android.ui.screens.repositories.RepositorySetupStateTest" \
  --tests "dev.hobgoblin.android.ui.screens.projects.ProjectsScreenStateTest"
```

Expected: BUILD SUCCESSFUL.

- [x] **Step 3: Run the Android release gate**

```bash
./gradlew testDebugUnitTest assembleDebug
```

Expected: BUILD SUCCESSFUL with zero failed unit tests and a generated Debug APK.

- [x] **Step 4: Check final diff and acceptance**

```bash
git diff --check
git status --short
```

Distinguish this feature from the existing uncommitted SSH-diagnostics and Terminals-tab changes in the shared worktree. Verify every acceptance criterion in the design document and record that real-server device testing remains manual unless a test host is provided.
