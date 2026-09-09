# Desktop 三栏工作区设计

## 目标

将宽屏 Electron 与宽屏浏览器的工作区统一为从左到右的三栏结构：工作区导航、终端/详情、文件区。文件区从导航栏下方完整移动到终端右侧，继续支持折叠、展开、拖拽调宽和独立窗口；紧凑 Mobile Web、Android 与独立 `windows/` 包保持不变。

## 已确认范围

- 作用于根 `src/web/` renderer 的宽屏模式，因此 Electron Desktop 与浏览器 Web 获得相同行为。
- 不修改 compact 模式的 `detail`、`scope`、`files` 单表面导航。
- 不修改 Android，也不修改独立 `windows/` 包。
- 不新增数据库、服务端设置、RPC 字段或实时同步路径。
- 根据布局变化只移除已经失去语义的“新项目默认文件区高度比例”设置；剪贴板大小上限、应用 UI 字体、文件区独立窗口等能力不受影响。

## 方案比较

### 方案 A：复用并嵌套现有 `SplitPane`（采用）

外层水平分栏把“导航 + 终端”与右侧文件区分开，内层水平分栏把导航与终端分开。现有 `detailPaneSizes` 继续控制内层终端占比，`fileTreePaneSizes` 改为控制外层右侧文件区宽度。

优点是复用已经验证的折叠、最小尺寸、拖拽和持久化行为，不需要新的面板状态模型。代价是保留两个历史命名偏宽泛的尺寸字段，但避免了一次无产品价值的数据迁移。

### 方案 B：新增原生三面板容器（不采用）

在一个 `ResizablePanelGroup` 中注册三个面板。DOM 更直接，但需要重新实现三面板受控布局、两个分隔条的尺寸换算以及折叠恢复，风险和测试面明显更大。

### 方案 C：CSS Grid 固定宽度（不采用）

结构最简单，但会丢失现有拖拽尺寸与恢复体验，并迫使用户接受固定宽度，不符合当前工作区行为。

## 目标布局

```text
┌──────────────────┬────────────────────────────┬──────────────────────┐
│ 工作区导航       │ 终端 / 详情                │ 文件区               │
│ 项目、仓库、分支 │ Terminal tabs + surface    │ Status/Files/Changes │
│                  │                            │ History/Local/Remote │
│ 状态栏           │                            │                      │
└──────────────────┴────────────────────────────┴──────────────────────┘
```

- 三栏均占据工作区完整高度；文件区不再出现在导航下方。
- 右侧文件区保留现有折叠语义。折叠后只显示导航与终端，终端获得释放的宽度。
- 现有 Terminal Focus 语义不变：它同时隐藏导航与文件区，仅显示终端；退出后恢复先前文件区折叠状态和两个分栏尺寸。
- 不新增独立的导航折叠状态。导航的整体隐藏继续由 Terminal Focus 负责，避免出现第二套容易冲突的“最大化终端”状态。

## 组件设计

### `RepoWorkspace`

`src/web/components/Layout.tsx` 中的 `RepoWorkspace` 升级为唯一的宽屏三栏组合器，接收：

- `navigationPane`
- `detailPane`
- `fileAreaPane`
- `detailSize` / `onDetailSizeChange`
- `fileAreaSize` / `onFileAreaSizeChange`
- `fileAreaCollapsed`

外层 `SplitPane` 的 trailing panel 是文件区，内层 `SplitPane` 的 trailing panel 是终端/详情。文件区最大宽度限制为 45%，导航与终端保留现有最小宽度约束。

`FileAreaSplitPane` 在三处调用完成迁移后不再承担独立职责，应连同其专属测试删除，避免保留只包装 `SplitPane` 的死抽象。

### 普通 Git 项目

