# Conversation OpenAPI

The Hobgoblin HTTP server publishes an OpenAPI 3.1.1 document at `GET /api/open/v1/openapi.json`. The document is available without a token.

In the desktop app or a signed-in Web session, open **Settings → LAN → OpenAPI key** and select **Generate key**. On a standalone server, enable Web access protection with administrator credentials before signing in to manage keys from the browser. Copy the key while it is displayed. It takes effect immediately and survives server restarts. Regenerating it invalidates the previous key.

Send the same key in `Authorization: Bearer <key>` for conversation, message, and terminal control requests. It grants access to conversations and to the keyboard of open terminals, including the ability to run commands as the terminal user. Use HTTPS and keep the key limited to trusted clients.

For upgrades from the two-key version, an existing terminal control key becomes the single key for all routes. A deployment with only a conversation key keeps conversation access until a new key is generated in Settings.

## Connect Meta Muse or a personal bot

Ask Muse to create a private custom connector named **Hobgoblin**. Give it `https://hobgoblin.example/api/open/v1/muse/openapi.json`, replacing the example origin with your server address. Set that same origin for the connector and use the secure credential setup to supply your OpenAPI key as the Bearer token. A personal bot can use the same tool schema.

Use an interactive terminal session by default for Codex or Claude. To start a new session, call `POST /workspaces/{workspaceId}/terminal-sessions` with the provider, then send the prompt to the new terminal's `/input` route. Use a background session only when the user explicitly requests background execution or chooses an existing background session to continue.

| What the bot wants to do                               | HTTP operation under `/api/open/v1/muse`                                          |
| ------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Find the projects currently open in Hobgoblin          | `GET /workspaces`                                                                 |
| Choose a particular worktree                           | `GET /workspaces/{workspaceId}/worktrees`                                         |
| Find background AI sessions and open desktop terminals | `GET /workspaces/{workspaceId}/sessions`                                          |
| Read a recent excerpt from an open terminal            | `GET /workspaces/{workspaceId}/terminals/{terminalId}`                            |
| Close an open terminal                                 | `DELETE /workspaces/{workspaceId}/terminals/{terminalId}`                         |
| Send text or keys to the same terminal                 | `POST /workspaces/{workspaceId}/terminals/{terminalId}/input`                     |
| Start Codex or Claude in an interactive terminal       | `POST /workspaces/{workspaceId}/terminal-sessions`                                |
| Start a background session when explicitly requested  | `POST /workspaces/{workspaceId}/sessions`                                         |
| Submit a follow-up to the same background session      | `POST /sessions/{sessionId}/turns`                                                |
| Check a turn or read all conversation messages         | `GET /sessions/{sessionId}/turns/{requestId}` or `GET /sessions/{sessionId}`      |
| Cancel a running turn                                  | `DELETE /sessions/{sessionId}/turns/{requestId}`                                  |
| Close a background session                             | `DELETE /sessions/{sessionId}`                                                    |

To start a background session, send `mode: "background"`, `provider`, `prompt`, and a newly generated UUID as `requestId`, plus `worktreeId` when selecting a particular worktree. The background endpoint returns `400` if the mode is missing or has a different value. For follow-ups, send `prompt` and a new `requestId`. Each accepted prompt returns `202` and a `Location` header. Poll that route until the turn is `completed`, `failed`, or `cancelled`. When completed, fetch the session to obtain the complete reply. Reuse the same `requestId` when retrying an uncertain submission. A `409` with `session_working` means the current turn is still running or its provider process is winding down.

Hobgoblin starts the installed AI CLI on the host that owns the worktree. Keep the CLI signed in there and grant any required tool permissions in that CLI. Background sessions continue while the client is disconnected and the Hobgoblin server is running. Cancel the specific turn URL to stop its provider and keep its recorded prompt. Closing a session also cancels its active turn, removes the session from workspace lists, and keeps its history readable with status `closed`.

Send a complete keyboard sequence in `data` with a new UUID as `requestId`. Use `\r` for Enter and `\u0003` for Ctrl+C in JSON. The server coordinates each write with other clients on that terminal. It returns `409` with `interactive_input_active` if a desktop or Web client sent input in the last two seconds, or `control_in_use` if an explicit lease is active. A quiet period only measures recent input. Check the terminal before sending input that could submit or modify an unfinished command.

A `202` with `{"accepted":true,"delivery":"unconfirmed"}` means the server handed the input to the PTY write API. Check recent terminal output to see whether the application acted on it. If a response is lost or returns `503 input_delivery_unknown`, retry the same request ID and data on the same terminal within five minutes to retrieve the recorded result without submitting the input twice. The server retains up to 1024 attempts per terminal in that window and returns `409 control_limit` when the limit is reached. After five minutes, inspect the terminal before deciding what to send next.

Existing clients can still acquire, write under, and release an explicit lease using the `/control` routes. Those leases last five minutes. Closing an ordinary terminal closes its Hobgoblin connection and detaches any backing tmux session.

### Open terminals and interactive AI sessions

Use `GET /workspaces/{workspaceId}/terminals` to list open terminals and `POST` to the same path to create one. Send a JSON object with an optional `worktreeId` from the worktree listing. The default is the primary workspace directory. Send `launchMode: "tmux-if-available"` to use the existing tmux backend, or omit it for the native backend. A Windows project uses the configured shell preference. Specify `windowsInternalTerminalShell: "wsl"` or `"powershell"` to override it for this terminal. SSH and WSL workspaces run the terminal on their selected host or distribution.

Interactive Codex and Claude sessions run in dedicated terminals. They use the CLI installed and signed in on the selected host, and the workspace's ordinary terminal controls are also available for these terminals.

| Operation                                                                                             | Path under `/api/open/v1/muse`                                                            |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Start a session with `{"provider":"codex"}` or `{"provider":"claude"}` and optional terminal settings | `POST /workspaces/{workspaceId}/terminal-sessions`                                        |
| List open interactive sessions                                                                        | `GET /workspaces/{workspaceId}/terminal-sessions`                                         |
| Read the recent visible output                                                                        | `GET /workspaces/{workspaceId}/terminal-sessions/{terminalId}`                            |
| Send instructions or keys with `requestId` and `data`                                                 | `POST /workspaces/{workspaceId}/terminal-sessions/{terminalId}/input`                       |
| End the session and close its terminal                                                                | `DELETE /workspaces/{workspaceId}/terminal-sessions/{terminalId}`                         |

Both creation operations return `201` and a `Location` header. If a creation response is lost, list current terminals before submitting another creation. The session detail includes up to 8192 characters of terminal output. Ending a managed tmux session closes its backing tmux session. Ordinary tmux terminals retain the existing detach behavior.

AI processes started manually in an existing terminal are accessible through that terminal's output and control routes. Interactive session listing and ending apply to the dedicated sessions launched through the connector. Background sessions and their structured message history remain available through the background session routes.

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
