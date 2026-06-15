# File Tree System Clipboard Random Paste Design

## Goal

文件区支持从系统剪贴板粘贴文件，并支持两种入口：

- `Ctrl/Cmd+V`：沿用现有文件区 paste 事件入口。
- 右键菜单“粘贴”：新增显式菜单项，可从系统剪贴板读取文件并粘贴到目标目录。

当来源是系统剪贴板里的文件路径时，目标文件名使用随机 basename。若原文件名有扩展名，则保留扩展名；若原文件名没有扩展名，则目标名只包含随机 basename。

示例：

- `report.pdf` -> `pasted-a8f31c9d.pdf`
- `LICENSE` -> `pasted-4b91d0aa`

## Non-Goals

- 不改变文件区内部复制粘贴的语义。
- 不改变现有截图、图片、文本粘贴成文件的语义。
- 不做 magic bytes 内容嗅探。
- 不新增进度 UI、冲突处理弹窗或批量传输队列。
- 不让 renderer 直接写本地或远端文件。

## Existing Context

当前文件区已经具备以下能力：

- `ProjectFileTree.tsx` 处理选择、键盘复制粘贴、拖拽、右键菜单、目录刷新。
- `file-tree/clipboard.ts` 将 paste/drop 事件转换为 `RepoFileTransferSource`。
- `transferRepositoryFiles` 走 `repo-client.ts`、`server/routes/repo.ts`、`server/modules/repo-file-transfer.ts`。
- 服务端和 `system/file-tree/transfer.ts` 负责路径 containment、大小限制、复制写入、冲突自动改名。
- `pathForDroppedFile(file)` 通过 preload 的 `webUtils.getPathForFile(file)` 获取拖拽文件路径。

现有缺口：

- 右键菜单没有显式“粘贴”入口。
- 右键菜单触发时没有 `ClipboardEvent`，不能复用浏览器 paste event 里的 `clipboardData.files`。
- 系统剪贴板文件目前按原文件名复制，不能满足随机目标名要求。

## Behavior

### Paste target resolution

粘贴目标沿用现有文件区语义：

1. 右键或聚焦目录时，粘贴到该目录。
2. 右键或聚焦文件时，粘贴到文件所在父目录。
3. 空白处或无有效目标时，粘贴到当前 worktree 根目录。

这条规则同时适用于 `Ctrl/Cmd+V` 和右键菜单“粘贴”。

### Source priority

粘贴来源按以下顺序解析：

1. 文件区内部剪贴板中的 `fileTreePaths`。
2. 系统剪贴板中的文件路径。
3. paste event 中现有的图片、文本、文件 payload。

文件区内部剪贴板保持现有行为，不随机改名。只有系统剪贴板文件路径粘贴使用随机目标名。

### Filename policy

系统剪贴板文件路径生成目标名时：

- 使用随机 basename，例如 8 位 hex。
- 原路径 basename 有扩展名时保留扩展名。
- 原路径 basename 没有扩展名时不补默认扩展名。
- 冲突时继续由服务端现有 `uniqueCopyName` 兜底。

不通过 MIME type 或内容嗅探判断系统剪贴板文件类型。系统剪贴板文件路径已有原始文件名，扩展名是第一版最稳定、最简单的类型信号。

图片、截图、文本等没有文件路径的剪贴板内容保持现有 `generatedPasteFileName` 规则，例如 `pasted-image-*` 和 `pasted-text-*`。

## Architecture

保持现有分层：

- `ProjectFileTree.tsx`：只负责 UI 事件、目标节点解析、菜单项、调用 transfer。
- `file-tree/clipboard.ts`：负责把剪贴板数据转换为 `RepoFileTransferSource`。
- `app-shell-client.ts` / renderer bridge：提供只读系统剪贴板文件路径读取能力。
- `repo-client.ts` 和 `server/routes/repo.ts`：保持薄边界。
- `server/modules/repo-file-transfer.ts`：继续编排 transfer。
- `system/file-tree/transfer.ts`：继续负责本地复制、目标命名、大小限制、写入和冲突改名。

