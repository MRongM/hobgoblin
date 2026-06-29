# File Tree Binary Clipboard Shortcuts Design

## Goal

增强文件树内单个普通文件的 `Ctrl/Cmd+Shift+C` 和 `Ctrl/Cmd+Shift+V`：

- `Ctrl/Cmd+Shift+C` 复制当前单个普通文件的内容到系统剪贴板。
- `Ctrl/Cmd+Shift+V` 从系统剪贴板读取内容并替换当前单个普通文件。
- 文本和二进制文件都支持。
- 本地和远程文件树都支持。
- 默认大小上限为 30 MB，并可在 `设置 -> 文件区` 调整。

该能力是“文件内容”快捷键，不改变现有 `Ctrl/Cmd+C` 和 `Ctrl/Cmd+V` 的文件节点复制粘贴语义。

## Non-Goals

- 不支持目录内容复制或替换。
- 不支持多选文件内容复制或批量替换。
- 不支持 symlink 内容快捷复制或替换。
- 不新增进度条、剪贴板预览、冲突 UI 或后台队列。
- 不把终端二进制粘贴的临时目录设置复用于文件区剪贴板。
- 不依赖 renderer 直接读写本地文件或执行远程命令。

## Existing Context

文件树已经具备以下能力：

- `ProjectFileTree.tsx` 处理选择、快捷键、右键菜单、粘贴、刷新和撤销。
- `Ctrl/Cmd+C` 和 `Ctrl/Cmd+V` 负责复制/粘贴文件树节点。
- `Ctrl/Cmd+Shift+C` 和 `Ctrl/Cmd+Shift+V` 已存在，但只走文本接口：
  - `readRepositoryFileTreeTextFile`
  - `replaceRepositoryFileTreeTextFile`
- 文本接口有 `FILE_TREE_TEXT_FILE_MAX_BYTES = 1 MB`，并拒绝 NUL 和非 UTF-8 内容。
- 主进程已经有可信 shell bridge、系统剪贴板文件路径读取、二进制临时文件保存能力。
- 终端二进制粘贴已经证明本地/远程二进制转移可以复用 native bridge 与 `transferRepositoryFiles` 模式。

现有文本接口不应被放宽为通用二进制接口。它的职责是文本读写；本设计新增文件内容剪贴板接口，避免破坏文本编辑语义。

## Recommended Approach

采用“可靠自定义格式 + 系统文件项兼容”的系统剪贴板方案。

`Ctrl/Cmd+Shift+C` 写入系统剪贴板时：

- 写入 Hobgoblin 自定义二进制格式，作为应用内可靠主通道。
- 对有效文本同时写入 `text/plain`。
- 将内容落到应用控制的本地剪贴板临时文件，并 best-effort 写入系统文件项或文件 URL，提升外部应用兼容性。

`Ctrl/Cmd+Shift+V` 读取系统剪贴板时：

1. 优先读取 Hobgoblin 自定义格式。
2. 其次读取系统剪贴板文件路径的第一个普通文件。
3. 最后读取 `text/plain`。

这个方案让 Hobgoblin 内部复制粘贴可逆且可测试，同时尽量保留“系统剪贴板”的外部互操作体验。任意二进制文件没有跨平台完全统一的系统剪贴板表示，因此外部应用兼容是 best-effort，不作为核心正确性基础。

## Architecture

保持现有分层：

- `ProjectFileTree.tsx`
  - 判断 `Ctrl/Cmd+Shift+C/V`。
  - 只接受当前单个普通文件。
  - 调用 repo client 和 native shell client。
  - 维护 toast、目录刷新和撤销栈。
- `repo-client.ts` / `server/routes/repo.ts`
  - 新增二进制文件内容读写路由的薄边界。
  - 只做请求转发和 schema 校验。
- `server/modules/repo-read-paths.ts` / `repo-write-paths.ts`
  - 按 repo 类型分发本地或远程实现。
  - 写入成功后发布 repo snapshot invalidation。
- `system/file-tree/local.ts`
  - 本地普通文件 bytes 读写。
  - 路径 containment、普通文件校验、大小限制。
- `system/ssh/commands.ts` / `system/ssh/git.ts`
  - 远程普通文件 bytes 读写。
  - 第一版使用 base64 通过 stdout/stdin 传输。
  - 远程路径 containment、普通文件校验、大小限制。
- `main` / `preload` / `app-shell-client`
  - 通过 trusted IPC 读写系统剪贴板。
  - 写入 Hobgoblin 自定义格式、文本格式和文件项兼容格式。
  - 读取 Hobgoblin 自定义格式、系统文件路径和文本格式。

Renderer 不直接读写文件系统。远程内容不通过 renderer 拼接 shell 命令。

## Settings

新增设置字段：

```ts
fileTreeClipboardMaxBytesMb: number
```

语义：

