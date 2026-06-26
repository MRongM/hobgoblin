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

- Bun
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
