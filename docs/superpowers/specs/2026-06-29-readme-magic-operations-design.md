# README Magic Operations Design

## Goal

在公开 README 中补充 Hobgoblin 的“魔法操作”说明，让读者快速理解终端、文件树、剪贴板、tmux、Web/server mode 和手机浏览器接管终端这些高频工作流能力。

## Scope

In scope:

- 更新 `README.md`。
- 更新 `README.zh-CN.md`。
- 在现有 `Product Features` / `产品特点` 后新增独立章节。
- 覆盖用户指定的 8 项能力：
  - 终端二进制粘贴生成临时文件并输入路径。
  - 文件树拖拽到终端输入路径。
  - 剪贴板文本写入文件，以及文件复制到系统剪贴板。
  - 双击终端 tab 滚动到底部。
  - 从终端输出探测相对路径并跳转文件树。
  - 探测并启用 tmux 会话保持。
  - 通过 Web/server mode 在浏览器打开项目。
  - 手机浏览器接管终端。

Out of scope:

- 不修改应用代码。
- 不修改 `docs/index.html`。
- 不更新 `README.ko.md` 或 `README.ja.md`。
- 不新增截图。
- 不执行 git commit。

## Selected Approach

新增独立章节：

- `README.md`: `## Magic Operations`
- `README.zh-CN.md`: `## 魔法操作`

章节位置放在 `Product Features` / `产品特点` 之后、安装说明之前。这样保留现有产品定位列表的简洁性，同时把更具体的操作能力集中呈现，便于读者扫描。

## Content Model

章节使用短列表而不是长教程。每条说明描述能力和结果，不展开实现细节，也不承诺未确认的行为。

英文 README 使用自然英文描述；中文 README 使用对应中文描述。两份 README 保持相同条目顺序：

1. Paste binary content into the terminal input to create temporary files and insert generated paths.
2. Drag files from the file tree into the terminal to insert shell-safe paths.
3. Move content through the system clipboard: paste clipboard text into files with `Ctrl+Shift+V` and copy file text to the clipboard with `Ctrl+Shift+C`.
4. Double-click the active terminal tab to scroll the terminal to the bottom.
5. Click detected repository-relative paths in terminal output to reveal them in the file tree.
6. Detect and use tmux-backed remote terminal sessions when enabled, keeping sessions resumable.
7. Open projects through Web/server mode from a browser.
8. Take over terminal sessions from a mobile browser when using browser-accessible mode.

## Error Handling

README 文档没有运行时错误流。措辞应避免过度承诺：

- 使用“supports”或“can”描述能力。
- 不写自动清理临时文件、完整移动端本地 Git、后台 tunnel 持久化等未在本次范围内确认的内容。
- tmux 说明限定为“when enabled”或“when available”，避免暗示所有远程环境都强制支持。

## Verification

完成 README 修改后检查：

- `README.md` 和 `README.zh-CN.md` 都有新增章节。
- 新章节位于功能列表后、安装章节前。
- 两份 README 的条目顺序一致。
- Markdown 标题层级正确。
- 不修改源码、其他语言 README 或 GitHub Pages 文件。

## Principles

- KISS：新增一个独立章节，不引入复杂文档结构。
- YAGNI：不扩展到其他语言、站点页面或教程。
- DRY：英文和中文保持同构条目，减少维护偏差。
- SOLID：文档变更与应用实现隔离，不改变代码职责边界。
