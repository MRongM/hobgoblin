import { ChevronDown, FolderGit2 } from 'lucide-react'
import { Button } from '#/web/components/ui/button.tsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#/web/components/ui/dropdown-menu.tsx'
import { Badge } from '#/web/components/ui/badge.tsx'
import { cn } from '#/web/lib/cn.ts'
import { useT } from '#/web/stores/i18n.ts'

export interface BranchWorkspaceMemberOption {
  repositoryName: string
  available: boolean
  changeCount: number
}

export function BranchWorkspaceMemberSwitcher({
  members,
  selectedRepositoryName,
  onSelect,
}: {
  members: BranchWorkspaceMemberOption[]
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
          {selectedMember.changeCount > 0 ? (
            <ChangeCountBadge
              count={selectedMember.changeCount}
              testId="branch-workspace-selected-member-change-count"
            />
          ) : null}
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
            className={cn(!member.available && 'opacity-60')}
            onSelect={() => onSelect(member.repositoryName)}
          >
            <FolderGit2 />
            <span className="min-w-0 truncate">{member.repositoryName}</span>
            {!member.available ? (
              <span className="text-[10px] text-danger">{t('workspace.repository-unavailable')}</span>
            ) : null}
            {member.changeCount > 0 ? (
              <ChangeCountBadge count={member.changeCount} testId="branch-workspace-member-change-count" />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ChangeCountBadge({ count, testId }: { count: number; testId: string }) {
  const t = useT()
  const label = t('branch-status.worktree-dirty', { n: count })
  return (
    <Badge
      data-testid={testId}
      variant="attention"
      aria-label={label}
      title={label}
      className="ml-auto font-mono font-normal tabular-nums"
    >
      {count}
    </Badge>
  )
}
