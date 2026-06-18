# File Tree Export And Download Design

## Goal

文件区拖到 Finder/Desktop 时应产生真实文件内容，而不是内容为路径字符串、标题也是路径的文本文件。

同时在文件区右键菜单增加“下载”动作：

- 本地仓库：复制所选真实文件到用户选择的本地目录。
- 远程仓库：下载所选真实文件到用户选择的本地目录。

## Scope

支持范围：

- 本地 worktree 普通文件拖到 Finder/Desktop。
- 远程 worktree 普通文件拖到 Finder/Desktop，前提是拖拽开始前缓存已经准备好。
- 文件节点或多选文件的右键下载。
- 下载时每次弹出目录选择器。
- 多选时只处理真实普通文件。
- 现有拖到内置终端和文件区内部拖放继续可用。

不支持范围：

- 目录拖出或目录下载。
- symlink 拖出或下载。
- missing、deleted、virtual、other 节点拖出或下载。
- zip 打包下载。
- 覆盖已有文件。
- 下载进度 UI。
- 把桌面拖出失败 fallback 成 `text/plain` 路径文件。

## Existing Context

当前文件树 `dragstart` 会写入两类数据：

- `GOBLIN_FILE_PATHS_MIME`：Hobgoblin 内部路径 payload，终端和文件树内部拖放依赖它。
- `text/plain`：路径文本。

Finder/Desktop 接收 `text/plain` 后会创建一个文本文件，导致拖出结果变成“内容是路径、标题也是路径”。真实桌面文件拖出必须通过 Electron native drag，把 OS 可读取的本地文件路径交给 `webContents.startDrag({ files, icon })`。

项目架构约束：

- renderer 负责 UI 选择、右键菜单、拖拽事件和调用桥接 API。
- main 负责 Electron native shell 能力、目录选择、可信 IPC 和 native drag。
- server/system 负责 repo 文件读写、远程 SSH 读取和路径校验。

## Recommended Approach

新增一个窄的“文件导出”能力，和 repo 内部 transfer 语义分开。

核心接口：

```ts
prepareFileTreeDesktopDrag(input: {
  repoId: string
  worktreePath: string
  paths: string[]
}): void

startFileTreeDesktopDrag(input: {
  repoId: string
  worktreePath: string
  paths: string[]
}): void

downloadFileTreeFiles(input: {
  repoId: string
  worktreePath: string
  paths: string[]
}): Promise<RepoFileExportResult>
```

`prepareFileTreeDesktopDrag()` 异步准备远程桌面拖拽缓存。本地仓库可以 no-op 或只做轻量校验。

`startFileTreeDesktopDrag()` 必须同步消费已可用的本地路径，并在当前 OS drag transaction 中立即调用 Electron native drag。

`downloadFileTreeFiles()` 打开目录选择器。用户取消时静默返回；用户选择目录后执行本地复制或远程下载。

## Desktop Drag Data Flow

1. 用户在文件树文件行上按下鼠标或选区稳定后，renderer 计算当前候选文件。
2. 远程仓库调用 `prepareFileTreeDesktopDrag({ repoId, worktreePath, paths })` 预热缓存；本地仓库不需要远程读取。
3. 用户真正 `dragstart` 时，renderer 始终写入 `GOBLIN_FILE_PATHS_MIME`。
4. 如果选择中存在真实普通文件：
   - 不写 `text/plain`。
   - 调用 `startFileTreeDesktopDrag({ repoId, worktreePath, paths })`。
5. main 同步过滤可拖出的文件：
   - 本地仓库：路径必须在 `worktreePath` 内，存在，且是普通文件。
   - 远程仓库：只使用已经预热完成、仍可读的缓存文件。
6. 过滤后文件列表非空时，main 立即调用 `event.sender.startDrag({ files, icon })`。

目录-only 或无真实文件候选时，不调用 native desktop drag。此时可保留路径文本 fallback，用于非文件导出的路径文本场景。

## Download Data Flow

