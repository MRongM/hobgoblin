# Terminal Font Independence And History List Simplification Design

## 背景

当前 `设置 > 通用 > 字体` 是全局字体偏好，`GlobalFontFamilyProjection` 将其投影到文档根节点的 `--font-sans` 和 `--font-mono`。终端侧也在 `TerminalSessionProvider` 中读取同一个 `fontFamily`，再通过 `fontFamilyStackForPref(fontFamily).terminal` 同步到 `TerminalSessionRegistry` 和 xterm。

用户确认终端字体不应再跟随通用字体。通用字体只影响应用 UI；终端保持独立的默认等宽终端字体。用户也确认历史 tab 左侧不需要 graph 和线条，只保留提交列表；点击左侧列表项后，右侧详情继续按当前行为更新，右侧其他交互不变。

## 目标

- 终端不再消费 `设置 > 通用 > 字体` 的 `fontFamily`。
- 终端继续使用现有 `DEFAULT_TERMINAL_FONT_FAMILY`，终端字号设置继续生效。
- 保留终端主题同步、会话恢复、attach、resize、font remeasure 等现有流程。
- 历史 tab 左侧移除 graph 列、提交圆点和连接线条。
- 历史 tab 左侧保留提交 subject、短 hash、作者、日期和选中态。
- 点击左侧提交项仍更新右侧 commit detail。
- 右侧详情面板、文件树/列表切换、复制、reveal、双击打开编辑器等逻辑不变。

## 非目标

- 不新增终端字体独立设置项。
- 不新增设置迁移或持久化字段。
- 不修改 `fontFamily` 偏好的存储、校验、通用设置 UI 或文档根字体投影。
- 不删除 `history-graph.ts` 的 graph 模型，除非实现时发现没有任何生产或测试引用需要保留。
- 不改变历史数据加载、分页、详情请求、错误处理或右侧详情布局。
- 不调整终端字体大小设置。

## 方案

采用最小改动方案：终端回到固定默认等宽字体，历史左侧列表移除 graph 渲染。

终端侧，`TerminalSessionProvider` 不再从 `useRuntimeTerminalSettings()` 解构 `fontFamily`，也不再导入或调用 `fontFamilyStackForPref`。provider 只继续读取 `terminalFontSize` 和 `terminalThemeSyncEnabled`。由于 `TerminalSessionRegistry` 的 `terminalFontFamily` 默认值已经是 `DEFAULT_TERMINAL_FONT_FAMILY`，移除通用字体同步后，新建和已存在的终端会使用 registry 默认终端字体，不再因通用字体变化触发 `registry.setFontFamily()`。

字体映射侧，`font-family.ts` 不再暴露 `terminal` 字体栈字段。`AppFontFamilyStack` 只保留 `sans` 和 `mono`，用于应用 UI 的 CSS 变量投影。这样通用字体模块不会继续暗示它控制终端。

历史侧，`ProjectHistoryPanel` 的 `HistoryList` 不再基于 `buildHistoryGraphRows(commits)` 渲染 graph cell。列表项从两列 grid 改为单列文本按钮。删除 `HistoryGraphCell` 组件或使其不再被生产代码引用。左侧列表保持现有 button 交互、hover、selected class、`aria-label` 和 `onSelect(row.commit.hash)` 语义。

## 数据流与行为

终端字体变更前：

1. 用户修改通用字体。
2. settings snapshot 更新 `fontFamily`。
3. `TerminalSessionProvider` 重新计算 `terminalFontFamily`。
4. provider 调用 `registry.setFontFamily(terminalFontFamily)`。
5. registry 将字体同步到所有终端 session。

终端字体变更后：

1. 用户修改通用字体。
2. settings snapshot 更新 `fontFamily`。
3. 文档根节点字体变量更新，应用 UI 跟随变化。
4. `TerminalSessionProvider` 不读取 `fontFamily`，不会调用 `registry.setFontFamily()`。
5. 终端继续使用 `DEFAULT_TERMINAL_FONT_FAMILY` 和当前终端字号。

历史列表变更前：

1. `HistoryList` 调用 `buildHistoryGraphRows(commits)`。
2. 每行渲染 `HistoryGraphCell`。
3. graph cell 为每个 lane 渲染竖线，并为当前 lane 渲染提交圆点。
4. 点击列表行更新 `selectedHash`，右侧详情请求或显示缓存详情。

历史列表变更后：

1. `HistoryList` 直接遍历 `commits`。
2. 每行只渲染提交文本信息。
3. 点击列表行继续更新 `selectedHash`，右侧详情请求或显示缓存详情。

## 错误处理

该改动不新增异步流程和错误分支。终端字体独立后，通用字体设置失败仍由现有 settings write path 处理；终端不会额外参与。历史 tab 的 history load、detail load、分页错误继续沿用当前 `historyError` 和 `detailError` 处理。

## 测试与验证

需要更新或新增以下测试：

1. `src/web/components/terminal/TerminalSessionProvider.test.tsx`
   - 覆盖通用 `fontFamily` 为 `maple` 或 `system` 时，终端 session 构造和后续同步不再使用 Maple 或 system sans 栈。
   - 覆盖 provider re-render 后不会因 `fontFamily` 变化调用 session `setFontFamily()`。

2. `src/web/font-family.test.ts`
   - 保留通用字体栈测试，明确 `fontFamilyStackForPref` 只描述应用 UI 字体栈。
   - 覆盖 `APP_FONT_FAMILY_STACKS` 不再包含 `terminal` 字段。

3. `src/web/components/repo-workspace/ProjectHistoryPanel.test.tsx`
   - 覆盖历史列表左侧不再渲染 graph cell 或竖线元素。
   - 覆盖点击第二个提交后，右侧详情仍切换到对应 commit。

建议执行：

1. `bun run test "src/web/components/terminal/TerminalSessionProvider.test.tsx" "src/web/components/repo-workspace/ProjectHistoryPanel.test.tsx" "src/web/font-family.test.ts"`
2. `bun run test`
3. `bun run typecheck`
4. `bun run check:architecture`

## 自审

- 无未完成标记或悬而未决的需求。
- 终端字体范围明确：不跟随通用字体，但继续保留终端字号和默认等宽字体。
- 历史 tab 范围明确：只简化左侧列表视觉，不改变右侧详情行为。
- 方案不新增配置项、迁移或兼容开关，符合 KISS 和 YAGNI。
- 改动边界集中在 provider 字体同步和 history panel 渲染，未引入跨层依赖。
