# Path Open In Editor With Line Target Design

## Goal

File paths shown in terminal output and plain text or Markdown-style output should support two related actions:

- Single click reveals the file in the file tree.
- Double click opens the file in the configured external editor.

When the path text includes a line or line and column suffix, the editor open action should position the editor at that target when the selected editor supports it.

## Scope

In scope:

- Recognize repository-relative path text in terminal output.
- Recognize repository-relative path text in plain text or Markdown-style rendered output.
- Preserve existing single-click file-tree reveal behavior.
- Add double-click external editor open behavior.
- Support `path:line` and `path:line:column`.
- Support local and remote repository editor opens through the existing editor preference.
- Keep editor command construction in the server/system layer.

Out of scope:

- Tracking shell current working directory after `cd`.
- Opening absolute local paths that are outside the active worktree.
- Opening URLs as files.
- Creating a built-in file preview or editor.
- Installing editor extensions or modifying editor configuration.
- Adding new package dependencies.

## Existing Context

Terminal output already has a renderer-side relative path link provider in `src/web/components/terminal/terminal-path-links.ts`. It recognizes path-like tokens and currently strips line and column suffixes before calling the reveal handler. The earlier terminal path design explicitly ignored line targets because that phase only revealed files in the file tree.

The file tree already opens local files in the configured editor on double click, and uses `openRepositoryEditor(path)` for local paths or `openRemoteRepositoryEditor(repoId, worktreePath)` for remote paths.

The editor backend is server-first:

- `src/web/repo-client.ts` and `src/web/remote-client.ts` call server routes.
- `src/server/modules/repo-write-paths.ts` reads editor settings and dispatches to the editor registry.
- `src/system/open-app.ts` validates local or remote editor targets and constructs VS Code-family CLI calls.

This feature should reuse that path instead of making the renderer know about editor CLI arguments.

## Recommended Approach

Add a small shared path target model and use it from both terminal and plain text path interactions.

The parser should return a structured target:

```ts
type FilePathTarget = {
  path: string
  line?: number
  column?: number
}
```

The renderer should use this model only to decide interaction intent:

- Single click calls the existing reveal flow with `target.path`.
- Double click resolves `target.path` against the active worktree root, then calls the existing editor client with the structured absolute target.

The server and system layers should own validation and editor command details. This keeps local filesystem safety and remote URI construction out of renderer code.

## Interaction Rules

Single click:

1. Parse the clicked text as a repository-relative path target.
2. If valid, reveal `target.path` in the file tree.
3. Ignore line and column for reveal.

Double click:

1. Parse the clicked text as a repository-relative path target.
2. Resolve `target.path` under the active local or remote worktree root.
3. If valid, open the resolved target in the configured external editor.
4. Use the line and column suffix when present.
5. Surface existing editor-open failures through the current toast or action-result path.

The file tree's own row behavior remains unchanged: file tree selection and reveal are single-click interactions, and file tree file rows can still use double click to open the selected node in the editor.

## Path Rules

Supported forms:

- `src/file.ts`
- `./src/file.ts`
- `docs/guide.md:12`
- `src/components/App.tsx:12:3`

Normalization should:

1. Remove surrounding punctuation commonly found in prose or tool output.
2. Remove leading `./`.
3. Parse optional `:line` and `:line:column` suffixes into positive integers.
4. Reject empty paths.
5. Reject URLs.
6. Reject absolute POSIX paths.
7. Reject Windows absolute paths.
8. Reject paths containing backslashes.
9. Reject `.` and `..` path segments.
10. Reject line or column values that are zero, negative, missing after a colon, or not safe integers.

The emitted `path` is always worktree-relative.

## Plain Text And Markdown Output

Plain text and Markdown-style output should get a lightweight path-link renderer instead of adding a Markdown dependency.

The renderer can split text nodes into ordinary text and path target spans. Each span should use normal inline text styling with the existing link color treatment. It should attach:

- `onClick` for reveal.
- `onDoubleClick` for editor open.

