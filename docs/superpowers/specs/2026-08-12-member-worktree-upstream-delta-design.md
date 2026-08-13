# 成员工作树 upstream 差异展示设计

## 目标

分支工作区的成员工作树在侧边栏中展示当前分支相对其 Git upstream 的领先与落后提交数，分支工作区父 item 同时展示所有可解析成员的 ahead 与 behind 汇总，视觉与普通仓库工作树保持一致。

## 既有事实

- 普通仓库工作树通过 `BranchSummaryInline` 读取 `RepoBranchState.ahead` 与 `RepoBranchState.behind`。
- 分支工作区成员行解析成功后，`presentation.actionTarget.branch` 已是同一份 `RepoBranchState` 运行时投影。
- 分支工作区父 item 已汇总成员工作树的变更数，适合在相同状态区域展示同步差异汇总。
- 差异数据由现有仓库快照刷新与失效机制维护；此功能不引入新的读取、轮询、实时通道或持久化字段。

## 方案比较

### 方案 A：提取同步差异微组件（采用）

把普通工作树已有的单个方向展示提取为 `BranchSyncDelta`，由普通工作树、成员工作树和分支工作区父 item 共同使用。该方案只复用稳定的视觉语义，不耦合三种列表项各自的布局、终端状态和操作区。

### 方案 B：在成员行复制 JSX

改动最少，但会重复颜色、图标、字体和可访问性规则，后续两处容易产生偏差，不采用。

### 方案 C：成员行复用整个 `BranchSummaryInline`

可复用更多代码，但成员行已有独立的图标、dirty 状态、终端徽标、选中态和操作布局，会造成重复读取与布局冲突，不采用。

### 父 item 汇总方案

采用 `BranchWorkspaceList` 基于同一份成员 presentation 派生父 item 汇总。每个成员只解析一次，结果同时供父 item 汇总与展开后的成员行消费。相比在 `WorkspaceRepositoryRail` 新增第二套 `syncDeltaById` 投影，该方案避免重复成员解析规则，并保证漂移和不可用场景下父子展示口径一致。

## UI 行为

- `ahead > 0` 时用 success 色显示向上箭头和数量。
- `behind > 0` 时用 attention 色显示向下箭头和数量。
- 两者都大于零时按 ahead、behind 顺序并列显示。
- 数值为零时不显示对应方向。
- 没有 upstream 时现有 Git 投影的两个值均为零，因此不显示差异。
- 图标、字号、tooltip 和 `aria-label` 在普通工作树、成员工作树与分支工作区父 item 之间保持一致。
- 成员目标无法解析时不显示差异，因为不存在可消费的权威分支投影。
- 父 item 分别求和所有可解析成员的 ahead 与 behind，不在两个方向之间抵消。
- 父 item 只显示非零汇总，顺序为 ahead、behind，位置在成员变更数徽标之后。
- 成员工作树分支发生漂移但仍能按当前工作树路径解析时，该成员继续参与汇总；不可用或无法解析的成员不参与汇总。
- 父 item 汇总跨越独立仓库，仅表示成员数值总和，不表示分支工作区根目录拥有 Git upstream。

## 架构与数据流

`RepoBranchState` 继续作为运行时仓库投影中的唯一数据来源：

1. 现有仓库快照解析 Git upstream 差异。
2. `WorkspaceRepositoryRail` 将解析到的分支放入成员行 `actionTarget`。
3. `BranchWorkspaceList` 对每个成员 presentation 只求值一次，分别汇总其中可解析分支的 ahead 与 behind。
4. `BranchWorkspaceMemberRow` 渲染同一 presentation 的 `actionTarget.branch.ahead/behind`。

不向 `BranchWorkspaceRepositorySnapshot` 复制差异字段，避免同一 Git 状态出现两份所有权。

## 测试与验收

- 组件测试验证成员行同时显示非零 ahead/behind。
- 组件测试验证零值不产生同步差异展示。
- 父 item 组件测试验证多个成员分别累加 ahead/behind、两个方向不抵消、零值隐藏及不可解析成员排除。
- 既有普通工作树测试继续验证共享组件未改变原行为。
- 执行成员行定向测试、相关普通工作树测试、类型检查、完整测试和架构检查。

## 自检

- 无占位内容。
- 范围仅包含成员行和分支工作区父 item 的侧边栏展示补全。
- 未改变领域状态所有权、写路径或同步策略。
- “远端差异”明确限定为分支相对其已配置 Git upstream 的 ahead/behind。
