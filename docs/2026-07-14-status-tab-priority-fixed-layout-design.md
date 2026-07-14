# Status Tab 优先级和固定布局设计

## 概述

本设计包含两个独立但相关的改进：

1. **Status Tab 优先级**：在有工作树时，将 status tab 设为第一个 tab 并作为默认打开的 tab，同时在状态面板顶部新增项目文件夹名称行
2. **固定响应式布局**：移除布局切换按钮，根据设备模式自动固定布局（Desktop 左右布局，Mobile 上下布局）

## 背景

### 当前行为

**Explorer Tab 系统**（`src/web/components/repo-workspace/RepoExplorerPane.tsx`）：
- Tab 顺序：files → changes → status → history → local → remoteBranches → ports
- 默认打开：files tab
- 状态面板：显示项目名称（repoName），但不显示文件夹路径

**布局切换**（`src/web/components/repo-toolbar/RepoToolbar.tsx`）：
- 用户可通过工具栏按钮在 `left-right` 和 `top-bottom` 之间切换
- Compact 模式下，`left-right` 布局会显示遮罩层提示切换到 `top-bottom`
- 布局偏好持久化到 session 状态

### 用户需求

1. **Status tab 优先**：在有工作树场景下，用户更关心分支状态信息，希望状态作为第一个 tab 和默认视图
2. **文件夹信息**：需要在状态面板中显示项目根目录的文件夹名称，便于识别项目
3. **固定布局**：不需要手动切换布局，希望根据设备自动适配（Desktop 左右，Mobile 上下）

## 设计方案

### 第一部分：Status Tab 优先级和项目文件夹显示

#### 目标

- 在有工作树时，status tab 成为第一个 tab
- 在有工作树时，默认打开 status tab 而非 files tab
- 在状态面板第一行之前新增"项目文件夹"行

#### 实现细节

##### 1. Tab 顺序动态调整

**文件**：`src/web/components/repo-workspace/RepoExplorerPane.tsx`

当前 tab 数组是静态定义（lines 167-175）。修改为：根据是否有工作树，动态决定顺序。

**逻辑**：
- 从 store 中读取当前选中分支是否有工作树（hasWorktree）
- 有工作树：`[status, files, changes, history, local, remoteBranches, (ports)]`
- 无工作树：保持原顺序 `[files, changes, status, history, local, remoteBranches, (ports)]`

##### 2. 默认 Tab 逻辑调整

**文件**：`src/web/stores/repos/helpers.ts`

修改 `explorerTabForRepo` 函数：
- 如果已保存 tab 偏好，优先使用
- 否则：有工作树默认为 `status`，无工作树默认为 `files`

##### 3. 状态面板新增文件夹名称行

**文件**：`src/web/components/branch-detail/BranchStatus.tsx`

**变更点**：
- 在现有第一行（project）之前插入一个新的 `StatusRow`
- 从 `repo.id`（绝对路径）提取最后一段作为文件夹名
  - 实现：`repo.id.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? repo.id`
  - 跨平台处理：先统一转换为 `/` 分隔符，然后提取最后非空段
- 使用 `FolderOpen` 图标，`tone="neutral"`
- 支持复制文件夹名（沿用 `CommitMetadataValue` 组件）

**同步更新**：
- `branchStatusClipboardText` 函数（lines 120-142）新增文件夹行
- `ProjectStatusPanel.tsx` 中传入的 `repoName`/repo 信息需包含 `id`（当前已经通过 `repo.id` 可用）

##### 4. i18n 翻译 Key

在各语言文件中新增：
- `branch-status.signal.folder`：项目文件夹
- `branch-status.copy-folder-name`：复制文件夹名称

**Why**：用户在有工作树时更关注分支状态，将 status 前置可减少点击次数；文件夹名称帮助快速识别项目，尤其是打开多个仓库时。

**How to apply**：有工作树时，status 成为第一个 tab 和默认 tab；状态面板显示完整的项目层级信息（文件夹 → 项目名）。

---

### 第二部分：固定响应式布局

#### 目标

- 移除工具栏上的布局切换按钮
- 布局自动响应：Desktop（normal）→ `left-right`，Mobile（compact）→ `top-bottom`
- 保留数据结构向后兼容，但值由响应式模式派生

#### 实现细节

##### 1. 新增布局派生 Hook

**新建文件**：`src/web/lib/effective-workspace-layout.ts`

暴露 `useEffectiveWorkspaceLayout()` hook：
- 内部调用 `useResponsiveUiMode()`
- `compact` → 返回 `'top-bottom'`
- `normal` → 返回 `'left-right'`

##### 2. 移除布局切换控件

**文件**：`src/web/components/repo-toolbar/RepoToolbar.tsx`

- 移除 `WorkspaceLayoutControlConnected` 组件（lines 224-231）
- 从 `RepoToolbar` JSX 中移除该组件的引用（line 49）
- 移除对 `WorkspaceLayoutControl` 的 import

##### 3. 更新布局读取逻辑

**文件**：`src/web/components/RepoView.tsx`

- 替换 `workspaceLayout` 从 store 读取的方式，改用 `useEffectiveWorkspaceLayout()`
- 从 store selector 中移除 `workspaceLayout` 字段
- 移除 `compactLeftRight` 变量（lines 67）
- 移除 compact 遮罩层 JSX（lines 135-144）
- 移除 `Smartphone`、`Button`、`useT` 相关未再使用的 import
- 移除 `setWorkspaceLayout` 引用

##### 4. 更新其他布局消费者

