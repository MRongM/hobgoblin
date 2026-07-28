# Android Host tmux Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Android 主机详情中提供“项目 / tmux”双 Tab，并从默认及严格命名的 Hobgoblin tmux server 恢复已有终端，不再读取工作区配置。

**Architecture:** `TmuxSessionProtocol` 负责生成一次性只读 socket 扫描命令、解析版本化输出并提供精确 server 附着命令；`RemoteTmuxSessionService` 只负责 SSH 信任与远程执行；`TerminalSessionManager` 将 server target 纳入 retained terminal 身份和持久化。Compose 层新增主机详情及 tmux 目录界面，路由持有 Tab 和返回上下文，旧工作区目录链路整体移除。

**Tech Stack:** Kotlin 2.2、Jetpack Compose Material 3、Compose state、SSHJ、JUnit、Bun/TypeScript 仓库校验。

## Global Constraints

- 只读扫描，不创建、结束、重命名或迁移远端 tmux server/session。
- 只扫描默认 socket 与 `hobgoblin-project-v1-[a-f0-9]{24}` socket。
- 只接受 `hobgoblin-v1-[a-f0-9]{24}` session、规范化绝对 init path、正 terminal number、非负 attached client 数。
- 扫描恢复固定使用 `AttachExisting`，目标消失时失败，禁止隐式创建。
- 不读取 `workspace-configs.json`、`branch-workspaces.json`，不扫描 Git/worktree/目录。
- 新持久化字段向后兼容已有 17 字段 terminal record。
- 不新增依赖；不修改 Web 的 v1 名称算法。
- 保留工作区中已有且与本功能无关的 Android 语言选择改动。
- 按用户要求内联执行；不创建 subagent，不执行 `git commit` 或 `git push`。

---

### Task 1: 定义主机级 tmux 扫描协议

**Files:**
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/terminals/TmuxSessionProtocol.kt`
- Modify: `android/app/src/test/java/com/mrongm/hobgoblin/terminals/TmuxSessionProtocolTest.kt`

**Interfaces:**
- Consumes: 现有 `TmuxSessionIdentity`、tmux executable 解析脚本、路径规范化规则。
- Produces: `TmuxServerTarget`、`HostDiscoveredTmuxSession`、`HostTmuxPathGroup`、`hostSessionDiscoveryCommand()`、`parseHostSessionDiscoveryOutput(String)`、精确 server `attachExistingCommand(...)`。

- [ ] **Step 1: 写协议失败测试**

```kotlin
@Test
fun `host discovery parses default and named servers and groups by path`() {
    val output = listOf(
        TmuxSessionProtocol.HostDiscoveryHeader,
        "legacy-default\thobgoblin-v1-111111111111111111111111\t/srv/project\t1\t0",
        "hobgoblin-project-v1-222222222222222222222222\thobgoblin-v1-333333333333333333333333\t/srv/project\t2\t1",
    ).joinToString("\n")

    val sessions = TmuxSessionProtocol.parseHostSessionDiscoveryOutput(output)

    assertEquals(2, sessions.size)
    assertEquals(TmuxServerTarget.Default, sessions[0].server)
    assertEquals(1, HostTmuxPathGroup.from(sessions).single().sessions[1].attachedClients)
}
```

同时覆盖：无版本 header、非法 server/session/path/slot/attached 行、重复行、稳定排序、命名 server 精确附着、默认 server 精确附着、扫描命令包含 `$TMUX_TMPDIR/tmux-$uid` 回退及 `-S`。

- [ ] **Step 2: 运行协议测试并确认失败**

Run: `./gradlew :app:testDebugUnitTest --tests com.mrongm.hobgoblin.terminals.TmuxSessionProtocolTest`

Expected: FAIL，缺少 `TmuxServerTarget` 或 `parseHostSessionDiscoveryOutput`。

- [ ] **Step 3: 实现最小领域模型与版本化扫描协议**

```kotlin
sealed interface TmuxServerTarget {
    data object Default : TmuxServerTarget
    data class Named(val serverName: String) : TmuxServerTarget {
        init { require(TmuxSessionProtocol.isCurrentServerName(serverName)) }
    }
}

