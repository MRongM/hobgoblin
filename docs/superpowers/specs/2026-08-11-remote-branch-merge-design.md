# 合并入/合并出远程分支选择设计

**日期**：2026-08-11  
**状态**：已批准实施（用户授权自主决策与 Inline Execution）

## 背景

普通仓库与子工作区批量入口目前都只允许为“合并入”选择本地来源分支、为“合并出”选择本地目标分支。底层 Git 可以读取 remote-tracking ref，但远程跟踪引用不是可写分支；尤其“合并出到远程分支”不能等同于把提交合入 `origin/main` 这个本地缓存引用。

本次同时扩展普通“合并入/合并出”和子工作区“批量合入/批量合出”，并保持本地仓库、SSH 仓库、取消、代理、计划复检、冲突现场和批量失败隔离语义一致。

## 目标

1. 四个入口都能显式选择本地分支或已发现的 remote-tracking branch。
2. 协议保留选择种类，绝不通过 `origin/main` 这样的短名称推断本地或远程身份。
3. 远程合入在合并前获取所选 exact remote，随后把刷新后的 remote-tracking ref 合入现有目标工作树。
4. 远程合出不创建持久本地分支；使用受控 detached 临时工作树执行获取、合并、非强制精确推送和清理。
5. 批量入口继续按 manifest 顺序串行执行，单成员失败不阻塞后续成员，已完成 Git/远程写入不回滚。
6. 保持服务端拥有计划与 Git 事实，Renderer 只持有弹窗选择和展示状态。

## 非目标

- 不支持任意提交、标签、SHA 或自由输入 ref。
- 不自动创建、改名或关联本地 tracking branch。
- 不提供 force push、自动冲突解决、跨仓库事务或自动回滚。
- 不持久化最近选择或默认远程分支。
- 不改变普通 Git fetch/remote-branches 面板的独立交互。

## 方案比较

### 方案 A：把远程目标映射到本地 tracking branch

实现最少，但没有本地 tracking branch 时不可用；多个本地分支可以共享一个 upstream，映射存在歧义，还会意外修改用户工作树。拒绝。

### 方案 B：创建临时本地 tracking branch

可以复用现有 branch push，但进程中断会留下分支；命名冲突、强制删分支和恢复规则扩大了破坏性边界。拒绝。

### 方案 C：判别 ref + detached 临时工作树（采用）

远程来源是只读 ref；远程目标通过 detached `HEAD` 合并后精确推送。只新增窄的“把工作树 HEAD 推送到 exact remote branch”能力，不把任意 refspec 暴露给 route 或 Renderer。

## 领域与协议

共享层使用判别联合：

```ts
export type RepositoryMergeBranchSelection =
  | { kind: 'local'; branch: string }
  | { kind: 'remote'; remoteRef: string }
```

选择键必须同时包含 `kind` 与完整名称。本地 `origin/main` 与远程 `origin/main` 是两个不同候选。服务端把本地选择解析为 `refs/heads/<branch>`，把远程选择解析为 `refs/remotes/<remoteRef>`；Renderer 不拼接 Git ref。

远程候选计划包含 `{ remoteRef, head }`。本地与 SSH 统一使用 `for-each-ref` 读取短 ref 与 object id，过滤 symbolic `*/HEAD`。计划指纹绑定候选身份和 head；执行前的显式 fetch 后必须重新读取事实，计划型合并出与批量操作发现所选 head 漂移时要求用户刷新计划，来源工作树、方向和选择身份也不得漂移。

## 普通合并入

弹窗在同一选择器中呈现本地与远程来源，并明确标注种类。打开弹窗只读取现有 remote-tracking refs，不隐式联网。

- 本地来源：沿用直接 merge。
- 远程来源：执行 endpoint 先 fetch exact remote，确认所选 tracking ref 仍存在，再把 full remote ref 合入目标工作树。
- “拉取、合入并推送”仍只拉取和推送目标本地分支；远程来源没有 pull/push 所有权。
- 远程来源按钮文案明确包含“获取”，避免把网络写读隐藏在“仅合入”之后。

现有目标工作树是唯一冲突现场，远程来源不会创建工作树。

## 普通合并出

计划同时投影本地和远程目标：

- 本地目标沿用现有 worktree/临时 worktree、merge-only 和 pull-merge-push 语义。
- 远程目标只允许 synchronized merge-and-push：
  1. 复检来源工作树干净且来源 head 未变；
  2. fetch exact remote；
  3. 复检远程 ref 仍存在且 head 与已确认计划一致；若 fetch 发现远端已前移，则要求刷新计划；
  4. 在既有受控 merge-out 临时路径创建 detached worktree；
  5. 将来源本地 full ref 合入 detached `HEAD`；
  6. 普通非强制 push `HEAD:refs/heads/<remote branch>`；
  7. 成功、失败、冲突和取消后清理临时 worktree。

