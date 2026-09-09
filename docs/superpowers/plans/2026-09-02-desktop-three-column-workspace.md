# Desktop 三栏工作区实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将宽屏 Electron/Web 工作区改为“导航｜终端/详情｜文件区”三栏结构，保留文件区折叠与尺寸恢复，并移除失效的文件区默认高度设置。

**Architecture:** 复用 `SplitPane` 构造嵌套的两个水平分栏：外层 trailing pane 是右侧文件区，内层 trailing pane 是中央终端/详情。普通 Git、plain workspace 和 branch workspace 只重组 renderer 表面；继续使用现有本地折叠状态与 restorable 尺寸字段，不新增数据库、服务端状态、RPC 或 realtime 路径。

**Tech Stack:** React 19、TypeScript 6 strip-only、Zustand、Tailwind CSS 4、`react-resizable-panels`、Vitest。

## Global Constraints

- 只改变宽屏 Electron Desktop 与宽屏浏览器 Web；compact Mobile Web、Android、独立 `windows/` 包保持不变。
- 文件区完整移动到终端右侧；显式 open、double-click、reveal、detach 与 Terminal Focus 语义保持不变。
- 不新增导航栏独立折叠状态；文件区可独立折叠，Terminal Focus 继续同时隐藏导航和文件区。
- 不新增或迁移数据库、服务端 settings、RPC 字段、实时同步路径。
- 保留 `repo.ui.fileTreePaneSizes` 与 session `fileTreePaneSizes` 字段；其 `left-right` 值改为右侧文件区宽度比例，默认 30%，最大 45%。
- 只移除失效的“新项目默认文件区高度比例”设置；保留剪贴板大小上限和其他仍有效的文件能力配置。
- 使用 repo alias 与显式 `.ts`/`.tsx` 扩展名；不得使用 enum、运行时 namespace、parameter property 或 import alias。
- 按项目约束，本计划不包含也不执行 `git commit`、分支或 push 操作。

---

### Task 1: 建立宽屏三栏布局组合器

**Files:**

- Modify: `src/web/components/Layout.tsx`
- Modify: `src/web/components/Layout.test.tsx`

**Interfaces:**

- Consumes: 现有 `SplitPane` 的 `before`、`after`、`afterSize`、`beforeCollapsed`、`afterCollapsed` 和尺寸约束。
- Produces: `RepoWorkspace({ navigationPane, detailPane, fileAreaPane, detailSize, onDetailSizeChange, fileAreaSize, onFileAreaSizeChange, fileAreaCollapsed })`。

- [ ] **Step 1: 先写失败的三栏顺序测试**

在 `Layout.test.tsx` 中 mock `SplitPane`，为每个实例输出 `data-split-orientation`，并加入：

```tsx
test('orders navigation, detail, and file area as nested horizontal panes', () => {
  render(
    <RepoWorkspace
      navigationPane={<div data-testid="navigation-pane" />}
      detailPane={<div data-testid="detail-pane" />}
      fileAreaPane={<div data-testid="file-area-pane" />}
      detailSize={72}
      fileAreaSize={30}
      fileAreaCollapsed
    />,
  )

  const panes = Array.from(container!.querySelectorAll('[data-testid$="-pane"]'), (node) =>
    node.getAttribute('data-testid'),
  )
  expect(panes).toEqual(['navigation-pane', 'detail-pane', 'file-area-pane'])
  expect(container!.querySelectorAll('[data-split-orientation="horizontal"]')).toHaveLength(2)
})
```

- [ ] **Step 2: 运行测试并确认旧二栏接口失败**

Run: `bun run test -- src/web/components/Layout.test.tsx`

Expected: FAIL，原因是 `RepoWorkspace` 尚不接受 `navigationPane`、`fileAreaPane` 和 `fileAreaSize`。

- [ ] **Step 3: 用两个现有 `SplitPane` 实现唯一三栏组合器**

