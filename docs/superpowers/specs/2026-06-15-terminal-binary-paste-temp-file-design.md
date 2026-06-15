# Terminal Binary Paste Temp File Design

## Goal

终端外部输入框支持 `Ctrl+V` 粘贴二进制剪贴板内容：

- 如果剪贴板内容是文本，继续使用 textarea 原生粘贴。
- 如果剪贴板内容不是文本，而是文件或二进制 Blob，则把内容写入临时文件。
- 写入成功后，把生成的文件路径插入外部输入框当前光标位置。

默认临时目录为当前终端所属 worktree 根目录下的 `tmp/`。用户可以在 `设置 -> 通用` 中配置一个绝对路径作为临时文件目录；配置为空或非法时回退到当前 worktree 的 `tmp/`。

## Non-Goals

- 不增强 xterm 原生输入区的 `Ctrl+V`。
- 不自动执行插入的路径。
- 不做剪贴板内容预览。
- 不把二进制文件上传到仓库或远端。
- 不实现临时文件自动清理。
- 不支持相对路径作为持久化设置值。
- 不改变现有文本粘贴、拖拽路径插入和终端自定义按钮行为。

## Existing Context

当前项目已有终端外部输入框：

- `TerminalSlot.tsx` 维护外部输入框草稿、提交、拖拽路径插入和自定义按钮填入。
- `terminal-external-input.tsx` 渲染 textarea、处理 Enter 提交和手动高度调整。
- `app-shell-client.ts`、`renderer-bridge.ts`、`renderer-bridge-types.ts` 和 preload/main IPC 负责 renderer 到 native shell 的能力边界。
- `clipboard-file-paths.ts` 已提供只读系统剪贴板文件路径能力，文件区粘贴通过该能力读取系统剪贴板文件路径。

本设计不复用 `readClipboardFilePathsFromSystem()` 写文件。该函数只读取系统剪贴板里的文件路径，不处理截图、浏览器图片 Blob 或其他无路径的二进制剪贴板内容。

## Recommended Approach

采用 textarea paste 事件检测 + main 进程落盘。

`TerminalExternalInput` 增加可选 `onPaste` prop。`TerminalSlot` 在 paste 时检查 `ClipboardEvent.clipboardData`：

1. `text/plain` 非空时不拦截，交给 textarea 原生粘贴。
2. 没有文本但存在 `files` 或二进制 `items` 时阻止默认粘贴。
3. renderer 读取二进制项的 `ArrayBuffer`，通过 native shell bridge 交给 main 进程保存。
4. main 进程写入临时目录并返回绝对路径。
5. renderer 使用现有路径插入模型把 shell-escaped 路径插入外部输入框。

这个方案让 renderer 只负责事件分流和输入框状态，main 进程负责文件系统写入，避免 renderer 直接写文件。

## Settings

新增通用设置字段：

```ts
temporaryFilesDirectory: string
```

语义：

- 空字符串表示使用当前 worktree 根目录下的 `tmp/`。
- 非空值必须是绝对路径。
- 设置页只保存用户输入的绝对路径或空字符串。
- 运行时读取为空或非法值时回退到当前 worktree 的 `tmp/`。

`设置 -> 通用` 增加“临时文件目录”输入项，说明该目录用于终端二进制粘贴生成的文件。第一版只做文本输入，不新增目录选择按钮，除非实现时发现已有通用 picker 组件可以低成本复用。

设置管线沿用现有模式：

- `SettingsPrefs`、`InitialSettingsSnapshot`、`RuntimeSettingsSnapshot` 增加字段。
- `settings-source.ts` 负责归一化。
- `settings-read-projection.ts` 暴露运行时读取。
- `settings-write-paths.ts` 和 `settings-client.ts` 增加写入路径。
- `GeneralSettings.tsx` 增加输入控件。

## Data Flow

### Text Paste

1. 用户在终端外部输入框按 `Ctrl+V`。
2. paste event 包含非空 `text/plain`。
3. 代码不调用 `preventDefault()`。
4. 浏览器按 textarea 原生行为插入文本。

### Binary Paste

1. 用户在终端外部输入框按 `Ctrl+V`。
2. paste event 没有非空文本，但包含 `File` 或二进制 `DataTransferItem`。
3. `TerminalSlot` 阻止默认粘贴。
4. renderer 提取一个或多个二进制项：

```ts
interface SaveClipboardBinaryFileInput {
  name?: string
  type?: string
  bytes: ArrayBuffer
}
```

5. renderer 读取运行时设置中的临时文件目录，并调用 native shell bridge：

