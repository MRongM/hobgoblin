# Android 工作树移除与双向合并实施计划

> **执行方式：** 当前会话使用 `superpowers:executing-plans` 内联执行；每项生产代码前必须先运行对应失败测试。项目未授权 Git 提交，因此所有 commit 步骤省略。

**目标：** 修正 Android primary worktree 删除身份判定，并为已有远端工作树增加 merge-in 与 merge-out。

**架构：** `RemoteWorktreeService` 保持创建/删除职责，并通过项目路径与 Git primary 标记共同判定删除身份。新增独立 `RemoteWorktreeMergeService` 负责 SSH Git merge；Compose 只持有对话框选择和执行状态，成功或失败后刷新远端快照。

**技术栈：** Kotlin 2、Jetpack Compose Material 3、SSHJ 边界、JUnit 4、Gradle Android 插件。

## 全局约束

- 不新增依赖。
- 不执行 `git commit`、`git push`、`git reset` 或分支操作。
- Android 合并只操作已有工作树，不创建隐藏临时工作树。
- 不自动 pull、push、fetch、commit、stash、rebase、squash 或解决冲突。
- 所有 SSH 路径和分支参数必须使用现有单引号 shell quote 规则。
- 四种 Android 资源目录 `values`、`values-b+zh+Hans`、`values-ja`、`values-ko` 必须保持键一致。
- 合并冲突保留在实际目标工作树，错误原样返回并刷新快照。

---

### Task 1：修正工作树移除身份策略

**文件：**

- 修改：`android/app/src/test/java/com/mrongm/hobgoblin/ssh/RemoteWorktreeServiceTest.kt`
- 修改：`android/app/src/test/java/com/mrongm/hobgoblin/ui/screens/repositories/RepositorySetupStateTest.kt`
- 修改：`android/app/src/main/java/com/mrongm/hobgoblin/ssh/RemoteWorktreeService.kt`
- 修改：`android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/repositories/RepositorySetupScreen.kt`
- 修改：`android/app/src/main/res/values*/strings.xml`

**接口：**

- 产出：`evaluateWorktreeRemoval(repositoryPath: String, worktree: RemoteRepositoryWorktree): WorktreeRemovalSafety`
- 产出：`WorktreeRemovalBlockReason.IdentityChanged`
- 移除：`WorktreeRemovalBlockReason.ProtectedBranch`

- [ ] **Step 1：写失败测试**

新增断言：

```kotlin
assertTrue(evaluateWorktreeRemoval("/srv/app", safeWorktree().copy(branch = "main")).allowed)
assertEquals(
    WorktreeRemovalBlockReason.Primary,
    evaluateWorktreeRemoval("/srv/app", safeWorktree().copy(path = "/srv/app", isPrimary = true)).blockReason,
)
assertEquals(
    WorktreeRemovalBlockReason.IdentityChanged,
    evaluateWorktreeRemoval("/srv/app", safeWorktree().copy(path = "/srv/app", isPrimary = false)).blockReason,
)
assertEquals(
    WorktreeRemovalBlockReason.IdentityChanged,
    evaluateWorktreeRemoval("/srv/app", safeWorktree().copy(isPrimary = true)).blockReason,
)
```

服务测试把 `main` linked worktree 传给 `removeWorktree()`，期望生成无 `--force` 的 `git worktree remove`。UI 文案测试期望 `IdentityChanged` 映射到新的本地化键。

- [ ] **Step 2：验证 RED**

运行：

```bash
cd android
./gradlew testDebugUnitTest --tests "com.mrongm.hobgoblin.ssh.RemoteWorktreeServiceTest" --tests "com.mrongm.hobgoblin.ui.screens.repositories.RepositorySetupStateTest"
```

预期：编译或断言失败，因为新签名和 `IdentityChanged` 尚不存在，且 `main` 仍被保护。

- [ ] **Step 3：实现最小策略**

实现稳定远端路径身份和新规则：