将 `RepoWorkspaceProps` 改为：

```tsx
interface RepoWorkspaceProps {
  navigationPane: ReactNode
  detailPane: ReactNode
  fileAreaPane: ReactNode
  layout?: RepoWorkspaceLayout
  mode?: Exclude<RepoWorkspaceMode, 'focus'>
  detailSize?: number
  onDetailSizeChange?: (size: number) => void
  fileAreaSize: number
  onFileAreaSizeChange?: (size: number) => void
  fileAreaCollapsed?: boolean
}
```

用以下结构替换旧二栏 JSX：

```tsx
<SplitPane
  orientation="horizontal"
  before={
    <SplitPane
      orientation="horizontal"
      before={navigationPane}
      after={detailPane}
      afterSize={detailSize}
      onAfterSizeChange={onDetailSizeChange}
      beforeMinSize="14rem"
      afterMinSize="22rem"
      afterMaxSize="90%"
      className="flex-1"
    />
  }
  after={fileAreaPane}
  afterSize={fileAreaSize}
  onAfterSizeChange={onFileAreaSizeChange}
  beforeMinSize="36rem"
  afterMinSize="16rem"
  afterMaxSize="45%"
  afterCollapsed={fileAreaCollapsed}
  afterClassName="project-file-area-tone"
  className="flex-1"
/>
```

保留 `layout` 与 `mode` 兼容参数，避免无关调用面变更；更新注释，使 `detailSize` 明确表示非文件区内终端/详情的宽度占比。

- [ ] **Step 4: 补齐尺寸和折叠属性断言并运行测试**

断言外层 `afterSize` 为 `30`、`afterCollapsed` 为 `true`、`afterMaxSize` 为 `45%`，内层 `afterSize` 为 `72`。

Run: `bun run test -- src/web/components/Layout.test.tsx src/web/components/SplitPane.test.tsx`

Expected: PASS。

---

### Task 2: 将普通 Git 项目改接三栏布局

**Files:**

- Modify: `src/web/components/repo-workspace/RepoExplorerPane.tsx`
- Modify: `src/web/components/RepoView.tsx`
- Modify: `src/web/components/repo-workspace/RepoExplorerPane.test.tsx`
- Modify: `src/web/components/RepoView.test.tsx`

**Interfaces:**

- Consumes: Task 1 的三栏 `RepoWorkspace`。
- Produces: desktop `RepoExplorerPane` 组合左侧导航、调用方提供的中央详情和右侧 `RepoWorktreeExplorer`；compact 分支接口与行为不变。

- [ ] **Step 1: 写 desktop 三栏与 compact 隔离测试**

在 `RepoExplorerPane.test.tsx` 的 `RepoWorkspace` mock 中输出三个 slot，并加入断言：

```tsx
expect(container.querySelector('[data-workspace-navigation] [data-testid="branch-list"]')).not.toBeNull()
expect(container.querySelector('[data-workspace-detail] [data-testid="desktop-detail"]')).not.toBeNull()
expect(container.querySelector('[data-workspace-files] [data-testid="project-file-tree"]')).not.toBeNull()
expect(container.querySelector('[data-workspace-navigation] [data-testid="project-file-tree"]')).toBeNull()
```

另保留并强化 compact 测试：compact `scope` 与 `files` 都不得出现 `data-workspace-detail` 或 resizable split。

- [ ] **Step 2: 运行 focused tests 并确认文件树仍在导航下方**

Run: `bun run test -- src/web/components/repo-workspace/RepoExplorerPane.test.tsx src/web/components/RepoView.test.tsx`

Expected: FAIL，desktop 文件树仍由 vertical `FileAreaSplitPane` 挂在导航下方。

- [ ] **Step 3: 给 `RepoExplorerPane` 增加 desktop detail 输入**

加入以下 props：

```tsx
desktopDetailPane?: ReactNode
detailPaneSize?: number
onDetailPaneSizeChange?: (size: number) => void
```

