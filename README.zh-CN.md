# Hobgoblin

[English](README.md) | 简体中文 | [한국어](README.ko.md) | [日本語](README.ja.md)

Hobgoblin 不只是一个分支管理工具。它是一个基于 Git worktree 开发方式、配合 AI CLI 使用的高生产力工作区，既可以作为桌面应用使用，也可以通过 server mode 在 Web 浏览器中访问。

它的核心模型很简单：**多项目 + 多 worktree / 多分支 + 多终端**。你可以同时打开多个仓库，把并行分支隔离到不同 worktree，把终端绑定到正确上下文，并在其中运行 Codex、Claude 等 AI CLI，而不会丢失当前 Git 状态。它支持本地仓库、Git SSH 远程地址，也支持通过 SSH config alias 和远程路径打开 SSH 远程仓库。

## 生产力公式

```text
Hobgoblin = 多项目 x 多 worktree / 多分支 x 多终端
```

这就是 Hobgoblin 的目标工作流：每个项目、worktree、分支、终端和 AI CLI 会话，都保持在同一个可理解 Git 状态的工作区里。

## 工作区开发模型

Hobgoblin 将产品工作区和其中的 Git 仓库视为相互关联但边界清晰的两个层级：

- **多仓库工作区：** 在一个可读根目录下组织选定仓库。根目录承载共享文件和根级终端，每个成员仓库仍独立拥有分支、worktree、状态、历史和 Git 写操作。
- **Branch workspace（分支工作区）：** 在父工作区内建立面向一个分支的完整工作上下文。选定仓库的成员 worktree 使用同一个分支名，但每个成员仍是独立的 Git 操作边界。

推荐流程如下：

1. 配置属于当前工作区的成员仓库。
2. 创建 Branch workspace，并为每个选定仓库明确选择基线分支。
3. 按需复制或符号链接工作区依赖，然后从分支工作区根目录或单个成员 worktree 开始工作。
4. 开发和测试期间，让 AI CLI 与终端会话始终绑定到对应根级或成员上下文。
5. 工作就绪后，对选定成员执行提交、拉取、推送、合入或合出。

跨仓库操作按配置顺序执行；单个成员失败不会阻断后续成员，错误会在结束后统一汇总。系统保留已完成成员的结果，并且不会伪装成可以自动回滚的原子事务。

## 起源

