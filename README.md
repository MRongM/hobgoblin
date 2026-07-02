# Hobgoblin

English | [简体中文](README.zh-CN.md) | [한국어](README.ko.md) | [日本語](README.ja.md)

Hobgoblin is not just a branch management tool. It is a high-productivity workspace for Git worktree-based development with AI CLI tools, available as a desktop app or a browser-accessible server mode.

The core model is simple: **multi-project + multi-worktree / multi-branch + multi-terminal**. Open several repositories, isolate parallel branches in separate worktrees, attach terminals to the right context, and run AI CLI tools such as Codex or Claude without losing track of Git state. Work with local repositories, Git SSH remotes, or repositories reachable through SSH-config aliases.

## Screenshots

<p>
  <img src="docs/screenshot-20260626-143532.png" alt="Hobgoblin workspace overview" width="49%" />
  <img src="docs/screenshot-20260626-144523.png" alt="Hobgoblin repository workspace" width="49%" />
</p>

## Productivity Formula

```text
Hobgoblin = multi-project x multi-worktree / multi-branch x multi-terminal
```

This is the intended workflow: every project, worktree, branch, terminal, and AI CLI session stays connected to the same Git-aware workspace.

## Origins

Hobgoblin started from [Goblin](https://nano-props.github.io/goblin/), a small, focused macOS desktop app for seeing Git branches and worktrees across repositories at a glance. If you want the original lightweight branch/worktree overview, Goblin is still worth a look; Hobgoblin extends that idea into a broader workspace for AI CLI sessions, multiple terminals, server mode, and richer repository workflows.

## Product Features

- **AI CLI-ready workflow:** Keep coding agents, shell tasks, and Git state together instead of scattering them across unrelated terminal windows.
- **Multi-project workspace:** Open repositories in tabs, reorder them, and restore your previous session.
- **Desktop or web browser:** Use Hobgoblin as a packaged desktop app, or run server mode and open the same workspace from a browser.
- **Multi-worktree branch development:** Create and inspect worktrees so multiple branches can move independently without dirtying one checkout.
- **Branch and worktree overview:** See branch status, worktree state, latest commits, and linked pull requests in one window.
- **Git actions in context:** Checkout, pull, push, create worktrees, open branches in external tools, and jump to GitHub.
- **Multi-terminal execution surface:** Keep multiple server-backed terminals attached to the workspace and the branch/worktree they belong to.
- **Local and SSH remote repositories:** Work with local paths, SSH clone URLs, and remote repositories opened through SSH-config aliases and remote paths.
- **Visual workflow controls:** Navigate branches, switch repositories, trigger Git actions, and jump to external tools from clear interface context.
- **Themes and languages:** Use light, dark, and themed presets with English, Simplified Chinese, Korean, and Japanese UI strings.

## Magic Operations

- **Binary paste into terminal input:** Paste binary clipboard content into the terminal input to create temporary files and insert the generated file paths.
- **Drag from file tree to terminal:** Drag files from the file tree into the terminal to insert shell-safe paths without typing them manually.
- **Double-click file tree files:** Double-click a file in the file tree to open that exact file in the configured editor.
- **File-content clipboard shortcuts:** Use `Cmd+Shift+C` on macOS or `Ctrl+Shift+C` elsewhere to copy the focused file's text or image content to the system clipboard. Use `Cmd+Shift+V` / `Ctrl+Shift+V` to replace that focused file from supported clipboard text or image content.
- **Terminal tab jump:** Double-click the active terminal tab to scroll that terminal to the bottom.
- **Terminal-to-file-tree navigation:** Click detected repository-relative paths in terminal output to reveal them in the file tree.
- **Terminal path editor jump:** Double-click detected repository-relative paths in terminal output, including `path:line` and `path:line:column`, to open the configured editor at that file position.
- **Tmux-backed session resume:** Detect and use tmux-backed remote terminal sessions when available, keeping remote terminal state resumable.
- **Browser project access:** Run server mode and open the project workspace from a web browser.
- **Mobile terminal takeover:** Use browser-accessible mode from a phone browser to take over terminal sessions when you need to continue from mobile.

## Installation

Download the latest build from [GitHub Releases](https://github.com/MRongM/hobgoblin/releases).

Choose the artifact for your platform:

- **macOS Apple Silicon:** download the `arm64.dmg` file.
- **macOS Intel:** download the `x64.dmg` file.
- **Windows x64:** download the `.exe` installer.

The current builds are unsigned.

On macOS, Gatekeeper may block the app after download. If that happens, right-click the app, choose **Open**, and confirm. You can also remove the quarantine flag after installing:

```sh
xattr -dr com.apple.quarantine /Applications/Hobgoblin.app
```

On Windows, SmartScreen may warn about the unsigned installer. Continue only if you trust the GitHub Release source.

## Build and Install Locally

Requirements:

- Bun 1.3.11
- Node.js 24+

Build and install the desktop app on macOS:

```sh
bun run install:app
```

This builds a host-architecture `Hobgoblin.app` and installs it to `~/Applications`.

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

## Links

- [GitHub Pages](https://mrongm.github.io/hobgoblin/)
- [Source Code](https://github.com/MRongM/hobgoblin)
- [Releases](https://github.com/MRongM/hobgoblin/releases)

## License

Hobgoblin is MIT-licensed.