desktop Git 分支中建立三个完整表面：

```tsx
const navigationPane = (
  <RepoWorkspacePane>
    <SidebarProjectHeader
      repoId={repoId}
      onMaximizeTerminal={onMaximizeTerminal}
      onFileAreaItemDoubleClick={handleWorktreeDoubleClick}
      onOpenFileArea={onOpenFileArea}
    />
    <div className="project-navigation-tone flex min-h-0 min-w-0 flex-1 flex-col bg-sidebar">
      {workspaceRootId ? (
        <WorkspaceRepositoryRail
          workspaceRootId={workspaceRootId}
          currentRepoId={repoId}
          onOpenFileArea={onOpenFileArea}
          onCollapseFileArea={onCollapseFileArea}
          onToggleFileArea={handleWorktreeDoubleClick}
        />
      ) : null}
      <BranchSectionLabel repoId={repoId} />
      <BranchArea
        repoId={repoId}
        showActions={showActions}
        onBranchSelected={onBranchSelected}
        onWorktreeDoubleClick={handleWorktreeDoubleClick}
        onOpenFileArea={onOpenFileArea}
      />
    </div>
    <StatusBar repoId={repoId} fileAreaCollapsed={desktopFileAreaCollapsed} onToggleFileArea={onToggleFileArea} />
  </RepoWorkspacePane>
)
```

用 `RepoWorkspace` 组合 `navigationPane`、`desktopDetailPane` 和单独的 `RepoWorktreeExplorer`。删除 desktop vertical `FileAreaSplitPane`，compact JSX 原样保留。

- [ ] **Step 4: 让 `RepoView` 把 detail 注入 explorer**

非 Focus 的普通 Git 路径改为：

```tsx
<RepoExplorerPane
  repoId={repoId}
  layout={layout}
  showActions={showActions}
  revealRequest={terminalRevealRequest}
  fileAreaCollapsed={fileAreaCollapsed}
  onToggleFileArea={toggleFileArea}
  onOpenFileArea={openFileArea}
  onCollapseFileArea={collapseFileArea}
  onMaximizeTerminal={maximizeDesktopTerminal}
  desktopDetailPane={detailPane}
  detailPaneSize={detailPaneSize}
  onDetailPaneSizeChange={(size) => setDetailPaneSize(layout, size)}
/>
```

保留 `terminalFocusMode ? detailPane : ...` 的短路，确保 Focus 不挂载辅助栏。

- [ ] **Step 5: 验证 open/reveal/collapse 回归**

Run: `bun run test -- src/web/components/repo-workspace/RepoExplorerPane.test.tsx src/web/components/RepoView.test.tsx`

Expected: PASS，包含文件 reveal 展开右栏、项目切换 open intent 以及 Focus 仅渲染 detail。

---

### Task 3: 将 plain 与 branch workspace 接入相同三栏组合器

**Files:**

- Modify: `src/web/components/repo-workspace/PlainWorkspacePane.tsx`
- Modify: `src/web/components/repo-workspace/PlainWorkspacePane.test.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspacePane.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspacePane.test.tsx`
- Delete after explicit execution-time confirmation: `src/web/components/repo-workspace/FileAreaSplitPane.tsx`
- Delete after explicit execution-time confirmation: `src/web/components/repo-workspace/FileAreaSplitPane.test.tsx`

**Interfaces:**

- Consumes: Task 1 的 `RepoWorkspace` 和现有 `fileAreaCollapsed`、`setRepoFileTreePaneSize`。
- Produces: 三种 workspace 类型一致的 desktop pane order；compact 单表面路径保持原组件树。

- [ ] **Step 1: 写 plain workspace 的三栏测试**

在 `PlainWorkspacePane.test.tsx` mock `RepoWorkspace` 的三个 slot，验证：

