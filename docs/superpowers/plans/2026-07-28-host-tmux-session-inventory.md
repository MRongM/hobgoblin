# Host tmux Session Inventory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a project context-menu action that inventories every fully verified Hobgoblin tmux session on the selected project's local or SSH host and closes only explicitly selected sessions.

**Architecture:** Extend tmux v1 session metadata with a project-root option, enumerate only Hobgoblin project-server sockets plus the compatibility default server, and validate each descriptor and exact origin on the server. Keep selection state in a focused renderer hook/dialog and revalidate exact `{sessionName, serverName}` approvals immediately before sequential close.

**Tech Stack:** TypeScript 6 in Node strip-only mode, Bun 1.3, Hono, React 19, Radix/shadcn primitives, Vitest, tmux CLI, typed SSH command adapters.

## Global Constraints

- Do not use TypeScript enums, runtime namespaces, parameter properties, or import aliases.
- Use repo-alias imports with explicit `.ts` or `.tsx` extensions.
- Add no package or persistence format.
- Preserve existing directory-scoped recovery and cleanup behavior for sessions with two-field v1 metadata.
- Host inventory accepts only sessions with verified project-root, initial-path, terminal-number, name, and server-origin agreement.
- The project row right-click menu is the only new entry point; do not add the action to More menus or other item types.
- Checkboxes start unchecked and close is disabled at zero selections.
- Keep comments and UI copy consistent with the repository's existing English source comments and four locale dictionaries.
- Do not create branches or Git commits; the user requested inline execution and final review only.

---

### Task 1: Make host discovery self-describing

**Files:**

- Modify: `src/system/tmux-session.ts`
- Modify: `src/system/tmux-session.test.ts`
- Modify: `docs/terminal-tmux-protocol.md`

**Interfaces:**

- Produces: `TMUX_PROJECT_ROOT_OPTION`, `isHobgoblinTmuxServerName(value)`, and attach-or-create commands that write the normalized project root.
- Preserves: `buildTmuxSessionName`, `buildTmuxServerName`, and all two-field directory discovery semantics.

- [x] **Step 1: Write failing protocol tests**

Add assertions that a current attach command contains the exact target-pane project-root write and that the server-name predicate rejects prefixes, uppercase hashes, and non-string input:

```ts
expect(invocation?.command).toContain(
  "set-option -t '=hobgoblin-v1-aebf050981ac829e36100020:' @hobgoblin_project_root '/srv/projects/example'",
)
expect(isHobgoblinTmuxServerName('hobgoblin-project-v1-bfd9f8d97e0d5a8f0eb819d0')).toBe(true)
expect(isHobgoblinTmuxServerName('hobgoblin-project-v1-NOT-VALID')).toBe(false)
```

- [x] **Step 2: Verify RED**

Run: `bun run test -- src/system/tmux-session.test.ts`

Expected: FAIL because `TMUX_PROJECT_ROOT_OPTION` and `isHobgoblinTmuxServerName` do not exist and the command lacks the new option.

- [x] **Step 3: Implement the minimal protocol extension**

Add the exported option, exact predicate, and one command in `buildConfigureAndAttachCommand`:

```ts
const HOBGOBLIN_TMUX_SERVER_NAME_RE = /^hobgoblin-project-v1-[a-f0-9]{24}$/u
export const TMUX_PROJECT_ROOT_OPTION = '@hobgoblin_project_root'

export function isHobgoblinTmuxServerName(value: unknown): value is string {
  return typeof value === 'string' && HOBGOBLIN_TMUX_SERVER_NAME_RE.test(value)
}

;`${tmuxCommand} set-option -t ${shellQuote(paneTarget)} ${TMUX_PROJECT_ROOT_OPTION} ${shellQuote(descriptor.projectRoot)}`
```

Place the project-root write beside the other session-owned identity options before attach.

- [x] **Step 4: Verify GREEN and update protocol prose**

Run: `bun run test -- src/system/tmux-session.test.ts src/system/local-terminal.test.ts src/system/remote-terminal.test.ts`

Expected: PASS. Document the third option, its repair-on-reattach behavior, and that host inventory requires it while existing project-known discovery remains compatible.

### Task 2: Add local host inventory and exact-origin close

**Files:**

- Modify: `src/shared/tmux-cleanup.ts`
- Modify: `src/system/tmux-cleanup.ts`
- Modify: `src/system/tmux-cleanup.test.ts`

**Interfaces:**