Hobgoblin 起源于 [Goblin](https://nano-props.github.io/goblin/)。Goblin 是一个小而美的 macOS 桌面项目，专注于一眼看清多个仓库里的 Git 分支和 worktree。如果你想体验最初那个轻量的分支/worktree 纵览，Goblin 仍然值得一看；Hobgoblin 则在这个想法之上扩展出 AI CLI 会话、多终端、server mode 和更完整的仓库工作流。

## 产品特点

- **面向 AI CLI 的工作流：** 把代码代理、Shell 任务和 Git 状态放在同一个工作上下文里，而不是散落在互不相关的终端窗口中。
- **项目与多仓库工作区：** 打开单个仓库、普通目录或由多个独立仓库组成的已配置工作区，并在下次启动时恢复。
- **Branch workspace：** 在共同分支上下文中跨选定仓库 worktree 开发一个功能，同时保留根级和成员级文件、终端体验。
- **桌面或 Web 浏览器使用：** 可以使用打包后的桌面应用，也可以启动 server mode，在浏览器中打开同一个工作区。
- **多 worktree 分支开发：** 为并行分支创建和查看独立 worktree，让多个分支互不污染地推进。
- **分支与 worktree 纵览：** 在一个窗口里查看分支状态、worktree 状态、最新提交和关联 Pull Request。
- **上下文内 Git 操作：** 支持 checkout、pull、push、创建 worktree、在外部工具打开分支，以及跳转到 GitHub。
- **多终端执行界面：** 多个服务端托管终端跟随工作区管理，并绑定到对应分支或 worktree 上下文。
- **本地与 SSH 远程仓库：** 支持本地路径、SSH clone URL，也支持通过 SSH config alias 和远程路径打开远程仓库。
- **Android 移动端：** 保存 SSH Host，打开远程 Project 与 Worktree，保留终端会话、管理端口转发，并在离开桌面后继续工作。
- **tmux 会话连续性：** 在项目级隔离的 tmux server 上显式创建或重连确定性的 Hobgoblin 会话，并可从 Android 发现或恢复 Hobgoblin 与默认 tmux 会话。
- **可视化操作工作流：** 在清晰的界面上下文中浏览分支、切换仓库、触发 Git 操作并跳转外部工具。
- **主题与语言：** 支持浅色、深色和主题预设，并提供英语、简体中文、韩文、日文界面文案。

## 魔法操作

- **使用 `hob` 打开项目（macOS）：** 在终端运行 `hob .` 或 `hob <目录>`，即可在 Hobgoblin 中打开或导入对应的本地目录。
- **全局终端切换：** 聚焦内部终端后，在 macOS 使用 `Cmd+Option+↑/↓`，在 Windows/Linux 使用 `Ctrl+Alt+↑/↓`，可在不同项目和工作树的所有已打开内部终端之间切换。
- **终端二进制粘贴：** 在终端输入框粘贴二进制剪贴板内容，自动生成临时文件，并把生成的文件路径插入输入框。
- **从文件树拖拽到终端：** 将文件树中的文件拖到终端，直接插入 shell 安全的文件路径，避免手动输入。
- **双击文件树文件：** 双击文件树中的文件，直接用已配置的编辑器打开该文件。
- **文件内容剪贴板快捷键：** 在 macOS 使用 `Cmd+Shift+C/V`，在 Windows/Linux 使用 `Ctrl+Shift+C/V`。`C` 会将当前聚焦文件的文本或图片内容复制到系统剪贴板，`V` 会用受支持的剪贴板文本或图片内容替换该文件。
- **终端 tab 跳转：** 双击当前终端 tab，可将该终端滚动到底部。
- **终端到文件树导航：** 终端输出中的仓库相对路径可被探测并点击跳转，在文件树中定位对应文件。
- **终端路径跳转编辑器：** 双击终端输出中识别到的仓库相对路径（支持 `path:line` 和 `path:line:column`），可用已配置的编辑器打开并定位到对应行列。
- **显式 tmux 会话复用：** 内部终端默认使用原生登录 shell。通过终端菜单或 item 菜单中的**使用 tmux 新建终端**，可在项目级 tmux server 上创建或连接稳定的本地/SSH `hobgoblin-v1-*` 会话。目标缺少 tmux 或启动失败时，终端会退出并提示改用 Native，绝不会静默启动原生 shell。外部终端操作始终使用原生 shell，旧 `goblin-*` 会话不会迁移。
- **Android tmux 恢复：** Android 的 tmux tab 会扫描选定 SSH Host 上项目级 server 与兼容默认 server 中符合当前协议的 Hobgoblin 会话，同时列出普通默认 tmux 会话，让你直接打开既有会话而不创建替代会话。
- **浏览器访问项目：** 启动 server mode 后，可以从 Web 浏览器打开项目工作区。
- **手机浏览器接管终端：** 使用浏览器可访问模式时，可从手机浏览器接管终端会话，便于移动场景继续操作。

## 安装步骤

从 [GitHub Releases](https://github.com/MRongM/hobgoblin/releases) 下载最新构建。

按平台选择文件：

- **macOS Apple Silicon：** 下载 `arm64.dmg` 文件。
- **macOS Intel：** 下载 `x64.dmg` 文件。
- **Windows x64：** 下载 `.exe` 安装程序。
- **Android：** 下载 `android.apk` 文件。该 APK 未签名，安装前必须先完成签名。
- **Linux Server Mode：** 下载面向部署的源码包 `Hobgoblin-<version>-linux-source.tar.gz`。

当前构建未签名。

在 macOS 上，Gatekeeper 可能会阻止下载后的应用。如果出现这种情况，可以右键应用，选择 **打开**，然后确认。安装后也可以移除隔离标记：

```sh
xattr -dr com.apple.quarantine /Applications/Hobgoblin.app
```

在 Windows 上，SmartScreen 可能会对未签名安装程序发出警告。只有在信任该 GitHub Release 来源时才继续安装。

### 在 macOS 终端中打开项目

将 `Hobgoblin.app` 移到 `/Applications` 后，安装用户级 `hob` 启动器：

```sh
mkdir -p "$HOME/.local/bin"
ln -s "/Applications/Hobgoblin.app/Contents/Resources/bin/hob" "$HOME/.local/bin/hob"
```

确认 `$HOME/.local/bin` 已加入 `PATH`，然后打开或导入当前目录：

```sh
hob .
```

该命令接受零个或一个目录参数，未传参数时默认使用当前目录。上面的链接命令不会覆盖已有的 `hob` 命令。

## 本地构建与安装

环境要求：

- Bun
- Node.js 24+

在 macOS 上构建并安装桌面应用：

```sh
bun run install:app
```

该命令会构建当前主机架构的 `Hobgoblin.app`、安装到 `~/Applications`，并在目标路径可用时安全创建 `$HOME/.local/bin/hob`；已有命令不会被覆盖。

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

### Linux systemd 部署

在使用 systemd 的 Linux 主机上安装 Node.js 24+ 与 Bun 1.3.11，从 GitHub Releases 下载 `Hobgoblin-<version>-linux-source.tar.gz`，然后解压并安装：

```sh
tar -xzf Hobgoblin-<version>-linux-source.tar.gz
cd Hobgoblin-<version>
./scripts/serve-systemd.sh
```

首次运行会安装服务，后续运行会更新现有部署。首次安装时如需明确配置监听地址、端口和持久化数据目录，可执行：

```sh
./scripts/serve-systemd.sh install \
  --host 0.0.0.0 \
  --port 32200 \
  --data-dir ./data/server
```

`0.0.0.0` 会监听所有网络接口；如果服务只应允许本机访问，请改用 `127.0.0.1`。

安装操作会执行 `bun install`、构建 Web UI、写入 `/etc/systemd/system/hobgoblin.service` 和 `/etc/hobgoblin/server.env`，然后启用并启动服务。非 root 用户运行时，脚本会使用 `sudo`。

常用维护命令：

```sh
./scripts/serve-systemd.sh update --no-pull
./scripts/serve-systemd.sh status
./scripts/serve-systemd.sh logs
./scripts/serve-systemd.sh uninstall
```

源码部署包不包含 Git 元数据，因此替换为新版归档内容后请使用 `update --no-pull`。Git clone 可直接使用 `update`，默认尝试执行 `git pull --ff-only`。`uninstall` 会停止并移除服务，但保留 `/etc/hobgoblin/server.env`；如果不再需要，请手动删除该文件。

## 链接

- [GitHub Pages](https://mrongm.github.io/hobgoblin/)
- [源代码](https://github.com/MRongM/hobgoblin)
- [Releases](https://github.com/MRongM/hobgoblin/releases)
