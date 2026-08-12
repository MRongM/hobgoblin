# Windows ARM64 Release Design

## Intent

Add a native Windows ARM64 desktop installer to every manually published Hobgoblin release while retaining the existing Windows x64 installer.

The additional asset is:

```text
Hobgoblin-<version>-arm64.exe
```

## Scope

In scope:

- Build the ARM64 NSIS installer on GitHub's hosted Windows 11 ARM64 runner.
- Keep building the x64 NSIS installer on the existing hosted x64 Windows runner.
- Run the existing Windows compatibility tests and packaged startup/internal-terminal smoke against both architectures.
- Require both Windows installers before publishing a GitHub Release.
- Document both Windows downloads in the current release notes, README files, and GitHub Pages install surface.

Out of scope:

- A combined multi-architecture Windows installer.
- Windows code signing or SmartScreen reputation changes.
- Replacing the x64 installer.
- Claiming exact Windows 11 x64 coverage; the x64 job remains on `windows-latest`.
- Adding a new application-domain term to `CONTEXT.md`; this is release infrastructure rather than a product concept.

## Decision

Use a two-entry Windows build matrix:

| Architecture | Runner           | Artifact                        |
| ------------ | ---------------- | ------------------------------- |
| x64          | `windows-latest` | `Hobgoblin-<version>-x64.exe`   |
| ARM64        | `windows-11-arm` | `Hobgoblin-<version>-arm64.exe` |

The ARM64 package must be built natively rather than cross-compiled on the x64 runner. Electron Builder supports Windows ARM64, Bun publishes a Windows ARM64 runtime, and GitHub provides `windows-11-arm`. Native installation also selects ARM64 optional packages such as Sharp automatically. This avoids producing an installer that contains an ARM64 Electron runtime alongside x64-only optional native dependencies.

The existing `node-pty` dependency already includes `win32-arm64` prebuilds, so no dependency change is required.

Primary references:

- [GitHub-hosted runners reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
- [Electron Builder architecture support](https://www.electron.build/docs/architecture/)
- [Bun installation and Windows ARM64 downloads](https://bun.sh/docs/installation)

## Release Boundaries

`electron-builder.ts` declares supported Windows NSIS architectures and preserves the existing architecture-qualified artifact name.

`scripts/build-release-artifacts.ts` continues to build exactly one platform/architecture pair per invocation. It accepts `windows/arm64`, builds the renderer, invokes Electron Builder with `--arm64`, and verifies the exact `.exe` name.

`.github/workflows/windows-test.yml` owns Windows architecture execution. Its matrix selects a native runner for each architecture, runs the same compatibility and packaged application smoke gates, and uploads architecture-qualified temporary artifacts and failure logs.

`.github/workflows/release.yml` remains the release orchestrator. The publish job downloads both Windows workflow artifacts, validates the additional ARM64 `.exe`, and uploads it to the versioned GitHub Release.

## Failure Semantics

- The Windows matrix uses `fail-fast: false`, so one architecture still provides diagnostics if the other fails.
- Each architecture uploads uniquely named startup logs on failure.
- Missing either Windows installer prevents the publish job from updating the GitHub Release.
- The existing unsigned-build warning remains applicable to both Windows installers.

## Verification

Automated repository tests must lock:

- Windows ARM64 support in Electron Builder and the release artifact script.
- Native runner selection for both Windows architectures.
- Architecture-specific build and workflow artifact paths.
- ARM64 asset validation and upload in the release workflow.
- Windows ARM64 discoverability in release documentation.

Local verification:

```sh
bun run typecheck
bun run check:architecture
bun run test
```

GitHub verification should run `.github/workflows/windows-test.yml` and confirm both matrix jobs pass, including the packaged internal-terminal smoke on `windows-11-arm`.

## Acceptance Criteria

- Existing Windows x64 release behavior remains intact.
- Every successful manual release contains `Hobgoblin-<version>-arm64.exe` and `Hobgoblin-<version>-x64.exe`.
- The ARM64 installer is built and smoke-tested on a native Windows 11 ARM64 runner.
- The packaged ARM64 internal terminal selects PowerShell and ConPTY through the existing smoke gate.
- Download documentation distinguishes Windows ARM64 from Windows x64.