`RepoExplorerPane` 在 desktop 分支中把自身拆成两个视觉表面：左侧项目头、仓库/分支导航和状态栏；右侧完整 `RepoWorktreeExplorer`。`RepoView` 将已有 `detailPane` 传入，由 `RepoExplorerPane` 通过 `RepoWorkspace` 完成三栏组合。

compact 分支仍然一次只渲染 scope 或 files；其状态切换和文件 reveal 不变。

### Plain workspace

`PlainWorkspacePane` 将 `PlainWorkspaceFileArea` 放到 `RepoWorkspace.fileAreaPane`。左栏保留项目头、多仓库导航（存在时）和状态栏；单一 plain workspace 的左栏仍是应用级项目切换与状态 chrome，不引入特殊双栏分支。

### Branch workspace

`BranchWorkspacePane` 将 workspace/member 文件区放到右栏，左栏仅保留项目头、成员导航和状态栏。父文件区与成员 `RepoWorktreeExplorer` 继续复用既有 tab、change badge、reveal 和 detach 行为。

## 状态与兼容性

- `fileAreaCollapsed` 继续是 renderer 本地交互状态，不写服务器或数据库。
- `detailFocusMode` 继续是 application-global restorable 状态。
- `repo.ui.fileTreePaneSizes` 继续按项目保存，字段不改名，只把 `left-right` 值解释为右侧文件区宽度比例。
- `state.fileTreePaneSizes` 保留为旧 session 与无项目 override 时的默认值，但设置页面不再允许直接编辑它。
- 文件区宽度归一化上限设为 45%，避免旧版高度值（例如 70%）在升级后占据大部分横向空间；默认值仍为 30%。无需重写持久化文件。
- `setDefaultFileTreePaneSize` 在设置入口移除后没有生产调用，应删除；按项目拖拽使用的 `setRepoFileTreePaneSize` 保留。

## 设置清理

`FileAreaSettings` 保留为 General 页面中的文件能力分组，但删除：

- `settings-file-tree-pane-size` 数字输入框；
- `settings.files.layout.title`；
- `settings.files.height-ratio`；
- `settings.files.height-ratio-hint`；
- 与默认高度输入框绑定的 store action。

剪贴板大小上限仍控制真实文件操作边界，因此保留。文件树字体已由通用 UI 字体控制，也保持现状。

## 错误与边界行为

- 未选择 worktree、项目不可用或 branch workspace member 无法解析时，沿用现有 detail/file 空态，不改变三栏容器的所有权。
- 文件区折叠时，显式 Open file area 与文件 reveal 必须先展开右栏，再执行既有 tab/path 定位。
- 从 wide 切换到 compact 不改写折叠和 Focus 状态；返回 wide 后恢复宽屏表现。
- detached file area 继续捕获拖出时的 repo、branch/worktree 与 tab，不因主窗口文件区位于右侧而重定向。

## 测试策略

- 布局单测验证 DOM 顺序为导航、终端/详情、文件区，且两个 split 都是 horizontal。
- 普通 Git、plain workspace、branch workspace 各自验证 desktop 文件区位于终端之后，compact 仍不挂载三栏 split。
- 验证文件区折叠、展开、按项目尺寸写入、Terminal Focus 和文件 reveal 回归。
- 设置测试验证高度比例输入与文案消失、剪贴板上限仍存在并可写。
- 共享归一化测试验证文件区默认宽度 30%、最大 45%、非法旧值回退。
- 最后运行 `bun run typecheck`、`bun run test`、`bun run check:architecture` 与 `bun run format:check`。

## 非目标

- 不新增用户可选的布局方向。
- 不新增导航栏独立折叠状态。
- 不改变 compact Mobile Web 的单表面导航。
- 不重做文件区 tab、文件树、detached window 或终端组件。
- 不迁移、删除或重命名 session/RPC 中已有的尺寸字段。

## ADR 判断

本次是可逆的 renderer 布局组合调整，未引入新的跨进程边界或技术锁定，不满足 ADR 的“难以逆转”条件，因此不新增 ADR。
