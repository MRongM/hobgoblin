# Hobgoblin

[English](README.md) | 简体中文 | [한국어](README.ko.md) | [日本語](README.ja.md)

Hobgoblin 不只是一个分支管理工具。它是一个基于 Git worktree 开发方式、配合 AI CLI 使用的高生产力工作区，既可以作为桌面应用使用，也可以通过 server mode 在 Web 浏览器中访问。

它的核心模型很简单：**多项目 + 多 worktree / 多分支 + 多终端**。你可以同时打开多个仓库，把并行分支隔离到不同 worktree，把终端绑定到正确上下文，并在其中运行 Codex、Claude 等 AI CLI，而不会丢失当前 Git 状态。它支持本地仓库、Git SSH 远程地址，也支持通过 SSH config alias 和远程路径打开 SSH 远程仓库。

## 截图

<p>
  <img src="docs/screenshot-20260626-143532.png" alt="Hobgoblin 工作区纵览" width="49%" />
  <img src="docs/screenshot-20260626-144523.png" alt="Hobgoblin 仓库工作区" width="49%" />
</p>

## 生产力公式

```text
Hobgoblin = 多项目 x 多 worktree / 多分支 x 多终端
```

这就是 Hobgoblin 的目标工作流：每个项目、worktree、分支、终端和 AI CLI 会话，都保持在同一个可理解 Git 状态的工作区里。

## 起源

Hobgoblin 起源于 [Goblin](https://nano-props.github.io/goblin/)。Goblin 是一个小而美的 macOS 桌面项目，专注于一眼看清多个仓库里的 Git 分支和 worktree。如果你想体验最初那个轻量的分支/worktree 纵览，Goblin 仍然值得一看；Hobgoblin 则在这个想法之上扩展出 AI CLI 会话、多终端、server mode 和更完整的仓库工作流。

## 产品特点

- **面向 AI CLI 的工作流：** 把代码代理、Shell 任务和 Git 状态放在同一个工作上下文里，而不是散落在互不相关的终端窗口中。
- **多项目工作区：** 以标签页打开多个仓库，支持排序，并在下次启动时恢复会话。
- **桌面或 Web 浏览器使用：** 可以使用打包后的桌面应用，也可以启动 server mode，在浏览器中打开同一个工作区。
- **多 worktree 分支开发：** 为并行分支创建和查看独立 worktree，让多个分支互不污染地推进。
- **分支与 worktree 纵览：** 在一个窗口里查看分支状态、worktree 状态、最新提交和关联 Pull Request。
- **上下文内 Git 操作：** 支持 checkout、pull、push、创建 worktree、在外部工具打开分支，以及跳转到 GitHub。
- **多终端执行界面：** 多个服务端托管终端跟随工作区管理，并绑定到对应分支或 worktree 上下文。
- **本地与 SSH 远程仓库：** 支持本地路径、SSH clone URL，也支持通过 SSH config alias 和远程路径打开远程仓库。
- **可视化操作工作流：** 在清晰的界面上下文中浏览分支、切换仓库、触发 Git 操作并跳转外部工具。
- **主题与语言：** 支持浅色、深色和主题预设，并提供英语、简体中文、韩文、日文界面文案。

## 魔法操作

- **终端二进制粘贴：** 在终端输入框粘贴二进制剪贴板内容，自动生成临时文件，并把生成的文件路径插入输入框。
- **从文件树拖拽到终端：** 将文件树中的文件拖到终端，直接插入 shell 安全的文件路径，避免手动输入。
- **剪贴板文件流转：** 支持通过 `Ctrl+Shift+V` 将剪贴板文本写入文件，也支持通过 `Ctrl+Shift+C` 将文件文本复制到系统剪贴板。
- **终端 tab 跳转：** 双击当前终端 tab，可将该终端滚动到底部。
- **终端到文件树导航：** 终端输出中的仓库相对路径可被探测并点击跳转，在文件树中定位对应文件。
- **tmux 会话保持：** 在可用时探测并使用 tmux 托管远程终端会话，让远程终端状态可恢复。
- **浏览器访问项目：** 启动 server mode 后，可以从 Web 浏览器打开项目工作区。
- **手机浏览器接管终端：** 使用浏览器可访问模式时，可从手机浏览器接管终端会话，便于移动场景继续操作。

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

## Web 浏览器 / Server Mode

构建 Web UI 并启动 server mode，然后在 Web 浏览器中打开 Hobgoblin：

```sh
./serve.sh
```

默认浏览器地址：

```text
http://127.0.0.1:32200
```

需要暴露到不同网卡或端口时，可以覆盖监听地址：

```sh
./serve.sh --host 127.0.0.1 --port 32200
```

## 链接

- [GitHub Pages](https://mrongm.github.io/hobgoblin/)
- [源代码](https://github.com/MRongM/hobgoblin)
- [Releases](https://github.com/MRongM/hobgoblin/releases)

## 许可证

Hobgoblin 使用 MIT 许可证。
