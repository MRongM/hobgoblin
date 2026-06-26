# Git 网络代理与超时设计

**日期:** 2026-06-26  
**状态:** 已确认设计；尚未开始实现

## 概述

Hobgoblin 当前本地 Git 网络操作已有固定超时：`fetch`、`pull`、`push` 使用统一网络超时，`clone` 使用更长的固定超时。用户在 VPN 或代理网络下同步远程仓库时，需要可配置的超时时间，并需要在设置页配置 Git 网络代理。

本设计增加一个全局的 `设置 > 代理` 页面，首版只覆盖本地仓库的 Git 网络操作：`fetch`、`pull`、`push`、`clone`。代理配置只在单次 Git 子进程执行时注入，不写入用户的 Git 全局配置、仓库配置或系统环境。

## 目标

- 支持配置本地 Git 网络操作的超时时间。
- 支持配置全局 Git 网络代理，代理协议支持 `http://`、`https://`、`socks5://`。
- 覆盖本地仓库的 `fetch`、`pull`、`push`、`clone`。
- 保持代理配置命令级生效，不污染用户系统、全局 Git 配置或仓库配置。
- 在 `设置 > 代理` 中集中管理代理和 Git 网络超时。
- 保持现有分层：web 只负责设置界面，server 拥有设置和 repo 操作编排，system 执行 Git 命令。

## 非目标

- 不自动代理 SSH remote 的 Git 操作。
- 不修改远程 SSH 仓库执行环境。
- 不写入 `git config --global http.proxy` 或仓库 `.git/config`。
- 不支持按 host、repo、remote 单独配置代理。
- 不改变普通非网络 Git 命令的默认超时。
- 不重新设计现有 fetch、pull、push、clone 的用户交互。

## 设置模型

在 `SettingsPrefs` 中新增三个小型字段：

```ts
gitNetworkProxyEnabled: boolean
gitNetworkProxyUrl: string
gitNetworkTimeoutSec: number
```

默认值：

- `gitNetworkProxyEnabled = false`
- `gitNetworkProxyUrl = ''`
- `gitNetworkTimeoutSec = 120`

server settings source 负责持久化和归一化：

- 代理关闭或 URL 为空时视为无代理。
- 代理 URL 仅接受 `http://`、`https://`、`socks5://`。
- 超时秒数归一化到 `15` 到 `900` 秒。
- 旧设置文件缺少字段时使用默认值。

## 架构

设置仍由 server 拥有。web 设置页通过现有 settings 写路径更新偏好，不直接参与 Git 执行。

本地 repo 写路径在执行网络操作前读取当前 `SettingsPrefs`，构造一个小型 Git 网络运行配置，并传给 system 层。system 层只接收归一化后的运行配置，不读取设置文件。

建议在 `src/system/git/helper.ts` 增加可选网络运行配置：

```ts
interface GitNetworkOptions {
  timeoutMs: number
  proxyUrl?: string
}
```

`fetchAll`、`pullBranch`、`pushBranch`、`cloneRepository` 接收该配置并传给 `gitResultWithOptions`。普通 Git 读操作、状态读取、历史读取、worktree 操作、commit、merge、reset 等继续使用现有超时策略。

远程 SSH backend 不消费该配置。页面文案明确说明：SSH remote 继续通过 `~/.ssh/config` 的 `ProxyCommand`、`ProxyJump` 或用户自有 SSH 配置处理代理。

## Git 执行流

本地 `fetch`：

1. server 收到 fetch 请求。
2. server 读取当前设置并构造网络配置。
3. local repo backend 调用 `fetchAll(repoId, signal, networkOptions)`。
4. Git helper 使用配置的 `timeoutMs` 和代理环境执行 `git fetch`。

本地 `pull` 与 `push`：

1. server 使用现有 cancellable network op 机制合并用户取消信号。
2. server 读取当前设置并构造网络配置。
3. local repo backend 调用 `pullBranch` 或 `pushBranch`。
4. Git helper 使用配置的 `timeoutMs` 和代理环境执行网络 Git 命令。

本地 `clone`：

1. server 校验 clone 输入和目标目录。
2. server 读取当前设置并构造网络配置。
3. `cloneRepository` 使用配置的超时和代理环境执行 `git clone`。

远程 SSH repo：

