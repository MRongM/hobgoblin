# Hobgoblin — Codebase Context

## What this is

Hobgoblin is a high-productivity workspace for Git worktree-based development with AI CLI tools. It ships as a packaged Electron desktop app and as a server mode accessible from a web browser.

Core model: **multi-project × multi-worktree/branch × multi-terminal**. Users open several repositories, isolate parallel branches in separate worktrees, and attach server-backed terminals to the right branch context — keeping Git state and AI CLI sessions (Claude Code, Codex, etc.) together.

## Language

**Independent Windows version**:
The standalone Hobgoblin product for Windows, built from the independent `windows/` package and maintained alongside the Android platform package. It owns its platform behavior and release assets, and is distinct from the primary application Windows version built from the primary application’s root `src/` source tree.
_Avoid_: primary application Windows version, Windows mode, Windows compatibility branch, shared Windows adaptation

**Primary application Windows version**:
The Windows Hobgoblin version built from the primary application’s root `src/` source tree and ordinary application package. It remains part of the primary desktop/web application and is distinct from the independently built Windows version under `windows/`.
_Avoid_: independent Windows version, Windows mode, shared Windows adaptation

**Android terminals tab**:
The Android main-navigation destination that lists every retained Host temporary terminal and Project terminal by descending retained-terminal opened time so the newest item is first and an existing session can be reopened quickly. Each item shows that opened time in localized relative form, and its header status badge distinguishes running (green), disconnected/failed (red), exited (gray), and starting (neutral) states while preserving a text label. It is distinct from the terminal tabs inside the desktop/web terminal topbar, does not create or manually reorder sessions, and may explicitly close or delete one retained terminal after confirmation.
_Avoid_: Terminal manager, terminal creator, internal terminal tab

**Android retained terminal opened time**:
The immutable device-local time assigned when a retained Android terminal record first enters the terminal list, including a recovered tmux record. It orders the Android terminals tab newest-first and is displayed there as localized relative time. Reconnecting, terminal input or output, status changes, and list navigation never change it. It is distinct from terminal activity time and from the unknown remote creation time of a recovered tmux session.
_Avoid_: Last activity time, reconnect time, remote tmux creation time

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

**Android project created time**:
The immutable device-local time when one Android Project is first saved to the local Project list. It is distinct from remote directory, repository, or Git history creation time; editing the Project never changes it, and legacy records without trustworthy time data remain explicitly unknown.
_Avoid_: Repository creation time, directory creation time, project edit time

**Android manual item order**:
The restorable, device-local order chosen by dragging Android Host, Project, or Project Worktree items from their dedicated drag handles. Host and Project orders are global to their respective lists; Worktree order is scoped to one Project. Before a Project order exists, Projects use descending Android project created time; the Android Terminals tab instead always uses descending retained-terminal opened time. Manual order changes only Android presentation, never Git worktree enumeration or remote repository state, and newly discovered items append after retained ordered items.
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

**Android tmux Git repository import**:
One Android tmux directory import choice that identifies a Git repository by its repository primary worktree, even when the scanned directory belongs to another worktree. Its availability is independent from importing the scanned worktree as a plain workspace.
_Avoid_: Main-branch import, current-worktree project, automatic repository import

**Android tmux plain workspace import**:
One Android tmux directory import choice that treats the current Git worktree root as a plain workspace without Git project behavior. It may coexist with an Android tmux Git repository import for the same repository, and its availability is determined independently by project type and current-worktree path.
_Avoid_: Git repository import, arbitrary tmux child directory, linked repository

**Tmux server target**:
The exact default or strictly named project-scoped tmux server on which one discovered session was observed and to which Android must later attach it. It is part of host-level recovery identity because a session name may exist on more than one server and a project-root hash cannot be reversed.
_Avoid_: Project root, socket scan result, tmux session name

**Terminal topbar**:
The top row of the terminal area, containing terminal tabs and terminal-level actions.
_Avoid_: Terminal toolbar, detail toolbar

**Terminal navigation controls**:
The rendered fixed-action group containing Terminal cycle controls followed by Terminal return to bottom. A global visibility preference hides or shows all three buttons together across Desktop/Web controller terminals, Desktop/Web read-only terminals, and every Mobile Web selected terminal. Hiding the group leaves terminal-cycle keyboard shortcuts and every other dock or deck control unchanged.
_Avoid_: Terminal command deck, custom terminal buttons, terminal shortcuts

