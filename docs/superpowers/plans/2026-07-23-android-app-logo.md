# Android App Logo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Android launcher icon with an adaptive icon derived from `assets/hobgoblin-icon.svg`.

**Architecture:** Keep the shared SVG as the brand source, translate its background and foreground into Android vector drawables, and compose them through API-26 adaptive-icon mipmap resources. Lock resource wiring with a JVM contract test and validate the result through Gradle resource compilation.

**Tech Stack:** Android XML resources, VectorDrawable, AdaptiveIconDrawable, Kotlin/JUnit 4, Gradle.

## Global Constraints

- Android `minSdk` is 26, so no pre-26 raster fallback is required.
- Use `assets/hobgoblin-icon.svg` as the source of geometry and brand colors.
- Keep the foreground mark within the adaptive-icon safe zone.
- Run only Android Gradle verification; do not run TypeScript or Vitest gates.
- Do not commit or push changes.

---

## File Structure

- `android/app/src/test/java/dev/hobgoblin/android/AndroidLauncherIconContractTest.kt`: verifies manifest and adaptive-icon resource contracts.
- `android/app/src/main/res/drawable/ic_launcher_background.xml`: renders the full-bleed terminal gradient.
- `android/app/src/main/res/drawable/ic_launcher_foreground.xml`: renders the terminal and branch foreground mark.
- `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml`: composes the standard adaptive icon.
- `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml`: composes the round adaptive icon.
- `android/app/src/main/AndroidManifest.xml`: selects the new launcher resources.

### Task 1: Lock The Launcher Resource Contract

**Files:**
- Create: `android/app/src/test/java/dev/hobgoblin/android/AndroidLauncherIconContractTest.kt`

- [x] **Step 1: Add a contract test**

Create tests that read `AndroidManifest.xml` and the Android XML resources. Assert that the manifest contains `android:icon="@mipmap/ic_launcher"` and `android:roundIcon="@mipmap/ic_launcher_round"`; both adaptive-icon files must reference `@drawable/ic_launcher_background` and `@drawable/ic_launcher_foreground`; the foreground must contain the canonical prompt path `M148,332l274,274l-274,274` and the blue/green node colors; the background must contain `#FF111827` and `#FF020617`.

- [x] **Step 2: Run the focused test and confirm the missing resources fail**

Run:

```bash
./gradlew :app:testDebugUnitTest --tests dev.hobgoblin.android.AndroidLauncherIconContractTest
```

Expected: FAIL because the manifest still references `@drawable/ic_launcher` and the adaptive resources do not exist.

### Task 2: Implement The Adaptive Hobgoblin Icon

**Files:**
- Create: `android/app/src/main/res/drawable/ic_launcher_background.xml`
- Create: `android/app/src/main/res/drawable/ic_launcher_foreground.xml`
- Create: `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml`
- Create: `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml`
- Modify: `android/app/src/main/AndroidManifest.xml`

- [x] **Step 1: Add the background vector**

Create a 108dp vector with a 1024-by-1024 viewport, a full rectangular path, and a diagonal `#FF111827` to `#FF020617` gradient matching the canonical SVG.

- [x] **Step 2: Add the safe-zone foreground vector**

Translate the canonical prompt, baseline, branch curve, and node circles into VectorDrawable paths. Preserve the source colors and branch gradient, apply the SVG's original `0.8` scale and `(-26, -36)` shift, then apply a centered `0.50` Android-only scale. Add `(-4, -8)` outer translation after scaling so the composite prompt-and-branch mark is visually centered within the final adaptive-icon viewport.

- [x] **Step 3: Compose normal and round adaptive icons**

Both files use:

```xml
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
</adaptive-icon>
```

- [x] **Step 4: Update the application manifest**

Set `android:icon="@mipmap/ic_launcher"` and add `android:roundIcon="@mipmap/ic_launcher_round"`. Leave the notification drawable and service behavior unchanged.

- [x] **Step 5: Run the focused contract test**

Run the Task 1 Gradle command. Expected: PASS.

### Task 3: Verify Android Packaging

- [x] **Step 1: Run all Android unit tests**

Run:

```bash
./gradlew :app:testDebugUnitTest
```

Expected: BUILD SUCCESSFUL.

- [x] **Step 2: Build the debug APK**

Run:

```bash
./gradlew :app:assembleDebug
```

Expected: BUILD SUCCESSFUL with the adaptive launcher resources compiled into the APK.
