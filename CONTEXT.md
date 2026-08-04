# Hobgoblin — Codebase Context

## What this is

Hobgoblin is a high-productivity workspace for Git worktree-based development with AI CLI tools. It ships as a packaged Electron desktop app and as a server mode accessible from a web browser.

Core model: **multi-project × multi-worktree/branch × multi-terminal**. Users open several repositories, isolate parallel branches in separate worktrees, and attach server-backed terminals to the right branch context — keeping Git state and AI CLI sessions (Claude Code, Codex, etc.) together.

## Language

**Android terminals tab**:
The Android main-navigation destination that lists every retained Host temporary terminal and Project terminal in stable creation order so an existing session can be reopened quickly. Its item backgrounds distinguish running (green), disconnected (yellow), exited/failed (red), and starting (neutral) states. It is distinct from the terminal tabs inside the desktop/web terminal topbar, does not create or manually reorder sessions, and may explicitly close or delete one retained terminal after confirmation.
_Avoid_: Terminal manager, terminal creator, internal terminal tab

**Android retained terminal close**:
An explicit, confirmed Android terminal action that stops its active Android controller while retaining the device-local session record and list item for later reconnection. The Terminals-tab item offers it only while the retained session is starting or running, in the same action position later occupied by reconnect. For a tmux-backed terminal it detaches the Android client without ending the remote tmux session. It is distinct from terminal backgrounding, retained terminal deletion, associated tmux session cleanup, or deleting a Host or Project.
_Avoid_: Terminal backgrounding, terminal deletion, tmux session cleanup

**Android retained terminal delete**:
An explicit, confirmed Android terminal-list action that stops an active Android controller and removes its retained device-local session record and list item. A Terminals-tab delete never ends a remote tmux session; the Project terminal list may separately offer its existing opt-in exact tmux-session cleanup during deletion.
_Avoid_: Terminal close, terminal backgrounding, automatic tmux cleanup

**Android retained terminal reconnect**:
A direct Android terminal-item action that restarts an inactive retained terminal in place while preserving its session identity, list position, and terminal slot. The Terminals-tab item offers it only when the session is exited, failed, or disconnected, in the same action position otherwise occupied by close, and reattaches an eligible tmux-backed terminal to its exact retained tmux identity.
_Avoid_: New terminal, open terminal, automatic retry

**Android terminal background navigation**:
A non-destructive navigation from an Android terminal screen to the Android terminals tab that leaves its retained session running or reconnectable. A rightward terminal-page swipe uses this path even for a Host temporary terminal, while the existing Back path retains its own destination-specific behavior.
_Avoid_: Application backgrounding, terminal close, terminal disconnect

**Android manual item order**:
The restorable, device-local order chosen by dragging Android Host, Project, or Project Worktree items from their dedicated drag handles. Host and Project orders are global to their respective lists; Worktree order is scoped to one Project. The Android Terminals tab instead uses stable creation order. Manual order changes only Android presentation, never Git worktree enumeration or remote repository state, and newly discovered items append after retained ordered items.
_Avoid_: Git worktree order, remote sort order, synchronized order

**Android terminal focus mode**:
A temporary Android presentation that gives the selected retained terminal session the full terminal surface by hiding the terminal top bar and command deck until the user exits focus. It is device-local, never persisted, exits before Back navigates away, and is distinct from desktop Terminal focus mode.
_Avoid_: Terminal maximization, fullscreen terminal, persisted terminal layout

**Android application language**:
The locale Android selects for Hobgoblin's native Android-owned interface text and foreground-terminal notifications. It follows the device language by default, may be overridden from Hobgoblin's Android Settings or Android's per-app language settings, remains device-local, and never translates terminal output, repository data, paths, host names, or raw Git and SSH diagnostics.
_Avoid_: Server language, terminal locale, translated terminal output

**Android application theme**:
The device-local combination of an Android appearance preference (follow system, light, or dark) and one Hobgoblin color preset used by Android-owned application surfaces. It persists across relaunches and remains independent from Web/Desktop settings and the Android terminal appearance.
_Avoid_: Web theme, terminal appearance, synchronized theme

