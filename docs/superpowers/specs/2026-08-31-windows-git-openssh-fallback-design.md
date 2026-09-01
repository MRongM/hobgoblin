# Windows Git OpenSSH Fallback Design

## Problem

For a local Windows repository whose remote URL uses SSH, Git for Windows normally starts its bundled MSYS-based `ssh.exe`. During branch-workspace creation, pre-creation synchronization can start several independent repository pipelines concurrently. The bundled SSH process can fail before contacting the remote with an MSYS initialization error shaped like:

```text
ssh.exe: *** fatal error - add_item ("...", "/", ...) failed, errno 1
```

This is not an authentication or repository-access failure. On the affected machine, both the bundled SSH client and Windows native OpenSSH authenticate successfully when started normally, and Mandatory ASLR is disabled for the Hobgoblin process tree. The remaining failure is an intermittent Git for Windows MSYS runtime startup fault. Similar concurrent MSYS startup failures are externally documented, but Hobgoblin should handle only the exact observed failure rather than claim one universal trigger.

## Goal

Allow application-owned native Windows Git commands to recover from the exact bundled MSYS SSH startup failure without changing repository remotes, persisted settings, normal SSH selection, WSL behavior, or SSH-host behavior.

## Execution Boundaries

Repository execution environments remain distinct:

| Repository identity                      | Git and SSH execution                                           | This fallback                                     |
| ---------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------- |
| Local Windows path such as `C:\src\repo` | Git for Windows; its configured transport normally applies      | Eligible after the exact MSYS SSH startup failure |
| `wsl://<distribution>/<linux-path>`      | Linux Git and SSH inside that WSL distribution                  | Never eligible                                    |
| `ssh-config://<host>/<remote-path>`      | Git on the resolved SSH host through the existing remote runner | Never eligible                                    |

This preserves the product boundary in `2026-08-23-primary-windows-native-wsl-git-terminal-design.md`: choosing or importing a WSL project does not redirect its Git or credentials through Windows.

## Windows Operations That Can Reach OpenSSH

For a local Windows repository, OpenSSH is involved only when the effective remote transport is SSH. The shared native Git path covers:

- clone;
- fetch, background synchronization, and workspace-wide synchronization;
- pull;
- push and first-upstream creation;
- remote branch and tag deletion;
- tag push;
- remote fetch/push stages inside merge workflows;
- fetch during complete remote alignment;
- ordinary worktree or branch-workspace creation when pre-creation synchronization is enabled.

Local status, diff, commit, branch manipulation, and worktree manipulation do not ordinarily need OpenSSH. HTTPS remotes continue using Git's HTTP transport and credential helpers. User hooks, filters, or other repository-specific extensions remain outside this guarantee.

## Considered Approaches

### 1. Exact-failure fallback to Windows native OpenSSH — selected

Run native Git normally. If it fails with the tightly matched MSYS `ssh ... add_item ... errno 1` diagnostic, the operation is still on Windows, cancellation has not been requested, no explicit `GIT_SSH` or `GIT_SSH_COMMAND` override is present, and `%SystemRoot%\System32\OpenSSH\ssh.exe` exists, retry that same Git invocation once with `GIT_SSH` bound to the native executable and `GIT_SSH_VARIANT=ssh`.

This keeps the successful and ordinary failure paths unchanged. The diagnostic is emitted during SSH runtime initialization before a remote connection, so the one retry does not repeat a completed remote write.

### 2. Always force Windows native OpenSSH

This avoids the bundled MSYS runtime entirely but overrides normal Git transport selection and may bypass a user's deliberate Git SSH setup. It is too broad for an intermittent, recognizable failure.

### 3. Serialize branch-workspace network operations

This may reduce concurrent process pressure, but it slows all multi-repository creation and does not protect clone, manual fetch, pull, push, or failures triggered by unrelated concurrent MSYS processes. The precise recovery belongs at the shared native Git process boundary.

Changing remotes to HTTPS is not an application fix because it mutates user-owned repository configuration and authentication semantics.

## Selected Architecture

Add a focused resolver under `src/system/ssh/` for the native Windows OpenSSH executable. It accepts injectable platform, environment, and file-probe inputs for deterministic tests. It resolves only the trusted Windows optional-feature location under `SystemRoot` or `WINDIR`; it does not search the repository or relative `PATH` entries.

Keep Git execution centralized in `src/system/git/helper.ts`. Factor one internal function that performs a single Execa invocation with the existing timeout, cancellation, input, output locale, pager, proxy environment, and buffer policy. The exported `git` function performs the normal invocation, classifies a rejected process, and conditionally makes exactly one fallback invocation.

The fallback environment adds only:

```text
GIT_SSH=<absolute Windows native OpenSSH path>
GIT_SSH_VARIANT=ssh
```

All existing command-scoped environment values, including proxy variables, are preserved. No global or repository Git configuration is written.

## Failure and Safety Semantics

- Match the complete diagnostic shape: an SSH process, MSYS `fatal error - add_item`, root mount `"/"`, and `errno 1` on the same diagnostic line.
- Do not retry permission denial, unknown host keys, missing repositories, ordinary network failures, timeouts, or unrelated MSYS errors.
- Do not retry after the caller aborts.
- Do not retry if the caller or inherited process environment explicitly sets `GIT_SSH` or `GIT_SSH_COMMAND` (case-insensitive on Windows).
- Do not retry if native Windows OpenSSH is unavailable.
- If the fallback attempt fails, return its ordinary Git diagnostic through the existing `gitResultWithOptions` contract.
- Preserve the same per-attempt timeout. The matched MSYS startup failure is immediate, so fallback adds no additional long-running first attempt.
- Never persist credentials, SSH paths, or fallback state.

## State, UI, and Realtime

This is ephemeral process recovery in `src/system/**`. It introduces no local UI state, runtime-coherent state, restorable state, server payload, invalidation, streaming, preference, or copy change. The branch-workspace UI and its pre-creation synchronization behavior remain unchanged.

## Testing

1. Unit-test Windows native OpenSSH discovery, including case-insensitive environment lookup, trusted absolute paths, missing executables, and non-Windows behavior.
2. Add Git-helper tests that first observe the exact failure without retry support, then prove one fallback invocation succeeds while preserving command options and proxy environment.
3. Prove no retry for unrelated errors, unavailable native OpenSSH, explicit SSH environment overrides, or an aborted signal.
4. Run focused tests, type checking, the architecture guard, the full test suite, and diff hygiene checks.

## Architecture Grill

- **Ownership:** The recovery sits at the native process integration boundary in `src/system/**`, not in the branch-workspace UI or server orchestration.
- **Backend separation:** Only `createLocalRepoBackend` reaches `src/system/git/helper.ts`; WSL and SSH repository identities use the remote runner and remain unchanged.
- **Layering:** No renderer, server state, Electron, or protocol import enters the system module.
- **User configuration:** Normal Git behavior remains first choice; explicit SSH environment overrides and persisted remote URLs are untouched.
- **Safety:** A retry is allowed only for a pre-connection runtime-initialization failure. No generic retry wraps pushes or other writes.
- **Cancellation:** The caller's signal gates the retry and is passed unchanged to the fallback process.
- **Scope:** The independent `windows/` package is not modified because the current acceptance target is the primary application Windows version.

## Success Criteria

When native Git on Windows reports the exact bundled MSYS SSH `add_item ... errno 1` startup failure, Hobgoblin retries once through Windows native OpenSSH and returns the fallback result. Every other platform, backend, command success, and failure path retains its current behavior.
