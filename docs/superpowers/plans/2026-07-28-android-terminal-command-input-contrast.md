# Android Terminal Command Input Contrast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Android terminal command input an independent high-contrast surface and readable entered text in Dark and Light appearances.

**Architecture:** Keep `TerminalAppearance.kt` as the single source of terminal palette data by adding dedicated command-input background and foreground values. Keep `TerminalScreen.kt` responsible only for rendering those values through the existing `LocalTerminalPalette`; do not alter terminal state, input transport, or appearance persistence.

**Tech Stack:** Kotlin, Jetpack Compose Material 3, JUnit 4, Gradle.

## Global Constraints

- Do not add dependencies.
- Do not run `git commit`, `git push`, create branches, or modify Git history.
- Dark input colors are background `#223044`, foreground `#F7FAFC`, border `#65B9FF`.
- Light input colors are background `#FFFFFF`, foreground `#111820`, border `#246EA8`.
- The command-input border is 2dp.
- Placeholder and disabled text continue to use `mutedArgb`.
- Do not change input, IME, sending, selection, visibility, terminal emulator, SSH, session, persistence, or navigation behavior.
- Preserve the existing English code-comment language; this change needs no new comments or user-facing copy.

---

### Task 1: Add a tested command-input palette contract

**Files:**
- Modify: `android/app/src/test/java/com/mrongm/hobgoblin/ui/screens/terminals/TerminalAppearanceTest.kt:3-81`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/terminals/TerminalAppearance.kt:7-87`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/terminals/TerminalScreen.kt:942-1002`

**Interfaces:**
- Consumes: existing `terminalPalette(appearance: TerminalAppearance): TerminalPalette` and `LocalTerminalPalette`.
- Produces: `TerminalPalette.inputBackgroundArgb: Int` and `TerminalPalette.inputForegroundArgb: Int`.

- [x] **Step 1: Write the failing palette and rendering-contract tests**

Add the following imports to `TerminalAppearanceTest.kt`:

```kotlin
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
```

Add exact input-token assertions to the existing Dark test:

```kotlin
assertEquals(0xFF223044.toInt(), palette.inputBackgroundArgb)
assertEquals(0xFFF7FAFC.toInt(), palette.inputForegroundArgb)
```

Add exact input-token assertions to the existing Light test:

```kotlin
assertEquals(0xFFFFFFFF.toInt(), palette.inputBackgroundArgb)
assertEquals(0xFF111820.toInt(), palette.inputForegroundArgb)
```

Add these focused tests and helpers before `sourceFile`:

```kotlin
@Test
fun `command input colors preserve readable text and a distinct boundary`() {
    TerminalAppearance.entries.forEach { appearance ->
        val palette = terminalPalette(appearance)

        assertTrue(contrastRatio(palette.inputForegroundArgb, palette.inputBackgroundArgb) >= 7.0)
        assertTrue(contrastRatio(palette.actionArgb, palette.surfaceArgb) >= 3.0)
    }
}

@Test
fun `command input renders the dedicated high contrast palette`() {
    val source = sourceFile("ui/screens/terminals/TerminalScreen.kt")

    assertTrue(source.contains("Color(palette.inputForegroundArgb)"))
    assertTrue(source.contains(".background(Color(palette.inputBackgroundArgb), TerminalCommandInputShape)"))
    assertTrue(source.contains(".border(2.dp, Color(palette.actionArgb), TerminalCommandInputShape)"))
}

private fun contrastRatio(firstArgb: Int, secondArgb: Int): Double {
    val first = relativeLuminance(firstArgb)
    val second = relativeLuminance(secondArgb)
    return (max(first, second) + 0.05) / (min(first, second) + 0.05)
}

private fun relativeLuminance(argb: Int): Double {
    fun linear(component: Int): Double {
        val normalized = component / 255.0
        return if (normalized <= 0.04045) {
            normalized / 12.92
        } else {
            ((normalized + 0.055) / 1.055).pow(2.4)
        }
    }

    val red = linear(argb ushr 16 and 0xFF)
    val green = linear(argb ushr 8 and 0xFF)
    val blue = linear(argb and 0xFF)
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}
```

