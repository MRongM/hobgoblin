# Independent Windows Platform Package Design

## Goal

Move the proven Windows desktop implementation into a standalone `windows/` package so that Windows behavior, dependencies, packaging, and all Windows build outputs are isolated from the root desktop/web application.

## Decision

`windows/` is a complete Electron application package, not a root-package build mode. It owns its own `src/`, dependency manifest and lockfile, build/test/typecheck scripts, Electron Builder configuration, installer resources, launcher, notices, licenses, static assets, and license-preservation attributes. Build products are confined to `windows/dist/` and `windows/release*`.

The package starts from the selected Windows implementation snapshot. The root application remains at the current branch implementation. No shared-core extraction, source symlink, or root-to-Windows source import is introduced; those would either violate isolation or turn this migration into a broader architecture rewrite.

## Package topology

```text
windows/
  src/                 # independent Electron main/server/shared/web source
  scripts/             # Windows dev, validation, and package commands
  assets/              # Windows package static assets
  bin/                 # packaged Windows `hob` launcher
  build/               # NSIS installer and PATH integration resources
  LICENSES/            # packaged license texts
  package.json         # exact dependency versions and Windows commands
  bun.lock             # lockfile for the independent package
  electron-builder.ts  # Windows-only NSIS configuration
  tsconfig*.json       # package-local TypeScript projects
  vite.config.ts
  vitest.config.ts
```

`windows/package.json` owns `dev`, `start:server`, `build:web`, `build:release`, `build:electron`, `build:win:fast`, `typecheck`, `test`, and `check:architecture`. Its package scripts resolve paths relative to `windows/`; none requires the root application's source tree or build outputs.

## Release integration

The root GitHub workflow remains the release orchestrator. Its own Electron Builder and release artifact script build macOS only. It installs and tests `windows/`, invokes its release command from that directory for both supported Windows architectures, smoke-tests the unpacked executable below `windows/release/`, and uploads installers from the same location. A manually dispatched Windows Test Build may additionally package root `src/` as an x64 unpacked primary-application test artifact; reusable release calls leave that optional job disabled, so it is never published as a release asset. The release version remains the product version; CI checks that the Windows package version equals the root release version before publishing artifacts.

## Guardrails

- Windows package code must keep the existing `main → server/web` and `web → main` architecture restrictions.
- The package version and root release version must be equal.
- Windows output paths are ignored only beneath `windows/`; no Windows build command may delete or emit root `dist/` or `release/` content.
- Existing source tests are retained under `windows/src/`, except tests whose subject is explicitly root-only macOS/POSIX packaging, publication, or launcher behavior; package-local tests cover the Windows build boundary instead.
- No automatic synchronization mechanism is added. Divergence is intentional and future Windows feature work must update `windows/` directly.

## Verification

On a non-Windows development host, verify the package layout, independent TypeScript/architecture checks, and targeted tests after installing dependencies in `windows/`. The current local Node 25 runner needs `NODE_OPTIONS=--no-experimental-webstorage` for jsdom tests; Windows CI uses Node 24 and does not need this local compatibility flag. On Windows CI, run the Windows package typecheck and compatibility tests for x64 and ARM64, create both NSIS artifacts within `windows/release/`, then execute the existing packaged startup and terminal smoke test against those artifacts.
