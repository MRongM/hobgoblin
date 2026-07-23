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

**Terminal focus mode**:
A temporary desktop presentation that maximizes the selected internal terminal by hiding the workspace navigation and file surfaces until the user exits focus. It is distinct from compact focus surfaces and from maximizing an arbitrary detail surface.
_Avoid_: Detail focus mode, workspace focus mode

**Selected internal terminal**:
The specific internal terminal session selected within one branch or worktree terminal area. It is distinct from the selected branch context and from the attachment that currently controls terminal input; a terminal deep link targets this session when it still exists and restores an encoded branch workspace member context when that relationship remains valid.
_Avoid_: Current terminal, active terminal

**Unread terminal bell**:
An attention state attached to one internal terminal after it emits a bell while it is not the visible focused terminal. Selecting that terminal clears the state. It is distinct from any external notification delivery, which may fail without clearing or changing the unread state.
_Avoid_: Telegram message, system notification, terminal output activity

**Terminal bell notification delivery**:
A best-effort external attention delivery caused by an eligible unread terminal bell. One delivery may use the system notification channel and, when configured, an additional Telegram channel; delivery failure does not change unread terminal bell state.
_Avoid_: Unread state, queued notification, terminal bell event

**Terminal output excerpt**:
An optional, ephemeral Telegram-only excerpt from the same internal terminal at the time of an eligible notification. Consecutive spaces, tabs, and line breaks are collapsed to one space before its characters are counted. Its configured maximum is 1–4096 sanitized visible characters, defaults to 400, may be shortened to keep the complete Telegram message within 4096 characters, is disabled by default, is never persisted, and may still contain sensitive shell content when explicitly enabled.
_Avoid_: Terminal transcript, command result, durable output history

**Terminal output activity**:
A renderer-observed state attached to one internal terminal after its output has remained active long enough to exclude brief bursts and input echo. It becomes idle after the same quiet interval used by terminal-count activity indicators. It describes sustained output rather than a process lifecycle.
_Avoid_: Running process, command execution state, terminal busy state

**Terminal output completion notification delivery**:
A best-effort Telegram delivery caused when an observed terminal output activity period becomes idle. It is independent of terminal visibility and focus, and one observed activity period produces at most one delivery across clients. A quiet interval may therefore complete one activity period even when the underlying command has not exited.
_Avoid_: Process exit notification, command completion proof, unread terminal bell

**Tmux session descriptor**:
The normalized project root path, terminal working-directory path, and positive terminal slot number that together identify one tmux-backed internal terminal independently of whether Hobgoblin or an external terminal application creates it first. It excludes transport endpoint, display, branch, and ephemeral PTY identity, preserves logical path identity without resolving symbolic links, and is the public input for deterministic tmux session naming.
_Avoid_: Terminal session ID, tmux connection settings, SSH terminal identity

**Tmux session name**:
The deterministic `hobgoblin-v1-<digest>` identifier derived from a tmux session descriptor and used by internal and external terminal applications to create or attach to the same tmux session. It is distinct from a `terminal-N` slot, a server terminal key, and an ephemeral `term_<UUID>` PTY session ID.
_Avoid_: Terminal session ID, terminal ID, PTY session ID

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

**Repository dependency replacement**:
A repair-time deletion and rematerialization of an existing repository dependency target, limited to the exact paths in an explicitly approved branch workspace plan.
_Avoid_: Overwrite, directory merge, automatic conflict resolution

**Selected branch context**:
The branch whose explorer and detail surfaces the user is currently viewing. Changing this context is navigation; it is distinct from checking out a Git branch and from targeting a branch action.
_Avoid_: Active branch, current branch

**File area**:
The explorer surface for the selected project or branch context. In a repository worktree context, it contains the file area tab bar and the selected explorer panel; in a plain workspace, it contains the file browser without repository explorer tabs. It is distinct from the navigation area and the detail pane.
_Avoid_: Detail area, file tab area

**File area tab bar**:
The top row of the repository file area, containing the Status, Files, Changes, History, Local, Remote Branches, and optional Ports explorer tabs together with their overflow control.
_Avoid_: Detail tabs, file tabs

