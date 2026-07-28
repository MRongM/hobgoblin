# Android Application Language Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-app Android language picker for system default, English, Simplified Chinese, Japanese, and Korean across API 26+.

**Architecture:** A pure Kotlin preference model maps stable language tags. AndroidX AppCompat remains the sole platform read/write and persistence boundary, while `SettingsScreen` stages the value until Save. Non-Activity notification resources resolve through a locale-aware AndroidX context.

**Tech Stack:** Kotlin 2.3, Jetpack Compose Material 3, AndroidX AppCompat 1.7.1, AndroidX Core 1.18.0, JUnit 4

**Execution Status:** Implemented inline; final verification recorded in the session handoff.

## Global Constraints

- Android application language remains device-local and never synchronizes with the Hobgoblin server or desktop/Web settings.
- Supported preferences are `FollowSystem`, `English`, `SimplifiedChinese`, `Japanese`, and `Korean`; the corresponding tags are `""`, `en`, `zh-Hans`, `ja`, and `ko`.
- Keep terminal output, commands, paths, repository/Host names, and raw Git/SSH/Termux diagnostics unchanged.
- Pin the new AppCompat dependency exactly at `1.7.1`.
- Do not introduce a second language persistence store.
- Do not execute Git commits; repository instructions require an explicit user request.

---

## File Structure

- Create `android/app/src/main/java/com/mrongm/hobgoblin/ui/text/AndroidApplicationLanguage.kt`
  - Pure preference model plus the narrow AppCompat read/write adapter.
- Create `android/app/src/test/java/com/mrongm/hobgoblin/ui/text/AndroidApplicationLanguageTest.kt`
  - Pure language-tag normalization tests.
- Modify `android/gradle/libs.versions.toml`
  - Pin and expose AppCompat 1.7.1.
- Modify `android/app/build.gradle.kts`
  - Add the AppCompat application dependency.
- Modify `android/app/src/main/AndroidManifest.xml`
  - Enable AppCompat locale auto-storage for API 26–32.
- Modify `android/app/src/main/res/values/styles.xml`
  - Use an AppCompat no-action-bar Activity theme.
- Modify `android/app/src/main/java/com/mrongm/hobgoblin/MainActivity.kt`
  - Host Compose from `AppCompatActivity`.
- Modify `android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/settings/SettingsScreen.kt`
  - Stage and render the language dropdown and submit it with the settings form.
- Modify `android/app/src/main/java/com/mrongm/hobgoblin/HobgoblinAndroidApp.kt`
  - Read and apply the device-local application language preference.
- Modify all four Android `strings.xml` catalogs
  - Add the picker label, follow-system label, and four self-named language labels.
- Modify `android/app/src/test/java/com/mrongm/hobgoblin/AndroidLocalizationContractTest.kt`
  - Verify AppCompat configuration, Activity host, picker wiring, and resource parity.
- Modify `android/app/src/main/java/com/mrongm/hobgoblin/terminals/TerminalForegroundService.kt`
  - Resolve Service-owned notification resources from the application-language context.

---

### Task 1: Application Language Model and Platform Contract

