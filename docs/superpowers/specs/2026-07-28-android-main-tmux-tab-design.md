# Android 主页 tmux Tab UI/UX 设计

**日期**：2026-07-28  
**状态**：已确认，自主 inline 实施  
**重构范围**：取代 `2026-07-28-android-host-tmux-catalog-design.md` 中“主机详情内项目 / tmux 双 Tab”的导航与界面安排；远端扫描协议、恢复身份、生命周期动作和删除安全语义保持不变。

## 目标

把 tmux 从单台主机详情里的次级功能提升为 Android 主页一级目的地。用户每次进入 tmux Tab 都先明确选择一台已保存主机，选择后立即扫描并显示该主机的 Hobgoblin tmux 会话；主机详情恢复为只承载该主机项目的简单详情页。

## 信息架构

主页导航固定为：`主机 → 项目 → tmux → 终端`。

- **主机**：保存、诊断和管理 SSH 主机。
- **项目**：管理设备本地保存的远程项目。
- **tmux**：按一次明确选择的主机扫描远端会话并执行恢复动作。
- **终端**：汇总设备本地 retained terminal。

主机详情不再显示 Tab Row，也不再扫描 tmux，只显示 `hostProfileId == hostId` 的项目。打开项目、项目终端以及返回主机详情的现有语义保留。

## 核心交互

tmux Tab 是一次访问内的两阶段状态机：

1. **选择主机**：每次从其他主页 Tab 进入时都没有预选值；不读取或恢复上次选择。
2. **扫描目录**：点击主机卡片后立即扫描，不增加第二个“开始扫描”按钮。

扫描页顶部显示本次选择的主机标题、SSH authority、“更换主机”和“刷新”。更换主机先回到选择态；选择另一台主机后丢弃旧主机快照并立即扫描。下拉刷新与“刷新”执行同一动作。

从目录打开或恢复 terminal 后，Back 返回本次 tmux Tab 的同一主机和目录上下文；从终端通知或全局“终端”Tab 打开的 terminal 仍返回“终端”。用户切换到任意其他主页 Tab 后，本次选择失效；下次进入必须重新选择。

## 状态与数据流

`AppRoute.Tmux(selectedHostId: String? = null)` 同时表达主页目的地和本次临时选择：

- 底栏点击 tmux 总是创建 `AppRoute.Tmux()`，因此不会继承旧选择。
- 点击主机后变为 `AppRoute.Tmux(host.id)` 并触发一次扫描。
- `AppRoute.Terminal` 使用独立的 `TmuxReturn(hostId)` 保存终端返回上下文。
- terminal Back 把 `TmuxReturn` 映射回 `AppRoute.Tmux(hostId)`；全局 Terminals 返回规则优先。
- `ResourceState<List<HostTmuxPathGroup>>` 仍是内存快照，不持久化、不轮询。
- 扫描结果必须与当前 `selectedHostId` 匹配；切换主机时旧结果不可短暂投影到新主机。

远端 `RemoteTmuxSessionService`、`HostDiscoveredTmuxSession`、`HostTmuxPathGroup`、精确 server target、retained terminal 恢复和远端安全关闭协议不变。

## 界面方向：便携式远程控制台

面向经常在手机上检查开发主机和恢复 CLI 工作的工程师。页面的单一任务是：明确目标主机，快速确认多路复用会话状态并恢复正确 terminal。

### 色彩 Token

- **Relay teal** `#2E6F6A`：主页选择、当前主机和 project-scoped server。
- **Mux copper** `#B86A3B`：tmux 一级入口、default server 和“多路复用轨道”签名元素。
- **Live moss** `#507A61`：健康主机与活动连接。
- **Frost canvas** `#F3F7F6`：浅色背景，降低长列表眩光。
- **Night ink** `#132027`：深色背景与高对比正文。
- **Fault red** `#C44949`：失败和破坏性动作，绝不用于普通强调。

保留 Material 3 的系统明暗模式与无障碍对比；颜色只编码真实含义，不增加装饰性渐变。

### 字体角色

