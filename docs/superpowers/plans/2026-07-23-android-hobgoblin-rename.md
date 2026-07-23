# Android Hobgoblin Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. This execution is intentionally inline; do not dispatch subagents.

**Goal:** Completely rename the imported Android project from Goblin to Hobgoblin and set its Android package identity to `dev.hobgoblin.android`.

**Architecture:** Apply one atomic, case-preserving identity migration across the Android source tree, including packages, symbols, resources, runtime strings, tests, and Android-owned documentation. Do not add compatibility aliases because the new application ID intentionally represents a distinct Android application.

**Tech Stack:** Kotlin, Jetpack Compose, Android Gradle Plugin, Gradle Wrapper, JUnit

## Global Constraints

- Restrict implementation changes to `android/`; the design and implementation-plan documents remain under `docs/superpowers/`.
- Replace `GoblinAndroid`, `Goblin`, `goblin`, and `GOBLIN` with `HobgoblinAndroid`, `Hobgoblin`, `hobgoblin`, and `HOBGOBLIN` respectively.
- Replace `dev.goblin.android` and `dev/goblin/android` with `dev.hobgoblin.android` and `dev/hobgoblin/android`.
- Rename runtime persistence identifiers and remote protocol markers; do not preserve legacy aliases.
- Preserve unrelated worktree changes.
- Do not create a Git commit or perform branch/network Git writes.

---

### Task 1: Establish the legacy-identity baseline

**Files:**

- Inspect: `android/settings.gradle.kts`
- Inspect: `android/app/build.gradle.kts`
- Inspect: `android/app/src/main/AndroidManifest.xml`
- Inspect: `android/app/src/main/java/dev/goblin/android/`
- Inspect: `android/app/src/test/java/dev/goblin/android/`
- Inspect: `android/app/src/main/res/font/goblin_terminal_cjk_regular.ttf`
- Inspect: `android/docs/`

**Interfaces:**

- Consumes: the imported Android source tree.
- Produces: a measured red-state baseline for the full identity migration.

- [ ] **Step 1: Confirm the old package identity is present**

Run:

```bash
rg -n 'rootProject.name = "GoblinAndroid"|namespace = "dev.goblin.android"|applicationId = "dev.goblin.android"|android:label="Goblin"' \
  android/settings.gradle.kts android/app/build.gradle.kts android/app/src/main/AndroidManifest.xml
```

Expected: four legacy identity matches.

- [ ] **Step 2: Record the maintained legacy-name baseline**

Run:

```bash
rg -i --pcre2 -o \
  --glob '!android/.gradle/**' \
  --glob '!android/.kotlin/**' \
  --glob '!android/**/build/**' \
  '(?<!hob)goblin' android | wc -l
```

Expected: `846` matches across `122` maintained files before migration.

### Task 2: Apply the complete identity migration

**Files:**

- Modify: all maintained text files returned by the Task 1 legacy scan.
- Create: `android/app/src/test/java/dev/hobgoblin/android/AndroidIdentityContractTest.kt`.
- Move: `android/app/src/main/java/dev/goblin/android/` to `android/app/src/main/java/dev/hobgoblin/android/`.
- Move: `android/app/src/test/java/dev/goblin/android/` to `android/app/src/test/java/dev/hobgoblin/android/`.
- Move: `android/app/src/main/java/dev/hobgoblin/android/GoblinAndroidApp.kt` to `android/app/src/main/java/dev/hobgoblin/android/HobgoblinAndroidApp.kt`.
- Move: `android/app/src/main/java/dev/hobgoblin/android/ui/screens/terminals/GoblinTerminalView.kt` to `android/app/src/main/java/dev/hobgoblin/android/ui/screens/terminals/HobgoblinTerminalView.kt`.
- Move: `android/app/src/main/java/dev/hobgoblin/android/ui/theme/GoblinTheme.kt` to `android/app/src/main/java/dev/hobgoblin/android/ui/theme/HobgoblinTheme.kt`.
- Move: `android/app/src/test/java/dev/hobgoblin/android/ui/screens/terminals/GoblinTerminalViewLayoutTest.kt` to `android/app/src/test/java/dev/hobgoblin/android/ui/screens/terminals/HobgoblinTerminalViewLayoutTest.kt`.
- Move: `android/app/src/test/java/dev/hobgoblin/android/ui/theme/GoblinThemeTest.kt` to `android/app/src/test/java/dev/hobgoblin/android/ui/theme/HobgoblinThemeTest.kt`.
- Move: `android/app/src/main/res/font/goblin_terminal_cjk_regular.ttf` to `android/app/src/main/res/font/hobgoblin_terminal_cjk_regular.ttf`.
- Modify: `android/app/src/main/java/dev/hobgoblin/android/terminals/SshTerminalService.kt`.
- Test: `android/app/src/test/java/dev/hobgoblin/android/terminals/SshTerminalStartupCommandTest.kt`.

**Interfaces:**

- Consumes: the exact case-preserving mappings in the global constraints.
- Produces: one internally consistent `dev.hobgoblin.android` source tree with no legacy identity aliases.

- [ ] **Step 1: Move main and test package directories**

Run:

```bash
mkdir -p android/app/src/main/java/dev/hobgoblin
mkdir -p android/app/src/test/java/dev/hobgoblin
mv android/app/src/main/java/dev/goblin/android android/app/src/main/java/dev/hobgoblin/android
mv android/app/src/test/java/dev/goblin/android android/app/src/test/java/dev/hobgoblin/android
rmdir android/app/src/main/java/dev/goblin
rmdir android/app/src/test/java/dev/goblin
```

