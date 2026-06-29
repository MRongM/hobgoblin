# File Tree Common Binary Clipboard Formats Design

## Goal

增强文件区单个普通文件的 `Ctrl/Cmd+Shift+V` 覆盖能力：当系统剪贴板没有 Hobgoblin 自定义文件内容、文件路径、图片或文本可用时，尝试从常见系统剪贴板二进制格式读取 raw bytes，并直接覆盖当前选中的文件。

目标是支持常见文件格式的内容替换，例如 PDF、Office 文档、压缩包、常见图片和音视频格式。粘贴目标始终是当前选中的文件，因此不需要推断新文件名、扩展名或 MIME 类型。

## Non-Goals

- 不新增“粘贴为新文件”的文件名推断逻辑。
- 不支持目录、多选文件或 symlink 内容替换。
- 不读取所有未知剪贴板格式的第一个非空 buffer。
- 不绕过现有 `fileTreeClipboardMaxBytesMb` 大小上限。
- 不改变 `Ctrl/Cmd+V` 的文件节点复制粘贴语义。
- 不改变 `Ctrl/Cmd+Shift+C` 的复制主通道；Hobgoblin 自定义格式仍是应用内可靠格式。

## Existing Context

文件区已经支持二进制内容替换：

- `ProjectFileTree.tsx` 识别 `Ctrl/Cmd+Shift+V`，只允许单个普通文件作为目标。
- `readFileTreeClipboardFile(maxBytes)` 从主进程读取系统剪贴板内容。
- `replaceRepositoryFileTreeBinaryFile(...)` 用 `bytesBase64` 覆盖本地或远程文件。
- 本地和远程写入路径都校验路径 containment、普通文件类型和 bytes 上限。
- 当前读取顺序包括 Hobgoblin 自定义格式、系统剪贴板文件路径、图片和文本。

缺口是：部分应用会把 PDF、Office、RTF、HTML、TIFF 等内容作为命名 clipboard format 暴露，而不是暴露为文件路径、图片对象或纯文本。Electron 支持 `clipboard.availableFormats()` 和 `clipboard.readBuffer(format)`，因此可以对常见格式做受控读取。

## Recommended Approach

采用“目标扩展优先 + 常用格式白名单”的读取策略。

`readFileTreeClipboardFile(maxBytes, targetName?)` 在现有读取顺序中新增一个常用二进制格式读取阶段：

1. 读取 Hobgoblin 自定义格式。
2. 读取系统剪贴板文件路径的第一个普通文件。
3. 按目标文件扩展名从常用格式白名单中读取 raw buffer。
4. 读取系统图片并转换为 PNG。
5. 读取文本。

如果目标扩展名没有匹配格式，则只在候选格式唯一时读取该格式。多个候选无法判断时返回明确错误，避免把 HTML、RTF、URL、平台元数据等误写进目标文件。

## Common Format Policy

白名单按文件类型维护，不做全量 format 猜测。初始覆盖：

- PDF：`application/pdf`、`public.pdf`
- RTF：`text/rtf`、`application/rtf`、`public.rtf`
- HTML：`text/html`、`public.html`
- PNG：`image/png`、`public.png`
- JPEG：`image/jpeg`、`public.jpeg`
- GIF：`image/gif`、`com.compuserve.gif`
- WebP：`image/webp`
- TIFF：`image/tiff`、`public.tiff`
- ZIP：`application/zip`、`application/x-zip-compressed`、`com.pkware.zip-archive`
- Office Open XML：
  - `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
  - `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
  - `application/vnd.openxmlformats-officedocument.presentationml.presentation`
- Legacy Office：
  - `application/msword`
  - `application/vnd.ms-excel`
  - `application/vnd.ms-powerpoint`
- 音视频：
  - `audio/mpeg`
  - `audio/wav`
  - `video/mp4`
  - `video/quicktime`
- 通用二进制：`application/octet-stream`

`application/octet-stream` 只作为低优先级 fallback。若同时存在更具体的白名单格式，优先读取更具体格式。

## Matching Rules

当 `targetName` 存在时：

