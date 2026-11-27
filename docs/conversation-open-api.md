# Hobgoblin OpenAPI

The Hobgoblin HTTP server publishes an OpenAPI 3.1.1 document at `GET /api/open/v1/openapi.json`. The document is available without a token.

In the desktop app or a signed-in Web session, open **Settings → LAN → OpenAPI key** and select **Generate key**. On a standalone server, enable Web access protection with administrator credentials before signing in to manage keys from the browser. Copy the key while it is displayed. It takes effect immediately and survives server restarts. Regenerating it invalidates the previous key.

Send the same key in `Authorization: Bearer <key>` for conversation, message, and terminal control requests. It grants access to conversations and to the keyboard of open terminals, including the ability to run commands as the terminal user. Use HTTPS and keep the key limited to trusted clients.

For upgrades from the two-key version, an existing terminal control key becomes the single key for all routes. A deployment with only a conversation key keeps conversation access until a new key is generated in Settings.

## Workspaces, background sessions, and terminals

Android and other clients use `/api/open/v1` as the base path. A client can start an interactive AI session in a terminal or use a background session with structured messages.

| Operation                                              | HTTP operation under `/api/open/v1`                                          |
| ------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Find the projects currently open in Hobgoblin          | `GET /workspaces`                                                            |
| Choose a particular worktree                           | `GET /workspaces/{workspaceId}/worktrees`                                    |
| Discover worktrees and registered subworkspaces        | `GET /workspaces/{workspaceId}/targets`                                      |
| Read a page of AI session summaries across open projects | `GET /sessions`                                                            |
| Find background AI sessions and open desktop terminals | `GET /workspaces/{workspaceId}/sessions`                                     |
| Read a recent excerpt from an open terminal            | `GET /workspaces/{workspaceId}/terminals/{terminalId}`                       |
| Close an open terminal                                 | `DELETE /workspaces/{workspaceId}/terminals/{terminalId}`                    |
| Send text or keys to the same terminal                 | `POST /workspaces/{workspaceId}/terminals/{terminalId}/input`                |
| Start Codex or Claude in an interactive terminal       | `POST /workspaces/{workspaceId}/terminal-sessions`                           |
| Start a background session                             | `POST /workspaces/{workspaceId}/sessions`                                    |
| Submit a follow-up to the same background session      | `POST /sessions/{sessionId}/turns`                                           |
| Check a turn or read all conversation messages         | `GET /sessions/{sessionId}/turns/{requestId}` or `GET /sessions/{sessionId}` |
| Check for changes without loading message history      | `GET /sessions/{sessionId}/status`                                           |
| Cancel a running turn                                  | `DELETE /sessions/{sessionId}/turns/{requestId}`                             |
| Close a background session                             | `DELETE /sessions/{sessionId}`                                               |

To start a background session, send `mode: "background"`, `provider`, `prompt`, and a newly generated UUID as `requestId`, plus `worktreeId` when selecting a particular worktree. The background endpoint returns `400` if the mode is missing or has a different value. For follow-ups, send `prompt` and a new `requestId`. Each accepted prompt returns `202` and a `Location` header. Poll that route until the turn is `completed`, `failed`, or `cancelled`. When completed, fetch the session to obtain the complete reply. Reuse the same `requestId` when retrying an uncertain submission. A `409` with `session_working` means the current turn is still running or its provider process is winding down.

Use `GET /workspaces/{workspaceId}/targets` to find execution locations for a background session. It returns project worktrees and registered subworkspaces with their folder root and current Git members. Pass the selected location ID as `worktreeId`. An unavailable registered folder has a null `root`.

While a conversation is open, clients can use `GET /sessions/{sessionId}/status` to detect another client's update and fetch the message history only when it changes.

Hob AI lists sessions through `GET /sessions?native=1`. The response includes up to 30 summaries by default, the open workspace catalog, and a `nextCursor` for older summaries. Pass the cursor back to load the next page or use `q` to search the retained sessions. Open `/sessions/{sessionId}` to fetch message history.

When a desktop terminal resumes a shared conversation, `terminalActive` is `true`. All clients can read its history as completed desktop turns are saved. Follow-up requests return `409` with `desktop_terminal_active`. After the terminal exits and the final history is saved, `terminalActive` becomes `false` and clients can submit the next turn.