data class HostDiscoveredTmuxSession(
    val server: TmuxServerTarget,
    val identity: TmuxSessionIdentity,
    val terminalNumber: Int,
    val attachedClients: Int,
)
```

扫描 shell 只在 stdout 输出固定 header 和 tab 分隔合法候选；default 与 named socket 都通过实际 socket path 执行 `tmux -u -S "$socket" list-sessions`。Kotlin parser 验证 header、逐行丢弃 malformed candidate、按 path/terminal/server/session 去重排序。新增精确附着 overload：Default 使用 tmux 默认 server，Named 使用 `-L <serverName>`，两者只执行 has-session + attach-session，不含 new-session。

- [ ] **Step 4: 运行协议测试并确认通过**

Run: `./gradlew :app:testDebugUnitTest --tests com.mrongm.hobgoblin.terminals.TmuxSessionProtocolTest`

Expected: PASS，且原 macOS missing-socket 回归测试继续通过。

### Task 2: 将主机扫描接入 SSH 服务

**Files:**
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/terminals/RemoteTmuxSessionService.kt`
- Modify: `android/app/src/test/java/com/mrongm/hobgoblin/terminals/RemoteTmuxSessionServiceTest.kt`

**Interfaces:**
- Consumes: `TmuxSessionProtocol.hostSessionDiscoveryCommand()` 与 `parseHostSessionDiscoveryOutput(String)`。
- Produces: `RemoteHostTmuxDiscoveryResult` 与 `RemoteTmuxSessionService.discoverHostSessions(RemoteTarget)`。

- [ ] **Step 1: 写 SSH 边界失败测试**

```kotlin
@Test
fun `discover host sessions trusts once and runs one remote command`() = runTest {
    val result = service.discoverHostSessions(target)

    assertIs<RemoteHostTmuxDiscoveryResult.Loaded>(result)
    assertEquals(1, initializer.checkedTargets.size)
    assertEquals(1, executor.commands.size)
}
```

另测 host key 拒绝、SSH 执行失败、协议输出无效分别映射为稳定的 `Failed(message)`，空 header 输出映射为 `Loaded(emptyList())`。

- [ ] **Step 2: 运行服务测试并确认失败**

Run: `./gradlew :app:testDebugUnitTest --tests com.mrongm.hobgoblin.terminals.RemoteTmuxSessionServiceTest`

Expected: FAIL，缺少 `discoverHostSessions`。

- [ ] **Step 3: 实现一次信任检查与一次 SSH 命令**

```kotlin
sealed interface RemoteHostTmuxDiscoveryResult {
    data class Loaded(val sessions: List<HostDiscoveredTmuxSession>) : RemoteHostTmuxDiscoveryResult
    data class Failed(val message: String) : RemoteHostTmuxDiscoveryResult
}
```

方法复用现有 host-key 初始化与 executor；远程命令失败返回 `Failed`，parser 抛出的整体协议错误返回 `Failed`，合法空列表返回 `Loaded(emptyList())`。

- [ ] **Step 4: 运行服务测试并确认通过**

Run: `./gradlew :app:testDebugUnitTest --tests com.mrongm.hobgoblin.terminals.RemoteTmuxSessionServiceTest`

Expected: PASS。

### Task 3: 持久化 server target 并严格恢复已有 session

