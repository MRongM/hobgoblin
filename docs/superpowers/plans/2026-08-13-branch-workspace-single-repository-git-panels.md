# Branch Workspace Single-Repository Git Panels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task in the current session. Do not dispatch subagents.

**Goal:** Make every branch-workspace Git view render and operate on one switchable member repository at a time.

**Architecture:** Keep the selected repository name as local state in `BranchWorkspaceFileArea`, because the selection is shared by five sibling Git views but must not enter the global repository store. Route Status, Changes, History, Local, and Remote through one fixed local member switcher and mount only the selected member panel.

**Tech Stack:** React 19, TypeScript strip-only mode, Tailwind CSS, Radix dropdown primitives, Zustand, Vitest/jsdom, Bun.

## Global Constraints

- Do not change global workspace, repository, or member-worktree selection when the local switcher changes.
- Preserve manifest order and independent repository Git boundaries.
- Keep Files rooted at the branch workspace directory.
- Use repo-alias imports with explicit `.ts`/`.tsx` extensions.
- Do not use enum declarations, runtime namespaces, parameter properties, or import aliases.
- Do not commit or create branches; the user did not authorize Git mutations.
- Preserve unrelated existing worktree changes.

---

### Task 1: Local member repository switcher

**Files:**

- Create: `src/web/components/repo-workspace/BranchWorkspaceMemberSwitcher.tsx`
- Create: `src/web/components/repo-workspace/BranchWorkspaceMemberSwitcher.test.tsx`

**Interfaces:**

- Consumes: `BranchWorkspaceFileAreaMember[]` from `branch-workspace-file-area-members.ts`.
- Produces: `BranchWorkspaceMemberSwitcher({ members, selectedRepositoryName, onSelect })`.

- [ ] **Step 1: Write the failing component test**

Mock the repository dropdown primitives following `WorkspaceRepositorySwitcher.test.tsx`, render one available and one unavailable member, and assert the current label, manifest order, unavailable marker, and callback:

```tsx
act(() =>
  root.render(
    <BranchWorkspaceMemberSwitcher
      members={[availableMember('api'), unavailableMember('web')]}
      selectedRepositoryName="api"
      onSelect={onSelect}
    />,
  ),
)
expect(container.querySelector('[aria-label="workspace.repositories"]')?.textContent).toContain('api')
expect(container.querySelector('[data-testid="branch-workspace-member-options"]')?.textContent).toContain('web')
act(() => optionNamed('web')?.click())
expect(onSelect).toHaveBeenCalledWith('web')
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `bun run test src/web/components/repo-workspace/BranchWorkspaceMemberSwitcher.test.tsx`

Expected: FAIL because `BranchWorkspaceMemberSwitcher.tsx` does not exist.

- [ ] **Step 3: Implement the switcher**

Use `DropdownMenu`, `Button`, `FolderGit2`, and `ChevronDown`. The trigger displays `selectedRepositoryName`, uses `workspace.repositories` as its accessible label, and is disabled when fewer than two members exist. Menu items call `onSelect(member.repositoryName)`, mark the current member with `aria-current="page"`, and append `workspace.repository-unavailable` when `member.ok` is false.

```tsx
import { ChevronDown, FolderGit2 } from 'lucide-react'
import type { BranchWorkspaceFileAreaMember } from '#/web/components/repo-workspace/branch-workspace-file-area-members.ts'
import { Button } from '#/web/components/ui/button.tsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#/web/components/ui/dropdown-menu.tsx'
import { cn } from '#/web/lib/cn.ts'
import { useT } from '#/web/stores/i18n.ts'