Hob AI uses `?native=1` to discover local Codex threads in an open project's registered work locations. Add `&refresh=1` to a workspace session listing to request an immediate scan. Opening a synced session with `GET /sessions/{sessionId}?native=1` reads the retained text turns for its original Codex thread ID. The local Codex client and the Hob server use the same Codex home.

A synced native session has `nativeCodex: true`. An idle thread connected to the shared local Codex App Server also has `terminalWritable: true`. Submit a follow-up with `POST /sessions/{sessionId}/turns?native=1` to send it to that thread. The reply appears in the existing terminal and is available through the history API. An unavailable terminal returns `native_terminal_unavailable`. For an uncertain delivery, use the same request ID when checking or retrying and inspect the conversation before issuing a new one. Deleting the synced record hides it from automatic discovery. Its transcript remains in Codex.

Hobgoblin starts the installed AI CLI on the host that owns the worktree. Keep the CLI signed in there and grant any required tool permissions in that CLI. Background sessions continue while the client is disconnected and the Hobgoblin server is running. Cancel the specific turn URL to stop its provider and keep its recorded prompt. Closing a session also cancels its active turn, removes the session from workspace lists, and keeps its history readable with status `closed`.

`DELETE /conversations/{conversationId}` permanently removes the conversation from Hob. After user confirmation, append `?mode=stop-background` to cancel a running managed background task and delete its record. For a desktop Codex conversation, use `?mode=remove-desktop-copy` to delete its Hob record and prevent automatic rediscovery. The original Codex thread and any running desktop turn are preserved.

Send a complete keyboard sequence in `data` with a new UUID as `requestId`. Use `\r` for Enter and `\u0003` for Ctrl+C in JSON. The server coordinates each write with other clients on that terminal. It returns `409` with `interactive_input_active` if a desktop or Web client sent input in the last two seconds, or `control_in_use` if an explicit lease is active. A quiet period only measures recent input. Check the terminal before sending input that could submit or modify an unfinished command.

A `202` with `{"accepted":true,"delivery":"unconfirmed"}` means the server handed the input to the PTY write API. Check recent terminal output to see whether the application acted on it. If a response is lost or returns `503 input_delivery_unknown`, retry the same request ID and data on the same terminal within five minutes to retrieve the recorded result without submitting the input twice. The server retains up to 1024 attempts per terminal in that window and returns `409 control_limit` when the limit is reached. After five minutes, inspect the terminal before deciding what to send next.

Existing clients can still acquire, write under, and release an explicit lease using the `/control` routes. Those leases last five minutes. Closing an ordinary terminal closes its Hobgoblin connection and detaches any backing tmux session.

### Terminal records

Use `GET /terminal-records` to read terminal worker records on the Hob host. The endpoint returns `records` and `nextCursor` in descending registration order. The default page size is 30 and `limit` accepts 1 through 100. Pass the returned `nextCursor` back as `cursor` with the same filters. Filter by `workspaceId` or by `state=running` for `opening`, `restarting`, and `open` records, or `state=exited` for `closed`, `error`, and `interrupted` records.

The record `id` is stable for the lifetime of a managed terminal, including an explicit restart. `executionId` identifies its latest PTY launch attempt. A worker loss marks its live records as `interrupted`. Opening a new terminal after worker replacement creates a new record. The terminal worker records a logical working directory, backend, and any explicitly launched AI provider. Each change advances the record `revision` and commits a lifecycle event at `lastEventSeq` in the same SQLite transaction. The registry starts recording from the first worker launch with this version. It exposes lifecycle metadata for worker-managed internal terminals.

The lifecycle event log has a seven-day retention window. A terminal record keeps its latest state and event sequence after earlier events expire. Structured conversation history follows its separate 30-day policy.

Each record includes the most recent terminal title when the worker observed one. Older records or terminals without a custom title use a null value.

### Terminal transcript

`GET /terminal-records/{terminalId}/transcript` requires the unified OpenAPI key. Without a cursor it returns the latest page of readable PTY lines, oldest first within the page. Use `beforeSeq` with the first displayed line to page toward older output. Use `afterSeq` with the last response's `nextAfterSeq` to resume after it. Both cursors are exclusive. `limit` defaults to 100 and accepts up to 200. `hasMoreBefore` and `hasMoreAfter` indicate additional pages in the requested direction.

