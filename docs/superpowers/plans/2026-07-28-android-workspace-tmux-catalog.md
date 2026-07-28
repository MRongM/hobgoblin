# Android Workspace Tmux Catalog Implementation Plan

> **Superseded:** 该计划已由 `2026-07-28-android-host-tmux-catalog.md` 取代，不再执行。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only, Host-scoped Android workspace catalog that finds existing branch-workspace tmux sessions and attaches them without creating or deleting remote state.

**Architecture:** Android reads the server-owned v1 workspace registries over trusted SSH, projects direct-host absolute-path workspaces, and discovers tmux sessions in one scoped batch while preserving the current deterministic identity checks. A dedicated Compose overview presents repositories as context and branch workspaces as an inline-expandable terminal index; recovered sessions reuse the retained-terminal lifecycle with an attach-existing reconnect policy.

**Tech Stack:** Kotlin 2.3, Android Compose Material 3, SSHJ 0.40, Android `org.json`, JUnit 4, existing TypeScript/Vitest server sources.

## Global Constraints

- Server code is the only writer of `workspace-configs.json` and `branch-workspaces.json`; Android is strictly read-only.
- Accept registry `version: 1`, ignore additive unknown fields, and fail closed on invalid required data.
- Only direct-host absolute-path workspaces are visible; ignore nested `ssh-config://` roots.
- Do not add dependencies, offline persistence, polling, workspace mutations, repository actions, terminal creation, or remote tmux cleanup.
- Reuse repo aliases with explicit `.ts` extensions in TypeScript and keep Node strip-only TypeScript constraints green.
- Keep fixtures and tests privacy-safe with generic `/srv/workspace` paths and generic identities.
- Follow existing Android English source naming and all four localized resource sets.
- Do not create Git commits; project instructions reserve commits for an explicit user request.

---

## File Structure

- Create `fixtures/workspace-catalog/v1/workspace-configs.json`
  - Shared valid v1 configured-workspace fixture.
- Create `fixtures/workspace-catalog/v1/branch-workspaces.json`
  - Shared valid v1 branch-workspace fixture with root and two repository members.
- Modify `android/app/build.gradle.kts`
  - Expose the root `fixtures/` directory as JVM test resources.
- Create `android/app/src/main/java/com/mrongm/hobgoblin/domain/workspace/WorkspaceCatalogModels.kt`
  - Pure registry, catalog, availability, tmux-group, and UI-facing snapshot types.
- Create `android/app/src/main/java/com/mrongm/hobgoblin/data/WorkspaceRegistryCodec.kt`
  - Strict v1 JSON parsing and cross-record relationship validation.
- Create `android/app/src/test/java/com/mrongm/hobgoblin/data/WorkspaceRegistryCodecTest.kt`
  - Shared-fixture and malformed-contract tests.
- Modify `src/server/modules/workspace-config-source.test.ts`
  - Read the shared workspace fixture through the authoritative TypeScript source.
- Modify `src/server/modules/branch-workspace-source.test.ts`
  - Read the shared branch-workspace fixture through the authoritative TypeScript source.
- Create `android/app/src/main/java/com/mrongm/hobgoblin/ssh/RemoteWorkspaceCatalogService.kt`
  - Trusted SSH data-directory resolution, bounded registry reads, path inspection, and catalog projection.
- Create `android/app/src/test/java/com/mrongm/hobgoblin/ssh/RemoteWorkspaceCatalogServiceTest.kt`
  - SSH script, missing/invalid file, path, ordering, and partial-error tests.
- Modify `android/app/src/main/java/com/mrongm/hobgoblin/terminals/TmuxSessionProtocol.kt`
  - Generate and parse one multi-project discovery command and add strict attach-existing command generation.
- Modify `android/app/src/main/java/com/mrongm/hobgoblin/terminals/RemoteTmuxSessionService.kt`
  - Add batch discovery; keep the existing single-scope method as a delegate.
- Modify `android/app/src/test/java/com/mrongm/hobgoblin/terminals/TmuxSessionProtocolTest.kt`
  - Batch scope isolation, legacy dedupe, and attach-existing tests.
- Modify `android/app/src/test/java/com/mrongm/hobgoblin/terminals/RemoteTmuxSessionServiceTest.kt`
  - Trusted one-command batch service tests.
- Create `android/app/src/main/java/com/mrongm/hobgoblin/domain/workspace/WorkspaceTmuxCatalog.kt`
  - Build discovery scopes and group validated sessions back under branch workspace root/member locations.
