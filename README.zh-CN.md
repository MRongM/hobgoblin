# Hobgoblin

[English](README.md) | 简体中文 | [한국어](README.ko.md) | [日本語](README.ja.md)

Hobgoblin 不只是一个分支管理工具。它是一个基于 Git worktree 开发方式、配合 AI CLI 使用的高生产力桌面工作区。

它的核心模型很简单：**多项目 + 多 worktree / 多分支 + 多终端**。你可以同时打开多个仓库，把并行分支隔离到不同 worktree，把终端绑定到正确上下文，并在其中运行 Codex、Claude 等 AI CLI，而不会丢失当前 Git 状态。

## 截图

| 工作区纵览 | 仓库工作区 |
| --- | --- |
| ![Hobgoblin 工作区纵览](docs/screenshot-20260626-143532.png) | ![Hobgoblin 仓库工作区](docs/screenshot-20260626-144523.png) |

## 生产力公式

```text
Hobgoblin = 多项目 x 多 worktree / 多分支 x 多终端
```

这就是 Hobgoblin 的目标工作流：每个项目、worktree、分支、终端和 AI CLI 会话，都保持在同一个可理解 Git 状态的工作区里。

## 产品特点

- **面向 AI CLI 的工作流：** 把代码代理、Shell 任务和 Git 状态放在同一个工作上下文里，而不是散落在互不相关的终端窗口中。
- **多项目工作区：** 以标签页打开多个仓库，支持排序，并在下次启动时恢复会话。
- **多 worktree 分支开发：** 为并行分支创建和查看独立 worktree，让多个分支互不污染地推进。
- **分支与 worktree 纵览：** 在一个窗口里查看分支状态、worktree 状态、最新提交和关联 Pull Request。
- **上下文内 Git 操作：** 支持 checkout、pull、push、创建 worktree、在外部工具打开分支，以及跳转到 GitHub。
- **多终端执行界面：** 多个服务端托管终端跟随工作区管理，并绑定到对应分支或 worktree 上下文。
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
