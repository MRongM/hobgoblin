# Windows Codex Commit Message Stdin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复主应用 Windows 版本使用 Codex 生成提交信息时，因把长提示词放入进程命令行参数而导致的启动错误。

**Architecture:** 保持现有 UI、HTTP、Repository read path 和输出解析不变，仅修正 system 层 Codex Provider adapter 的传输方式。Codex 使用其已有的 `exec ... -` stdin 契约接收提示词，与 Claude 的 stdin 模式一致，并复用独立 Windows 实现中的仓库内既有模式。

**Tech Stack:** TypeScript（Node.js strip-only）、Execa、Vitest、Bun、Codex CLI JSONL 输出。

## Global Constraints

- 验收目标是从根目录 `src/` 构建的主应用 Windows 版本；不修改独立 `windows/` 包。
- 不改变 AI 提交信息生成的 UI、API、提示词内容、JSONL 解析、超时或取消语义。
- 不增加依赖；不使用 shell 字符串拼接。
- 遵守 Node.js strip-only TypeScript 限制和显式 `.ts` import 约定。
- 验证必须包含 `bun run typecheck`、`bun run test` 与 `bun run check:architecture`。
- 不执行 `git commit`、`git push`、分支切换或其他 Git 写操作。

---

### Task 1: 通过 stdin 向 Codex 传递提交信息提示词

**Files:**
- Modify: `src/system/commit-message-ai.test.ts`
- Modify: `src/system/commit-message-ai.ts`

**Interfaces:**
- Consumes: `codex exec --json --sandbox read-only --skip-git-repo-check -`，其中 `-` 表示从 stdin 读取提示词。
- Produces: 现有 `generateCommitMessageFromPatch()` 与 `generateCodexCommitMessageFromContext()` 签名和返回类型保持不变；内部 Execa 调用通过 `input` 传递提示词。

- [x] **Step 1: 将 Codex 调用契约测试改为 stdin，并覆盖两条生成路径**

  在 `src/system/commit-message-ai.test.ts` 中把 Codex 相关断言统一为以下契约：

  ```ts
  expect(mocks.execa).toHaveBeenCalledWith(
    'codex',
    ['exec', '--json', '--sandbox', 'read-only', '--skip-git-repo-check', '-'],
    expect.objectContaining({
      cwd: '/repo',
      input: expect.stringContaining('Return only the commit message.'),
      reject: false,
    }),
  )
  ```

  对普通 patch、用户安装路径 fallback、大 patch 截断和轻量上下文测试，从 `args.at(-1)` 改为读取 `options.input`。保留英文提示词、不可信 diff 防注入、binary payload 省略和输出解析的原有断言。

- [x] **Step 2: 运行聚焦测试并确认 RED**

  Run: `bun run test src/system/commit-message-ai.test.ts`

  Expected: FAIL；实际 Codex argv 的最后一项仍为完整 prompt，Execa options 不包含 `input`。失败必须来自尚未实现的 stdin 契约，而不是测试语法或 mock 配置错误。

- [x] **Step 3: 在 Provider adapter 中实施最小修复**

  将 `src/system/commit-message-ai.ts` 的 Codex 命令定义改为：

  ```ts
  codex: {
    command: 'codex',
    args: () => ['exec', '--json', '--sandbox', 'read-only', '--skip-git-repo-check', '-'],
    input: (prompt) => prompt,
    outputMode: 'codex-jsonl',
  },
  ```

  不修改 `runGenerationCommand()`：其现有 `input` 分支已经以 stdin 传递字符串，并且只在无 input 时设置 `stdin: 'ignore'`。

- [x] **Step 4: 运行聚焦测试并确认 GREEN**

  Run: `bun run test src/system/commit-message-ai.test.ts`

  Expected: PASS；Codex 的普通 patch、轻量上下文和 resolved executable fallback 均使用固定短 argv 与 stdin prompt，Claude 行为不变。

- [x] **Step 5: 执行项目级验证**

  Run: `bun run typecheck`

  Expected: exit 0，无 TypeScript 错误。

  Run: `bun run test`

  Expected: exit 0，无失败测试。

  Run: `bun run check:architecture`

  Expected: exit 0，架构边界保持绿色。

- [x] **Step 6: 审阅最终差异**

  Run: `git diff --check && git diff -- docs/superpowers/plans/2026-08-23-windows-codex-commit-message-stdin.md src/system/commit-message-ai.ts src/system/commit-message-ai.test.ts`

  Expected: 无 whitespace error；生产代码仅改变 Codex Provider adapter 的 prompt transport，测试与计划准确记录该行为；不包含独立 `windows/` 包或无关改动。
