# 文件区新建文件与内容快捷键设计

## 背景

文件区已经支持浏览、选择、重命名、删除、新建文件夹、拖拽移动、上传、下载、复制/粘贴文件树条目等操作。当前缺少两个高频能力：

- 在文件区直接新建空文件。
- 对选中的单个文本文件快速复制完整内容或用剪贴板文本替换完整内容。

本设计保持现有文件树交互和分层边界：renderer 负责 UI 与事件，server/system 层负责所有文件系统读写、安全校验和远程仓库分发。

## 目标

- 文件区 toolbar 增加“新建文件”按钮。
- 文件树右键菜单增加“新建文件”入口。
- 新建文件复用现有新建文件夹的内联输入体验，提交后创建空文件。
- 当文件树焦点在单个普通文件上时：
  - `Cmd/Ctrl+Shift+C` 读取该文件完整 UTF-8 文本并复制到系统剪贴板。
  - `Cmd/Ctrl+Shift+V` 读取系统剪贴板文本并替换该文件完整内容。
- 替换成功后提供状态提示和撤销能力，不弹确认。
- 本地和远程仓库都通过统一 repo 写边界支持。

## 非目标

- 不实现文件内容编辑器、差异预览、追加/插入到某一行、多文件内容复制或多文件批量替换。
- 不支持目录、symlink、virtual/missing 节点的内容复制或替换。
- 不支持二进制文件或超过文本大小上限的文件。
- 不改变现有 `Cmd/Ctrl+C` 与 `Cmd/Ctrl+V` 的文件树复制/粘贴条目语义。
- 不让 renderer 直接访问本地文件系统或拼接远程 shell 命令。

## 产品行为

### 新建文件

文件区 toolbar 增加一个紧邻“新建文件夹”的“新建文件”图标按钮。文件树行右键菜单和空白区右键菜单也增加“新建文件”入口。

点击“新建文件”后，文件树显示内联输入行。行为与现有“新建文件夹”一致：

- 选中或右键目标是目录时，在该目录内创建。
- 选中或右键目标是文件时，在该文件同级目录创建。
- 没有有效目标时，在当前 worktree 根目录创建。
- 提交空名称或非法名称时，在内联输入行显示错误。
- 创建成功后刷新父目录，选中新文件，并将焦点移到新文件。

