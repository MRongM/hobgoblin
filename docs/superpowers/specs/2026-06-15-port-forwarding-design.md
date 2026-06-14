# Remote Port Forwarding Design

## Goal

Add a `Ports` tab to the repository Explorer area so users can expose a service running on an SSH remote host through a local port. The first implementation supports SSH local forwarding only:

```text
localBindHost:localPort -> remoteHost:remotePort
```

This covers the common workflow of opening a remote development service, for example `http://localhost:3000`, from the local browser.

## Scope

In scope:

- Add `Ports` as a fourth Explorer tab next to `Files`, `Changes`, and `Status`.
- Support remote repositories opened through existing `~/.ssh/config` aliases.
- Start and stop SSH local port forwards owned by the current repository tab.
- Default local bind host to `127.0.0.1`.
- Allow explicit non-loopback local bind hosts such as `0.0.0.0`.
- Default remote service host to `127.0.0.1`.
- Allow remote service host input for remote-reachable hostnames or IP addresses.
- Default the requested local port to the remote port.
- If the requested local port is occupied, automatically allocate an available local port and show the actual port.
- Show active, starting, failed, and stopped session snapshots.
- Provide Copy URL, Open URL, and Stop actions.
- Stop all sessions owned by a repository when that repository tab is closed or removed.

Out of scope:

- Remote forwarding (`ssh -R`).
- SOCKS or dynamic forwarding (`ssh -D`).
- Persisted port-forward presets.
- Restoring tunnel sessions after app restart.
- Background tunnels that outlive the owning repository tab.
- Sharing one tunnel session across multiple repositories.

## UI Placement

`RepoExplorerPane` keeps the current split: branch list on one side and Explorer content on the other. The Explorer content gains a fourth tab:

```text
Files | Changes | Status | Ports
```

`Ports` is an Explorer tab rather than a file tree subpanel or a detail-area tab. This keeps tunnel lifecycle visible near the project tree without widening the file tree component's responsibilities or competing with the terminal detail area.

For local repositories, `Ports` renders a compact empty state explaining that SSH port forwarding is available only for remote repositories. For remote repositories, the panel renders:

- A compact start form.
- A warning row when local bind host is not loopback.
- A session list for the current repository.

The form fields are:

| Field | Default | Rule |
| --- | --- | --- |
| Local bind host | `127.0.0.1` | Required host token; non-loopback is allowed but explicit. |
| Local port | Remote port | Optional before normalization; if occupied, app assigns an available port. |
| Remote host | `127.0.0.1` | Required host token. |
| Remote port | none | Required `1..65535`. |

Each session row shows:

```text
localBindHost:actualLocalPort -> remoteHost:remotePort
status
Open | Copy URL | Stop
```

The local URL uses `http://` and the actual local bind host and port. If the bind host is `0.0.0.0`, Copy/Open should use a browser-safe local URL such as `http://127.0.0.1:<port>` while still displaying the bound address in the session row.

## Architecture

Add a focused port-forwarding feature slice:

- `src/shared/port-forwarding.ts`
  - Shared request/result/session types.
  - Host and port validation.
  - Request normalization.
  - Local URL formatting.
- `src/system/ssh/port-forward.ts`
  - Builds system SSH arguments.
  - Starts `ssh -N -L ... -- <alias>`.
  - Owns low-level child process handles.
  - Does not know about repository UI state.
- `src/server/modules/port-forwarding.ts`
  - Runtime manager.
  - Owns in-memory session state.
  - Resolves remote repository aliases through existing SSH config helpers.
  - Starts, stops, lists, and cleans up sessions.
- `src/server/routes/port-forwarding.ts`
  - Thin route boundary for list/start/stop/stop-for-repo.
- `src/web/port-forwarding-client.ts`
  - Renderer HTTP client.
- `src/web/components/repo-workspace/ProjectPortsPanel.tsx`
  - Explorer tab UI.

The feature should not be added to `src/system/ssh/commands.ts`. That module models short-lived remote commands. Port forwarding is a long-lived runtime session and needs a separate lifecycle boundary.

## Data Model

Shared types:

```ts
export type PortForwardSessionStatus = 'starting' | 'active' | 'failed' | 'stopped'

export interface PortForwardStartRequest {
  repoId: string
  localBindHost?: string
  localPort?: number | null
  remoteHost?: string
  remotePort: number
}

export interface PortForwardSessionSnapshot {
  id: string
  repoId: string
  localBindHost: string
  requestedLocalPort: number | null
  actualLocalPort: number | null
  remoteHost: string
  remotePort: number
  status: PortForwardSessionStatus
  localUrl: string | null
  message?: string
  createdAt: string
  updatedAt: string
}
```

`requestedLocalPort` preserves the user's intent. `actualLocalPort` is the real bound port and may differ after conflict fallback.

Sessions are runtime-only. They are not stored in repo state, settings, or disk-backed app data.

## Start Flow