**Files:**
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/terminals/TerminalSessionModels.kt`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/terminals/TerminalStartupContext.kt`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/terminals/SshTerminalService.kt`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/terminals/TerminalSessionManager.kt`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/data/TerminalSessionStore.kt`
- Modify: matching tests under `android/app/src/test/java/com/mrongm/hobgoblin/terminals/` and `data/TerminalSessionStoreTest.kt`

**Interfaces:**
- Consumes: `TmuxServerTarget`、`HostDiscoveredTmuxSession`。
- Produces: `HostTmuxRecoveryCandidate`、`TerminalSessionRecord.tmuxServerTarget`、向后兼容 codec、deterministic host recovery ID。

- [ ] **Step 1: 写恢复与 codec 失败测试**

```kotlin
@Test
fun `default and named servers with same session name create different retained terminals`() {
    val defaultRecord = manager.recoverOrGetHostTmuxSession(defaultCandidate)
    val namedRecord = manager.recoverOrGetHostTmuxSession(namedCandidate)
    assertNotEquals(defaultRecord?.id, namedRecord?.id)
}

@Test
fun `codec reads old record and persists named server target`() {
    assertNull(codec.decode(oldSeventeenFieldPayload).single().tmuxServerTarget)
    assertEquals(namedTarget, codec.decode(codec.encode(listOf(namedRecord))).single().tmuxServerTarget)
}
```

另测无 repositoryId/root 仍可恢复、点击后 session 消失只失败不创建、重连沿用精确 target、通知入口仍返回 Terminals。

- [ ] **Step 2: 运行定向测试并确认失败**

Run: `./gradlew :app:testDebugUnitTest --tests com.mrongm.hobgoblin.terminals.TerminalSessionManagerTest --tests com.mrongm.hobgoblin.terminals.SshTerminalStartupCommandTest --tests com.mrongm.hobgoblin.data.TerminalSessionStoreTest`

Expected: FAIL，缺少 target 字段和主机恢复 API。

- [ ] **Step 3: 实现兼容 record 与严格恢复**

```kotlin
data class HostTmuxRecoveryCandidate(
    val hostProfileId: String,
    val hostDisplayName: String,
    val target: RemoteTarget,
    val discovery: HostDiscoveredTmuxSession,
)
```

`TerminalSessionRecord` 新增 nullable `tmuxServerTarget`；只有旧 project tmux record 要求 repository root。codec 将第 18 字段编码为 `legacy-default`、严格 server name 或空字符串，17 字段 payload 仍解码。`recoverOrGetHostTmuxSession` 使用 authority + target marker + session name 生成 ID，启动上下文固定 `AttachExisting` 并调用精确附着 overload。

- [ ] **Step 4: 运行恢复与 codec 测试并确认通过**

Run: `./gradlew :app:testDebugUnitTest --tests com.mrongm.hobgoblin.terminals.TerminalSessionManagerTest --tests com.mrongm.hobgoblin.terminals.SshTerminalStartupCommandTest --tests com.mrongm.hobgoblin.data.TerminalSessionStoreTest`

Expected: PASS，旧 project terminal 创建/发现/关闭测试不回归。

### Task 4: 新增 HostDetail 路由、双 Tab 和 tmux 目录 UI

**Files:**
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/navigation/AppRoute.kt`
- Create: `android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/hosts/HostDetailScreen.kt`
- Create: `android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/hosts/HostTmuxCatalogState.kt`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/hosts/HostsScreen.kt`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/projects/ProjectsScreen.kt`
- Modify: `android/app/src/main/res/values*/strings.xml`
- Modify/Create: navigation and host UI unit tests.

**Interfaces:**
- Consumes: `ResourceState<List<HostTmuxPathGroup>>`、local projects read model、主机显示名称。
- Produces: `HostDetailTab`、`AppRoute.HostDetail`、`HostDetailReturn`、`HostDetailScreen`、tmux UI 状态投影函数。

- [ ] **Step 1: 写导航与 UI 状态失败测试**

```kotlin
@Test
fun `tmux terminal returns to same host tmux tab`() {
    val route = terminalReturnRoute(
        AppRoute.Terminal(sessionId = "session", hostDetailReturn = HostDetailReturn("host", HostDetailTab.Tmux)),
        repository = null,
    )
    assertEquals(AppRoute.HostDetail("host", HostDetailTab.Tmux), route)
}
```

