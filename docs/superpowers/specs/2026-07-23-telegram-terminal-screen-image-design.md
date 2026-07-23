# Telegram Terminal Screen Image Design

## Goal

Attach a low-bandwidth terminal screen image to eligible Telegram “no new terminal output” notifications, remove the decorative terminal-output separator, and guarantee that generated image data is not retained after delivery.

## Confirmed Decisions

- The image is a **terminal screen image** rendered from the server-owned headless xterm active viewport, not a pixel capture of the Electron or browser window.
- Only Telegram output-completion notifications may carry the image. Bell notifications remain text-only.
- The existing `includeTerminalOutput` opt-in controls both terminal excerpts and terminal screen images. The default remains disabled so terminal contents are never exposed implicitly.
- A successful image path uses one Telegram `sendPhoto` request with the compact notification metadata as its caption.
- The image is a bounded 1280×720-or-smaller JPEG at quality 65.
- Image bytes stay in memory. No temporary file is created, so there is no crash residue or cleanup race.
- Image generation failure falls back to the existing text excerpt. A Telegram transport failure is not retried through a second method because delivery may be ambiguous.
- Media generation and upload are globally serialized with concurrency 1.
- The literal `── 终端输出 ──` header and its localized equivalents are removed. Text fallbacks use one blank line before the excerpt.
- No setting, durable history, retry queue, or screenshot persistence is added.

## Architecture

The terminal worker already owns the authoritative headless xterm model for every server session. It will expose a bounded active-viewport snapshot containing plain display lines, dimensions, session identity, and output sequence. This preserves background-terminal and Web-mode behavior without creating hidden renderer views.

The server Telegram write path claims the existing `sessionId + finalOutputSeq` idempotency key before reading screen content. When output inclusion is enabled, it asks the terminal host for a bounded screen snapshot and passes that snapshot to a focused image renderer. The renderer builds a privacy-safe SVG in memory, rasterizes it with `sharp`, and emits a low-quality JPEG buffer.

The Telegram source adds a multipart `sendPhoto` transport that writes headers and the existing JPEG buffer as separate request chunks, avoiding a second full-size concatenated body. The existing proxy, timeout, bounded-response, and error mapping behavior is shared with text delivery.

## Data Flow

1. Renderer observes an eligible output activity period becoming idle and posts the unchanged completion context.
2. Server validates settings, context, duration, and idempotency.
3. If output inclusion is disabled, server sends the compact text notification as today.
4. If enabled, server reads at most 140 columns × 40 rows from the active headless viewport.
5. Server renders at most 1280×720 JPEG bytes at quality 65 inside the single-concurrency media queue.
6. Server sends one `sendPhoto` request with a Unicode-safe caption capped at Telegram's 1024-character photo-caption limit.
7. When the promise settles, references to the snapshot, SVG, JPEG, and multipart chunks leave scope; no file exists to delete.
8. If screen read or image rendering fails before transport, server sends the existing excerpt fallback without the decorative header.

## Performance Boundaries

- Snapshot extraction is `O(rows × columns)` with hard bounds of 40 × 140 display cells.
- Raster output is capped at 1280×720; raw pixel working memory is therefore bounded to roughly 3.5 MiB plus encoder overhead.
- JPEG quality 65 and a single upload reduce network cost relative to lossless or two-message alternatives.
- Concurrency 1 prevents simultaneous terminal completions from multiplying encoder memory and upload sockets.
- Rendering remains event-driven; no polling, background screenshots, or per-output image work is introduced.

## Failure and Security Rules

- Validate session identity and snapshot dimensions at the server boundary.
- Escape XML metacharacters and remove control characters before constructing SVG.
- Do not log captions, screen lines, image bytes, bot tokens, or chat IDs.
- Reject empty or oversized photo payloads before opening a request.
- Do not retry an ambiguous failed photo upload as text.
- Preserve current best-effort delivery and unread-state independence.

## Packaging

Pin `sharp` exactly at `0.35.3`, exclude it from the Bun server bundle, and unpack `sharp` plus `@img` native assets from Electron ASAR as required by the upstream integration contract.

## Testing

- Headless viewport extraction: active viewport only, column/row bounds, trailing blanks, parse-chain ordering, missing session.
- SVG/JPEG rendering: deterministic dimensions, valid JPEG signature, quality/size bounds, XML escaping, empty input.
- Multipart transport: correct endpoint, fields, bytes, content length, proxy disposal, timeout and response limits.
- Write path: output disabled, successful photo, render fallback, caption cap, one-cycle idempotency, single-concurrency behavior, separator removal.
- Packaging, type, architecture, focused tests, full tests, and build-server verification.

## Alternatives Rejected

- `BrowserWindow.capturePage()`: cannot cover hidden/background terminals or standalone Web mode.
- Renderer DOM/canvas capture: some sessions never have a local xterm and multiple renderers may disagree.
- Temporary files: add disk I/O, cleanup races, crash residue, and sensitive-data exposure with no transport benefit.
- Photo plus separate text message: doubles requests and introduces partial-delivery ordering states.
- Synchronous JPEG work in the terminal worker: can delay PTY and realtime handling.