**Android tmux tab**:
The Android main-navigation destination where the user explicitly selects one saved SSH Host and scans that host's default and project-scoped tmux servers for current-protocol Hobgoblin sessions together with default tmux sessions. Its catalog is derived from live server sockets and session metadata rather than saved Projects or workspace configuration; leaving the destination clears the selected Host, while returning from an opened terminal preserves the current visit.
_Avoid_: Host-detail tmux tab, Android workspace catalog, remembered Host selection, tmux session creator

**Default tmux session**:
An ordinary user-created tmux session found on the selected local or SSH host's default tmux server that does not carry a valid current-protocol Hobgoblin tmux identity. It keeps its own opaque tmux session name, may appear in the Android Host catalog or Desktop Host inventory, and is distinct from a Hobgoblin session found on either the default or a project-scoped server.
_Avoid_: Legacy Hobgoblin tmux session, project-scoped tmux session, native shell

**Android tmux directory project import**:
An explicit Android action that takes one directory from the current tmux scan into the Project setup flow, where it is validated and saved as a device-local Project. It is distinct from tmux discovery, terminal recovery, and automatic or batch project import.
_Avoid_: Automatic project discovery, tmux project synchronization, session import

**Tmux server target**:
The exact default or strictly named project-scoped tmux server on which one discovered session was observed and to which Android must later attach it. It is part of host-level recovery identity because a session name may exist on more than one server and a project-root hash cannot be reversed.
_Avoid_: Project root, socket scan result, tmux session name

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

**In-app notification**:
A transient message shown by Hobgoblin's shared notification surface in the current renderer, with success, info, warning, or error emphasis. It is distinct from system and Telegram notification delivery and is neither persisted nor synchronized across windows.
_Avoid_: App global notification, system notification, desktop notification, Telegram notification

**Shared proxy URL**:
The application-level HTTP, HTTPS, or SOCKS5 proxy endpoint available to features such as Git network operations and Telegram notification delivery. Each feature independently decides whether to use it; no feature owns or enables it for another feature.
_Avoid_: Git proxy URL, Telegram proxy URL, globally enabled proxy

**Telegram notification proxy preference**:
An opt-out preference that allows Telegram notification delivery to use the shared proxy URL independently of the Git network proxy preference. It defaults on to preserve existing delivery behavior; when it is off or no eligible URL is available, Telegram connects directly.
_Avoid_: Telegram proxy configuration, global proxy switch, Git proxy preference

**Terminal screen image**:
An optional, ephemeral Telegram-only JPEG rendering of the server-owned headless terminal's active viewport for an eligible unread bell or terminal output completion notification. It is a bounded visual projection of terminal screen text rather than a screenshot of the Hobgoblin application window, uses reduced image quality and dimensions for delivery, is enabled by the explicit terminal-screen-image inclusion preference, stays in memory only, and is discarded after the delivery attempt. Telegram never appends terminal output characters to notification text; if the image cannot be produced, delivery falls back to metadata only.
_Avoid_: Application screenshot, terminal transcript, terminal output excerpt, persisted screenshot

**Terminal output activity**:
A renderer-observed state attached to one internal terminal after its output has remained active long enough to exclude brief bursts and input echo. It becomes idle after the same quiet interval used by terminal-count activity indicators. It describes sustained output rather than a process lifecycle.
_Avoid_: Running process, command execution state, terminal busy state

**Terminal output completion notification delivery**:
A best-effort Telegram delivery caused when an eligible observed terminal output activity period becomes idle. Eligibility requires the period to meet the configured Telegram completion minimum activity duration; delivery is independent of terminal visibility and focus, and one eligible period produces at most one delivery across clients. A quiet interval may therefore complete one activity period even when the underlying command has not exited.
_Avoid_: Process exit notification, command completion proof, unread terminal bell

**Telegram completion minimum activity duration**:
The minimum observed terminal output activity duration required for a terminal output completion notification delivery. It affects only Telegram completion eligibility, not terminal output activity indicators or unread terminal bell delivery.
_Avoid_: Running-state detection time, process completion delay, breathing-indicator threshold

**Tmux session descriptor**:
The normalized project root path, terminal working-directory path, and positive terminal slot number that together identify one tmux-backed internal terminal independently of whether Hobgoblin or an external terminal application creates it first. It excludes transport endpoint, display, branch, and ephemeral PTY identity, preserves logical path identity without resolving symbolic links, and is the public input for deterministic tmux session naming.
_Avoid_: Terminal session ID, tmux connection settings, SSH terminal identity