- 默认值：`30`。
- 允许范围：`1` 到 `100`。
- 保存和读取时归一化为整数 MB。
- 设置页位置：`设置 -> 文件区`。
- 复制和粘贴使用同一个上限。
- 服务端和主进程都必须执行最终 bytes 校验，不能只依赖 renderer。

新增共享常量：

```ts
DEFAULT_FILE_TREE_CLIPBOARD_MAX_BYTES_MB = 30
MIN_FILE_TREE_CLIPBOARD_MAX_BYTES_MB = 1
MAX_FILE_TREE_CLIPBOARD_MAX_BYTES_MB = 100
```

运行时按 `mb * 1024 * 1024` 转换为 bytes。

## Data Model

新增文件内容 payload：

```ts
interface RepoFileTreeBinaryFileReadRequest {
  repoId: string
  worktreePath: string
  filePath: string
  maxBytes: number
}

type RepoFileTreeBinaryFileReadResult =
  | {
      ok: true
      name: string
      byteLength: number
      bytesBase64: string
      text?: string
      mimeType?: string
    }
  | {
      ok: false
      message: string
    }

interface RepoFileTreeBinaryFileReplaceRequest {
  repoId: string
  worktreePath: string
  filePath: string
  maxBytes: number
  bytesBase64: string
}

type RepoFileTreeBinaryFileReplaceResult =
  | {
      ok: true
      previousBytesBase64: string
      previousByteLength: number
    }
  | {
      ok: false
      message: string
    }
```

`text` 只在内容可以安全解码为文本时返回，用于同时写入 `text/plain`。二进制正确性以 `bytesBase64` 为准。

系统剪贴板桥使用相近 payload：

```ts
interface FileTreeClipboardFilePayload {
  name: string
  bytesBase64: string
  byteLength: number
  text?: string
  mimeType?: string
}

type FileTreeClipboardReadResult =
  | { ok: true; file: FileTreeClipboardFilePayload }
  | { ok: false; message: string }
```

自定义剪贴板格式中保存版本号，便于后续演进：

```json
{
  "version": 1,
  "name": "image.png",
  "byteLength": 1234,
  "mimeType": "image/png",
  "bytesBase64": "..."
}
```

## Copy Flow

`Ctrl/Cmd+Shift+C`：

1. 文件树检查当前焦点或单选目标。
2. 如果目标不是单个普通文件，直接返回，不触发普通文件节点复制。
3. 读取 `fileTreeClipboardMaxBytesMb` 并转换为 bytes。
4. 调用 server 读取文件内容。
5. server 校验：
   - `repoId`、`worktreePath`、`filePath` 参数有效。
   - `filePath` 在 `worktreePath` 内。
   - 目标是普通文件。
   - 文件大小不超过上限。
6. 本地文件直接读 bytes；远程文件通过 SSH 读取 bytes 并返回 base64。
7. renderer 调 native shell bridge 写系统剪贴板。
8. main 进程写入：
   - Hobgoblin 自定义格式。
   - 有效文本的 `text/plain`。
   - 应用控制的本地临时文件和系统文件项兼容格式。
9. 成功后显示“文件内容已复制”。

如果系统文件项写入失败，但自定义格式写入成功，复制仍成功。外部兼容失败只记录 warning。

## Paste Flow

`Ctrl/Cmd+Shift+V`：

1. 文件树检查当前焦点或单选目标。
2. 如果目标不是单个普通文件，直接返回。
3. 读取 `fileTreeClipboardMaxBytesMb` 并转换为 bytes。
4. 调用 native shell bridge 读取系统剪贴板。
5. main 进程按优先级读取：
   - Hobgoblin 自定义格式。
   - 系统剪贴板文件路径的第一个普通文件。
   - `text/plain`。
6. main 进程校验剪贴板内容大小不超过上限。
7. renderer 调 server 替换当前文件内容。
8. server 在写入前读取旧内容，并校验旧内容不超过上限，以便撤销。
9. server 写入新 bytes；远程文件通过 SSH 写入。
10. server 返回旧 bytes。
11. renderer 将旧 bytes 记录到撤销栈，刷新父目录并显示“文件内容已替换”。

撤销 `replaceBinaryFile` 时，用旧 bytes 通过同一二进制替换接口恢复。现有文本撤销记录可以迁移为二进制撤销记录，或保留文本路径并新增二进制记录；实现阶段优先选择更少分支的结构。

## Remote Behavior

远程复制：

- server 通过 SSH 读取远程文件 bytes。
- renderer 不处理远程命令。
- main 将 bytes 写入本地临时文件，再写入系统剪贴板文件项兼容格式。
- 外部应用看到的是本地临时文件；Hobgoblin 内粘贴优先使用自定义格式。

远程粘贴：

- main 从系统剪贴板读取 bytes。
- server 通过 SSH 替换远程目标文件。
- 如果剪贴板来源是系统文件路径，读取该本地文件内容后上传替换远程文件。

远程读写仍受同一个大小上限控制。