Expected: all Kotlin main and test sources are below `dev/hobgoblin/android`.

- [ ] **Step 2: Apply case-preserving replacements to maintained text files**

Run:

```bash
rg -i --pcre2 -l -0 \
  --glob '!android/.gradle/**' \
  --glob '!android/.kotlin/**' \
  --glob '!android/**/build/**' \
  '(?<!hob)goblin' android \
  | xargs -0 perl -pi -e \
    's/(?<!hob)goblin/$& eq uc($&) ? "HOBGOBLIN" : $& eq lc($&) ? "hobgoblin" : "Hobgoblin"/gei'
```

This applies the following replacements in order:

```text
(?<!HOB)GOBLIN  -> HOBGOBLIN
(?<!Hob)Goblin  -> Hobgoblin
(?<!hob)goblin  -> hobgoblin
```

Expected key results:

```kotlin
rootProject.name = "HobgoblinAndroid"
namespace = "dev.hobgoblin.android"
applicationId = "dev.hobgoblin.android"
```

```xml
android:label="Hobgoblin"
```

- [ ] **Step 3: Rename identity-bearing files and the font resource**

Run:

```bash
mv android/app/src/main/java/dev/hobgoblin/android/GoblinAndroidApp.kt \
  android/app/src/main/java/dev/hobgoblin/android/HobgoblinAndroidApp.kt
mv android/app/src/main/java/dev/hobgoblin/android/ui/screens/terminals/GoblinTerminalView.kt \
  android/app/src/main/java/dev/hobgoblin/android/ui/screens/terminals/HobgoblinTerminalView.kt
mv android/app/src/main/java/dev/hobgoblin/android/ui/theme/GoblinTheme.kt \
  android/app/src/main/java/dev/hobgoblin/android/ui/theme/HobgoblinTheme.kt
mv android/app/src/test/java/dev/hobgoblin/android/ui/screens/terminals/GoblinTerminalViewLayoutTest.kt \
  android/app/src/test/java/dev/hobgoblin/android/ui/screens/terminals/HobgoblinTerminalViewLayoutTest.kt
mv android/app/src/test/java/dev/hobgoblin/android/ui/theme/GoblinThemeTest.kt \
  android/app/src/test/java/dev/hobgoblin/android/ui/theme/HobgoblinThemeTest.kt
mv android/app/src/main/res/font/goblin_terminal_cjk_regular.ttf \
  android/app/src/main/res/font/hobgoblin_terminal_cjk_regular.ttf
```

Expected: paths and declarations use identical Hobgoblin symbol/resource names.

- [ ] **Step 4: Verify the green identity state before compilation**

Run:

```bash
rg -i --pcre2 -n \
  --glob '!android/.gradle/**' \
  --glob '!android/.kotlin/**' \
  --glob '!android/**/build/**' \
  '(?<!hob)goblin' android
```

Expected: exit code `1` with no matches.

Run:

```bash
find android -type d \( -name .gradle -o -name .kotlin -o -name build \) -prune -o -print \
  | rg -i --pcre2 '(?<!hob)goblin'
```

Expected: exit code `1` with no legacy path names.

Run:

```bash
./gradlew testDebugUnitTest --tests "dev.hobgoblin.android.AndroidIdentityContractTest"
```

Expected: both project-identity contract tests pass.

- [ ] **Step 5: Preserve the tmux session-name length contract**

Set the session prefix to the single constant `hobgoblin-` and reduce the SHA-256 hex prefix from 24 to 22 characters so the complete session name remains 32 characters.

Update the two tmux format assertions to:

```kotlin
assertTrue(first.matches(Regex("hobgoblin-[0-9a-f]{22}")))
assertTrue(second.matches(Regex("hobgoblin-[0-9a-f]{22}")))
```

Run:

```bash
./gradlew testDebugUnitTest --tests "dev.hobgoblin.android.terminals.SshTerminalStartupCommandTest"
```

Expected: the targeted tmux startup command test class passes and the existing `first.length <= 32` assertion remains green.

### Task 3: Clean, compile, test, and audit the migration

**Files:**

- Verify: `android/`
- Verify: root TypeScript/Electron project without modifying it.

**Interfaces:**

- Consumes: the fully renamed Android source tree from Task 2.
- Produces: build, test, architecture, and worktree-integrity evidence.

- [ ] **Step 1: Remove stale generated Android outputs and run the Android suite**

Run from `android/`:

```bash
./gradlew clean test
```

Expected: `BUILD SUCCESSFUL` and `:app:test` passes.

- [ ] **Step 2: Run root project verification**

Run from the repository root:

```bash
bun run typecheck
bun run test
bun run check:architecture
```

Expected: all typecheck projects pass, all Vitest tests pass, and architecture import boundaries pass.

- [ ] **Step 3: Run final identity and diff audits**

Run:

```bash
rg -i --pcre2 -n \
  --glob '!android/.gradle/**' \
  --glob '!android/.kotlin/**' \
  --glob '!android/**/build/**' \
  '(?<!hob)goblin' android
rg -n 'Hobhobgoblin' \
  --glob '!android/.gradle/**' \
  --glob '!android/.kotlin/**' \
  --glob '!android/**/build/**' \
  android
git diff --check -- android
git status --short
```

Expected: the identity scan has no matches, `git diff --check` succeeds, and status shows only the Android migration plus pre-existing unrelated changes and the approved design/plan documents.