**Project-scoped tmux server**:
The deterministic tmux server selected from a tmux session descriptor's normalized project root, shared by that project's root and worktree terminals while remaining isolated from other project roots and the user's default tmux server. The default tmux server is consulted only to retain compatibility with sessions created before project-scoped servers were introduced.
_Avoid_: Tmux session, global tmux server, per-terminal tmux server

**Tmux session name**:
The deterministic `hobgoblin-v1-<digest>` identifier derived from a tmux session descriptor and used by internal and external terminal applications to create or attach to the same tmux session. It is distinct from a `terminal-N` slot, a server terminal key, and an ephemeral `term_<UUID>` PTY session ID.
_Avoid_: Terminal session ID, terminal ID, PTY session ID

**Tmux session identity metadata**:
The session-owned `@hobgoblin_init_path` and `@hobgoblin_terminal_number` tmux user options written when Hobgoblin creates a tmux session. Discovery recognizes the session only when the normalized initial path, positive terminal number, and recomputed deterministic session name all agree for the current project root. Missing or mismatched metadata is never inferred from the name alone.
_Avoid_: Application persistence map, current pane path, name-only ownership

**Discoverable Hobgoblin tmux session**:
A current-protocol tmux session whose fixed initial-path and positive terminal-number metadata reproduce its exact tmux session name and associate it with a recognized project terminal path. It is eligible for Android recovery but is not authenticated by that metadata.
_Avoid_: Any Hobgoblin-prefixed session, arbitrary tmux session, authenticated tmux session

**Host-manageable Hobgoblin tmux session**:
A current-protocol tmux session found in the selected operating-system user's compatibility default server or an exact Hobgoblin project-server namespace, with a current Hobgoblin session name, normalized fixed initial directory, positive terminal number, and valid attached-client count. It is eligible for explicit host-level inspection and close even when no project root can be recovered; this classification does not authenticate project ownership.
_Avoid_: Any tmux session, project-verified session, authenticated tmux session

**Host tmux session inventory**:
An explicit project-menu action that uses the selected project's local or SSH host only as a host locator, enumerates Hobgoblin project-scoped tmux servers plus the default server for that operating-system user, and lists host-manageable Hobgoblin sessions together with safe ordinary default-server sessions. The user may exact-attach one revalidated live row in an external terminal, or select none or several rows and explicitly close only those selections after the server revalidates their kind, name, metadata, and exact server origins.
_Avoid_: Project tmux sessions, background tmux scan, automatic tmux cleanup

**Recovered Android tmux terminal**:
A retained, disconnected Android project-terminal record reconstructed from a discoverable Hobgoblin tmux session while preserving its terminal slot. It attaches only when the user opens or reconnects it.
_Avoid_: Connected terminal, imported shell, automatically attached terminal

**Internal terminal launch mode**:
The per-launch choice between the native login shell and the compatibility-named `tmux-if-available` mode for one new local or SSH internal terminal. Ordinary terminal actions use the native login shell. Explicit tmux actions require tmux and create or attach to the deterministic tmux session; an unavailable or failed tmux command exits with an actionable instruction to choose Native and never starts a native shell implicitly. The choice is not a persisted preference and does not change an existing terminal.
_Avoid_: Tmux setting, terminal preference, external terminal mode

**Canonical terminal geometry**:
The server-owned PTY column and row count published by the current controller attachment.
_Avoid_: Viewer size, shared viewport size

**Local terminal geometry**:
The renderer-local xterm column and row count fitted to one client's visible host. It is never synchronized or persisted; only a controller may publish it as new canonical terminal geometry.
_Avoid_: Canonical size, remote size

**External terminal**:
An operating-system terminal application opened outside Hobgoblin at a selected workspace path, or launched with an attach-only command for one revalidated Host tmux inventory session. Host-inventory attach never creates a replacement session and does not require the session's original directory to still exist.
_Avoid_: Native terminal, system terminal

