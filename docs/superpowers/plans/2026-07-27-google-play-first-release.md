# Hobgoblin Android Google Play First Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user selected inline execution; do not dispatch subagents and do not create Git commits.

**Goal:** Produce an auditable Google Play 0.1.0 first-release packet, public-ready localized privacy pages, compliant in-app privacy access, deterministic graphics, screenshot tooling, and a verified unsigned AAB.

**Architecture:** Keep public/static policy content under the existing `docs/**` GitHub Pages boundary, Android-only UI changes under `android/app/**`, and release-only material under `release/google-play/0.1.0/**`. Generate graphics and validate all text/image artifacts with focused shell scripts; leave credentials, signing, upload, and publication as explicit human-authorized operations.

**Tech Stack:** Kotlin, Jetpack Compose, Android resources, JUnit 4, static HTML/CSS, Bash 3.2+, FFmpeg, macOS `sips`, ADB/Android Emulator, Gradle.

## Global Constraints

- Release identity is `com.mrongm.hobgoblin`, `versionCode 1`, `versionName 0.1.0`.
- Store locales are `en-US`, `zh-CN`, `ja-JP`, and `ko-KR`; screenshots use English UI.
- Developer identity is `MRongM`; privacy contact is `jiangisright@gmail.com`.
- Target audience is 18 and over; the app is free, has no ads, and has no in-app purchases.
- The canonical privacy URL is `https://mrongm.github.io/hobgoblin/privacy/`.
- Use existing brand sources; do not generate a new logo or fabricate application UI.
- Keep all examples privacy-safe and never commit reviewer credentials, private keys, tokens, personal paths, or hostnames.
- Do not sign, upload, publish, commit, tag, or push without final explicit authorization.

---

### Task 1: In-app privacy-policy access

**Files:**
- Create: `android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/settings/PrivacyPolicy.kt`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/settings/SettingsScreen.kt`
- Modify: `android/app/src/main/res/values/strings.xml`
- Modify: `android/app/src/main/res/values-b+zh+Hans/strings.xml`
- Modify: `android/app/src/main/res/values-ja/strings.xml`
- Modify: `android/app/src/main/res/values-ko/strings.xml`
- Create: `android/app/src/test/java/com/mrongm/hobgoblin/ui/screens/settings/PrivacyPolicyTest.kt`
- Create: `android/app/src/test/java/com/mrongm/hobgoblin/ui/screens/settings/SettingsPrivacyPolicyContractTest.kt`

**Interfaces:**
- Produces: `PrivacyPolicy.url: String` with the canonical HTTPS URL.
- Consumes: Compose `LocalUriHandler.openUri(PrivacyPolicy.url)` from the settings UI.

- [ ] **Step 1: Add failing URL and screen contract tests**

Assert that `PrivacyPolicy.url` is HTTPS, uses host `mrongm.github.io`, and ends in `/hobgoblin/privacy/`. Read `SettingsScreen.kt` and assert it contains `R.string.settings_privacy_policy`, `LocalUriHandler`, and `PrivacyPolicy.url`.

- [ ] **Step 2: Run the focused tests and confirm failure**

Run:

```bash
cd "android" && ./gradlew \
  "testDebugUnitTest" \
  --tests "com.mrongm.hobgoblin.ui.screens.settings.PrivacyPolicyTest" \
  --tests "com.mrongm.hobgoblin.ui.screens.settings.SettingsPrivacyPolicyContractTest"
```

Expected: compilation or assertions fail because the policy object and settings control do not exist.

- [ ] **Step 3: Add the minimal policy object and localized action**

Create:

```kotlin
package com.mrongm.hobgoblin.ui.screens.settings