**Detached file area window**:
A temporary auxiliary window that shows a live copy of one file area tab while keeping the source tab in its captured repository and branch or worktree context. Electron uses a native application window; Web uses a same-origin browser window.
_Avoid_: File area focus mode, moved file tab, generic secondary window

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
A branch-specific, indivisible working context owned by one configured workspace and presented by its common branch name. Within that parent, a branch name identifies at most one branch workspace; every workspace-level action targets its root directory on the same local or SSH host as the parent, while contained repository worktrees are members rather than nested workspace contexts. Membership may be extended or reduced only through parent-scoped lifecycle actions. A reduction must retain at least one member, removes only the selected managed worktrees and membership records, and retains their local and remote branches; deleting the final member instead requires whole branch workspace removal. When active, its root context exposes folder-level file browsing and internal terminals, and selecting one member worktree exposes that repository's ordinary worktree experience without leaving the branch workspace; the parent workspace retains separate repository navigation. Its managed directory remains visible and browsable in the parent file tree but cannot be renamed, moved, or deleted there; inside it, member worktree roots receive the same protection while their contents remain operable. Its durable membership and materialization intent remain meaningful when root or member worktrees are unavailable, a branch workspace operation is incomplete, or external filesystem changes cause member drift. Member drift is surfaced for explicit repair or removal rather than silently recreating or forgetting the branch workspace; completed members are retained without automatic rollback, and retries continue the remaining work.
_Avoid_: Project, workspace repository, generic subworkspace

**Workspace worktree**:
A set of same-named linked worktrees belonging to one branch workspace. The configured repository list is the candidate pool; each branch workspace chooses its own members, every member remains an independent Git operation boundary, and newly created target branches may use different base branches per repository. Member provenance distinguishes target branches created for the branch workspace from branches that already existed. A same-named worktree already checked out elsewhere remains repository-only and is never moved or claimed automatically.
_Avoid_: Shared worktree, combined worktree

**Branch workspace member worktree**:
The linked worktree contributed by one repository member to a branch workspace while remaining that repository's independent Git operation boundary.
_Avoid_: Subrepository, child repository worktree, nested workspace

**Branch workspace base branch**:
The repository-specific destination branch that one branch workspace member is intended to merge back into. Different members may have different base branches, and the destination remains fixed rather than being inferred from the repository's current default or selected branch.
_Avoid_: Source branch, current branch, default branch

**Workspace overview**:
The parent-level workspace view that lists its branch workspaces in the same contextual list position used for repository worktrees, while retaining the workspace root's file and terminal context. Selecting it does not select a branch workspace.
_Avoid_: All branch workspace, workspace repository

**Branch workspace item**:
The workspace overview representation of one branch workspace, labelled by the common branch name rather than its directory name and identified with the branch-workspace icon. Its expanded repository members use the ordinary worktree icon. Items have a durable manual order within the parent workspace; new items append without repair, extension, or reduction changing existing order. Single-clicking the main item selects its root context without changing member-summary expansion; when a member is selected, that selection first returns to the root context. Double-clicking the main item selects the root through the normal click sequence and toggles its member summaries, while the separate Chevron toggles those summaries without changing selection. A separate control reorders the item. Its editor and external-terminal actions open the branch workspace root, while its internal-terminal action restores the last root-scoped session or creates one when none exists. The item menu owns whole-branch-workspace batch Git actions and membership changes, which open inline beneath that item without narrowing to a selected member. Ready items expose all folder and membership actions; creation-incomplete or drifted items remain inspectable and repairable, active operations expose only cancellation, and deletion- or reduction-incomplete items expose their corresponding continuation path. Its item-level badges represent internal terminal sessions scoped to that root directory and the summed Git change count of its repository member worktrees.
_Avoid_: Project item, repository row, worktree row