- [x] **Step 2: Run the focused test and verify it fails for the missing contract**

From `android/`, run:

```bash
./gradlew :app:testDebugUnitTest --tests "com.mrongm.hobgoblin.ui.screens.terminals.TerminalAppearanceTest"
```

Expected: compilation fails because `inputBackgroundArgb` and `inputForegroundArgb` do not exist. The rendering-contract assertions also describe the production changes required next.

- [x] **Step 3: Add the minimal palette and rendering implementation**

Extend `TerminalPalette` in `TerminalAppearance.kt`:

```kotlin
internal data class TerminalPalette(
    val backgroundArgb: Int,
    val foregroundArgb: Int,
    val surfaceArgb: Int,
    val dividerArgb: Int,
    val actionArgb: Int,
    val mutedArgb: Int,
    val selectionArgb: Int,
    val inputBackgroundArgb: Int,
    val inputForegroundArgb: Int,
    val ansiArgb: List<Int>,
)
```

Add the Dark values after `selectionArgb`:

```kotlin
inputBackgroundArgb = 0xFF223044.toInt(),
inputForegroundArgb = 0xFFF7FAFC.toInt(),
```

Add the Light values after `selectionArgb`:

```kotlin
inputBackgroundArgb = 0xFFFFFFFF.toInt(),
inputForegroundArgb = 0xFF111820.toInt(),
```

Update only the enabled-text and field-surface branches in `CompactCommandInput`:

```kotlin
val textColor = if (enabled) {
    Color(palette.inputForegroundArgb)
} else {
    Color(palette.mutedArgb)
}
```

```kotlin
modifier = modifier
    .height(TerminalCommandInputHeight)
    .background(Color(palette.inputBackgroundArgb), TerminalCommandInputShape)
    .border(2.dp, Color(palette.actionArgb), TerminalCommandInputShape),
```

Leave cursor, placeholder, input state, IME actions, and send behavior unchanged.

- [x] **Step 4: Re-run the focused test and verify it passes**

From `android/`, run:

```bash
./gradlew :app:testDebugUnitTest --tests "com.mrongm.hobgoblin.ui.screens.terminals.TerminalAppearanceTest"
```

Expected: `BUILD SUCCESSFUL` and all `TerminalAppearanceTest` cases pass.

### Task 2: Verify the complete change

**Files:**
- Inspect: `android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/terminals/TerminalAppearance.kt`
- Inspect: `android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/terminals/TerminalScreen.kt`
- Inspect: `android/app/src/test/java/com/mrongm/hobgoblin/ui/screens/terminals/TerminalAppearanceTest.kt`
- Inspect: `docs/superpowers/specs/2026-07-28-android-terminal-command-input-contrast-design.md`

**Interfaces:**
- Consumes: the completed command-input palette contract from Task 1.
- Produces: verified Android unit-test and APK build results plus repository-wide architecture/type/test results.

- [x] **Step 1: Run the full Android unit-test suite**

From `android/`, run:

```bash
./gradlew :app:testDebugUnitTest
```

Expected: `BUILD SUCCESSFUL` with no Android unit-test regression.

- [x] **Step 2: Build the Android debug APK**

From `android/`, run:

```bash
./gradlew :app:assembleDebug
```

Expected: `BUILD SUCCESSFUL` and the debug APK is generated by the existing Android build.

- [x] **Step 3: Run repository checks required by `AGENTS.md`**

From the repository root, run:

```bash
bun run typecheck
bun run test
bun run check:architecture
```

Expected: all three commands exit successfully.

- [x] **Step 4: Review the final diff**

Run:

```bash
git diff --check
git diff -- "android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/terminals/TerminalAppearance.kt" "android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/terminals/TerminalScreen.kt" "android/app/src/test/java/com/mrongm/hobgoblin/ui/screens/terminals/TerminalAppearanceTest.kt" "docs/superpowers/specs/2026-07-28-android-terminal-command-input-contrast-design.md" "docs/superpowers/plans/2026-07-28-android-terminal-command-input-contrast.md"
```

Expected: no whitespace errors; the diff contains only the approved palette, input renderer, tests, design, and plan changes.
