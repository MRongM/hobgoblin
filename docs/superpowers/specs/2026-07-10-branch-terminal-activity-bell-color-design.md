# 分支终端活动指示器复用呼吸灯颜色设计

## 摘要

仅修改分支列表中 `#短哈希` 后方的终端输出活动指示器，使其跑马灯颜色与未读终端呼吸灯一致。仓库标签页等其他位置的终端输出活动指示器继续使用现有 activity 颜色。

## 已确认决策

- 改动范围仅限 `BranchSummaryInline` 中 `#短哈希` 后方的终端数量徽标。
- 跑马灯复用现有 `terminal-bell` 语义 token，并自动跟随颜色主题及 Light/Dark 模式。
- 组件默认行为保持不变，其他调用点继续使用 `terminal-activity`。
- 跑马灯的图标、光晕、ping 背景、边框和阴影必须统一使用同一 token family，避免混色。
- 不修改动画速度、尺寸、布局、终端输出状态或未读提醒状态。
- 不新增依赖、主题 token、设置项或运行时主题分支。

## 当前状态

`TerminalOutputActivityIndicator` 当前固定使用 `--color-terminal-activity*` token family，且同时被分支摘要和仓库标签页复用。`BranchSummaryInline` 在终端有输出时，将该组件渲染在 `#短哈希` 后方的终端数量徽标中。

`TerminalBellDot` 使用现有 `--color-terminal-bell*` token family。各内置主题可分别提供对应的 Light/Dark bell 色值，语义 contract 也带有安全回退。

## 目标与非目标

目标：

- 分支摘要中的终端输出跑马灯与呼吸灯颜色一致。
- 颜色随当前主题和 Light/Dark 模式纯 CSS 自动更新。
- 保持共享组件的默认外观及其他调用点行为不变。

非目标：

- 不修改仓库标签页中的跑马灯颜色。
- 不修改 `TerminalBellDot` 的颜色、动画或状态逻辑。
- 不改变终端输出活动的检测、聚合或清除流程。
- 不重构主题系统或增加用户自定义颜色。

## 组件设计

为 `TerminalOutputActivityIndicator` 增加一个窄范围颜色参数：

```ts
tone?: 'activity' | 'bell'
```

默认值为 `activity`，确保所有既有调用点无需修改且行为不变。组件内部根据 `tone` 统一选择：

- 图标文字颜色；
- glow 背景及阴影颜色；
- ping 背景、边框及阴影颜色。

`BranchSummaryInline` 中的调用显式传入 `tone="bell"`。不在父容器覆盖 CSS 变量，也不创建第二个活动指示器组件，以保持依赖显式并避免重复。

## 数据流

1. 现有终端 session 状态产生 `hasTerminalOutputActivity`。
2. `BranchSummaryInline` 在终端数量徽标内渲染 `TerminalOutputActivityIndicator`。
3. 该调用传入 `tone="bell"`。
4. 指示器读取 `--color-terminal-bell*` token family。
5. 主题或 Light/Dark 模式改变时，CSS token 更新，指示器无需额外状态同步即可换色。

其他调用点不传 `tone`，继续读取 `--color-terminal-activity*`。

## 容错与兼容性

- 未传 `tone` 时默认使用 `activity`，保持向后兼容。
- `terminal-bell` contract 已有主题级回退，token 缺失不会导致组件崩溃。
- 改动不引入异步操作、网络请求、持久化数据或新的错误状态。
- 不使用 Node.js strip-only 模式不支持的 TypeScript 语法。

## 测试设计

更新聚焦测试以验证：

- `TerminalOutputActivityIndicator` 默认使用 activity token family。
- `tone="bell"` 时，图标、光晕、ping 背景、边框和阴影统一使用 bell token family。
- `BranchSummaryInline` 的分支终端活动实例选择 bell 变体。
- 仓库标签页调用仍保持默认 activity 变体。

完整验证命令：

```bash
bun run typecheck
bun run test
bun run check:architecture
```

## 验收标准

- `#短哈希` 后方的终端输出跑马灯与同主题、同模式下的呼吸灯颜色一致。
- 跑马灯内部不存在 activity 与 bell 颜色混用。
- 仓库标签页及其他位置的跑马灯颜色不变。
- 动画、尺寸、布局、无障碍标签和业务状态不变。
- 所有聚焦测试及项目验证命令通过。

## 预计改动文件

- `src/web/components/terminal/TerminalOutputActivityIndicator.tsx`
- `src/web/components/terminal/TerminalOutputActivityIndicator.test.tsx`
- `src/web/components/repo-workspace/BranchSummaryInline.tsx`
- `src/web/components/branch-list/BranchRow.test.tsx`
