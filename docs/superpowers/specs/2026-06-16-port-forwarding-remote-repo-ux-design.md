# Remote Repository Port Forwarding UX Design

## Goal

Optimize SSH local port forwarding for remote repositories by reducing the form to the decisions users actually need:

- Local port.
- Remote port.
- Whether the forwarded local port should be reachable from the LAN.

Users should no longer type a local bind host or a remote host. The local bind host is derived from a LAN access toggle, and the remote host is fixed to the remote machine loopback address.

## Scope

In scope:

- Remove local bind host input from the `Ports` start form.
- Remove remote host input from the `Ports` start form.
- Add an `Allow LAN connections` toggle.
- Submit `localBindHost: "127.0.0.1"` when the toggle is off.
- Submit `localBindHost: "0.0.0.0"` when the toggle is on.
- Submit `remoteHost: "127.0.0.1"` for every start request.
- Make local port required in the UI.
- Make remote port default to the local port.
- Let users edit remote port after the default is filled.
- Keep active session rows showing the real forwarding relationship.

Out of scope:

- Persisted port-forward presets.
- Remembering the LAN toggle between app launches.
- Reverse forwarding, SOCKS forwarding, or dynamic forwarding.
- Changing the server API shape.
- Removing host support from the shared or server model.
- Background tunnels that outlive the owning repository tab.

## Product Behavior

The `Ports` tab remains in the repository Explorer area for remote repositories.

The start form becomes:

```text
Local port | Remote port | Allow LAN connections | Forward
```

Local port is the primary input. Remote port follows it by default:

1. Initial local port and remote port are empty.
2. When the user types a local port and remote port has not been manually edited, remote port is set to the same value.
3. When the user clears local port and remote port is still following, remote port is also cleared.
4. Once the user edits remote port, later local port edits do not overwrite remote port.

LAN access is explicit:

- Off: bind to `127.0.0.1`.
- On: bind to `0.0.0.0` and show the existing non-loopback warning.

Remote host is fixed to `127.0.0.1` because the common workflow is exposing a service running on the SSH remote itself, such as a remote dev server listening on localhost.

Session rows continue to show:

```text
localBindHost:actualLocalPort -> remoteHost:remotePort
```

This keeps the runtime result visible even though host fields are not editable in the form.

## Architecture

Keep the existing port-forwarding feature slice:

- `src/web/components/repo-workspace/ProjectPortsPanel.tsx`
  - Owns form-local interaction state.
  - Stores `allowLanAccess` as React local state.
  - Derives `localBindHost` at submit time.
  - Sends `remoteHost: "127.0.0.1"` at submit time.
  - Tracks whether remote port is still following local port.
- `src/shared/port-forwarding.ts`
  - Keeps the existing generic request shape and normalization.
  - Continues validating host and port values for API compatibility.
- `src/server/modules/port-forwarding.ts`
  - Keeps session lifecycle ownership unchanged.
  - Continues resolving remote repository aliases, reserving local ports, and starting SSH.
- `src/system/ssh/port-forward.ts`
  - Keeps generating OpenSSH arguments from normalized values:

    ```text
    ssh -N -L localBindHost:localPort:remoteHost:remotePort -- alias
    ```

This design keeps product-specific simplification in the renderer UI while preserving the stable lower-level boundary. It avoids a new API version and does not remove currently tested host handling.

## Validation And Errors

UI validation:

- Local port is required and must be an integer in `1..65535`.
- Remote port is required and must be an integer in `1..65535`.
- Host validation remains in the shared model but is not user-facing in the form.

Submit behavior:

- The UI no longer submits `localPort: null`.
- The request uses the entered local port as `localPort`.
- The request uses the entered remote port as `remotePort`.

Error handling stays unchanged:

- Invalid port input uses the existing `error.invalid-port` path.
- Start failures continue to show the current start-failed detail.
- SSH config drift continues to return `error.ssh-config-changed`.

## Testing

Renderer tests should cover:

- Remote form no longer renders `localBindHost` and `remoteHost` inputs.
- Entering local port `3000` fills remote port `3000` while remote port is following.
- Editing remote port breaks following.
- After remote port is manually edited, changing local port does not overwrite it.
- Submitting with LAN access off sends:

  ```ts
  {
    localBindHost: '127.0.0.1',
    localPort: 3000,
    remoteHost: '127.0.0.1',
    remotePort: 3000,
  }
  ```

- Submitting with LAN access on sends `localBindHost: '0.0.0.0'`.
- LAN access on shows the non-loopback warning.

Existing shared, server, and system tests should mostly remain valid because the lower-level request model keeps host support. Only UI expectations around optional local port and host fields should change.

## Principles

- KISS: collapse two host text fields into one explicit LAN access toggle and one fixed remote host.
- YAGNI: do not add presets, remembered defaults, or a new API shape.
- DRY: keep host normalization and SSH argument construction in the existing shared/system boundaries.
- SOLID: keep UI interaction state in the renderer, validation in shared code, session lifecycle in the server module, and process spawning in the system layer.