- 提取目标扩展名并归一化为小写。
- 根据扩展名选择对应格式组，例如 `.pdf` 只优先匹配 PDF 格式，`.docx` 只优先匹配 DOCX 格式。
- 在 `availableFormats()` 中按组内顺序选择第一个存在且 `readBuffer(format)` 非空的格式。
- 若目标扩展没有对应格式组，进入候选唯一性判断。

初始扩展名映射：

- `.pdf` -> PDF
- `.rtf` -> RTF
- `.html`、`.htm` -> HTML
- `.png` -> PNG
- `.jpg`、`.jpeg` -> JPEG
- `.gif` -> GIF
- `.webp` -> WebP
- `.tif`、`.tiff` -> TIFF
- `.zip` -> ZIP
- `.docx` -> Office Open XML DOCX
- `.xlsx` -> Office Open XML XLSX
- `.pptx` -> Office Open XML PPTX
- `.doc` -> Legacy Office DOC
- `.xls` -> Legacy Office XLS
- `.ppt` -> Legacy Office PPT
- `.mp3` -> MP3
- `.wav` -> WAV
- `.mp4` -> MP4
- `.mov` -> QuickTime MOV

候选唯一性判断：

- 从 `availableFormats()` 中过滤出白名单格式。
- 排除已由专门路径处理的纯文本基础格式，例如 `text/plain`。
- 若候选只有一个，读取该格式。
- 若候选为零，继续图片和文本 fallback。
- 若候选超过一个，返回 `error.file-tree-clipboard-ambiguous-binary-format`。

所有读取到的 buffer 都必须满足：

- `byteLength > 0`
- `byteLength <= maxBytes`
- 可转换为 base64 后与 byteLength 一致

## Data Flow

Renderer 在替换文件内容时把目标文件名传给 native shell bridge：

```ts
readFileTreeClipboardFile(fileTreeClipboardMaxBytes, node.name)
```

IPC 边界保持薄封装：

- preload `readFileTreeClipboardFile(input)` 允许传入 `{ maxBytes, targetName }`，同时兼容旧的 `maxBytes` 数字参数。
- main IPC handler 校验 `maxBytes` 为正整数，`targetName` 为可选字符串。
- shared `FileTreeClipboardReadResult` payload 不需要新增字段；读取到的 format 可以作为 `mimeType` 返回，便于调试和后续扩展。

主进程读取 raw format 后返回现有 payload：

```ts
{
  ok: true,
  file: {
    name: 'clipboard.bin',
    byteLength,
    bytesBase64,
    mimeType
  }
}
```

Renderer 不使用返回的 `name` 决定目标路径；目标路径仍来自当前选中的文件。服务端写入链路保持不变：

```ts
replaceRepositoryFileTreeBinaryFile(
  repoId,
  worktreePath,
  node.absolutePath,
  clipboardFile.file.bytesBase64,
  fileTreeClipboardMaxBytes
)
```

## Error Handling

新增 i18n key：

```ts
error.file-tree-clipboard-ambiguous-binary-format
```

语义：剪贴板包含多个可识别的二进制格式，但目标文件扩展无法判断应使用哪一个。

继续复用现有错误：

- `error.invalid-arguments`
- `error.file-tree-clipboard-file-too-large`
- `error.file-tree-not-regular-file`
- `error.invalid-path`
- `error.path-not-found`
- `error.path-permission-denied`

## Testing

覆盖点：

- 目标为 `.pdf` 时优先读取 `application/pdf`。
- 目标为 `.docx` 时读取 DOCX MIME。
- 目标为 `.jpg` 时读取 JPEG，而不是 PNG 或 HTML。
- 未知目标扩展且只有一个白名单二进制格式时允许读取。
- 未知目标扩展且存在多个白名单二进制格式时返回 ambiguous 错误。
- `application/octet-stream` 低于更具体格式。
- 超过 `maxBytes` 返回 size 错误。
- 没有白名单二进制格式时保留现有图片和文本 fallback。

## Principle Notes

- KISS：只扩展剪贴板读取层，文件写入链路不变。
- YAGNI：不做新文件创建、不做全格式猜测、不新增设置项。
- DRY：复用现有 `FileTreeClipboardFilePayload`、大小上限和二进制替换接口。
- SOLID：格式识别封装在主进程剪贴板模块，Renderer 只表达“读取用于当前文件的剪贴板内容”。