**Associated Hobgoblin tmux session**:
A tmux session whose `@hobgoblin_init_path` exactly matches one worktree, branch workspace root, or branch workspace member path after lexical normalization, whose `@hobgoblin_terminal_number` is valid, and whose name equals the v1 hash recomputed from that metadata and the current project root. Association never includes name-only, arbitrary user-created, or descendant-path sessions.
_Avoid_: Current terminal, child-directory session, any tmux session in the directory

**Detached associated Hobgoblin tmux session**:
An associated Hobgoblin tmux session whose tmux `session_attached` client count is exactly zero when explicitly scanned for directory recovery. It may be batch-opened into internal terminals without creating any new tmux session; attached associated sessions are left unchanged.
_Avoid_: Disconnected internal terminal, exited terminal, every associated tmux session

**Directory tmux recovery**:
An explicit item-menu action that scans one worktree, branch workspace root, or branch workspace member path for detached associated Hobgoblin tmux sessions and batch-opens only those existing sessions. An empty scan is a successful no-op and never creates a tmux session.
_Avoid_: Tmux terminal creation, automatic session restore, associated tmux cleanup

**Associated tmux session cleanup**:
An explicit destructive action that discovers associated Hobgoblin tmux sessions for one item, previews the exact matches, and ends only the approved sessions that still satisfy the association at execution time. It is independent of deleting the item and of whether tmux is currently enabled for new terminals.
_Avoid_: Terminal close, worktree cleanup, automatic tmux pruning

**Tmux-backed internal terminal**:
An internal terminal assigned a current-protocol Hobgoblin tmux identity when launched. It remains classified this way if the tmux preference later changes or its tmux session subsequently disappears.
_Avoid_: Tmux status, currently enabled terminal, associated tmux cleanup

**Settings dialog**:
The modal surface for changing application preferences while keeping the current workspace visible underneath.
_Avoid_: Settings screen, full-page settings

**AI handoff command**:
A provider-specific CLI command placed into an internal terminal for review, without being executed, so the user can start an AI task in the targeted directory context. The handoff selects an existing open terminal for that directory or creates one when no open terminal exists before filling the command text.
_Avoid_: AI command, automatic AI action

**Inline AI commit-and-push**:
An explicit, per-open opt-in sequence in one worktree's inline commit form that hides manual message and submit controls, generates a commit message with the selected AI provider, replaces the current draft with that generated message, commits the worktree changes, and then invokes the ordinary branch push action. It stops when generation or commit fails, retains existing protected-branch push approval, and never becomes a saved preference or background automation.
_Avoid_: AI handoff, global automatic commit, branch workspace batch commit

**Branch workspace batch-error AI handoff**:
An AI handoff offered after a branch workspace batch Git action finishes with one or more repository-member failures. It opens the branch workspace root terminal and places one reviewed command that identifies every failed repository, failed step, diagnostic, member worktree, and any retained conflict worktree. It never executes the provider command automatically; cleaned temporary worktrees are reported as diagnostics rather than treated as retained conflict sites.
_Avoid_: Automatic error resolution, per-member AI task, member-terminal handoff

**Worktree bootstrap**:
A user-selected process that copies or symlinks immediate untracked entries from a source worktree into a newly created worktree before normal development begins.
_Avoid_: Worktree setup script, post-create hook

**Worktree bootstrap source**:
The existing repository worktree whose current untracked entries supply one worktree bootstrap decision. It starts with the worktree attached to the selected branch context or base branch, falls back to the repository primary worktree when that source has no candidates or no worktree, may be changed to another existing worktree outside the selected branch, and remains fixed from candidate selection through the corresponding create execution.
_Avoid_: Source branch, repository root, bootstrap template

**Worktree bootstrap candidate**:
An immediate child file or directory of a worktree bootstrap source that Git does not track, including ignored and ordinary untracked entries. A wholly untracked directory is one candidate, and `.git` is never a candidate.
_Avoid_: Bootstrap file, untracked path

**Repository dependency candidate**:
An existing worktree bootstrap candidate that may be selected for one newly materialized branch-workspace repository member.
_Avoid_: `.gitignore` rule, workspace auxiliary entry, generic untracked file

**Selected branch context**:
The branch whose explorer and detail surfaces the user is currently viewing. Changing this context is navigation; it is distinct from checking out a Git branch and from targeting a branch action.
_Avoid_: Active branch, current branch

