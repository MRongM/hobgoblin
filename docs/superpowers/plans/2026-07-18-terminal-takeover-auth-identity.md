# Terminal Takeover Auth Identity Implementation Plan

> **For agentic workers:** Execute inline with `superpowers:executing-plans`; do not create branches, commits, or subagents for this repair.

**Goal:** Restore browser takeover of Electron-owned terminal sessions after Web access protection introduced page-scoped authentication capabilities.

**Architecture:** Keep authentication and terminal ownership as separate bootstrap fields. The page capability remains the WebSocket credential, while a stable server-derived `clientId` groups authorized Electron and browser attachments under the existing terminal owner boundary.

**Tech Stack:** TypeScript 6, Hono, Vitest, Bun, Node.js strip-only execution.

## Global Constraints

- Do not change terminal protocol shapes or weaken `ownedSession` checks.
- Do not add dependencies.
- Do not use unsupported TypeScript runtime syntax.
- Do not create a Git commit or branch.
- Verify with `bun run typecheck`, `bun run test`, and `bun run check:architecture`.

---

### Task 1: Separate Web capability from terminal owner identity

**Files:**

- Modify: `src/server/app-factory.test.ts`
- Modify: `src/server/app-factory.ts`

**Interfaces:**

- Consumes: `buildWebBootstrap(requestUrl, webCapability, terminalClientId, acceptLanguageHeader, langPref, settings)`.
- Produces: `RendererBootstrapSnapshot.initialServer` with page-scoped `secret` and server-stable `clientId`.

- [ ] **Step 1: Write the failing regression test**

Add a test that requests one Electron bootstrap with the exact internal capability and one ordinary browser bootstrap from the same app instance:

```ts
test('keeps browser terminal ownership aligned with Electron while capabilities differ', async () => {
  const { createApp } = await import('#/server/app-factory.ts')
  const app = createApp({
    version: '0.1.0',
    startedAt: Date.now(),
    internalSecret: 'secret',
    terminalHost: terminalHostStub,
  })

  const electronHtml = await app
    .request('http://127.0.0.1:32100/', {
      headers: { 'x-goblin-internal-secret': 'secret' },
    })
    .then((response) => response.text())
  const browserHtml = await app.request('http://127.0.0.1:32100/').then((response) => response.text())
  const electronServer = serverBootstrapFromHtml(electronHtml)
  const browserServer = serverBootstrapFromHtml(browserHtml)

  expect(browserServer.secret).not.toBe(electronServer.secret)
  expect(browserServer.clientId).toBe(electronServer.clientId)
})
```

Replace the capability-only parser with a helper that validates both fields:

```ts
function serverBootstrapFromHtml(html: string): { secret: string; clientId: string } {
  const match = html.match(/<script id="goblin-bootstrap" type="application\/json">([^<]+)<\/script>/u)
  if (!match?.[1]) throw new Error('Missing renderer bootstrap')
  const bootstrap = JSON.parse(match[1]) as { initialServer?: { secret?: string; clientId?: string } }
  if (!bootstrap.initialServer?.secret) throw new Error('Missing Web capability')
  if (!bootstrap.initialServer.clientId) throw new Error('Missing terminal client id')
  return { secret: bootstrap.initialServer.secret, clientId: bootstrap.initialServer.clientId }
}

function webCapabilityFromHtml(html: string): string {
  return serverBootstrapFromHtml(html).secret
}
```

- [ ] **Step 2: Verify the test fails for the ownership mismatch**

Run:

```sh
bun run test "src/server/app-factory.test.ts"
```

Expected: the new test fails because browser and Electron `clientId` values differ.

- [ ] **Step 3: Implement the minimal identity separation**

Change bootstrap construction to accept an explicit terminal owner ID:

```ts
function buildWebBootstrap(
  requestUrl: string,
  webCapability: string,
  terminalClientId: string,
  acceptLanguageHeader: string | null,
  langPref: LangPref,
  settings: Awaited<ReturnType<typeof getServerSettingsPrefs>>,
): RendererBootstrapSnapshot {
  // Existing snapshot construction remains unchanged except:
  // server: toInitialServerSnapshot({ url, secret: webCapability, clientId: terminalClientId })
}
```

Compute `terminalClientId` once in `createApp` from `options.internalSecret` and pass it through `renderRendererIndexHtml` into `buildWebBootstrap`.

- [ ] **Step 4: Verify focused behavior**

Run:

```sh
bun run test "src/server/app-factory.test.ts" "src/server/routes/realtime.test.ts" "src/web/components/terminal/ManagedTerminalSession.test.ts" "src/server/terminal/terminal.test.ts"
```

Expected: all selected files pass, including the cross-capability ownership regression and existing takeover tests.

- [ ] **Step 5: Verify repository health**

Run:

```sh
bun run typecheck
bun run test
bun run check:architecture
```

Expected: all commands exit with status `0`.
