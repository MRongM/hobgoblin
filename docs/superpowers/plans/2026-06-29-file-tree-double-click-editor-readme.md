# File Tree Double-Click Editor and README Magic Operation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users double-click files in the workspace file tree to open the exact file in the configured editor, and document the operation in every root README.

**Architecture:** Reuse the existing editor-opening path instead of adding routes. The renderer adds a file-only double-click entry point, the editor path resolver sends file nodes as exact paths, and the system editor launcher accepts existing files as well as directories.

**Tech Stack:** React, TypeScript strip-only mode, Vitest, Bun, Markdown.

---

Project instruction override: do not add git commit steps. The repository instructions explicitly say not to plan or execute git commits unless the user asks.

## File Structure

- Modify: `src/system/open-app.ts`
  - Responsibility: Resolve VS Code-family editor CLI paths and validate local / remote editor launch arguments.
- Modify: `src/system/open-app.test.ts`
  - Responsibility: Unit coverage for local editor path validation and remote editor CLI arguments.
- Modify: `src/web/components/file-tree/ProjectFileTree.tsx`
  - Responsibility: File tree interaction, context menu actions, and editor / terminal command dispatch for file tree nodes.
- Modify: `src/web/components/file-tree/ProjectFileTree.test.tsx`
  - Responsibility: Renderer behavior coverage for file tree selection, context menus, editor actions, and double-click behavior.
- Modify: `README.md`
  - Responsibility: English product README.
- Modify: `README.zh-CN.md`
  - Responsibility: Simplified Chinese product README.
- Modify: `README.ko.md`
  - Responsibility: Korean product README.
- Modify: `README.ja.md`
  - Responsibility: Japanese product README.

No new source files are needed.

### Task 1: Allow Local Editors To Open File Paths

**Files:**

- Modify: `src/system/open-app.test.ts`
- Modify: `src/system/open-app.ts`

- [ ] **Step 1: Write the failing local editor file-path test**

In `src/system/open-app.test.ts`, extend the hoisted mocks so `statSync` can describe file paths. Replace the existing top mock block with:

```ts
const mocks = vi.hoisted(() => ({
  execa: vi.fn(),
  existsSync: vi.fn(),
  homedir: vi.fn(() => '/Users/test'),
  statSync: vi.fn(() => ({ isDirectory: () => true, isFile: () => false })),
}))

vi.mock('execa', () => ({ execa: mocks.execa }))
vi.mock('node:fs', () => ({
  existsSync: mocks.existsSync,
  statSync: mocks.statSync,
}))
vi.mock('node:os', () => ({ default: { homedir: mocks.homedir } }))
```

Still in `src/system/open-app.test.ts`, add this `describe` block above the existing `describe('openRemoteByAppCli', ...)` block:

```ts
describe('openByAppCli', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.existsSync.mockImplementation((path: string) =>
      path === '/Applications/Visual Studio Code.app' ||
      path === '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code',
    )
    mocks.statSync.mockReturnValue({ isDirectory: () => false, isFile: () => true })
    mocks.execa.mockResolvedValue({ failed: false })
  })

  test('opens an existing file path with a VS Code-family editor CLI', async () => {
    const { openByAppCli } = await import('#/system/open-app.ts')

    await expect(openByAppCli('Visual Studio Code', 'code', '/repo/README.md')).resolves.toEqual({
      ok: true,
      message: '/repo/README.md',
    })

    expect(mocks.execa).toHaveBeenCalledWith(
      '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code',
      ['/repo/README.md'],
      expect.objectContaining({ timeout: 10_000, reject: false }),
    )
  })
})
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```sh
bun run test -- src/system/open-app.test.ts
```

Expected result: the new `openByAppCli` test fails because `openByAppCli()` rejects file paths with `error.invalid-path`.

- [ ] **Step 3: Implement local editor path validation**

In `src/system/open-app.ts`, replace the opening comment and `isUsableDirectory()` helper with:

```ts
// Shared utilities for opening a path in a macOS .app.
//
// VS Code-family editors (VS Code, Cursor, Windsurf) ship a CLI binary
// inside their .app bundle at Contents/Resources/app/bin/<name>. Using
// this CLI is more reliable than `open -a` because the CLI talks to the
// editor's IPC channel directly, whereas `open -a` just activates the
// app and newer hub/home UIs may ignore the path argument.
```

```ts
function isUsableEditorPath(p: string): boolean {
  if (!path.isAbsolute(p) || p.includes('\0')) return false
  try {
    const stat = statSync(p)
    return stat.isDirectory() || stat.isFile()
  } catch {
    return false
  }
}
```

Then replace the `openByAppCli()` function with:

```ts
/** Open `targetPath` using the CLI binary inside a VS Code-family .app bundle.
 *  Returns an error if the CLI binary isn't found — `open -a` is not
 *  used as a fallback because newer editor UIs (e.g. Cursor's Home)
 *  silently ignore the path argument passed via Launch Services. */
