# Android Application Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan inline. Do not dispatch subagents. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a restorable Android application theme with three appearance modes and all twelve Web color presets while keeping terminal appearance independent.

**Architecture:** A pure Kotlin model owns stable theme identifiers and maps Web semantic tokens into Compose `ColorScheme` instances. A focused SharedPreferences store persists the device-local selection. `MainActivity` owns the root Compose theme state; `SettingsScreen` edits a draft and commits it through the existing Save action.

**Tech Stack:** Kotlin 2.3, Jetpack Compose Material 3, Android SharedPreferences, JUnit 4, Gradle.

## Global Constraints

- Use `macos + system` as the default.
- Preserve the exact 12 identifiers from `src/shared/color-theme.ts`.
- Source palette values from `src/web/theme/themes/*.css`; do not change Web themes.
- Do not modify Android terminal appearance or ANSI palettes.
- Keep the setting device-local; do not add server or network synchronization.
- Add no dependency and do not enable Material You dynamic colors.
- Keep all four Android locale resource sets complete.
- Do not create Git commits unless the user explicitly requests them.

---

### Task 1: Theme model and Web palette projection

**Files:**

- Create: `android/app/src/main/java/com/mrongm/hobgoblin/ui/theme/AndroidApplicationTheme.kt`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/ui/theme/HobgoblinTheme.kt`
- Test: `android/app/src/test/java/com/mrongm/hobgoblin/ui/theme/AndroidApplicationThemeTest.kt`

**Interfaces:**

- Produces: `AndroidAppearancePreference`, `AndroidColorTheme`, `AndroidApplicationTheme`.
- Produces: `androidAppearancePreference(String?)`, `androidColorTheme(String?)`, `resolveDarkTheme(AndroidAppearancePreference, Boolean)`, and `androidColorScheme(AndroidColorTheme, Boolean)`.
- Changes: `HobgoblinTheme(applicationTheme: AndroidApplicationTheme, systemDarkTheme: Boolean = isSystemInDarkTheme(), content)`.

- [ ] **Step 1: Write the failing model tests**

  Assert the three stable appearance values, the ordered twelve color-theme values, `macos + system` fallback for null/unknown strings, forced light/dark resolution, and system-mode resolution.

- [ ] **Step 2: Run the focused test and verify RED**

  Run: `./gradlew testDebugUnitTest --tests com.mrongm.hobgoblin.ui.theme.AndroidApplicationThemeTest`

  Expected: compilation failure because the theme model does not exist.

- [ ] **Step 3: Implement the minimal stable model**

  Use enum entries with explicit persisted strings:

  ```kotlin
  enum class AndroidAppearancePreference(val storedValue: String) {
      System("system"), Light("light"), Dark("dark")
  }

  enum class AndroidColorTheme(val storedValue: String) {
      Macos("macos"), Mono("mono"), Github("github"), Claude("claude"),
      Cursor("cursor"), Airbnb("airbnb"), Bmw("bmw"), Signal("signal"),
      Forge("forge"), Catppuccin("catppuccin"), Solarized("solarized"),
      TokyoNight("tokyo-night")
  }

  data class AndroidApplicationTheme(
      val appearance: AndroidAppearancePreference = AndroidAppearancePreference.System,
      val colorTheme: AndroidColorTheme = AndroidColorTheme.Macos,
  )
  ```

  Normalizers use `entries.firstOrNull` and the declared defaults. `resolveDarkTheme` returns the system value only for `System`.

- [ ] **Step 4: Add failing palette tests**

  For all 24 theme/mode combinations, assert a scheme is returned. Assert representative Web parity for canvas, accent, and primary text: macOS light (`#FFFFFF`, `#0066CC`, `#1D1D1F`), GitHub dark (`#0D1117`, `#3FB950`, `#E6EDF3`), Claude light (`#FAF9F5`, `#CC785C`, `#141413`), Catppuccin dark (`#1E1E2E`, `#CBA6F7`, `#CDD6F4`), Solarized dark (`#002B36`, `#268BD2`, `#AAB6B6`), and Tokyo Night light (`#E6E7ED`, `#2959AA`, `#343B58`).

- [ ] **Step 5: Run the focused test and verify RED**

  Expected: failure because `androidColorScheme` has not been implemented.

- [ ] **Step 6: Implement all 24 color schemes**

  Define one internal palette value per theme/mode from the exact CSS tokens and project it through one shared builder:

  ```kotlin
  private data class AndroidThemePalette(
      val canvas: Color,
      val surface: Color,
      val surfaceVariant: Color,
      val textPrimary: Color,
      val textSecondary: Color,
      val outline: Color,
      val accent: Color,
      val onAccent: Color,
      val danger: Color,
      val onDanger: Color,
  )
  ```

  Map `background`, `surface`, `surfaceVariant`, `onBackground`, `onSurface`, `onSurfaceVariant`, `outline`, `outlineVariant`, `primary`, `onPrimary`, `primaryContainer`, `onPrimaryContainer`, `secondary`, `onSecondary`, `tertiary`, `onTertiary`, `error`, `onError`, `errorContainer`, `onErrorContainer`, and `surfaceTint`. Container roles use the preset's muted surface with readable theme text; no default Material purple may leak into used roles.

