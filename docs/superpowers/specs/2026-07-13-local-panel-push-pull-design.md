# 本地面板推拉功能设计

## 概述

为本地面板（`ProjectLocalPanel`）的分支与标签列表项添加推送和拉取能力，使用户无需切换到 worktree 面板即可完成基础的 Git 网络操作。

## 需求范围

### 本地分支
- **拉取**：从远端 fetch 更新到本地分支引用（`git fetch <remote> <upstream>:<branch>`），不切换工作树
- **推送**：推送本地分支到 upstream 远端
- 按钮始终显示，点击时判断条件（无 upstream/remote 则提示错误）

### 本地标签
- **推送**：推送本地标签到默认远端
- 拉取无意义（标签已在本地才会出现在列表中），只提供推送
- 按钮始终显示，点击时判断条件

### 非需求
- 不在本地面板提供 worktree 内的 `pull --ff-only` 合并操作（该能力保留在 worktree 面板）
- 不提供批量推拉
- 不提供 `fetch --tags` 全量同步（可后续讨论）

## 架构决策

### 方案选择：扩展现有 branch-action 框架

**本地分支推拉**
- 复用 `RepoBranchAction` 的 `{ kind: 'pull' | 'push' }` 类型
- 调用 `runBranchAction(repoId, { kind: 'pull', branch, worktreePath: undefined })`
- 走现有 action 队列调度，与 worktree 面板的推拉操作互斥
- 复用 `resources.fetch` 状态管理、`setLastResult` toast、刷新流程

**本地标签推送**
- 保持独立实现：`pushRepositoryLocalTag(repoId, name, signal, sourceToken)`
- 使用 `useAsyncPending` 管理 pending 态（与旧 `ProjectTagsPanel` 一致）
- 不纳入 branch-action 队列（标签与分支语义不同，避免过度抽象）

**拒绝的方案**
- **方案 B**：将标签推送也纳入 `RepoBranchAction` — 过度抽象，`RepoBranchAction` 名称语义与 tag 不符，且破坏现有稳定代码
- **方案 C**：完全独立实现 — 分支推拉操作脱离队列会产生竞态，违反 DRY 原则

## 数据流设计

### 本地分支拉取

```
用户点击拉取按钮
  ↓
submitBranchAction(repoId, { kind: 'pull', branch: name })
  ↓
runBranchAction → pullRepositoryBranch(repoId, branch, undefined)
  ↓
后端 pullBranch(cwd, branch, undefined)
  ↓
git fetch <remote> <upstream_branch>:<branch>
  ↓
刷新 repo 数据 → toast 结果
```

**关键点**：现有 `pullBranch(cwd, branch, worktreePath?)` 在 `worktreePath` 为 `undefined` 时已实现 fetch 到本地引用的语义（第 296-311 行）：
```typescript
const target = await getUpstreamParts(cwd, branch, signal)
if (!target) return { ok: false, message: 'error.invalid-arguments' }
return gitResultWithOptions(
  cwd,
  gitNetworkOptions(networkOptions, NETWORK_TIMEOUT_MS, signal),
  'fetch',
  '--',
  target.remote,
  `${target.branch}:${branch}`,
)
```

### 本地分支推送

```
用户点击推送按钮
  ↓
if isPushProtected(branch.name) → 弹确认框
  ↓
submitBranchAction(repoId, { kind: 'push', branch: name })
  ↓
runBranchAction → pushRepositoryBranch(repoId, branch)
  ↓
后端 pushBranch(cwd, branch) → git push
  ↓
刷新 repo 数据 → toast 结果
```

### 本地标签推送

```
用户点击推送按钮
  ↓
runPush('push', () => handlePushTag(tag))
  ↓
pushRepositoryLocalTag(repoId, tag, signal, sourceToken)
  ↓
后端 pushLocalGitTag → git push <remote> refs/tags/<tag>
  ↓
toast 结果（不触发 repo 数据刷新）
```

## UI 设计

### LocalBranchesPane（本地分支列表项）

**按钮布局**（行右侧，从左到右）：
```
[拉取 ↓] [推送 ↑] [删除 🗑]
```