**Branch workspace member summary**:
The inline representation of one repository member under an expanded branch workspace item, showing its repository identity, target-worktree dirtiness, and internal-terminal activity without a commit hash or Git tag; selecting it keeps the branch workspace active while opening that member worktree's files, Git surfaces, and terminals. It exposes the ordinary worktree's editor, terminal, remote, and repository-scoped Git actions while omitting reordering, checkout, worktree creation or refresh, and individual worktree or branch removal because those operations would escape or violate the owning branch workspace lifecycle.
_Avoid_: Subrepository, child repository, nested project, branch workspace item

**Workspace auxiliary entry**:
A selected non-repository direct child of the workspace root that is materialized once under a branch workspace with the same name, independently as either a symbolic link or a copy. After successful materialization it becomes ordinary branch workspace content: it may be edited, renamed, moved, or deleted, its absence does not create drift, and branch workspace repair does not recreate it. A symbolic link continues to reference the root entry while it exists; a copy is an independent snapshot that dereferences a symbolic-link source when necessary and never synchronizes or merges back. Copying content whose resolved source lies outside the workspace boundary requires separate approval. Configured repositories and all their worktrees, branch workspace directories, and application temporary entries are not eligible.
In user-facing language, these entries are grouped as **Branch workspace dependencies**.
_Avoid_: Workspace member, shared file, bootstrap file, repository dependency candidate

**Repository-only worktree**:
A linked branch worktree that is not a member of a workspace worktree. It is changed only through that repository's ordinary worktree actions.
_Avoid_: Orphan worktree, detached worktree

**Branch workspace operation**:
A server-coordinated creation, extension, reduction, repair, or removal of one branch workspace. Member work is applied sequentially with per-member results and no automatic rollback, but this cross-repository orchestration is not exposed as a separate batch concept.
During reduction, selected dirty member worktrees require explicit approval before force removal, and internal terminals scoped below those member paths require separate close approval. Unselected member worktrees and auxiliary contents are verified but never modified.
When removal includes local branch cleanup, that cleanup applies only to branches created for the branch workspace and is explicitly forceful, so it may discard their unpushed commits; pre-existing branches are retained. Removing a branch workspace always force-removes its managed worktrees and may discard their uncommitted changes without a separate dirty-worktree preflight, while locked and primary worktrees remain removal safety boundaries. Modified copied auxiliary entries, unregistered contents, and internal terminals running anywhere under the branch workspace require separate destructive approval; approved terminals are closed before file removal, while symbolic-link removal never removes its target.
_Avoid_: Workspace batch operation, workspace transaction, multi-repository Git command

**Branch workspace registry cleanup**:
An explicit recovery action for an unreadable branch workspace registry. It removes only invalid application records when they can be isolated, or resets all branch workspace records when the registry cannot be parsed at all. It never removes branch workspace directories, repository worktrees, local branches, or remote branches.
_Avoid_: Delete branch workspace, worktree cleanup, repository cleanup

**Branch workspace batch commit**:
An application-coordinated action that presents every dirty repository member with one editable, repository-specific AI commit message bound to the inspected change set. Before any commit it verifies that every member still matches that change set; after one explicit confirmation, it creates exactly one commit per dirty member sequentially, stops at the first failure, and never rolls back completed commits.
_Avoid_: AI commit handoff, shared commit message, automatic commit

**Branch workspace batch pull**:
An application-coordinated action that fast-forward pulls every repository member's target branch from its configured upstream sequentially, stops at the first failure, and never rolls back completed pulls.
_Avoid_: Workspace pull-all, base-branch pull, atomic batch pull

**Branch workspace batch push**:
An application-coordinated action that pushes every repository member's target branch to its resolved push target sequentially, stops at the first failure, and never rolls back completed pushes.
_Avoid_: Merge-back push, base-branch push, atomic batch push

**Branch workspace merge-back**:
An application-coordinated action that integrates each repository member's target branch into its fixed branch workspace base branch, either locally or through a pipeline that pulls the base branch, merges the target branch in the base worktree, and pushes the base branch. Member pipelines run sequentially, stop at the first failed step, and never roll back completed Git or remote writes.
_Avoid_: Source-branch merge, current-branch merge, atomic batch merge

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