**Branch creation source**:
The exact local or remote branch ref selected when Hobgoblin creates a local branch. It is immutable creation provenance recorded beside that local branch, may be unknown for branches created outside Hobgoblin or before provenance recording existed, and is distinct from current commit ancestry, upstream tracking, the repository default branch, and a branch workspace creation base.
_Avoid_: Baseline, inferred parent branch, merge destination

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

**Branch merge-in**:
A repository branch action that integrates a user-selected local source branch into the branch action target's checked-out branch. The branch action target is the merge destination.
_Avoid_: Generic merge, merge current branch, source-branch merge

**Branch merge-out**:
A repository branch action that integrates the branch action target's checked-out branch into a user-selected local destination branch. A clean existing destination worktree is used when available, an unchecked-out destination may use an application temporary worktree, and a dirty destination worktree is ineligible.
_Avoid_: Generic merge, merge-back, merge current branch

**Branch merge-out source**:
The clean branch action target worktree whose checked-out branch supplies committed history to a merge-out. Uncommitted worktree content is never treated as part of that source and makes the action ineligible until committed or stashed.
_Avoid_: Working tree contents, selected branch context, inferred source branch

**Branch merge-out conflict site**:
The existing destination worktree in which a merge-out conflict remains for resolution. A conflict in an application temporary worktree is reported and discarded during cleanup, so neither the source worktree nor a hidden temporary directory becomes a retained conflict site.
_Avoid_: Source worktree conflict, hidden temporary conflict

**Branch merge-out remote pipeline**:
An optional destination-owned sequence that pulls the selected destination branch, merges the branch action target into it, and pushes that destination branch. Its eligibility depends only on the destination branch's usable upstream; the source branch's upstream is irrelevant.
_Avoid_: Source pull, source push, merge-in remote pipeline

**Project list**:
The inline list of open projects shown beneath the sidebar project switcher.
_Avoid_: Repo dropdown, project expanded list

**Project**:
A top-level working context in the project list. A project is either one Git repository, one plain workspace, or one multi-repository workspace.
_Avoid_: Using project as a synonym for every repository inside a multi-repository workspace

**Repository**:
One Git operation boundary. Branches, worktrees, status, history, and Git writes always belong to exactly one repository, even when several repositories share a project. The same repository may appear simultaneously as its own project and as a multi-repository workspace member; both contexts share one repository state.
_Avoid_: Workspace repository, subproject

**Repository primary worktree**:
The original Git worktree whose normalized path is the repository project path and whose identity is confirmed by Git worktree metadata. It is independent of the branch currently checked out there and is never synonymous with a branch named `main`.
_Avoid_: Main branch, default branch, protected branch

**Multi-repository workspace**:
A project rooted at a readable non-Git directory, either local or reached through one SSH target, whose immediate child entries are directories or directory symlinks resolving to Git repository primary worktree top levels. Linked worktrees are not repository candidates. A symlink keeps its immediate-child name and logical path as the workspace member identity. The root provides project-level files and terminals; its repositories remain independent Git operation boundaries. Every repository in an SSH multi-repository workspace uses the same SSH target as the workspace root.
_Avoid_: Monorepo, repository group, nested repository

**Configured workspace**:
A multi-repository workspace whose durable, ordered repository membership has been explicitly selected. Membership is stored in Hobgoblin application data. Filesystem discovery supplies candidates but does not silently change a configured workspace, and a repository referenced by any branch workspace cannot be removed from configuration until those references are removed. Repository order controls workspace navigation order and sequential branch workspace member-operation order.
_Avoid_: Saved scan, repository registry, primary repository

