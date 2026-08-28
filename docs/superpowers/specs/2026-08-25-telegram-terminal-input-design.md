# Telegram Terminal Input Design

## Goal

Allow an explicitly authorized Telegram group member to address the dedicated Hobgoblin bot and submit one line of text to the current Telegram input target terminal. The feature must work while Hobgoblin is bound only to localhost or an internal network, preserve the existing terminal ownership model, avoid delayed or duplicate command execution, and reply in Telegram with the delivery outcome.

## Confirmed Decisions

- The dedicated Hobgoblin Telegram bot is not shared with another application, `getUpdates` consumer, or webhook integration.
- Incoming updates use one server-owned `getUpdates` long poll. No public URL, inbound firewall rule, port forwarding, or webhook endpoint is required.
- Telegram terminal input is separately enabled and defaults off. The existing Telegram master switch still gates the whole integration; the terminal-notification master affects only notification delivery.
- Only the configured group or supergroup is eligible.
- Only immutable numeric Telegram user IDs in an explicit allowlist are authorized. Username, group membership, and administrator status grant no authority.
- The Telegram input target terminal is the primary workspace terminal that most recently gained genuine terminal-emulator keyboard focus while its attachment controlled input.
- Selection and read-only viewing do not establish a target. A target is runtime-only, is not restored after restart, and never falls back to another terminal.
- A Telegram message becomes one terminal submission: remove a leading exact bot mention, validate one bounded line of plain text, append carriage return, and enqueue it as user intent.
- Startup backlog is discarded. During one receiver run, an update older than 60 seconds is expired and never reaches the terminal.
- Every accepted or rejected addressed message receives a Telegram outcome reply. Unrelated chats and messages not addressed to the bot are ignored silently.
- Initial support is text-only. Multiline, edited, forwarded, reply-only, command, media, caption, anonymous-sender, and bot-sender inputs are excluded.

## Settings and Runtime Status

Extend the existing Settings > Notifications > Telegram group with:

- **Allow Telegram terminal input** — persisted boolean, default `false`.
- **Authorized user IDs** — one to 32 positive decimal Telegram user IDs. Persist and transport them as normalized strings, deduplicated in input order.
- **Long-poll wait** — persisted integer seconds, range `5..50`, default `25`.
- **Polling status** — read-only runtime status: stopped, starting, running, retrying, or configuration error. A safe error code may be shown; credentials, message text, and user IDs are never included in status diagnostics.

The derived HTTPS request timeout is the configured long-poll wait plus 10 seconds. Retry delays and Telegram `retry_after` handling remain system-owned and are not user settings.

Terminal input can run when ordinary terminal notifications are disabled. It requires all of the following:

- Telegram master enabled;
- terminal input enabled;
- configured Bot Token;
- configured group Chat ID;
- at least one authorized user ID.

Saving a relevant setting reconciles the receiver immediately. Disabling the master or terminal-input switch cancels the in-flight poll and moves status to stopped. Changing the Bot Token starts a new receiver epoch and discards that token's existing backlog. Changes to timeout, proxy, Chat ID, or allowlist restart the request lifecycle without running already rejected updates.

Runtime status is server-owned runtime-coherent state. Expose it through the settings snapshot and use settings invalidation plus targeted refetch; do not add a continuous status stream.

## Telegram Message Contract

The receiver requests only `message` updates but still validates every returned update because Telegram may briefly return updates selected under an earlier `allowed_updates` value.

An update is addressed terminal input only when all checks pass:

1. `update_id` is a new integer above the receiver high-water mark.
2. `message.chat.id` exactly equals the configured Chat ID and the chat type is `group` or `supergroup`.
3. `message.from` exists, is not a bot, and its decimal ID exactly matches an allowlist entry.
4. The message is not edited, forwarded, sent anonymously, or represented only by a caption/media field.
5. `message.text` contains a Telegram `mention` entity at the first non-whitespace UTF-16 offset.
6. The entity text matches the username returned by `getMe`, using Telegram username case-insensitive comparison.
7. Removing the mention and surrounding whitespace leaves `1..4000` Unicode code points.
8. The body contains no carriage return, line feed, C0 control, or DEL character.
9. The Telegram send time is after the current receiver became ready and is no more than 60 seconds old.

