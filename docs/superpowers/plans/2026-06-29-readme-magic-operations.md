# README Magic Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a concise Magic Operations section to the English and Simplified Chinese README files.

**Architecture:** This is a documentation-only change. The new section lives after the existing feature list and before installation, preserving the README structure while separating concrete usage workflows from product positioning.

**Tech Stack:** Markdown documentation in `README.md` and `README.zh-CN.md`.

---

## File Structure

- Modify: `README.md`
  - Responsibility: English public README and default GitHub repository landing page.
- Modify: `README.zh-CN.md`
  - Responsibility: Simplified Chinese public README with the same section order as `README.md`.

No source code, tests, GitHub Pages files, Korean README, Japanese README, package files, or lockfiles should change.

No git commit step is included because project instructions say not to commit unless the user explicitly requests it.

### Task 1: Add English Magic Operations Section

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Locate the insertion point**

Run:

```sh
sed -n '28,48p' "README.md"
```

Expected: The output shows `## Product Features`, the existing bullet list, and `## Installation` after the list.

- [ ] **Step 2: Insert the English section**

Add this Markdown block after the final Product Features bullet and before `## Installation`:

```markdown
## Magic Operations

- **Binary paste into terminal input:** Paste binary clipboard content into the terminal input to create temporary files and insert the generated file paths.
- **Drag from file tree to terminal:** Drag files from the file tree into the terminal to insert shell-safe paths without typing them manually.
- **Clipboard-powered file flow:** Paste clipboard text into files with `Ctrl+Shift+V`, and copy file text back to the system clipboard with `Ctrl+Shift+C`.
- **Terminal tab jump:** Double-click the active terminal tab to scroll that terminal to the bottom.
- **Terminal-to-file-tree navigation:** Click detected repository-relative paths in terminal output to reveal them in the file tree.
- **Tmux-backed session resume:** Detect and use tmux-backed remote terminal sessions when available, keeping remote terminal state resumable.
- **Browser project access:** Run server mode and open the project workspace from a web browser.
- **Mobile terminal takeover:** Use browser-accessible mode from a phone browser to take over terminal sessions when you need to continue from mobile.
```

### Task 2: Add Simplified Chinese Magic Operations Section

**Files:**

- Modify: `README.zh-CN.md`

- [ ] **Step 1: Locate the insertion point**

Run:

```sh
sed -n '28,48p' "README.zh-CN.md"
```

Expected: The output shows `## 产品特点`, the existing bullet list, and `## 安装步骤` after the list.

- [ ] **Step 2: Insert the Chinese section**

Add this Markdown block after the final 产品特点 bullet and before `## 安装步骤`:

```markdown
## 魔法操作

- **终端二进制粘贴：** 在终端输入框粘贴二进制剪贴板内容，自动生成临时文件，并把生成的文件路径插入输入框。
- **从文件树拖拽到终端：** 将文件树中的文件拖到终端，直接插入 shell 安全的文件路径，避免手动输入。
- **剪贴板文件流转：** 支持通过 `Ctrl+Shift+V` 将剪贴板文本写入文件，也支持通过 `Ctrl+Shift+C` 将文件文本复制到系统剪贴板。
- **终端 tab 跳转：** 双击当前终端 tab，可将该终端滚动到底部。
- **终端到文件树导航：** 终端输出中的仓库相对路径可被探测并点击跳转，在文件树中定位对应文件。
- **tmux 会话保持：** 在可用时探测并使用 tmux 托管远程终端会话，让远程终端状态可恢复。
- **浏览器访问项目：** 启动 server mode 后，可以从 Web 浏览器打开项目工作区。
- **手机浏览器接管终端：** 使用浏览器可访问模式时，可从手机浏览器接管终端会话，便于移动场景继续操作。
```

### Task 3: Verify Documentation Scope

**Files:**

- Verify: `README.md`
- Verify: `README.zh-CN.md`
- Verify: `docs/superpowers/specs/2026-06-29-readme-magic-operations-design.md`
- Verify: `docs/superpowers/plans/2026-06-29-readme-magic-operations.md`

- [ ] **Step 1: Confirm both sections exist**

Run:

```sh
rg -n "Magic Operations|魔法操作" "README.md" "README.zh-CN.md"
```

Expected:

```text
README.md:41:## Magic Operations
README.zh-CN.md:41:## 魔法操作
```

Line numbers may differ if earlier README content changes, but each file must have exactly one matching section heading.

- [ ] **Step 2: Confirm no out-of-scope files changed**

Run:

```sh
git diff --name-only
```

Expected changed files:

```text
README.md
README.zh-CN.md
docs/superpowers/specs/2026-06-29-readme-magic-operations-design.md
docs/superpowers/plans/2026-06-29-readme-magic-operations.md
```

- [ ] **Step 3: Review the final diff**

Run:

```sh
git diff -- "README.md" "README.zh-CN.md" "docs/superpowers/specs/2026-06-29-readme-magic-operations-design.md" "docs/superpowers/plans/2026-06-29-readme-magic-operations.md"
```

Expected: The diff only contains the new Magic Operations README sections and the two superpowers planning documents.
