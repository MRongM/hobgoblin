# Terminal Mixed-Width Clipping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让终端使用单一的内置中英文等宽字体，并移除 alternate screen 的两列补偿，使混排长行与左右分栏 resize 后的全部列可见。

**Architecture:** 保持现有 `TerminalSessionRegistry → ManagedTerminalSession → TerminalSessionView` 字体注入链路，只把共享默认终端字体改为内置 `Maple Mono NF CN`，确保初始几何测量与 xterm 渲染使用同一字体。尺寸路径恢复为单一 `FitAddon` 语义，普通 buffer 与 alternate buffer 不再分支计算列数。

**Tech Stack:** TypeScript、React、xterm 6、`@xterm/addon-fit`、Vitest、Bun

---

## 文件结构

- 修改 `src/web/components/terminal/terminal-geometry.ts`：拥有固定终端字体常量和初始 cell 几何测量。
- 修改 `src/web/components/terminal/terminal-geometry.test.ts`：锁定默认终端字体契约。
- 修改 `src/web/components/terminal/terminal-session-view.ts`：删除 alternate screen 的两列补偿，统一使用 `FitAddon`。
- 修改 `src/web/components/terminal/ManagedTerminalSession.test.ts`：验证 xterm 字体和普通/alternate buffer 的完整列数。
- 修改 `src/web/components/terminal/TerminalSessionProvider.test.tsx`：保留“终端不跟随全局字体偏好”的产品契约，同时把默认值更新为 Maple。
- 保留 `src/web/components/terminal/terminal-session.css`、`terminal-session-css.test.ts` 和 `ManagedTerminalSession.test.ts` 中实施前已经存在的用户修改；不覆盖或回退这些内容。

项目规则禁止未经用户明确要求执行 Git 提交，因此本计划不包含 `git add` 或 `git commit` 步骤。

### Task 1: 固定终端字体为 Maple Mono NF CN

**Files:**
- Modify: `src/web/components/terminal/terminal-geometry.test.ts`
- Modify: `src/web/components/terminal/terminal-geometry.ts`
- Modify: `src/web/components/terminal/ManagedTerminalSession.test.ts`
- Modify: `src/web/components/terminal/TerminalSessionProvider.test.tsx`

- [x] **Step 1: 写入默认字体失败测试**

在 `terminal-geometry.test.ts` 导入默认字体常量：

```ts
import {
  DEFAULT_TERMINAL_FONT_FAMILY,
  measureTerminalGeometry,
} from '#/web/components/terminal/terminal-geometry.ts'
```

在 `describe('measureTerminalGeometry', ...)` 前增加字体契约测试：

```ts
describe('DEFAULT_TERMINAL_FONT_FAMILY', () => {
  test('uses the bundled CJK monospace font for stable terminal cell metrics', () => {
    expect(DEFAULT_TERMINAL_FONT_FAMILY).toBe("'Maple Mono NF CN', monospace")
  })
})
```

- [x] **Step 2: 运行测试并确认按预期失败**

Run:

```sh
bun run test "src/web/components/terminal/terminal-geometry.test.ts"
```

Expected: FAIL；实际值以 `ui-monospace` 开头，而期望值为 `'Maple Mono NF CN', monospace`。

- [x] **Step 3: 实施最小字体变更**

把 `terminal-geometry.ts` 中的默认字体常量改为：

```ts
export const DEFAULT_TERMINAL_FONT_FAMILY = "'Maple Mono NF CN', monospace"
```

不新增第二个字体常量，不修改 `measureTerminalGeometry` 的参数模型；默认测量和 xterm 构造继续共享该常量。

- [x] **Step 4: 更新受新契约影响的既有断言**

在 `ManagedTerminalSession.test.ts` 的主终端打开测试中，把旧断言：

```ts
expect(xtermMocks.terminals[0]!.options.fontFamily).toContain('ui-monospace')
```

改为：

```ts
expect(xtermMocks.terminals[0]!.options.fontFamily).toBe("'Maple Mono NF CN', monospace")
```

在 `TerminalSessionProvider.test.tsx` 的 `uses the default terminal font family regardless of the global font preference` 测试中，把否定断言：

```ts
expect(session.constructorFontFamily).not.toContain('Maple Mono NF CN')
```

改为：

```ts
expect(session.constructorFontFamily).toBe("'Maple Mono NF CN', monospace")
```

保留同一测试中对 `DEFAULT_TERMINAL_FONT_FAMILY` 的断言，继续证明终端使用固定默认字体而不是全局 `fontFamily` 偏好。

- [x] **Step 5: 运行字体相关测试并确认通过**

Run:

```sh
bun run test "src/web/components/terminal/terminal-geometry.test.ts" "src/web/components/terminal/ManagedTerminalSession.test.ts" "src/web/components/terminal/TerminalSessionProvider.test.tsx"
```

Expected: PASS；无失败测试或未处理警告。

### Task 2: 普通与 alternate buffer 统一使用完整 FitAddon 列数

**Files:**
- Modify: `src/web/components/terminal/ManagedTerminalSession.test.ts`
- Modify: `src/web/components/terminal/terminal-session-view.ts`

- [x] **Step 1: 把现有两列补偿测试改为完整宽度失败测试**

用下面的测试替换 `reserves two columns only while an alternate-screen TUI is active`：