1. 用户右键文件或多选文件，点击 `file-tree.download`。
2. renderer 将当前右键目标或多选目标过滤为真实普通文件。
3. 如果没有真实文件，下载项禁用或不显示。
4. renderer 调用 native bridge。
5. main 弹出目录选择器。
6. 用户取消时返回取消结果，不显示错误。
7. 用户选择目录后：
   - 本地仓库复制 worktree 内普通文件到目标目录。
   - 远程仓库通过 `readRemoteFileBase64()` 读取远程文件并写入目标目录。
8. 文件名保留 basename；目标目录已有同名文件时生成不冲突的新文件名，不覆盖。

下载结果允许部分成功：

```ts
type RepoFileExportResult =
  | {
      ok: true
      copied: Array<{ sourcePath: string; destinationPath: string }>
      renamed: Array<{ requestedName: string; destinationName: string; destinationPath: string }>
      failed: Array<{ sourcePath: string; message: string }>
      canceled?: false
    }
  | {
      ok: false
      message: string
      canceled?: boolean
    }
```

## Remote Cache

远程桌面拖拽缓存使用 app 管理的数据目录下的独立子目录，例如 `<userData>/desktop-drag/`。

规则：

- 文件名尽量保留远程 basename。
- 冲突时追加短随机后缀。
- 映射键包含 `repoId`、`worktreePath`、远程文件路径。
- prepare 前清理超过 24 小时的旧缓存文件。
- 不在 dragstart 或 drop 后立即删除缓存，避免 OS 在 drop 阶段读取不到文件内容。

远程缓存准备是 best-effort。失败不影响内部 MIME，也不影响拖到终端。

## UI

文件节点右键菜单增加 `file-tree.download`：

- 使用下载图标。
- 只对真实普通文件启用。
- 多选时菜单动作作用于当前选中的真实普通文件；如果右键节点不在选区内，则作用于该节点。
- 本地和远程仓库显示同一动作文案，行为分别是复制和下载。

不恢复已移除的右键粘贴动作。

## Error Handling

- 无真实文件候选：不调用 native drag；下载项禁用或不显示。
- 本地路径越界、缺失、目录、symlink、权限错误：过滤并记录失败。
- 远程预热失败：不 fallback 成路径文本；拖到终端仍可用。
- 远程下载失败：返回对应失败项。
- 用户取消目录选择：静默结束。
- 部分成功：保留成功文件，报告失败项，不回滚已保存文件。
- `startDrag()` 抛错：main 捕获并记录，不写 `text/plain` fallback。
- native bridge 不存在：renderer helper no-op 或返回 unsupported 结果。

## Testing

覆盖以下测试：

- `ProjectFileTree.test.tsx`：文件拖拽继续写 `GOBLIN_FILE_PATHS_MIME`。
- `ProjectFileTree.test.tsx`：文件拖拽不再写 `text/plain`。
- `ProjectFileTree.test.tsx`：目录-only 拖拽不调用 native desktop drag，可保留路径文本。
- `ProjectFileTree.test.tsx`：多选时 native drag/download 只接收真实普通文件。
- `ProjectFileTree.test.tsx`：右键菜单显示下载动作，并调用目录选择与导出。
- `TerminalSlot.test.tsx`：终端拖入继续优先读取 `GOBLIN_FILE_PATHS_MIME`。
- shell bridge 测试：只接受 trusted sender。
- main/native 测试：`startFileTreeDesktopDrag()` 同步过滤路径并调用 `startDrag()`。
- main/native 测试：下载打开目录选择器，并在取消时不写文件。
- server/system helper 测试：本地 containment、普通文件过滤、冲突自动改名。
- server/system helper 测试：远程 `readRemoteFileBase64()` 写入本地目标目录。
- remote drag cache 测试：prepare/start 分离，start 不做异步远程读取。

验证命令：

```sh
bun run typecheck
bun run check:architecture
bun run test
```

## Principles

- KISS：本轮只支持真实普通文件，不做目录递归、zip、进度 UI。
- YAGNI：不新增下载队列、不做覆盖策略配置、不做失败回滚。
- DRY：继续复用文件树 selection、内部 MIME payload、现有远程读取能力和现有唯一命名规则。
- SOLID：renderer 只表达用户意图；main 处理 native 能力；server/system 处理 repo 文件导出。

## Git Policy

不自动提交本设计文档。项目指令要求用户未明确要求时不执行 `git commit` 或分支操作。