**Terminal cycle controls**:
The paired previous-terminal and next-terminal actions that traverse the global open internal-terminal catalog in project order, including terminals in other projects. Selecting one changes the workspace destination and selected internal terminal without requesting input authority. When Terminal navigation controls are visible, Desktop/Web controller terminals place them first in the Desktop/Web terminal command dock; Desktop/Web read-only terminals place them first in a bottom-left read-only dock before Return to bottom and Take over, with status text last; every Mobile Web selected terminal places them first in the stable Mobile Web terminal bottom dock before Return to bottom, independently of whether attachment authority has finished loading.
_Avoid_: Project switcher, terminal tabs, terminal takeover

**Terminal return to bottom**:
The fixed navigation action that first moves the renderer's normal terminal buffer to its bottom. For a tmux-backed terminal, any connected controller, viewer, or unowned attachment additionally asks the server to leave tmux copy mode with the exact validated project server and session target; it never injects `q`, Escape, or shell input and never takes terminal ownership.
_Avoid_: Terminal input, takeover, blind key injection, synchronized scroll position

**Read-only tmux page navigation**:
A shared one-page movement through a tmux-backed terminal's copy-mode history that a viewer or unowned attachment may request without gaining terminal input authority. The controller and every viewer observe the resulting tmux pane position; reaching the live bottom exits copy mode.
_Avoid_: Local viewer scrollback, PageUp key injection, private tmux viewport, takeover

**Desktop/Web terminal command dock**:
A controller-only bottom-left terminal action surface whose visible Terminal navigation controls are followed by a visual divider and any configured custom terminal buttons. When both groups are hidden or empty, the dock is absent and reserves no terminal viewport space. It does not provide a free-form command composer and is distinct from the Mobile Web terminal command deck.
_Avoid_: Mobile Web terminal command deck, terminal topbar, command composer, external input box

**Mobile Web terminal bottom dock**:
A stable bottom action surface mounted as soon as a Mobile Web internal terminal is selected. Its action row starts with Terminal navigation controls when their global visibility preference is enabled, including while attachment authority is unresolved. Once authority arrives asynchronously, a controller receives the Mobile Web terminal command deck and configured custom terminal buttons, while a viewer or unowned attachment receives shared page-up and page-down controls for a tmux-backed terminal followed by Take over, without read-only status copy. Authority resolution, system input-method visibility, and same-surface selected-terminal changes do not replace the configured navigation-control visibility; cross-project navigation mounts the destination dock immediately from its selected terminal. Controller-only state is cleared when the terminal changes or input authority is lost. Mobile Web terminal focus mode intentionally hides the complete dock.
_Avoid_: Mobile Web terminal command deck, read-only status overlay, loading toolbar, terminal topbar

**Internal terminal**:
A Hobgoblin-managed terminal session rendered inside the selected worktree's terminal area.
_Avoid_: New terminal, embedded terminal

**Internal terminal shell**:
The interactive command interpreter running inside one internal terminal session. It is attached to Hobgoblin's PTY and rendered by the existing terminal surface; it is distinct from the terminal host, the PTY transport, and an external terminal application.
_Avoid_: Windows Terminal, terminal emulator, external terminal

**WSL-preferred Windows internal terminal shell**:
The automatic Windows internal-terminal shell policy that starts a usable WSL session before any native Windows shell, while retaining native-shell fallback when WSL is unavailable or cannot start. It applies equally to the primary application Windows version and the independent Windows version, and is distinct from a user-selected distribution or an external Windows Terminal profile.
_Avoid_: WSL-only terminal, Windows Terminal integration, configured WSL distribution

**Internal terminal path identity**:
The renderer-and-server-stable identity of an internal terminal's project root or working-directory path. Equivalent Windows drive and UNC paths share one case-insensitive identity with normalized separators and dot segments, while the repository-owned original path remains authoritative for navigation, presentation, and the PTY working directory; symbolic links are never resolved as part of identity. It is distinct from a filesystem real path and from the operational working-directory spelling.
_Avoid_: Normalized working directory, canonical filesystem path, real path