export function openByAppCli(
  appName: string,
  cliName: string,
  targetPath: string,
): Promise<{ ok: boolean; message: string }> {
  if (!isUsableEditorPath(targetPath)) return Promise.resolve({ ok: false, message: 'error.invalid-path' })

  const cli = resolveAppCli(appName, cliName)
  if (!cli) return Promise.resolve({ ok: false, message: 'error.editor-not-installed' })

  return execa(cli, [targetPath], {
    timeout: OPEN_TIMEOUT_MS,
    forceKillAfterDelay: 500,
    reject: false,
  }).then((result) => {
    if (result.failed) {
      const message = result.stderr?.trim() || result.shortMessage || result.message || 'error.editor-not-installed'
      return { ok: false, message }
    }
    return { ok: true, message: targetPath }
  })
}
```

- [ ] **Step 4: Run the focused system test and verify it passes**

Run:

```sh
bun run test -- src/system/open-app.test.ts
```

Expected result: all tests in `src/system/open-app.test.ts` pass.

### Task 2: Add File-Only Double-Click Editor Opening

**Files:**

- Modify: `src/web/components/file-tree/ProjectFileTree.test.tsx`
- Modify: `src/web/components/file-tree/ProjectFileTree.tsx`

- [ ] **Step 1: Write failing file tree editor tests**

In `src/web/components/file-tree/ProjectFileTree.test.tsx`, add this test immediately before the existing test named `opens the selected local file parent directory in the editor from the context menu`:

```ts
  test('opens a local file node directly in the editor on double click', async () => {
    seedRepoWithSelectedBranch({ hasWorktree: true })

    await render(<ProjectFileTree repoId="/repo" />)

    const row = treeItemByText('README.md')
    await act(async () => {
      row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
      await Promise.resolve()
    })

    expect(openRepositoryEditor).toHaveBeenCalledWith('/repo/README.md')
  })
```

Add this test immediately after it:

```ts
  test('opens a symlink-to-file node directly in the editor on double click', async () => {
    getRepositoryFileTree.mockImplementationOnce(
      async (_repoId: string, _worktreePath: string, dirPath: string, _signal?: AbortSignal) => ({
        ok: true as const,
        worktreePath: '/repo',
        dirPath,
        entries: [
          { name: 'src', absolutePath: '/repo/src', relativePath: 'src', kind: 'directory' as const },
          { name: 'README.md', absolutePath: '/repo/README.md', relativePath: 'README.md', kind: 'file' as const },
          {
            name: 'README-link.md',
            absolutePath: '/repo/README-link.md',
            relativePath: 'README-link.md',
            kind: 'symlink' as const,
            targetKind: 'file' as const,
          },
        ],
      }),
    )
    seedRepoWithSelectedBranch({ hasWorktree: true })

    await render(<ProjectFileTree repoId="/repo" />)

    const row = treeItemByText('README-link.md')
    await act(async () => {
      row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
      await Promise.resolve()
    })

    expect(openRepositoryEditor).toHaveBeenCalledWith('/repo/README-link.md')
  })
```

Add this test immediately after the symlink test:

```ts
  test('shows an error toast when double-click editor opening fails', async () => {
    openRepositoryEditor.mockResolvedValueOnce({ ok: false, message: 'error.editor-not-installed' })
    seedRepoWithSelectedBranch({ hasWorktree: true })

    await render(<ProjectFileTree repoId="/repo" />)

    const row = treeItemByText('README.md')
    await act(async () => {
      row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
      await Promise.resolve()
    })

    expect(toastMocks.error).toHaveBeenCalledWith('error.editor-not-installed')
  })