另测 host 点击进入 Projects Tab、本地项目仅按 hostProfileId 过滤、tmux 路径分组标题/attached/server label、加载/空/错误/陈旧状态、不暴露创建删除 action。

- [ ] **Step 2: 运行导航和 host UI 测试并确认失败**

Run: `./gradlew :app:testDebugUnitTest --tests com.mrongm.hobgoblin.navigation.AppRouteTest --tests 'com.mrongm.hobgoblin.ui.screens.hosts.*' --tests com.mrongm.hobgoblin.ui.screens.projects.ProjectsScreenStateTest`

Expected: FAIL，缺少 HostDetail route/screen state。

- [ ] **Step 3: 实现实色主机详情和双 Tab**

```kotlin
enum class HostDetailTab { Projects, Tmux }

data class HostDetailReturn(val hostId: String, val selectedTab: HostDetailTab)

data class HostDetail(val hostId: String, val selectedTab: HostDetailTab = HostDetailTab.Projects) : AppRoute
```

`HostDetailScreen` 使用 Material 3 `Scaffold`、`TopAppBar` 和 `PrimaryTabRow`。Projects Tab 复用本地 project 列表但隐藏“清除主机过滤”入口；Tmux Tab 使用 pull-to-refresh，按 init path 显示实色 Card，展示 terminal number、attached 状态、默认/命名 server，点击只触发恢复 callback。

- [ ] **Step 4: 运行导航和 host UI 测试并确认通过**

Run: `./gradlew :app:testDebugUnitTest --tests com.mrongm.hobgoblin.navigation.AppRouteTest --tests 'com.mrongm.hobgoblin.ui.screens.hosts.*' --tests com.mrongm.hobgoblin.ui.screens.projects.ProjectsScreenStateTest`

Expected: PASS。

### Task 5: 在 App 状态机中接通扫描、刷新、恢复和返回

**Files:**
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/HobgoblinAndroidApp.kt`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/MainActivity.kt`
- Modify: app/navigation tests where route callbacks are projected.

**Interfaces:**
- Consumes: `RemoteTmuxSessionService.discoverHostSessions`、`HostDetailScreen`、`recoverOrGetHostTmuxSession`。
- Produces: HostDetail tmux `ResourceState`、进入/Tab/手动/下拉/terminal-return 刷新触发、HostDetail terminal return context。

- [ ] **Step 1: 写状态转换失败测试**

```kotlin
@Test
fun `failed refresh retains loaded tmux groups as stale`() {
    val stale = failedRefresh(ResourceState.Loaded(groups), "scan failed")
    assertEquals(groups, assertIs<ResourceState.Stale<List<HostTmuxPathGroup>>>(stale).value)
}
```

并用现有纯函数测试风格验证：Projects Tab 不扫描、Tmux Tab 扫描；refresh nonce 重新扫描；HostDetail 恢复 route 带 tmux return；notification route 不带 host return。

- [ ] **Step 2: 运行相关测试并确认失败**

Run: `./gradlew :app:testDebugUnitTest --tests com.mrongm.hobgoblin.navigation.AppRouteTest --tests 'com.mrongm.hobgoblin.ui.screens.hosts.*'`

Expected: FAIL，HostDetail 扫描状态尚未接入。

- [ ] **Step 3: 接入单主机状态与恢复流程**

`HobgoblinAndroidApp` 仅在当前 route 是 `HostDetail(..., Tmux)` 时发起 discovery；加载前保留旧 host 的已加载快照，失败使用 stale state。点击 session 调用 `recoverOrGetHostTmuxSession`，写入 manager/store 后进入 `AppRoute.Terminal` 并携带 `HostDetailReturn(hostId, Tmux)`。`MainActivity` 删除 workspace service 注入，只保留 tmux service。

- [ ] **Step 4: 运行相关测试并确认通过**

Run: `./gradlew :app:testDebugUnitTest --tests com.mrongm.hobgoblin.navigation.AppRouteTest --tests 'com.mrongm.hobgoblin.ui.screens.hosts.*'`

