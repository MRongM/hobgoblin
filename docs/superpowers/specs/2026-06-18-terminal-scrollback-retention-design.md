# 终端历史滚动保留设计

## 背景

用户在终端显示大量输出后滚动查看历史，旧行会从 scrollback 里找不到。问题通常出现在长命令、构建日志、测试日志等大量输出场景，但也可能在几百行量级被观察到。

现有终端链路已经包含两套 xterm 状态：

- 前端 `TerminalSessionView` 创建用户可见的 `@xterm/xterm` 实例，负责当前窗口显示和用户滚动历史。
- 服务端 `terminal-render-state.ts` 创建 `@xterm/headless` 实例，负责 snapshot 和 reconnect 后的历史恢复。

两边当前都使用固定 `scrollback` 值，但常量分散在各自文件里。第一版目标是统一并扩大 scrollback 保留能力，同时补测试区分“容量正常淘汰”和“滚动或重建导致异常丢行”。

## 目标

- 终端大量输出后，用户滚动查看历史时能保留更多旧行。
- 前端可见 xterm 和服务端 headless xterm 使用同一个 scrollback 行数。
- 几百行输出不应因为普通滚动、普通输出、resize 或 attach 流程被异常清空。
- 保持现有 attach、replay、snapshot 和 realtime output 协议不变。
- 通过测试覆盖前端和服务端 scrollback 配置一致性。

## 非目标

- 不保存完整终端日志到磁盘。
- 不实现无限历史、分页日志回放或历史搜索。
- 不新增用户设置项。
- 不改变远程 tmux、PTY、WebSocket 或 terminal worker 协议。
- 不扩大原始 replay 字符缓存上限。
- 不改变超过 scrollback 上限后的 xterm 原生淘汰语义。

## 方案比较

### 方案 A：统一并增大 scrollback

将前端 xterm 和服务端 headless xterm 的 `scrollback` 抽成共享常量，例如 `TERMINAL_SCROLLBACK_LINES = 50000`。两边初始化终端时都引用该常量，并补测试确保一致。

优点：

- 改动小，符合现有架构。
- 直接解决大量输出后旧行过早淘汰的问题。
- 不引入存储、清理、隐私和分页复杂度。
- 前端显示和服务端恢复策略一致。

代价：

- 内存占用增加。
- 超过上限的最旧行仍会被淘汰。

### 方案 B：持久化完整输出日志

服务端保存完整 PTY 输出日志，xterm 只保存当前可视缓冲，滚动或重连时从日志补历史。

优点是最彻底，可以支持更长历史。缺点是设计面大，涉及存储位置、清理策略、隐私、性能、远程会话生命周期和 UI 分页，不适合第一版。

### 方案 C：只修 renderer 滚动布局

只检查 `TerminalSessionView` 的 fit、bottom dock padding、xterm viewport、resize 和 CSS 是否导致行被视觉遮挡。

优点是能解决纯视觉遮挡。缺点是用户描述为旧行从 scrollback 里找不到，如果真实缓冲已被淘汰或重建，单纯布局修复无效。

## 推荐方案

采用方案 A，同时保留诊断约束：如果几百行输出仍能复现丢失，优先检查是否有 `reset()`、`destroyTerminal()`、重新 attach、resize/replay 或异常重建导致前端 xterm 缓冲被清空，而不是直接引入日志存储层。

第一版默认值使用 `50000` 行。该值比当前 `10000` 行明显更适合构建和测试日志，但仍是有限上限，避免无限历史带来的内存风险。

## 架构

新增或复用共享终端常量，放在 `src/shared/terminal.ts`：

```ts
export const TERMINAL_SCROLLBACK_LINES = 50_000
```

该位置符合当前架构边界：

- `src/web/**` 可以导入 `src/shared/**`。
- `src/server/**` 可以导入 `src/shared/**`。
- 不需要 `src/web/**` 和 `src/server/**` 互相依赖。

前端可见终端：

- `src/web/components/terminal/terminal-session-view.ts`
- `new Terminal({ scrollback: TERMINAL_SCROLLBACK_LINES, ... })`

服务端 headless 终端：

- `src/server/terminal/terminal-render-state.ts`
- `new HeadlessTerminal({ scrollback: TERMINAL_SCROLLBACK_LINES, ... })`

保持 `MAX_SESSION_BUFFER_CHARS = 16 * 1024 * 1024` 不变。它限制原始 replay 字符缓存，不等同于 xterm 的行 scrollback。第一版只扩大 xterm 行缓冲，避免同时扩大两个内存面。

## 数据流

数据流保持现状：

1. PTY 输出进入服务端 terminal session。
2. 服务端将原始输出追加到 replay buffer，并写入 headless xterm。
3. 前端在线时通过 realtime output 收到数据并写入可见 xterm。
4. 用户滚动历史时，xterm 从前端实例的 scrollback 中读取旧行。
5. 用户切换、重连或恢复 session 时，前端使用服务端 snapshot 或 replay 恢复屏幕状态。

统一 scrollback 后，在线滚动和重连恢复的历史保留能力一致。不会出现前端能看到而服务端恢复后看不到，或服务端 snapshot 保留而前端在线缓冲过早淘汰的策略差异。

## 错误处理

不新增用户可见错误提示。

- 超过 `TERMINAL_SCROLLBACK_LINES` 后，xterm 继续按原生策略淘汰最旧行。
- 如果 memory 压力成为问题，后续再设计用户设置或自适应上限；第一版不加入配置面。
- 如果测试发现几百行输出会触发丢失，修复点应在异常 reset/rebuild/replay 流程，而不是扩大常量。
- attach 失败、snapshot 失败、WebSocket 失败仍沿用现有错误路径。

## 测试计划

### 单元测试

- `terminal-session-view` 或 `ManagedTerminalSession` 测试断言前端 xterm 初始化使用 `TERMINAL_SCROLLBACK_LINES`。
- `terminal-render-state.test.ts` 断言 headless xterm 初始化使用同一常量。
- 增加行为测试覆盖几百行输出后，普通 output flush 不调用 `reset()`，不销毁或重建当前 xterm 实例。
- 保留现有 truncated replay 测试，确保只有 `replayTruncated` 或 snapshot preload 场景会 reset。

### 回归测试

运行：

```bash
bun run test src/web/components/terminal/ManagedTerminalSession.test.ts src/server/terminal/terminal-render-state.test.ts
bun run typecheck
bun run check:architecture
```

### 手工验收

1. 打开本地终端。
2. 执行大量输出命令，例如输出 2000 到 20000 行。
3. 滚动到历史中段和顶部，确认旧行仍可找到。
4. 切换到其他 tab 再切回终端，确认历史没有被清空。
5. 对远程 tmux 终端重复验证。
6. 执行超过 50000 行输出，确认超过上限后最旧行被淘汰属于预期行为。

## 实施边界

只改常量、初始化配置和测试。避免引入日志存储、用户设置、协议字段或跨层抽象。

如果实现过程中发现几百行输出仍丢失，需要先定位是否发生以下事件：

- 前端 xterm 被销毁并重建。
- 普通输出期间调用了 `term.reset()`。
- resize/fit 触发了异常重排或 recreate。
- attach/replay 去重边界错误导致历史被跳过。
- CSS 或 bottom dock 只造成视觉遮挡，而不是 scrollback 数据丢失。

这些问题应作为同一修复范围内的定向补丁处理，但不扩大到持久化日志系统。