export function BranchWorkspaceMemberSwitcher({
  members,
  selectedRepositoryName,
  onSelect,
}: {
  members: BranchWorkspaceFileAreaMember[]
  selectedRepositoryName: string
  onSelect: (repositoryName: string) => void
}) {
  const t = useT()
  const selectedMember = members.find((member) => member.repositoryName === selectedRepositoryName)
  if (!selectedMember) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={members.length < 2}
          className="min-w-0 gap-1.5 px-1.5"
          aria-label={t('workspace.repositories')}
          title={selectedRepositoryName}
        >
          <FolderGit2 className="size-4 shrink-0" aria-hidden="true" />
          <span className="max-w-48 min-w-0 truncate text-xs font-medium">{selectedRepositoryName}</span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        data-testid="branch-workspace-member-options"
        align="start"
        className="max-h-72 w-max max-w-72 overflow-y-auto"
      >
        {members.map((member) => (
          <DropdownMenuItem
            key={member.repositoryName}
            aria-current={member.repositoryName === selectedRepositoryName ? 'page' : undefined}
            className={cn(!member.ok && 'opacity-60')}
            onSelect={() => onSelect(member.repositoryName)}
          >
            <FolderGit2 />
            <span className="min-w-0 truncate">{member.repositoryName}</span>
            {!member.ok ? (
              <span className="text-[10px] text-danger">{t('workspace.repository-unavailable')}</span>
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `bun run test src/web/components/repo-workspace/BranchWorkspaceMemberSwitcher.test.tsx`

Expected: PASS.

### Task 2: Render one repository-scoped Git panel

**Files:**

- Modify: `src/web/components/repo-workspace/BranchWorkspaceAggregatePanel.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceAggregatePanel.test.tsx`

**Interfaces:**

- Consumes: `selectedRepositoryName?: string | null` and `onSelectedRepositoryNameChange?: (repositoryName: string) => void`.
- Preserves: existing `workspace`, `kind`, and `onRevealPath` props.

- [ ] **Step 1: Add failing aggregate-panel tests**

Seed two resolved members (`api`, `web`), mock child Git panels as repository-id outputs, and assert:

```tsx
renderPanel({ kind: 'history', selectedRepositoryName: 'web' })
expect(container.querySelectorAll('[data-testid="history-member"]')).toHaveLength(1)
expect(container.querySelector('[data-testid="history-member"]')?.textContent).toBe('/workspace/web')

renderPanel({ kind: 'status' })
expect(container.querySelectorAll('[data-testid="status-member"]')).toHaveLength(2)
```

Also select an unresolved member and assert its existing reason is visible while no child Git panel is mounted.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `bun run test src/web/components/repo-workspace/BranchWorkspaceAggregatePanel.test.tsx`

Expected: FAIL because repository-scoped kinds still mount every member and expose no switcher.

- [ ] **Step 3: Split aggregate and selected rendering paths**

Define the repository-scoped kind guard:

```ts
type BranchWorkspaceAggregateKind = 'status' | 'changes' | 'history' | 'local' | 'remoteBranches'

function isRepositoryScopedKind(kind: BranchWorkspaceAggregateKind): kind is 'history' | 'local' | 'remoteBranches' {
  return kind === 'history' || kind === 'local' || kind === 'remoteBranches'
}
```

For every Git panel kind, resolve exactly one member by name (falling back to `members[0]`), render `BranchWorkspaceMemberSwitcher` in a fixed detail toolbar, and mount only that member's `ProjectStatusPanel`, `ProjectChangesPanel`, `ProjectHistoryPanel`, `ProjectLocalPanel`, or `ProjectRemoteBranchesPanel`. Keep changes and history reveal callbacks prefixed with the selected member name.

- [ ] **Step 4: Run aggregate and panel tests**

Run: `bun run test src/web/components/repo-workspace/BranchWorkspaceAggregatePanel.test.tsx src/web/components/repo-workspace/ProjectHistoryPanel.test.tsx src/web/components/repo-workspace/ProjectLocalPanel.test.tsx src/web/components/repo-workspace/ProjectRemoteBranchesPanel.test.tsx`

Expected: PASS.

### Task 3: Share selection across every Git tab

**Files:**

- Modify: `src/web/components/repo-workspace/BranchWorkspaceFileArea.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspacePane.test.tsx`

**Interfaces:**

- Produces: one local `selectedAggregateRepositoryName` state value shared by the three repository-scoped kinds.
- Passes: `selectedRepositoryName` and `onSelectedRepositoryNameChange` to `BranchWorkspaceAggregatePanel`.

- [ ] **Step 1: Extend the pane mock and write a failing state test**

Make the aggregate-panel mock expose its selected repository and a `select-web` button. Assert that selecting `web` in History persists through Local and Remote, then rerender with a different workspace id and assert the new first member is selected:

```tsx
act(() => historyTab.click())
act(() => container.querySelector<HTMLButtonElement>('[data-testid="select-web"]')?.click())
expect(selectedRepository()).toBe('web')
act(() => localTab.click())
expect(selectedRepository()).toBe('web')
act(() => remoteTab.click())
expect(selectedRepository()).toBe('web')
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `bun run test src/web/components/repo-workspace/BranchWorkspacePane.test.tsx`

Expected: FAIL because the file area does not own or pass repository selection.

- [ ] **Step 3: Implement local selection and fallback**

Initialize from `workspace.repositories[0]?.repositoryName ?? null`. When `workspace.id` changes or the selected member disappears, reset to the current first member. Pass the effective value and setter only to the aggregate panel; do not call Zustand actions.

```tsx
const firstRepositoryName = workspace.repositories[0]?.repositoryName ?? null
const [selectedAggregateRepositoryName, setSelectedAggregateRepositoryName] = useState(firstRepositoryName)

useEffect(() => {
  setSelectedAggregateRepositoryName((current) =>
    current && workspace.repositories.some((member) => member.repositoryName === current)
      ? current
      : firstRepositoryName,
  )
}, [firstRepositoryName, workspace.id, workspace.repositories])
```

- [ ] **Step 4: Run branch-workspace UI tests**

Run: `bun run test src/web/components/repo-workspace/BranchWorkspacePane.test.tsx src/web/components/repo-workspace/BranchWorkspaceAggregatePanel.test.tsx src/web/components/repo-workspace/BranchWorkspaceMemberSwitcher.test.tsx`

Expected: PASS.

### Task 4: Domain docs and full verification

**Files:**

- Modify: `CONTEXT.md`
- Modify: `docs/ui-conventions.md`

**Interfaces:** None.

- [ ] **Step 1: Update canonical wording**

Change `Branch workspace file area` and the matching UI convention so Files remains root-scoped and all five Git views target one locally selected member repository at a time without changing the active workspace context.

```md
**Branch workspace file area**:
The parent-scoped file surface opened for a selected branch workspace item. Its Files view browses the branch workspace root. Status, Changes, and History target one selected member worktree, while Local and Remote target that same selected member repository; switching this local target never changes the active workspace or member-worktree context. Selecting a member worktree instead opens that repository's ordinary file area.

- A selected branch workspace item's parent file area exposes Status, Files, Changes, History, Local, and Remote in that order. Its tab bar stays fixed while panel content scrolls. Files browses the branch workspace root. Status, Changes, History, Local, and Remote share a panel-local member repository switcher and mount only the selected member's Git surface, preserving each repository as an independent Git boundary without changing workspace navigation. Opening the parent file area selects Files, and its tab state never replaces a member repository's remembered file-area tab.
```

- [ ] **Step 2: Run formatting-sensitive and architecture checks**

Run: `bun run typecheck`

Expected: exit 0.

Run: `bun run check:architecture`

Expected: exit 0.

- [ ] **Step 3: Run the full test suite**

Run: `bun run test`

Expected: exit 0 with all tests passing.

- [ ] **Step 4: Review the final diff without committing**

Run: `git diff --check && git status --short && git diff -- CONTEXT.md docs/ui-conventions.md src/web/components/repo-workspace/BranchWorkspaceAggregatePanel.tsx src/web/components/repo-workspace/BranchWorkspaceFileArea.tsx src/web/components/repo-workspace/BranchWorkspaceMemberSwitcher.tsx`

Expected: no whitespace errors; only intended files plus pre-existing user changes are listed. Do not run `git add`, `git commit`, or branch commands.