1. `ProjectPortsPanel` normalizes form values on submit.
2. Renderer calls `POST /api/port-forwarding/start`.
3. Route validates the request shape and delegates to the manager.
4. Manager requires `repoId` to be an SSH remote repo id.
5. Manager parses the repo id and resolves the SSH alias using existing config resolution. SSH config drift returns `error.ssh-config-changed`.
6. Manager creates a `starting` session.
7. Manager asks the system layer to start:

   ```text
   ssh -N -L localBindHost:localPort:remoteHost:remotePort -- alias
   ```

8. If the requested local port is occupied, the manager allocates an available local port and retries once.
9. On success, the session becomes `active` and records `actualLocalPort`.
10. On failure, the session becomes `failed` with a safe summary message.
11. UI refreshes the list after start.

The system layer should build arguments as an array, not a shell string. This avoids shell quoting issues and keeps host validation simple.

## Stop And Cleanup Flow

Stopping a session:

1. UI calls `POST /api/port-forwarding/stop`.
2. Manager finds the session.
3. Manager terminates the child process if it is still running.
4. Session becomes `stopped`.
5. UI refreshes the list.

Repository cleanup:

- When a repository tab is closed or removed, the renderer calls `stop-for-repo`.
- Server runtime shutdown also stops all active port-forwarding children.

Child exit handling:

- If the user stopped the session, exit maps to `stopped`.
- If the SSH process exits while the session is active or starting, it maps to `failed`.
- The session remains visible so the user can see what happened.

## Validation And Safety

Host validation:

- Required after trimming.
- Reject NUL and control characters.
- Reject whitespace.
- Reject `:` because `ssh -L` uses colon-delimited fields.
- Keep validation intentionally narrow; do not try to fully parse DNS, IPv4, or IPv6 in the first implementation.

Port validation:

- `remotePort` must be an integer in `1..65535`.
- `localPort`, when provided, must be an integer in `1..65535`.
- Empty local port means "use remote port first, then fallback if occupied".

Local bind host safety:

- Default is `127.0.0.1`.
- Non-loopback bind hosts are allowed only when the user enters or selects them explicitly.
- UI displays a warning that non-loopback binding may expose the forwarded service to the local network.

Remote host safety:

- Default is `127.0.0.1`.
- The app does not verify whether the host exists before starting SSH. SSH reports the connection behavior.

Process safety:

- Use child process argument arrays.
- Do not persist SSH command lines containing user input.
- Do not run a shell for forwarding.
- Stop all active child processes on server shutdown.

## API

Routes under `/api/port-forwarding`:

```text
POST /list
POST /start
POST /stop
POST /stop-for-repo
```

`list` input:

```ts
{ repoId: string }
```

`start` input is `PortForwardStartRequest`.

`stop` input:

```ts
{ id: string }
```

`stop-for-repo` input:

```ts
{ repoId: string }
```

Route files stay thin: parse simple body fields, call the manager, return JSON fallback on unexpected exceptions.

## Error Handling

Expected messages:

- `error.invalid-arguments`
- `error.invalid-host`
- `error.invalid-port`
- `error.ssh-config-changed`
- `error.port-forward-start-failed`
- `error.port-forward-not-found`

SSH stderr should be summarized and capped before returning to the renderer. The UI should show the translated generic error plus a compact detail line when available.

Local port conflicts are not surfaced as hard errors when fallback succeeds. The UI shows the actual port so the user can copy or open the correct URL.

## UI State And Refresh

The first version can use simple refetch behavior:

- Fetch sessions when `Ports` tab becomes active.
- Refetch after start and stop.
- Poll while the `Ports` tab is visible so unexpected child exits become visible.

This avoids adding realtime infrastructure for a small runtime surface. If port sessions later need global indicators, the feature can add server invalidation or realtime events behind the same client boundary.

## Testing

Shared model tests:

- Host accepts ordinary hostnames and IPv4-like strings.
- Host rejects blanks, whitespace, control characters, NUL, and colon.
- Port accepts `1..65535` and rejects invalid values.
- Request normalization applies defaults.
- URL formatting uses `127.0.0.1` for browser URL when local bind host is `0.0.0.0`.

System tests:

- SSH argument construction for default and custom hosts.
- No shell string is used for process spawning.
- Child process stop contract.
- Port conflict detection fallback uses a new local port.

Server manager tests:

- Remote repo requirement.
- SSH config drift handling.
- Start/list/stop lifecycle.
- Failed starts remain visible.
- Child exit updates session status.
- `stopForRepo` stops only matching repo sessions.
- `shutdown` stops active sessions.

Route/client tests:

- Body parsing and invalid fallback.
- Client functions call the correct endpoints.

Component tests:

- Explorer renders the `Ports` tab.
- Local repo shows the SSH-only empty state.
- Remote repo shows the start form.
- Non-loopback local bind host shows a warning.
- Successful start refreshes the session list.
- Session row renders actual local port, Copy URL, Open URL, and Stop.
- Failed session renders the error message.

## Principle Notes

- KISS: use system SSH, a small manager, and polling instead of adding a new SSH library or realtime channel.
- YAGNI: no persisted presets, reverse forwarding, SOCKS forwarding, or background tunnels.
- DRY: reuse existing remote repo id parsing and SSH config resolution instead of adding a second remote identity model.
- SOLID: keep UI, route boundary, runtime manager, and system child-process launching in separate units with narrow responsibilities.