```tsx
expect(container.querySelector('[data-workspace-navigation] [data-testid="sidebar-project-header"]')).not.toBeNull()
expect(
  container.querySelector('[data-workspace-detail] [data-testid="plain-workspace-terminal-toolbar"]'),
).not.toBeNull()
expect(container.querySelector('[data-workspace-files] [data-testid="plain-file-area-toolbar"]')).not.toBeNull()
```

多仓库 plain workspace 还要断言 `WorkspaceRepositoryRail` 只在 navigation slot；single plain workspace 仍保留 navigation chrome。

- [ ] **Step 2: 写 branch workspace 父/member 文件区的三栏测试**

分别以无 member 和有 member fixture 渲染，验证父 `BranchWorkspaceFileArea` 与 member `RepoWorktreeExplorer` 都只出现在 `data-workspace-files`，终端只在 `data-workspace-detail`。

- [ ] **Step 3: 运行测试并确认旧 vertical split 失败**

Run: `bun run test -- src/web/components/repo-workspace/PlainWorkspacePane.test.tsx src/web/components/repo-workspace/BranchWorkspacePane.test.tsx`

Expected: FAIL，两个 desktop 路径仍把 file area 放在 navigation slot 内。

- [ ] **Step 4: 重组 `PlainWorkspacePane` desktop JSX**

构造 `navigationPane`（项目头、可选 repository rail、状态栏），把 `detailPane` 与 `fileBrowser` 分别传给 `RepoWorkspace`：

```tsx
<RepoWorkspace
  layout={layout}
  mode="split"
  detailSize={terminalPaneSize}
  onDetailSizeChange={(size) => setDetailPaneSize(layout, size)}
  fileAreaSize={fileAreaSize}
  onFileAreaSizeChange={(size) => setRepoFileTreePaneSize(repoId, layout, size)}
  fileAreaCollapsed={desktopFileAreaCollapsed}
  navigationPane={navigationPane}
  detailPane={detailPane}
  fileAreaPane={fileBrowser}
/>
```

Focus 与 compact 的 early return 不变。

- [ ] **Step 5: 重组 `BranchWorkspacePane` desktop JSX**

将当前 `desktopExplorer` 拆为只含项目头、`WorkspaceRepositoryRail`、`StatusBar` 的 `desktopNavigation`。使用同一 `RepoWorkspace` 接入 `detail` 与 `fileArea`，并保持：

```tsx
fileAreaSize={fileTreeSize}
onFileAreaSizeChange={(size) => setRepoFileTreePaneSize(fileAreaRepoId, layout, size)}
fileAreaCollapsed={desktopFileAreaCollapsed}
```

`compactSurface` 三分支以及 member reveal/open 状态机不得改写。

- [ ] **Step 6: 删除失去调用方的薄包装并验证没有引用**

在获得执行时明确删除确认后，删除 `FileAreaSplitPane.tsx` 与专属测试。

Run: `rg -n "FileAreaSplitPane" src`

Expected: 无输出。

- [ ] **Step 7: 运行 workspace focused tests**

Run: `bun run test -- src/web/components/repo-workspace/PlainWorkspacePane.test.tsx src/web/components/repo-workspace/BranchWorkspacePane.test.tsx src/web/components/repo-workspace/RepoExplorerPane.test.tsx`

Expected: PASS。

---

### Task 4: 将文件区尺寸语义改为受限宽度并清理失效设置

**Files:**