- Produces: `TmuxHostSessionRecord`, `TmuxSessionIdentity`, `TmuxHostListResult`, `listLocalHostTmuxSessions(options)`, `killLocalHostTmuxSessionByName(name, options)`, and `TMUX_HOST_SESSION_LIST_FORMAT`.
- Consumes: `TMUX_PROJECT_ROOT_OPTION` and `isHobgoblinTmuxServerName` from Task 1.

- [x] **Step 1: Write failing parser and adapter tests**

Cover a five-field host row, invalid/missing project root, sorted server enumeration, default-server inclusion, missing socket directory, non-Hobgoblin socket exclusion, one disappearing server, malformed output, and exact-origin kill rejection. Inject server discovery and the existing process runner so tests do not touch real sockets:

```ts
const listServerNames = vi.fn(async () => ({
  ok: true as const,
  serverNames: [SERVER_B, 'not-hobgoblin', SERVER_A],
}))
const run = vi.fn<TmuxProcessRunner>()
await expect(listLocalHostTmuxSessions({ listServerNames, run })).resolves.toMatchObject({ ok: true })
expect(run.mock.calls.map(([args]) => args.slice(0, 2))).toEqual([
  ['-L', SERVER_A],
  ['-L', SERVER_B],
  ['-u', 'list-sessions'],
])
```

- [x] **Step 2: Verify RED**

Run: `bun run test -- src/system/tmux-cleanup.test.ts`

Expected: FAIL because the host inventory exports and shared types do not exist.

- [x] **Step 3: Add host record contracts and parsing**

Define exact approval identity and self-describing records without changing existing associated-cleanup inputs:

```ts
export interface TmuxSessionIdentity {
  sessionName: string
  serverName?: string
}

export interface TmuxHostSessionRecord extends TmuxSessionRecord {
  projectRoot: string
}

export const TMUX_HOST_SESSION_LIST_FORMAT = `${TMUX_SESSION_LIST_FORMAT}\t#{${TMUX_PROJECT_ROOT_OPTION}}`
```

Implement a dedicated host-row parser rather than making the existing four/five-field parser ambiguous. It accepts five fields for a caller-supplied origin and six fields for a combined SSH response whose final field is a validated server origin or `legacy-default`.

- [x] **Step 4: Implement safe local server enumeration**

Use `node:fs/promises.readdir` on `${TMUX_TMPDIR || '/tmp'}/tmux-${process.getuid()}`. Require an absolute, control-character-free base path, keep only `Dirent.isSocket()` entries accepted by `isHobgoblinTmuxServerName`, and return stable sorted names. `ENOENT` is an empty list; cancellation and other errors are explicit failures.

For every server name, invoke:

```ts
;['-L', serverName, '-u', 'list-sessions', '-F', TMUX_HOST_SESSION_LIST_FORMAT]
```

Then invoke the default server without `-L`. Reuse the established no-server classification and fail the whole inventory for non-missing command or parse errors.

- [x] **Step 5: Implement exact-origin local close**

Validate the session name and optional server name independently of the clicked project:

```ts
if (!isHobgoblinTmuxSessionName(sessionName)) return invalidArguments
if (options.serverName !== undefined && !isHobgoblinTmuxServerName(options.serverName)) return invalidArguments
const args = [...(options.serverName ? ['-L', options.serverName] : []), 'kill-session', '-t', `=${sessionName}`]
```

- [x] **Step 6: Verify GREEN**

Run: `bun run test -- src/system/tmux-cleanup.test.ts`

Expected: PASS with existing project-scoped tests unchanged.

### Task 3: Add typed SSH host inventory operations

**Files:**

- Modify: `src/system/ssh/commands.ts`
- Modify: `src/system/ssh/commands.test.ts`

**Interfaces:**

- Produces typed remote commands `tmuxListHostSessions` and `tmuxKillHostSessionByName`.
- Emits six-field host rows whose final field is the exact server origin or `legacy-default`.

- [x] **Step 1: Write failing SSH command tests**

Assert that host list construction has no project-root input, resolves UID dynamically, honors `TMUX_TMPDIR`, filters the exact socket-name protocol, lists in a fixed locale, tags every row with its origin, and also lists the default server. Assert host kill accepts only a validated server name or the default origin and targets an exact session name.

- [x] **Step 2: Verify RED**

Run: `bun run test -- src/system/ssh/commands.test.ts`

Expected: FAIL because the new command variants are not part of `RemoteCommand`.

- [x] **Step 3: Implement fixed remote scripts**

Add variants:

```ts
| { type: 'tmuxListHostSessions' }
| { type: 'tmuxKillHostSessionByName'; sessionName: string; serverName?: string }
```

The list script must resolve the tmux executable using the existing helper, compute `socket_dir="${TMUX_TMPDIR:-/tmp}/tmux-$(id -u)"`, enumerate only `hobgoblin-project-v1-` plus 24 lowercase hex characters, quote every derived name, and call the established list wrapper. The kill branch validates with shared predicates before shell construction.

- [x] **Step 4: Verify GREEN**

Run: `bun run test -- src/system/ssh/commands.test.ts src/system/remote-terminal.test.ts`

Expected: PASS and existing project-scoped remote list/kill snapshots remain stable.

### Task 4: Add server-owned validation, revalidation, and HTTP contracts

**Files:**

- Create: `src/server/modules/tmux-host-inventory.ts`
- Create: `src/server/modules/tmux-host-inventory.test.ts`
- Modify: `src/shared/tmux-cleanup.ts`
- Modify: `src/server/routes/tmux-cleanup.ts`
- Modify: `src/server/routes/tmux-cleanup.test.ts`
- Modify: `src/web/tmux-cleanup-client.ts`
- Modify: `src/web/tmux-cleanup-client.test.ts`

**Interfaces:**

- Produces: `previewHostTmuxSessions(input)`, `closeHostTmuxSessions(input)`, `/api/tmux-cleanup/host-preview`, and `/api/tmux-cleanup/host-execute`.
- Consumes: Task 2 local adapters and Task 3 SSH operations.

- [x] **Step 1: Write failing server policy tests**

Build valid names with `buildTmuxSessionName` and cover:

- local and SSH host resolution;
- results from multiple project roots;
- rejection of name-only, missing-root, mismatched name, and mismatched scoped-server rows;
- acceptance of a valid default-server row;
- same-name deduplication preferring its deterministic project server;
- stable path/number/name ordering;
- exact name+origin revalidation before close;
- post-preview creation exclusion;
- disappeared selections;
- sequential partial failure;
- Windows-local rejection and malformed input.

Use the exact APIs:

```ts
await previewHostTmuxSessions({ projectRoot: '/work/repo' }, dependencies)
await closeHostTmuxSessions(
  { projectRoot: '/work/repo', approvedSessions: [{ sessionName, serverName }] },
  dependencies,
)
```

- [x] **Step 2: Verify RED**

Run: `bun run test -- src/server/modules/tmux-host-inventory.test.ts`

Expected: FAIL because the module does not exist.

- [x] **Step 3: Implement contracts and host runtime resolution**

Add shared result types:

```ts
export type HostTmuxInventoryResult = { ok: true; sessions: TmuxHostSessionRecord[] } | { ok: false; message: string }