- Create `android/app/src/test/java/com/mrongm/hobgoblin/domain/workspace/WorkspaceTmuxCatalogTest.kt`
  - Scope and grouping tests, including unconfigured retained members.
- Modify `android/app/src/main/java/com/mrongm/hobgoblin/terminals/TerminalStartupContext.kt`
  - Distinguish `AttachOrCreate` from `AttachExisting`.
- Modify `android/app/src/main/java/com/mrongm/hobgoblin/terminals/SshTerminalService.kt`
  - Select the correct tmux startup command.
- Modify `android/app/src/main/java/com/mrongm/hobgoblin/terminals/TerminalSessionModels.kt`
  - Allow a recovery candidate without a device-local repository record.
- Modify `android/app/src/main/java/com/mrongm/hobgoblin/terminals/TerminalSessionManager.kt`
  - Reuse deterministic recovered records and reconnect retained tmux with attach-existing.
- Modify terminal manager/service tests
  - Prove disappeared discovered sessions never recreate tmux.
- Modify `android/app/src/main/java/com/mrongm/hobgoblin/navigation/AppRoute.kt`
  - Add workspace overview and terminal return context routes.
- Modify `android/app/src/test/java/com/mrongm/hobgoblin/navigation/AppRouteTest.kt`
  - Cover workspace terminal Back behavior.
- Modify `android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/projects/ProjectsScreen.kt`
  - Add the separate Host-scoped workspace section.
- Modify `android/app/src/test/java/com/mrongm/hobgoblin/ui/screens/projects/ProjectsScreenStateTest.kt`
  - Cover global-vs-filtered catalog visibility.
- Create `android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/workspaces/WorkspaceCatalogScreen.kt`
  - Terminal-first overview, one expanded branch workspace, path spine, states, and pull-to-refresh.
- Create `android/app/src/test/java/com/mrongm/hobgoblin/ui/screens/workspaces/WorkspaceCatalogScreenStateTest.kt`
  - Pure presentation and expansion tests.
- Modify `android/app/src/main/java/com/mrongm/hobgoblin/HobgoblinAndroidApp.kt`
  - Runtime state, loading, refresh, recovery/reconnect, and navigation wiring.
- Modify `android/app/src/main/java/com/mrongm/hobgoblin/MainActivity.kt`
  - Construct and inject `RemoteWorkspaceCatalogService`.
- Modify all four Android `strings.xml` files
  - Workspace catalog labels, counts, errors, stale state, empty terminal state, and accessibility copy.

---

### Task 1: Versioned Cross-Client Registry Contract

**Files:** shared fixtures, Gradle test resources, workspace domain models, registry codec, Kotlin and TypeScript source tests.

**Interfaces:**

- Produces `WorkspaceRegistryCodec.decodeWorkspaceConfigs(text)` and `decodeBranchWorkspaces(text)`.
- Produces validated `WorkspaceConfigRegistry` and `BranchWorkspaceRegistry` values for the SSH source.
- Does not perform I/O or path availability checks.

- [ ] **Step 1: Add shared v1 fixtures**

Use `/srv/workspace` with ordered repositories `api`, `web`. Add branch workspace `feature/auth` at `/srv/workspace/hobgoblin-feature-auth` with members at exact child paths and no real user data.

- [ ] **Step 2: Add failing TypeScript fixture tests**

Read the fixture JSON and pass temporary copies to the existing source functions:

```ts
const fixture = await readFile(
  new URL('../../../fixtures/workspace-catalog/v1/workspace-configs.json', import.meta.url),
  'utf8',
)
await writeFile(dataFile, fixture)
await expect(readWorkspaceConfig('/srv/workspace', { dataFile })).resolves.toEqual({
  kind: 'ready',
  config: { repo: ['api', 'web'] },
})
```

The branch source test must assert the manifest ID, common branch, member order, and exact paths.

- [ ] **Step 3: Configure shared JVM test resources**

In `android/app/build.gradle.kts`:

```kotlin
sourceSets {
    getByName("test").resources.srcDir("../../fixtures")
}
```

- [ ] **Step 4: Add failing Kotlin codec tests**

Cover valid shared fixtures, additive fields, wrong version, duplicate roots, duplicate branch workspace IDs, relative/control-character paths, invalid directory names, duplicate members, and mismatched member paths.

