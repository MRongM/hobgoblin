# 子工作区批量推送创建上游设计

**日期**：2026-08-23  
**状态**：已确认，授权当前会话内自主实施

## 目标与范围

子工作区“批量推送”允许没有可用 Git upstream 的成员在同一次操作中选择仓库远端、创建与目标本地分支同名的远程分支，并把它设置为 upstream。

本次只修改主应用的子工作区批量推送。单工作树推送、批量更换上游、批量拉取、合并管线和独立 Windows 包不在范围内。

## 方案比较

### 采用：扩展批量推送计划与执行映射

推送计划投影每个成员的 upstream、远端候选以及是否需要创建 upstream。Renderer 为需要创建 upstream 的选中成员维护一次性远端选择，执行输入显式区分普通推送和创建 upstream。服务端重建计划并校验映射后执行推送。

该方案把“选择目标”和“远程写入”保留在一个批量操作中，沿用现有计划令牌、顺序执行、失败隔离、重试、取消和失效发布语义。

### 不采用：先执行批量更换上游，再批量推送

批量更换上游只能选择已经存在的远程跟踪分支，无法创建尚不存在的同名远程分支。即使扩展它，也会产生两个用户操作和一个可见的中间状态；设置成功但推送失败时，用户必须跨两个批次理解结果。

### 不采用：继续由底层自动猜测远端

现有单分支推送能在存在 `origin` 或只有一个远端时自动选择并执行 `git push -u`，但多个非 `origin` 远端时会失败为远端歧义。继续隐式推断不能满足批量计划的可审查性，也无法表达每个仓库不同的远端选择。

## 领域语义

- upstream 的远端仍存在时，成员沿用现有 upstream 的远端和远程分支；即使远程跟踪引用标记为 gone，推送也会重建该远程分支，不改变 upstream 映射。
- upstream 缺失、指向本地分支，或其远端已经不存在时，成员需要创建 upstream。
- 创建 upstream 时只允许选择该成员仓库当前计划中存在的远端，远程分支名固定等于成员目标本地分支名。
- 默认远端优先 `origin`；没有 `origin` 且只有一个远端时选择该远端；多个非 `origin` 远端不自动猜测，用户必须在成员行选择。
- 没有任何远端的成员保持可见但不可选择，并显示既有“需要远端”原因。
- 选择只属于当前面板，不持久化、不跨窗口同步，也不写入子工作区清单。

## 共享计划与执行协议

推送成员计划在既有仓库、目标分支、提交、upstream 和失联状态之外增加：

- `requiresUpstreamCreation`：当前推送是否必须创建并设置 upstream；
- `pushRemotes`：按远端名排序的允许候选。

计划指纹继续绑定完整远端集合，因此远端在确认前变化会使计划失效。

推送执行不再只提交成员名，而提交判别映射：

```ts
type BranchWorkspaceBatchPushTargetInput =
  | { repositoryName: string; action: 'push' }
  | { repositoryName: string; action: 'create-upstream'; remote: string }
```

普通推送只能用于不需要创建 upstream 的计划成员；创建 upstream 只能用于需要创建 upstream 的成员，且 `remote` 必须属于该成员的 `pushRemotes`。服务端按清单顺序重排输入并拒绝空映射、重复成员、非法远端、动作与计划状态不一致或候选已变化的请求。

第一次执行锁定完整推送映射。部分失败后的重试必须使用同一映射并跳过已完成成员，不能把失败成员静默改推到另一个远端。

## 执行与数据流

```text
打开批量推送
  → 服务端建立 push 计划并投影每个成员的 upstream/远端事实
  → Renderer 默认勾选可执行成员并为缺失 upstream 的成员选择 origin/唯一远端
  → 用户补齐多远端成员选择并确认
  → 服务端规范化输入、重建并校验计划、锁定映射
  → 按子工作区清单顺序逐成员执行
      普通成员：git push <upstream-remote> <local>:<upstream-branch>
      创建成员：git push -u <selected-remote> <local>:<local>
  → 汇总失败并发布受影响仓库失效
```

底层本地与 SSH 推送目标解析增加一个可选、已经过计划校验的创建远端。它不会覆盖仍可用的既有 upstream；只有需要创建 upstream 时才把该远端传给现有 `git push` / SSH `gitPush` 命令。公开的单分支 `/api/repo/push` 请求保持原协议和现有自动回退行为。

批量推送继续顺序执行。一个成员失败不阻止后续成员，成功写入不回滚；取消在当前底层网络操作的安全边界后阻止后续成员开始。

## UI 行为

