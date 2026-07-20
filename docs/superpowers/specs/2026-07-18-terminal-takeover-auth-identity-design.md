# Terminal Takeover Auth Identity Design

Status: approved for autonomous execution

## Problem

Web access protection replaced the server's internal capability in the browser bootstrap with a page capability. The bootstrap also derives `clientId` from that capability. Anonymous page capabilities are created per renderer page, while authenticated capabilities are scoped to a Web login session.

Terminal session lookup is global within a repository scope, but terminal mutations—including takeover—require the caller's `clientId` to match the session owner. A browser can therefore discover an Electron-owned terminal while being unable to take it over.

## Decision

Separate authentication capability from terminal ownership identity:

- `initialServer.secret` remains the page capability and continues to authenticate API and WebSocket access.
- `initialServer.clientId` becomes the stable server terminal owner ID derived from the server's internal secret.
- Electron and authorized browser clients attached to the same server therefore share one terminal owner ID while retaining distinct attachment IDs.
- Takeover continues to replace only the active attachment controller within that owner. No server-side cross-owner bypass is added.

The terminal `clientId` is an ownership/routing identifier, not an authentication credential. Realtime connections still require a valid internal or Web capability before the server accepts the supplied identity.

## Data Flow

1. The server creates or validates a page capability.
2. The renderer bootstrap receives that capability as `secret`.
3. The same bootstrap receives the stable terminal owner ID derived from `internalSecret` as `clientId`.
4. The browser opens the terminal WebSocket using the page capability, stable owner ID, and per-page attachment ID.
5. The server authenticates the capability, resolves the existing owned session, and lets the connected attachment request takeover through the existing ownership rules.

## Implementation Scope

- Update `src/server/app-factory.ts` so Web bootstrap construction receives authentication capability and terminal owner ID as separate values.
- Add a regression test in `src/server/app-factory.test.ts` proving Electron and browser bootstraps use different capabilities but the same terminal owner ID.
- Keep terminal protocols, session manager ownership checks, and renderer takeover behavior unchanged.

## Verification

- Run the new app-factory regression test and existing realtime/terminal takeover tests.
- Run the full test suite, typecheck, and architecture boundary check.

## Out of Scope

- Multi-user terminal isolation.
- Cross-owner takeover authorization.
- Session ownership migration.
- Changes to attachment/controller semantics.