export interface HostTmuxCloseInput {
  projectRoot: string
  approvedSessions: TmuxSessionIdentity[]
}
```

Resolve local versus SSH exactly once. The clicked `projectRoot` is only a host locator; never feed it into session descriptor validation.

- [x] **Step 4: Implement descriptor and origin verification**

Normalize session metadata, recompute both identities, and return a normalized row only when all checks pass:

```ts
const expectedSessionName = buildTmuxSessionName({
  projectRoot,
  workingDirectory: initialPath,
  terminalNumber: session.terminalNumber,
})
const expectedServerName = buildTmuxServerName(projectRoot)
const validOrigin = session.serverName === undefined || session.serverName === expectedServerName
if (session.sessionName !== expectedSessionName || !validOrigin) return null
```

Deduplicate by session name, preferring `serverName === expectedServerName`, then sort by `initialPath`, `terminalNumber`, and `sessionName`.

- [x] **Step 5: Implement bounded exact approvals and sequential close**

Require 1–256 unique approvals. The identity key must encode the explicit legacy origin without colliding with scoped names. Re-list, rebuild the verified identity map, close the intersection sequentially, and return `closed`, `missing`, and `{ session, message }` failures.

- [x] **Step 6: Add thin routes and typed web client**

Routes parse only `projectRoot` and approval objects, pass the request abort signal, and delegate. The client uses `postServerJson` for both endpoints. Add route/client tests for exact body forwarding and non-OK propagation.

- [x] **Step 7: Verify GREEN**

Run: `bun run test -- src/server/modules/tmux-host-inventory.test.ts src/server/routes/tmux-cleanup.test.ts src/web/tmux-cleanup-client.test.ts src/server/app-factory.test.ts`

Expected: PASS.

### Task 5: Add the project context-menu inventory dialog

**Files:**

- Create: `src/web/hooks/useHostTmuxInventory.tsx`
- Create: `src/web/hooks/useHostTmuxInventory.test.tsx`
- Modify: `src/web/components/repo-workspace/SidebarProjectList.tsx`
- Modify: `src/web/components/repo-workspace/SidebarProjectList.test.tsx`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`
- Modify: `src/shared/i18n/dictionaries.test.ts`