```kotlin
fun evaluateWorktreeRemoval(
    repositoryPath: String,
    worktree: RemoteRepositoryWorktree,
): WorktreeRemovalSafety {
    val pathIdentifiesPrimary = normalizeRemoteWorktreePath(repositoryPath) ==
        normalizeRemoteWorktreePath(worktree.path)
    if (pathIdentifiesPrimary != worktree.isPrimary) {
        return WorktreeRemovalSafety(false, "Worktree identity changed; refresh and try again.", WorktreeRemovalBlockReason.IdentityChanged)
    }
    return when {
        pathIdentifiesPrimary -> WorktreeRemovalSafety(false, "Primary worktree cannot be removed.", WorktreeRemovalBlockReason.Primary)
        worktree.isDirty -> WorktreeRemovalSafety(false, "Dirty worktree cannot be removed.", WorktreeRemovalBlockReason.Dirty)
        worktree.isLocked -> WorktreeRemovalSafety(false, "Locked worktree cannot be removed.", WorktreeRemovalBlockReason.Locked)
        worktree.isMissing -> WorktreeRemovalSafety(false, "Missing worktree cleanup is not supported here.", WorktreeRemovalBlockReason.Missing)
        else -> WorktreeRemovalSafety(true, null)
    }
}
```

`RemoteWorktreeService.removeWorktree()` 使用 `target.remotePath`；`WorktreeRow` 接收 `repositoryPath`。删除固定分支名函数和四语种旧保护文案，新增身份变化文案。

- [ ] **Step 4：验证 GREEN**

重复 Step 2 命令，预期 PASS。

---

### Task 2：建立 Android 双向合并领域策略与 SSH 服务

**文件：**

- 创建：`android/app/src/main/java/com/mrongm/hobgoblin/ssh/RemoteWorktreeMergeService.kt`
- 创建：`android/app/src/test/java/com/mrongm/hobgoblin/ssh/RemoteWorktreeMergeServiceTest.kt`

**接口：**

- 产出：`WorktreeMergeBlockReason`
- 产出：`WorktreeMergeSafety`
- 产出：`evaluateMergeDestination(worktree)`
- 产出：`evaluateMergeOutSource(worktree)`
- 产出：`mergeIntoSourceBranches(snapshot, destination)`
- 产出：`mergeOutDestinationWorktrees(snapshot, source)`
- 产出：`RemoteWorktreeMergeService.mergeInto(target, destination, sourceBranch)`
- 产出：`RemoteWorktreeMergeService.mergeOut(target, source, destination)`

- [ ] **Step 1：写领域策略失败测试**

覆盖：

```kotlin
assertEquals(listOf("main", "release/next"), mergeIntoSourceBranches(snapshot, featureWorktree))
assertEquals(listOf(mainWorktree), mergeOutDestinationWorktrees(snapshot, featureWorktree).map { it.worktree })
assertEquals(WorktreeMergeBlockReason.Detached, evaluateMergeDestination(detached).blockReason)
assertEquals(WorktreeMergeBlockReason.Dirty, evaluateMergeDestination(dirty).blockReason)
assertEquals(WorktreeMergeBlockReason.Dirty, evaluateMergeOutSource(dirty).blockReason)
```

目标候选保留带分支的脏项及 Git 报告的 bare/missing 项但标为不可用；同路径、同分支和普通 detached 项必须排除。

- [ ] **Step 2：验证策略 RED**

运行：

```bash
cd android
./gradlew testDebugUnitTest --tests "com.mrongm.hobgoblin.ssh.RemoteWorktreeMergeServiceTest"
```

预期：FAIL，因为合并策略和服务尚不存在。

- [ ] **Step 3：实现纯策略**

实现：

```kotlin
enum class WorktreeMergeBlockReason { Detached, Dirty, Missing, Bare }

data class WorktreeMergeSafety(
    val allowed: Boolean,
    val reason: String? = null,
    val blockReason: WorktreeMergeBlockReason? = null,
)

data class WorktreeMergeDestination(
    val worktree: RemoteRepositoryWorktree,
    val safety: WorktreeMergeSafety,
)
```