**需要检查并替换的文件**：
- `src/web/components/repo-toolbar/RepoToolbar.tsx`（line 34-38，`focusMode` 计算处使用的 workspaceLayout）
- `src/web/components/branch-detail/BranchDetailToolbar.tsx`（`layout` 从 props 接收，调用方需要传入派生值）
- 其他任何读取 `s.repos[repoId]?.ui.workspaceLayout ?? s.workspaceLayout` 的组件

**验证命令**（实现时使用）：
```bash
rg "s\.workspaceLayout|ui\.workspaceLayout" ./src/web/components ./src/web/hooks
```

##### 5. 保留数据结构（向后兼容）

**不删除**：
- `RepoUiState.workspaceLayout` 字段
- `RestorableWorkspaceState.workspaceLayout` 字段
- `setWorkspaceLayout` action（可能被 effect intent 使用）
- Session 序列化中的 `workspaceLayout` 字段
- `detailPaneSizes` 和 `fileTreePaneSizes`（用户仍可调整分栏大小）

**原因**：
- 向后兼容旧版本的 session 数据
- `setWorkspaceLayout` action 仍被 effect intent handler 使用，保留避免破坏 native intent 流
- 影响面小，风险低

**Why**：固定布局后，用户不再需要手动切换，减少配置负担；响应式自动适配提供更好的跨设备体验。

**How to apply**：所有组件使用 `useEffectiveWorkspaceLayout()` 获取布局值；移除 UI 层的切换控件；数据结构保留但值由响应式模式决定。

---

## 影响范围

### 文件变更

**新增**：
- `src/web/lib/effective-workspace-layout.ts`（约 10 行）
- `src/web/lib/effective-workspace-layout.test.ts`

**修改**：
- `src/web/components/repo-workspace/RepoExplorerPane.tsx`：Tab 顺序逻辑
- `src/web/stores/repos/helpers.ts`：默认 tab 逻辑
- `src/web/components/branch-detail/BranchStatus.tsx`：新增文件夹名称行、更新 clipboard 文本
- `src/web/components/RepoView.tsx`：移除遮罩层和切换按钮，使用派生 hook
- `src/web/components/repo-toolbar/RepoToolbar.tsx`：移除布局控件
- i18n 文件：新增 2 个 key（`branch-status.signal.folder`、`branch-status.copy-folder-name`）

**测试文件**：
- `src/web/components/repo-workspace/RepoExplorerPane.test.tsx`
- `src/web/components/branch-detail/BranchStatus.test.tsx`（如果存在，或在 `ProjectStatusPanel.test.tsx` 中测试）
- `src/web/components/RepoView.test.tsx`

### 向后兼容性

**Session 数据**：
- 旧版本保存的 `workspaceLayout` 值会被忽略，实际使用响应式派生值
- Session 结构不变，兼容旧数据

**用户体验**：
- 升级后，布局自动跟随设备模式，无需手动调整
- 有工作树的用户会发现默认打开 status tab

---

## 测试策略

### 单元测试

**`effective-workspace-layout.test.ts`**：
- normal 模式返回 `'left-right'`
- compact 模式返回 `'top-bottom'`

**`RepoExplorerPane.test.tsx`**：
- 有工作树时，status tab 是第一个可见 tab
- 无工作树时，files tab 是第一个可见 tab
- 用户切换到其他 tab 后，偏好被保存（通过 explorerTabByBranch）

**`BranchStatus.test.tsx` / `ProjectStatusPanel.test.tsx`**：
- 状态面板首行显示项目文件夹名称
- 文件夹名从 `repo.id` 正确提取（跨平台：`/` 和 `\` 分隔符）
- `branchStatusClipboardText` 包含文件夹名称行

**`RepoToolbar.test.tsx`**：
- 工具栏不再渲染 WorkspaceLayoutControl

**`RepoView.test.tsx`**：
- compact 模式下不再渲染 compact 遮罩层
- 布局值来源于 `useEffectiveWorkspaceLayout()`

### 集成测试

1. **响应式切换**：调整窗口宽度跨越 compact 阈值，验证布局自动切换
2. **Tab 顺序**：创建工作树后，验证 status tab 成为第一个
3. **默认 tab**：打开有工作树的仓库，验证默认显示 status
4. **Session 恢复**：模拟旧 session 数据（`workspaceLayout: 'top-bottom'` 但当前为 normal 模式），验证实际渲染为 `left-right`

---

## 回滚计划

如果需要回滚：

1. **恢复布局切换按钮**：
   - 恢复 `WorkspaceLayoutControlConnected` 组件
   - 恢复 `RepoView` 中的遮罩层
   - 移除 `useEffectiveWorkspaceLayout` hook

2. **恢复 Tab 顺序**：
   - 恢复 `RepoExplorerPane` 中的静态 tab 数组
   - 恢复 `explorerTabForRepo` 默认值为 `'files'`

3. **移除文件夹名称行**：
   - 从 `BranchStatus` 中删除新增的 StatusRow
   - 从 `branchStatusClipboardText` 中删除文件夹行

**估计影响**：低风险，变更主要在 UI 层，不涉及数据结构破坏性修改。

---

## 总结

本设计通过两个独立改进提升用户体验：

1. **Status Tab 优先**：有工作树时，状态信息成为第一视角，减少导航开销；新增文件夹名称行帮助快速识别项目
2. **固定响应式布局**：自动适配设备模式，消除手动切换负担，提供跨设备一致体验

两项改进均遵循 YAGNI 原则，避免过度设计，保持向后兼容，风险可控。
