import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Folder, FolderGit2, X } from 'lucide-react'
import {
  ProjectTerminalStatus,
  projectLocation,
  type ProjectSummary,
} from '#/web/components/repo-workspace/project-switcher-model.tsx'
import { Button } from '#/web/components/ui/button.tsx'
import { useT } from '#/web/stores/i18n.ts'
import { cn } from '#/web/lib/cn.ts'
import { AsyncButton } from '#/web/components/AsyncButton.tsx'
import { Tip } from '#/web/components/Tip.tsx'
import { EditorAppIcon, TerminalAppIcon } from '#/web/components/ExternalAppIcon/index.tsx'
import { useProjectExternalOpenActions } from '#/web/hooks/useProjectExternalOpenActions.ts'

const restrictToVerticalProjectList: Modifier = ({ transform }) => ({ ...transform, x: 0 })

interface SidebarProjectListProps {
  id: string
  projects: ProjectSummary[]
  activeRepoId: string
  onActivate: (id: string) => void
  onClose: (id: string) => void
  onReorder: (fromId: string, toId: string) => void
}

export function SidebarProjectList({
  id,
  projects,
  activeRepoId,
  onActivate,
  onClose,
  onReorder,
}: SidebarProjectListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    onReorder(String(active.id), String(over.id))
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalProjectList]}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={projects.map((project) => project.id)} strategy={verticalListSortingStrategy}>
        <ul id={id} className="max-h-72 overflow-y-auto px-1.5 pb-2">
          {projects.map((project) => (
            <SortableProjectRow
              key={project.id}
              project={project}
              active={project.id === activeRepoId}
              onActivate={onActivate}
              onClose={onClose}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  )
}

function SortableProjectRow({
  project,
  active,
  onActivate,
  onClose,
}: {
  project: ProjectSummary
  active: boolean
  onActivate: (id: string) => void
  onClose: (id: string) => void
}) {
  const t = useT()
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: project.id,
  })
  const location = projectLocation(project.id)
  const projectKind = project.isGitRepo ? 'git' : 'plain'
  const ProjectIcon = project.isGitRepo ? FolderGit2 : Folder
  const projectExternalActions = useProjectExternalOpenActions(project.id)

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'group relative',
        isDragging && 'z-10 rounded-[var(--goblin-brand-radius-md,var(--radius-md))] bg-card shadow-sm',
      )}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        {...listeners}
        onClick={() => onActivate(project.id)}
        data-project-kind={projectKind}
        aria-current={active ? 'true' : undefined}
        title={project.unavailable ? t('repo-unavailable.title') : location}
        className={cn(
          'flex w-full min-w-0 cursor-grab items-center gap-2.5 rounded-[var(--goblin-brand-radius-md,var(--radius-md))] py-2 pl-2.5 pr-20 text-left transition-colors duration-100 active:cursor-grabbing',
          active ? 'bg-selected text-selected-foreground' : 'text-foreground hover:bg-tab-hover',
          project.unavailable && 'opacity-60',
          isDragging && 'cursor-grabbing',
        )}
      >
        <ProjectIcon
          className={cn('size-4 shrink-0', active ? 'text-selected-muted-foreground' : 'text-muted-foreground')}
          aria-hidden="true"
        />
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className="min-w-0 truncate text-[13px] font-medium leading-4">{project.name}</span>
          <ProjectTerminalStatus terminalWorktreeKeys={project.terminalWorktreeKeys} />
        </span>
      </button>
      {projectExternalActions.visible && (
        <div
          data-testid="project-row-external-actions"
          className="absolute right-8 top-1/2 z-10 flex -translate-y-1/2 items-center gap-0.5 opacity-0 focus-within:opacity-100 group-hover:opacity-100"
        >
          <Tip label={t('worktrees.open-in-editor-label')}>
            <span className="inline-flex">
              <AsyncButton
                type="button"
                variant="ghost"
                size="icon-xs"
                data-testid="project-editor-btn"
                loading={projectExternalActions.editor.busy}
                disabled={projectExternalActions.editor.disabled}
                aria-label={`${t('worktrees.open-in-editor-label')} ${project.name}`}
                onClick={(event) => {
                  event.stopPropagation()
                  return projectExternalActions.editor.onSelect()
                }}
              >
                {() => <EditorAppIcon pref={projectExternalActions.editor.iconPref} />}
              </AsyncButton>
            </span>
          </Tip>
          <Tip label={t('terminal.external')}>
            <span className="inline-flex">
              <AsyncButton
                type="button"
                variant="ghost"
                size="icon-xs"
                data-testid="project-external-terminal-btn"
                loading={projectExternalActions.externalTerminal.busy}
                disabled={projectExternalActions.externalTerminal.disabled}
                aria-label={`${t('terminal.external')} ${project.name}`}
                onClick={(event) => {
                  event.stopPropagation()
                  return projectExternalActions.externalTerminal.onSelect()
                }}
              >
                {() => <TerminalAppIcon pref={projectExternalActions.externalTerminal.iconPref} />}
              </AsyncButton>
            </span>
          </Tip>
        </div>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
        aria-label={t('repo-tabs.close-named', { name: project.name })}
        title={t('repo-tabs.close-named', { name: project.name })}
        onClick={(event) => {
          event.stopPropagation()
          onClose(project.id)
        }}
      >
        <X />
      </Button>
    </li>
  )
}