**按钮规格**
- **拉取按钮**：`ArrowDownToLine` icon，`aria-label=t('local.branch-pull')`，`title=t('local.branch-pull')`
- **推送按钮**：`ArrowUpFromLine` icon，`aria-label=t('local.branch-push')`，`title=t('local.branch-push')`
- 三个按钮统一样式：`opacity-0 group-hover:opacity-100`（与删除按钮一致）
- 尺寸：`h-6 w-6`，icon `size-3.5`
- 颜色：`text-muted-foreground`

**显示条件**
- 当前分支（`branch.name === currentBranch`）：显示推拉按钮（点击时后端判断条件）
- 有 worktree 的分支：显示推拉按钮（拉取走 fetch 到引用，不进 worktree）
- 删除按钮保持现有逻辑：`branch.name !== currentBranch && !branch.worktree?.path` 才显示

**忙态处理**
- 读取 `useReposStore` 的 `resources.fetch.phase` 和 `repoOperationBusy(repoId, 'branchAction')`
- 忙时按钮 `disabled={isPending}`，icon 替换为 `<Loader2 className="size-3.5 animate-spin" />`
- 推荐封装为 `useLocalBranchPending(repoId)` hook

**保护分支**
- 推送时检查 `isPushProtected(branch.name)`，命中则弹 `PushProtectedConfirm` 对话框
- 拉取不需要确认

### LocalTagsPane（本地标签列表项）

**按钮布局**（行右侧，从左到右）：
```
[推送 ↑] [删除 🗑]
```

**按钮规格**
- **推送按钮**：`ArrowUpFromLine` icon，`aria-label=t('local.tag-push')`，`title=t('local.tag-push')`
- 样式与分支推送按钮一致

**忙态处理**
- 复用现有 `useAsyncPending<'push'>()` hook
- 忙时 `disabled={isPushPending}`，icon 替换为 `<Loader2 className="size-3.5 animate-spin" />`
- 需要跟踪当前推送的 tag：`pushingTag` 状态

## 类型调整

### RepoEventAction 修正

**修改前**（`src/web/stores/repos/types.ts:27`）：
```typescript
| { kind: 'pull'; branch: string; worktreePath: string }
```

**修改后**：
```typescript
| { kind: 'pull'; branch: string; worktreePath?: string }
```

**理由**：
- Worktree 面板拉取：`{ kind: 'pull', branch, worktreePath: '/path' }`
- 本地面板拉取：`{ kind: 'pull', branch, worktreePath: undefined }`
- Action history 展示可区分：有 `worktreePath` 显示"在 worktree 中拉取"，无则显示"拉取分支引用"

## i18n 文案

### 新增键值

**英文**（`src/shared/i18n/en.ts`）：
```typescript
'local.branch-pull': 'Pull branch',
'local.branch-push': 'Push branch',
'local.tag-push': 'Push tag',
'local.tag-push-success': 'Tag pushed successfully',
```

**中文**（`src/shared/i18n/zh.ts`）：
```typescript
'local.branch-pull': '拉取分支',
'local.branch-push': '推送分支',
'local.tag-push': '推送标签',
'local.tag-push-success': '标签推送成功',
```

**日文**（`src/shared/i18n/ja.ts`）：
```typescript
'local.branch-pull': 'ブランチをプル',
'local.branch-push': 'ブランチをプッシュ',
'local.tag-push': 'タグをプッシュ',
'local.tag-push-success': 'タグが正常にプッシュされました',
```

**韩文**（`src/shared/i18n/ko.ts`）：
```typescript
'local.branch-pull': '브랜치 가져오기',
'local.branch-push': '브랜치 푸시',
'local.tag-push': '태그 푸시',
'local.tag-push-success': '태그가 성공적으로 푸시되었습니다',
```

### 复用现有错误键
- `error.pull-no-remote` — 拉取时无远端
- `error.push-no-remote` — 推送时无远端
- `error.invalid-arguments` — 分支名/标签名无效
- `error.network-op-in-progress` — 网络操作进行中

## 实现清单

### 类型层
1. **`src/web/stores/repos/types.ts`**
   - 修改 `RepoEventAction` 的 `pull` 类型，`worktreePath` 改为可选

### UI 层
2. **`src/web/components/repo-workspace/ProjectLocalPanel.tsx`**
   - `LocalBranchesPane` 增加拉取/推送按钮
   - `LocalTagsPane` 增加推送按钮
   - 新增 `useLocalBranchPending(repoId)` hook（可选，或直接内联读 store）