**Branch workspace**:
A branch-specific, indivisible working context owned by one configured workspace and presented by its common branch name. Within that parent, a branch name identifies at most one branch workspace; every workspace-level action targets its root directory on the same local or SSH host as the parent, while contained repository worktrees are members rather than nested workspace contexts. Membership may be extended or reduced only through parent-scoped lifecycle actions. A reduction must retain at least one member, removes only the selected managed worktrees and membership records, and retains their local and remote branches; deleting the final member instead requires whole branch workspace removal. When active, its root context exposes folder-level file browsing and internal terminals, and selecting one member worktree exposes that repository's ordinary worktree experience without leaving the branch workspace; the parent workspace retains separate repository navigation. Its managed directory remains visible and browsable in the parent file tree but cannot be renamed, moved, or deleted there. Inside that directory, member worktree roots and their contents use the ordinary file-tree operations, including drag, move, rename, and delete; structural changes may produce member drift. Its durable membership and materialization intent remain meaningful when root or member worktrees are unavailable, a branch workspace operation is incomplete, or external filesystem changes cause member drift. Member drift is surfaced for explicit repair or removal rather than silently recreating or forgetting the branch workspace; completed members are retained without automatic rollback, and retries continue the remaining work.
_Avoid_: Project, workspace repository, generic subworkspace

**Workspace worktree**:
A set of same-named linked worktrees belonging to one branch workspace. The configured repository list is the candidate pool; each branch workspace chooses its own members, every member remains an independent Git operation boundary, and newly created target branches may use different creation bases per repository. Member provenance distinguishes target branches created for the branch workspace from branches that already existed. A same-named worktree already checked out elsewhere remains repository-only and is never moved or claimed automatically.
_Avoid_: Shared worktree, combined worktree

**Branch workspace member worktree**:
The linked worktree contributed by one repository member to a branch workspace while remaining that repository's independent Git operation boundary.
_Avoid_: Subrepository, child repository worktree, nested workspace

**Branch workspace creation base**:
The repository-specific local or remote branch ref used when a branch workspace member's target branch must be created. A checked-out local base may also guide worktree bootstrap source selection, with the repository primary worktree available as an explicit alternative; the base is not a batch merge source, merge destination, or upstream.
_Avoid_: Base branch, merge destination, source branch, upstream, current branch

**Worktree creation source sync**:
An explicit per-create choice that refreshes the selected local branch from its usable remote upstream, or fetches the selected remote branch, before any dependent branch or worktree is created. It defaults on when remote synchronization is available, and a failed sync prevents the corresponding worktree creation rather than falling back to stale local state.
_Avoid_: Background fetch, post-create pull, automatic fallback

**Workspace overview**:
The parent-level workspace view that lists its branch workspaces in the same contextual list position used for repository worktrees, while retaining the workspace root's file and terminal context. Selecting it does not select a branch workspace.
_Avoid_: All branch workspace, workspace repository

**Branch workspace item**:
The workspace overview representation of one branch workspace, labelled by the common branch name rather than its directory name and identified with the branch-workspace icon. Its expanded repository members use the ordinary worktree icon. Items have a durable manual order within the parent workspace; new items append without repair, extension, or reduction changing existing order. Single-clicking the main item selects its root context without changing member-summary expansion; when a member is selected, that selection first returns to the root context. Double-clicking the main item selects the root through the normal click sequence and toggles the desktop file area without changing member-summary expansion, while the separate Chevron toggles those summaries without changing selection. A separate control reorders the item. Its editor and external-terminal actions open the branch workspace root, while each internal-terminal action creates and selects a new root-scoped session. The item menu owns whole-branch-workspace batch Git actions and membership changes without narrowing to a selected member; batch merge-in and batch merge-out each open a foreground member-selection dialog, while the other batch Git actions open inline beneath the item. Ready items expose all folder and membership actions; drifted items with an available root retain folder, terminal, reordering, and healthy-member actions while whole-workspace Git, membership, and dependency actions remain restricted; creation-incomplete items remain inspectable and repairable, active operations expose only cancellation, and deletion- or reduction-incomplete items expose their corresponding continuation path. The first observation of a drifted item in one visible drift episode triggers one authoritative state reread; continued drift remains explicit and is never automatically repaired. Its item-level badges represent internal terminal sessions scoped to that root directory and the summed Git change count of its repository member worktrees.
_Avoid_: Project item, repository row, worktree row

**Branch workspace member summary**:
The inline representation of one repository member under an expanded branch workspace item, showing its repository identity followed by the resolved target branch's abbreviated commit hash as muted `#hash` text, target-worktree dirtiness, and internal-terminal activity; the `#hash` identifies a commit rather than a Git tag, and selecting the summary keeps the branch workspace active while opening that member worktree's files, Git surfaces, and terminals. It exposes the ordinary worktree's editor, terminal, remote, and repository-scoped Git actions, including worktree creation and refresh, while omitting reordering, checkout, and individual worktree or branch removal because those lifecycle operations would escape or violate the owning branch workspace lifecycle.
_Avoid_: Subrepository, child repository, nested project, branch workspace item