**Mobile Web terminal vertical scroll gesture**:
A primary single-touch vertical drag within a Mobile Web internal terminal that scrolls terminal history in an ordinary shell and, for a controlling attachment, preserves foreground full-screen terminal application navigation. It follows the drag directly, continues with decelerating inertia after release, stops without bounce, preserves the existing terminal focus and virtual-keyboard state, and never scrolls the Hobgoblin page or requests terminal input control; a controller tap retains ordinary terminal focus behavior, while a read-only tap never invokes the input method.
_Avoid_: Page scroll, terminal input gesture, takeover gesture, history-only gesture

**Mobile Web terminal text selection**:
A renderer-local interaction that begins when a primary touch remains within terminal touch slop for a long press, selects the xterm word under that touch, and lets continued dragging extend the xterm selection before a local Copy action is offered on release. It is available to controller, viewer, and unowned attachments, never sends terminal input or mouse protocol, never requests takeover, and never synchronizes selected text; ordinary vertical drags remain terminal scrolling and ordinary horizontal drags remain local width panning.
_Avoid_: Native DOM selection, terminal mouse input, automatic copy, synchronized selection

**Mobile Web terminal edge scrubber**:
A renderer-local, touch-sized interaction strip at the right edge of a Mobile Web internal terminal that lets controller, viewer, and unowned attachments drag directly to an absolute normal-buffer history position. It has no idle track or thumb; while dragging or keyboard-focused it briefly shows a terminal-style position tick and a 14-pixel percentage readout. It is unavailable when the active buffer has no normal scrollback, cancels gesture inertia when grabbed, and never requests terminal input control or synchronizes viewing position through the server.
_Avoid_: Scroll slider, persistent scrollbar, page scrollbar, terminal ownership control, synchronized scroll position

**Mobile Web terminal command deck**:
A compact, controller-only input extension of the Mobile Web terminal bottom dock. Its first two rows follow Hobgoblin Android's Termux-compatible extra-key order, distribute their seven keys evenly across the available width, and retain a 44-pixel minimum key width on narrow screens. For a controlling attachment, those two rows appear only while the system input method obscures the visual viewport and disappear when it closes; they are always absent while authority is unresolved and for viewer or unowned attachments. After any visible Terminal navigation controls, the deck adds terminal input, command composition, renderer-local width presentation, and Focus independently of those two rows. All keys are 32 pixels high. It shares the dock with configured custom terminal buttons, reserves terminal viewport space instead of floating over output, and is distinct from the Terminal topbar and the Android native command deck.
_Avoid_: Mobile Web terminal bottom dock, mobile toolbar, floating keys, virtual keyboard, Android command deck

**Mobile Web terminal focus mode**:
A temporary, controller-only presentation for the selected Mobile Web internal terminal that hides the complete auxiliary bottom dock, including the command deck, composer, and custom terminal buttons. A small top-right exit handle restores the dock; changing terminal, attachment authority, or mobile presentation resets the mode. It is renderer-local, never persisted or synchronized, and does not hide Web navigation or enter desktop Terminal focus mode.
_Avoid_: Desktop Terminal focus mode, browser fullscreen, hidden system keyboard, persisted terminal layout

**Mobile Web terminal input latency**:
The perceived delay between direct virtual-keyboard input or committed input-method text and the corresponding internal terminal response or echo becoming visible. Input-method pre-edit text is not terminal input; candidate UI and system keyboard animation latency are excluded.
_Avoid_: Keyboard animation lag, composition candidate lag, terminal startup latency

**Built-in terminal button preset**:
An app-supplied custom terminal button whose label and sent text follow the application language until the user edits it. Reordering preserves the preset, editing turns it into an ordinary custom terminal button, and removing it is a durable user choice.
_Avoid_: Fixed terminal action, translated shell command, mandatory terminal button

**Terminal focus mode**:
A restorable, application-global desktop presentation preference that maximizes the selected internal terminal by hiding workspace navigation and file surfaces until the user explicitly exits Focus. It remains active while switching projects, repositories, branches, branch workspaces, and terminals without first restoring the split; on compact viewports or destinations without an eligible terminal it remains latent and reapplies when an eligible desktop terminal destination returns. It is distinct from compact focus surfaces and from maximizing an arbitrary detail surface.
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
The server-owned PTY column and row count published by the current controller attachment and used by read-only attachments to parse that terminal's VT stream. A read-only renderer may expose a smaller local presentation viewport, but it never substitutes that viewport's dimensions while parsing controller-sized output.
_Avoid_: Viewer size, shared viewport size