Telegram entity offsets are UTF-16 code-unit offsets, matching JavaScript string indexing. Parse the supplied entity rather than searching for a lookalike `@name` substring. Only the leading-mention form `@bot input` is supported; replies without a mention and `/command@bot` are not terminal input.

After validation, append `\r` exactly once. This matches the existing Mobile Web command composer and custom-button execute behavior. Do not synthesize bracketed-paste sequences: the current server headless terminal contract does not expose bracketed-paste mode, so accepting multiline text would create shell- and TUI-dependent behavior.

## Long-Poll Lifecycle

The receiver belongs to the server runtime, not a renderer and not Electron main.

Startup sequence:

1. Load the authoritative settings snapshot.
2. Stop with configuration error if required values are missing or invalid.
3. Call `getMe` to authenticate the token and obtain the canonical bot username.
4. Call `getWebhookInfo`; if a webhook URL exists, stop with a webhook-conflict error. Never delete an external webhook automatically.
5. Validate the configured Chat ID as a group or supergroup when Telegram makes that information available.
6. Discard all updates already pending for the new receiver epoch and advance past their highest `update_id` without invoking message handling.
7. Mark the receiver running and maintain exactly one in-flight `getUpdates` request.

Polling rules:

- Use `allowed_updates: ["message"]` and the configured positive timeout.
- Immediately issue the next poll after a successful response; the timeout is a server wait, not an interval added after every request.
- Sort a returned batch by `update_id` and process it sequentially.
- Claim each update ID in memory before any terminal or Telegram reply side effect. This favors at-most-once terminal input over retrying an ambiguous outcome.
- Advance past unrelated and rejected updates so they cannot block the stream.
- On an ordinary network failure, retry with jittered exponential delays of approximately 1, 2, 4, 8, 16, then at most 30 seconds.
- On Telegram `429`, respect `retry_after`.
- Stop on authentication failure, webhook conflict, or structurally invalid configuration.
- Cancellation on settings changes or shutdown must abort the active HTTPS request and pending retry timer.

A same-token network retry retains the in-memory high-water mark. A process restart or disabled-to-enabled transition creates a new receiver epoch and drains backlog. Messages received after readiness but delayed by a temporary network outage are evaluated against the 60-second freshness bound.

Telegram retains unconsumed updates, but Hobgoblin intentionally does not provide an offline terminal command queue.

## Target and Terminal Authority

The existing selected-terminal state is renderer-owned and restorable, so it cannot be used as authoritative runtime routing. Add a focused target intent to the terminal realtime protocol:

1. A primary desktop or desktop-Web terminal emulator gains focus.
2. The renderer sends a target-marking intent only when its attachment is the connected controller for an open terminal session.
3. The socket boundary supplies the attachment identity; the renderer does not nominate another attachment.
4. The terminal worker verifies the attachment's write authority and stores a runtime-only target containing owner/client ID, session ID, attachment ID, and a monotonic target version.

Mobile Web, Android, auxiliary renderer surfaces, selected-but-unfocused terminals, viewers, and unowned attachments never mark this target. Losing application-window focus does not clear an otherwise valid target because unattended remote input is the feature's purpose.

The terminal host exposes a dedicated server-only Telegram write operation. It is not added to the public renderer socket actions. In one worker turn it:

1. reads the current target;
2. verifies that the session is still open with a PTY;
3. verifies that the stored attachment is still the current connected controller;
4. submits the validated text plus `\r` through the ordinary terminal input queue with user-intent attribution;
5. returns a structured result and bounded terminal identity suitable for acknowledgement.

Controller release, takeover, restart, close, or owner cleanup invalidates the matching target. The write operation always revalidates, so a stale retained pointer cannot authorize input. Failure never selects the current UI terminal, chooses the first session, creates a terminal, takes control, or replays against a later target.

