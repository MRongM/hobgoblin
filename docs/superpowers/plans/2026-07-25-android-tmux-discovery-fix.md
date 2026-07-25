# Android tmux Discovery Fix Implementation Plan

> **执行方式：** 用户已确认采用 project-scoped 修复，并要求在当前 linked worktree 内 inline 执行；不创建分支、不提交、不推送。

**目标：** Android 从 linked worktree 添加项目时，使用主工作树作为稳定的 tmux project root，同时在 SSH 非登录环境中可靠定位 tmux，并把 tmux 不可用报告为明确错误。

**设计边界：** 继续只扫描当前 Project 对应的 project-scoped tmux server 与兼容的 legacy default server，不扩大到机器级 socket 枚举。主工作树路径决定 server/session 哈希；用户选择的 linked worktree 路径只决定终端 working directory。

**技术栈：** Kotlin、Jetpack Compose、SSHJ、JUnit 4、Git worktree porcelain protocol。

---

## Task 1：锁定失败行为

**Files:**
- Modify: `android/app/src/test/java/dev/hobgoblin/android/terminals/TmuxSessionProtocolTest.kt`
- Modify: `android/app/src/test/java/dev/hobgoblin/android/terminals/SshTerminalStartupCommandTest.kt`
- Modify: `android/app/src/test/java/dev/hobgoblin/android/terminals/RemoteTmuxSessionServiceTest.kt`
- Modify: `android/app/src/test/java/dev/hobgoblin/android/ssh/RemoteRepositoryGitServiceTest.kt`
- Modify: `android/app/src/test/java/dev/hobgoblin/android/ui/screens/repositories/RepositorySetupStateTest.kt`

1. 断言 tmux 脚本先尝试当前 PATH，再通过远端 login shell 解析绝对可执行路径，后续所有操作均使用该路径。
2. 断言 discovery 收到 `exit 127` 时返回失败，而非空会话列表。
3. 断言项目检查脚本从 `git worktree list --porcelain` 取主工作树。
4. 断言已保存为 linked worktree 的旧项目，可从 snapshot 得到主工作树 project root，并保留所有有效 worktree 作为发现路径。
5. 运行定向测试并确认新测试先失败。

## Task 2：统一 tmux 可执行文件解析

**Files:**
- Modify: `android/app/src/main/java/dev/hobgoblin/android/terminals/TmuxSessionProtocol.kt`
- Modify: `android/app/src/main/java/dev/hobgoblin/android/terminals/SshTerminalService.kt`
- Modify: `android/app/src/main/java/dev/hobgoblin/android/terminals/RemoteTmuxSessionService.kt`

1. 在协议模块集中生成 tmux resolver shell function。
2. resolver 优先 `command -v tmux`，失败后使用 `${SHELL:-/bin/sh} -lc 'command -v tmux'`，仅接受可执行的绝对路径。
3. attach/create/list/kill 全部引用 resolver 产出的已引用绝对路径。
4. discovery 仅把“无 server/无 session”视为空结果；`exit 127` 保持失败。
5. 运行 tmux 相关定向测试。

## Task 3：统一 linked worktree 的 Project 身份

**Files:**
- Modify: `android/app/src/main/java/dev/hobgoblin/android/ssh/RemoteRepositoryGitService.kt`
- Modify: `android/app/src/main/java/dev/hobgoblin/android/ui/screens/repositories/RepositorySetupScreen.kt`
- Modify: `android/app/src/main/java/dev/hobgoblin/android/HobgoblinAndroidApp.kt`

1. 新增项目检查时，将 Git linked worktree 归一化为 porcelain 列表中的主工作树路径。
2. 从 repository snapshot 建立单一 `RepositoryTmuxScope`：主工作树为 `projectRoot`，非缺失 worktree 为允许路径。
3. discovery、恢复及新建 tmux terminal 显式传递同一个 `projectRoot`，避免闭包继续使用旧 linked 路径。
4. 对已保存的 linked-worktree Project，在首次加载 snapshot 后无损更新同一项目记录的 `remotePath`。
5. 运行仓库与 UI 状态定向测试。

## Task 4：回归验证

**Files:**
- Verify only

1. 运行 `./gradlew :app:testDebugUnitTest`。
2. 运行 `bun run test`、`bun run typecheck`、`bun run check:architecture`。
3. 检查 `git diff`，确保未覆盖用户现有的列表排序/远程分支改动。
4. 如有连接设备，再执行 Android 实机 smoke test；没有设备则明确记录该验证边界。