This keeps the feature small and avoids changing the app's Markdown rendering model. If a future rich Markdown renderer is added, the same path target parser can be reused.

## Terminal Output

Terminal output should continue using xterm link provider mechanics.

The current link provider should preserve line and column in its internal structured link target instead of returning only the normalized path. Activation should distinguish click count when xterm exposes the event details:

- Single activation reveals `target.path`.
- Double activation opens the editor target.

If xterm cannot reliably distinguish double click through the link provider event, implement the terminal double-click behavior with the narrowest reliable terminal DOM hook that maps the selected link text back through the same parser. The parser remains the source of truth either way.

## Editor API

Extend editor open input from a raw path string to a structured target while preserving current string callers.

Renderer client shape:

```ts
type EditorOpenTarget = string | {
  path: string
  line?: number
  column?: number
}
```

Local route body:

```json
{ "target": { "path": "/repo/src/app.ts", "line": 12, "column": 3 } }
```

For compatibility, the server should continue accepting the existing `{ "path": "/repo" }` body.

Remote route body:

```json
{ "repoId": "ssh-config://prod/srv/repo", "target": { "path": "/srv/repo/src/app.ts", "line": 12 } }
```

For compatibility, the server should continue accepting the existing `{ "repoId": "...", "worktreePath": "/srv/repo" }` body.

## Editor CLI Semantics

For local VS Code-family editors:

```text
code --goto /repo/src/app.ts:12:3
```

When no line is present, keep the existing path-only behavior:

```text
code /repo/src/app.ts
```

For remote VS Code-family editors:

```text
code --remote ssh-remote+<alias> --goto /srv/repo/src/app.ts:12:3
```

When no line is present, keep the existing remote path-only behavior:

```text
code --remote ssh-remote+<alias> /srv/repo/src/app.ts
```

Cursor and Windsurf should use the same VS Code-family CLI form because the existing opener already treats them as compatible editors. If an editor rejects `--goto`, return the existing command failure message rather than falling back silently.

## Error Handling

Invalid path candidates should not become actionable.

Editor open failures should reuse existing `ExecResult` handling:

- `error.invalid-path` for invalid local filesystem targets.
- `error.invalid-arguments` for invalid remote targets.
- `error.editor-not-installed` for missing editor CLI.
- `error.remote-editor-not-supported` when a selected editor has no remote opener.
- CLI stderr or short message for editor command failures.

Reveal failures should stay quiet and stable, matching the existing terminal reveal behavior. The UI should not create placeholder file tree nodes or switch to an error-only state.

## Testing

Add focused tests:

- Path target parser accepts `src/app.ts`, `./src/app.ts`, `src/app.ts:12`, and `src/app.ts:12:3`.
- Path target parser rejects URLs, absolute paths, Windows paths, backslashes, empty paths, and `..` segments.
- Parser rejects invalid line and column suffixes.
- Plain text path spans call reveal on click and editor open on double click.
- Terminal path activation still calls reveal for single click.
- Terminal double-click path action calls editor open with line and column when present.
- Local repo client and route preserve existing `path` input and accept structured targets.
- Remote repo client and route preserve existing `worktreePath` input and accept structured targets.
- `open-app` local CLI uses `--goto` only when a line target exists.
- `open-app` remote CLI uses `--remote ... --goto` only when a line target exists.

## Verification

Run:

```bash
bun run typecheck
bun run test
bun run check:architecture
```

Manual verification:

1. Open a local repository.
2. In terminal output, single-click `src/app.ts:12` and confirm the file tree reveals `src/app.ts`.
3. Double-click the same path and confirm the configured editor opens at line 12.
4. In a plain text or Markdown-style output area, repeat the same single-click and double-click checks.
5. Open a remote repository and confirm a remote path opens through the configured Remote SSH editor flow.

## Scope Check

This is a single interaction and editor-opening enhancement. It reuses the existing reveal flow, editor preference model, repo and remote editor routes, and VS Code-family editor backend. It adds one reusable parser and extends existing editor target inputs without introducing a broader renderer or editor abstraction.
