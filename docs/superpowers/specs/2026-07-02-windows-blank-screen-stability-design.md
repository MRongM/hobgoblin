# Windows Blank Screen Stability Design

## Goal

Make the Windows build diagnosable and stable enough for temporary testing. A Windows installer that builds successfully is not sufficient; the packaged app must start, create the embedded server, load the renderer URL, execute the renderer bundle, and surface actionable errors instead of showing a blank window.

## Current Evidence

The GitHub Actions Windows build succeeds with Node.js 24 and Bun 1.3.11, and uploads an `.exe` artifact. The reported runtime symptom is a visible app window with only the top-right window controls and no renderer content. That means `BrowserWindow` creation succeeds, but the renderer does not successfully load or render.

The startup chain is:

1. `src/main/main.ts` waits for Electron readiness, starts the embedded server, initializes settings/theme/menu, then activates the main window.
2. `src/main/server-manager.ts` spawns the embedded server with `process.execPath` and `ELECTRON_RUN_AS_NODE=1`.
3. `src/main/window-shell.ts` builds the renderer URL from the embedded server runtime.
4. `src/main/window.ts` calls `win.loadURL(...)`.
5. `src/server/app-factory.ts` serves `dist/web/index.html`, injects bootstrap data, and serves `boot.js` plus bundled assets.

CI currently validates packaging, typecheck, and artifact upload. It does not validate that the packaged Windows app can start and render.

## Constraints

- Work can mostly be done from macOS by editing code and using GitHub Actions as the Windows execution environment.
- Final proof must run on Windows because Electron packaging, child process behavior, path handling, and NSIS output differ from macOS.
- Keep the fix focused on startup stability and diagnostics.
- Do not change release publishing, signing, or updater behavior.
- Do not add new dependencies unless required.
- Preserve the project architecture boundaries: main owns Electron shell, server owns HTTP/static serving, renderer owns UI.

## Recommended Approach

Use a two-stage fix:

1. Add packaged startup diagnostics and non-blank failure UI.
2. Add a Windows CI smoke test that runs the packaged app enough to prove the renderer entry loads.

After those are in place, use the captured failure point to make the smallest root-cause fix.

This is preferred over changing build flags first because the current build already produces an installer. The missing guarantee is runtime readiness.

## Runtime Diagnostics

Add main-process diagnostics around the startup boundary:

- app path from `app.getAppPath()`
- packaged state from `app.isPackaged`
- process executable path
- embedded server entry path
- embedded server working directory
- selected host and port
- server child process stdout/stderr
- server readiness timeout details
- renderer entry URL
- `did-fail-load`, `render-process-gone`, `console-message`, and loadURL failures

Diagnostics should write to a file under `app.getPath('userData')`, for example `startup.log`. Console logging can remain, but file logging is required because Windows users launching the installed app normally will not see stdout/stderr.

No sensitive token should be logged. The embedded server secret should be redacted.

## User-Visible Failure Mode

The app must not leave a blank window when startup fails after the window exists.

If the renderer URL cannot be created or loaded, or if the renderer process fails during initial load, show a minimal failure page in the window with:

- a concise error title
- the failed phase, such as `embedded-server`, `renderer-url`, `renderer-load`, or `renderer-process`
- the path to the startup log
- a suggestion to send the log when reporting the failure

This can be implemented with `win.loadURL(data:text/html,...)` or `win.loadFile(...)` for a static internal error page. Keep it in main-process code; do not rely on the normal renderer bundle to render the error.

## Windows CI Smoke Test

Extend the temporary Windows test workflow, or add a separate smoke workflow, after building the Windows artifact:

1. Build an unpacked Windows app or use the packaged output before NSIS cleanup if available.
2. Launch the packaged executable with a clean user data dir under the runner temp directory.
3. Wait for the startup log or a readiness marker.
4. Fail if the log reports embedded server startup failure, renderer load failure, or renderer crash.
5. Prefer a deterministic health check if the app logs the embedded server URL.
6. Always upload startup logs as artifacts on failure.

If running the NSIS installer is slower or unreliable in CI, start with the unpacked Electron app smoke test. Installer smoke can be added later.

## Likely Root-Cause Areas

The diagnostics are expected to classify the failure into one of these areas:

- Embedded server entry path does not run correctly from `app.asar` on Windows.
- `ELECTRON_RUN_AS_NODE` cannot execute the TypeScript server entry reliably in the packaged Windows process.
- Static renderer files are not found from the server's `dist/web` resolution.
- Renderer JavaScript crashes before first paint due to a Windows-only runtime assumption.
- The renderer URL is served but blocked or navigated away by trusted URL policy.

If the failure is server entry execution from `app.asar`, the likely fix is to run the built server artifact (`dist/server/main.js`) in packaged mode and keep source TypeScript entry only for dev/source mode. That change should be proven by tests and the Windows smoke run before adoption.

## Test Plan

- Unit test server entry resolution for dev, packaged asar, and packaged unpacked app paths.
- Unit test startup diagnostic redaction so secrets are not written.
- Unit test fallback error page construction where practical.
- Existing checks: `bun run typecheck`, `bun run test`, and `bun run check:architecture`.
- CI verification: Windows test workflow must upload an `.exe` artifact and pass the packaged startup smoke test.

## Success Criteria

- A Windows user no longer sees a silent blank window for startup failures.
- The failure phase and log path are visible.
- GitHub Actions catches packaged Windows startup regressions before artifact delivery.
- The Windows artifact still builds with Node.js 24+ and Bun 1.3.11.
- The final fix is validated on Windows, not only by macOS local tests.

