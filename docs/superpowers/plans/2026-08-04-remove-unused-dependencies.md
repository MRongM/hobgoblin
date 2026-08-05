# Remove Unused Dependencies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task inline. Steps use checkbox (`- [ ]`) syntax for tracking. Do not dispatch subagents for this plan.

**Goal:** Remove Android Compose preview/tooling dependencies that have no source, preview, test, build, or runtime use while retaining every required Bun/Electron and Android dependency.

**Architecture:** Treat direct source imports, explicit build/runtime entrypoints, package scripts, TypeScript type configuration, Vitest environments, Android manifest references, and Gradle classpaths as dependency roots. Remove only the two Compose tooling declarations whose only occurrences are their own catalog/build entries; do not change application behavior or rely on transitive dependencies for APIs imported by production code.

**Tech Stack:** Gradle Kotlin DSL, Android Gradle Plugin, Kotlin, Jetpack Compose, Bun, TypeScript, Vitest.

## Global Constraints

- Preserve all pre-existing tracked and untracked worktree changes.
- Do not modify `package.json` or `bun.lock`: static import analysis and Knip 6.31.0 report no unused direct Bun/Electron dependency.
- Remove only `androidx-compose-ui-tooling` and `androidx-compose-ui-tooling-preview` aliases and their direct dependency declarations.
- Keep direct Android dependencies whose APIs are imported by source or tests, even when Gradle also resolves them transitively.
- Do not create a branch, worktree, commit, push, or dependency version update.
- Verify with Android tests/build plus the repository typecheck, tests, and architecture guard.

---

### Task 1: Remove unused Compose tooling declarations

**Files:**
- Modify: `android/gradle/libs.versions.toml`
- Modify: `android/app/build.gradle.kts`

**Interfaces:**
- Consumes: the existing Compose BOM and production Compose dependencies.
- Produces: the same release/debug application behavior without direct preview/tooling declarations.

- [x] **Step 1: Establish audit evidence and a green baseline**

Run:

```bash
rg -n -F -e 'androidx.compose.ui.tooling.preview' -e '@Preview' -e 'ui.tooling' android/app/src android/app/build.gradle.kts android/gradle/libs.versions.toml
bunx knip --reporter compact
cd android && ./gradlew testDebugUnitTest assembleDebug
```

Expected: Compose tooling occurs only in the catalog/build declarations; Knip reports no unused direct package dependency; Android tests and the debug build succeed.

- [x] **Step 2: Remove the unused version-catalog aliases**

Delete these entries from `android/gradle/libs.versions.toml`:

```toml
androidx-compose-ui-tooling = { module = "androidx.compose.ui:ui-tooling" }
androidx-compose-ui-tooling-preview = { module = "androidx.compose.ui:ui-tooling-preview" }
```

- [x] **Step 3: Remove the unused app dependency declarations**

Delete these entries from `android/app/build.gradle.kts`:

```kotlin
implementation(libs.androidx.compose.ui.tooling.preview)
debugImplementation(libs.androidx.compose.ui.tooling)
```

- [x] **Step 4: Confirm no stale direct alias remains**

Run:

```bash
rg -n -F -e 'libs.androidx.compose.ui.tooling' -e 'androidx-compose-ui-tooling' android
```

Expected: no matches.

- [x] **Step 5: Verify the Android dependency cleanup**

Run from `android/`:

```bash
./gradlew testDebugUnitTest assembleDebug
```

Expected: `BUILD SUCCESSFUL`.

### Task 2: Run repository regression gates and scope review

**Files:**
- Verify: `package.json`
- Verify: `bun.lock`
- Verify: all files changed before this task remain preserved.

**Interfaces:**
- Consumes: the cleaned Android build configuration from Task 1.
- Produces: evidence that dependency cleanup does not alter the desktop/server/web or Android behavior.

- [x] **Step 1: Run repository verification**

Run from the repository root:

```bash
bun run typecheck
bun run test
bun run check:architecture
```

Expected: all commands exit successfully.

- [x] **Step 2: Review whitespace and exact scope**

Run:

```bash
git diff --check
git diff -- android/gradle/libs.versions.toml android/app/build.gradle.kts package.json bun.lock
git status --short
```

Expected: no whitespace errors; this task changes only the two Android Gradle files and this plan; `package.json` and `bun.lock` remain unchanged.