```

Then rename the existing context-menu file editor test from:

```ts
  test('opens the selected local file parent directory in the editor from the context menu', async () => {
```

to:

```ts
  test('opens the selected local file directly in the editor from the context menu', async () => {
```

In that renamed test, replace the final assertion:

```ts
    expect(openRepositoryEditor).toHaveBeenCalledWith('/repo')
```

with:

```ts
    expect(openRepositoryEditor).toHaveBeenCalledWith('/repo/README.md')
```

- [ ] **Step 2: Run the focused renderer test and verify it fails**

Run:

```sh
bun run test -- src/web/components/file-tree/ProjectFileTree.test.tsx
```

Expected result: the new double-click test fails because no double-click handler opens the editor, and the renamed context-menu test fails because files still resolve to their parent directory.

- [ ] **Step 3: Add the file-only open callback through `FileTreeRow`**

In `src/web/components/file-tree/ProjectFileTree.tsx`, define this callback before the `return` statement of `ProjectFileTree()`:

```ts
  const runOpenNodeInEditor = useCallback(
    async (node: FileTreeNode) => {
      const result = await openNodeInEditor(repoId, node)
      if (!result.ok) toast.error(result.message)
    },
    [repoId],
  )
```

Then add `onOpenInEditor` to the root `FileTreeRow` call near `onUpload={runUploadForNode}`:

```tsx
                    onUpload={runUploadForNode}
                    onOpenInEditor={(node) => void runOpenNodeInEditor(node)}
                    onKeyDown={handleKeyDown}
```

In the `FileTreeRow` function parameter list, add `onOpenInEditor` after `onUpload`:

```ts
  onUpload,
  onOpenInEditor,
  onKeyDown,
```

In the `FileTreeRow` prop type, add:

```ts
  onOpenInEditor: (node: FileTreeNode) => void
```

inside the prop object after:

```ts
  onUpload: (node: FileTreeNode | null) => void
```

In the row `<div>` props, add an `onDoubleClick` handler after the existing `onClick` handler:

```tsx
            onDoubleClick={(event) => {
              if (!isEditorOpenableFileNode(node)) return
              event.preventDefault()
              event.stopPropagation()
              onOpenInEditor(node)
            }}
```

In the recursive child `FileTreeRow` call, pass the callback through after `onUpload={onUpload}`:

```tsx
            onUpload={onUpload}
            onOpenInEditor={onOpenInEditor}
            onKeyDown={onKeyDown}
```

- [ ] **Step 4: Add the file-node predicate and exact file editor path**

In `src/web/components/file-tree/ProjectFileTree.tsx`, replace `editorPathForNode()` with:

```ts
function editorPathForNode(node: FileTreeNode): string {
  return node.absolutePath
}
```

Add this helper below `isWritableNode()`:

```ts
function isEditorOpenableFileNode(node: FileTreeNode): boolean {
  return node.kind === 'file' || (node.kind === 'symlink' && node.targetKind === 'file')
}
```

- [ ] **Step 5: Run the focused renderer test and verify it passes**

Run:

```sh
bun run test -- src/web/components/file-tree/ProjectFileTree.test.tsx
```

Expected result: all tests in `src/web/components/file-tree/ProjectFileTree.test.tsx` pass, including:

```text
opens a local file node directly in the editor on double click
opens a symlink-to-file node directly in the editor on double click
shows an error toast when double-click editor opening fails
opens the selected local file directly in the editor from the context menu
opens the selected local directory in the editor from the context menu
```

### Task 3: Document The Magic Operation In Every Root README

**Files:**

- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `README.ko.md`
- Modify: `README.ja.md`

- [ ] **Step 1: Add English README entry**

In `README.md`, insert this bullet immediately after the existing `Drag from file tree to terminal` bullet:

```markdown
- **Double-click file tree files:** Double-click a file in the file tree to open that exact file in the configured editor.
```

The `Magic Operations` section should include this local ordering:

```markdown
- **Binary paste into terminal input:** Paste binary clipboard content into the terminal input to create temporary files and insert the generated file paths.
- **Drag from file tree to terminal:** Drag files from the file tree into the terminal to insert shell-safe paths without typing them manually.
- **Double-click file tree files:** Double-click a file in the file tree to open that exact file in the configured editor.
- **Clipboard-powered file flow:** Paste clipboard text into files with `Ctrl+Shift+V`, and copy file text back to the system clipboard with `Ctrl+Shift+C`.
```

- [ ] **Step 2: Add Simplified Chinese README entry**

In `README.zh-CN.md`, insert this bullet immediately after the existing `从文件树拖拽到终端` bullet:

```markdown
- **双击文件树文件：** 双击文件树中的文件，直接用已配置的编辑器打开该文件。
```

The `魔法操作` section should include this local ordering:

```markdown
- **终端二进制粘贴：** 在终端输入框粘贴二进制剪贴板内容，自动生成临时文件，并把生成的文件路径插入输入框。
- **从文件树拖拽到终端：** 将文件树中的文件拖到终端，直接插入 shell 安全的文件路径，避免手动输入。
- **双击文件树文件：** 双击文件树中的文件，直接用已配置的编辑器打开该文件。
- **剪贴板文件流转：** 支持通过 `Ctrl+Shift+V` 将剪贴板文本写入文件，也支持通过 `Ctrl+Shift+C` 将文件文本复制到系统剪贴板。
```

- [ ] **Step 3: Add Korean Magic Operations section**

In `README.ko.md`, insert this complete section after the last product feature bullet and before `## 설치`:

```markdown
## 매직 작업

- **터미널 입력에 바이너리 붙여넣기:** 터미널 입력창에 바이너리 클립보드 내용을 붙여넣으면 임시 파일을 만들고 생성된 파일 경로를 입력합니다.
- **파일 트리에서 터미널로 드래그:** 파일 트리의 파일을 터미널로 드래그해 직접 입력하지 않고 shell-safe 경로를 삽입합니다.
- **파일 트리 파일 두 번 클릭:** 파일 트리에서 파일을 두 번 클릭하면 설정된 편집기에서 해당 파일을 바로 엽니다.
- **클립보드 기반 파일 흐름:** `Ctrl+Shift+V`로 클립보드 텍스트를 파일에 쓰고, `Ctrl+Shift+C`로 파일 텍스트를 시스템 클립보드에 복사합니다.
- **터미널 탭 점프:** 활성 터미널 탭을 두 번 클릭하면 해당 터미널을 맨 아래로 스크롤합니다.
- **터미널에서 파일 트리로 이동:** 터미널 출력에서 감지된 리포지토리 상대 경로를 클릭해 파일 트리에서 해당 파일을 표시합니다.
- **tmux 기반 세션 복원:** 사용 가능한 경우 tmux 기반 원격 터미널 세션을 감지해 사용하고, 원격 터미널 상태를 복원 가능하게 유지합니다.
- **브라우저 프로젝트 접근:** server mode를 실행하고 웹 브라우저에서 프로젝트 작업 공간을 엽니다.
- **모바일 터미널 인계:** 브라우저 접근 모드에서 휴대폰 브라우저로 터미널 세션을 이어받아 모바일 상황에서도 계속 작업합니다.
```

- [ ] **Step 4: Add Japanese Magic Operations section**

In `README.ja.md`, insert this complete section after the last product feature bullet and before `## インストール`:

```markdown
## マジック操作

- **ターミナル入力へのバイナリ貼り付け:** ターミナル入力欄にバイナリのクリップボード内容を貼り付けると、一時ファイルを作成し、生成されたファイルパスを入力します。
- **ファイルツリーからターミナルへドラッグ:** ファイルツリーのファイルをターミナルへドラッグして、手入力せずに shell-safe なパスを挿入できます。
- **ファイルツリーのファイルをダブルクリック:** ファイルツリー内のファイルをダブルクリックすると、設定済みのエディタでそのファイルを直接開けます。
- **クリップボード連携のファイル操作:** `Ctrl+Shift+V` でクリップボードのテキストをファイルへ書き込み、`Ctrl+Shift+C` でファイルのテキストをシステムクリップボードへコピーできます。
- **ターミナルタブジャンプ:** アクティブなターミナルタブをダブルクリックすると、そのターミナルを最下部までスクロールします。
- **ターミナルからファイルツリーへのナビゲーション:** ターミナル出力で検出されたリポジトリ相対パスをクリックして、ファイルツリー内の該当ファイルを表示できます。
- **tmux ベースのセッション復元:** 利用可能な場合は tmux ベースのリモートターミナルセッションを検出して使用し、リモートターミナル状態を復元可能に保ちます。
- **ブラウザからのプロジェクトアクセス:** server mode を実行し、Web ブラウザからプロジェクトワークスペースを開けます。
- **モバイルでのターミナル引き継ぎ:** ブラウザアクセス可能モードでは、スマートフォンのブラウザからターミナルセッションを引き継ぎ、モバイル環境でも作業を続けられます。
```

- [ ] **Step 5: Verify README headings and entry presence**

Run:

```sh
rg -n "Magic Operations|魔法操作|매직 작업|マジック操作|Double-click file tree files|双击文件树文件|파일 트리 파일 두 번 클릭|ファイルツリーのファイルをダブルクリック" "README.md" "README.zh-CN.md" "README.ko.md" "README.ja.md"
```

Expected result:

```text
README.md:41:## Magic Operations
README.md:45:- **Double-click file tree files:** Double-click a file in the file tree to open that exact file in the configured editor.
README.zh-CN.md:41:## 魔法操作
README.zh-CN.md:45:- **双击文件树文件：** 双击文件树中的文件，直接用已配置的编辑器打开该文件。
README.ko.md:41:## 매직 작업
README.ko.md:45:- **파일 트리 파일 두 번 클릭:** 파일 트리에서 파일을 두 번 클릭하면 설정된 편집기에서 해당 파일을 바로 엽니다.
README.ja.md:41:## マジック操作
README.ja.md:45:- **ファイルツリーのファイルをダブルクリック:** ファイルツリー内のファイルをダブルクリックすると、設定済みのエディタでそのファイルを直接開けます。
```

Line numbers may differ if earlier README content changes; each file must have one section heading and one double-click entry.

### Task 4: Final Verification

**Files:**

- Verify: `src/system/open-app.ts`
- Verify: `src/system/open-app.test.ts`
- Verify: `src/web/components/file-tree/ProjectFileTree.tsx`
- Verify: `src/web/components/file-tree/ProjectFileTree.test.tsx`
- Verify: `README.md`
- Verify: `README.zh-CN.md`
- Verify: `README.ko.md`
- Verify: `README.ja.md`
- Verify: `docs/superpowers/specs/2026-06-29-file-tree-double-click-editor-readme-design.md`
- Verify: `docs/superpowers/plans/2026-06-29-file-tree-double-click-editor-readme.md`

- [ ] **Step 1: Run focused tests together**

Run:

```sh
bun run test -- src/system/open-app.test.ts src/web/components/file-tree/ProjectFileTree.test.tsx
```

Expected result: both focused test files pass.

- [ ] **Step 2: Run typecheck**

Run:

```sh
bun run typecheck
```

Expected result: typecheck exits successfully.

- [ ] **Step 3: Run full test suite**

Run:

```sh
bun run test
```

Expected result: full test suite exits successfully.

- [ ] **Step 4: Inspect changed files**

Run:

```sh
git diff --name-only
```

Expected result includes only files related to this task plus any pre-existing user changes that were already present before implementation:

```text
README.md
README.zh-CN.md
README.ko.md
README.ja.md
docs/superpowers/plans/2026-06-29-file-tree-double-click-editor-readme.md
docs/superpowers/specs/2026-06-29-file-tree-double-click-editor-readme-design.md
src/system/open-app.test.ts
src/system/open-app.ts
src/web/components/file-tree/ProjectFileTree.test.tsx
src/web/components/file-tree/ProjectFileTree.tsx
```

Pre-existing unrelated files currently visible in `git status` must not be reverted.

- [ ] **Step 5: Review final diff for scope**

Run:

```sh
git diff -- "README.md" "README.zh-CN.md" "README.ko.md" "README.ja.md" "src/system/open-app.ts" "src/system/open-app.test.ts" "src/web/components/file-tree/ProjectFileTree.tsx" "src/web/components/file-tree/ProjectFileTree.test.tsx" "docs/superpowers/specs/2026-06-29-file-tree-double-click-editor-readme-design.md" "docs/superpowers/plans/2026-06-29-file-tree-double-click-editor-readme.md"
```

Expected result: diff is limited to file tree double-click editor behavior, local editor file-path validation, README magic operation documentation, and the superpowers spec / plan documents.