**Files:**
- Create: `android/app/src/test/java/com/mrongm/hobgoblin/ui/text/AndroidApplicationLanguageTest.kt`
- Create: `android/app/src/main/java/com/mrongm/hobgoblin/ui/text/AndroidApplicationLanguage.kt`
- Modify: `android/app/src/test/java/com/mrongm/hobgoblin/AndroidLocalizationContractTest.kt`
- Modify: `android/gradle/libs.versions.toml`
- Modify: `android/app/build.gradle.kts`
- Modify: `android/app/src/main/AndroidManifest.xml`
- Modify: `android/app/src/main/res/values/styles.xml`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/MainActivity.kt`

**Interfaces:**
- Produces `enum class AndroidApplicationLanguagePreference(val languageTags: String)`.
- Produces `data class AndroidApplicationLanguageSetting(val preference: AndroidApplicationLanguagePreference, val languageTags: String)`.
- Produces `applicationLanguagePreference(languageTags: String): AndroidApplicationLanguagePreference`.
- Produces `applicationLanguageChangeRequired(currentLanguageTags: String, targetPreference: AndroidApplicationLanguagePreference): Boolean`.
- Produces `currentAndroidApplicationLanguageSetting(): AndroidApplicationLanguageSetting`.
- Produces `setAndroidApplicationLanguagePreference(preference: AndroidApplicationLanguagePreference)`.

- [ ] **Step 1: Write failing model tests**

Create tests asserting empty tags map to `FollowSystem`, `en`/`zh-Hans`/`ja`/`ko` map to their explicit preferences, regional `zh-CN` maps to `SimplifiedChinese`, `zh-Hant`/`zh-TW` do not, and an unsupported or multi-locale override remains available for clearing.

```kotlin
@Test
fun `supported application locale tags map to explicit preferences`() {
    assertEquals(AndroidApplicationLanguagePreference.English, applicationLanguagePreference("en-US"))
    assertEquals(AndroidApplicationLanguagePreference.SimplifiedChinese, applicationLanguagePreference("zh-Hans"))
    assertEquals(AndroidApplicationLanguagePreference.SimplifiedChinese, applicationLanguagePreference("zh-CN"))
    assertEquals(AndroidApplicationLanguagePreference.Japanese, applicationLanguagePreference("ja"))
    assertEquals(AndroidApplicationLanguagePreference.Korean, applicationLanguagePreference("ko"))
}
```

- [ ] **Step 2: Add failing platform contract assertions**

Extend `AndroidLocalizationContractTest` to assert:

```kotlin
assertTrue(versionCatalog.contains("appcompat = \"1.7.1\""))
assertTrue(appBuild.contains("implementation(libs.androidx.appcompat)"))
assertTrue(manifest.contains("androidx.appcompat.app.AppLocalesMetadataHolderService"))
assertTrue(manifest.contains("android:name=\"autoStoreLocales\""))
assertTrue(mainActivity.contains("class MainActivity : AppCompatActivity()"))
```

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```bash
cd android
./gradlew testDebugUnitTest --tests com.mrongm.hobgoblin.AndroidLocalizationContractTest --tests com.mrongm.hobgoblin.ui.text.AndroidApplicationLanguageTest
```

Expected: FAIL because the language model and AppCompat configuration do not exist.

- [ ] **Step 4: Implement the minimal preference model and adapter**

Create the enum and mapping. Normalize only the first locale's primary language with `Locale.ROOT`; use `LocaleListCompat.forLanguageTags(preference.languageTags)` for writes. Skip `setApplicationLocales` when the mapped current preference already matches.

```kotlin
enum class AndroidApplicationLanguagePreference(val languageTags: String) {
    FollowSystem(""),
    English("en"),
    SimplifiedChinese("zh-Hans"),
    Japanese("ja"),
    Korean("ko"),
}
```

- [ ] **Step 5: Add AppCompat platform configuration**

Pin `appcompat = "1.7.1"`, add `androidx-appcompat`, depend on `libs.androidx.appcompat`, add the disabled `AppLocalesMetadataHolderService` with `autoStoreLocales=true`, change the Activity theme parent to `Theme.AppCompat.DayNight.NoActionBar`, and replace `ComponentActivity` with `AppCompatActivity`.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run the Step 3 command. Expected: PASS.

---

### Task 2: Settings Language Picker

**Files:**
- Modify: `android/app/src/test/java/com/mrongm/hobgoblin/AndroidLocalizationContractTest.kt`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/settings/SettingsScreen.kt`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/HobgoblinAndroidApp.kt`
- Modify: `android/app/src/main/res/values/strings.xml`
- Modify: `android/app/src/main/res/values-b+zh+Hans/strings.xml`
- Modify: `android/app/src/main/res/values-ja/strings.xml`
- Modify: `android/app/src/main/res/values-ko/strings.xml`

**Interfaces:**
- Consumes `AndroidApplicationLanguagePreference` and its AppCompat adapter from Task 1.
- Changes `SettingsScreen` to consume an `AndroidApplicationLanguageSetting`, preserve raw tags for change detection, and submit `(Long, Int, AndroidApplicationLanguagePreference)`.

- [ ] **Step 1: Write failing picker contract assertions**

Assert the settings source contains `initialApplicationLanguage`, `ExposedDropdownMenuBox`, all enum entries, and a three-argument `onSave`; assert `HobgoblinAndroidApp` reads and applies the AppCompat preference. Resource parity will require the same five new keys in every catalog.

- [ ] **Step 2: Run the localization contract and verify RED**

Run:

```bash
cd android
./gradlew testDebugUnitTest --tests com.mrongm.hobgoblin.AndroidLocalizationContractTest
```

Expected: FAIL because picker wiring and localized keys are absent.

- [ ] **Step 3: Add localized picker resources**

Add these keys to every catalog:

```xml
<string name="settings_language">Language</string>
<string name="settings_language_follow_system">Follow system</string>
<string name="settings_language_english">English</string>
<string name="settings_language_simplified_chinese">中文</string>
<string name="settings_language_japanese">日本語</string>
<string name="settings_language_korean">한국어</string>
```

Translate the first two labels per catalog; keep language names self-named.

- [ ] **Step 4: Implement the staged Material 3 dropdown**

Add `initialApplicationLanguage`, remember the staged selection, render an `ExposedDropdownMenuBox` before keepalive settings, make the content vertically scrollable, and include raw-tag or language changes in `canSave`. Each menu item sets the staged enum and closes the menu; it does not apply locale immediately.

- [ ] **Step 5: Wire settings Save to AppCompat**

Read `currentAndroidApplicationLanguagePreference()` when opening settings. In the Save callback, write both terminal values, return to Hosts, then call `setAndroidApplicationLanguagePreference(applicationLanguage)`.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run the Step 2 command. Expected: PASS, including complete four-catalog resource parity.

---

### Task 3: Locale-Aware Foreground Notifications and Full Verification

**Files:**
- Modify: `android/app/src/test/java/com/mrongm/hobgoblin/AndroidLocalizationContractTest.kt`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/terminals/TerminalForegroundService.kt`