object PrivacyPolicy {
    const val url: String = "https://mrongm.github.io/hobgoblin/privacy/"
}
```

In `SettingsScreen`, obtain `LocalUriHandler.current` and add a `TextButton` whose click opens `PrivacyPolicy.url`. Add exactly one `settings_privacy_policy` string to all four catalogs:

```text
Privacy policy
隐私政策
プライバシーポリシー
개인정보 처리방침
```

- [ ] **Step 4: Run focused tests and localization contract**

Run:

```bash
cd "android" && ./gradlew \
  "testDebugUnitTest" \
  --tests "com.mrongm.hobgoblin.ui.screens.settings.*" \
  --tests "com.mrongm.hobgoblin.AndroidLocalizationContractTest"
```

Expected: all selected tests pass.

### Task 2: Localized public privacy pages

**Files:**
- Create: `docs/privacy/index.html`
- Create: `docs/privacy/en.html`
- Create: `docs/privacy/zh-cn.html`
- Create: `docs/privacy/ja.html`
- Create: `docs/privacy/ko.html`
- Create: `docs/privacy/privacy.css`
- Create: `scripts/google-play/validate-privacy-pages.sh`

**Interfaces:**
- Produces: the canonical entry point `/privacy/` and four directly addressable localized policies.
- Consumes: `MRongM`, `jiangisright@gmail.com`, and the verified Android data-handling facts from the design.

- [ ] **Step 1: Implement a static, accessible policy shell**

Use semantic HTML with a skip link, `main`, visible language navigation, effective date `2026-07-27`, mail link, and no JavaScript requirement. Use the existing brand palette and system fonts. `index.html` defaults to English and links to all localized pages; every localized page links back to the other languages.

- [ ] **Step 2: Write the four fact-equivalent policies**

Each policy must cover developer identity, scope, no developer collection, local storage, SSH transport, private-key protection, temporary passwords, Termux transfer, clipboard behavior, notifications, sharing, retention/deletion, security limits, children, international use, changes, and contact. Do not claim legal consent merely from app use and do not copy AudioLoop microphone/analytics wording.

- [ ] **Step 3: Add deterministic policy validation**

The shell validator must fail if any page lacks its language code, effective date, developer name, contact address, deletion/retention section, Termux disclosure, or a link to all four languages. It must reject `TBD`, `TODO`, `[Insert`, and `example.com`.

- [ ] **Step 4: Validate pages**

Run:

```bash
bash "scripts/google-play/validate-privacy-pages.sh"
```

Expected: `Validated 5 privacy pages.`

### Task 3: Localized store listing and Play Console declarations

**Files:**
- Create: `release/google-play/0.1.0/README.md`
- Create: `release/google-play/0.1.0/app-content.md`
- Create: `release/google-play/0.1.0/data-safety.md`
- Create: `release/google-play/0.1.0/foreground-service-declaration.md`
- Create: `release/google-play/0.1.0/review-access.md`
- Create: `release/google-play/0.1.0/release-notes/{en-US,zh-CN,ja-JP,ko-KR}.txt`
- Create: `release/google-play/0.1.0/store-listing/{en-US,zh-CN,ja-JP,ko-KR}/title.txt`
- Create: `release/google-play/0.1.0/store-listing/{en-US,zh-CN,ja-JP,ko-KR}/short-description.txt`
- Create: `release/google-play/0.1.0/store-listing/{en-US,zh-CN,ja-JP,ko-KR}/full-description.txt`
- Create: `release/google-play/0.1.0/store-listing/{en-US,zh-CN,ja-JP,ko-KR}/screenshot-copy.md`
- Create: `scripts/google-play/validate-release-copy.sh`

**Interfaces:**
- Produces: exact text to paste into Play Console and an evidence-backed declaration checklist.
- Consumes: Android-only capabilities and the confirmed commercial/audience decisions.

- [ ] **Step 1: Write Android-specific listing copy**

Use `Hobgoblin` as every localized title. Describe direct SSH host access, remote Git repositories/worktrees, retained terminals, tmux reuse, port forwarding, and optional Termux integration. State that users provide their own SSH host and credentials. Do not promise local Git, desktop/web UI, cloud synchronization, automatic tmux fallback, or hosted accounts.

- [ ] **Step 2: Write first-release notes and screenshot copy**

Each release note announces the initial Android release. Each screenshot-copy file defines the same five-image order and localized alt text while retaining stable English filenames.

- [ ] **Step 3: Write declaration guidance**

Record exact recommended answers for ads, app access, target audience, content rating, data safety, accounts, government/news/health/finance categories, permissions, and foreground service. `review-access.md` must instruct the owner to enter reusable English reviewer access directly in Play Console and must not contain credential placeholders that could be mistaken for working secrets.

- [ ] **Step 4: Add and run copy validation**

Count Unicode characters with a small embedded Ruby or Perl expression available on macOS. Enforce 30/80/4000 limits, exact locale set, non-empty release notes, HTTPS privacy URLs, and rejection of secret-looking or unfinished markers.

Run:

```bash
bash "scripts/google-play/validate-release-copy.sh" \
  "release/google-play/0.1.0"
```

Expected: `Validated Google Play copy for 4 locales.`

### Task 4: Deterministic brand assets

**Files:**
- Create: `release/google-play/0.1.0/graphics/feature-graphic.svg`
- Create: `scripts/google-play/release-assets-lib.sh`
- Create: `scripts/google-play/generate-brand-assets.sh`
- Create: `scripts/google-play/validate-release-assets.sh`
- Create: `scripts/google-play/tests/release-assets-test.sh`
- Generate: `release/google-play/0.1.0/graphics/app-icon.png`
- Generate: `release/google-play/0.1.0/graphics/feature-graphic.png`

**Interfaces:**
- Produces: `validate_png`, `normalize_screenshot`, `profile_density`, and `image_manifest_row` shell functions.
- Consumes: `assets/icon.png`, FFmpeg, `sips`, `stat`, and `shasum`.

- [ ] **Step 1: Write failing shell contract tests**

Test device profile density mappings, PNG dimensions, alpha requirements, size rejection, RGB normalization, and manifest row output using generated fixtures under `mktemp -d`.

- [ ] **Step 2: Implement the minimal shared asset library**

Provide:

```text
profile_density phone -> 420
profile_density tablet-7 -> 288
profile_density tablet-10 -> 216
normalize_screenshot input output -> 1080x1920 rgb24 PNG without metadata
validate_png path width height max_bytes alpha_policy
image_manifest_row group absolute_path relative_path
```

Always quote paths, use `set -euo pipefail`, and emit actionable failures.

- [ ] **Step 3: Create the SVG feature graphic**

Use a 1024×500 terminal-black canvas, restrained slate depth, shell-white wordmark, cyan-to-green branch path, and exact subtitle `Remote worktrees. Persistent terminals.`. Keep important content in the center safe area. Do not add device frames, screenshots, badges, rankings, or pricing.

- [ ] **Step 4: Generate and validate brand PNGs**

Downscale `assets/icon.png` to 512×512 while preserving alpha. Render the SVG at 1024×500 and normalize it to RGB without alpha. Validate Play constraints and record hashes.

Run:

```bash
bash "scripts/google-play/tests/release-assets-test.sh"
bash "scripts/google-play/generate-brand-assets.sh" \
  "release/google-play/0.1.0/graphics"
```

Expected: both assets validate and the test suite exits 0.

### Task 5: Real-UI screenshot capture tooling

**Files:**
- Create: `scripts/google-play/capture-screenshots.sh`
- Create: `release/google-play/0.1.0/graphics/screenshot-plan.md`
- Generate when a safe demo SSH target is available: `release/google-play/0.1.0/graphics/{phone,tablet-7,tablet-10}/*.png`

**Interfaces:**
- Consumes: Android SDK path from `android/local.properties`, `profile_density`, `normalize_screenshot`, an installed AVD, and Play-review-safe SSH demo access supplied only at runtime.
- Produces: five stable, English, real-UI screenshots per completed device profile.

- [ ] **Step 1: Implement emulator discovery and state restoration**

Find SDK tools from `ANDROID_SDK_ROOT`, `ANDROID_HOME`, or `android/local.properties`. Reuse a running named AVD or start it read-only. Save and restore display size, density, rotation, app state, and any started local demo process through traps.

- [ ] **Step 2: Implement privacy-safe capture prerequisites**

Require runtime-only demo host, user, port, private-key path, project path, and safe expected fingerprint. Reject common production hostname patterns, home-directory paths, and keys located inside the repository. Never print key contents or persist inputs under `release/`.

- [ ] **Step 3: Implement resource/text-based UI navigation**

Build/install the debug APK, force English locale, import the runtime-only key through the document picker, trust the exact demo fingerprint, save the host, add the project, open a worktree, open a terminal, and navigate retained terminals. Wait for UI nodes and capture a diagnostic dump on failure.

- [ ] **Step 4: Normalize and validate each screenshot**

Capture five 1080×1920 images for each completed profile using densities 420, 288, and 216 dpi. Strip metadata, reject alpha, validate byte size, and name files `01-settings.png` through `05-terminals.png`. The Settings screenshot replaces Hosts so release media does not expose a local SSH account; the worktree header may blur only the local demo target label.

- [ ] **Step 5: Run capture only if prerequisites are safely available**

If no suitable AVD or demo SSH access exists, do not manufacture screenshots. Validate the script syntax and record the exact missing prerequisite in `screenshot-plan.md`.

### Task 6: Artifact build, audit, and final handoff

**Files:**
- Generate: `android/app/build/outputs/bundle/release/app-release.aab`
- Generate after screenshots exist: `release/google-play/0.1.0/graphics/asset-manifest.tsv`
- Update: `release/google-play/0.1.0/README.md`

**Interfaces:**
- Consumes: Tasks 1–5 outputs.
- Produces: verified local status and a precise human-only completion list.

- [ ] **Step 1: Run repository and Android quality gates**

Run:

```bash
bun run typecheck
bun run test
bun run check:architecture
cd "android" && ./gradlew "testDebugUnitTest" "lintDebug" "bundleRelease"
```

Expected: every command exits 0 and the release bundle exists.

- [ ] **Step 2: Inspect release identity and signing state**

Use Android build tools to confirm package name, version code/name, minimum/target SDK, requested permissions, and whether the AAB is unsigned. Never attempt signing automatically.

- [ ] **Step 3: Run all release validators**

Run:

```bash
bash "scripts/google-play/validate-privacy-pages.sh"
bash "scripts/google-play/validate-release-copy.sh" \
  "release/google-play/0.1.0"
bash "scripts/google-play/validate-release-assets.sh" \
  "release/google-play/0.1.0/graphics"
git diff --check
git status --short
```

The asset validator may report screenshots as incomplete only when Task 5 documented a missing safe demo prerequisite; icon and feature graphic must pass unconditionally.

- [ ] **Step 4: Self-review against the design**

Scan for unfinished markers, personal data, secrets, desktop-only claims, privacy-policy contradictions, missing locales, invalid URLs, and unverified completion claims. Fix every local issue inline.

- [ ] **Step 5: Present final confirmation boundary**

Report completed files and verification results. Ask once for any desired external actions: publish GitHub Pages, provision/enter reviewer SSH access, create the foreground-service video, configure signing/upload key, upload the AAB/assets, begin required closed testing, submit for review, or roll out to production.

## Plan Self-Review

- Every design requirement maps to one task.
- Code, static content, release copy, graphics, screenshots, and build verification have separate owners and validation boundaries.
- No task requires a committed secret or production credential.
- The plan contains no unbounded refactor and introduces no new dependency.
- Git commits and external publication are deliberately excluded despite the generic planning skill's commit preference.