目标需带分支、非 dirty、非 missing、非 bare；merge-out 来源使用相同结构检查，候选来自快照现有工作树。

- [ ] **Step 4：写服务失败测试**

覆盖：host 未信任拒绝、merge-in 在操作工作树执行、merge-out 在目标工作树执行、同分支拒绝、脏来源/目标拒绝、Git 错误透传、参数安全引用，以及执行时 repository/branch/clean/source-ref 复核：

```kotlin
service.mergeInto(target(), featureWorktree, "main")
assertTrue(client.lastScript.contains("rev-parse --path-format=absolute --git-common-dir"))
assertTrue(client.lastScript.contains("symbolic-ref --quiet --short HEAD"))
assertTrue(client.lastScript.contains("status --porcelain"))
assertTrue(client.lastScript.endsWith("git -C '/srv/app-feature' merge -- 'main'"))

service.mergeOut(target(), featureWorktree, mainWorktree)
assertTrue(client.lastScript.endsWith("git -C '/srv/app' merge -- 'feature/android'"))
```

- [ ] **Step 5：验证服务 RED**

重复 Step 2 命令，预期在缺失服务方法或命令断言处 FAIL。

- [ ] **Step 6：实现最小 SSH 服务**

服务复用 `SshClientFacade` 和 `HostKeyTrustStore` 模式。每个方向只发出一个远端脚本；脚本先复核项目与来源/目标的 Git common-dir、当前分支和 clean 状态，并确认来源本地 ref 仍存在，再在目标工作树路径执行：

```kotlin
git -C '<destination.path>' merge -- '<sourceBranch>'
```

merge-out 在同一脚本中依次复核来源与目标，避免两个 SSH 命令之间的状态竞态。使用 `require(result.ok)` 返回 `message`、`stderr` 或稳定 fallback。

- [ ] **Step 7：验证 GREEN**

重复 Step 2 命令，预期 PASS。

---

### Task 3：接入 Compose 工作树操作和双向合并对话框

**文件：**

- 创建：`android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/repositories/WorktreeMergeDialog.kt`
- 创建：`android/app/src/test/java/com/mrongm/hobgoblin/ui/screens/repositories/WorktreeMergeDialogStateTest.kt`
- 修改：`android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/repositories/RepositorySetupScreen.kt`
- 修改：`android/app/src/test/java/com/mrongm/hobgoblin/ui/screens/repositories/RepositorySetupScreenContractTest.kt`
- 修改：`android/app/src/main/res/values*/strings.xml`

**接口：**

- 产出：`sealed interface WorktreeMergeRequest`
- 产出：`WorktreeMergeRequest.MergeInto(destination)`
- 产出：`WorktreeMergeRequest.MergeOut(source)`
- 产出：`WorktreeMergeDialog(request, snapshot, pending, error, onMergeInto, onMergeOut, onDismiss)`
- Repository screen 新增 callbacks：
  - `onMergeInto: (RemoteRepositoryWorktree, String) -> Unit`
  - `onMergeOut: (RemoteRepositoryWorktree, RemoteRepositoryWorktree) -> Unit`

- [ ] **Step 1：写 UI 状态与契约失败测试**

测试本地化 blocker 映射、候选显示标签和源码契约：

```kotlin
assertEquals(LocalizedText(R.string.repository_worktree_merge_dirty), worktreeMergeBlockedText(WorktreeMergeBlockReason.Dirty))
assertTrue(source.contains("WorktreeMergeDialog("))
assertTrue(source.contains("onMergeInto ="))
assertTrue(source.contains("onMergeOut ="))
```

Android 本地化契约测试应自动检查新增键在四个目录一致。

- [ ] **Step 2：验证 RED**

运行：

