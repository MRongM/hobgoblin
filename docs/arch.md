# Architecture

Use this doc for app shell and process ownership rules.

- Keep one main `BrowserWindow` by default. Add extra windows only when the product really needs a separate surface.
- A detached file area window is an allowed auxiliary renderer surface. Electron main owns native lifecycle and a trusted bootstrap descriptor. Web opens a same-origin browser window and transfers the descriptor through a short-lived, consume-once handoff whose URL contains only an opaque identifier. Both renderers reuse the ordinary file area panel against server-owned data.
- Keep workspace navigation commands targeted at the main window. Auxiliary renderer surfaces may participate in trusted IPC, theme/data invalidation, and focused native Close/Reload behavior without becoming another main workspace shell.
- Keep auxiliary window presentation local and ephemeral unless a separate product requirement explicitly calls for restoration.
- Put app logic in `src/server/` or `src/shared/`.
- Keep `src/main/` focused on Electron-native shell work.
- Keep overlays centralized in `src/web/hooks/useAppOverlays.ts`.
- Route menu and UI actions through renderer/server intent flows when possible.
- Use direct main-process actions only for native-only work.
- Let the server own settings and app data.
- Let main project native state instead of owning parallel state.