**Workspace auxiliary entry**:
A selected non-repository direct child of the workspace root that is materialized once under a branch workspace with the same name, independently as either a symbolic link or a copy. The selected dependency takes precedence over same-named ordinary branch-workspace content, which may be replaced only through an explicit fingerprint-bound preview; replacement never merges directories or targets repository members and application-managed entries. After successful materialization it becomes ordinary branch workspace content: it may be edited, renamed, moved, or deleted, its absence does not create drift, and branch workspace repair does not inspect or recreate it. A symbolic link stores the selected absolute source path and may be dangling; a copy is an independent snapshot that dereferences a symbolic-link source when necessary and never synchronizes or merges back. Copying content whose resolved source lies outside the workspace boundary requires separate approval, while symbolic-link materialization does not read or dereference its source. Configured repositories and all their worktrees, branch workspace directories, and application temporary entries are not eligible.
In user-facing language, these entries are grouped as **Branch workspace dependencies**.
_Avoid_: Workspace member, shared file, bootstrap file, repository dependency candidate

**Branch workspace dependency maintenance**:
An explicit ready-item action that compares current workspace auxiliary candidates with same-named direct children of one branch workspace. A selected dependency may be added by copy or symbolic link; when its target is occupied, the preview binds confirmation to that target's fingerprint and execution replaces the exact target without following symbolic links. A present target may also be removed after previewing and confirming its exact path. Maintenance is filesystem-derived and does not make successfully materialized dependencies durable manifest members or create dependency drift. Repair ignores dependency sources and targets, clears retained dependency intent, and never rebuilds dependency content. Removal and replacement never target repository members or entries without a current workspace-root counterpart.
_Avoid_: Dependency synchronization, dependency registry, member lifecycle action, repair

**Repository-only worktree**:
A linked branch worktree that is not a member of a workspace worktree. It is changed only through that repository's ordinary worktree actions.
_Avoid_: Orphan worktree, detached worktree

**Branch workspace operation**:
A server-coordinated creation, extension, reduction, repair, or removal of one branch workspace. Member work is applied sequentially with per-member results and no automatic rollback, but this cross-repository orchestration is not exposed as a separate batch concept.
Creation succeeds only after final reconciliation observes the resulting branch workspace as ready; the successful result carries that observed state, while later reads continue to detect external drift. If the final remote read fails after the foreground UI has independently observed the workspace as ready with every planned step complete, the creation modal closes; all other failures remain visible and retryable. Whole-branch-workspace removal remains available from ready, incomplete, and drifted lifecycles, derives its managed scope from the durable manifest, and retains all destructive approvals and non-bypassable worktree safety boundaries.
Once a confirmed whole-branch-workspace removal starts, its progress remains in the foreground modal until execution settles. Successful removal closes the modal only after the workspace has been fully removed; failed removal remains visible with its completed and remaining work instead of becoming a background operation.
During reduction, selected dirty member worktrees require explicit approval before force removal, and internal terminals scoped below those member paths require separate close approval. Unselected member worktrees are verified but never modified; one-time dependency content is not inspected.
When removal includes local branch cleanup, that cleanup applies only to branches created for the branch workspace and is explicitly forceful, so it may discard their unpushed commits; pre-existing branches are retained. Removing a branch workspace always force-removes its managed worktrees and may discard their uncommitted changes without a separate dirty-worktree preflight, while locked and primary worktrees remain removal safety boundaries. Modified copied auxiliary entries, unregistered contents, and internal terminals running anywhere under the branch workspace require separate destructive approval; approved terminals are closed before file removal, while symbolic-link removal never removes its target.
_Avoid_: Workspace batch operation, workspace transaction, multi-repository Git command

**Branch workspace registry cleanup**:
An explicit recovery action for an unreadable branch workspace registry. It removes only invalid application records when they can be isolated, or resets all branch workspace records when the registry cannot be parsed at all. It never removes branch workspace directories, repository worktrees, local branches, or remote branches.
_Avoid_: Delete branch workspace, worktree cleanup, repository cleanup

