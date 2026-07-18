# Hobgoblin — Codebase Context

## What this is

Hobgoblin is a high-productivity workspace for Git worktree-based development with AI CLI tools. It ships as a packaged Electron desktop app and as a server mode accessible from a web browser.

Core model: **multi-project × multi-worktree/branch × multi-terminal**. Users open several repositories, isolate parallel branches in separate worktrees, and attach server-backed terminals to the right branch context — keeping Git state and AI CLI sessions (Claude Code, Codex, etc.) together.

## Language

**Terminal topbar**:
The top row of the terminal area, containing terminal tabs and terminal-level actions.
_Avoid_: Terminal toolbar, detail toolbar

**Internal terminal**:
A Hobgoblin-managed terminal session rendered inside the selected worktree's terminal area.
_Avoid_: New terminal, embedded terminal

**External terminal**:
An operating-system terminal application opened outside Hobgoblin at the selected worktree path.
_Avoid_: Native terminal, system terminal

**Project list**:
The inline list of open projects shown beneath the sidebar project switcher.
_Avoid_: Repo dropdown, project expanded list

**Plain workspace**:
A readable directory opened as a workspace without requiring Git metadata.
_Avoid_: Non-Git repository

**Web access protection**:
The optional server-owned authentication gate for browser clients. When enabled, browser access requires configured web credentials while the Electron client continues to use its private internal capability.
_Avoid_: Security mode, LAN password

## Stack

| Layer         | Technology                                                         |
| ------------- | ------------------------------------------------------------------ |
| Desktop shell | Electron 42                                                        |
| Server        | Hono on `@hono/node-server`                                        |
| Frontend      | React 19, TanStack Router, TanStack Query, Zustand, Tailwind CSS 4 |
| Terminal      | xterm.js + node-pty (worker process)                               |
| Runtime       | Bun 1.3 / Node.js 24                                               |
| Language      | TypeScript 6 (Node.js strip-only — no `tsc` emit)                  |
| Build         | Vite (web), Bun build (server), electron-builder (packaging)       |
| Test          | Vitest                                                             |

## Source layout

```
src/
  main/        Electron main process — window shell, native menus, IPC, clipboard
  preload/     Electron preload scripts
  server/      Hono HTTP + WebSocket server — settings, repos, terminal, realtime
    routes/    Boundary layer (thin: parse input, delegate)
    modules/   Feature read/write/source modules
    terminal/  Terminal session management and PTY worker coordination
    common/    Auth middleware, data directory, network helpers
    entrypoints/ Server and terminal-worker entry points
  shared/      Types and utilities shared across all process boundaries
  system/      Pure system integrations — git commands, SSH, file tree, editors
  web/         React renderer — UI, stores, queries, clients
    components/  Feature UI components
    stores/      Zustand stores (repos, theme, i18n, session restore)
    hooks/       App-level React hooks
    lib/         Small UI utilities
```

## Architecture boundaries

Enforced by `bun run check:architecture`:

- `src/main/**` must not import `src/web/**` or `src/server/**`
- `src/web/**` must not import `src/main/**`
- `src/server/**` and `src/shared/**` must not import `electron`

## Key commands

```sh
bun run dev               # start Electron dev app
./serve.sh                # build web + start server mode (browser: http://127.0.0.1:32200)
bun run typecheck         # type-check all processes
bun run test              # run Vitest suite
bun run test:watch        # watch mode
bun run check:architecture # enforce import boundary rules
bun run format            # Prettier
bun run install:app       # build + install Hobgoblin.app to ~/Applications
```

## Process model

Three OS processes in desktop mode:

1. **Electron main** (`src/main/`) — window lifecycle, native menus, IPC bridge, clipboard, shell helpers
2. **Server** (`src/server/`) — owns settings, repo state, terminal sessions, realtime WebSocket; runs in a worker thread or standalone Node process
3. **Renderer** (`src/web/`) — React SPA; treated as a browser client against the server API

The renderer is a browser client, not a privileged process. Business logic lives in `src/server/` or `src/shared/`. The renderer reads through query snapshots and projects runtime-coherent state locally.

## State model

Three classes — pick the right one before deciding ownership:

| Class                | Description                                                                 | Examples                                                       |
| -------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **Local**            | Short-lived interaction state, never synced                                 | dialog inputs, hover state, `branchSearchQueries`              |
| **Runtime-coherent** | Must converge across windows during this run; server is the source of truth | settings snapshots, repo/branch/status data, terminal sessions |
| **Restorable**       | Survives relaunch but needs no live sync                                    | workspace layout, active repo set, `restorableRepoCache`       |

## Feature layering

Each feature is a vertical slice that may span `src/server/`, `src/web/`, and `src/shared/`. Within a feature, use only the layers you need:

| Layer          | Role                                                                       | Typical file                 |
| -------------- | -------------------------------------------------------------------------- | ---------------------------- |
| Boundary       | Parse transport input, delegate                                            | `routes/*.ts`, `*-client.ts` |
| Read           | Query snapshots, hooks, query keys                                         | `*-queries.ts`, `*-read.ts`  |
| Write          | Mutation orchestration, invalidation, cache updates                        | `*-write-paths.ts`           |
| Source         | Persistence, authoritative system calls                                    | `*-source.ts`                |
| Runtime facade | Stable combined read+write API for the UI — **only when both are present** | `runtime-*.ts`               |

Name files `<feature>-<layer>.ts`. Avoid generic `service`, `controller`, or `manager` names.

## Realtime

- Prefer WebSocket invalidation + targeted refetch for cross-window data.
- Use streaming only for continuous UX-critical flows (terminal output).
- Document whether a new realtime path is invalidation or streaming.

## TypeScript constraints (Node.js strip-only mode)

Do not use:

- Enum declarations
- Namespaces with runtime code
- Parameter properties (`constructor(private readonly x: T)`)
- Import aliases (`import A = B`)

## Import style

Use repo-alias imports with explicit extensions:

```ts
import { foo } from '#/shared/foo.ts'
import { bar } from '#/web/bar.ts'
```

## Design docs

Full design guidance lives in `docs/`:

- [`docs/arch.md`](docs/arch.md) — app shell and process ownership
- [`docs/layering.md`](docs/layering.md) — feature layering rules
- [`docs/state-sync.md`](docs/state-sync.md) — state classification and sync model
- [`docs/renderer-model.md`](docs/renderer-model.md) — server-first renderer model
- [`docs/realtime.md`](docs/realtime.md) — realtime transport rules
- [`docs/ui-conventions.md`](docs/ui-conventions.md) — UI language and copy rules

Agent workflow guidance lives in [`AGENTS.md`](AGENTS.md).