**Local terminal geometry**:
The renderer-local xterm column and row count fitted to one controlling attachment's visible host. It is never synchronized or persisted and only that controller may publish it as new canonical terminal geometry; viewer and unowned attachments instead keep canonical terminal geometry and pan their local presentation viewport without resizing xterm or the PTY.
_Avoid_: Canonical size, read-only presentation viewport, remote size

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

**Desktop CLI project import**:
An explicit macOS shell action that sends one local directory to the installed Hobgoblin desktop app, where the ordinary external-open flow validates, opens, and activates the resolved project. It never writes project or recent-project state directly from the command-line process.
_Avoid_: CLI project registration, server-side import, recent-project insertion

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
A user-selected, best-effort process that copies or symlinks explicitly checked files or directories from one existing source worktree into the same relative paths of a newly created worktree. Dependency skips and materialization failures never change the result of the preceding worktree creation.
_Avoid_: Worktree setup script, post-create hook

**Worktree bootstrap source**:
The existing repository worktree selected from the repository's current worktree list whose file tree supplies one worktree bootstrap decision. It remains fixed from dependency-tree selection through the corresponding create execution and is never the worktree being created.
_Avoid_: Source branch, repository root, bootstrap template

**Worktree dependency selection**:
A file or directory at any depth that the user explicitly checks in a worktree bootstrap source's lazily loaded file tree, together with its copy or symbolic-link mode. A selected directory represents one dependency rather than an implicit selection of every descendant.
_Avoid_: Bootstrap candidate, Git-excluded entry, typed dependency path

**Repository dependency selection**:
A worktree dependency selection scoped to one newly materialized branch-workspace repository member.
_Avoid_: `.gitignore` rule, workspace auxiliary entry, generic file-tree selection

**Worktree dependency skip**:
A silent best-effort outcome in which a selected dependency is not materialized because it is Git-tracked, unsafe, unavailable, already occupies the target path, or cannot be copied or linked. It never fails, rolls back, or marks incomplete the worktree or branch-workspace member created before it.
_Avoid_: Worktree creation failure, dependency validation error, dependency replacement

**Selected branch context**:
The branch whose explorer and detail surfaces the user is currently viewing. Changing this context is navigation; it is distinct from checking out a Git branch and from targeting a branch action.
_Avoid_: Active branch, current branch

**Branch creation source**:
The exact local or remote branch ref selected when Hobgoblin creates a local branch. It is immutable creation provenance recorded beside that local branch, may be unknown for branches created outside Hobgoblin or before provenance recording existed, and is distinct from current commit ancestry, upstream tracking, the repository default branch, and a branch workspace creation base.
_Avoid_: Baseline, inferred parent branch, merge destination

**Branch upstream**:
The optional Git upstream configured for one local branch and shared by every Hobgoblin presentation of that branch. Multiple local branches may share one upstream; it remains distinct from the worktree, branch creation source, and branch workspace creation base.
_Avoid_: Worktree upstream, creation source, creation base

**File area**:
The explorer surface for the selected project or branch context. In a repository worktree context, it contains the file area tab bar and the selected explorer panel; in a plain workspace, it contains the file browser without repository explorer tabs. It is distinct from the navigation area and the detail pane.
_Avoid_: Detail area, file tab area

**File area tab bar**:
The top row of the repository file area, containing the Status, Files, Changes, History, Local, Remote Branches, and optional Ports explorer tabs together with their overflow control.
_Avoid_: Detail tabs, file tabs

**Detached file area window**:
A temporary auxiliary window that shows a live copy of the complete file area while keeping the source file area in its captured project and branch or worktree context. The tab active when detachment starts becomes the auxiliary window's initial tab, and its full file area tab bar remains independently navigable. Electron uses a native application window; Web uses a same-origin browser window.
_Avoid_: File area focus mode, moved file tab, detached single-tab panel, generic secondary window