## Clipboard Formats

可靠格式：

- 使用 Hobgoblin 自定义格式保存 JSON 元数据和 base64 bytes。
- 使用 Electron `writeBuffer` / `readBuffer` 一类能力读写自定义格式。
- 格式名使用 `application/x-hobgoblin-file-content+json;version=1`。

文本兼容：

- 内容可安全解码为文本且不含 NUL 时，同时写入 `text/plain`。
- 粘贴时如果没有自定义格式和文件路径，才读取 `text/plain`。

文件项兼容：

- 写入前将 bytes 落到 app 控制的本地 clipboard 临时目录。
- 第一版至少写入 `text/uri-list` file URL 格式。
- macOS 同时写入 `public/file-url` 和 bookmark 格式。
- 平台原生文件列表格式只作为后续兼容增强，不作为第一版正确性要求。
- 读取时复用并扩展现有系统剪贴板文件路径解析能力。

外部应用对文件项格式的支持不是完全可控，因此文件项兼容不能替代自定义格式。

## Temporary Files

文件树剪贴板临时文件使用 app 控制目录，不使用终端 `temporaryFilesDirectory`。

策略：

- 目录名包含功能用途，例如 `file-tree-clipboard/`。
- 文件名使用安全 basename 和随机后缀。
- 写入时不得覆盖已有文件。
- 每次应用启动或每次写入前清理超过 24 小时的 Hobgoblin clipboard 临时文件。

第一版不提供临时文件清理 UI。

## Error Handling

- 目录、多选、symlink：快捷键不触发。
- 文件不存在：返回现有文件错误。
- 非普通文件：返回 `error.file-tree-not-regular-file`。
- 路径越界或参数非法：返回 `error.invalid-path` 或 `error.invalid-arguments`。
- 复制源超过上限：返回新的文件区剪贴板大小错误。
- 粘贴内容超过上限：返回同一个大小错误。
- 系统剪贴板桥不可用：返回 `error.unsupported-native-bridge`。
- 自定义格式解析失败：跳过该格式，继续尝试文件路径和文本 fallback。
- 替换失败：不刷新目录，不写撤销栈。
- 撤销失败：沿用现有撤销失败 toast 语义。

新增 i18n key：

- `error.file-tree-clipboard-file-too-large`
- `file-tree.copy-file-contents-ok`
- `file-tree.replace-file-contents-ok`

现有成功 key 可以继续复用，因为用户语义仍是文件内容复制和替换。

## Testing

重点测试：

- `shared/settings-defaults.test.ts`
  - 默认值为 30。
  - 旧设置缺字段时回退默认值。
- `server/modules/settings-source.test.ts`
  - 小于 1 时归一化到 1。
  - 大于 100 时归一化到 100。
  - 非数字时回退默认值。
- `SettingsPageScreen` 或 `FileAreaSettings` 测试
  - 文件区显示大小上限输入。
  - 修改后调用设置写入路径。
- `ProjectFileTree.test.tsx`
  - 单个普通文件 `Shift+C` 调用二进制读和剪贴板写。
  - 单个普通文件 `Shift+V` 读取剪贴板并调用二进制替换。
  - 目录、多选、symlink 不触发。
  - 替换成功后撤销用旧 bytes 恢复。
- `shared/file-tree.test.ts`
  - 新二进制读写请求校验。
  - 非法 maxBytes、非法 base64 或缺字段被拒绝。
- `system/file-tree/local.test.ts`
  - 本地普通文件 bytes 读写。
  - 路径越界、目录、超限拒绝。
  - 写入前旧内容超限时拒绝替换，避免不可撤销替换。
- `system/ssh/commands.test.ts` / `system/ssh/git.test.ts`
  - 远程二进制读写命令。
  - base64 输出/输入。
  - 超限拒绝。
- `server/modules/repo-read-paths.test.ts` / `repo-write-paths.test.ts`
  - 本地/远程分发。
  - 写入成功后 invalidation。
- `main` clipboard tests
  - 自定义格式写入和读取。
  - 文本 fallback。
  - 文件项临时文件写入。
  - 超限拒绝。
- `preload.test.ts` / `shell-bridge.test.ts` / `app-shell-client.test.ts`
  - 新 IPC 暴露。
  - 只接受 trusted sender。
  - Electron runtime 有能力，web runtime 返回不支持。

验证命令：

```sh
bun run typecheck
bun run test
bun run check:architecture
```

## Principles

- KISS：保持快捷键只作用于单个普通文件，不扩展目录或多选。
- YAGNI：不做预览、进度条、清理 UI 或批量替换规则。
- DRY：复用现有 repo route、settings、trusted IPC、远程 transfer 设计模式。
- SOLID：UI 事件、repo 读写、系统剪贴板、设置归一化各自保持单一职责。

## Implementation Boundary

本规格只描述设计。按照项目指令，除非用户明确要求，不执行 git commit 或分支操作。
