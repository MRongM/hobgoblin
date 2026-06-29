# File Tree Common Binary Clipboard Formats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让文件区 `Ctrl/Cmd+Shift+V` 在覆盖当前单个普通文件时，支持常见系统剪贴板二进制格式。

**Architecture:** 扩展主进程剪贴板读取层，使用目标文件名选择常见格式白名单中的 raw buffer。Renderer 只把当前目标文件名透传给 native shell bridge，现有本地/远程二进制替换链路保持不变。

**Tech Stack:** Electron clipboard API, TypeScript strip-only mode, React, Vitest, Bun.

**Version Control:** 本仓库 AGENTS 指令要求用户未主动要求时不要计划或执行 git commit/branch 操作，因此本计划使用验证检查点，不包含 commit 步骤。

---

## Scope Check

本计划只覆盖一个子系统：文件区内容快捷粘贴读取系统剪贴板。它不新增文件创建、目录粘贴、多选覆盖、终端粘贴或设置项。

## File Structure

- Modify: `src/shared/file-tree-clipboard.ts`
  - 定义 native shell bridge 读取剪贴板文件内容的输入类型。
- Modify: `src/main/file-tree-clipboard.ts`
  - 枚举系统剪贴板 formats。
  - 按目标扩展名和常用格式白名单读取 raw buffer。
  - 保留现有自定义格式、文件路径、图片和文本 fallback。
- Modify: `src/main/file-tree-clipboard.test.ts`
  - 覆盖 PDF、DOCX、JPEG、唯一候选、ambiguous、octet fallback 和大小限制。
- Modify: `src/main/shell-bridge.ts`
  - 校验并透传 `targetName`。
- Modify: `src/main/shell-bridge.test.ts`
  - 覆盖 shell bridge 将 `targetName` 传入主进程剪贴板读取函数。
- Modify: `src/web/app-shell-client.ts`
  - `readFileTreeClipboardFile(maxBytes, targetName?)` 发送 `{ maxBytes, targetName }`。
- Modify: `src/web/app-shell-client.test.ts`
  - 覆盖 web client 透传 `targetName`。
- Modify: `src/web/renderer-bridge-types.ts`
  - 更新 native shell bridge 类型。
- Modify: `src/web/vite-env.d.ts`
  - 更新 `window.goblinNative.shell` 类型。
- Modify: `src/web/components/file-tree/ProjectFileTree.tsx`
  - 替换内容快捷键读取剪贴板时传入 `node.name`。
- Modify: `src/web/components/file-tree/ProjectFileTree.test.tsx`
  - 覆盖文件树调用传入目标文件名。
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`
- Modify: `src/shared/i18n/dictionaries.test.ts`
  - 新增 ambiguous clipboard format 错误文案。

### Task 1: Shared Contract And I18n

**Files:**
- Modify: `src/shared/file-tree-clipboard.ts`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`
- Modify: `src/shared/i18n/dictionaries.test.ts`

- [x] **Step 1: Write the failing i18n coverage test**

In `src/shared/i18n/dictionaries.test.ts`, extend the `keys` list in `includes file tree text content shortcut copy in every dictionary`:

```ts
    const keys = [
      'file-tree.new-file',
      'file-tree.new-file-input-label',
      'file-tree.copy-file-contents-ok',
      'file-tree.replace-file-contents-ok',
      'error.file-tree-text-file-too-large',
      'error.file-tree-binary-file',
      'error.file-tree-not-regular-file',
      'error.file-tree-clipboard-ambiguous-binary-format',
    ] satisfies DictKey[]
```

- [x] **Step 2: Run the i18n test and verify it fails**

Run:

```bash
bun run test src/shared/i18n/dictionaries.test.ts
```

Expected: FAIL because `error.file-tree-clipboard-ambiguous-binary-format` is not present in every dictionary.

- [x] **Step 3: Add the shared read input type**

In `src/shared/file-tree-clipboard.ts`, add this interface after `FileTreeClipboardFilePayload`:

```ts
export interface FileTreeClipboardReadInput {
  maxBytes: number
  targetName?: string
}
```

- [x] **Step 4: Add the ambiguous format translations**

In `src/shared/i18n/en.ts`, near the existing `error.file-tree-clipboard-file-too-large` or generic error keys, add:

```ts
  'error.file-tree-clipboard-ambiguous-binary-format':
    'Clipboard contains multiple binary formats. Select a file with a matching extension or copy a file directly.',
```

In `src/shared/i18n/zh.ts`, add:

```ts
  'error.file-tree-clipboard-ambiguous-binary-format':
    '剪贴板包含多个二进制格式。请选择扩展名匹配的文件，或直接复制文件后粘贴。',
```

In `src/shared/i18n/ja.ts`, add:

```ts
  'error.file-tree-clipboard-ambiguous-binary-format':
    'クリップボードに複数のバイナリ形式があります。拡張子が一致するファイルを選択するか、ファイルを直接コピーしてください。',
```

In `src/shared/i18n/ko.ts`, add:

```ts
  'error.file-tree-clipboard-ambiguous-binary-format':
    '클립보드에 여러 바이너리 형식이 있습니다. 확장자가 일치하는 파일을 선택하거나 파일을 직접 복사하세요.',
```

- [x] **Step 5: Run the i18n test and verify it passes**

Run:

```bash
bun run test src/shared/i18n/dictionaries.test.ts
```

Expected: PASS.

### Task 2: Main Process Common Binary Format Reader

**Files:**
- Modify: `src/main/file-tree-clipboard.test.ts`
- Modify: `src/main/file-tree-clipboard.ts`

- [x] **Step 1: Extend the Electron clipboard test mock**

In `src/main/file-tree-clipboard.test.ts`, add `availableFormats` to the hoisted clipboard mock:

```ts
  clipboard: {
    availableFormats: vi.fn(),
    readBuffer: vi.fn(),
    readImage: vi.fn(),
    readText: vi.fn(),
    write: vi.fn(),
    writeBuffer: vi.fn(),
  },
```

In `beforeEach`, reset and default it:

```ts
    electron.clipboard.availableFormats.mockReset()
    electron.clipboard.availableFormats.mockReturnValue([])
```

Add this helper after `afterEach`:

```ts
  function readBufferByFormat(values: Record<string, Buffer>): void {
    electron.clipboard.readBuffer.mockImplementation((format: string) => values[format] ?? Buffer.alloc(0))
  }
```

- [x] **Step 2: Write failing main-process clipboard tests**

Add these tests before the existing `reads system clipboard images as PNG file content` test:

```ts
  test('reads target-matching common binary clipboard formats as raw bytes', async () => {
    const { readFileTreeClipboardFile } = await import('#/main/file-tree-clipboard.ts')
    const cases = [
      {
        targetName: 'report.pdf',
        formats: ['text/html', 'application/pdf'],
        selectedFormat: 'application/pdf',
        bytes: Buffer.from('%PDF'),
      },
      {
        targetName: 'brief.docx',
        formats: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        selectedFormat: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        bytes: Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      },
      {
        targetName: 'photo.jpg',
        formats: ['image/png', 'image/jpeg'],
        selectedFormat: 'image/jpeg',
        bytes: Buffer.from([0xff, 0xd8, 0xff]),
      },
    ]

    for (const item of cases) {
      electron.clipboard.readBuffer.mockReset()
      electron.clipboard.availableFormats.mockReturnValue(item.formats)
      readBufferByFormat({ [item.selectedFormat]: item.bytes })

      await expect(readFileTreeClipboardFile(30 * 1024 * 1024, item.targetName)).resolves.toEqual({
        ok: true,
        file: {
          name: 'clipboard.bin',
          byteLength: item.bytes.byteLength,
          bytesBase64: item.bytes.toString('base64'),
          mimeType: item.selectedFormat,
        },
      })
    }
  })

  test('uses one specific common binary candidate for unknown target extensions', async () => {
    const { readFileTreeClipboardFile } = await import('#/main/file-tree-clipboard.ts')
    const bytes = Buffer.from('%PDF')
    electron.clipboard.availableFormats.mockReturnValue(['application/pdf'])
    readBufferByFormat({ 'application/pdf': bytes })

    await expect(readFileTreeClipboardFile(30 * 1024 * 1024, 'payload.bin')).resolves.toEqual({
      ok: true,
      file: {
        name: 'clipboard.bin',
        byteLength: bytes.byteLength,
        bytesBase64: bytes.toString('base64'),
        mimeType: 'application/pdf',
      },
    })
  })

  test('does not let application/octet-stream beat a specific common binary candidate', async () => {
    const { readFileTreeClipboardFile } = await import('#/main/file-tree-clipboard.ts')
    const pdf = Buffer.from('%PDF')
    const octets = Buffer.from([1, 2, 3, 4])
    electron.clipboard.availableFormats.mockReturnValue(['application/octet-stream', 'application/pdf'])
    readBufferByFormat({ 'application/octet-stream': octets, 'application/pdf': pdf })

    await expect(readFileTreeClipboardFile(30 * 1024 * 1024, 'payload.bin')).resolves.toEqual({
      ok: true,
      file: {
        name: 'clipboard.bin',
        byteLength: pdf.byteLength,
        bytesBase64: pdf.toString('base64'),
        mimeType: 'application/pdf',
      },
    })
  })

  test('returns ambiguous for unknown target extensions with multiple specific binary candidates', async () => {
    const { readFileTreeClipboardFile } = await import('#/main/file-tree-clipboard.ts')
    electron.clipboard.availableFormats.mockReturnValue(['application/pdf', 'application/rtf'])
    readBufferByFormat({ 'application/pdf': Buffer.from('%PDF'), 'application/rtf': Buffer.from('{\\rtf1') })

    await expect(readFileTreeClipboardFile(30 * 1024 * 1024, 'payload.bin')).resolves.toEqual({
      ok: false,
      message: 'error.file-tree-clipboard-ambiguous-binary-format',
    })
  })

  test('enforces maxBytes for common binary clipboard buffers', async () => {
    const { readFileTreeClipboardFile } = await import('#/main/file-tree-clipboard.ts')
    electron.clipboard.availableFormats.mockReturnValue(['application/pdf'])
    readBufferByFormat({ 'application/pdf': Buffer.from('%PDF') })

    await expect(readFileTreeClipboardFile(3, 'report.pdf')).resolves.toEqual({
      ok: false,
      message: 'error.file-tree-clipboard-file-too-large',
    })
  })
```

- [x] **Step 3: Run the main-process clipboard tests and verify they fail**

Run:

```bash
bun run test src/main/file-tree-clipboard.test.ts
```

Expected: FAIL because `readFileTreeClipboardFile` does not accept `targetName` and does not read common binary formats.

- [x] **Step 4: Implement common binary format matching**

In `src/main/file-tree-clipboard.ts`, change the exported reader signature and insert the common format read between file-path and image fallback:

```ts
export async function readFileTreeClipboardFile(
  maxBytes: number,
  targetName?: string,
): Promise<FileTreeClipboardReadResult> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) return { ok: false, message: 'error.invalid-arguments' }
  const custom = readCustomClipboard(maxBytes)
  if (custom.ok) return custom
  const fromPath = await readFirstClipboardPath(maxBytes)
  if (fromPath.ok) return fromPath
  const commonBinary = readCommonBinaryClipboardFormat(maxBytes, targetName)
  if (
    commonBinary.ok ||
    commonBinary.message === 'error.file-tree-clipboard-file-too-large' ||
    commonBinary.message === 'error.file-tree-clipboard-ambiguous-binary-format'
  ) {
    return commonBinary
  }
  const image = readClipboardImage(maxBytes)
  if (image.ok) return image
  const text = clipboard.readText()
  if (!text) return { ok: false, message: 'error.invalid-arguments' }
  const bytes = Buffer.from(text, 'utf8')
  if (bytes.byteLength > maxBytes) return { ok: false, message: 'error.file-tree-clipboard-file-too-large' }
  return {
    ok: true,
    file: {
      name: 'clipboard.txt',
      byteLength: bytes.byteLength,
      bytesBase64: bytes.toString('base64'),
      text,
      mimeType: 'text/plain',
    },
  }
}
```

Add these helpers after `readFirstClipboardPath`:

```ts
interface ClipboardFormatGroup {
  id: string
  extensions: string[]
  formats: string[]
  fallback?: boolean
}

const COMMON_BINARY_CLIPBOARD_FORMAT_GROUPS: ClipboardFormatGroup[] = [
  { id: 'pdf', extensions: ['.pdf'], formats: ['application/pdf', 'public.pdf'] },
  { id: 'rtf', extensions: ['.rtf'], formats: ['text/rtf', 'application/rtf', 'public.rtf'] },
  { id: 'html', extensions: ['.html', '.htm'], formats: ['text/html', 'public.html'] },
  { id: 'png', extensions: ['.png'], formats: ['image/png', 'public.png'] },
  { id: 'jpeg', extensions: ['.jpg', '.jpeg'], formats: ['image/jpeg', 'public.jpeg'] },
  { id: 'gif', extensions: ['.gif'], formats: ['image/gif', 'com.compuserve.gif'] },
  { id: 'webp', extensions: ['.webp'], formats: ['image/webp'] },
  { id: 'tiff', extensions: ['.tif', '.tiff'], formats: ['image/tiff', 'public.tiff'] },
  { id: 'zip', extensions: ['.zip'], formats: ['application/zip', 'application/x-zip-compressed', 'com.pkware.zip-archive'] },
  {
    id: 'docx',
    extensions: ['.docx'],
    formats: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  },
  {
    id: 'xlsx',
    extensions: ['.xlsx'],
    formats: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  },
  {
    id: 'pptx',
    extensions: ['.pptx'],
    formats: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  },
  { id: 'doc', extensions: ['.doc'], formats: ['application/msword'] },
  { id: 'xls', extensions: ['.xls'], formats: ['application/vnd.ms-excel'] },
  { id: 'ppt', extensions: ['.ppt'], formats: ['application/vnd.ms-powerpoint'] },
  { id: 'mp3', extensions: ['.mp3'], formats: ['audio/mpeg'] },
  { id: 'wav', extensions: ['.wav'], formats: ['audio/wav'] },
  { id: 'mp4', extensions: ['.mp4'], formats: ['video/mp4'] },
  { id: 'mov', extensions: ['.mov'], formats: ['video/quicktime'] },
  { id: 'octet-stream', extensions: [], formats: ['application/octet-stream'], fallback: true },
]

const COMMON_BINARY_CLIPBOARD_GROUPS_BY_EXTENSION = new Map(
  COMMON_BINARY_CLIPBOARD_FORMAT_GROUPS.flatMap((group) => group.extensions.map((extension) => [extension, group])),
)

function readCommonBinaryClipboardFormat(maxBytes: number, targetName?: string): FileTreeClipboardReadResult {
  const availableFormats = availableClipboardFormats()
  if (availableFormats.length === 0) return { ok: false, message: 'error.invalid-arguments' }
  const availableByNormalizedFormat = new Map(
    availableFormats.map((format) => [normalizeClipboardFormat(format), format] as const),
  )
  const targetGroup = clipboardFormatGroupForTargetName(targetName)
  if (targetGroup) {
    return (
      readFirstAvailableGroupFormat(targetGroup, availableByNormalizedFormat, maxBytes) ?? {
        ok: false,
        message: 'error.invalid-arguments',
      }
    )
  }
  return (
    readUniqueCommonBinaryFormat(availableByNormalizedFormat, maxBytes) ?? {
      ok: false,
      message: 'error.invalid-arguments',
    }
  )
}

function availableClipboardFormats(): string[] {
  try {
    return clipboard.availableFormats()
  } catch {
    return []
  }
}

function clipboardFormatGroupForTargetName(targetName?: string): ClipboardFormatGroup | null {
  if (!targetName) return null
  return COMMON_BINARY_CLIPBOARD_GROUPS_BY_EXTENSION.get(path.extname(targetName).toLowerCase()) ?? null
}

function readUniqueCommonBinaryFormat(
  availableByNormalizedFormat: Map<string, string>,
  maxBytes: number,
): FileTreeClipboardReadResult | null {
  const availableGroups = COMMON_BINARY_CLIPBOARD_FORMAT_GROUPS.filter((group) =>
    group.formats.some((format) => availableByNormalizedFormat.has(normalizeClipboardFormat(format))),
  )
  const specificGroups = availableGroups.filter((group) => group.fallback !== true)
  if (specificGroups.length > 1) {
    return { ok: false, message: 'error.file-tree-clipboard-ambiguous-binary-format' }
  }
  if (specificGroups.length === 1) {
    return readFirstAvailableGroupFormat(specificGroups[0]!, availableByNormalizedFormat, maxBytes)
  }
  const fallbackGroup = availableGroups.find((group) => group.fallback === true)
  return fallbackGroup ? readFirstAvailableGroupFormat(fallbackGroup, availableByNormalizedFormat, maxBytes) : null
}

function readFirstAvailableGroupFormat(
  group: ClipboardFormatGroup,
  availableByNormalizedFormat: Map<string, string>,
  maxBytes: number,
): FileTreeClipboardReadResult | null {
  for (const format of group.formats) {
    const availableFormat = availableByNormalizedFormat.get(normalizeClipboardFormat(format))
    if (!availableFormat) continue
    const result = readClipboardBufferFormat(availableFormat, maxBytes)
    if (result.ok || result.message === 'error.file-tree-clipboard-file-too-large') return result
  }
  return null
}

function readClipboardBufferFormat(format: string, maxBytes: number): FileTreeClipboardReadResult {
  try {
    const bytes = clipboard.readBuffer(format)
    if (!bytes || bytes.byteLength === 0) return { ok: false, message: 'error.invalid-arguments' }
    if (bytes.byteLength > maxBytes) return { ok: false, message: 'error.file-tree-clipboard-file-too-large' }
    return {
      ok: true,
      file: {
        name: 'clipboard.bin',
        byteLength: bytes.byteLength,
        bytesBase64: bytes.toString('base64'),
        mimeType: format,
      },
    }
  } catch {
    return { ok: false, message: 'error.invalid-arguments' }
  }
}

function normalizeClipboardFormat(format: string): string {
  return format.trim().toLowerCase()
}
```

