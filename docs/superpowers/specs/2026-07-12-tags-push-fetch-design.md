# Tags: Push to Remote & Fetch from Remote

**Date:** 2026-07-12
**Status:** Approved

## Overview

Two connected features added to the existing Tags tab (`ProjectTagsPanel`):

1. **Push tag to remote** — each local tag row gets a push button; clicking runs `git push <remote> refs/tags/<name>` using auto-resolved remote (same logic as `pushBranch`)
2. **Fetch tags from remote** — the existing Refresh button is upgraded to first run `fetchRepository` (which pulls remote tags as part of normal `git fetch`), then reloads the local tag list

No new server endpoints are needed for fetch — it reuses the existing `/api/repo/fetch` path.

---

## Decisions Recorded

| Question | Decision |
|----------|----------|
| Where does push-tag git code live? | `src/system/git/tags.ts` — adds `pushLocalTag` alongside existing local tag helpers |
| Remote resolution for push | Auto-resolve (same as `pushBranch`): upstream remote → `origin` → only remote. No explicit remote param exposed to UI. |
| Fetch tags semantics | Reuse `fetchRepository('user')` — normal `git fetch` already syncs tags. No `--tags` endpoint. |
| SSH command type for push tag | New `{ type: 'gitTagPush'; path: string; remote: string; tag: string }` — symmetric with `gitRemoteTagDelete`, not reusing `gitPush` |
| State class | Runtime-coherent. Server is truth, renderer is a projection. Invalidation + refetch — no streaming needed. |
| Invalidation after push | `runUserNetworkMutation` (same as `pushRepositoryBranch`) auto-publishes snapshot invalidation on success. |
| UI entry point for push | Per-row push icon button (hover-visible), next to existing delete button. Icon: `ArrowUpFromLine` from lucide-react. |
| Push pending state | Single `useAsyncPending<'push'>` — disables all push buttons while one is in flight. YAGNI; concurrent multi-tag push has no practical value. |
| New i18n keys | `tags.push`, `tags.push-success` only. Errors use `t(result.message)` + `toast.error`, same as delete. |
| Refresh button behavior | `fetchRepository(repoId, 'user')` → on success `loadTags()`. Matches `ProjectRemoteBranchesPanel.refresh()` exactly. |

---

## Data Layer

### New git-layer function

In `src/system/git/tags.ts`:

```ts
export async function pushLocalTag(
  cwd: string,
  name: string,
  signal?: AbortSignal,
  networkOptions?: GitNetworkOptions,
): Promise<ExecResult>
```

Implementation:
1. Validate `name` with `isSafeBranchName`
2. Resolve remote via `getRemotes(cwd, signal)` + `resolveFetchRemoteForRemotes(remotes, null)` — no upstream context for tags, resolves: origin if present, else single remote, else null (returns `{ ok: false, message: 'error.push-no-remote' }` when null)
3. Run `gitResultWithOptions(cwd, gitNetworkOptions(networkOptions, NETWORK_TIMEOUT_MS, signal), 'push', '--', remote, \`refs/tags/${name}\`)`

New imports needed in `tags.ts`: `gitNetworkOptions`, `NETWORK_TIMEOUT_MS` from `helper.ts`; `getRemotes`, `resolveFetchRemoteForRemotes` from `remote.ts`.
Note: using `resolveFetchRemoteForRemotes` (not `resolvePushTargetForRemotes`) because tags have no branch-upstream concept. `resolveFetchRemoteForRemotes` returns `string | null` (not a `PushTarget | ExecResult` union), so the no-remote error is handled locally.

### New SSH command type

In `src/system/ssh/commands.ts`, add to the `RemoteCommand` union:

```ts
| { type: 'gitTagPush'; path: string; remote: string; tag: string }
```

Shell string: `git -C <path> push -- <remote> refs/tags/<tag>`

### New SSH git function

In `src/system/ssh/git.ts`:

```ts
export async function pushLocalTag(
  target: RemoteRepoTarget,
  input: { name: string; signal?: AbortSignal; run?: RemoteGitRunner },
): Promise<ExecResult>
```

Uses `resolveRemotePushTarget` (already private in `ssh/git.ts`) to resolve remote, then dispatches `{ type: 'gitTagPush', ... }`.

### RepoBackend interface

Add to `RepoBackend` in `src/server/modules/repo-backend.ts`:

```ts
pushLocalTag(name: string, signal?: AbortSignal, networkOptions?: GitNetworkOptions): Promise<ExecResult>
```

Local backend implementation calls `pushLocalTag` from `git/tags.ts`.
Remote backend implementation calls `pushLocalTag` from `ssh/git.ts`.

### Write-paths orchestration

New function in `src/server/modules/repo-write-paths.ts`:

