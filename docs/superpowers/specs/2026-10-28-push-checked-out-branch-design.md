# 推送到已检出分支

## 用户确认的行为

工作树菜单只推送指定分支已有的提交，发送端的暂存、未暂存和未跟踪内容不阻碍推送。用户选择自动安全处理接收端已检出的目标分支：可安全更新时完成推送，不能安全更新时保留错误与现场。

## 方案与架构审查

沿用现有服务器写路径、仓库网络操作互斥、取消和失效通知。系统层先正常推送；只有 Git 明确拒绝更新接收端已检出分支时，才使用 `--receive-pack=git -c receive.denyCurrentBranch=updateInstead receive-pack` 重试一次。Git 在接收端更新时检查索引和工作区，避免用客户端的过期状态做阻断判断。接收端既有 hooks 继续由 Git 执行。

永久设置接收端 `receive.denyCurrentBranch` 会改变之后的手动推送行为，故不采用。预先读取接收端状态会增加网络调用且存在检查与更新之间的竞争，也不作为门禁。普通推送成功或因其他原因失败时，不增加调用。

本地与 SSH/WSL 仓库共享一次重试策略，远程命令只增加受内部布尔字段控制的固定参数。目标远端、分支、上游创建、网络设置和取消信号在重试中保持一致。只覆盖普通分支推送；显式 detached HEAD 合并流水线保持既有语义。

不新增 UI 状态、传输接口、依赖或 realtime 通道；遵循 `docs/arch.md`、`docs/layering.md`、`docs/state-sync.md`。沿用现有领域术语，无新增 glossary 或 ADR。

## 安全边界与失败

- 不执行强推、reset、clean、stash、自动提交、接收端分支切换或永久配置写入。
- 接收端已修改的索引/工作区、文件覆盖冲突、分支非快进及 hook 拒绝，沿用 Git 的检查和错误。
- 重试前检查取消状态，最多重试一次；普通网络失败、鉴权失败和 hook 拒绝不重试。
- 恢复条件匹配 Git 的逐 ref 拒绝状态 `branch is currently checked out`，不根据 hook 输出的说明文字判断。
- `updateInstead` 允许接收端自定义 `push-to-checkout` hook；其行为仍由该仓库拥有，应用不覆盖 hook。

## 验证

真实临时仓库验证本地推送及 SSH 命令执行路径：干净的接收端与 linked worktree 可更新，发送端所有未提交内容完整保留，接收端配置不变；接收端暂存/未暂存修改与未跟踪文件覆盖冲突被拒绝；非快进仍被拒绝。单元测试验证成功不重试、非目标错误不重试、取消及一次重试上限。执行 typecheck、architecture guard 和完整测试并与改动前基线比较。

参考：[Git push](https://git-scm.com/docs/git-push)、[receive.denyCurrentBranch](https://git-scm.com/docs/git-config#Documentation/git-config.txt-receivedenyCurrentBranch)。