新增 bridge 能力应是只读的，例如：

```ts
readClipboardFilePaths(): Promise<string[]>
```

该 bridge 只返回系统剪贴板中的文件路径，不写剪贴板，不执行复制，不绕过服务端的路径校验和大小限制。

## Data Model

扩展 `RepoFileTransferLocalPathsSource`，让每个本地来源路径可以携带可选目标名。使用单一 `items` 结构，现有只传路径的调用点通过小型适配函数转换，避免在类型守卫和服务端复制逻辑中维护两套 shape。

```ts
interface RepoFileTransferLocalPathItem {
  path: string
  destinationName?: string
}

interface RepoFileTransferLocalPathsSource {
  kind: 'localPaths'
  items: RepoFileTransferLocalPathItem[]
}
```

语义：

- 拖拽文件继续不设置 `destinationName`，目标名来自原路径 basename。
- 系统剪贴板文件设置 `destinationName`，服务端以该值作为 requested name。
- `destinationName` 必须是 basename，不能包含路径分隔符、空字符串或 NUL 字符。

## Data Flow

### Ctrl/Cmd+V

1. `ProjectFileTree` 接收 paste event。
2. 优先读取内部文件区剪贴板。
3. 若无内部剪贴板，调用现有 `sourceFromClipboardEvent(event.nativeEvent)`。
4. 如果 paste event 中能取得系统文件路径，则转换为带随机 `destinationName` 的 `localPaths`。
5. 调用 `transferRepositoryFiles`。
6. 成功后刷新目标目录。

### Context menu paste

1. 用户在目录、文件或空白区域打开右键菜单。
2. `ProjectFileTree` 解析目标目录。
3. 优先读取内部文件区剪贴板。
4. 若无内部剪贴板，调用 Electron bridge 读取系统剪贴板文件路径。
5. 将路径转换为带随机 `destinationName` 的 `localPaths`。
6. 调用 `transferRepositoryFiles`。
7. 成功后刷新目标目录。

右键菜单没有 paste event，因此不负责处理截图或纯文本粘贴。截图和文本继续通过 `Ctrl/Cmd+V` 的 paste event 入口工作。

## Error Handling

- 无 worktree 时不执行粘贴。
- 系统剪贴板没有文件路径时，右键粘贴不调用 transfer。
- Electron bridge 不可用或读取失败时，降级为空路径列表。
- `destinationName` 非法时，服务端返回 `error.invalid-arguments`。
- 目标越界、源路径无效、文件过大、总量过大、远端不支持等错误继续由现有 transfer 返回。
- 成功后刷新目标目录；冲突改名结果不新增弹窗。

## Testing

重点覆盖：

- `file-tree/model.test.ts`：随机目标名生成，保留扩展名；无扩展名不补扩展。
- `file-tree/clipboard` 或 `ProjectFileTree.test.tsx`：系统剪贴板路径转换为带 `destinationName` 的 `localPaths`。
- `ProjectFileTree.test.tsx`：右键目录粘贴到目录，右键文件粘贴到父目录，空白处粘贴到根目录。
- `shared/file-tree.ts` 类型守卫测试：扩展后的 `localPaths` shape 可通过校验，非法 `destinationName` 被拒绝。
- `system/file-tree/transfer.test.ts` 或 `server/modules/repo-file-transfer.test.ts`：`destinationName` 生效，源文件名不再决定目标名。
- `preload.test.ts` 和 renderer bridge 类型相关测试：只读剪贴板文件路径 bridge 暴露并可被 renderer 调用。

验证命令：

```sh
bun run typecheck
bun run test
```

## Principles

- KISS：复用现有 transfer 管线，只补菜单入口、剪贴板读取和目标命名。
- YAGNI：不做内容嗅探、不做新进度 UI、不做新冲突 UI。
- DRY：目标解析、目录刷新、transfer 调用继续复用现有函数。
- SOLID：UI 事件、剪贴板解析、native bridge、服务端写入各自保持单一职责。

## Implementation Boundary

本规格只描述设计。按照项目指令，除非用户明确要求，不执行 git commit。