```bash
cd android
./gradlew testDebugUnitTest --tests "com.mrongm.hobgoblin.ui.screens.repositories.WorktreeMergeDialogStateTest" --tests "com.mrongm.hobgoblin.ui.screens.repositories.RepositorySetupScreenContractTest" --tests "com.mrongm.hobgoblin.AndroidLocalizationContractTest"
```

预期：FAIL，因为对话框、callbacks 和资源键尚不存在。

- [ ] **Step 3：实现对话框与工作树菜单**

工作树卡保留“终端”，新增“操作”菜单。菜单中：

- 带分支且可用时显示“合并入”；
- merge-out 来源可用且存在其他目标工作树时显示“合并出”；
- 删除资格允许时显示“移除”；
- 删除被阻塞时继续在卡片正文展示准确原因。

对话框使用 `DropdownMenu` 选择来源分支或目标工作树；确认按钮只在选中可用候选且非 pending 时启用。新增英中日韩的“操作、合并入、合并出、来源、目标、确认、失败、detached/dirty/missing/bare”文案。

- [ ] **Step 4：接入执行状态**

`RepositoryWorkspaceScreen` 增加 `mergeRequest`、`mergePending` 和独立 `mergeError` 协调。`mergeInto` 在 IO dispatcher 调用 `onMergeInto(destination, sourceBranch)`；`mergeOut` 在 IO dispatcher 调用 `onMergeOut(source, destination)`。两者成功时关闭对话框并刷新快照；失败时在前台显示错误，保留最近快照，并在刷新后按路径重投影请求对象及安全状态；执行期间不能重复提交。

- [ ] **Step 5：验证 GREEN**

重复 Step 2 命令，预期 PASS。

---

### Task 4：应用装配与端到端静态契约

**文件：**

- 修改：`android/app/src/main/java/com/mrongm/hobgoblin/MainActivity.kt`
- 修改：`android/app/src/main/java/com/mrongm/hobgoblin/HobgoblinAndroidApp.kt`
- 修改：`android/app/src/test/java/com/mrongm/hobgoblin/ui/screens/repositories/RepositorySetupScreenContractTest.kt`

**接口：**

- 消费：`RemoteWorktreeMergeService`
- 传递：Repository screen 的 `onMergeInto` / `onMergeOut`

- [ ] **Step 1：写装配失败测试**

扩展源码契约，要求 `MainActivity` 创建 `RemoteWorktreeMergeService`，应用根将两个方向回调连接到服务。

- [ ] **Step 2：验证 RED**

运行：

```bash
cd android
./gradlew testDebugUnitTest --tests "com.mrongm.hobgoblin.ui.screens.repositories.RepositorySetupScreenContractTest"
```

预期：FAIL，因为装配尚未完成。

- [ ] **Step 3：实现装配**

`MainActivity` 用与现有工作树服务相同的 SSH client 和 host key store 创建合并服务；`HobgoblinAndroidApp` 接收服务并把回调传给 Repository screen。回调本身不改变终端记录。

- [ ] **Step 4：验证 GREEN**

重复 Step 2 命令，预期 PASS。

---

### Task 5：全量验证与设计状态更新

**文件：**

- 修改：`docs/superpowers/specs/2026-07-29-android-worktree-removal-merge-design.md`

- [ ] **Step 1：运行 Android 全量验证**

```bash
cd android
./gradlew :app:testDebugUnitTest :app:lintDebug :app:assembleDebug
```

预期：BUILD SUCCESSFUL，无测试或 lint 失败。

- [ ] **Step 2：运行根级验证**

```bash
bun run typecheck
bun run test
bun run check:architecture
git diff --check
```

预期：全部退出码为 0。

- [ ] **Step 3：更新设计状态并审查 diff**

把设计文档状态改为“已实现并验证”。检查：

- 固定分支名保护和旧资源键已完全移除；
- linked `main` 回归测试存在；
- 合并命令只作用于显式目标工作树；
- 没有 `--force`、隐藏临时工作树、自动网络 Git 操作或新增依赖；
- 没有真实用户、路径、邮箱、token 或内部标识进入测试/文档。