This authority boundary is recorded in ADR 0006.

## Delivery Flow

1. Telegram stores a new group message for the dedicated bot.
2. The server's outstanding `getUpdates` call returns the update.
3. The receiver claims the update ID and applies chat, sender, mention, shape, length, and freshness validation.
4. The receiver submits the normalized body to the terminal host's server-only Telegram write operation.
5. The terminal worker atomically resolves and revalidates the target, then writes once or returns a rejection code.
6. The server sends one localized `sendMessage` outcome as a reply to the original Telegram message, preserving its forum topic when applicable.
7. The next `getUpdates` request uses the updated offset.

## Outcome Replies

Replies contain no terminal output, command echo, filesystem path, token, Chat ID, or authorized-user list.

- Success: state that the message was sent and identify the terminal by its bounded terminal number and optional canonical title when available.
- Unauthorized sender in the configured chat: state that terminal input is not authorized.
- Expired input: state that the message expired and was not sent.
- Invalid body: state that only one non-empty plain-text line is accepted.
- No eligible target: state that the primary workspace has no focused controlling terminal.
- Target lost or terminal closed: state that the target changed before delivery and nothing was sent.
- Terminal write failure: send a generic failure message or safe error code without sensitive details.

Use Telegram reply parameters with the original message ID and preserve `message_thread_id` for forum groups. Messages from another chat and messages without the exact leading mention receive no reply. A Telegram transport failure while sending the acknowledgement is logged only as a safe code and never retries terminal input because the write outcome may already be committed.

## Architecture and Layering

Keep Telegram transport, input orchestration, terminal authority, and UI responsibilities separate:

- `src/shared/telegram-terminal-input.ts` owns bounded settings, update projections, parser result types, status/error codes, and normalization helpers.
- Generalize the current Telegram HTTPS source into a canonical Bot API source used by both existing outbound notifications and new `getMe`, `getWebhookInfo`, group validation, `getUpdates`, and reply sends. Update direct imports; do not leave a re-export shim.
- A server polling component owns one cancellable receiver epoch, offset/high-water state, backoff, and runtime status.
- A Telegram terminal-input write path validates updates, invokes the terminal host, formats localized outcomes, and sends acknowledgements.
- The server runtime creates and shuts down polling alongside the terminal host. Settings writes notify the runtime to reconcile configuration.
- The terminal worker owns target authority and atomic terminal write validation.
- The renderer only publishes eligible focus intent and renders settings/status; it never polls Telegram, validates sender authority, or formats Bot API messages.

This remains a vertical feature slice. `src/main/**` gains no Telegram or terminal-routing business logic, preserving the architecture guard.

## Persistence and Compatibility

Persist only the enable flag, normalized allowlist, and polling timeout beside existing Telegram settings. Runtime target, bot username, polling status, retry state, high-water mark, update payloads, and message bodies remain in memory.

Compatibility defaults:

- existing installations receive terminal input disabled;
- missing or invalid allowlists normalize to empty;
- missing or invalid timeout normalizes to 25 seconds;
- existing Bot Token, Chat ID, proxy preference, notification switches, and notification behavior remain unchanged;
- the masked settings snapshot never returns the Bot Token.

Do not persist a Telegram command history or terminal-input audit transcript. Numeric user IDs are configuration data but must not be logged.

## Failure, Security, and Privacy Rules

- Treat every Telegram update as untrusted input even though Telegram authenticated the Bot API connection.
- Bound response bodies and request timeouts for all new Bot API methods.
- Reuse the configured Telegram proxy preference for long polling and replies.
- Never log Bot Tokens, Chat IDs, user IDs, update payloads, message bodies, terminal input, or formatted replies.
- Never interpolate Telegram text into a shell command owned by Hobgoblin. The validated body is PTY input to the already running foreground program.
- Reject control characters so Telegram cannot inject Escape, Ctrl+C, or other terminal control sequences.
- Keep one receiver and one sequential update-processing loop per server runtime.
- Do not auto-delete webhooks, auto-add allowlist members, infer trust from group administrators, or accept mutable usernames as identity.
- Do not retry terminal writes after timeout or an ambiguous worker failure.

