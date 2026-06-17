# GitHub Action Release Build Design

## Intent

Add a manually triggered GitHub Actions release workflow that builds standard Hobgoblin desktop artifacts and uploads them to the GitHub Release for the current `package.json` version.

The release flow should support:

- macOS Apple Silicon DMG: `Hobgoblin-<version>-arm64.dmg`
- macOS Intel DMG: `Hobgoblin-<version>-x64.dmg`
- Windows x64 NSIS installer: `Hobgoblin-<version>-x64.exe`

The workflow is version-driven. Manual execution reads `package.json`, targets `v<version>`, and creates or updates that Release.

## Scope

In scope:

- Add `.github/workflows/release.yml` with `workflow_dispatch` as the only publish trigger.
- Add a CI-focused release artifact build script at `scripts/build-release-artifacts.ts`.
- Add minimal Windows NSIS packaging configuration to `electron-builder.ts`.
- Keep macOS artifact naming aligned with the existing `Hobgoblin-<version>-<arch>.dmg` convention.
- Upload release assets idempotently, replacing existing same-name assets for repeated manual runs.
- Add unsigned-build notes to Release notes for macOS Gatekeeper and Windows SmartScreen expectations.
- Add focused tests that lock the release workflow, artifact expectations, and Windows packaging configuration.

Out of scope:

- Automatic releases on push, merge, or tag creation.
- Automatic version bumps.
- Automatic git commits or code pushes.
- Apple notarization, Developer ID signing, Windows code signing, or secret management for signing.
- Refactoring the local install workflow.
- Replacing the existing `scripts/publish.ts` local macOS publish script.

## Architecture

Keep CI release packaging separate from local app installation.

`scripts/build.ts` remains focused on local developer use:

- Build and install the app locally on macOS.
- Build a host-architecture macOS DMG for local use.
- Preserve the existing fast install path and host-architecture assumptions.

The new CI artifact script owns release packaging:

- Resolve `package.json` version.
- Build web and server bundles.
- Invoke `electron-builder` for the current CI platform.
- Validate that expected release assets exist.
- Fail with clear diagnostics when expected artifacts are missing.

The GitHub workflow owns orchestration:

- Run macOS and Windows packaging jobs independently.
- Upload platform artifacts as temporary workflow artifacts.
- Run a final publish job after both build jobs finish.
- Create or reuse `v<version>` and upload assets with overwrite semantics.

This split keeps responsibilities narrow and avoids turning local install scripts into a cross-platform release orchestrator.

## Workflow Design

The release workflow should use `workflow_dispatch` only.

Jobs:

- `build-macos`
  - Runs on a macOS runner.
  - Installs dependencies with `bun install --frozen-lockfile`.
  - Runs `bun run typecheck`.
  - Builds `arm64` and `x64` DMG artifacts.
  - Uploads the two DMGs through `actions/upload-artifact`.

- `build-windows`
  - Runs on a Windows runner.
  - Installs dependencies with `bun install --frozen-lockfile`.
  - Runs `bun run typecheck`.
  - Builds the x64 NSIS installer.
  - Uploads the EXE through `actions/upload-artifact`.

- `publish`
  - Depends on both build jobs.
  - Downloads all workflow artifacts.
  - Reads `package.json` version and derives `v<version>`.
  - Creates the GitHub Release if it does not exist, targeting the manually triggered workflow commit via `GITHUB_SHA`.
  - Reuses the GitHub Release if it already exists.
  - Uploads all assets with same-name overwrite behavior.

The workflow should set the minimal required permission:

```yaml
permissions:
  contents: write
```

## Artifact Standards

The published release assets must be exactly:

```text
Hobgoblin-<version>-arm64.dmg
Hobgoblin-<version>-x64.dmg
Hobgoblin-<version>-x64.exe
```

The macOS names should come from the existing electron-builder artifact naming convention:

```text
${productName}-${version}-${arch}.${ext}
```

The Windows NSIS artifact should use the same product/version/architecture pattern to keep all release assets predictable.

## Release Notes

Release notes should state that the builds are unsigned.

The macOS note should mention that Gatekeeper can block unsigned downloads and include the existing quarantine removal command:

```sh
xattr -dr com.apple.quarantine /Applications/Hobgoblin.app
```

The Windows note should mention that SmartScreen may warn on unsigned installers and that the user should only continue if they trust the GitHub Release source.

## Error Handling

The CI release flow should fail fast when:

- `package.json` version is not semver-like.
- Dependency installation fails.
- Typecheck fails.
- Web or server build output is missing.
- `electron-builder` fails.
- Any expected platform artifact is missing.
- The publish job cannot create or update the GitHub Release.
- Asset upload fails.

Repeated manual runs for the same version should be idempotent. Existing same-name Release assets should be replaced, not duplicated with run-number suffixes.

## Tests

Add focused tests that inspect repository configuration and scripts.

Coverage should include:

- `.github/workflows/release.yml` exists.
- The workflow uses `workflow_dispatch`.
- The workflow grants `contents: write`.
- The workflow has macOS, Windows, and publish jobs.
- The workflow uses `bun install --frozen-lockfile`.
- The release artifact script checks for the three standard asset names.
- `electron-builder.ts` includes Windows NSIS x64 packaging configuration.
- Existing local build tests continue to protect `scripts/build.ts` host-architecture behavior.

Verification should run:

```sh
bun run typecheck
bun run check:architecture
bun run test
```

If CI runners are available, manually trigger the release workflow and verify that `v<version>` contains all three expected assets.

## Risks

The main risk is mixing local install and CI release concerns. That would make local builds slower and could break the existing fast install path. Keeping a separate CI artifact script avoids this.

The second risk is cross-platform native packaging drift. Windows packaging should be added with the smallest electron-builder configuration needed for an x64 NSIS installer.

The third risk is unsigned-build confusion. The workflow should not hide that limitation; Release notes must make it explicit for both macOS and Windows users.

## Acceptance Criteria

- A maintainer can manually trigger the release workflow from GitHub Actions.
- The workflow derives the Release tag from `package.json` as `v<version>`.
- The workflow creates the Release if missing and targets the workflow commit.
- The workflow updates the existing Release if present.
- Re-running the workflow replaces same-name assets.
- The Release contains exactly the standard macOS arm64 DMG, macOS x64 DMG, and Windows x64 EXE assets.
- Local `scripts/build.ts` install behavior remains scoped to local macOS usage.
- `bun run typecheck`, `bun run check:architecture`, and `bun run test` pass.