**Branch action target**:
The branch or worktree explicitly targeted by an action. It may differ from the selected branch context, and targeting it does not imply navigating to it unless the action opens branch-specific application content.
_Avoid_: Active branch, implicitly selected branch

**Branch merge-in**:
A repository branch action that integrates one explicitly selected local branch or remote-tracking branch ref into the branch action target's checked-out branch. A remote source is fetched from its exact remote before merge; the branch action target remains the merge destination and the only branch pulled or pushed by the optional target-owned remote pipeline.
_Avoid_: Generic merge, merge current branch, source-branch merge

**Branch merge-out**:
A repository branch action that integrates the branch action target's checked-out branch into one explicitly selected local branch or remote-tracking branch ref. A local destination uses a clean existing worktree or an application temporary worktree; a remote destination is fetched, materialized only as an application-owned detached temporary worktree, merged, pushed non-forcefully to that exact remote branch, and cleaned without creating a local branch.
_Avoid_: Generic merge, merge-back, merge current branch

**Merge branch selection**:
The dialog-local, explicit choice of either one local branch or one remote-tracking branch ref in the same repository for a merge-in source or merge-out destination. Its local-or-remote kind and full branch identity remain part of planning and execution identity so a local branch named like `origin/main` is never confused with the remote-tracking ref of that name.
_Avoid_: Branch name, inferred upstream, implicit tracking branch

**Branch merge-out source**:
The clean branch action target worktree whose checked-out branch supplies committed history to a merge-out. Uncommitted worktree content is never treated as part of that source and makes the action ineligible until committed or stashed.
_Avoid_: Working tree contents, selected branch context, inferred source branch

**Branch merge-out conflict site**:
The existing destination worktree in which a merge-out conflict remains for resolution. A conflict in an application temporary worktree is reported and discarded during cleanup, so neither the source worktree nor a hidden temporary directory becomes a retained conflict site.
_Avoid_: Source worktree conflict, hidden temporary conflict

**Branch merge-out remote pipeline**:
A destination-owned sequence that synchronizes the selected destination, merges the branch action target into it, and pushes the result. A local destination is fast-forward pulled and pushed through its usable upstream; a remote destination is fetched from its exact remote, merged in a detached temporary worktree, and pushed from detached `HEAD` to that exact remote branch. A remote destination has no merge-only mode because no durable local branch owns an unpushed result; the source branch's upstream is irrelevant.
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
A multi-repository workspace whose durable, ordered repository membership is initialized from every discovered repository primary worktree and automatically appends newly discovered primary worktrees. Membership is stored in Hobgoblin application data; unavailable existing members remain explicit until workspace configuration recovery, and repository order controls workspace navigation order and sequential branch workspace member-operation order.
_Avoid_: Saved scan, repository registry, primary repository

**Workspace configuration recovery**:
An explicit abnormal-data escape hatch that first requests ordinary removal of every branch workspace, falls back to removing only failed branch-workspace application records, then clears the workspace configuration and imports every currently discovered repository primary worktree. It may reset the shared workspace-configuration registry when that registry cannot be parsed, but its fallback never force-deletes residual directories, worktrees, or branches.
_Avoid_: Delete project, force-delete worktree, ordinary repository rescan

**Branch workspace**:
A branch-specific, indivisible working context owned by one configured workspace and presented by its common branch name. Within that parent, a branch name identifies at most one branch workspace; every workspace-level action targets its root directory on the same local or SSH host as the parent, while contained repository worktrees are members rather than nested workspace contexts. Membership may be extended through parent-scoped lifecycle actions and reduced through explicit branch workspace member removal. A reduction must retain at least one member, removes only the selected managed worktrees and membership records, and retains their local and remote branches; deleting the final member instead requires whole branch workspace removal. When active, its root context exposes folder-level file browsing and internal terminals, and selecting one member worktree exposes that repository's ordinary worktree experience without leaving the branch workspace; the parent workspace retains separate repository navigation. Its managed directory remains visible and browsable in the parent file tree but cannot be renamed, moved, or deleted there. Inside that directory, member worktree roots and their contents use the ordinary file-tree operations, including drag, move, rename, and delete; structural changes may produce member drift. Its durable membership and materialization intent remain meaningful when root or member worktrees are unavailable, a branch workspace operation is incomplete, or external filesystem changes cause member drift. Member drift is surfaced for explicit repair or removal rather than silently recreating or forgetting the branch workspace; completed members are retained without automatic rollback, and retries continue the remaining work.
_Avoid_: Project, workspace repository, generic subworkspace

