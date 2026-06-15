# Install Script Timings Design

## Goal

Add default timing diagnostics to `./install.sh` by instrumenting the real build and install steps in `scripts/build.ts`.

The immediate goal is diagnosis, not behavioral acceleration. A normal `./install.sh` run should keep the same build, install, signing, cleanup, and restart behavior while printing enough timing information to identify which stage dominates local install time.

## Scope

In scope:

- Print timing output by default for install builds.
- Time the key build and install stages in `scripts/build.ts`.
- Include skipped stages in the timing output so the user can see why work did not run.
- Keep failures visible and preserve existing exit behavior.
- Add focused script-level tests for the timing helper and instrumented stages.

Out of scope:

- Changing cache policy.
- Skipping builds based on source mtimes.
- Writing profiling files.
- Adding a new CLI flag for timings.
- Running a real install as an automated test.
- Changing the app closing, replacement, signing, or restart semantics.

## Architecture

`install.sh` remains a thin wrapper. It detects whether the app was running, forwards supported build flags, exports Electron cache defaults, and invokes:

```sh
bun scripts/build.ts install
```

The timing logic belongs in `scripts/build.ts` because that file owns the expensive steps:

- dependency install decision and execution
- web build
- server build
- Electron packaging
- app closing and replacement
- codesigning
- release cleanup

Add two small helpers:

- `formatDuration(ms: number): string` formats elapsed time.
- `timeStep<T>(label: string, action: () => T | Promise<T>): Promise<T>` measures a step, prints its elapsed time in `finally`, and returns or rethrows the original result.

This keeps timing as a cross-cutting wrapper around existing imperative build steps, without introducing a profiling subsystem.

## Timing Output

Default output should include one line per major step:

```text
[timing] prepare output: 4ms
[timing] bun install check: 2ms
[timing] bun install: skipped in 1ms
[timing] node-pty helper check: 3ms
[timing] typecheck: skipped in 1ms
[timing] build:web: 2.41s
[timing] build:server: 184ms
[timing] artifact check: 1ms
[timing] electron-builder: 8.73s
[timing] close running app: 503ms
[timing] install app: 327ms
[timing] codesign: 1.86s
[timing] cleanup release: 6ms
[timing] total: 14.21s
```

Formatting:

- Durations under 1000ms render as integer milliseconds.
- Durations at or above 1000ms render as seconds with two decimal places.
- Skipped stages still print timing with the form `skipped in <duration>`.
- Total timing prints after the main script body completes or fails.

## Stage Boundaries

Instrument these stages:

- `prepare output`: remove `release`; remove `dist` only for `--clean`.
- `bun install check`: decide whether dependencies are current.
- `bun install`: run `bun install` or print a skipped timing.
- `node-pty helper check`: validate and chmod the macOS helper.
- `typecheck`: run typecheck or print a skipped timing.
- `build:web`: run `bun run build:web`.
- `build:server`: run `bun run build:server`.
- `artifact check`: verify required web and server artifacts.
- `electron-builder`: run `bun run build:electron -- ...`.
- `close running app`: install mode only.
- `install app`: install mode only; create `~/Applications`, replace the app bundle, and rename the built app.
- `codesign`: install mode only.
- `cleanup release`: install mode only.
- `total`: entire script execution.

## Error Handling

Timing must not change failure semantics.

If a stage fails, `timeStep` prints that stage's elapsed time from `finally` and then lets the original exception continue. The script should keep the existing non-zero exit behavior from Bun shell commands and explicit `process.exit(1)` paths.

Existing user-facing error messages remain unchanged.

## Tests

Update `src/system/build-script.test.ts` with static assertions that:

- the build script defines a duration formatter and step timer;
- `bun install`, `build:web`, `build:server`, `build:electron`, and `codesign` are wrapped in timing calls;
- skipped `bun install` and skipped typecheck paths print timing output;
- install-only steps such as app closing, app replacement, signing, and release cleanup are timed.

Do not add an automated real install test. `./install.sh` can close and replace `~/Applications/Hobgoblin.app`, so that verification requires explicit manual approval.

Verification after implementation:

```sh
bun run typecheck
bun run test
```

If a full install verification is needed, request explicit approval before running:

```sh
./install.sh
```

## Principle Check

- KISS: the design adds a small timer wrapper instead of a profiling framework.
- YAGNI: no persistent logs, new flags, or cache changes are introduced.
- DRY: all measured steps use the same helper and output style.
- SOLID: timing is isolated from the existing build responsibilities.
