# UI 改进设计文档

**日期：** 2026-07-13  
**状态：** 已批准  
**负责人：** 系统优化

## 概述

本设计文档涵盖三个独立的 UI/UX 改进点，旨在提升 Hobgoblin Git 工具的用户体验和界面一致性。

## 改进目标

### 1. 本地分支删除 - 放宽未合并限制
允许用户删除未合并到主分支的本地分支，同时通过二次确认对话框保证操作安全性。

### 2. 终端按钮图标统一
将终端按钮图标统一为 `Terminal` 图标，不再根据用户配置的终端应用显示不同图标，提升界面一致性。

### 3. 最近操作图标与菜单一致
确保最近操作区显示的 `createWorktree` 和 `commit` 操作图标与分支操作菜单中使用的图标保持一致。

## 详细设计

### 功能 1：允许删除未合并分支

#### 当前行为
- 后端 `validateBranchDeletion` 函数会检查分支是否已合并到默认分支
- 如果分支未合并，删除操作会被阻止并返回错误
- 用户无法删除未合并的本地分支

#### 目标行为
- 用户可以删除未合并的分支
- 删除未合并分支时显示明确的警告对话框
- 用户确认后才执行强制删除

#### 实现方案

**前端修改（`src/web/components/repo-workspace/ProjectLocalPanel.tsx`）：**

1. 增加状态管理：
   - 新增 `unmergedDeleteTarget` 状态，存储待删除的未合并分支信息
   - 保留现有的 `deleteTarget` 用于已合并分支的常规删除

2. 修改删除逻辑：
   - `handleDelete` 函数先尝试普通删除
   - 如果后端返回未合并错误，则打开未合并分支确认对话框
   - 新增 `handleForceDelete` 函数，调用 `deleteRepositoryBranch` 时传递 `{ force: true }` 参数

3. 新增对话框：
   - 标题：通过 i18n 键 `local.branch-unmerged-confirm-title` 显示，内容类似 "确认删除未合并分支"
   - 消息：通过 i18n 键 `local.branch-unmerged-confirm-body` 显示，内容类似 "分支 '{name}' 尚未合并到主分支。删除后无法恢复，确定要继续吗？"
   - 确认按钮：使用 `destructive` 样式，标签为 "强制删除"

**后端修改（`src/server/modules/repo-backend.ts`）：**

1. 修改 `deleteBranch` 方法：
   - 当 `options.force === true` 时，跳过 `validateBranchDeletion` 检查
   - 直接调用 `deleteBranchAfterValidation` 执行删除

2. 保留现有校验逻辑：
   - 非 force 模式下继续执行完整的校验（当前分支、工作树、未合并检查）
   - 保证向后兼容性

**国际化文本（`src/shared/i18n/en.ts` 和对应的其他语言文件）：**

需要添加以下新键：
```typescript
'local.branch-unmerged-confirm-title': 'Delete Unmerged Branch?'
'local.branch-unmerged-confirm-body': 'Branch "{name}" has not been merged. This action cannot be undone. Continue?'
'local.branch-force-delete': 'Force Delete'
```

**为什么选择这个方案：**
- 保持现有代码结构，最小化改动范围
- 通过二次确认保证操作安全性，防止误删除
- 使用 `force` 参数是 Git 的标准做法，用户容易理解
- 不影响其他分支删除场景（已合并分支、有工作树的分支等）

---

### 功能 2：终端按钮图标统一

#### 当前行为
- 终端按钮根据用户配置的终端应用（Terminal、Ghostty 等）显示不同的图标
- 通过 `TerminalAppIcon` 组件根据 `pref` 参数渲染特定图标

#### 目标行为
- 所有用户看到统一的终端图标
- 使用 lucide-react 的 `Terminal` 图标（外观类似 `>_`）
- tooltip 保留显示文字说明

#### 实现方案

**前端修改（`src/web/components/repo-workspace/RepoExplorerPane.tsx`）：**

1. 修改 `BranchAreaQuickActionsInner` 组件（第 215-231 行）：
   - 移除 `createElement(TerminalAppIcon, { pref: terminalIconPref })`
   - 替换为直接渲染 `<Terminal className="size-4" />`