- 标题与正文使用 Android 系统 sans，标题采用中等字重和紧凑行高。
- SSH authority、路径、server/session 后缀、`terminal-N` 使用系统 monospace，形成远程控制台的工具感并保持数据对齐。
- 不下载字体、不增加依赖；终端模拟器继续使用自己的 CJK 等宽字体。

### 布局

```text
选择态
┌──────────────────────────┐
│ tmux                 设置 │
│ 选择要扫描的主机           │
│ 扫描当前用户的会话 socket  │
│ ┌ 开发服务器          扫描 │
│ │ root@example.com:22     │
│ └────────────────────────┘
│ ┌ 构建机              扫描 │
│ │ ci@example.net:22       │
│ └────────────────────────┘
├──────────────────────────┤
│ 主机   项目   tmux   终端  │
└──────────────────────────┘

扫描态
┌──────────────────────────┐
│ tmux                 设置 │
│ ┌ 当前主机        更换主机 │
│ │ 开发服务器          刷新 │
│ │ root@example.com:22     │
│ └────────────────────────┘
│ /srv/projects/app         │
│ ║ terminal-1        空闲   │
│ ║ project server · …82ad  │
│ └────────────────────────┘
├──────────────────────────┤
│ 主机   项目   tmux   终端  │
└──────────────────────────┘
```

签名元素是 session 卡片左侧的 **mux rail**：一条窄双轨标识一个主机把多条终端会话汇聚在同一目录中。project-scoped server 使用 relay teal，default server 使用 mux copper；除此之外页面保持实色、克制和高密度。

## 反馈状态

- **无主机**：说明需要先添加 SSH 主机，并提供“添加主机”动作。
- **选择后加载**：显示所选主机与明确的“正在扫描 tmux 会话”，避免全屏无上下文进度。
- **成功空结果**：说明未发现带 Hobgoblin 元数据的活动会话，提供“重新扫描”和“更换主机”。
- **首次失败**：保留当前主机上下文，显示具体错误、“重试”和“更换主机”。
- **刷新失败**：保留旧目录并显示陈旧提示；会话动作仍可用。
- **主机被删除**：自动回到主机选择态并丢弃对应快照。
- **动作失败**：在目录内显示具体错误，不清空成功扫描结果。

## 可访问性与动效

- 所有主机卡片、刷新、更换主机和会话动作具有至少 48dp 触控目标和可读 content description。
- 不依靠颜色区分 server 来源；文字仍显示 `default server` 或 `project server`。
- 路径与协议名允许省略显示，但 accessibility 文本保留完整值。
- 只使用 Material 默认的页面/进度反馈，不增加持续脉冲或环境动画，因此自然兼容 reduced motion。

## 非目标

- 不记忆最近主机，不自动选择唯一主机。
- 不并行扫描多台主机，不提供聚合目录。
- 不改变远端扫描脚本、tmux 协议、session 身份或远端删除安全边界。
- 不把 tmux session 重新解释为项目、工作区或 Git 仓库。
- 不对 Android 所有业务页面做无关结构重写。

## 测试策略

- 主导航顺序、tmux 图标语义和左右滑动顺序。
- 每次底栏进入 tmux 都无预选主机；选中后才扫描。
- 主机切换丢弃旧快照，刷新保留同一主机，主机删除回到选择态。
- terminal 从 tmux 返回同一访问上下文，全局 Terminals 返回优先。
- 主机详情没有 Tab Row 或 tmux 扫描入口，只显示该主机项目。
- 选择、加载、空、失败、陈旧和目录状态的 UI 合同与四语言资源完整。
- 现有 tmux 协议、恢复、关闭和删除测试保持通过。
- 完成 Android unit test、assembleDebug、root typecheck/test 和 architecture check。

## 原则检查

- **KISS**：将现有目录整体搬到一级屏幕；选择即扫描，避免选择后再确认。
- **YAGNI**：不持久化主机、不聚合多主机、不改远端协议。
- **DRY**：tmux 目录、会话动作、状态投影和扫描服务只有一个实现。
- **SOLID**：导航返回上下文、扫描状态、Compose 展示和远端协议保持独立责任。
