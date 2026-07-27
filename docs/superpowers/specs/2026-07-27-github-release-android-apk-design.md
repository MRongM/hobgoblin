# GitHub Release Android APK Design

**Date:** 2026-07-27
**Status:** Approved through user-delegated autonomous execution

## Goal

Extend the existing manually triggered GitHub Release workflow so it builds the Android release APK, preserves it as a GitHub Actions artifact, and uploads it to the same versioned GitHub Release as the macOS and Windows assets.

## Selected Approach

Add an independent `build-android` job to `.github/workflows/release.yml`. The job runs on Ubuntu with Temurin JDK 17, invokes the checked-in Gradle Wrapper with `:app:assembleRelease`, and uploads `app-release-unsigned.apk` as an intermediate Actions artifact. The existing `publish` job downloads all build artifacts, renames the APK to `Hobgoblin-<package.json version>-android.apk`, validates it with the desktop assets, and uploads it with `gh release upload --clobber`.

This keeps Gradle concerns out of the Electron release script and preserves the workflow's existing build-artifact-publish boundary.

## Alternatives Considered

1. Extend `scripts/build-release-artifacts.ts` with Android support. Rejected because the script is an Electron packaging boundary and Android uses a separate Gradle toolchain.
2. Build Android inside the `publish` job. Rejected because publishing should only aggregate and publish already verified outputs; coupling the build increases permissions and failure scope.
3. Add keystore-based APK signing. Rejected for this change because no signing identity or secret contract is defined, and the current Release explicitly distributes unsigned builds.

## Artifact and Version Contract

- Gradle source output: `android/app/build/outputs/apk/release/app-release-unsigned.apk`.
- Actions artifact: `hobgoblin-android`, containing the unmodified Gradle output.
- GitHub Release asset: `Hobgoblin-<root package.json version>-android.apk`.
- Android's embedded `versionName` remains owned by `android/app/build.gradle.kts`; this workflow does not rewrite it.
- The Release note states that the Android APK is unsigned and must be signed before installation.

## Failure Handling

- The Android job fails if JDK setup, dependency resolution, compilation, or APK generation fails.
- `actions/upload-artifact` uses `if-no-files-found: error` so a missing APK cannot be silently ignored.
- The publish job depends on all three platform build jobs.
- The publish job fails if the raw Android artifact is missing, the standardized APK is missing, or GitHub Release upload fails.
- Re-running the workflow replaces the same versioned asset through `--clobber`.

## Testing

Extend `src/system/build-script.test.ts` before modifying the workflow. The contract test must assert the Android job, JDK 17 setup, Gradle Wrapper command, raw APK path, publish dependency, standardized release name, unsigned warning, and release upload integration. Then run the focused test red/green cycle and the repository quality gates.

## Acceptance Criteria

- A manual Release workflow run builds macOS, Windows, and Android in separate jobs.
- Android uses the checked-in Gradle Wrapper on JDK 17.
- The unsigned release APK is retained as an Actions artifact.
- The publish job waits for Android and validates `Hobgoblin-<version>-android.apk`.
- The APK is uploaded to `v<package.json version>` with overwrite semantics.
- Release notes accurately disclose that the APK is unsigned and not directly installable.
- No signing secrets, new dependencies, automatic triggers, commits, tags, pushes, or external releases are introduced.

## Self-Review

- No placeholders or unresolved choices remain.
- The design does not conflate the root Release version with the embedded Android version.
- The workflow preserves the existing manual trigger and permission model.
- Signing is explicitly outside scope rather than being implied or emulated with a debug key.
