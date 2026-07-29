# GitHub Release Android APK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. The user selected inline execution; do not dispatch subagents and do not create Git commits.

**Goal:** Build an unsigned Android release APK in GitHub Actions and upload it to the existing versioned GitHub Release.

**Architecture:** Add a standalone Ubuntu/JDK Android build job that publishes the Gradle APK as a workflow artifact. Extend the existing publish job to standardize, validate, document, and upload the APK alongside the desktop assets.

**Tech Stack:** GitHub Actions, Temurin JDK 17, Gradle Wrapper, Android Gradle Plugin, Vitest.

## Global Constraints

- Preserve `workflow_dispatch` as the only release trigger.
- Do not add signing secrets or a debug-key substitute.
- Do not change Android `versionCode` or `versionName`.
- Do not modify the Electron release build script.
- Do not commit, tag, push, or trigger the external workflow.

---

### Task 1: Lock the Android release workflow contract

**Files:**

- Modify: `src/system/build-script.test.ts`
- Test: `src/system/build-script.test.ts`

**Interfaces:**

- Consumes: `.github/workflows/release.yml` as repository text.
- Produces: regression assertions for the Android build and publish contract.

- [x] **Step 1: Extend the existing release workflow test**

Rename the test to include Android and add assertions for:

```ts
expect(workflow).toContain('build-android:')
expect(workflow).toContain('actions/setup-java@v4')
expect(workflow).toContain('distribution: temurin')
expect(workflow).toContain('java-version: 17')
expect(workflow).toContain('./gradlew --no-daemon :app:assembleRelease')
expect(workflow).toContain('android/app/build/outputs/apk/release/app-release-unsigned.apk')
expect(workflow).toContain('needs: [build-macos, build-windows, build-android]')
expect(workflow).toContain('Hobgoblin-${VERSION}-android.apk')
expect(workflow).toContain('Android: This APK is unsigned and must be signed before installation.')
```

- [x] **Step 2: Verify RED**

Run:

```sh
bun run test src/system/build-script.test.ts
```

Expected: FAIL because `release.yml` has no `build-android` job or Android asset contract.

### Task 2: Build and publish the Android APK

**Files:**

- Modify: `.github/workflows/release.yml`
- Test: `src/system/build-script.test.ts`

**Interfaces:**

- Consumes: the checked-in `android/gradlew` and Gradle project.
- Produces: raw Actions artifact `hobgoblin-android` and GitHub Release asset `Hobgoblin-<version>-android.apk`.

- [x] **Step 1: Add the Android build job**

Add `build-android` after `build-windows`. Use `ubuntu-latest`, `actions/setup-java@v4` with Temurin 17, run `./gradlew --no-daemon :app:assembleRelease` from `android`, and upload the raw unsigned APK with `if-no-files-found: error`.

- [x] **Step 2: Extend publish aggregation**

Add `build-android` to `publish.needs`. After artifacts are downloaded, rename `app-release-unsigned.apk` to `Hobgoblin-${VERSION}-android.apk`. Add that name to the expected asset list and `gh release upload` arguments.

- [x] **Step 3: Disclose the signing state**

Add this exact Release note:

```text
Android: This APK is unsigned and must be signed before installation.
```

- [x] **Step 4: Verify GREEN**

Run:

```sh
bun run test src/system/build-script.test.ts
```

Expected: PASS.

### Task 3: Run quality gates

**Files:**

- Verify: `.github/workflows/release.yml`
- Verify: `src/system/build-script.test.ts`

**Interfaces:**

- Consumes: completed Tasks 1–2.
- Produces: evidence that the configuration integrates with the repository.

- [x] **Step 1: Validate the Gradle release task locally**

Run:

```sh
cd "android" && ./gradlew --no-daemon :app:assembleRelease
```

Expected: exit 0 and `android/app/build/outputs/apk/release/app-release-unsigned.apk` exists.

- [x] **Step 2: Run repository gates**

Run:

```sh
bun run typecheck
bun run check:architecture
bun run test
git diff --check
```

Expected: all commands exit 0.

- [x] **Step 3: Review the final diff**

Confirm the change contains only the new design/plan documents, release workflow integration, and its focused regression test. Confirm no signing material, credential, automatic release trigger, or unrelated user file is modified.

## Plan Self-Review

- Every design requirement maps to a concrete assertion or workflow step.
- The plan contains no placeholders and no external or destructive action.
- The Android build and publish boundaries remain independently reviewable.
- Test-first failure and passing verification are explicit.
