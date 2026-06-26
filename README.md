# Hobgoblin

English | [简体中文](README.zh-CN.md) | [한국어](README.ko.md) | [日本語](README.ja.md)

Hobgoblin is a desktop workspace for Git branches and worktrees. It helps you open multiple repositories, understand branch state quickly, and take common Git actions without switching between terminals, editors, and browser tabs.

## Product Features

- **Multi-repository workspace:** Open repositories in tabs, reorder them, and restore your previous session.
- **Branch and worktree overview:** See branch status, worktree state, latest commits, and linked pull requests in one window.
- **Git actions in context:** Checkout, pull, push, create worktrees, open branches in external tools, and jump to GitHub.
- **Server-backed terminals:** Keep terminals attached to the workspace, including compact layouts for smaller screens.
- **Local and SSH repositories:** Work with local paths and remote repositories through SSH-focused flows.
- **Keyboard-first workflow:** Navigate branches, switch repositories, and trigger actions without leaving the keyboard.
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

## Server Mode

Build the web UI and start server mode:

```sh
./serve.sh
```

Default URL:

```text
http://127.0.0.1:32200
```

Override the listen address when needed:

```sh
./serve.sh --host 127.0.0.1 --port 32200
```

## Links

- [GitHub Pages](https://mrongm.github.io/hobgoblin/)
- [Source Code](https://github.com/MRongM/hobgoblin)
- [Releases](https://github.com/MRongM/hobgoblin/releases)

## License

Hobgoblin is MIT-licensed.