## Testing

### Shared parsing and settings

- Exact configured Chat ID and group/supergroup type.
- Positive decimal ID normalization, deduplication, one-to-32 bounds, and invalid values.
- Leading mention entity with UTF-16 offsets and case-insensitive exact bot username.
- Lookalike text, wrong entity type, mid-message mention, reply-only, bot sender, anonymous sender, forwarded message, media/caption, and wrong chat rejection.
- Empty, multiline, control-character, and over-4000-code-point body rejection.
- Freshness at startup, 60-second boundary, and expired messages.
- Settings defaults, migration, persistence, masked token snapshot, and timeout range.

### Telegram Bot API and polling

- `getMe`, webhook inspection, group validation, `getUpdates`, reply parameters, forum topic preservation, proxy use, bounded responses, and method-specific timeouts.
- One in-flight poll, startup backlog discard, ordered batch handling, offset advancement, duplicate update suppression, and unrelated-update skipping.
- Cancellation on disable, settings change, and shutdown.
- Network exponential backoff, jitter bounds, `429 retry_after`, authentication failure, and webhook conflict without webhook deletion.
- Receiver status transitions and settings invalidation/refetch.

### Terminal target and write path

- Only a primary controlling attachment can mark a target.
- Selection, viewer focus, Mobile Web, Android, and auxiliary surfaces do not mark it.
- The latest eligible focus replaces the previous target.
- Application blur retains the valid target; restart does not restore it.
- Controller release, takeover, restart, terminal close, and owner cleanup invalidate delivery.
- Atomic write uses exactly the stored controlling attachment, appends exactly one `\r`, attributes user intent, and never falls back or takes over.
- A target change racing with delivery produces one linearized result and never writes to two sessions.

### End-to-end and regression

- Enable the feature, focus a controlling terminal, send `@bot text`, observe one terminal submission and one success reply.
- Verify unauthorized, stale, malformed, wrong-chat, missing-target, and lost-target behavior.
- Verify disabling terminal notifications does not disable terminal input, while disabling the Telegram master does.
- Verify existing bell, completion, image, proxy, test-message, settings, and localization behavior remains unchanged.
- Run `bun run typecheck`, focused tests, `bun run check:architecture`, and `bun run test`.

## Alternatives Rejected

- **Webhook delivery:** requires a public HTTPS endpoint and is incompatible with the confirmed localhost/internal-network deployment.
- **Short polling on a fixed interval:** adds avoidable latency and request volume compared with one outstanding long poll.
- **Use selected/restored terminal state:** renderer-local and potentially stale across windows; selection also does not imply input authority.
- **Create a Telegram attachment or take over control:** disrupts the user's controller and creates competing authority semantics.
- **Bypass terminal ownership in the server:** introduces a second write-authority model and makes future security review unreliable.
- **Fallback to another open terminal:** can execute valid text in the wrong repository or foreground program.
- **Execute startup backlog:** turns a real-time remote control into an unsafe offline command queue.
- **Accept multiline text immediately:** the server does not currently expose bracketed-paste mode, so behavior would vary between shells and terminal applications.
- **Expose HTTP timeout and retry tuning separately:** creates invalid combinations without meaningful user value; derive them from one polling wait setting.

## Out of Scope

- Telegram webhooks, inline mode, private-chat input, channel posts, reply-only input, slash commands, edited messages, files, images, voice, and multiline submissions.
- Per-project, per-worktree, per-terminal, per-topic, or per-sender target routing.
- Terminal creation, automatic takeover, fallback routing, command scheduling, offline queues, durable retries, and command history.
- Sending terminal output or completion results as a response to terminal input.
- Automatic BotFather configuration, webhook deletion, user-ID discovery, or allowlist enrollment.