Lines include the execution ID, output sequence, text, and truncation flag. Output sequence numbers belong to the transcript. A null line with `truncated: true` marks dropped capture output. `gap: true` marks a portion removed by retention at the start of the requested range. The optional `tail` displays the current unfinished line and has no cursor. It becomes a sequenced line when completed or the execution ends.

The Hob host retains up to 20,000 lines, 4 MiB per terminal, and 128 MiB across terminals. The byte budgets account for UTF-8 text and per-row overhead. Hob AI for Android shows this data in **Terminals**, uses the configured foreground refresh interval and pull-to-refresh, and saves only the output cursor for each terminal. Output received by the client is held in memory.

### Open terminals and interactive AI sessions

Use `GET /workspaces/{workspaceId}/terminals` to list open terminals and `POST` to the same path to create one. Send a JSON object with an optional `worktreeId` from the worktree listing. The default is the primary workspace directory. Send `launchMode: "tmux-if-available"` to use the existing tmux backend, or omit it for the native backend. A Windows project uses the configured shell preference. Specify `windowsInternalTerminalShell: "wsl"` or `"powershell"` to override it for this terminal. SSH and WSL workspaces run the terminal on their selected host or distribution.

Interactive Codex and Claude sessions run in dedicated terminals. They use the CLI installed and signed in on the selected host, and the workspace's ordinary terminal controls are also available for these terminals.

| Operation                                                                                             | Path under `/api/open/v1`                                             |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Start a session with `{"provider":"codex"}` or `{"provider":"claude"}` and optional terminal settings | `POST /workspaces/{workspaceId}/terminal-sessions`                    |
| List open interactive sessions                                                                        | `GET /workspaces/{workspaceId}/terminal-sessions`                     |
| Read the recent visible output                                                                        | `GET /workspaces/{workspaceId}/terminal-sessions/{terminalId}`        |
| Send instructions or keys with `requestId` and `data`                                                 | `POST /workspaces/{workspaceId}/terminal-sessions/{terminalId}/input` |
| End the session and close its terminal                                                                | `DELETE /workspaces/{workspaceId}/terminal-sessions/{terminalId}`     |

Both creation operations return `201` and a `Location` header. If a creation response is lost, list current terminals before submitting another creation. The session detail includes up to 8192 characters of terminal output. Ending a managed tmux session closes its backing tmux session. Ordinary tmux terminals retain the existing detach behavior.

AI processes started manually in an existing terminal are accessible through that terminal's output and control routes. Interactive session listing and ending apply to the dedicated sessions launched through the OpenAPI. Background sessions and their structured message history remain available through the background session routes.

### Unified sessions and terminal control

Session summaries include a revision, a mode, and an optional terminal link with its execution ID and source. An explicit launch creates a session as the terminal opens. The worker also recognizes Codex or Claude from its foreground process name or an identified terminal title. To associate an open terminal manually, send a provider to `POST /terminal-records/{terminalId}/session`. For a local Codex terminal, include its `providerSessionId` to verify its working directory and attach its stored structured history.

`GET /sessions/{sessionId}/messages` and `GET /sessions/{sessionId}/turns` return complete structured entries, ordered oldest first within each page. Pass the returned `nextCursor` to `beforeSeq` to read earlier entries. Each newly recorded message includes its `turnRequestId`. Earlier messages can have a null turn ID.

Submit a structured turn through `POST /sessions/{sessionId}/turns`. Hob routes it to the background provider or a connected, verified Codex thread based on the selected session. A new write may provide `expectedRevision`. A stale revision returns HTTP 409 with the current session. Repeat the same request ID and prompt to recover the original submission.

Use `GET /sessions/{sessionId}/control` to read the linked execution and its controller. `POST` on the same address acquires a five-minute lease. Send input through `POST /sessions/{sessionId}/input` using `requestId`, `data`, and an optional `controlId`. Conflicts include the current session and controller when available. `DELETE /sessions/{sessionId}/control/{controlId}` releases the lease. Android can send text or Ctrl+C from the linked terminal's detail screen.

### OpenAI Chat Completions compatibility