```ts
saveClipboardBinaryFiles({
  worktreePath,
  temporaryFilesDirectory,
  files,
})
```

6. main 进程解析目标目录：
   - 如果 `temporaryFilesDirectory` 是合法绝对路径，使用该目录。
   - 否则使用 `${worktreePath}/tmp`。
7. main 进程创建目录、生成文件名并写入文件。
8. main 进程返回：

```ts
type SaveClipboardBinaryResult =
  | { ok: true; paths: string[] }
  | { ok: false; message: string }
```

9. renderer 将返回路径转为 shell-escaped 字符串，用空格连接后插入外部输入框当前光标位置。

## Filename Policy

文件名使用随机且可读的 basename：

```text
pasted-YYYYMMDD-HHMMSS-<8 hex><extension>
```

扩展名规则：

- 优先保留 `File.name` 的扩展名。
- 没有扩展名时，按 MIME 做少量稳定映射：
  - `image/png` -> `.png`
  - `image/jpeg` -> `.jpg`
  - `image/webp` -> `.webp`
  - `image/gif` -> `.gif`
  - `application/pdf` -> `.pdf`
- 仍无法判断时使用 `.bin`。

写入时不得覆盖已有文件。随机名冲突时 main 进程重新生成后缀或追加短随机片段。

## Validation And Limits

main 进程必须做最终校验：

- `worktreePath` 必须是非空绝对路径。
- 配置目录非空时必须是绝对路径，且不能包含 NUL。
- 文件名扩展名只从 basename 提取，不接受路径分隔符。
- 单文件大小上限：100 MB。
- 单次粘贴总大小上限：200 MB。
- 空文件列表直接返回 `{ ok: true, paths: [] }`。

这些限制防止 paste event 和 IPC payload 导致内存或磁盘写入失控。

## Error Handling

- native bridge 不存在或当前是 web runtime：不处理二进制 paste，保持输入框原内容。
- `ArrayBuffer` 读取失败：不调用 main 进程，保持输入框原内容。
- 目录创建失败或文件写入失败：返回 `{ ok: false, message }`，不插入路径。
- 超过大小限制：返回错误，不写入部分文件。
- 多文件写入时任一文件失败：返回错误；已写入文件第一版不做回滚清理。
- renderer 失败提示复用现有 toast 或 console 警告模式，不新增复杂 UI。

## Component Responsibilities

### `TerminalExternalInput`

- 渲染 textarea。
- 暴露 `onPaste` prop。
- 不读取设置。
- 不调用 native bridge。
- 不关心文件系统。

### `TerminalSlot`

- 判断 paste 内容是文本还是二进制。
- 读取当前 worktreePath 和运行时临时目录设置。
- 调用 renderer shell client 保存二进制。
- 将返回路径插入外部输入框。

### Renderer Shell Client And Bridge

- 增加 `saveClipboardBinaryFiles()`。
- Electron runtime 转发到 preload IPC。
- Web runtime 返回不支持或空结果。

### Main Process

- 接收可信 renderer 的保存请求。
- 校验 renderer 传入的临时文件目录。
- 解析最终目录。
- 创建目录、生成文件名、写入 bytes。
- 返回生成的绝对路径。

## Testing

重点测试：

- `TerminalExternalInput` 或 `TerminalSlot`：文本 paste 不阻止默认行为。
- `TerminalSlot`：二进制 paste 调用保存 bridge，并把 shell-escaped 路径插入光标位置。
- `TerminalSlot`：多个返回路径按空格连接插入。
- main 保存模块：默认目录为 `${worktreePath}/tmp`。
- main 保存模块：配置绝对目录优先生效。
- main 保存模块：扩展名保留和 MIME fallback。
- main 保存模块：超出单文件或总大小限制时返回错误。
- preload 测试：新增 IPC channel 暴露并转发。
- shell bridge IPC 测试：只接受 trusted sender。
- settings 测试：字段默认值、读写、运行时 projection 和通用设置 UI。

验证命令：

```sh
bun run typecheck
bun run test
```

## Principles

- KISS：只增强外部输入框的 paste 事件，不接管 xterm 原生输入。
- YAGNI：不做预览、清理策略、目录 picker 或自动执行。
- DRY：复用现有设置管线、native bridge 模式、路径插入和 shell escape 逻辑。
- SOLID：输入框、终端状态编排、bridge 和文件系统写入各自保持单一职责。

## Implementation Boundary

本规格只描述设计。按照项目指令，除非用户明确要求，不执行 git commit。