远端在 fetch 后再次前移时，Git non-fast-forward 拒绝负责保护远端历史。临时 worktree 冲突与现有未检出本地目标一致：报告诊断并清理，不保留隐藏冲突现场。

## 子工作区批量合并

批量计划为每个成员合并本地和远程候选，并继续以 repository name 重排执行输入。

### 批量合入

- 本地来源：`merge`。
- 远程来源：`fetch → merge`。
- 远端模式继续围绕成员目标分支执行 `pull → [fetch source] → merge → push`。
- 进度按成员实际包含或省略 `fetch` 步骤。

### 批量合出

- 本地目标 merge-only：沿用 `prepare → merge → cleanup?`。
- 本地目标远端模式：沿用 `prepare → pull → merge → push → cleanup?`。
- 远程目标：`fetch → prepare(detached) → merge → push exact remote → cleanup`。
- 只要选择中包含远程目标，就禁用 merge-only；远端模式按钮使用“同步、合出并推送”通用文案，允许一个批次混合本地和远程目标。
- 远程临时 worktree 在 push 失败并清理后清除该成员的 merge 进度，重试会基于重新获取的远端 head 再次合并，绝不把新 detached `HEAD` 误认为旧的已合并结果。

## 分层与状态所有权

- `src/shared/`：判别选择、远程 ref/head 类型、协议规范化、计划/结果类型。
- `src/system/git` 与 `src/system/ssh`：读取 ref/head、fetch exact remote、merge full ref、从工作树 HEAD 精确非强制 push。
- `RepoBackend`：屏蔽 local/SSH 差异，只暴露窄能力。
- `src/server/modules/*plan*`：组合本地/远程候选与指纹。
- `src/server/modules/*write-paths*`：复检、同步、临时 worktree、精确 push、清理与失效发布。
- `src/web/`：弹窗本地选择、候选标注、模式约束、实际步骤投影与文案。

选择和搜索是 renderer-local interaction state；计划、remote head、Git 写入和运行中进度是 server-owned runtime truth。不增加持久字段、全局 store、轮询、Electron API 或依赖。

## 错误与安全

- remote ref 消失：在任何 merge/push 前失败并要求刷新计划。
- fetch 失败：不创建临时 worktree、不执行 merge。
- source head/工作树漂移：在新 Git 写入前拒绝。
- non-fast-forward：保留 Git 诊断，清理临时 worktree，不 force push。
- merge conflict：现有用户工作树保留现场；应用临时 worktree 清理现场。
- cleanup 失败：返回 cleanup 失败并保留精确路径诊断，后续重试只处理受控前缀路径。
- 取消：沿用网络取消与批量取消，finally 发布相关仓库失效。

## 测试策略

- Shared：判别联合规范化、键唯一性、full ref 投影、非法/歧义输入拒绝。
- System local/SSH：ref/head 解析、exact remote fetch、`HEAD:refs/heads/*` 非强制 push、shell quoting。
- Server plan：本地/远程候选组合、同名候选不冲突、head 指纹、remote `*/HEAD` 排除。
- Server write：普通/批量远程来源 fetch-before-merge；远程目标 fetch/detached/merge/push/cleanup；删除、前移、冲突、取消、non-fast-forward、重试进度复位。
- Renderer：四个入口显示远程候选；远程合出禁用 merge-only；混合批次模式与实际 fetch 步骤；加载/空/失败文案；请求保留 kind。
- 文案：中英日韩键集合一致。
- 全量：`bun run typecheck`、`bun run test`、`bun run check:architecture`、`git diff --check`。

## 架构压力检查结论

- **语义无歧义**：kind 是协议身份，不靠字符串猜测。
- **远端安全**：只做 exact remote fetch 和非强制 exact push；不生成任意 refspec。
- **清理边界小**：仅清理应用可证明拥有的临时 worktree，不创建临时本地分支。
- **仓库隔离**：批量仍由各成员独立执行，失败隔离且不回滚已完成写入。
- **状态所有权正确**：Renderer 不拥有 Git 事实，计划和复检留在服务端。
- **KISS/YAGNI**：只扩展两类候选与必要管线，不支持任意 ref、默认值、持久偏好或 force push。

不创建 ADR：这是现有仓库合并能力内的可逆功能扩展，没有形成跨功能、难以逆转的平台决策。