- `fetchRemoteRepository`、`pullRemoteBranch`、`pushRemoteBranch` 保持现状。
- 不把本地代理设置注入到远端 shell。

## 代理注入

代理只通过当前 Git 子进程环境变量注入。实现需要在保留 `process.env` 的基础上覆盖 Git 网络相关变量。

规则：

- `http://...` 和 `https://...`
  - 设置 `HTTP_PROXY`
  - 设置 `HTTPS_PROXY`
  - 设置 `http_proxy`
  - 设置 `https_proxy`
- `socks5://...`
  - 设置 `ALL_PROXY`
  - 设置 `all_proxy`
  - 同时设置 `HTTPS_PROXY` 和 `https_proxy`，兼容 Git/libcurl 对 socks URL 的代理解析
- 代理关闭或 URL 无效
  - 不注入代理环境

不清除用户已有环境变量。首版只在用户启用 Hobgoblin 代理时覆盖上述变量；用户关闭代理时保持现有进程环境行为，避免引入与启动环境不一致的副作用。

## UI 设计

新增 `设置 > 代理` 导航项和页面。页面使用现有设置组件：

- `SettingsGroup`
- `SettingsList`
- `SettingsRow`
- `SettingsSelect`
- `SettingsNumberInput`
- 现有 input/control primitive

页面内容：

- “Git 网络代理”
  - 控件支持关闭和启用代理。
  - 代理 URL 输入框接受 `http://`、`https://`、`socks5://`。
  - hint 文案说明仅作用于本地仓库的 Git 网络操作。
- “Git 网络超时”
  - 数字输入，单位秒。
  - 范围为 `15` 到 `900` 秒。
  - hint 文案说明到时会取消当前 Git 子进程。
- 范围说明
  - 明确 SSH remote 不在首版代理范围内。
  - SSH remote 用户应继续使用 `~/.ssh/config` 处理代理。

`设置 > 同步` 保留自动 fetch 间隔，不承载代理配置。这样职责更清晰：同步页控制调度频率，代理页控制网络执行环境。

## 错误处理

- Git 超时时返回现有风格错误，例如 `git timed out after 120s`。
- 用户取消仍返回 `cancelled`。
- 代理 URL 非法时设置归一化为无代理，避免运行时注入错误值。
- Git stderr 仍使用现有 `stripNoise` 清理逻辑，代理连接失败等真实错误应保留给用户。
- fetch、pull、push、clone 失败后继续使用现有 toast、状态和 invalidation 行为。
- 远程 SSH repo 的网络失败不使用本地代理设置诊断，避免误导。

## 测试

settings 测试：

- 新字段默认值正确。
- 旧设置文件缺少新字段时回退默认值。
- `http://`、`https://`、`socks5://` 代理 URL 可保存。
- 非法代理 URL 被归一化为无代理。
- 超时小于 `15` 或大于 `900` 时被 clamp。

Git helper 测试：

- 无代理时不覆盖代理环境。
- HTTP/HTTPS 代理设置正确环境变量。
- SOCKS5 代理设置 `ALL_PROXY`、`all_proxy` 和 HTTPS 代理变量。
- 超时错误显示实际秒数。

Git operation 测试：

- `fetchAll` 使用自定义 timeout/proxy。
- `pullBranch` 使用自定义 timeout/proxy。
- `pushBranch` 使用自定义 timeout/proxy。
- `cloneRepository` 使用自定义 timeout/proxy。
- 非网络 Git 操作不受新设置影响。
- 远程 SSH backend 不消费本地代理配置。

UI 测试：

- `设置 > 代理` 导航项可见。
- 代理页面渲染代理控件、URL 输入、超时输入和范围说明。
- 修改代理设置走现有 settings 写路径。
- 修改超时设置走现有 settings 写路径。

验证命令：

- `bun run typecheck`
- `bun run test`
- `bun run check:architecture`

## 工程原则

- **KISS:** 首版只提供全局代理和全局超时，不引入 per-host 或 per-repo 配置。
- **YAGNI:** 不支持远程 SSH repo 自动代理，不写 Git config。
- **DRY:** 代理环境构造集中在 Git helper 或相邻小 helper 中，`fetch`、`pull`、`push`、`clone` 复用。
- **SOLID:** 设置持久化、server 编排、Git 命令执行、UI 表单各自保持单一职责。
