# Hobgoblin

[English](README.md) | 简体中文 | [한국어](README.ko.md) | [日本語](README.ja.md)

Hobgoblin 是一个面向 Git 分支和 worktree 的桌面工作区。它可以同时打开多个仓库，快速理解分支状态，并在一个窗口里完成常见 Git 操作，减少在终端、编辑器和浏览器标签页之间来回切换。

## 产品特点

- **多仓库工作区：** 以标签页打开仓库，支持排序，并在下次启动时恢复会话。
- **分支与 worktree 纵览：** 在一个窗口里查看分支状态、worktree 状态、最新提交和关联 Pull Request。
- **上下文内 Git 操作：** 支持 checkout、pull、push、创建 worktree、在外部工具打开分支，以及跳转到 GitHub。
- **服务端托管终端：** 终端跟随工作区管理，并适配小屏幕紧凑布局。
- **本地与 SSH 仓库：** 支持本地路径，也支持面向 SSH 的远程仓库流程。
- **键盘优先：** 用键盘浏览分支、切换仓库和触发操作。
- **主题与语言：** 支持浅色、深色和主题预设，并提供英语、简体中文、韩文、日文界面文案。

## 安装步骤

从 [GitHub Releases](https://github.com/MRongM/hobgoblin/releases) 下载最新构建。

按平台选择文件：

- **macOS Apple Silicon：** 下载 `arm64.dmg` 文件。
- **macOS Intel：** 下载 `x64.dmg` 文件。
- **Windows x64：** 下载 `.exe` 安装程序。

当前构建未签名。

在 macOS 上，Gatekeeper 可能会阻止下载后的应用。如果出现这种情况，可以右键应用，选择 **打开**，然后确认。安装后也可以移除隔离标记：

```sh
xattr -dr com.apple.quarantine /Applications/Hobgoblin.app
```

在 Windows 上，SmartScreen 可能会对未签名安装程序发出警告。只有在信任该 GitHub Release 来源时才继续安装。

## 本地构建与安装

环境要求：

- Bun
- Node.js 24+

在 macOS 上构建并安装桌面应用：

```sh
bun run install:app
```

该命令会构建当前主机架构的 `Hobgoblin.app`，并安装到 `~/Applications`。

## 开发

安装依赖并启动开发应用：

```sh
bun install
bun run dev
```

## Server Mode

构建 Web UI 并启动 server mode：

```sh
./serve.sh
```

默认地址：

```text
http://127.0.0.1:32200
```

需要时可以覆盖监听地址：

```sh
./serve.sh --host 127.0.0.1 --port 32200
```

## 链接

- [GitHub Pages](https://mrongm.github.io/hobgoblin/)
- [源代码](https://github.com/MRongM/hobgoblin)
- [Releases](https://github.com/MRongM/hobgoblin/releases)

## 许可证

Hobgoblin 使用 MIT 许可证。
