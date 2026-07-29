# Toast Text Selection Design

## Scope

Allow people to select the title and description of app toasts with the pointer and copy the selection with the platform-standard keyboard shortcut. Keep the existing bottom-right placement, theme-aware semantic colors, close button, duration, stacking, and swipe-to-dismiss behavior.

The subject is Hobgoblin's developer workspace, the audience is developers diagnosing repository and terminal operations, and the notification surface has one job: communicate a short result whose exact wording or path can be reused elsewhere.

## Existing Context

Both the main window and detached file-area window render the shared `src/web/components/ui/sonner.tsx` wrapper. That wrapper already owns theme projection, semantic status colors, iconography, sizing, and long-description constraints. Individual `toast(...)` call sites own message meaning and must remain unchanged.

Sonner 2.0.7 renders the message under `data-title` and optional detail under `data-description`. Its pointer-move implementation stops swipe handling once `window.getSelection()` contains text, so selection can coexist with the current dismissal gesture.

## Options Considered

1. **Explicit text selection in the shared wrapper — selected.** Add `select-text` and `cursor-text` to the content, title, and description class hooks. This is local, discoverable, and preserves all current behavior.
2. **Disable swipe-to-dismiss globally.** This removes gesture competition but changes established behavior for every toast and is unnecessary because Sonner already detects active selection.
3. **Add a copy button.** This is faster for copying the whole message but adds persistent visual noise, translation and accessibility copy, clipboard failure handling, and ambiguity about whether title, description, or both should be copied.

## Visual Direction

The notification remains a compact developer status card rather than becoming a new branded surface.

- Color: continue using theme-owned popover, success, danger, and warning tokens. In the default macOS light preset these resolve around canvas `#ffffff`, text `#1d1d1f`, success `#1f7f37`, danger `#d70015`, warning `#946200`, and accent `#0066cc`; every other preset supplies its own values.
- Type: retain the application monospace stack for message text and the existing medium/regular title-description hierarchy. No new font is introduced.
- Layout:

```text
┌─ status icon ─ title text (selectable) ─ close ─┐
│                 description (selectable)        │
└──────────────────────────────────────────────────┘
```

- Signature: soft semantic color blocks that change with the selected Hobgoblin theme, paired with text that behaves like useful developer output instead of inert chrome.

The initial idea of adding a visible copy affordance was rejected during critique because it would make this small utility surface look like a generic action card. The restrained text cursor is specific to the requested reuse workflow and leaves status meaning dominant.

## Interaction Contract

- Pointer dragging over toast title or description creates a normal browser/Electron text selection.
- `Cmd+C` on macOS and `Ctrl+C` elsewhere use the platform's native copy behavior; the app does not intercept the shortcut or request clipboard access.
- Starting a swipe outside a selected range keeps Sonner's current dismiss behavior.
- The close button and any toast action buttons remain button interactions, not selectable text targets.
- Custom caller class names continue to be merged after the wrapper defaults.

## Architecture and State

This is renderer-local presentation behavior. It introduces no server state, synchronization, IPC, preload API, or new component. `src/web/components/ui/sonner.tsx` remains the single owner of the global toast presentation contract.

No glossary or ADR update is needed: the change does not add a domain term or a hard-to-reverse architectural decision.

## Testing

Extend `src/web/components/ui/sonner.test.tsx` to verify that content, title, and description receive the selectable-text contract while preserving caller-supplied classes. Then run the focused test, typecheck, architecture guard, and full test suite.

## Principles

- KISS/YAGNI: native selection and copy; no new clipboard code or control.
- DRY: one wrapper change covers every toast in every renderer window.
- SOLID: presentation remains owned by the shared Toaster wrapper; message producers are unchanged.