文件名必须是单个 basename，不能包含 `/`、`\`、NUL，不能是 `.` 或 `..`。目标已存在时不覆盖，返回文件已存在错误。

### 文件内容复制

当文件树焦点在单个普通文件上，且没有处于重命名或新建输入状态时，`Cmd/Ctrl+Shift+C` 执行内容复制：

1. Renderer 根据当前焦点/选择解析唯一目标文件。
2. 调用 server 读取该文件文本内容。
3. 读取成功后写入系统剪贴板。
4. 显示简短成功提示。

多选、目录、symlink、virtual/missing 节点、不可写或不可读目标都不触发内容复制。

### 文件内容替换

当文件树焦点在单个普通文件上，且没有处于重命名或新建输入状态时，`Cmd/Ctrl+Shift+V` 执行整文件替换：

1. Renderer 读取系统剪贴板文本。
2. 调用 server 用该文本替换目标文件完整内容。
3. Server 在写入前读取并返回旧内容用于撤销。
4. 写入成功后刷新父目录和 repo 状态，显示成功提示。
5. Renderer 将旧内容压入文件树撤销栈，用户可撤销到替换前内容。

替换不弹确认。撤销只恢复同一路径的旧内容；如果恢复失败，保留失败提示，不尝试复杂冲突合并。

## 架构

### Renderer

`src/web/components/file-tree/ProjectFileTree.tsx` 继续作为文件树交互编排层，新增职责限于：

- 管理新建文件的内联输入状态。
- 在 toolbar、行右键菜单、空白区右键菜单暴露“新建文件”入口。
- 识别 `Cmd/Ctrl+Shift+C` 和 `Cmd/Ctrl+Shift+V`。
- 从当前焦点/选择解析唯一普通文件目标。
- 调用 `repo-client` 的新建/读取/替换方法。
- 写入或读取系统剪贴板。
- 将文件内容替换写入撤销栈，并复用现有撤销入口。

Renderer 不做文件大小、二进制、路径 containment 的最终判断；这些必须在 server/system 层执行。

### Web Client

`src/web/repo-client.ts` 新增三个方法：

- `createRepositoryFileTreeFile(repoId, worktreePath, parentDirPath, name)`
- `readRepositoryFileTreeTextFile(repoId, worktreePath, filePath)`
- `replaceRepositoryFileTreeTextFile(repoId, worktreePath, filePath, content)`

返回类型使用 `src/shared/file-tree.ts` 中的共享结果类型。

### Server Routes

`src/server/routes/repo.ts` 新增路由：

- `POST /api/repo/file-tree/create-file`
- `POST /api/repo/file-tree/read-text-file`
- `POST /api/repo/file-tree/replace-text-file`

路由只负责 JSON 参数解析和 fallback 错误处理。实际读写、安全校验、本地/远程分发放在模块层。

### Server Modules

`src/server/modules/repo-read-paths.ts` 增加文本文件读取分发：

- 本地仓库调用 `src/system/file-tree/local.ts`。
- 远程仓库调用 `src/system/ssh/git.ts`。

`src/server/modules/repo-write-paths.ts` 增加空文件创建和文本文件替换分发：

- 本地仓库调用 `src/system/file-tree/local.ts`。
- 远程仓库调用 `src/system/ssh/git.ts`。
- 写入成功后发布 repo snapshot invalidation，保持文件树和状态面板刷新一致。

### System Helpers

`src/system/file-tree/local.ts` 新增本地 helper：

- `createLocalFileTreeFile(worktreePath, parentDirPath, name)`
- `readLocalFileTreeTextFile(worktreePath, filePath)`
- `replaceLocalFileTreeTextFile(worktreePath, filePath, content)`

`src/system/ssh/git.ts` 新增远程 helper：

- `createRemoteFileTreeFile(target, worktreePath, parentDirPath, name, options?)`
- `readRemoteFileTreeTextFile(target, worktreePath, filePath, options?)`
- `replaceRemoteFileTreeTextFile(target, worktreePath, filePath, content, options?)`

远程实现必须使用固定命令模板和安全参数传输。用户输入的路径、文件名、内容不能直接拼接成任意 shell 片段。

## 共享类型与限制

`src/shared/file-tree.ts` 新增：

- 文本文件最大大小常量：`FILE_TREE_TEXT_FILE_MAX_BYTES = 1 * 1024 * 1024`
- 创建文件请求/结果类型。
- 读取文本文件请求/结果类型。
- 替换文本文件请求/结果类型。

读取结果包含：

- `ok: true`
- `content`
- `byteLength`

替换结果包含：

- `ok: true`
- `previousContent`
- `previousByteLength`

读取和替换仅支持普通 UTF-8 文本文件。以下情况返回错误且不复制/不替换：

- 路径为空或包含 NUL。
- 路径越出 worktree。
- 目标不存在。
- 目标不是普通文件。
- 文件大于 1 MB。
- 文件内容不是有效 UTF-8。
- 文件内容包含 NUL，按疑似二进制处理。
- 权限不足。

剪贴板文本替换时，待写入内容也按 UTF-8 编码计算大小；超过 1 MB 时拒绝写入。

## 数据流

### 新建文件

1. 用户点击 toolbar 或右键菜单“新建文件”。
2. Renderer 根据目标节点计算父目录。
3. Renderer 展示内联输入行。
4. 用户提交文件名。
5. Server 校验父目录在 worktree 内、文件名是安全 basename、目标不存在。
6. System helper 创建空文件。
7. Server 发布 invalidation。
8. Renderer 刷新父目录并选中新文件。

### 复制文件内容

1. 用户按 `Cmd/Ctrl+Shift+C`。
2. Renderer 确认当前目标是唯一普通文件节点。
3. Renderer 调用读取文本文件 API。
4. Server/system 校验路径、类型、大小和 UTF-8 文本。
5. Renderer 将返回内容写入 `navigator.clipboard.writeText`。
6. Renderer 显示成功或错误提示。

### 替换文件内容

1. 用户按 `Cmd/Ctrl+Shift+V`。
2. Renderer 确认当前目标是唯一普通文件节点。
3. Renderer 读取系统剪贴板文本。
4. Renderer 调用替换文本文件 API。
5. Server/system 校验目标文件和新内容。
6. System helper 在写入前读取旧内容，然后原子或近似原子地写入新内容。
7. Server 发布 invalidation。
8. Renderer 将旧内容加入撤销栈，刷新父目录，显示成功提示。

## 撤销

现有文件树撤销栈新增一种 action：

```ts
{
  kind: 'replaceTextFile'
  path: string
  relativePath: string
  previousContent: string
}
```

执行撤销时调用同一个替换文本文件 API，把 `previousContent` 写回原路径。撤销成功后刷新父目录和选中目标文件。撤销失败时把 action 重新压回栈，避免用户丢失一次恢复机会。

## UI 与文案

新增 i18n key 覆盖英文、中文、日文、韩文：

- `file-tree.new-file`
- `file-tree.new-file-input-label`
- `file-tree.copy-file-contents`
- `file-tree.copy-file-contents-ok`
- `file-tree.replace-file-contents-ok`
- `error.file-tree-text-file-too-large`
- `error.file-tree-binary-file`
- `error.file-tree-not-regular-file`

如果现有错误 key 已能准确表达，例如 `error.file-exists`、`error.invalid-arguments`、`error.path-not-found`、`error.path-permission-denied`，优先复用。

## 测试计划

### System

`src/system/file-tree/local.test.ts` 覆盖：

- 创建空文件成功。
- 拒绝非法 basename、越界路径、已存在目标。
- 读取普通 UTF-8 文本成功。
- 拒绝目录、symlink、超大文件、NUL/二进制、无效 UTF-8。
- 替换普通 UTF-8 文本成功并返回旧内容。
- 替换时拒绝超大剪贴板内容。

`src/system/ssh/git.test.ts` 覆盖远程 helper 的命令输入形态和结果解析，确保使用固定命令与参数传输。

### Server

`src/server/modules/repo.test.ts` 覆盖：

- 本地/远程分发到正确 helper。
- 写入成功发布 invalidation。
- helper 失败不发布 invalidation。

`src/server/routes/repo.test.ts` 或现有 repo route 测试覆盖：

- 三个新增路由解析参数。
- malformed body 返回 fallback 错误。

### Renderer

`src/web/components/file-tree/ProjectFileTree.test.tsx` 覆盖：

- toolbar 显示“新建文件”并触发内联输入。
- 行右键菜单和空白区右键菜单显示“新建文件”。
- 目录、文件、空白区目标目录规则。
- 创建成功后刷新父目录并选中新文件。
- `Cmd/Ctrl+Shift+C` 对单个普通文件读取并写剪贴板。
- 多选、目录、symlink、virtual 节点不触发内容读取。
- `Cmd/Ctrl+Shift+V` 读取剪贴板并替换文件内容。
- 替换成功后撤销恢复旧内容。
- 内联输入或重命名状态下快捷键不误触发。

## 验证命令

至少运行：

```bash
bun run typecheck
bun run test src/system/file-tree/local.test.ts src/server/modules/repo.test.ts src/web/components/file-tree/ProjectFileTree.test.tsx
```

若远程 helper 或共享类型改动范围较大，再运行：

```bash
bun run test
```

## 已确认决策

- Toolbar 和右键菜单都需要“新建文件”入口。
- 新建文件创建空文件。
- 新建文件目标目录规则与新建文件夹一致。
- `Cmd/Ctrl+Shift+C` 复制选中单个普通文件的完整文本内容。
- `Cmd/Ctrl+Shift+V` 用系统剪贴板文本替换选中单个普通文件的完整内容。
- 替换不弹确认，成功后提供撤销。
- 只支持 UTF-8 文本文件，大小上限 1 MB。