```ts
export async function pushRepositoryLocalTag(
  cwd: string,
  name: string,
  signal?: AbortSignal,
  sourceToken?: string,
): Promise<ExecResult>
```

Pattern identical to `pushRepositoryBranch`:
- `isValidRepoLocator` guard
- `resolveRepoBackend`
- `getGitNetworkOptions` for local backend
- `runUserNetworkMutation` (auto-publishes snapshot invalidation on success)

### Server route

In `src/server/routes/repo.ts`, add:

```
POST /push-local-tag  { cwd, name, sourceToken }
```

Pattern matches `/push`.

### RPC type

In `src/shared/rpc.ts`, add to the `repo` write actions group:

```ts
pushLocalTag: (input: { cwd: string; name: string }) => Promise<ExecResult>
```

### Embedded RPC route

In `src/shared/embedded-server-rpc-routes.ts`:

```ts
'repo.pushLocalTag': { route: '/api/repo/push-local-tag', method: 'POST' }
```

### Client wrapper

In `src/web/repo-client.ts`:

```ts
export async function pushRepositoryLocalTag(
  cwd: string,
  name: string,
  signal?: AbortSignal,
  sourceToken?: string,
): Promise<ExecResult>
```

---

## UI Changes

### `ProjectTagsPanel.tsx`

**Refresh button** — upgrades from simple `loadTags()` to:

```ts
async function handleRefresh() {
  const result = await fetchRepository(repoId, 'user')
  if (!result.ok) {
    toast.error(t(result.message))
    return
  }
  await loadTags()
}
```

**Push button** — new per-row button, rendered alongside the existing delete button:

```tsx
<Button
  variant="ghost"
  size="icon-sm"
  disabled={isPending}
  onClick={() => void handlePushTag(tag)}
  aria-label={t('tags.push')}
  title={t('tags.push')}
  className="h-6 w-6 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
>
  {pending === 'push' && pushingTag === tag
    ? <Loader2 className="size-3.5 animate-spin" />
    : <ArrowUpFromLine className="size-3.5" />}
</Button>
```

**Pending state**:

```ts
const { pending, isPending, run } = useAsyncPending<'push'>()
const [pushingTag, setPushingTag] = useState<string | null>(null)
```

`handlePushTag(tag)` sets `pushingTag`, calls `run('push', ...)`, clears `pushingTag` after settle.

**New imports**: `fetchRepository`, `pushRepositoryLocalTag` from `repo-client.ts`; `ArrowUpFromLine` from lucide-react.

---

## i18n Keys

Added to `src/shared/i18n/en.ts` (and mirrored in `ja.ts`, `ko.ts`, `zh.ts`):

```
tags.push          → "Push tag"
tags.push-success  → "Tag pushed"
```

---

## Files Changed

| File | Change |
|------|--------|
| `src/system/git/tags.ts` | Add `pushLocalTag` (network git function) |
| `src/system/git/tags.test.ts` | Add tests for `pushLocalTag` |
| `src/system/ssh/commands.ts` | Add `gitTagPush` command type + shell handler |
| `src/system/ssh/commands.test.ts` | Add test for `gitTagPush` shell string |
| `src/system/ssh/git.ts` | Add `pushLocalTag` SSH function |
| `src/server/modules/repo-backend.ts` | Add `pushLocalTag` to `RepoBackend` interface; implement in both local and remote backends |
| `src/server/modules/repo-write-paths.ts` | Add `pushRepositoryLocalTag` orchestration function |
| `src/server/routes/repo.ts` | Add `/push-local-tag` route handler |
| `src/shared/rpc.ts` | Add `pushLocalTag` RPC type |
| `src/shared/embedded-server-rpc-routes.ts` | Register `repo.pushLocalTag` route |
| `src/web/repo-client.ts` | Add `pushRepositoryLocalTag` client wrapper |
| `src/web/components/repo-workspace/ProjectTagsPanel.tsx` | Add push button per row; upgrade refresh to fetch + reload |
| `src/web/components/repo-workspace/ProjectTagsPanel.test.tsx` | Add tests for push button and refresh behavior |
| `src/shared/i18n/en.ts` | Add `tags.push`, `tags.push-success` |
| `src/shared/i18n/ja.ts` | Mirror new keys |
| `src/shared/i18n/ko.ts` | Mirror new keys |
| `src/shared/i18n/zh.ts` | Mirror new keys |

---

## What Is NOT in Scope

- No `git fetch --tags` endpoint — normal `fetchRepository` already syncs tags
- No explicit remote selector in push UI — auto-resolve only
- No concurrent multi-tag push — single `useAsyncPending` serializes pushes
- Remote tags panel is unchanged — it already has its own refresh (fetch + reload)
