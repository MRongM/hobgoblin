# Windows App Backend Shutdown Design

## Goal

When the Windows desktop app closes normally, stop every backend process owned by that app run. This includes the embedded HTTP/WebSocket server, background sync, SSH port forwards, the terminal worker, and non-persistent internal-terminal PTY processes. Standalone server mode and persistent tmux sessions remain outside the desktop app's shutdown scope.

Force termination of the Electron main process and crash recovery are explicitly out of scope.

## Current Behavior and Failure

Electron main already intercepts `before-quit`, flushes window state, and calls `stopEmbeddedServer()`. The embedded server also has runtime teardown for background sync, port forwarding, realtime sockets, and the terminal host.

The ownership chain is:

1. Electron main starts the embedded server.
2. The embedded server starts the terminal worker on demand.
3. The terminal worker starts terminal PTYs.

On Windows, calling `ChildProcess.kill('SIGTERM')` can terminate a child without giving its JavaScript signal handler time to run. The server can therefore disappear before it shuts down the terminal worker, and the terminal host currently sends its worker a shutdown message but immediately kills it. Either path can leave descendants running.

## Considered Approaches

### Directly force-kill the server tree

Run `taskkill /PID <pid> /T /F` during desktop shutdown. This is small and reliably removes descendants while the server is still alive, but it skips the server's existing graceful cleanup and makes every normal quit destructive.

### Windows Job Object

Place desktop-owned children in a kill-on-close Windows Job Object. This also covers main-process crashes, but it needs a native integration and solves a broader lifecycle than requested.

### Graceful IPC with bounded process-tree fallback

Give the embedded server an IPC channel. Electron main sends an explicit shutdown message, and the server awaits its existing teardown before exiting. The terminal host similarly waits for its worker to process the existing shutdown message. Each owner uses a bounded timeout and kills only its directly owned Windows process tree if graceful shutdown stalls.

This is the selected approach because it preserves cleanup semantics while still guaranteeing that normal Windows quit does not leave an owned backend tree behind.

## Design

### Cross-process shutdown contract

Add a small shared lifecycle protocol containing the explicit embedded-server shutdown message and a type guard. Both Electron main and the server import this canonical contract, preserving the existing main/server architecture boundary.

The embedded server child is spawned with Node IPC enabled. Its bootstrap listens for the shutdown message, runs the same idempotent shutdown path used by `SIGINT` and `SIGTERM`, then exits.

### Ordered teardown

The normal Windows shutdown flow is:

1. Electron main finishes renderer notification and window-state flushing.
2. Electron main sends the server shutdown IPC message.
3. Server runtime stops background sync and SSH port forwarding.
4. Server runtime asks the terminal host to shut down and awaits it.
5. The terminal host sends the terminal worker's existing shutdown message.
6. The terminal worker closes realtime terminal state and every managed PTY, then exits.
7. The server closes invalidation WebSockets, HTTP/WebSocket listeners, and remaining sockets, then exits.
8. Electron main observes server exit and completes `app.exit(0)`.

The async teardown propagates only through lifecycle APIs: `ServerTerminalHost.shutdown`, `ServerRuntime.shutdown`, and server bootstrap shutdown. Synchronous test or in-process terminal facades remain valid through the existing maybe-promise convention.

### Bounded fallback

Add one system-level process-tree termination helper:

- On Windows, invoke `taskkill.exe` with the exact positive PID plus `/T /F`.
- On other platforms, keep the existing direct signal behavior.
- Treat an already-exited process as successful cleanup.
- Never match by executable name, path, or port; only the PID captured from the app-owned child is eligible.

Electron main waits for graceful server exit before using the fallback. The server terminal host separately waits for graceful worker exit before using the same fallback, preventing a worker that ignores shutdown from becoming orphaned before the server exits.

All waits are bounded so a stuck backend cannot block normal app exit indefinitely.

## Safety and Scope

- Only descendants spawned by the current desktop app instance are targeted.
- A standalone browser-mode server is not tracked by Electron main and is never stopped.
- Persistent tmux sessions are not backend service processes owned by the desktop lifecycle and remain available after app exit.
- No process-name-wide `taskkill`, port scan, or unrelated process cleanup is allowed.
- No new package dependency is required.

## Testing

- Shared protocol tests reject malformed messages.
- Server bootstrap tests prove the IPC message uses the graceful shutdown-and-exit path.
- Server runtime tests prove async terminal-host teardown is awaited and remains idempotent.
- Terminal worker-host tests prove graceful exit avoids force-kill and timeout invokes the exact owned-tree fallback.
- Main server-manager tests prove graceful IPC is sent, normal exit resolves, and Windows timeout delegates to the exact PID fallback.
- Run `bun run typecheck`, `bun run test`, and `bun run check:architecture`.

## Success Criteria

- Closing the Windows app normally leaves no embedded server, terminal worker, managed PTY, background sync, or SSH forwarding process from that app run.
- Normal cleanup runs before forced termination.
- Shutdown remains bounded when a child is unresponsive.
- Standalone server mode, unrelated processes, and persistent tmux sessions are untouched.