2. 导入调整：
   - 确保文件顶部已导入 `Terminal` 图标（第 4 行已存在）
   - 可选：移除未使用的 `TerminalAppIcon` 导入（如果其他地方不再使用）

**修改前：**
```tsx
{terminalItem && (
  <Tip label={terminalItem.title ?? terminalItem.label}>
    <span className="inline-flex">
      <AsyncButton
        data-testid="branch-area-terminal-btn"
        variant="ghost"
        size="icon-sm"
        loading={terminalItem.busy}
        disabled={terminalItem.disabled || !terminalAvailable}
        onClick={terminalItem.onSelect}
        aria-label={terminalItem.ariaLabel ?? terminalItem.label}
      >
        {() => createElement(TerminalAppIcon, { pref: terminalIconPref })}
      </AsyncButton>
    </span>
  </Tip>
)}
```

**修改后：**
```tsx
{terminalItem && (
  <Tip label={terminalItem.title ?? terminalItem.label}>
    <span className="inline-flex">
      <AsyncButton
        data-testid="branch-area-terminal-btn"
        variant="ghost"
        size="icon-sm"
        loading={terminalItem.busy}
        disabled={terminalItem.disabled || !terminalAvailable}
        onClick={terminalItem.onSelect}
        aria-label={terminalItem.ariaLabel ?? terminalItem.label}
      >
        <Terminal className="size-4" />
      </AsyncButton>
    </span>
  </Tip>
)}
```

**为什么选择这个方案：**
- 改动最小，仅涉及一个组件
- 统一的图标提升界面一致性，降低视觉复杂度
- `Terminal` 图标是行业标准，用户易于识别
- tooltip 仍然保留文字说明，不影响可访问性

---

### 功能 3：最近操作图标一致性

#### 当前行为
- 最近操作区使用 `RECENT_ACTION_ICONS` 映射定义操作图标
- `createWorktree` 使用 `FolderTree` 图标
- `commit` 使用 `GitCommitHorizontal` 图标
- 但在分支操作菜单中，这两个操作分别使用 `FolderPlus` 和 `SendHorizontal` 图标

#### 目标行为
- 最近操作区的图标与分支操作菜单保持一致
- 提升界面一致性，减少用户认知负担

#### 实现方案

**前端修改（`src/web/components/repo-workspace/RepoExplorerPane.tsx`）：**

1. 修改第 236-240 行的 `RECENT_ACTION_ICONS` 常量：
   - `createWorktree: FolderTree` → `createWorktree: FolderPlus`
   - `commit: GitCommitHorizontal` → `commit: SendHorizontal`

2. 调整导入语句（第 4 行）：
   - 移除 `FolderTree` 和 `GitCommitHorizontal`
   - 添加 `FolderPlus` 和 `SendHorizontal`

**修改前：**
```tsx
import { FolderTree, FolderGit, FolderMinus, GitBranch, GitBranchPlus, GitCommitHorizontal, GitCompareArrows, GitFork, GitMerge, History, RadioTower, Tag, ChevronDown, ArrowDown, ArrowUp, CloudDownload, Trash2, type LucideIcon } from 'lucide-react'

// ...

const RECENT_ACTION_ICONS: Record<RepoEventAction['kind'], typeof GitBranch> = {
  checkout: GitBranch, pull: ArrowDown, push: ArrowUp, commit: GitCommitHorizontal,
  merge: GitMerge, createWorktree: FolderTree, createBranch: GitBranchPlus,
  trackRemoteBranch: CloudDownload, deleteBranch: Trash2, removeWorktree: FolderMinus,
}
```

**修改后：**
```tsx
import { FolderPlus, FolderGit, FolderMinus, GitBranch, GitBranchPlus, SendHorizontal, GitCompareArrows, GitFork, GitMerge, History, RadioTower, Tag, ChevronDown, ArrowDown, ArrowUp, CloudDownload, Trash2, type LucideIcon } from 'lucide-react'

// ...

const RECENT_ACTION_ICONS: Record<RepoEventAction['kind'], typeof GitBranch> = {
  checkout: GitBranch, pull: ArrowDown, push: ArrowUp, commit: SendHorizontal,
  merge: GitMerge, createWorktree: FolderPlus, createBranch: GitBranchPlus,
  trackRemoteBranch: CloudDownload, deleteBranch: Trash2, removeWorktree: FolderMinus,
}
```