**Branch workspace batch commit**:
An application-coordinated action that presents every dirty repository member with one editable, repository-specific AI commit message bound to the inspected change set. Before any commit it verifies that every member still matches that change set; after one explicit confirmation, it attempts exactly one commit per dirty member sequentially. A repository-member failure is recorded without blocking later members, all failures are returned together, and completed commits are never rolled back.
_Avoid_: AI commit handoff, shared commit message, automatic commit

**Branch workspace batch AI commit-and-push**:
An explicit, per-open opt-in mode of branch workspace batch commit that hides manual message and submit controls, generates one repository-specific message for every dirty member with the selected AI provider, commits only after every generation succeeds, then obtains a fresh batch-push plan and pushes only after every commit succeeds. A failed stage prevents the next stage, while repository-member failures inside a Git stage are accumulated without blocking its remaining members. It preserves completed Git writes without rollback and never becomes a saved preference or background automation.
_Avoid_: Atomic workspace transaction, shared commit message, persisted automatic commit

**Branch workspace batch pull**:
An application-coordinated action that fast-forward pulls every repository member's target branch from its configured upstream sequentially. A repository-member failure is recorded without blocking later members, all failures are returned together, and completed pulls are never rolled back.
_Avoid_: Workspace pull-all, base-branch pull, atomic batch pull

**Branch workspace batch push**:
An application-coordinated action that pushes every repository member's target branch to its resolved push target sequentially. A repository-member failure is recorded without blocking later members, all failures are returned together, and completed pushes are never rolled back.
_Avoid_: Merge-back push, base-branch push, atomic batch push

**Branch workspace batch merge-in**:
An application-coordinated action that integrates one explicitly selected local source branch per selected repository member into that member's checked-out target branch. The clean member worktree is the merge destination and conflict site; selected member pipelines retain manifest order, isolate a failed member while later members continue, return all member failures together, and never roll back completed Git or remote writes.
_Avoid_: Batch merge-out, source worktree merge, atomic batch merge

**Branch workspace batch merge-out**:
An application-coordinated action that integrates each selected repository member's target branch into one explicitly selected local destination branch per member. A clean existing destination worktree is reused; an unchecked-out destination uses an application-owned temporary worktree that is cleaned without deleting the branch before the next member is attempted. Selected member pipelines retain manifest order, isolate and aggregate member failures, and never roll back completed Git or remote writes.
_Avoid_: Batch merge-in, merge-back, fixed base-branch merge, atomic batch merge

**Plain workspace**:
A readable directory opened as a workspace without requiring Git metadata.
_Avoid_: Non-Git repository

**Web access protection**:
The optional server-owned authentication gate for browser clients. When enabled, browser access requires configured web credentials while the Electron client continues to use its private internal capability.
_Avoid_: Security mode, LAN password

**Android SSH access initialization**:
The explicit first-time flow that uses a temporary server password to generate or reuse a Hobgoblin-managed identity, install its public key for one Android SSH host profile, and then run an Android host connectivity diagnostic. A first-seen host key is trusted automatically as part of this flow, while a changed host key fails closed and requires separate review. The password is used only for public-key installation and is never part of connectivity diagnostics.
_Avoid_: Host diagnostic, password login, saved server password

**Android host connectivity diagnostic**:
A key-only SSH reachability and shell probe that authenticates with the private key already associated with an Android SSH host profile. It may be started directly by the user or automatically after successful Android SSH access initialization. It never creates or installs an identity and never requests or receives a server password.
_Avoid_: SSH access initialization, realtime presence check

**Android private key export**:
An explicit Android Host-edit action that writes the currently associated SSH private-key material to a user-selected document after a disclosure warning. The exported document is outside Hobgoblin's encrypted private app storage and is the user's responsibility to protect.
_Avoid_: Public-key export, automatic key backup, identity sharing

**Android host online state**:
The persisted outcome of the most recent Android host connectivity diagnostic. `online` means that diagnostic passed; `offline` means it failed or no successful diagnostic has been recorded. It is not a continuously monitored presence signal.
_Avoid_: Live connection, terminal session state

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
