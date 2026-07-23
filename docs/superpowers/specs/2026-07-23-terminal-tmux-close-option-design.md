# Internal Terminal tmux Close Option Design

## Goal

When a user closes one internal terminal that was created with a Hobgoblin tmux identity, add an optional checkbox to the existing close confirmation dialog so the user can also end that terminal's exact tmux session.

This behavior applies only to closing one internal terminal. Bulk actions such as closing all terminals or closing other terminals retain their current behavior.

## User Experience

- The existing single-terminal close confirmation dialog remains the entry point.
- The dialog shows an “Also close the tmux session” checkbox only when the targeted internal terminal carries a server-issued Hobgoblin tmux session identity.
- The checkbox is unchecked by default and resets to unchecked every time the dialog opens.
- Confirming with the checkbox unchecked preserves the current behavior: Hobgoblin closes its internal terminal and detaches from any surviving tmux session.
- Confirming with the checkbox checked requests termination of only that terminal's exact tmux session.
- If the tmux session has already ended, Hobgoblin treats it as absent and completes the internal-terminal close.
- If the local tmux command or SSH operation fails, Hobgoblin keeps the internal terminal open and reports the error. The user can retry or uncheck the option and close only the internal terminal.
- While the checked close request is running, the confirmation dialog remains pending and cannot submit twice.

## Identity and Eligibility

Eligibility is based on terminal-specific runtime metadata, not on the current local or remote tmux preference.

At terminal creation, the server computes the deterministic `hobgoblin-v1-*` name already used by the tmux launch protocol. That exact name and working directory remain server-owned. The renderer receives only a `tmuxBacked` eligibility indicator.

This preserves correct behavior when:

- the user changes the tmux preference after creating the terminal;
- multiple Hobgoblin tmux sessions use the same working directory; or
- a restored internal terminal reuses its original server-owned session.

A terminal without retained tmux identity does not show the checkbox. This includes plain-shell terminals and local Windows terminals.

## Considered Approaches

### 1. Server-owned terminal-specific tmux identity

Retain the exact deterministic tmux name on the server terminal session, expose only a boolean eligibility state to the renderer, and extend the terminal close mutation with an explicit `closeTmuxSession` intent.

This is the selected approach. It binds the destructive operation to the server-owned terminal, remains correct across preference changes, and prevents one terminal close from targeting another session in the same directory.

### 2. Reuse directory-level associated-session cleanup

The renderer could preview all Hobgoblin tmux sessions whose path matches the terminal directory and try to select one before closing.

This is rejected because a directory may contain several terminal-number sessions. Directory association is appropriate for the explicit item cleanup action but is broader than closing one terminal.

### 3. Infer tmux state from the current preference

The renderer could show the checkbox whenever the current local or remote tmux setting is enabled.

This is rejected because preferences affect new or restarted launches. They do not authoritatively describe an already running terminal and can change after creation.

## Architecture

### Shared terminal contract

The terminal protocol gains an optional `tmuxBacked` boolean on server session summaries; absence is interpreted as false for compatibility with an older runtime during reload. Create responses already include those summaries, so no parallel identity channel is introduced. The close request gains an optional boolean intent to close the associated tmux session, and the close result distinguishes success from a tmux-operation failure.

The client never supplies a tmux name or arbitrary tmux target. It supplies only the server terminal session ID and the close intent.

### Invocation and session metadata

The local and remote managed-terminal invocation builders return the deterministic tmux session name when tmux launch mode is configured, otherwise `null`.

The terminal catalog passes that identity into the terminal session manager. The manager retains it for the lifetime of the server-owned session, projects only `tmuxBacked` in session lists, and preserves the private identity when the terminal is restored or restarted.

### Close orchestration

The terminal close write path performs these steps for a checked request:

1. Validate the client and server terminal session ID.
2. Resolve the server-owned session and its retained tmux identity.
3. Select the local or SSH tmux adapter from the session's repository scope.
4. Revalidate that the retained name matches the current Hobgoblin tmux protocol.
5. End exactly that tmux session by its validated name.
6. Treat an already-missing tmux session as success.
7. Close any remaining server terminal record and publish the existing session invalidation.