```kotlin
private fun fixture(name: String): String =
    requireNotNull(javaClass.classLoader?.getResource("workspace-catalog/v1/$name"))
        .readText()

@Test
fun `shared v1 fixtures preserve configured and branch workspace order`() {
    val configs = WorkspaceRegistryCodec.decodeWorkspaceConfigs(fixture("workspace-configs.json"))
    val branches = WorkspaceRegistryCodec.decodeBranchWorkspaces(fixture("branch-workspaces.json"))
    assertEquals(listOf("api", "web"), configs.workspaces.single().repositoryNames)
    assertEquals("feature/auth", branches.workspaces.single().branchWorkspaces.single().branch)
}
```

- [ ] **Step 5: Implement pure models and strict codec**

Use Android platform `org.json`; do not add a serialization dependency. Normalize with `TmuxSessionProtocol.normalizePath`, require exact normalized values for persisted paths, ignore unknown keys, and model operations as a closed enum.

- [ ] **Step 6: Run contract tests**

```bash
./gradlew :app:testDebugUnitTest --tests "com.mrongm.hobgoblin.data.WorkspaceRegistryCodecTest"
bun run test -- src/server/modules/workspace-config-source.test.ts src/server/modules/branch-workspace-source.test.ts
```

Expected: all selected tests pass.

---

### Task 2: Trusted SSH Workspace Catalog Source

**Files:** `RemoteWorkspaceCatalogService.kt` and its tests.

**Interfaces:**

```kotlin
sealed interface RemoteWorkspaceCatalogResult {
    data class Loaded(val snapshot: RemoteWorkspaceCatalogSnapshot) : RemoteWorkspaceCatalogResult
    data class Failed(val message: String) : RemoteWorkspaceCatalogResult
}

class RemoteWorkspaceCatalogService {
    fun loadCatalog(target: RemoteTarget, inspectPaths: Boolean = false): RemoteWorkspaceCatalogResult
}
```

- [ ] **Step 1: Add failing data-directory and bounded-read tests**

Assert script behavior for visible `GOBLIN_SERVER_DATA_DIR`, Darwin, XDG, HOME fallback, unreadable directory, missing files, and files over `4 * 1024 * 1024` bytes. Fake command results must never contain credentials or real paths.

- [ ] **Step 2: Add failing projection tests**

Assert absolute roots remain ordered, `ssh-config://` roots are ignored, repository paths derive from `root/name`, branch manifests join by exact root, an invalid branch registry becomes a partial `branchWorkspaceError`, and `inspectPaths=true` maps directory probes without deleting unavailable rows.

- [ ] **Step 3: Implement trusted registry reads**

Reuse `HostKeyTrustStore`. Resolve the remote data directory inside a quoted POSIX script, verify it is readable, use `wc -c` before `base64`, and return separate status markers for directory missing, file missing, ready, and oversized. Decode base64 in Kotlin before calling the pure codec.

- [ ] **Step 4: Implement catalog projection and batched path probes**

Build one quoted path-probe script per selected workspace refresh. Probe only workspace roots, configured repository roots, branch workspace roots, and manifest member paths. Never invoke Git or inspect auxiliary entry contents.

- [ ] **Step 5: Run focused tests**

```bash
./gradlew :app:testDebugUnitTest --tests "com.mrongm.hobgoblin.ssh.RemoteWorkspaceCatalogServiceTest"
```

Expected: all service tests pass and fake SSH sees only trusted, bounded, read-only commands.

---

### Task 3: One-Command Multi-Project Tmux Discovery

**Files:** tmux protocol/service files and tests.

**Interfaces:**

```kotlin
data class TmuxDiscoveryScope(
    val projectRoot: String,
    val allowedInitialPaths: Set<String>,
)

data class ScopedDiscoveredTmuxSession(
    val projectRoot: String,
    val discovery: DiscoveredTmuxSession,
)

fun RemoteTmuxSessionService.discoverAssociatedSessions(
    target: RemoteTarget,
    scopes: List<TmuxDiscoveryScope>,
): RemoteTmuxBatchDiscoveryResult
```

- [ ] **Step 1: Add failing protocol tests**

Cover normalized scope dedupe, numeric scope markers, one legacy-default listing, project-server preference, arbitrary session rejection, metadata mismatch, the same path under the wrong project root, and stable ordering by scope/path/terminal number.

- [ ] **Step 2: Add failing service tests**

Prove one host fingerprint trust decision and one `runCommand` call serve all scopes. Invalid scope input must fail before SSH. Missing tmux servers are an empty success; missing tmux executable is a failure.

- [ ] **Step 3: Implement batch script generation and parsing**

List each deterministic project server with a numeric scope marker. List legacy default once, then attempt to validate each legacy row against scopes whose allowed path contains the row's exact initial path. Deduplicate by session name with project-scoped rows inserted first.

