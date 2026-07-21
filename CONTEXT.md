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

**Canonical terminal geometry**:
The server-owned PTY column and row count published by the current controller attachment.
_Avoid_: Viewer size, shared viewport size

**Local terminal geometry**:
The renderer-local xterm column and row count fitted to one client's visible host. It is never synchronized or persisted; only a controller may publish it as new canonical terminal geometry.
_Avoid_: Canonical size, remote size

**External terminal**:
An operating-system terminal application opened outside Hobgoblin at the selected worktree path.
_Avoid_: Native terminal, system terminal

**Settings dialog**:
The modal surface for changing application preferences while keeping the current workspace visible underneath.
_Avoid_: Settings screen, full-page settings

**AI handoff command**:
A provider-specific CLI command placed into an internal terminal for review, without being executed, so the user can start an AI task in the selected worktree context.
_Avoid_: AI command, automatic AI action

**Worktree bootstrap**:
A repository-configured process that prepares a newly created worktree from its source worktree before normal development begins.
_Avoid_: Worktree setup script, post-create hook

**Worktree bootstrap candidate**:
An immediate child file or directory of a repository root that Git does not track, including ignored and ordinary untracked entries. A wholly untracked directory is one candidate, and `.git` is never a candidate.
_Avoid_: Bootstrap file, untracked path

**Repository dependency candidate**:
An existing immediate child file or directory of a repository root that Git currently ignores. It may be selected for one newly materialized branch-workspace repository member, while a repository-owned `goblin.toml` takes precedence over manual dependency selection.
_Avoid_: `.gitignore` rule, workspace auxiliary entry, generic untracked file

**Selected branch context**:
The branch whose explorer and detail surfaces the user is currently viewing. Changing this context is navigation; it is distinct from checking out a Git branch and from targeting a branch action.
_Avoid_: Active branch, current branch

**Branch action target**:
The branch or worktree explicitly targeted by an action. It may differ from the selected branch context, and targeting it does not imply navigating to it unless the action opens branch-specific application content.
_Avoid_: Active branch, implicitly selected branch

**Project list**:
The inline list of open projects shown beneath the sidebar project switcher.
_Avoid_: Repo dropdown, project expanded list

**Project**:
A top-level working context in the project list. A project is either one Git repository, one plain workspace, or one multi-repository workspace.
_Avoid_: Using project as a synonym for every repository inside a multi-repository workspace

**Repository**:
One Git operation boundary. Branches, worktrees, status, history, and Git writes always belong to exactly one repository, even when several repositories share a project.
_Avoid_: Workspace repository, subproject

**Multi-repository workspace**:
A project rooted at a readable non-Git directory, either local or reached through one SSH target, whose immediate child entries are directories or directory symlinks resolving to Git repository primary worktree top levels. Linked worktrees are not repository candidates. A symlink keeps its immediate-child name and logical path as the workspace member identity. The root provides project-level files and terminals; its repositories remain independent Git operation boundaries. Every repository in an SSH multi-repository workspace uses the same SSH target as the workspace root.
_Avoid_: Monorepo, repository group, nested repository

**Configured workspace**:
A multi-repository workspace whose durable, ordered repository membership has been explicitly selected. Membership is stored in Hobgoblin application data; `goblin.toml` remains repository-owned worktree bootstrap configuration. Filesystem discovery supplies candidates but does not silently change a configured workspace, and a repository referenced by any branch workspace cannot be removed from configuration until those references are removed. Repository order controls workspace navigation order and sequential branch workspace member-operation order.
_Avoid_: Saved scan, repository registry, primary repository

**Branch workspace**:
A branch-specific, indivisible working context owned by one configured workspace and presented by its common branch name. Within that parent, a branch name identifies at most one branch workspace; every workspace-level action targets its root directory on the same local or SSH host as the parent, while contained repository worktrees are members rather than nested workspace contexts. Membership may be extended but not reduced or rematerialized as a configuration change, and removal always targets the whole branch workspace. When active, it exposes folder-level file browsing and internal terminals while the parent workspace retains separate repository navigation. Its managed directory remains visible and browsable in the parent file tree but cannot be renamed, moved, or deleted there; inside it, managed member and auxiliary roots receive the same protection while their contents remain operable. Its durable membership and materialization intent remain meaningful when files or worktrees are unavailable, a branch workspace operation is incomplete, or external filesystem changes cause drift. Drift is surfaced for explicit repair or removal rather than silently recreating or forgetting the branch workspace; completed members are retained without automatic rollback, and retries continue the remaining work.
_Avoid_: Project, workspace repository, generic subworkspace

**Workspace worktree**:
A set of same-named linked worktrees belonging to one branch workspace. The configured repository list is the candidate pool; each branch workspace chooses its own members, every member remains an independent Git operation boundary, and newly created target branches may use different base branches per repository. Member provenance distinguishes target branches created for the branch workspace from branches that already existed. A same-named worktree already checked out elsewhere remains repository-only and is never moved or claimed automatically.
_Avoid_: Shared worktree, combined worktree

**Workspace overview**:
The parent-level workspace view that lists its branch workspaces in the same contextual list position used for repository worktrees, while retaining the workspace root's file and terminal context. Selecting it does not select a branch workspace.
_Avoid_: All branch workspace, workspace repository

**Branch workspace item**:
The non-expandable workspace overview representation of one branch workspace, labelled by the common branch name rather than its directory name. Items have a durable manual order within the parent workspace; new items append without repair or extension changing existing order. Activating an item opens that working context inside the parent project rather than creating another project; its editor and external-terminal actions open the branch workspace root, while its internal-terminal action restores the last root-scoped session or creates one when none exists. Ready items expose all folder actions; creation-incomplete or drifted items remain inspectable and repairable, active operations expose only cancellation, and removal-incomplete items cannot be reopened. Its badges represent only internal terminal sessions scoped to that root directory.
_Avoid_: Project item, repository row, worktree row

**Workspace auxiliary entry**:
A selected non-repository direct child of the workspace root that is materialized under a branch workspace with the same name, independently as either a symbolic link or a copy. A symbolic link continues to reference the root entry; a copy is a one-time independent snapshot, dereferencing a symbolic-link source when necessary, and never synchronizes or merges back. A missing copy may be explicitly repaired from the source's current content as a new snapshot but an existing copy is never overwritten. Copying content whose resolved source lies outside the workspace boundary requires separate approval. Configured repositories and all their worktrees, branch workspace directories, and application temporary entries are not eligible.
_Avoid_: Workspace member, shared file, bootstrap file

**Repository-only worktree**:
A linked branch worktree that is not a member of a workspace worktree. It is changed only through that repository's ordinary worktree actions.
_Avoid_: Orphan worktree, detached worktree

**Branch workspace operation**:
A server-coordinated creation, extension, repair, or removal of one branch workspace. Member work is applied sequentially with per-member results and no automatic rollback, but this cross-repository orchestration is not exposed as a separate batch concept.
When removal includes local branch cleanup, that cleanup applies only to branches created for the branch workspace and is explicitly forceful, so it may discard their unpushed commits; pre-existing branches are retained. Dirty worktrees may be removed only when the removal request explicitly enables force removal, which discards their uncommitted changes; locked and primary worktrees remain removal safety boundaries. Modified copied auxiliary entries, unregistered contents, and internal terminals running anywhere under the branch workspace require separate destructive approval; approved terminals are closed before file removal, while symbolic-link removal never removes its target.
_Avoid_: Workspace batch operation, workspace transaction, multi-repository Git command

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
