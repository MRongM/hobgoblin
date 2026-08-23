# Hobgoblin

English | [简体中文](README.zh-CN.md) | [한국어](README.ko.md) | [日本語](README.ja.md)

Hobgoblin is not just a branch management tool. It is a high-productivity workspace for Git worktree-based development with AI CLI tools, available as a desktop app or a browser-accessible server mode.

The core model is simple: **multi-project + multi-worktree + multi-terminal**. Open several repositories, isolate parallel branches in separate worktrees, attach terminals to the right context, and run AI CLI tools such as Codex or Claude without losing track of Git state. Work with local repositories, Git SSH remotes, or repositories reachable through SSH-config aliases.

## Productivity Formula

```text
Hobgoblin = multi-project x multi-worktree x multi-terminal
```

This is the intended workflow: every project, worktree, branch, terminal, and AI CLI session stays connected to the same Git-aware workspace.

## Workspace Development Model

Hobgoblin treats a product workspace and its Git repositories as related but separate levels:

- A **multi-repository workspace** groups selected repositories under one readable root. The root owns shared files and root-level terminals, while every member repository keeps its own branches, worktrees, status, history, and Git writes.
- A **Branch workspace** creates one branch-focused context inside that parent workspace. It uses a common branch name across selected repository worktrees, but each member remains an independent Git operation boundary.

The recommended flow is:

1. Configure the repositories that belong to the workspace.
2. Create a Branch workspace, choosing the base branch for each selected repository.
3. Copy or symlink any optional workspace dependencies, then work from the Branch workspace root or an individual member worktree.
4. Keep AI CLI and terminal sessions attached to that root or member context while developing and testing.
5. Commit, pull, push, merge in, or merge out across selected members when the work is ready.

Cross-repository actions run in configured order, continue past isolated member failures, aggregate errors at the end, retain completed results, and never pretend to be an atomic transaction with automatic rollback.

## Origins