- [x] **Step 5: Run the main-process clipboard tests and verify they pass**

Run:

```bash
bun run test src/main/file-tree-clipboard.test.ts
```

Expected: PASS.

### Task 3: Target Name IPC And Renderer Pass-Through

**Files:**
- Modify: `src/main/shell-bridge.test.ts`
- Modify: `src/main/shell-bridge.ts`
- Modify: `src/web/app-shell-client.test.ts`
- Modify: `src/web/app-shell-client.ts`
- Modify: `src/web/renderer-bridge-types.ts`
- Modify: `src/web/vite-env.d.ts`
- Modify: `src/web/components/file-tree/ProjectFileTree.test.tsx`
- Modify: `src/web/components/file-tree/ProjectFileTree.tsx`

- [x] **Step 1: Write failing bridge and renderer tests**

In `src/main/shell-bridge.test.ts`, change the read invocation and assertion in `writes and reads file tree clipboard files for trusted senders`:

```ts
    await expect(
      invoke(SHELL_READ_FILE_TREE_CLIPBOARD_FILE_CHANNEL, { maxBytes: 30, targetName: 'README.md' }),
    ).resolves.toEqual({
      ok: true,
      file: input,
    })
    expect(writeFileTreeClipboardFile).toHaveBeenCalledWith(input)
    expect(readFileTreeClipboardFile).toHaveBeenCalledWith(30, 'README.md')
```

In `src/web/app-shell-client.test.ts`, change the native-shell read call and assertion in `writes and reads file tree clipboard files through the native shell`:

```ts
    await expect(readFile(30, 'README.md')).resolves.toEqual({ ok: true, file })
    expect(writeFileTreeClipboardFile).toHaveBeenCalledWith(file)
    expect(readFileTreeClipboardFile).toHaveBeenCalledWith({ maxBytes: 30, targetName: 'README.md' })
```

In `src/web/components/file-tree/ProjectFileTree.test.tsx`, change the assertion in `replaces focused file contents with primary shift v and undoes binary replacement`:

```ts
    expect(readFileTreeClipboardFile).toHaveBeenCalledWith(30 * 1024 * 1024, 'README.md')
```

- [x] **Step 2: Run the bridge and renderer tests and verify they fail**

Run:

```bash
bun run test src/main/shell-bridge.test.ts src/web/app-shell-client.test.ts src/web/components/file-tree/ProjectFileTree.test.tsx
```

Expected: FAIL because `targetName` is not yet forwarded.

- [x] **Step 3: Update shell bridge input parsing**

