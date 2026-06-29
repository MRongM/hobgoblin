# File Tree Double-Click Editor and README Magic Operation Design

## Goal

让工作区文件树中的文件支持双击直接用已配置编辑器打开，并在所有根目录 README 的“Magic Operations / 魔法操作”说明中记录该能力。

## Scope

In scope:

- `src/web/components/file-tree/ProjectFileTree.tsx`
  - 文件节点双击打开具体文件。
  - 目录节点保持现有单击展开/折叠行为。
  - 右键“在编辑器中打开”对文件也打开具体文件，而不是父目录。
- `src/system/open-app.ts`
  - 本地 VS Code-family 编辑器后端允许打开存在的文件或目录。
  - 终端后端行为不变，仍只接收目录。
- Tests:
  - 文件树文件双击打开编辑器。
  - 文件右键打开编辑器的目标改为具体文件。
  - 目录右键打开编辑器仍打开目录。
  - 本地编辑器 CLI 接受文件路径。
- README files:
  - `README.md`
  - `README.zh-CN.md`
  - `README.ko.md`
  - `README.ja.md`

Out of scope:

- 不改变目录双击行为。
- 不让变更列表、历史详情等非文件树路径行双击打开编辑器。
- 不新增文件内容编辑器。
- 不修改 `docs/README.md` 或 `docs/index.html`。
- 不新增编辑器配置项。
- 不执行 git commit；项目指令要求用户未主动要求时不要执行提交。

## Selected Approach

采用“文件节点双击打开具体文件，目录行为不变”的方案。

文件树当前已经有右键“在编辑器中打开”能力，并通过 `openRepositoryEditor()` / `openRemoteRepositoryEditor()` 分发到本地或 SSH 远程编辑器。本次实现复用这条路径，只在文件树行上增加文件节点双击入口，并把文件节点的编辑器目标从父目录改为具体文件路径。

这个方案满足当前需求，改动面小，不引入新的路由或后端抽象，也不破坏目录浏览手感。

## Alternatives Considered

### Open parent directory on file double-click

改动最少，但用户双击文件后仍需要在编辑器里重新定位文件，不符合“文件双击直接打开”的目标。

### Open both files and directories on double-click

功能更宽，但目录双击打开编辑器会和当前文件树展开/折叠模型冲突，误触成本高。

### Add a new editor open API for files

可以显式区分文件与目录，但现有编辑器 CLI 本身接受路径。新增 API 只会扩大维护面，当前没有必要。

## Interaction Design

- 单击文件：保持现有选中行为。
- 单击目录：保持现有选中并展开/折叠行为。
- 双击文件：用已配置编辑器打开该文件。
- 双击目录：不新增行为，目录继续通过现有单击路径展开/折叠。
- 右键文件“Open in editor / 在编辑器中打开”：打开具体文件。
- 右键目录“Open in editor / 在编辑器中打开”：打开目录。

文件节点包含普通文件，以及指向文件的 symlink。虚拟节点和缺失目标不触发双击打开。

## Architecture

### Renderer

`ProjectFileTree.tsx` 继续负责文件树 UI 交互。

- `FileTreeRow` 增加 `onOpenInEditor` 回调。
- 行级 `onDoubleClick` 只在可打开文件节点上调用回调。
- `openNodeInEditor(repoId, node)` 继续封装本地 / 远程分发。
- `editorPathForNode(node)` 对文件返回 `node.absolutePath`，对目录返回 `node.absolutePath`。

### Server and System

服务端路由保持不变：

- Local: `/api/repo/open-editor`
- Remote: `/api/remote/open-editor`

本地编辑器后端 `openByAppCli()` 当前只允许目录。需要把校验函数从“可用目录”改成“可用编辑器路径”，接受存在的文件或目录，并继续拒绝非绝对路径、NUL 字符和不存在路径。

远程编辑器后端已经按 remote path 透传给 VS Code-family CLI 的 `--remote ssh-remote+alias <path>`，无需新增远程文件存在性检查。

## Data Flow

1. 用户双击文件树文件行。
2. `FileTreeRow` 判断节点是否可作为编辑器文件目标。
3. 调用 `openNodeInEditor(repoId, node)`。
4. 本地仓库调用 `openRepositoryEditor(node.absolutePath)`。
5. 远程仓库调用 `openRemoteRepositoryEditor(repoId, node.absolutePath)`。
6. 服务端按用户编辑器设置解析 VS Code / Cursor / Windsurf / auto。
7. 编辑器 CLI 接收文件路径并打开该文件。

## Error Handling

- 编辑器未安装、路径非法或 CLI 调用失败时，沿用现有 `{ ok, message }` 返回模型。
- 双击打开失败不静默吞掉，应通过现有 toast 体系提示错误消息。
- 本地路径校验只接受存在的绝对文件或目录。
- 远程路径沿用当前远程安全校验，不额外执行远程 stat。

## README Content

四份根目录 README 都在 Magic Operations 章节追加同一语义的条目：

- English: Double-click a file in the file tree to open that exact file in the configured editor.
- Simplified Chinese: 双击文件树中的文件，直接用已配置的编辑器打开该文件。
- Korean: 파일 트리에서 파일을 두 번 클릭하면 설정된 편집기에서 해당 파일을 바로 엽니다.
- Japanese: ファイルツリー内のファイルをダブルクリックすると、設定済みのエディタでそのファイルを直接開けます。

条目顺序保持一致，放在文件树拖拽到终端说明附近，使文件树相关能力集中呈现。

## Verification

Run focused tests:

```sh
bun run test -- src/web/components/file-tree/ProjectFileTree.test.tsx src/system/open-app.test.ts
```

Run project checks:

```sh
bun run typecheck
bun run test
```

Documentation checks:

```sh
rg -n "Double-click a file|双击文件树|두 번 클릭|ダブルクリック" "README.md" "README.zh-CN.md" "README.ko.md" "README.ja.md"
```

## Principles

- KISS: 复用现有编辑器打开通道，只增加文件树双击入口和必要路径校验。
- YAGNI: 不扩展到目录双击、路径列表双击或内置编辑器。
- DRY: 本地和远程继续共用 `openNodeInEditor()` 分发点；四份 README 保持同构内容。
- SOLID: UI 组件只处理交互，服务端路由继续处理打开请求，系统层负责具体编辑器 CLI 调用。