`POST /chat/completions` accepts non-streaming text requests with `model` set to `codex` or `claude`. Supply `metadata.hob_workspace_id` and optionally `metadata.hob_worktree_id` to create a background session. Supply `metadata.hob_session_id` to continue a background session with the same provider. Continuing an existing session uses the final user message as the next turn. Use `metadata.hob_request_id` to retry the same request without running a second turn.

The response follows the Chat Completions text response format and supplies the Hob session and request IDs in headers. If a turn is still running after 30 seconds, the response returns HTTP 504 with a `Location` header for the native turn resource. [OpenAI Chat Completions reference](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)

## Connect Meta Muse

Create a private custom connector named **Hobgoblin** using `https://hobgoblin.example/api/open/v1/muse/openapi.json`. Use the server origin for the connector and supply the OpenAPI key as its Bearer token through the secure credential setup.

The Muse schema guides the connector to use an interactive terminal by default. It keeps the existing `/api/open/v1/muse` workspace, session, and terminal URLs for existing connector configurations and shares their records with the general OpenAPI.

## Resources

| Path relative to `/api/open/v1`                        | Methods                  | Behavior                                                                                                     |
| ------------------------------------------------------ | ------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `/conversations`                                       | `GET`, `POST`            | List summaries with optional `provider`, `terminalSessionId` and `status` filters, or create a conversation. |
| `/conversations/{conversationId}`                      | `GET`, `PATCH`, `DELETE` | Read the complete conversation, update its metadata, or delete it and all its messages.                      |
| `/conversations/{conversationId}/messages`             | `GET`, `POST`            | List all messages in insertion order or append a complete message.                                           |
| `/conversations/{conversationId}/messages/{messageId}` | `GET`, `PATCH`, `DELETE` | Read, update, or delete a message.                                                                           |

- Set `provider` to `codex` or `claude` when creating a conversation. Use `PATCH` for `title`, `terminalSessionId` and `status`. `null` clears the title or terminal association.
- The conversation starts in `ready` unless the writer supplies `working`. The terminal ID and status reflect the most recent values written to the record.
- Send message text in `content` with a `role` of `user` or `assistant`. The API preserves whitespace and line breaks. A message edit keeps its place in the conversation.
- `POST` returns `201` and the new resource URL in `Location`. `DELETE` returns `204`. Each JSON request body can be up to 8 MiB.
- The server keeps a rolling 30-day history in `conversation-open-api/conversations.sqlite` under its data directory. Messages and turns expire 30 days after creation. A conversation and its background session expire after 30 days without an update. The server checks for expired rows on startup, every minute while running, and before serving a request when a row is due to expire.
- Terminal excerpts come from the worker's in-memory terminal buffer. Each conversation detail request returns the retained messages as ordinary JSON.

## Retrieve a conversation

Set `GOBLIN_CONVERSATION_URL` by combining the server origin with the `Location` path returned by the create request. Read the bearer token from the client's secret storage into `HOBGOBLIN_OPEN_API_KEY` for this command.

```sh
curl --fail-with-body \
  --header "Authorization: Bearer ${HOBGOBLIN_OPEN_API_KEY}" \
  "${GOBLIN_CONVERSATION_URL}"
```

The response includes `provider`, `status`, `terminalSessionId` and the complete `messages` array. Render `messages` in the order returned and use `role` to pick the conversation bubble style.

## Take over a running terminal

1. Read the conversation with the OpenAPI key and keep its `terminalSessionId`.
2. Send `POST /api/open/v1/conversations/{conversationId}/control` with `{"terminalSessionId":"session_example_01"}`, using the actual ID from the conversation. The server confirms the link and returns `controlId` and `expiresAt`.
3. Send `POST /api/open/v1/conversations/{conversationId}/control/{controlId}/input` with `{"data":"Example prompt\r"}`. `data` is terminal keyboard input. `\r` sends Enter. A `202` response confirms the input was queued.
4. Send `DELETE /api/open/v1/conversations/{conversationId}/control/{controlId}` to release control. The previous controller regains control if it is still connected and no other client has already taken over.

Control expires after five minutes. The desktop client can take it back at any time. A `409` response indicates a stale link, a terminal that is unavailable, or control that is held by another API client or has ended. The terminal process continues to run across ownership changes. Its output follows the existing terminal channel, and the conversation history is written through the message API.
