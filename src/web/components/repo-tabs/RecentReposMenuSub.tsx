import { History, Trash2 } from 'lucide-react'
import type { RepoSessionEntry } from '#/shared/remote-repo.ts'
import { tildify } from '#/web/lib/paths.ts'
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '#/web/components/ui/dropdown-menu.tsx'

interface Props {
  recentRepos: RepoSessionEntry[]
  labels: {
    openRecent: string
    noRecent: string
    clearRecent: string
  }
  onOpenRecent: (entry: RepoSessionEntry) => void
  onClearRecent: () => void
}

export function RecentReposMenuSub({ recentRepos, labels, onOpenRecent, onClearRecent }: Props) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="whitespace-nowrap">
        <History />
        {labels.openRecent}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-max">
        {recentRepos.length === 0 ? (
          <DropdownMenuItem disabled>{labels.noRecent}</DropdownMenuItem>
        ) : (
          <>
            {recentRepos.map((entry) => (
              <DropdownMenuItem key={entry.id} className="whitespace-nowrap" onSelect={() => onOpenRecent(entry)}>
                {recentRepoLabel(entry)}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="whitespace-nowrap" onSelect={onClearRecent}>
              <Trash2 />
              {labels.clearRecent}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

function recentRepoLabel(entry: RepoSessionEntry): string {
  return entry.kind === 'local'
    ? tildify(entry.id)
    : `${entry.ref.displayName} — ${entry.ref.alias}:${entry.ref.remotePath}`
}