- [ ] **Step 4: Delegate the existing single-scope API**

Keep current callers source-compatible by wrapping one `TmuxDiscoveryScope` and projecting the matching discoveries back to `RemoteTmuxDiscoveryResult`.

- [ ] **Step 5: Run focused tmux tests**

```bash
./gradlew :app:testDebugUnitTest \
  --tests "com.mrongm.hobgoblin.terminals.TmuxSessionProtocolTest" \
  --tests "com.mrongm.hobgoblin.terminals.RemoteTmuxSessionServiceTest"
```

Expected: all existing and new tmux tests pass.

---

### Task 4: Workspace Grouping and Attach-Existing Recovery

**Files:** workspace tmux projector, terminal startup/recovery files, and tests.

**Interfaces:**

```kotlin
enum class TmuxStartupPolicy { AttachOrCreate, AttachExisting }

fun workspaceTmuxDiscoveryScopes(
    workspace: RemoteConfiguredWorkspaceSnapshot,
): List<TmuxDiscoveryScope>

fun projectWorkspaceTmuxSessions(
    workspace: RemoteConfiguredWorkspaceSnapshot,
    discoveries: List<ScopedDiscoveredTmuxSession>,
): RemoteConfiguredWorkspaceSnapshot
```

- [ ] **Step 1: Add failing scope/group tests**

Assert one workspace-root scope, one scope per distinct configured or retained manifest repository, root/member grouping, manifest order, empty groups, exact terminal counts, and unavailable paths retaining exact discoveries.

- [ ] **Step 2: Add failing strict reconnect tests**

Add protocol/service tests proving `AttachExisting` checks the project server then legacy default and exits with an actionable failure when absent; it must contain no `new-session`. Existing `AttachOrCreate` tests must keep `new-session` behavior.

- [ ] **Step 3: Add failing recovered-record reuse tests**

Allow `TmuxTerminalRecoveryCandidate.repositoryId` to be nullable. Add `recoverOrGetTmuxSession(candidate)` tests for deterministic identity reuse, preserved record position, null repository ownership, exact `repositoryRemotePath`, and no duplicate session creation.

- [ ] **Step 4: Implement grouping and strict startup policy**

`createNew(..., TmuxIfAvailable)` opens with `AttachOrCreate`; `reconnect` of an existing tmux identity opens with `AttachExisting`. `SshTerminalService` selects `attachOrCreateCommand` or new `attachExistingCommand` from `TerminalStartupContext`.

- [ ] **Step 5: Run terminal recovery tests**

```bash
./gradlew :app:testDebugUnitTest \
  --tests "com.mrongm.hobgoblin.domain.workspace.WorkspaceTmuxCatalogTest" \
  --tests "com.mrongm.hobgoblin.terminals.TerminalSessionManagerTest" \
  --tests "com.mrongm.hobgoblin.terminals.SshTerminalServiceTest"
```

Expected: recovered catalog terminals attach existing sessions only; ordinary new tmux terminals retain current behavior.

---

### Task 5: Host-Scoped Navigation and Runtime Wiring

**Files:** `AppRoute.kt`, `HobgoblinAndroidApp.kt`, `MainActivity.kt`, route tests.

**Interfaces:**

```kotlin
data class WorkspaceCatalogReturn(
    val hostId: String,
    val rootPath: String,
    val expandedBranchWorkspaceId: String?,
)

data class AppRoute.WorkspaceCatalog(
    val hostId: String,
    val rootPath: String,
    val expandedBranchWorkspaceId: String? = null,
) : AppRoute
```

- [ ] **Step 1: Add failing navigation tests**

Cover workspace route identity, terminal Back to the same root/expanded item, Terminals-tab open returning to Terminals, and notification navigation for a retained tmux record without a local repository returning to Terminals.

- [ ] **Step 2: Extend routes and pure return policy**

Add an optional workspace return descriptor to `AppRoute.Terminal`. Check `returnToTerminals` first, then workspace return, then existing temporary/repository/host behavior.

- [ ] **Step 3: Inject the catalog service**

Construct `RemoteWorkspaceCatalogService` in `MainActivity` with the existing `SshjClientFacade` and `HostKeyStore`; pass it to `HobgoblinAndroidApp`.

- [ ] **Step 4: Add runtime loading and refresh**

Load the top-level catalog only when `projectHostFilterId` is non-null. On a workspace route, reload with path inspection, build scopes, run batch tmux discovery, group sessions, and expose `ResourceState.Loaded/Stale/Error` without writing storage.

