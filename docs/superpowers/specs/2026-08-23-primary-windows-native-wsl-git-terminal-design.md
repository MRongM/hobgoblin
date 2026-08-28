# Primary Windows Native/WSL Git And Terminal Design

## Goal

Make the primary application Windows version reliably operate local Windows repositories and WSL projects while preserving the existing distinction between a project's Git execution environment and its interactive terminal shell.

## Product Boundary

This work targets the primary application built from the root `src/` tree. The independent `windows/` package is comparison evidence only and is not an acceptance target.

The execution matrix is:

| Project identity                         | Hobgoblin Git backend              | Automatic internal terminal                                                   |
| ---------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------- |
| Local Windows path such as `C:\src\repo` | Git for Windows                    | WSL in the same Windows path when representable, then PowerShell/cmd fallback |
| `wsl://<distribution>/<linux-path>`      | Linux Git inside that distribution | Linux shell inside the same distribution and path                             |
| `ssh-config://<host>/<remote-path>`      | Git on the SSH host                | Shell on the same SSH host and path                                           |

Choosing a WSL shell for a local Windows project never changes its project identity or Hobgoblin Git backend. An interactive `git` typed in that shell is intentionally the distribution's Git and may use different configuration, credentials, hooks, and line-ending policy from Git for Windows.

## Current Architecture To Preserve

- `src/server/modules/repo-backend.ts` owns local versus WSL/SSH repository routing.
- WSL projects retain opaque `wsl://` identities and execute structured `wsl.exe --distribution ... --exec sh -lc ...` invocations.
- `src/server/terminal/terminal-worker-host.ts` already isolates terminal sessions in a child worker process. This supplies the important PTY crash boundary without copying VS Code's PTY Host implementation.
- `src/server/terminal/terminal-session-manager.ts` remains the authoritative session, attachment, replay, and controller owner.
- WSL/SSH cross-server terminal persistence remains an explicit tmux capability. Native terminal processes do not survive a complete Hobgoblin server restart.

## Native Windows Git

Git execution remains centralized in `src/system/git/helper.ts`. A focused resolver finds Git for Windows in this order:

1. `%ProgramW6432%\Git\cmd\git.exe`
2. `%ProgramFiles(x86)%\Git\cmd\git.exe`
3. `%ProgramFiles%\Git\cmd\git.exe`
4. `%LocalAppData%\Programs\Git\cmd\git.exe`
5. `git.exe` in absolute inherited `PATH` directories

Relative `PATH` entries and the repository working directory are never searched. This prevents an untrusted repository from shadowing Git. Non-Windows platforms continue using `git` through their inherited `PATH`.

Every application-owned Git process receives a deterministic non-interactive output environment:

- `LANGUAGE=en`
- `LC_ALL=en_US.UTF-8`
- `LANG=en_US.UTF-8`
- `GIT_PAGER=cat`

Command-scoped proxy variables remain supported. Hobgoblin does not set `GIT_TERMINAL_PROMPT=0`, because configured credential helpers and SSH agents must remain usable.

## WSL Capability And Terminal Working Directory

WSL enumeration explicitly requests the legacy UTF-16LE output contract with `WSL_UTF8=0` and decodes it as UTF-16LE. This matches the stable `wsl.exe --list --quiet` behavior used by VS Code and preserves non-ASCII distribution names.

For a local Windows drive project, the automatic WSL candidate starts with:

```text
wsl.exe --cd <absolute-windows-working-directory>
```

The path remains a structured argv value. Hobgoblin does not interpolate it into a shell command.

An ordinary Windows UNC working directory is not automatically representable inside WSL. For that case the WSL candidate is omitted and the existing native PowerShell/cmd fallback is used. A WSL project never uses this local-shell path; it already launches its exact distribution and absolute Linux directory through the remote terminal invocation.

## WSL Git Network Settings

The existing Git proxy and timeout preferences apply to application-owned Git running locally on Windows and inside WSL projects. SSH projects remain unchanged and do not receive these local proxy settings.

For WSL commands, proxy variables are added only to the `wsl.exe` child process and named in `WSLENV`, allowing WSL to import them without shell interpolation. Existing `WSLENV` entries and flags are retained and deduplicated. The proxy value is never logged or written to Git configuration, shell profiles, or global environment settings.

The affected WSL Git network operations are fetch, named fetch, pull, push, exact worktree-head push, remote tag discovery, remote branch/tag deletion, and local-tag push. The configured Git network timeout replaces the default remote command timeout only for those WSL network commands.

## Credentials

This phase keeps credentials owned by their execution environment:

- Git for Windows uses its configured Git Credential Manager, credential helpers, and Windows SSH agent.
- WSL Git uses helpers and agents configured inside the selected distribution.
- SSH projects continue using the existing SSH configuration and agent behavior.

A VS Code-style IPC Askpass UI and cross-environment secret relay are deliberately excluded. They require a separate security and cancellation design and are not necessary to fix executable discovery, path correctness, or WSL proxy propagation.

## Failure Semantics

- Missing Git for Windows maps to the existing `error.git-not-found` availability failure.
- Missing or unusable WSL silently removes WSL from automatic local terminal candidates.
- A Windows drive path is passed to `wsl.exe --cd` without shell parsing.
- A UNC path falls back to native shells instead of launching WSL into an unrelated directory.
- Invalid proxy URLs continue to produce no proxy environment.
- Proxy and timeout settings never alter SSH repository execution.

## Verification

Focused public-boundary tests cover:

- Git for Windows discovery order, path safety, and stable child environment.
- UTF-16LE WSL enumeration and non-ASCII distribution names.
- WSL `--cd` launch arguments and UNC fallback.
- `WSLENV` merging without SSH leakage.
- WSL network options from server settings through repository routing to remote Git command options.

Repository verification runs:

```bash
bun run typecheck
bun run check:architecture
bun run test
```

Exact Windows/WSL packaged runtime proof remains a final handoff because this macOS workspace cannot execute `git.exe`, `wsl.exe`, or ConPTY.

## Non-Goals

- The independent `windows/` package.
- A persisted internal-terminal shell or WSL distribution selector.
- A separate replacement PTY Host or native terminal survival across a complete server restart.
- Automatic credential copying between Windows and WSL.
- An in-app Askpass credential prompt.
- Installing or configuring Git, WSL, distributions, credential helpers, or SSH agents.