**Workspace worktree**:
A set of same-named linked worktrees belonging to one branch workspace. The configured repository list is the candidate pool; each branch workspace chooses its own members, every member remains an independent Git operation boundary, and newly created target branches may use different creation bases per repository. Member provenance distinguishes target branches created for the branch workspace from branches that already existed. A same-named worktree already checked out elsewhere remains repository-only and is never moved or claimed automatically.
_Avoid_: Shared worktree, combined worktree

**Branch workspace member worktree**:
The linked worktree contributed by one repository member to a branch workspace while remaining that repository's independent Git operation boundary.
_Avoid_: Subrepository, child repository worktree, nested workspace

**Branch workspace member removal**:
An explicit branch workspace reduction that force-removes one or more selected managed member worktrees and their membership records while retaining their local and remote branches. It is a lifecycle-independent escape hatch: it does not inspect selected worktree dirtiness or unrelated member health and may replace interrupted creation, extension, or repair intent. A registered detached-HEAD member remains a Git worktree and is removed through Git by exact path. A manifest-bound member path left as ordinary residual content after an interrupted or external worktree removal may also be deleted after separate unmanaged-content confirmation; a symbolic-link residue is removed without following its target. The operation never supersedes active execution, whole-branch-workspace removal, or a different interrupted reduction; it must retain at least one member, closes approved selected-path terminals first, and never bypasses exact-path identity, primary-worktree, or locked-worktree boundaries.
_Avoid_: Ordinary repository worktree removal, branch workspace repair, whole branch workspace removal

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
The workspace overview representation of one branch workspace, labelled by the common branch name rather than its directory name and identified with the branch-workspace icon. Its expanded repository members use the ordinary worktree icon. Items have a durable manual order within the parent workspace; new items append without repair, extension, or reduction changing existing order. Single-clicking the main item selects its root context without changing member-summary expansion; when a member is selected, that selection first returns to the root context. Double-clicking the main item selects the root through the normal click sequence and toggles the desktop file area without changing member-summary expansion, while the separate Chevron toggles those summaries without changing selection. A separate control reorders the item. Its editor and external-terminal actions open the branch workspace root, while each internal-terminal action creates and selects a new root-scoped session. The item menu owns whole-branch-workspace batch Git actions and bulk membership changes; each member summary separately owns its member-removal escape hatch. Batch merge-in and batch merge-out each open a foreground member-selection dialog, while the other batch Git actions open inline beneath the item. Ready items expose all folder and membership actions; drifted items with an available root retain folder, terminal, reordering, healthy-member actions, and member removal while whole-workspace Git, membership addition, and dependency actions remain restricted; creation-incomplete items remain inspectable, repairable, and reducible, active operations expose only cancellation, and deletion- or reduction-incomplete items expose their corresponding continuation path. The first observation of a drifted item in one visible drift episode triggers one authoritative state reread; continued drift remains explicit and is never automatically repaired. Its item-level status represents internal terminal sessions scoped to that root directory, the summed Git change count of its repository member worktrees, and separate ahead and behind totals across members whose current worktree branches can be resolved; those cross-repository totals never imply that the branch workspace root has its own Git upstream.
_Avoid_: Project item, repository row, worktree row

**Branch workspace file area**:
The parent-scoped file surface opened for a selected branch workspace item. Its Files view browses the branch workspace root. Status, Changes, and History show one locally selected member worktree, while Local and Remote show that same selected member repository; the five Git views mount only their selected member surface and share a panel-local member switcher without changing the active workspace or member-worktree context. The Changes tab displays the summed exact change count of all resolvable member worktrees, while its member switcher displays each member's exact worktree change count. Every repository remains an independent Git boundary. When the file surface is explicitly opened for a selected member-worktree context, it uses that repository's ordinary file area.
_Avoid_: Member file area, combined repository, workspace repository file area

