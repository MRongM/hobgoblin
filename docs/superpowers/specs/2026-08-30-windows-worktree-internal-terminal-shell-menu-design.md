# Windows Worktree Internal Terminal Shell Menu Design

## Goal

On the primary Windows desktop application, let users launch a worktree terminal explicitly with PowerShell or WSL from workspace menus without changing the persisted default internal-terminal shell.

## User Experience

For a native local repository on a Windows host, these three workspace surfaces expose two flat menu actions:

- ordinary worktree rows;
- branch-workspace repository member rows;
- branch-workspace root rows.

Both the row's More menu and its context menu show `PowerShell internal terminal` followed by `WSL internal terminal`. Selecting either action creates a normal, non-tmux internal terminal in that worktree with the requested shell.

The compact terminal quick action remains unchanged and continues to use the persisted global Windows internal-terminal preference. A menu selection is a one-shot launch choice and never writes settings.

Non-Windows hosts retain the existing menus. WSL and SSH repositories also retain their existing menus because their terminal command is already determined by the remote transport; showing a native Windows shell choice there would be misleading.

## Protocol And State Model

Add a narrow shared request type whose only valid values are `powershell` and `wsl`. `TerminalCreateInput` carries this optional intent from the renderer to the server. The protocol boundary accepts the field as unknown and normalizes invalid values to `undefined`.

The renderer terminal registry forwards the optional choice only when a shell-specific menu action supplies it. Existing callers omit it, so the global preference remains authoritative for quick actions, toolbar actions, and ordinary terminal creation.

The terminal catalog passes the normalized choice only into local, commandless terminal creation. Remote, WSL-project, SSH, tmux, and trusted explicit-command paths retain their existing command and argument selection.

`TerminalSessionManager` stores the explicit shell choice on the created session. PTY creation uses the session choice first and otherwise uses the current global preference. A later restart of that session keeps its explicit shell choice; changing the global preference does not reinterpret an explicitly created session.

## Menu Composition

The existing branch action hook gains an opt-in flag used only by ordinary worktree rows and branch-workspace member rows. When enabled it returns two menu-only actions with distinct IDs. The worktree action projection keeps the generic terminal as the quick action, leaves the two explicit actions in the More menu, and projects them for the context menu.

The shared workspace context menu accepts an optional explicit-shell action pair. When supplied, it renders those two entries instead of the generic `Internal terminal` entry. The tmux and restore actions remain separate and unchanged.

The branch-workspace root row builds its explicit actions directly, matching its existing direct construction of root terminal actions.

## Platform Eligibility

The renderer shows explicit shell actions only when both conditions are true:

1. `getInitialBootstrap().hostPlatform === 'win32'`;
2. the repository/root identifier is not a remote repository identifier.

Eligibility is a presentation decision only. The server still validates the optional value and limits it to local terminal creation, so a crafted renderer request cannot select another executable or alter a remote command path.

## Architecture Stress Test

- `docs/arch.md`: the shared protocol contains only a serializable literal choice; server spawning remains under `src/server/**`; no `electron` dependency crosses into shared or server code.
- `docs/layering.md`: reusable terminal intent lives in the shared terminal domain, menu composition stays in web feature components, and PTY policy stays in the server terminal feature.
- `docs/state-sync.md`: this is request intent rather than persistent or runtime-coherent settings state, so it is not added to the settings snapshot or query cache.
- `docs/renderer-model.md`: no durable terminal session truth is invented in React. The server session stores the restart-relevant choice alongside the command and arguments it already owns.
- Security: the renderer can provide only a normalized `powershell` or `wsl` literal. Existing absolute executable resolution and explicit-command precedence remain intact.

The repository-required `.claude/skills/grill-with-docs/SKILL.md` is absent in this checkout, so this section records the equivalent manual review against the canonical application documents.

## Testing

Focused tests prove:

- protocol normalization preserves `powershell` and `wsl` and drops other values;
- the renderer registry forwards an explicit choice and omits it for existing callers;
- the local catalog forwards the choice while remote and explicit-command flows stay unchanged;
- a session uses its explicit choice for create and restart while ordinary sessions continue to follow the global preference;
- action projection and the shared context menu preserve stable ordering and dispatch each explicit action;
- the three workspace surfaces expose the actions only on eligible Windows-local rows;
- non-Windows and remote/WSL repository menus retain the generic internal-terminal action;
- all four locale dictionaries contain the two labels.

Repository verification runs `bun run typecheck`, `bun run check:architecture`, and `bun run test`. Existing platform-specific baseline failures are reported separately from feature regressions.

## Non-Goals

- Changing or removing the persisted global Windows internal-terminal selector.
- Adding Command Prompt or Automatic as one-shot worktree menu actions.
- Choosing a WSL distribution or PowerShell profile.
- Changing the project Git execution environment.
- Adding nested context-menu submenus.
- Modifying the independent `windows/` package.
