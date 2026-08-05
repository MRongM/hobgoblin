# Android Project Recency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist Android Project creation time, use newest-first default ordering, and show localized creation-time metadata on Project cards without overriding a saved manual order.

**Architecture:** Extend the restorable `RemoteRepositoryProfile` and its line codec with one optional timestamp, preserving legacy records as unknown. Keep ordering as a pure `ProjectsScreen` projection: effective manual order wins, otherwise a stable descending created-time sort runs before Host filtering. Format time only in Compose with Android's locale-aware relative-time API.

**Tech Stack:** Kotlin, Jetpack Compose Material 3, Android `DateUtils`, SharedPreferences line codec, JUnit 4, Gradle, Bun/Vitest architecture checks.

## Global Constraints

- Follow KISS, YAGNI, DRY, and SOLID; do not refactor unrelated screens.
- Preserve existing Host and Worktree ordering and all remote/Git behavior.
- Preserve legacy four-field and five-field Project records without inventing timestamps.
- Keep English, Simplified Chinese, Japanese, and Korean resources aligned.
- Use the existing repository model, codec, manual-order policy, and localized-text conventions.
- Do not add dependencies, timers, server synchronization, branches, or Git commits.

---

### Task 1: Persist Immutable Project Created Time

**Files:**
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/domain/ssh/RemoteRepositoryProfile.kt`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/data/RemoteRepositoryStore.kt`
- Test: `android/app/src/test/java/com/mrongm/hobgoblin/data/RemoteRepositoryStoreTest.kt`

**Interfaces:**
- Produces: `RemoteRepositoryProfile.createdAt: Long?`
- Produces: `RemoteRepositoryProfile.create(..., createdAt: Long = System.currentTimeMillis())`
- Produces: six-field `RemoteRepositoryCodec` records; four-field and five-field records decode with `createdAt == null`
- Produces: `RemoteRepositoryStorePolicy.upsertRepository(...)` preserves the existing record's created time during edits

- [x] **Step 1: Add failing model and codec tests**

Add `assertNull` to the JUnit imports and add deterministic coverage:

```kotlin
@Test
fun `remote repository profile retains supplied created time`() {
    val createdAt = 1_700_000_000_000L
    val repository = RemoteRepositoryProfile.create(
        hostProfileId = "host-1",
        alias = "App",
        remotePath = "/srv/app",
        createdAt = createdAt,
    )

    assertEquals(createdAt, repository.createdAt)
}

@Test
fun `legacy project records have unknown created time`() {
    val fourFields = encodedRecord("project-1", "host-1", "App", "/srv/app")
    val fiveFields = encodedRecord("project-2", "host-1", "API", "/srv/api", "git")

    assertNull(RemoteRepositoryCodec.decode(fourFields).single().createdAt)
    assertNull(RemoteRepositoryCodec.decode(fiveFields).single().createdAt)
}

@Test
fun `malformed persisted project created time is ignored`() {
    val payload = encodedRecord("project-1", "host-1", "App", "/srv/app", "git", "invalid")

    assertTrue(RemoteRepositoryCodec.decode(payload).isEmpty())
}

@Test
fun `remote repository update preserves original created time`() {
    val original = RemoteRepositoryProfile.create(
        hostProfileId = "host-1",
        alias = "App",
        remotePath = "/srv/app",
        createdAt = 1_000L,
    ).copy(id = "project-1")
    val edited = original.copy(alias = "Renamed", createdAt = 2_000L)

    val updated = RemoteRepositoryStorePolicy.upsertRepository(listOf(original), edited).single()

    assertEquals("Renamed", updated.alias)
    assertEquals(1_000L, updated.createdAt)
}
```

Update the existing round-trip test to construct the Project with `createdAt = 1_700_000_000_000L`; data-class equality then proves the timestamp survives serialization.

- [x] **Step 2: Run the focused test and verify RED**

Run:

```bash
"./android/gradlew" -p "android" :app:testDebugUnitTest --tests "com.mrongm.hobgoblin.data.RemoteRepositoryStoreTest"
```

Expected: compilation fails because `createdAt` does not exist.

- [x] **Step 3: Implement the minimal model and codec extension**

Extend the model and factory:

```kotlin
data class RemoteRepositoryProfile(
    val id: String,
    val hostProfileId: String,
    val alias: String?,
    val remotePath: String,
    val kind: RemoteProjectKind = RemoteProjectKind.GitRepository,
    val createdAt: Long? = null,
) {
    val title: String = alias?.takeIf { it.isNotBlank() } ?: remotePath
    val isGitRepository: Boolean = kind == RemoteProjectKind.GitRepository

    init {
        require(id.isNotBlank()) { "Remote repository id is required" }
        require(hostProfileId.isNotBlank()) { "Host profile id is required" }
        require(remotePath.startsWith("/")) { "Remote path must be absolute" }
        require(createdAt == null || createdAt > 0L) { "Project created time must be positive" }
    }

    companion object {
        fun create(
            hostProfileId: String,
            alias: String?,
            remotePath: String,
            kind: RemoteProjectKind = RemoteProjectKind.GitRepository,
            createdAt: Long = System.currentTimeMillis(),
        ): RemoteRepositoryProfile {
            val normalizedHostProfileId = hostProfileId.trim()
            val normalizedAlias = alias?.trim()?.takeIf { it.isNotEmpty() }
            val normalizedRemotePath = remotePath.trim()
            require(normalizedHostProfileId.isNotEmpty()) { "Host profile id is required" }
            require(normalizedRemotePath.startsWith("/")) { "Remote path must be absolute" }
            return RemoteRepositoryProfile(
                id = UUID.randomUUID().toString(),
                hostProfileId = normalizedHostProfileId,
                alias = normalizedAlias,
                remotePath = normalizedRemotePath,
                kind = kind,
                createdAt = createdAt,
            )
        }
    }
}
```