**Branch workspace member summary**:
The inline representation of one repository member under an expanded branch workspace item, showing its repository identity followed by the resolved target branch's abbreviated commit hash as muted `#hash` text, target-worktree dirtiness, internal-terminal activity, and non-zero ahead or behind counts relative to that branch's own Git upstream; the `#hash` identifies a commit rather than a Git tag. Single-clicking a navigable summary keeps the branch workspace active, selects that member worktree's terminal context, and focuses its selected viable internal terminal when the member selection changes; clicking the already selected member does not refocus it, and a single click never opens the file area. Double-clicking follows the normal selection sequence and then toggles the desktop file area without changing member-summary expansion; compact presentation opens the files surface. The summary exposes the ordinary worktree's editor, terminal, remote, and repository-scoped Git actions, including worktree creation and refresh, while omitting reordering, checkout, and ordinary repository worktree or branch removal. Its distinct branch workspace member-removal action remains available as the owning lifecycle's escape hatch whenever another member will remain.
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
During reduction, selected registered member worktrees are force-removed without a working-tree-status preflight or separate dirty-change approval, and internal terminals scoped below those member paths require close approval. A selected manifest-bound path that exists without worktree registration is treated as residual content and requires separate unmanaged-content approval before exact no-follow removal; an absent path needs only membership cleanup. Unselected member worktrees and one-time dependency content are not inspected or modified.
When removal includes local branch cleanup, that cleanup applies only to branches created for the branch workspace and is explicitly forceful, so it may discard their unpushed commits; pre-existing branches are retained. Removing a branch workspace always force-removes its managed worktrees and may discard their uncommitted changes without a separate dirty-worktree preflight, while locked and primary worktrees remain removal safety boundaries. Modified copied auxiliary entries, unregistered contents, and internal terminals running anywhere under the branch workspace require separate destructive approval; approved terminals are closed before file removal, while symbolic-link removal never removes its target.
_Avoid_: Workspace batch operation, workspace transaction, multi-repository Git command

**Branch workspace registry cleanup**:
An explicit recovery action for an unreadable branch workspace registry. It removes only invalid application records when they can be isolated, or resets all branch workspace records when the registry cannot be parsed at all. It never removes branch workspace directories, repository worktrees, local branches, or remote branches.
_Avoid_: Delete branch workspace, worktree cleanup, repository cleanup

**Branch workspace batch commit**:
An application-coordinated action that presents every dirty repository member with one editable, repository-specific AI commit message bound to the inspected change set. Before any commit it verifies that every member still matches that change set; after one explicit confirmation, it attempts exactly one commit per dirty member sequentially. A repository-member failure is recorded without blocking later members, all failures are returned together, and completed commits are never rolled back.
_Avoid_: AI commit handoff, shared commit message, automatic commit

**Branch workspace batch discard**:
An application-coordinated destructive action that binds every dirty repository member's exact staged, unstaged, and untracked change paths to a reviewed plan, then discards those paths sequentially after one explicit confirmation. A repository-member failure does not block later members, completed discards are never rolled back, and changed member plans must be reviewed again.
_Avoid_: Batch reset, workspace reset, atomic discard

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
An application-coordinated action that integrates one explicitly selected local branch or remote-tracking branch ref per selected repository member into that member's checked-out target branch. A remote source is fetched before merge; the clean member worktree remains the merge destination and conflict site. Selected member pipelines retain manifest order, isolate a failed member while later members continue, return all member failures together, and never roll back completed Git or remote writes.
_Avoid_: Batch merge-out, source worktree merge, atomic batch merge

**Branch workspace batch merge-out**:
An application-coordinated action that integrates each selected repository member's target branch into one explicitly selected local branch or remote-tracking branch ref per member. A local destination reuses a clean existing worktree or an application-owned temporary worktree; a remote destination uses a fetched detached temporary worktree and an exact non-force push without creating a local branch. A batch containing any remote destination offers only the synchronized merge-and-push mode. Selected member pipelines retain manifest order, isolate and aggregate member failures, and never roll back completed Git or remote writes.
_Avoid_: Batch merge-in, merge-back, fixed base-branch merge, atomic batch merge

**Branch workspace batch upstream change**:
An application-coordinated action that changes the selected repository members' target-branch upstreams.
_Avoid_: Batch push, branch creation base, inferred upstream

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
