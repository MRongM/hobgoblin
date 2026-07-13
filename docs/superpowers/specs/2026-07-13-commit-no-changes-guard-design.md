# Commit No-Changes Guard Design

## Goal

当用户点击分支行菜单中的 Commit 时，若当前 worktree 没有未提交的变更，不打开提交框，改为用 toast 通知用户"没有内容可提交"。

## Architecture

### 触发路径

```
BranchRow (菜单按钮)
  → useBranchActionItems → writeActions.mainItems[commit].onSelect
    → useBranchWriteActions → inlineCommitDraftActions.openDraft(...)
```

### 改动点

**`src/web/hooks/useBranchWriteActions.tsx`**

`commit` item 的 `onSelect` 在调用 `openDraft` 前增加检查：

```ts
onSelect: () => {
  if (!worktreePath) return
  const worktreeStatus = repo.data.status.find((s) => s.path === worktreePath)
  if (!worktreeStatus || worktreeStatus.entries.length === 0) {
    toast.info(t('action.commit-no-changes'))
    return
  }
  inlineCommitDraftActions.openDraft(repo.id, worktreePath)
},
```

**i18n 文件**（en / zh / ja / ko）

新增键 `'action.commit-no-changes'`，插入在 `'action.commit-title'` 之后：

| 文件 | 译文 |
|------|------|
| `en.ts` | `'No changes to commit.'` |
| `zh.ts` | `'没有待提交的改动。'` |
| `ja.ts` | `'コミットすべき変更はありません。'` |
| `ko.ts` | `'커밋할 변경 사항이 없습니다.'` |

> 复用了 `status.clean-body` 相同语义的现有译文（各语言已有对应文案作参考）。

## Data Flow

`repo.data.status: WorktreeStatus[]` 每项含 `path: string` 和 `entries: StatusEntry[]`。

匹配当前 branch 的 `worktreePath`，`entries.length === 0` 即为无变更。

## Error Handling

- `worktreePath` 为 null/undefined 时，原有 `!hasWorktree` disabled 逻辑已阻止按钮，无需额外处理。
- `status` 中找不到对应 worktree 条目（`find` 返回 undefined）时，视同 entries 为空，同样触发 toast，不打开提交框。

## Testing

修改 `src/web/hooks/useBranchWriteActions.test.tsx`：

- 新增：status entries 为空时，`onSelect` 触发 toast 而不调用 `openDraft`
- 新增：status entries 非空时，`onSelect` 正常调用 `openDraft`，不触发 toast
- 保持：已有测试通过