- [ ] **Step 7: Update `HobgoblinTheme` and verify GREEN**

  Resolve the current mode with `resolveDarkTheme`, pass `androidColorScheme` into `MaterialTheme`, and retain existing spacing and terminal constants. Run the focused tests and existing `HobgoblinThemeTest`.

---

### Task 2: Device-local persistence

**Files:**

- Create: `android/app/src/main/java/com/mrongm/hobgoblin/data/AndroidApplicationThemeStore.kt`
- Test: `android/app/src/test/java/com/mrongm/hobgoblin/data/AndroidApplicationThemeStoreTest.kt`

**Interfaces:**

- Consumes: `AndroidApplicationTheme`, normalizers, and enum `storedValue` properties from Task 1.
- Produces: `AndroidApplicationThemeStore.create(Context)`, `load(): AndroidApplicationTheme`, `save(AndroidApplicationTheme)`.

- [ ] **Step 1: Write failing store tests**

  Reuse the repository's in-memory `SharedPreferences` test pattern. Verify empty preferences return `AndroidApplicationTheme()`, valid saved strings are restored, `save` writes both stable values, and unknown strings normalize to defaults.

- [ ] **Step 2: Run the focused test and verify RED**

  Run: `./gradlew testDebugUnitTest --tests com.mrongm.hobgoblin.data.AndroidApplicationThemeStoreTest`

  Expected: compilation failure because the store does not exist.

- [ ] **Step 3: Implement the focused store**

  Use private preferences name `hobgoblin-application-theme`, keys `appearance` and `color_theme`, `androidx.core.content.edit`, and a single atomic edit in `save`.

- [ ] **Step 4: Run store and theme tests and verify GREEN**

  Run both focused test classes. Expected: all pass.

---

### Task 3: Root theme state and Settings UI

**Files:**

- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/MainActivity.kt`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/HobgoblinAndroidApp.kt`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/settings/SettingsScreen.kt`
- Modify: `android/app/src/main/res/values/strings.xml`
- Modify: `android/app/src/main/res/values-b+zh+Hans/strings.xml`
- Modify: `android/app/src/main/res/values-ja/strings.xml`
- Modify: `android/app/src/main/res/values-ko/strings.xml`
- Create: `android/app/src/test/java/com/mrongm/hobgoblin/ui/screens/settings/SettingsThemeContractTest.kt`
- Create: `android/app/src/test/java/com/mrongm/hobgoblin/AndroidApplicationThemeContractTest.kt`

**Interfaces:**

- Consumes: `AndroidApplicationThemeStore` and the Task 1 model.
- Changes: `HobgoblinAndroidApp` receives `applicationTheme` and `onApplicationThemeChange`.
- Changes: `SettingsScreen` receives `initialApplicationTheme`; `onSave` adds `AndroidApplicationTheme` as its final argument.

- [ ] **Step 1: Write failing source-contract tests**

  Verify Settings owns `selectedAppearance` and `selectedColorTheme`, exposes two `ExposedDropdownMenuBox` controls, iterates all enum entries, includes theme changes in `hasChanges`, and passes `AndroidApplicationTheme` to `onSave`. Verify MainActivity creates/loads the store, feeds the loaded value into the root `HobgoblinTheme`, persists changes, and updates Compose state.

- [ ] **Step 2: Run focused contracts and verify RED**

  Expected: assertions fail because theme state and controls are absent.

- [ ] **Step 3: Add complete localized copy**

  Add keys for `settings_theme`, `settings_appearance`, three appearance choices, and twelve preset names to every locale. Brand names remain stable; only generic labels and appearance choices are translated.

- [ ] **Step 4: Add the two Settings selectors**

  Place Theme then Appearance before Language. Each selector is a full-width read-only exposed dropdown. Add resource-id mapping properties for both enums. Extend `hasChanges`, `canSave`, and `onSave` without changing validation for heartbeat inputs.

- [ ] **Step 5: Lift the saved theme to the root**

  In `MainActivity.setContent`, load the store once with `remember`, hold the current value with mutable state, and wrap the app in `HobgoblinTheme(applicationTheme = applicationTheme)`. Pass the current value and a callback to `HobgoblinAndroidApp`; on Settings Save, persist and invoke the callback before navigating away. Keep language application behavior intact.

- [ ] **Step 6: Run focused contracts and verify GREEN**

  Run the two new contract tests plus localization and Settings privacy contract tests.

---

### Task 4: Regression verification

**Files:**

- Review only; change production files only if a failing test identifies an in-scope regression.

**Interfaces:** None.

- [ ] **Step 1: Run the full Android unit suite**

  Run: `./gradlew testDebugUnitTest`

  Expected: BUILD SUCCESSFUL with all unit tests passing.

- [ ] **Step 2: Build the debug APK**

  Run: `./gradlew assembleDebug`

  Expected: BUILD SUCCESSFUL and a generated debug APK.

- [ ] **Step 3: Run repository architecture and TypeScript checks**

  From the repository root run `bun run check:architecture` and `bun run typecheck` because shared documentation and cross-platform source references were used. Expected: both commands exit successfully.

- [ ] **Step 4: Review diff and safety boundaries**

  Confirm no Web theme CSS, terminal palette, package version, lockfile, or unrelated user change was modified. Confirm no generated build artifact is tracked.