### i18n 层
3. **`src/shared/i18n/en.ts`**
4. **`src/shared/i18n/zh.ts`**
5. **`src/shared/i18n/ja.ts`**
6. **`src/shared/i18n/ko.ts`**

### 测试层（推荐）
7. **`src/web/components/repo-workspace/ProjectLocalPanel.test.tsx`**
   - 验证按钮渲染条件
   - 验证点击行为（调用正确的 action）
   - 验证 pending 态

## 边界与约束

### 不需要修改的部分
- **系统层**：`src/system/git/branches.ts` 和 `src/system/git/tags.ts` 已满足需求
- **Action 类型**：`RepoBranchAction` 无需新增 `kind`
- **调度器**：`branch-action-scheduler.ts` 的 `isNetworkBranchActionKind()` 已涵盖 pull/push
- **后端路由**：`repo-client.ts` 的函数签名无需修改

### 行为保证
- 分支推拉走 `runBranchAction`，与 worktree 面板推拉互斥（通过 `branch-network-action` 队列）
- 标签推送与分支操作并发不冲突（标签是 immutable ref）
- 无 upstream 的分支点击拉取时，后端返回 `error.invalid-arguments`，前端 toast 提示
- 无 remote 的仓库点击推送时，后端返回 `error.push-no-remote`，前端 toast 提示

## 用户体验

### 操作流畅度
- 按钮 hover 时显示，避免界面拥挤
- pending 态用 spinner 替换 icon，清晰反馈
- toast 提示成功/失败，无需额外对话框（保护分支除外）

### 与现有功能一致性
- 保护分支推送弹确认框，与 worktree 面板行为一致
- 错误提示复用现有 i18n 键，文案统一
- 推拉按钮 icon 与 worktree 面板、action history 的 icon 一致

## 测试策略

### 单元测试
- `ProjectLocalPanel.test.tsx`：验证按钮渲染、点击行为、pending 态展示
- `branch-actions.test.ts`：已有 pull/push 测试覆盖，确认 `worktreePath: undefined` 路径

### 手动测试场景
1. **本地分支拉取**
   - 有 upstream 的分支：点击拉取，验证 fetch 成功 toast
   - 无 upstream 的分支：点击拉取，验证错误 toast
   - 拉取中再次点击：验证按钮 disabled
2. **本地分支推送**
   - 普通分支：点击推送，验证推送成功 toast
   - 保护分支（main/master）：点击推送，验证弹出确认框
   - 无 remote 的仓库：验证错误 toast
3. **本地标签推送**
   - 点击推送，验证推送成功 toast
   - 推送中再次点击：验证按钮 disabled
4. **并发操作**
   - Worktree 面板推送中，本地面板点击推送：验证队列等待
   - 本地面板标签推送中，分支推送：验证互不阻塞

## 风险与缓解

### 风险 1：用户误解拉取语义
**风险**：用户期望拉取后立即在工作树看到更新，但实际只更新了本地引用

**缓解**：
- i18n 文案明确：`'local.branch-pull': 'Pull branch'`（不是 "Pull into worktree"）
- Toast 成功提示可改为：`'Branch reference updated'`（可选）
- 或在设计文档中记录，未来可在 tooltip 中补充说明

### 风险 2：与 worktree 面板 pull 混淆
**风险**：两个面板的 pull 按钮行为不同

**缓解**：
- 本地面板没有 worktree 上下文，语义已足够区分
- 有 worktree 的分支在本地面板也显示推拉按钮，但拉取不进 worktree
- 用户若需 worktree 内 pull，切换到 worktree 面板即可

## 后续优化空间

1. **批量推拉**：选中多个分支/标签，批量推送/拉取
2. **Fetch all tags**：在 LocalTagsPane 顶部增加"同步所有标签"按钮（`git fetch --tags`）
3. **推拉历史**：在 action history 中区分本地面板与 worktree 面板的推拉操作
4. **进度展示**：网络操作中展示进度条（需后端支持）

## 实现顺序

1. 修改类型：`RepoEventAction` 的 `pull.worktreePath` 改为可选
2. 添加 i18n 文案（4 个语言文件）
3. 实现 `LocalBranchesPane` 拉取/推送按钮
4. 实现 `LocalTagsPane` 推送按钮
5. 编写/更新测试用例
6. 手动测试验证
7. 提交代码并创建 PR