- Modify: `src/shared/workspace-layout.ts`
- Modify: `src/shared/workspace-layout.test.ts`
- Modify: `src/web/components/settings/pages/FileAreaSettings.tsx`
- Modify: `src/web/components/SettingsSurface.test.tsx`
- Modify: `src/web/stores/repos/selection.ts`
- Modify: `src/web/stores/repos/selection.test.ts`
- Modify: `src/web/stores/repos/types.ts`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`

**Interfaces:**

- Consumes: 现有 `fileTreePaneSizes` 持久化字段与 `normalizeFileTreePaneSize(s)`。
- Produces: 文件区宽度范围 `10..45`、按项目 resize action、无默认高度设置的 General 页面。

- [ ] **Step 1: 写宽度归一化和设置移除测试**

在 `workspace-layout.test.ts` 加入：

```ts
test('caps restored file area widths at forty-five percent', () => {
  expect(normalizeFileTreePaneSizes({ 'left-right': 70 })).toEqual({ 'left-right': 45 })
})
```

将 `SettingsSurface.test.tsx` 的 General 合并断言改为：

```ts
expect(document.getElementById('settings-file-tree-pane-size')).toBeNull()
expect(document.getElementById('settings-file-tree-clipboard-max-bytes')).not.toBeNull()
expect(document.body.textContent).not.toContain('settings.files.height-ratio')
```

删除“edits the new project default file area height ratio”测试，并在 selection action 测试中删除 `setDefaultFileTreePaneSize` 专属用例。

- [ ] **Step 2: 运行 focused tests 并确认失败**

Run: `bun run test -- src/shared/workspace-layout.test.ts src/web/components/SettingsSurface.test.tsx src/web/stores/repos/selection.test.ts`

Expected: FAIL，旧归一化允许 70，设置页面仍渲染高度输入。

- [ ] **Step 3: 收紧文件区宽度但保留持久化字段**

在 `workspace-layout.ts` 增加：

```ts
export const MAX_FILE_AREA_PANE_SIZE = 45