Expected: PASS。

### Task 6: 移除工作区扫描功能链路

**Files:**
- Delete: `android/app/src/main/java/com/mrongm/hobgoblin/data/WorkspaceRegistryCodec.kt`
- Delete: `android/app/src/main/java/com/mrongm/hobgoblin/domain/workspace/WorkspaceRegistryModels.kt`
- Delete: `android/app/src/main/java/com/mrongm/hobgoblin/domain/workspace/WorkspaceTmuxCatalog.kt`
- Delete: `android/app/src/main/java/com/mrongm/hobgoblin/ssh/RemoteWorkspaceCatalogService.kt`
- Delete: `android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/workspaces/WorkspaceCatalogScreen.kt`
- Delete: corresponding Android tests and `android/app/src/test/resources/fixtures/workspace-catalog/**`
- Modify: `android/app/build.gradle.kts`
- Modify: any TypeScript test that only validates the removed shared fixture.

**Interfaces:**
- Consumes: 完成后的 HostDetail 主机级目录。
- Produces: 编译图中不再存在 WorkspaceCatalog route/service/model/UI/fixture，Projects 页面只读本地项目。

- [ ] **Step 1: 搜索并记录全部旧符号引用**

Run: `rg -n 'WorkspaceCatalog|WorkspaceRegistry|workspace-configs|branch-workspaces|projectWorkspaceTmuxSessions' android src`

Expected: 只命中待移除实现、测试、fixture wiring 和可能保留的桌面/Web 自身工作区功能；不得删除 Web 正常工作区产品功能。

- [ ] **Step 2: 删除 Android 工作区目录链路及专用 fixture wiring**

使用 `apply_patch` 删除列出的 Android 文件和只服务于它们的测试/fixture；从 Gradle sourceSets、App route、注入、strings、Projects UI 中移除引用。TypeScript 仅撤销 Android 共享 fixture 契约测试，不改变 Web 工作区实现。

- [ ] **Step 3: 验证 Android 旧功能引用清零**

Run: `rg -n 'WorkspaceCatalog|RemoteWorkspaceCatalog|WorkspaceRegistryCodec|projectWorkspaceTmuxSessions' android/app/src`

Expected: 无输出。

- [ ] **Step 4: 运行 Android 单元测试**

Run: `./gradlew :app:testDebugUnitTest`

Expected: PASS。

### Task 7: 全量验证并输出界面设计预览

**Files:**
- Modify if needed: `CONTEXT.md`
- Verify: `docs/superpowers/specs/2026-07-28-android-host-tmux-catalog-design.md`
- Verify: `docs/adr/0003-discover-android-host-tmux-from-server-sockets.md`

**Interfaces:**
- Consumes: Tasks 1–6 完成的实现。
- Produces: 可安装 debug APK、绿色仓库校验、用户可查看的最终界面与交互说明。

- [ ] **Step 1: 运行 Android 全量验证**

Run: `./gradlew :app:testDebugUnitTest :app:assembleDebug`

Expected: BUILD SUCCESSFUL。

- [ ] **Step 2: 运行根级验证**

Run: `bun run typecheck && bun run test && bun run check:architecture`

Expected: 三个命令均退出 0；无 architecture boundary violation。

- [ ] **Step 3: 审查差异和隐私安全**

Run: `git diff --check && rg -n '/Users/|longjiang|853c84b4' android/app/src docs --glob '!docs/superpowers/specs/2026-07-28-android-host-tmux-catalog-design.md'`

Expected: `git diff --check` 无输出；源码、测试、资源无用户真实路径或真实 hash。

- [ ] **Step 4: 生成最终设计展示**

提供主机详情 Projects 与 tmux 两个 Tab 的文本线框、状态清单、关键本地文件链接和验证结果；若可用 Android emulator/device，再附实际截图，否则明确说明展示基于已实现 Compose 结构与 preview/线框而非设备截图。