```ts
test('uses the full fitted width while an alternate-screen TUI is active', async () => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const session = new ManagedTerminalSession(descriptor, vi.fn())
  hydrateManagedSession(session)

  session.attach(host)
  await flushTerminalStart()
  await flushUntil(() => session.snapshot().phase === 'open')

  const term = xtermMocks.terminals[0]!
  const fitAddon = xtermMocks.fitAddons[0]!
  fitAddon.fit.mockClear()
  terminalCalls.resize.mockClear()

  term.emitBufferChange('alternate')

  expect(fitAddon.fit).toHaveBeenCalledTimes(1)
  expect(term.cols).toBe(100)
  expect(terminalCalls.resize).not.toHaveBeenCalled()

  term.emitBufferChange('normal')

  expect(fitAddon.fit).toHaveBeenCalledTimes(2)
  expect(term.cols).toBe(100)
  expect(terminalCalls.resize).not.toHaveBeenCalled()
})
```

- [x] **Step 2: 运行测试并确认按预期失败**

Run:

```sh
bun run test "src/web/components/terminal/ManagedTerminalSession.test.ts" -t "uses the full fitted width"
```

Expected: FAIL；alternate buffer 不调用 `fitAddon.fit()`，并把 `term.cols` 从 100 改为 98。

- [x] **Step 3: 删除 alternate screen 两列补偿**

在 `terminal-session-view.ts` 中删除：

```ts
const ALTERNATE_SCREEN_SAFE_COLUMNS = 2
```

把 `fitSoon()` 恢复为直接比较 addon 提议尺寸：

```ts
fitSoon(): void {
  if (!this.term || !this.fitAddon || !hasMeasurableBox(this.xtermHost)) return
  const dimensions = this.fitAddon.proposeDimensions()
  if (!dimensions || (dimensions.cols === this.term.cols && dimensions.rows === this.term.rows)) return
  this.cancelFitFlush()
  this.fitFlushTimer = window.setTimeout(() => {
    this.fitFlushTimer = null
    this.fitNow()
  }, RESIZE_DEBOUNCE_MS)
}
```

把 `fitNow()` 简化为所有 buffer 共用 `FitAddon`：

```ts
fitNow(): void {
  if (!this.term || !this.fitAddon || !hasMeasurableBox(this.xtermHost)) return
  this.fitAddon.fit()
  this.pinToBottomSoon()
}
```

完整删除 `fittedColumns()`；保留现有 `term.buffer.onBufferChange(() => this.fitNow())`，buffer 切换仍会触发一次标准 fit。

- [x] **Step 4: 运行定向测试并确认通过**

Run:

```sh
bun run test "src/web/components/terminal/ManagedTerminalSession.test.ts" -t "uses the full fitted width"
```

Expected: PASS；alternate 和 normal buffer 都保持 100 列，且两次 buffer 切换分别调用一次 `fitAddon.fit()`。

- [x] **Step 5: 运行终端组件测试集**

Run:

```sh
bun run test "src/web/components/terminal/terminal-geometry.test.ts" "src/web/components/terminal/ManagedTerminalSession.test.ts" "src/web/components/terminal/TerminalSessionProvider.test.tsx" "src/web/components/terminal/terminal-session-css.test.ts"
```

Expected: PASS；现有字体切换、字体加载 refit、resize debounce、主题和 CSS scrollbar 契约测试保持通过。

### Task 3: 回归检查与完整验证

**Files:**
- Verify: `docs/superpowers/specs/2026-07-12-terminal-mixed-width-clipping-design.md`
- Verify: `src/web/components/terminal/terminal-geometry.ts`
- Verify: `src/web/components/terminal/terminal-session-view.ts`
- Verify: `src/web/components/terminal/ManagedTerminalSession.test.ts`
- Verify: `src/web/components/terminal/TerminalSessionProvider.test.tsx`

- [x] **Step 1: 检查变更范围和用户已有修改**

Run:

```sh
git status --short
git diff --check
git diff -- src/web/components/terminal/terminal-geometry.ts src/web/components/terminal/terminal-geometry.test.ts src/web/components/terminal/terminal-session-view.ts src/web/components/terminal/ManagedTerminalSession.test.ts src/web/components/terminal/TerminalSessionProvider.test.tsx src/web/components/terminal/terminal-session.css src/web/components/terminal/terminal-session-css.test.ts
```

Expected: 没有空白错误；`terminal-session.css` 和 `terminal-session-css.test.ts` 中实施前已有的 scrollbar 透明背景修改仍然存在；没有无关文件变化。

- [x] **Step 2: 运行类型检查**

Run:

```sh
bun run typecheck
```

Expected: exit 0，无 TypeScript 错误。

- [x] **Step 3: 运行完整测试**

Run:

```sh
bun run test
```

Expected: exit 0，全部测试通过。

- [x] **Step 4: 运行架构检查**

Run:

```sh
bun run check:architecture
```

Expected: exit 0，`src/main`、`src/web`、`src/server` 和 `src/shared` 边界保持绿色。

- [ ] **Step 5: 执行人工终端 UAT**

> 当前执行环境缺少本地浏览器自动化通道，该步骤保留为用户手工验收，不以 DOM 单元测试替代。

在应用终端中运行：

```sh
printf '%s\n' '- **worktree 依赖选择：** 创建 worktree 前，选择源 worktree 根目录下未跟踪的文件或目录，并复制或符号链接到新 worktree。'
```

在 `stty size` 返回 160 列时，确认：

```text
第一行末尾：…和 `setup`，作为新 w
第二行开头：orktree 的自动准备规则。
```

随后拖动左右布局中的终端/分支分隔线，再次执行回归文本；普通 shell 和一个 alternate-screen TUI 都应显示完整最右列，且 TUI 不再比 shell 少两列。

- [x] **Step 6: 汇总验证证据**

记录定向测试、`typecheck`、完整测试、架构检查和人工 UAT 的实际结果。若本环境无法执行可视 UAT，明确标记为待用户验证，不用自动化测试结果替代视觉结论。