Encode nullable timestamps without manufacturing a sixth field for legacy records:

```kotlin
fun encode(repositories: List<RemoteRepositoryProfile>): String =
    repositories.joinToString(RecordSeparator) { repository ->
        buildList {
            add(repository.id)
            add(repository.hostProfileId)
            add(repository.alias.orEmpty())
            add(repository.remotePath)
            add(repository.kind.storageValue)
            repository.createdAt?.let { add(it.toString()) }
        }.joinToString(FieldSeparator) { it.encodeField() }
    }
```

Decode exactly four, five, or six fields and reject a malformed sixth field:

```kotlin
private fun decodeRepository(line: String): RemoteRepositoryProfile? {
    val fields = line.split(FieldSeparator).map { it.decodeField() }
    if (fields.size !in 4..6) return null
    val kind = if (fields.size == 4) {
        RemoteProjectKind.GitRepository
    } else {
        RemoteProjectKind.fromStorageValue(fields[4]) ?: return null
    }
    val createdAt = fields.getOrNull(5)?.toLongOrNull()
    if (fields.size == 6 && createdAt == null) return null
    return runCatching {
        RemoteRepositoryProfile(
            id = fields[0],
            hostProfileId = fields[1],
            alias = fields[2].takeIf { it.isNotBlank() },
            remotePath = fields[3],
            kind = kind,
            createdAt = createdAt,
        )
    }.getOrNull()
}
```

Preserve the already stored created time at the upsert boundary:

```kotlin
fun upsertRepository(
    repositories: List<RemoteRepositoryProfile>,
    repository: RemoteRepositoryProfile,
): List<RemoteRepositoryProfile> {
    val existing = repositories.firstOrNull { it.id == repository.id }
    val storedRepository = existing?.let { repository.copy(createdAt = it.createdAt) } ?: repository
    return repositories.filterNot { it.id == repository.id } + storedRepository
}
```

- [x] **Step 4: Run the focused test and verify GREEN**

Run the Task 1 command again. Expected: `BUILD SUCCESSFUL`.

---

### Task 2: Apply Newest-First Default Project Ordering

**Files:**
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/projects/ProjectsScreen.kt`
- Test: `android/app/src/test/java/com/mrongm/hobgoblin/ui/screens/projects/ProjectsScreenStateTest.kt`

**Interfaces:**
- Consumes: `RemoteRepositoryProfile.createdAt`
- Consumes: `ManualItemOrderPolicy.apply(...)`
- Produces: `projectDisplayOrder(repositories, savedIds): List<RemoteRepositoryProfile>`

- [x] **Step 1: Add failing ordering tests**

Cover newest-first defaults, stable unknown legacy order, all-stale saved IDs, valid manual-order precedence, and filtering after global ordering:

```kotlin
assertEquals(
    listOf("new", "old", "legacy-a", "legacy-b"),
    projectDisplayOrder(
        listOf(legacyA, old, legacyB, newest),
        savedIds = emptyList(),
    ).map { it.id },
)
assertEquals(
    listOf("new", "old"),
    projectDisplayOrder(listOf(old, newest), savedIds = listOf("stale")).map { it.id },
)
assertEquals(
    listOf("old", "new"),
    projectDisplayOrder(listOf(old, newest), savedIds = listOf("old", "new")).map { it.id },
)
```

- [x] **Step 2: Run the focused test and verify RED**

Run:

```bash
"./android/gradlew" -p "android" :app:testDebugUnitTest --tests "com.mrongm.hobgoblin.ui.screens.projects.ProjectsScreenStateTest"
```

Expected: compilation fails because `projectDisplayOrder` does not exist.

- [x] **Step 3: Implement the pure ordering projection**

Add:

```kotlin
internal fun projectDisplayOrder(
    repositories: List<RemoteRepositoryProfile>,
    savedIds: List<String>,
): List<RemoteRepositoryProfile> {
    val currentIds = repositories.mapTo(mutableSetOf(), RemoteRepositoryProfile::id)
    val hasEffectiveManualOrder = savedIds.any(currentIds::contains)
    return if (hasEffectiveManualOrder) {
        ManualItemOrderPolicy.apply(repositories, savedIds, RemoteRepositoryProfile::id)
    } else {
        repositories.sortedByDescending { it.createdAt ?: Long.MIN_VALUE }
    }
}
```

Replace the direct `ManualItemOrderPolicy.apply` call in `ProjectList` with `projectDisplayOrder`. Keep `projectsForHost` after that projection so filtered and unfiltered lists share one order.

- [x] **Step 4: Run the focused test and verify GREEN**

Run the Task 2 command again. Expected: `BUILD SUCCESSFUL`.

---

### Task 3: Render Localized Project Creation Time

**Files:**
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/projects/ProjectsScreen.kt`
- Modify: `android/app/src/main/res/values/strings.xml`
- Modify: `android/app/src/main/res/values-b+zh+Hans/strings.xml`
- Modify: `android/app/src/main/res/values-ja/strings.xml`
- Modify: `android/app/src/main/res/values-ko/strings.xml`
- Test: `android/app/src/test/java/com/mrongm/hobgoblin/ui/screens/projects/ProjectsScreenStateTest.kt`