Hobgoblin started from [Goblin](https://nano-props.github.io/goblin/), a small, focused macOS desktop app for seeing Git branches and worktrees across repositories at a glance. If you want the original lightweight branch/worktree overview, Goblin is still worth a look; Hobgoblin extends that idea into a broader workspace for AI CLI sessions, multiple terminals, server mode, and richer repository workflows.

## Product Features

- **AI CLI-ready workflow:** Keep coding agents, shell tasks, and Git state together instead of scattering them across unrelated terminal windows.
- **Projects and multi-repository workspaces:** Open a repository, a plain directory, or a configured group of independent repositories and restore it later.
- **Branch workspaces:** Develop one feature across selected repository worktrees under a common branch context, with root-level and member-level files and terminals.
- **Desktop or web browser:** Use Hobgoblin as a packaged desktop app, or run server mode and open the same workspace from a browser.
- **Multi-worktree branch development:** Create and inspect worktrees so multiple branches can move independently without dirtying one checkout.
- **Branch and worktree overview:** See branch status, worktree state, latest commits, diffs, and working tree changes in one window.
- **Git actions in context:** Checkout, pull, push, create worktrees, open branches in external tools, and jump to GitHub.
- **Multi-terminal execution surface:** Keep multiple server-backed terminals attached to the workspace and the branch/worktree they belong to.
- **Local and SSH remote repositories:** Work with local paths, SSH clone URLs, and remote repositories opened through SSH-config aliases and remote paths.
- **Android mobile client:** Save SSH Hosts, open remote Projects and Worktrees, retain terminal sessions, manage port forwards, and continue work away from the desktop.
- **tmux session continuity:** Explicitly create or reconnect deterministic Hobgoblin sessions on project-scoped tmux servers, and discover or recover Hobgoblin and default tmux sessions from Android.
- **Visual workflow controls:** Navigate branches, switch repositories, trigger Git actions, and jump to external tools from clear interface context.
- **Themes and languages:** Use light, dark, and themed presets with English, Simplified Chinese, Korean, and Japanese UI strings.

## Magic Operations

- **Open a project with `hob` (macOS):** Run `hob .` or `hob <directory>` from a terminal to open or import that local directory in Hobgoblin.
- **Global terminal switching:** While an internal terminal is focused, use `Cmd+Option+Up/Down` on macOS or `Ctrl+Alt+Up/Down` on Windows/Linux to move through all open internal terminals across projects and worktrees.
- **Binary paste into terminal input:** Paste binary clipboard content into the terminal input to create temporary files and insert the generated file paths.
- **Drag from file tree to terminal:** Drag files from the file tree into the terminal to insert shell-safe paths without typing them manually.
- **Double-click file tree files:** Double-click a file in the file tree to open that exact file in the configured editor.
- **File-content clipboard shortcuts:** Use `Cmd+Shift+C` on macOS or `Ctrl+Shift+C` elsewhere to copy the focused file's text or image content to the system clipboard. Use `Cmd+Shift+V` / `Ctrl+Shift+V` to replace that focused file from supported clipboard text or image content.
- **Terminal tab jump:** Double-click the active terminal tab to scroll that terminal to the bottom.
- **Terminal-to-file-tree navigation:** Click detected repository-relative paths in terminal output to reveal them in the file tree.
- **Terminal path editor jump:** Double-click detected repository-relative paths in terminal output, including `path:line` and `path:line:column`, to open the configured editor at that file position.
- **Explicit tmux session reuse:** Internal terminals use the native login shell by default. Choose **New terminal with tmux** from terminal or item menus to create or attach to a stable local or SSH `hobgoblin-v1-*` session on a project-scoped tmux server. If tmux is unavailable or startup fails, the terminal exits with guidance to choose Native instead; it never silently starts a native shell. External-terminal actions stay native, and legacy `goblin-*` sessions are not migrated.
- **Android tmux recovery:** The Android tmux tab scans a selected SSH Host for current-protocol Hobgoblin sessions on project-scoped and compatibility default servers, alongside ordinary default tmux sessions, so an existing session can be opened without creating a replacement.
- **Browser project access:** Run server mode and open the project workspace from a web browser.
- **Mobile terminal takeover:** Use browser-accessible mode from a phone browser to take over terminal sessions when you need to continue from mobile.

## Installation

Download the latest build from [GitHub Releases](https://github.com/MRongM/hobgoblin/releases).

Choose the artifact for your platform:

- **macOS Apple Silicon:** download the `arm64.dmg` file.
- **macOS Intel:** download the `x64.dmg` file.
- **Windows x64 / ARM64:** download the `.exe` installer that matches your device architecture.
- **Android:** download the `android.apk` file. The APK is unsigned and must be signed before installation.
- **Linux Server Mode:** download `Hobgoblin-<version>-linux-source.tar.gz` for the deployment-focused source archive.

Git 2.31.0 or later must be available in `PATH` for local repository operations. When working with repositories over SSH, Git 2.31.0 or later must also be installed on the remote host.

The current builds are unsigned.

On macOS, Gatekeeper may block the app after download. If that happens, right-click the app, choose **Open**, and confirm. You can also remove the quarantine flag after installing:

```sh
xattr -dr com.apple.quarantine /Applications/Hobgoblin.app
```

On Windows, SmartScreen may warn about the unsigned installer. Continue only if you trust the GitHub Release source.

On Windows, WSL with a Unix-like terminal environment is recommended. When a usable default WSL distribution is installed, Hobgoblin prefers it for internal terminals and external Windows Terminal launches, while retaining native Windows shell fallbacks when WSL is unavailable.

### Open Projects from the Terminal on macOS

After moving `Hobgoblin.app` to `/Applications`, install the user-scoped `hob` launcher:

```sh
mkdir -p "$HOME/.local/bin"
ln -s "/Applications/Hobgoblin.app/Contents/Resources/bin/hob" "$HOME/.local/bin/hob"
```

Make sure `$HOME/.local/bin` is in `PATH`, then open or import the current directory:

```sh
hob .
```

The command accepts zero or one directory argument and defaults to the current directory. The link command intentionally does not overwrite an existing `hob` command.

## Build and Install Locally

Requirements:

- Bun 1.3.11
- Node.js 24+

Build and install the desktop app on macOS:

```sh
bun run install:app
```

This builds a host-architecture `Hobgoblin.app`, installs it to `~/Applications`, and safely creates `$HOME/.local/bin/hob` when that path is available. It never overwrites an existing command.

### Fast Windows build from WSL

When the repository is on a Windows-mounted drive, build the primary Windows app with the Windows-native toolchain from WSL:

```bash
bash scripts/build-windows-from-wsl.sh
```

The default creates `release/win-unpacked`. Pass `--installer` for the NSIS installer, `--install` to build and silently install it, `--typecheck` to verify first, `--clean` to clear only `release/`, or `--arch arm64` for Windows ARM64. If Windows exposes a local proxy, pass its URL or port, for example `--proxy 7890`. The script verifies and reuses either its ignored `tmp/electron-cache` or a matching Windows Electron cache before downloading through npmmirror.

## Develop

Install dependencies and start the development app:

```sh
bun install
bun run dev
```

## Web Browser / Server Mode

Build the web UI and start server mode, then open Hobgoblin from a web browser:

```sh
./serve.sh
```

Default browser URL:

```text
http://127.0.0.1:32200
```

Override the listen address when you need to expose it on a different interface or port:

```sh
./serve.sh --host 127.0.0.1 --port 32200
```

### Linux systemd deployment

On a Linux host that uses systemd, install Node.js 24+ and Bun 1.3.11, download `Hobgoblin-<version>-linux-source.tar.gz` from GitHub Releases, then extract and install it:

```sh
tar -xzf Hobgoblin-<version>-linux-source.tar.gz
cd Hobgoblin-<version>
./scripts/serve-systemd.sh
```

On the first run, the command installs the service. On later runs, it updates the existing deployment. To configure the listen address, port, and persistent data directory explicitly during the first installation:

```sh
./scripts/serve-systemd.sh install \
  --host 0.0.0.0 \
  --port 32200 \
  --data-dir ./data/server
```

`0.0.0.0` listens on all network interfaces. Use `127.0.0.1` instead when the service should only be reachable from the local host.

Installation runs `bun install`, builds the Web UI, writes `/etc/systemd/system/hobgoblin.service` and `/etc/hobgoblin/server.env`, then enables and starts the service. The script uses `sudo` when it is not run as root.

Common maintenance commands:

```sh
./scripts/serve-systemd.sh update --no-pull
./scripts/serve-systemd.sh status
./scripts/serve-systemd.sh logs
./scripts/serve-systemd.sh uninstall
```

The deployment archive has no Git metadata, so use `update --no-pull` after replacing its files with a newer archive. A Git clone may use `update` without that flag to attempt `git pull --ff-only`. `uninstall` stops and removes the service but keeps `/etc/hobgoblin/server.env`; delete that file manually if it is no longer needed.

## Links

- [GitHub Pages](https://mrongm.github.io/hobgoblin/)
- [Source Code](https://github.com/MRongM/hobgoblin)
- [Releases](https://github.com/MRongM/hobgoblin/releases)