**Interfaces:**
- Consumes the AppCompat-managed application locale.
- Produces notification title, body, fallback text, and channel name from `ContextCompat.getContextForLanguage(context)`.

- [ ] **Step 1: Write the failing notification context contract**

Assert `TerminalForegroundService.kt` imports `androidx.core.content.ContextCompat` and uses `ContextCompat.getContextForLanguage` before resolving resource strings.

- [ ] **Step 2: Run the contract and verify RED**

Run:

```bash
cd android
./gradlew testDebugUnitTest --tests com.mrongm.hobgoblin.AndroidLocalizationContractTest
```

Expected: FAIL because Service resource resolution still uses its raw context.

- [ ] **Step 3: Resolve resources through the application-language context**

Create one private `Context.forApplicationLanguage()` helper. Use it in `startIntent`, fallback title/text resolution, and notification channel naming; continue using the Service itself for notification construction and lifecycle APIs.

- [ ] **Step 4: Run Android verification**

Run:

```bash
cd android
./gradlew testDebugUnitTest
./gradlew lintDebug
./gradlew assembleDebug
```

Expected: all commands PASS with no new localization or manifest errors.

- [ ] **Step 5: Run repository verification**

From the repository root, run:

```bash
bun run typecheck
bun run test
bun run check:architecture
git diff --check
```

Expected: all commands PASS. Preserve the pre-existing unrelated modification to `android/app/src/test/java/com/mrongm/hobgoblin/terminals/TmuxSessionProtocolTest.kt`.