If step 3, 4, or 5 fails for a reason other than an already-missing session, the write path returns failure without closing the internal terminal record.

For an unchecked request, the close path remains the current direct internal-terminal close and does not run a tmux command.

### Renderer flow

`TerminalTabs` owns the checkbox state because it already owns the single-terminal confirmation dialog. The pending target session determines whether the checkbox is rendered.

The terminal close callback accepts the explicit close intent. Only the checked path becomes awaitable: checked failures keep the dialog and terminal available and surface an error, while unchecked confirmation preserves the existing immediate local close behavior. Successful closes preserve the existing focus-selection behavior.

The shared `ConfirmCheckbox` component is reused for consistent destructive confirmation styling and accessibility.

## Local and Remote Execution

Local close uses a tmux argument array and targets a server-retained, protocol-validated session name.

Remote close uses the existing typed SSH command boundary. The remote command model validates the Hobgoblin session name before shell quoting and targets the same SSH host used by the internal terminal.

No renderer code constructs shell commands. Local Windows never receives tmux identity because managed local tmux launch is unsupported there.

## Failure and Race Handling

- If tmux exits naturally before confirmation, the normal terminal exit event may remove the tab and close the dialog target.
- If the tmux session disappears between confirmation and execution, the close succeeds as already absent.
- If the internal terminal record disappears before execution, the server returns an idempotent missing result and the renderer removes any stale local projection.
- A checked local-command or SSH failure leaves the internal terminal record and renderer tab intact.
- Killing the tmux session disconnects all other clients attached to that exact session; the checkbox label/help text must make this destructive scope clear.
- No rollback is attempted after tmux reports a successful kill because the attached PTY is expected to exit naturally.

## Safety Properties

- The operation is available only from the existing single-terminal close confirmation.
- The checkbox defaults to unchecked.
- The client cannot read, choose, or alter the tmux target name.
- The server validates the retained name against `^hobgoblin-v1-[a-f0-9]{24}$` before execution.
- Only the exact terminal-specific tmux name is targeted; same-directory sessions are untouched.
- Current preference values do not change existing-terminal eligibility.
- Checked execution failure does not silently degrade into closing only the internal terminal.

## Testing

### System and SSH tests

- Managed local and remote invocation results expose a tmux name only in tmux launch mode.
- Local kill-by-name accepts current-protocol names, classifies already-missing sessions, and rejects other names.
- Typed SSH kill-by-name validates and safely quotes the name.

### Server tests

- Terminal creation, listing, attach, restore, and restart preserve tmux identity.
- Plain-shell and Windows-local sessions expose no tmux identity.
- Unchecked close does not invoke tmux.
- Checked close kills only the server-owned exact name before closing the internal record.
- Already-missing tmux completes the close.
- Local and SSH failures preserve the internal terminal.
- Invalid or client-supplied arbitrary names cannot reach execution.

### Renderer tests

- A plain terminal's single-close dialog has no checkbox.
- A tmux-backed terminal's single-close dialog shows the checkbox unchecked.
- Cancel and reopening reset the checkbox.
- Unchecked confirmation sends the ordinary close intent.
- Checked confirmation sends the tmux-close intent and waits for completion.
- Checked failure leaves the tab available and reports the error.
- Bulk close and close-other dialogs remain unchanged.

### Repository verification

Run:

```sh
bun run typecheck
bun run test
bun run check:architecture
```

## Documentation Impact

- Extend the existing internal-terminal and associated-tmux terminology in `CONTEXT.md` only if implementation introduces a new stable user-facing term.
- Update `docs/terminal-tmux-protocol.md` because the deterministic session identity becomes retained terminal runtime metadata and an exact close target.
- No ADR or persistence migration is required; the metadata is runtime-coherent and reconstructed when server terminal sessions are created.