**Interfaces:**
- Consumes: `RemoteRepositoryProfile.createdAt`
- Produces: `projectCreatedText(relativeTime: CharSequence?): LocalizedText`
- Produces: `R.string.projects_created_at` and `R.string.projects_created_unknown`

- [x] **Step 1: Add failing presentation tests**

Add pure helper assertions and a source contract:

```kotlin
assertEquals(
    LocalizedText(R.string.projects_created_at, listOf("5 minutes ago")),
    projectCreatedText("5 minutes ago"),
)
assertEquals(LocalizedText(R.string.projects_created_unknown), projectCreatedText(null))

val source = projectsScreenSource()
assertTrue(source.contains("DateUtils.getRelativeTimeSpanString"))
assertTrue(source.contains("repository.createdAt"))
assertTrue(source.contains("DateUtils.MINUTE_IN_MILLIS"))
```

- [x] **Step 2: Run the focused test and verify RED**

Run the Task 2 command. Expected: compilation fails because the helper and resources do not exist.

- [x] **Step 3: Add aligned locale resources and render the metadata**

Add these semantic resources in all four locale files:

```xml
<string name="projects_created_at">created %1$s</string>
<string name="projects_created_unknown">creation time unknown</string>
```

Use natural translations: Simplified Chinese `创建于%1$s` / `创建时间未知`, Japanese `作成：%1$s` / `作成日時不明`, and Korean `생성: %1$s` / `생성 시간 알 수 없음`.

Add:

```kotlin
internal fun projectCreatedText(relativeTime: CharSequence?): LocalizedText =
    if (relativeTime == null) {
        LocalizedText(R.string.projects_created_unknown)
    } else {
        LocalizedText(R.string.projects_created_at, listOf(relativeTime))
    }
```

In `ProjectRow`, render a muted `labelSmall` line after the Project kind. For known timestamps, pass `DateUtils.getRelativeTimeSpanString(createdAt, System.currentTimeMillis(), DateUtils.MINUTE_IN_MILLIS)` to the helper; otherwise pass `null`.

- [x] **Step 4: Run the focused test and verify GREEN**

Run the Task 2 command again. Expected: `BUILD SUCCESSFUL`.

---

### Task 4: Documentation and Full Verification

**Files:**
- Modify: `CONTEXT.md`
- Create: `docs/superpowers/specs/2026-08-04-android-project-recency-design.md`
- Create: `docs/superpowers/plans/2026-08-04-android-project-recency.md`

**Interfaces:**
- Documents: `Android project created time`
- Documents: precedence between default recency and `Android manual item order`

- [x] **Step 1: Confirm documentation consistency**

Verify the glossary and design state that created time is device-local, immutable, unknown for legacy records, and subordinate to an effective saved manual order.

- [x] **Step 2: Run complete Android verification**

Run:

```bash
"./android/gradlew" -p "android" :app:testDebugUnitTest :app:lintDebug :app:assembleDebug
```

Expected: `BUILD SUCCESSFUL` and `android/app/build/outputs/apk/debug/app-debug.apk` exists.

- [x] **Step 3: Run repository-wide verification**

Run:

```bash
bun run typecheck
bun run test
bun run check:architecture
git diff --check
```

Expected: every command exits zero; only pre-existing non-fatal warnings may remain.

- [x] **Step 4: Review scoped diff and working tree**

Run:

```bash
git diff -- "CONTEXT.md" "android/app/src/main/java/com/mrongm/hobgoblin/domain/ssh/RemoteRepositoryProfile.kt" "android/app/src/main/java/com/mrongm/hobgoblin/data/RemoteRepositoryStore.kt" "android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/projects/ProjectsScreen.kt" "android/app/src/main/res" "android/app/src/test/java/com/mrongm/hobgoblin/data/RemoteRepositoryStoreTest.kt" "android/app/src/test/java/com/mrongm/hobgoblin/ui/screens/projects/ProjectsScreenStateTest.kt" "docs/superpowers/specs/2026-08-04-android-project-recency-design.md" "docs/superpowers/plans/2026-08-04-android-project-recency.md"
git status --short
```

Expected: only requested Project recency changes plus the user's existing Terminal-status/recency work are present. Do not commit.