In `src/main/shell-bridge.ts`, import the shared input type:

```ts
import type { FileTreeClipboardFilePayload, FileTreeClipboardReadInput } from '#/shared/file-tree-clipboard.ts'
```

Replace the file-tree clipboard read handler with:

```ts
  ipcMain.handle(
    SHELL_READ_FILE_TREE_CLIPBOARD_FILE_CHANNEL,
    async (event, input?: Partial<FileTreeClipboardReadInput> | number) => {
      if (!isTrustedIpcEvent(event)) return { ok: false, message: 'error.invalid-path' }
      const maxBytes = typeof input === 'number' ? input : typeof input?.maxBytes === 'number' ? input.maxBytes : 0
      const targetName = typeof input === 'object' && typeof input.targetName === 'string' ? input.targetName : undefined
      return await readFileTreeClipboardFile(maxBytes, targetName)
    },
  )
```

- [x] **Step 4: Update renderer bridge types and app shell client**

In `src/web/renderer-bridge-types.ts`, include `FileTreeClipboardReadInput` in the existing import from `#/shared/file-tree-clipboard.ts`:

```ts
  FileTreeClipboardFilePayload,
  FileTreeClipboardReadInput,
  FileTreeClipboardReadResult,
  FileTreeClipboardWriteResult,
```

Then update the shell bridge method:

```ts
  readFileTreeClipboardFile?: (input: FileTreeClipboardReadInput) => Promise<FileTreeClipboardReadResult>
```

In `src/web/vite-env.d.ts`, include `FileTreeClipboardReadInput` in the existing import and update the shell method:

```ts
    readFileTreeClipboardFile?: (input: FileTreeClipboardReadInput) => Promise<FileTreeClipboardReadResult>
```

In `src/web/app-shell-client.ts`, update the function signature and native call:

```ts
export async function readFileTreeClipboardFile(
  maxBytes: number,
  targetName?: string,
): Promise<FileTreeClipboardReadResult> {
  return (await nativeShell()?.readFileTreeClipboardFile?.({ maxBytes, ...(targetName ? { targetName } : {}) })) ?? {
    ok: false,
    message: 'error.unsupported-native-bridge',
  }
}
```

- [x] **Step 5: Pass the focused file name from the file tree**

In `src/web/components/file-tree/ProjectFileTree.tsx`, update `replaceFocusedFileContents`:

```ts
      const clipboardFile = await readFileTreeClipboardFile(fileTreeClipboardMaxBytes, node.name)
```

- [x] **Step 6: Run the bridge and renderer tests and verify they pass**

Run:

```bash
bun run test src/main/shell-bridge.test.ts src/web/app-shell-client.test.ts src/web/components/file-tree/ProjectFileTree.test.tsx
```

Expected: PASS.

### Task 4: Full Verification

**Files:**
- No source edits in this task.

- [x] **Step 1: Run focused regression tests**

Run:

```bash
bun run test src/main/file-tree-clipboard.test.ts src/main/shell-bridge.test.ts src/web/app-shell-client.test.ts src/web/components/file-tree/ProjectFileTree.test.tsx src/shared/i18n/dictionaries.test.ts
```

Expected: PASS.

- [x] **Step 2: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: PASS.

- [x] **Step 3: Run architecture guard**

Run:

```bash
bun run check:architecture
```

Expected: PASS.

- [x] **Step 4: Run full test suite**

Run:

```bash
bun run test
```

Expected: PASS.

- [x] **Step 5: Inspect final diff**

Run:

```bash
git diff -- src/shared/file-tree-clipboard.ts src/main/file-tree-clipboard.ts src/main/file-tree-clipboard.test.ts src/main/shell-bridge.ts src/main/shell-bridge.test.ts src/web/app-shell-client.ts src/web/app-shell-client.test.ts src/web/renderer-bridge-types.ts src/web/vite-env.d.ts src/web/components/file-tree/ProjectFileTree.tsx src/web/components/file-tree/ProjectFileTree.test.tsx src/shared/i18n/en.ts src/shared/i18n/zh.ts src/shared/i18n/ja.ts src/shared/i18n/ko.ts src/shared/i18n/dictionaries.test.ts
```

Expected: Diff is limited to common binary clipboard format support, bridge type updates, i18n, and tests.
