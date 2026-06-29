# Web Terminal Focus Hide Topbar Design

**Date:** 2026-06-29
**Status:** Approved design, pending written-spec review

## Overview

When the web UI maximizes the terminal through the existing branch detail focus mode, the global application topbar should be hidden. The terminal's own detail toolbar, terminal tabs, and minimize control must remain visible so the user can exit focus mode.

This behavior is only for the browser web UI. The Electron desktop UI must keep the current topbar behavior unchanged, including when terminal focus mode is active.

## Goals

- Hide the global `Topbar` in web runtime while the active workspace is effectively in focus mode.
- Preserve the terminal detail toolbar, terminal tabs, and existing minimize button.
- Keep Electron desktop behavior unchanged.
- Reuse existing focus-mode state and derived workspace behavior.
- Avoid new persisted settings, server routes, IPC channels, or terminal-session state.

## Non-Goals

- Do not redesign the topbar, terminal toolbar, or terminal tabs.
- Do not change how focus mode is entered or exited.
- Do not hide the topbar on Electron desktop.
- Do not add a user preference for this behavior.
- Do not change window chrome, traffic-light positioning, or title-bar overlay behavior.
- Do not alter non-focus split or collapsed workspace layouts.

## Current Context

`App` renders the global `Topbar` before the active workspace body. `RepoView` already renders the branch detail pane directly under the global topbar when `repoWorkspaceBehavior(...).mode === 'focus'`.

`useMainWindowShellState` already exposes:

- `workspaceLayout`
- `workspaceBehavior`
- `visibleRepoId`

`workspaceBehavior.mode` is the correct effective rendering state. It accounts for `detailCollapsed`, `detailFocusMode`, and layout rules, so consumers do not need to infer focus mode from raw store booleans.

The runtime can be distinguished with the existing renderer bootstrap. `getInitialBootstrap().runtime.kind` is `web` for browser clients and `electron` for desktop clients. The static boot script also sets `html[data-host='web']` or `html[data-host='electron']`, but the React shell should prefer the bootstrap runtime value for conditional rendering.

## Selected Approach

In the main React shell, derive a boolean such as:

```ts
const hideTopbarForFocusedWebTerminal =
  runtime.kind === 'web' && workspaceBehavior.mode === 'focus'
```

When this boolean is true, do not render the global `Topbar`. Continue rendering `<main>` and `RepoView` normally. Because the app shell is a flex column, removing the topbar lets the workspace body naturally occupy the freed height.

This keeps the change at the shell boundary where the topbar is owned. Terminal components remain responsible only for terminal behavior, not global chrome visibility.

## Runtime Behavior

Web runtime:

- Focus mode active: global topbar is hidden.
- Focus mode inactive: global topbar is shown.
- Settings route active: settings screen behavior is unchanged.
- Terminal detail toolbar remains visible in focus mode.
- Existing minimize button exits focus mode and restores the global topbar.

Electron runtime:

- Global topbar remains visible in focus mode and non-focus modes.
- Existing desktop title-bar and drag-region behavior stays unchanged.

Plain or unavailable workspace behavior is unchanged. The selected behavior is driven by existing effective focus mode, and plain workspace terminal panels do not currently use this branch detail focus-mode path.

## Architecture

The implementation belongs in `src/web/App.tsx`, near `MainWindowViewportContent`, because that component owns both the global `Topbar` and the main workspace region.

No changes are needed in:

- `Topbar`
- `BranchDetailToolbar`
- `TerminalSlot`
- terminal session registry or runtime
- main Electron window code
- shared workspace-layout normalization

If a small helper is useful for testability, it can be local to `App.tsx`. Do not add a cross-module abstraction unless the component test becomes unclear.

## Data Flow

1. `useMainWindowShellState` derives `workspaceBehavior` from the repo store.
2. `MainWindowViewportContent` reads the renderer runtime once from existing bootstrap data.
3. The shell checks whether the runtime is web and the effective workspace mode is focus.
4. The shell omits global `Topbar` only for that case.
5. `RepoView` continues rendering the focused branch detail pane.
6. `BranchDetailToolbar` continues providing the existing minimize control.

No new data is persisted.

## Error Handling

There is no new async path or failure state. If bootstrap is unavailable in tests or early runtime, the existing bootstrap fallback reports a web runtime. Tests should install explicit bootstrap state where desktop behavior matters.

If focus mode is restored from a previous session in web runtime, the topbar should start hidden immediately after the shell renders. Exiting focus mode restores it through the existing store update.

## Testing

Add focused tests around shell rendering:

- Web runtime plus effective focus mode does not render the global topbar.
- Electron runtime plus effective focus mode still renders the global topbar.
- Web runtime plus non-focus mode still renders the global topbar.
- Existing terminal toolbar focus/minimize tests remain valid.

Use the narrow affected tests first, then run:

```bash
bun run typecheck
bun run test
```

## Risks

The main risk is accidentally applying the change to Electron, where hidden topbar would affect desktop drag regions and app controls. The runtime-kind guard must be explicit and covered by a test.

The second risk is hiding the wrong toolbar. The global `Topbar` may be omitted, but the branch detail toolbar must remain rendered because it contains terminal tabs and the exit-focus control.

## Acceptance Criteria

- In browser web UI, terminal focus mode uses the full page height without the global topbar.
- In browser web UI, the terminal toolbar and minimize control remain visible while maximized.
- Exiting focus mode restores the global topbar.
- Electron desktop keeps the global topbar visible in focus mode.
- Typecheck and tests pass.