- 现有 upstream 的行保持当前展示和选择行为。
- 需要创建 upstream 的行显示远端选择器，并明确展示将创建 `<remote>/<targetBranch>`。
- `origin` 或唯一远端在面板打开时默认选择；多个非 `origin` 远端显示占位提示。
- 选中成员缺少远端选择时，“批量推送”按钮禁用。
- 取消选择的成员不要求补齐远端，也不进入执行输入。
- 操作开始后复选框和远端选择器锁定；进度、失败、未选择和重试继续复用现有批量进度投影。
- 自动 AI 提交并推送没有远端选择界面：它只对所有需要创建 upstream 的成员均存在默认远端时继续；否则停止在新 push 计划并提示用户改用批量推送选择远端。

新增文案覆盖英文、简体中文、日文和韩文，包含“创建上游”“选择远端”“将创建的上游”和“请选择创建上游的远端”。

## 架构与状态所有权

- `src/shared/branch-workspace-git-actions.ts`：共享计划事实、推送判别输入和严格规范化。
- `src/server/modules/branch-workspace-git-action-plan.ts`：读取并指纹绑定成员 upstream 与远端候选。
- `src/server/modules/branch-workspace-git-action-write-paths.ts`：重建校验、首次映射锁定、顺序执行、失败/重试/取消和失效。
- `src/server/modules/repo-write-paths.ts`、`repo-backend.ts`：把服务端已校验的可选创建远端传给本地或 SSH source。
- `src/system/git/remote.ts`、`src/system/ssh/git.ts`：解析显式创建远端并复用现有非 force `push -u` 命令。
- `src/web/hooks/useBranchWorkspaceGitActions.ts`：提交计划绑定的推送映射，并处理自动提交推送的默认映射。
- `src/web/components/repo-workspace/BranchWorkspaceGitActionDialog.tsx`：维护当前面板的远端选择和可执行性。

不新增路由、持久化、全局 store、后台任务、Electron 依赖或第三方包。服务端继续拥有 Git 写入权威，Renderer 只提交计划允许的成员身份与远端选择。

## 错误与安全边界

- Renderer 不提交工作树路径、任意远程分支名或 refspec；远程分支固定从服务端计划中的目标分支派生。
- 远端名同时经过共享输入校验、计划候选校验和 system/source 层安全校验。
- 计划后远端、upstream、目标提交或目标工作树事实变化会使执行失败并要求重新检查，不静默回退到另一个远端。
- 推送保持非 force；本次不增加 force、删除、覆盖保护分支或自动 pull。
- 已有 upstream 的成员不会因 Renderer 传入创建动作而改绑到其他远端。

## 测试与验收

1. 共享协议接受合法普通/创建映射，拒绝空输入、重复成员、非法远端和旧 `repositoryNames` 推送形状。
2. 推送计划正确区分可用 upstream、gone upstream、缺失 upstream、已删除 upstream 远端和无远端仓库，并稳定排序候选。
3. 计划令牌在目标提交、upstream 或远端集合变化时改变。
4. 写路径拒绝动作与计划不一致、计划外远端和重试时改变远端；合法创建映射按清单顺序调用推送。
5. 一个创建失败不阻止后续成员，成功成员不回滚，取消和失效范围保持既有语义。
6. 本地推送对显式远端生成 `git push -u -- <remote> <branch>:<branch>`；SSH 推送生成等价 `gitPush` 命令。
7. 普通单分支推送和已有 upstream 推送行为不变。
8. 面板默认选择 `origin`/唯一远端，多远端要求选择，未选中成员不阻塞，提交映射准确且执行中控件锁定。
9. 自动 AI 提交并推送仅在所有创建成员都有默认远端时继续。
10. 运行定向测试、`bun run typecheck`、`bun run check:architecture`、`bun run build:web`、`git diff --check` 和主应用全量 `bun run test`。

## 架构压力检查结论

- **仓库隔离**：每个远端选择绑定一个清单成员和该成员自己的远端集合，不跨仓库复用。
- **写入权威**：Renderer 选择不构成授权，服务端重建计划后才决定可执行目标。
- **竞态**：目标提交、upstream 和远端集合均进入计划复检；计划失效时不自动重选。
- **部分成功**：创建 upstream 是推送成功的一部分，不拆成独立预写步骤；失败不会留下“只设置配置但未推送”的应用步骤。
- **重试确定性**：首次映射锁定，避免失败重试改变远端目的地。
- **兼容性**：单分支推送、现有 upstream、gone upstream、本地仓库和 SSH 仓库均保留既有命令路径。
- **分层**：共享层只定义协议，服务端写路径拥有策略，source 层只执行已验证目标，Renderer 只维护交互状态。

不创建 ADR：该决策局限于既有批量推送协议，容易在同一功能切片内调整，不满足难以逆转的条件。