**Interfaces:**

- Produces: one menu-compatible `contextAction` plus one `dialog` node per project row.
- Consumes: Task 4 preview and close clients.

- [x] **Step 1: Write failing hook/dialog tests**

Mock only the HTTP client boundary and cover:

- scan failure toast;
- empty inventory toast without a dialog;
- unchecked defaults;
- grouping by exact initial directory;
- session name, terminal number, project root, detached state, and attached count;
- close disabled until selection;
- two independent selections sent with exact origins;
- warning copy;
- closed/missing rows removed and selection reset;
- failed rows retained after partial close;
- pending state preventing duplicate actions;
- local Windows hidden and SSH visible.

- [x] **Step 2: Verify RED**

Run: `bun run test -- src/web/hooks/useHostTmuxInventory.test.tsx`

Expected: FAIL because the hook does not exist.

- [x] **Step 3: Implement focused hook and dialog**

Keep renderer state local:

```ts
const [sessions, setSessions] = useState<TmuxHostSessionRecord[] | null>(null)
const [selected, setSelected] = useState<Set<string>>(() => new Set())
```

Use the shared `Dialog`, `Checkbox`, and `Button` primitives. Group sorted rows by `initialPath`; every checkbox uses destructive styling and an accessible label. The destructive button is disabled when `selected.size === 0` or a request is pending. Closing the dialog clears both inventory and selection.

After close, remove `closed` and `missing` exact identities, retain failures, clear selection, show a complete or partial toast, and close the dialog only when no rows remain.

- [x] **Step 4: Add localized copy**

Add matching keys to all four dictionaries for scan action, empty/error states, title, session/directory/project labels, detached/attached state, warning, selected-count close, and result summaries. English uses sentence case; Chinese uses “扫描主机 tmux 会话” and “关闭所选会话”.

- [x] **Step 5: Wire only the project right-click menu**

In `SortableProjectRow`, create the hook with `{ projectRoot: project.id }`, append its normal `contextAction` before the existing destructive associated-cleanup action, and render its dialog. Do not add it to `WorkspaceListItemMenu` groups.

Update the context-menu test to expect the new action, invoke it without activating/closing the project, and keep More-menu assertions unchanged.

- [x] **Step 6: Verify GREEN**

Run: `bun run test -- src/web/hooks/useHostTmuxInventory.test.tsx src/web/components/repo-workspace/SidebarProjectList.test.tsx src/shared/i18n/dictionaries.test.ts`

Expected: PASS.

### Task 6: Documentation and repository verification

**Files:**

- Modify: `CONTEXT.md`
- Modify: `docs/terminal-tmux-protocol.md`
- Review: `docs/superpowers/specs/2026-07-28-host-tmux-session-inventory-design.md`

**Interfaces:**

- Produces no runtime API; verifies the complete feature and architecture boundaries.

- [x] **Step 1: Confirm domain and protocol documentation**

Ensure the glossary defines host-discoverable sessions and host inventory without implementation detail, while the protocol document owns the exact `@hobgoblin_project_root` option, compatibility behavior, socket-origin validation, and same-user trust boundary.

- [x] **Step 2: Run focused affected tests**

Run:

```sh
bun run test -- \
  src/system/tmux-session.test.ts \
  src/system/tmux-cleanup.test.ts \
  src/system/ssh/commands.test.ts \
  src/server/modules/tmux-cleanup.test.ts \
  src/server/modules/tmux-host-inventory.test.ts \
  src/server/routes/tmux-cleanup.test.ts \
  src/web/tmux-cleanup-client.test.ts \
  src/web/hooks/useHostTmuxInventory.test.tsx \
  src/web/components/repo-workspace/SidebarProjectList.test.tsx \
  src/shared/i18n/dictionaries.test.ts
```

Expected: PASS with no warnings or unhandled errors.

- [x] **Step 3: Run repository quality gates**

Run:

```sh
bun run typecheck
bun run test
bun run check:architecture
git diff --check
```

Expected: all commands exit 0 and architecture boundaries remain green.

- [x] **Step 4: Review final diff without committing**

Confirm no unrelated files, package changes, generated artifacts, real user paths, secrets, or Git operations are present. Report changed files, exact verification evidence, compatibility limitation for pre-metadata sessions, and any remaining risks to the user.
