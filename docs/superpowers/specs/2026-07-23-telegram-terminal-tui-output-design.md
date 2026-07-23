# Telegram Terminal TUI Output Normalization Design

## Goal

Turn raw PTY output from full-screen terminal applications into readable, bounded Telegram excerpt text without redacting native visible content. Eliminate leaked VT control bytes such as the `B` from `ESC(B`, drop string-control payloads, prevent cursor-positioned regions from being concatenated without a boundary, and reduce box-frame decoration.

## Boundary

The terminal output excerpt remains a best-effort linear representation of a stream, not a reconstruction of the terminal screen. It must work for background and never-attached sessions where no xterm instance exists, so the implementation stays in the per-session streaming collector rather than reading the active xterm buffer or adding a headless terminal dependency.

Commands, paths, versions, URLs, credential-like text, punctuation, and other native printable content remain literal. The only transformations are control-sequence removal, terminal-presentation normalization, whitespace folding, `─` run compaction, and configured suffix truncation.

## Streaming VT Parser

The collector keeps parser state across output chunks and recognizes:

- CSI introduced by `ESC [` or C1 CSI;
- OSC introduced by `ESC ]` or C1 OSC, terminated by BEL or ST;
- DCS, SOS, PM, and APC introduced by either 7-bit ESC forms or C1 forms, terminated only by ST;
- ESC sequences with intermediate bytes, including charset designators such as `ESC(B` and `ESC(0`;
- CAN and SUB as cancellation controls for any in-flight sequence;
- SI/SO selection of G0/G1 character sets and the DEC Special Graphics mapping used by legacy terminal box drawing.

No byte belonging to one of these control sequences or string payloads becomes notification text. Parser state resets with the terminal-output collector lifecycle.

## Linear Text Projection

CSI commands that reposition the cursor, scroll, or erase content contribute one pending whitespace boundary instead of disappearing silently. Styling and mode-setting commands contribute no text. Existing whitespace normalization collapses every resulting run to one ordinary space.

DEC Special Graphics characters are translated to their Unicode equivalents before projection. Pure box-frame corners, junctions, and vertical edges are treated as whitespace boundaries. Unicode box-frame characters received directly follow the same rule. Horizontal `─` runs retain the existing compaction rule, so the presence of a separator remains visible without consuming the excerpt budget.

This produces readable linear output but intentionally does not deduplicate repeated TUI redraw frames or infer semantic fields from a particular application such as Codex.

## Defense in Depth

The shared server-side output normalizer applies the same printable box-decoration cleanup before final character counting. The server continues to reject forbidden controls and applies the authoritative configured suffix and whole-message budget. No raw output or credentials are logged.

## Testing

- Reproduce and eliminate `B` leakage from `ESC(B`, including a sequence split across chunks.
- Drop DCS/APC/PM/SOS payloads and support their C1 forms.
- Verify cursor positioning inserts a single text boundary while SGR styling does not.
- Verify DEC Special Graphics selection does not leak raw `j`, `q`, or charset-designator bytes.
- Verify Unicode box frames become boundaries, long `─` runs stay compact, and native printable values remain unchanged.
- Preserve existing ANSI, OSC, Unicode, reset, performance, whitespace, length, and Telegram write-path coverage.

## Out of Scope

- Maintaining a second headless xterm instance per terminal.
- Reconstructing alternate-screen buffers or exact cursor-overwrite semantics.
- Application-specific parsing, field extraction, or repeated-frame deduplication.
- Redacting or masking terminal content.