- [ ] **Step 5: Add terminal open orchestration**

On row click, call `recoverOrGetTmuxSession`, reconnect if inactive using the existing foreground bridge, and route with `WorkspaceCatalogReturn`. Prefer the retained record's `targetLabel` in Terminal screen rendering.

- [ ] **Step 6: Run route and app-state tests**

```bash
./gradlew :app:testDebugUnitTest \
  --tests "com.mrongm.hobgoblin.navigation.AppRouteTest" \
  --tests "com.mrongm.hobgoblin.ui.screens.projects.ProjectsScreenStateTest"
```

Expected: existing routes stay green and new workspace returns are exact.

---

### Task 6: Terminal-First Compose Surfaces and Localization

**Files:** Projects screen, new workspace screen, four locale files, and UI state tests.

**Interfaces:**

```kotlin
@Composable
fun WorkspaceCatalogScreen(
    workspaceState: ResourceState<RemoteConfiguredWorkspaceSnapshot>,
    initialExpandedBranchWorkspaceId: String?,
    onBack: () -> Unit,
    onRefresh: () -> Unit,
    onOpenTerminal: (RemoteWorkspaceTmuxTerminal, String) -> Unit,
)
```

- [ ] **Step 1: Add failing Projects presentation tests**

Assert catalog visibility requires a Host filter, workspace order stays remote-owned, local Project reorder inputs exclude workspaces, and local empty-state copy does not hide a non-empty workspace group.

- [ ] **Step 2: Add failing workspace presentation tests**

Test default repository collapse, one expanded branch workspace, root group before members, terminal count labels, attention state, no-terminal copy, stale banner, branch registry error, tmux error, and terminal accessibility labels.

- [ ] **Step 3: Implement Host-scoped workspace cards**

Add a separate section above saved Projects in the filtered page. Cards show basename, absolute root path, repository count, branch workspace count, and one open affordance; no drag/delete/terminal buttons.

- [ ] **Step 4: Implement the workspace overview**

Use existing theme/spacing. Keep repositories collapsed by default. Render branch workspaces as quiet list rows, a single `AnimatedVisibility` expansion, and a thin path spine with root/member groups. Terminal rows are the only operational rows.

- [ ] **Step 5: Add all locale resources**

Add equivalent keys to `values`, `values-b+zh+Hans`, `values-ja`, and `values-ko`. Paths, branches, repository names, and tmux data remain raw. Extend localization contract tests to require every new key.

- [ ] **Step 6: Run UI and localization tests**

```bash
./gradlew :app:testDebugUnitTest \
  --tests "com.mrongm.hobgoblin.ui.screens.projects.ProjectsScreenStateTest" \
  --tests "com.mrongm.hobgoblin.ui.screens.workspaces.WorkspaceCatalogScreenStateTest" \
  --tests "com.mrongm.hobgoblin.AndroidLocalizationContractTest"
```

Expected: all workspace presentation and locale contract tests pass.

---

### Task 7: Full Verification and Visual Evidence

**Files:** all changed files; no production expansion.

- [ ] **Step 1: Run Android formatting and focused static checks**

Use the repository's existing formatting conventions; do not introduce a new formatter dependency. Run `git diff --check`.

- [ ] **Step 2: Run the complete Android gates**

```bash
./gradlew :app:testDebugUnitTest
./gradlew :app:lintDebug
./gradlew :app:assembleDebug
```

Expected: all commands exit 0 and produce the debug APK.

- [ ] **Step 3: Run root architecture gates**

```bash
bun run typecheck
bun run test
bun run check:architecture
```

Expected: all commands exit 0.

- [ ] **Step 4: Review scope and safety**

Search Android production changes for registry writes, workspace mutations, `new-session` in attach-existing code, polling, new dependencies, raw registry logging, and nested SSH behavior. The only `new-session` path must remain ordinary `AttachOrCreate` terminal launch.

- [ ] **Step 5: Prepare visual evidence**

Build the final UI with generic preview/sample state in Compose previews. If the existing Pixel AVD can be launched with user approval, install the debug APK and capture Host-filtered Projects, expanded workspace overview, empty state, and attention state screenshots. If GUI launch is not approved, present the finalized source-backed wireframes and preview definitions instead of claiming runtime screenshots.

- [ ] **Step 6: Final handoff**

Report changed files, tests, any environment-only verification limitation, the final UI hierarchy, and the single deferred confirmation for emulator launch or follow-up changes. Do not commit.