export function normalizeFileTreePaneSize(layout: WorkspaceLayout, value: unknown): number {
  const fallback = DEFAULT_FILE_TREE_PANE_SIZES[layout]
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(MIN_WORKSPACE_PANE_SIZE, Math.min(MAX_FILE_AREA_PANE_SIZE, Math.round(value * 10) / 10))
}
```

让 `normalizeFileTreePaneSizes` 按 layout 调用该函数；`normalizeDetailPaneSize(s)` 继续使用通用 `10..90` 范围。更新默认常量注释为“right file-area width”。

- [ ] **Step 4: 删除默认高度设置 UI 与死 action**

将 `FileAreaSettings` 收敛为仍有效的文件操作配置：

```tsx
export function FileAreaSettings() {
  const t = useT()
  const { fileTreeClipboardMaxBytesMb } = useRuntimeFileAreaSettings()
  const { setFileTreeClipboardMaxBytesMb } = useFileAreaSettingsController()

  return (
    <SettingsGroup label={t('settings.files.title')}>
      <SettingsList>
        <SettingsRow
          controlId="settings-file-tree-clipboard-max-bytes"
          label={t('settings.files.clipboard-max-size')}
          hint={t('settings.files.clipboard-max-size-hint')}
          control={
            <SettingsNumberInput
              id="settings-file-tree-clipboard-max-bytes"
              min={MIN_FILE_TREE_CLIPBOARD_MAX_BYTES_MB}
              max={MAX_FILE_TREE_CLIPBOARD_MAX_BYTES_MB}
              value={fileTreeClipboardMaxBytesMb}
              onChange={(value) => void setFileTreeClipboardMaxBytesMb(value)}
            />
          }
        />
      </SettingsList>
    </SettingsGroup>
  )
}
```

从 `ReposStore`、`RestorableWorkspaceSelectionActions` 和 action factory 删除 `setDefaultFileTreePaneSize`；保留 `setRepoFileTreePaneSize`、`fileTreePaneSizes` 字段、session restore 与 server persistence。

- [ ] **Step 5: 删除四语种失效文案**

从 `en.ts`、`zh.ts`、`ja.ts`、`ko.ts` 删除且不替换：

```text
settings.files.layout.title
settings.files.height-ratio
settings.files.height-ratio-hint
```

保留 `settings.files.title`、clipboard、font 相关 key。

- [ ] **Step 6: 运行设置、store 与 dictionary tests**

Run: `bun run test -- src/shared/workspace-layout.test.ts src/web/components/SettingsSurface.test.tsx src/web/stores/repos/selection.test.ts src/shared/i18n/dictionaries.test.ts`

Expected: PASS。

---

### Task 5: 对齐折叠方向、文档与全量验证

**Files:**

- Modify: `src/web/components/StatusBar.tsx`
- Modify: `src/web/components/StatusBar.test.tsx`
- Verify: `CONTEXT.md`
- Verify: `docs/ui-conventions.md`
- Verify: `docs/state-sync.md`
- Verify: `docs/superpowers/specs/2026-09-02-desktop-three-column-workspace-design.md`

**Interfaces:**

- Consumes: 现有 `file-area.collapse` / `file-area.expand` 文案与 Task 2/3 的本地折叠回调。
- Produces: 与右侧栏方向一致的 affordance，以及可由后续维护者验证的正式布局约定。

- [ ] **Step 1: 写右侧折叠图标测试**

在 `StatusBar.test.tsx` mock 或检查 Lucide `data-lucide`，验证展开状态使用 `panel-right-close`，折叠状态使用 `panel-right-open`；继续断言 `aria-expanded` 与回调次数。

- [ ] **Step 2: 替换方向错误的 bottom 图标**

在 `StatusBar.tsx` 中把：

```tsx
import { PanelBottomClose, PanelBottomOpen } from 'lucide-react'
```

替换为：

```tsx
import { PanelRightClose, PanelRightOpen } from 'lucide-react'
```

并让展开文件区显示 `PanelRightClose`、折叠文件区显示 `PanelRightOpen`。无障碍文案继续复用 `file-area.collapse` / `file-area.expand`。

- [ ] **Step 3: 运行布局与折叠 focused suite**

Run: `bun run test -- src/web/components/Layout.test.tsx src/web/components/StatusBar.test.tsx src/web/components/RepoView.test.tsx src/web/components/repo-workspace/RepoExplorerPane.test.tsx src/web/components/repo-workspace/PlainWorkspacePane.test.tsx src/web/components/repo-workspace/BranchWorkspacePane.test.tsx`

Expected: PASS。

- [ ] **Step 4: 用静态搜索验证范围与死代码**

Run: `rg -n "orientation=\"vertical\"" src/web/components/repo-workspace/RepoExplorerPane.tsx src/web/components/repo-workspace/PlainWorkspacePane.tsx src/web/components/repo-workspace/BranchWorkspacePane.tsx`

Expected: 无 desktop file-area vertical split 命中。

Run: `rg -n "settings-file-tree-pane-size|settings\.files\.(layout\.title|height-ratio)" src`

Expected: 无输出。

Run: `rg -n "fileTreeClipboardMaxBytesMb" src/web/components/settings/pages/FileAreaSettings.tsx src/web/components/file-tree/ProjectFileTree.tsx`

Expected: 两个文件均有命中，证明仍有效的文件能力设置未误删。

- [ ] **Step 5: 运行项目质量门禁**

Run: `bun run typecheck`

Expected: PASS，无 TypeScript diagnostics。

Run: `bun run test`

Expected: PASS，Vitest 全量通过。

Run: `bun run check:architecture`

Expected: PASS，无跨 `main/web/server/shared` 边界违规。

Run: `bun run format:check`

Expected: PASS，Prettier 无差异。

Run: `git diff --check`

Expected: 无输出。

## Self-Review

- Spec coverage: 普通 Git、plain、branch workspace、宽屏范围、compact 隔离、折叠、Focus、设置清理、持久化兼容和质量门禁均映射到具体 task。
- Placeholder scan: 所有代码变更步骤均给出确切文件、接口、命令和期望结果。
- Type consistency: 三栏接口统一使用 `navigationPane`、`detailPane`、`fileAreaPane`、`detailSize`、`fileAreaSize`；按项目写入仍统一使用 `setRepoFileTreePaneSize`。