**参考依据：**
- `createWorktree` 菜单图标：`src/web/hooks/useBranchActionItems.tsx` 第 239 行使用 `FolderPlus`
- `commit` 菜单图标：`src/web/hooks/useBranchWriteActions.tsx` 第 181 行使用 `SendHorizontal`

**为什么选择这个方案：**
- 图标语义更准确：`FolderPlus` 表示"创建"操作，`SendHorizontal` 表示"发送/提交"操作
- 与用户在菜单中看到的图标保持一致，降低认知负担
- 改动范围小，风险低

## 影响范围

### 代码文件修改
1. `src/web/components/repo-workspace/ProjectLocalPanel.tsx` - 分支删除逻辑和对话框
2. `src/server/modules/repo-backend.ts` - 后端删除校验逻辑
3. `src/web/components/repo-workspace/RepoExplorerPane.tsx` - 终端按钮和最近操作图标
4. `src/shared/i18n/en.ts` 及其他语言文件 - 新增国际化文本

### 用户体验变更
- 删除未合并分支时会看到额外的确认对话框
- 终端按钮图标变为统一的 `Terminal` 图标
- 最近操作区的部分图标发生变化（但语义更准确）

### 向后兼容性
- 所有修改都是增量式的，不破坏现有功能
- 后端 API 保持兼容，仅扩展 `force` 参数的使用
- 不影响其他组件和模块

## 测试策略

### 功能 1：分支删除
1. 测试删除已合并分支 - 应显示常规确认对话框
2. 测试删除未合并分支 - 应显示警告对话框
3. 测试在警告对话框中取消 - 分支不应被删除
4. 测试在警告对话框中确认 - 分支应被强制删除
5. 测试删除当前分支 - 应被阻止（现有逻辑）
6. 测试删除有工作树的分支 - 应被阻止（现有逻辑）

### 功能 2：终端按钮
1. 测试按钮图标显示 - 应显示 `Terminal` 图标
2. 测试 tooltip - 应显示正确的文字说明
3. 测试按钮功能 - 应正常打开终端

### 功能 3：图标一致性
1. 测试最近操作区显示 - `createWorktree` 和 `commit` 应显示新图标
2. 对比菜单和最近操作区 - 图标应一致
3. 测试其他操作图标 - 不应受影响

## 国际化需求

需要为以下语言添加新文本键：
- 英文（en.ts）
- 中文简体（zh-CN.ts）
- 日文（ja.ts）
- 韩文（ko.ts）

**新增键：**
- `local.branch-unmerged-confirm-title`
- `local.branch-unmerged-confirm-body`
- `local.branch-force-delete`

## 实施优先级

三个改进可以独立实施，建议顺序：
1. **高优先级**：功能 3（图标一致性）- 改动最小，风险最低
2. **中优先级**：功能 2（终端按钮）- 独立改动，不影响其他功能
3. **中优先级**：功能 1（分支删除）- 涉及前后端，需要完整测试

## 风险评估

### 功能 1：分支删除
- **风险**：用户可能误删除重要的未合并分支
- **缓解**：通过明确的警告对话框和 destructive 样式按钮提醒用户
- **风险等级**：中

### 功能 2：终端按钮
- **风险**：用户可能不习惯新图标
- **缓解**：`Terminal` 是行业标准图标，易于识别
- **风险等级**：低

### 功能 3：图标一致性
- **风险**：用户需要适应新图标
- **缓解**：新图标语义更准确，且与菜单一致
- **风险等级**：低

## 总结

本设计涵盖三个独立的 UI 改进，每个改进都以最小化改动、保持一致性为原则。通过合理的安全机制（确认对话框）和标准化设计（统一图标），提升 Hobgoblin 的用户体验和界面质量。
