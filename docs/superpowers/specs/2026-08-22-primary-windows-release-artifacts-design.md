# Primary Windows Release Artifacts Design

## Goal

Publish the Windows x64 and ARM64 installers from Hobgoblin's primary root application so that the Windows download contains the same product features as the macOS build from the same release commit. Retain the independent `windows/` package for package-local development and testing without publishing its installers in the versioned GitHub Release.

## Problem

Release v2.2.7 is built from one Git commit, but its macOS and Windows installers package different source trees. macOS packages root `src/`; Windows packages `windows/src`. Between v2.2.6 and v2.2.7, root features such as branch-prefix selection, recent-repository navigation, remote worktree branch switching, and parts of the merge workflow were not all implemented in `windows/src`, so equal version numbers did not guarantee equal product behavior.

The release boundary must therefore select one canonical desktop product source rather than relying on manual synchronization between two complete Electron applications.

## Decision

The primary application Windows version becomes the source of every official Windows release artifact. The official assets remain:

```text
Hobgoblin-<version>-x64.exe
Hobgoblin-<version>-arm64.exe
```

The independent Windows version remains a separate package. Its builds may be retained as temporary CI artifacts with names that identify them as independent, but the reusable Release call must not produce or download them.

This change does not merge `windows/src` into root `src`, delete the independent package, or migrate independent-only enhancements such as its packaged `hob.cmd` PATH integration. Those are separate product decisions.

## Build boundaries

### Root release script

`scripts/build-release-artifacts.ts` continues to build exactly one platform and architecture per invocation. It adds `windows` as a supported platform, validates that it is running on Windows, builds the root renderer, invokes Electron Builder with the Windows NSIS target and the requested native architecture, and verifies the exact architecture-qualified `.exe` path below root `release/`.

The existing macOS behavior and filenames remain unchanged. Shared parsing, version validation, renderer checks, and artifact verification stay in the same script to avoid a second root release implementation.

### Electron Builder

The root `electron-builder.ts` adds Windows NSIS targets for x64 and ARM64 and uses the existing architecture-qualified artifact name. It retains the existing root source globs and ConPTY asset restoration, which already support a primary application Windows package.

The installer remains unsigned, per-user, non-one-click, and allows installation-directory selection. Independent-only installer hooks and launcher resources are not imported into the root package in this change.

### Windows workflow

`.github/workflows/windows-test.yml` keeps ownership of native Windows execution and becomes the reusable producer of official primary-application installers:

- The primary build uses a two-entry native matrix: `windows-latest` for x64 and `windows-11-arm` for ARM64.
- Each matrix entry installs root dependencies, typechecks root source, runs the applicable primary Windows compatibility tests, builds the root NSIS installer, runs the existing packaged startup/internal-terminal smoke against root `release/`, and uploads `release/Hobgoblin-*-${arch}.exe` under a primary-application artifact name.
- The Release caller sets the reusable workflow's typed `official_release` input to `true`, so only the primary matrix runs. This boundary is explicit because a called workflow inherits the caller's `github` event context.
- Standalone Windows test events may additionally build and test the independent package, but those artifacts keep an explicit `independent` name and never enter release publication.

`.github/workflows/release.yml` remains the orchestrator. It calls the reusable Windows workflow, downloads the primary Windows artifacts with the other platform outputs, requires both exact `.exe` filenames, and uploads them with `--clobber`. The fix is published as v2.2.8 so the tag, workflow checkout, notes, and every asset share one immutable release identity; the existing v2.2.7 tag and assets remain unchanged.

## Failure semantics

- The Windows matrix retains `fail-fast: false` so both architectures provide diagnostics independently.
- Missing root renderer output, ConPTY resources, the exact installer, or a successful packaged smoke fails that architecture.
- Failure of either Windows architecture prevents the publish job from updating the GitHub Release.
- Independent-package failures outside a reusable Release call do not substitute independent installers for primary installers.
- No local implementation command commits, pushes, dispatches GitHub Actions, or replaces existing release assets.

## Documentation and domain model

`CONTEXT.md` defines the official Windows release artifact as a primary-application installer and removes release-asset ownership from the independent Windows version. ADR-0005 supersedes ADR-0004's contrary release decision while retaining the independent package itself.

Release notes and Windows package documentation must stop describing the independent package as the source of official Windows downloads. Existing user-facing architecture labels and unsigned-build warnings remain unchanged.

## Verification

Repository tests must lock the following contracts:

- The root Electron Builder configuration declares Windows NSIS x64/ARM64 targets and exact filenames.
- The root release script accepts Windows x64/ARM64 and preserves existing macOS behavior.
- The reusable Windows Release path builds and uploads only primary application installers.
- Standalone independent artifacts cannot collide with official release artifact names.
- The publish job still requires and uploads both Windows architectures.
- Documentation consistently names the primary application Windows version as the official release source.

Local verification runs:

```sh
bun run typecheck
bun run test
bun run check:architecture
```

The actual Windows installers and packaged smoke require the corresponding native GitHub runners. Publishing v2.2.8 requires a later, explicitly authorized merge/push and successful manual Release workflow dispatch.

## Acceptance criteria

- Official Windows x64 and ARM64 installers package root `src/` from the same workflow-run checkout used by macOS.
- Both installers retain `Hobgoblin-<version>-<arch>.exe` names.
- The primary packaged application passes the existing Windows startup and terminal smoke on both native runners.
- The independent package remains usable for local/CI testing but contributes no versioned GitHub Release asset.
- Publishing v2.2.8 creates a new tag from the merged workflow checkout and leaves the existing `v2.2.7` tag and independent Windows assets unchanged, preserving exact tag-to-build provenance for both releases.
