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
import { Folder, FolderGit2, Terminal, X } from 'lucide-react'
import {
  ProjectTerminalStatus,
  projectLocation,
  type ProjectSummary,
} from '#/web/components/repo-workspace/project-switcher-model.tsx'
import { useT } from '#/web/stores/i18n.ts'
import { EditorAppIcon, TerminalAppIcon } from '#/web/components/ExternalAppIcon/index.tsx'
import { useProjectExternalOpenActions } from '#/web/hooks/useProjectExternalOpenActions.ts'
import { useProjectInternalTerminalAction } from '#/web/hooks/useProjectInternalTerminalAction.ts'
import { WorkspaceItemContextMenu } from '#/web/components/repo-workspace/WorkspaceItemContextMenu.tsx'
import {
  WorkspaceListItemActionDock,
  WorkspaceListItemFrame,
  WorkspaceListItemMenu,
  type WorkspaceListItemAction,
} from '#/web/components/repo-workspace/WorkspaceListItem.tsx'

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
  const projectInternalTerminalAction = useProjectInternalTerminalAction(project.id)
  const editorAction: WorkspaceListItemAction | undefined = projectExternalActions.visible
    ? {
        id: 'editor',
        label: t('worktrees.open-in-editor-label'),
        ariaLabel: `${t('worktrees.open-in-editor-label')} ${project.name}`,
        icon: <EditorAppIcon pref={projectExternalActions.editor.iconPref} />,
        disabled: projectExternalActions.editor.disabled,
        busy: projectExternalActions.editor.busy,
        onSelect: projectExternalActions.editor.onSelect,
      }
    : undefined
  const internalTerminalAction: WorkspaceListItemAction = {
    id: 'terminal',
    label: t('terminal.internal'),
    icon: <Terminal aria-hidden="true" />,
    disabled: projectInternalTerminalAction.disabled,
    busy: projectInternalTerminalAction.busy,
    onSelect: projectInternalTerminalAction.onSelect,
  }
  const externalTerminalAction: WorkspaceListItemAction = {
    id: 'externalTerminal',
    label: t('terminal.external'),
    icon: <TerminalAppIcon pref={projectExternalActions.externalTerminal.iconPref} />,
    disabled: projectExternalActions.externalTerminal.disabled,
    busy: projectExternalActions.externalTerminal.busy,
    visible: projectExternalActions.visible,
    onSelect: projectExternalActions.externalTerminal.onSelect,
  }
  const closeAction: WorkspaceListItemAction = {
    id: 'closeProject',
    label: t('repo-tabs.close-named', { name: project.name }),
    icon: <X aria-hidden="true" />,
    disabled: false,
    onSelect: () => onClose(project.id),
  }

  return (
    <WorkspaceItemContextMenu
      editor={{
        ...projectExternalActions.editor,
        icon: <EditorAppIcon pref={projectExternalActions.editor.iconPref} />,
      }}
      externalTerminal={{
        ...projectExternalActions.externalTerminal,
        icon: <TerminalAppIcon pref={projectExternalActions.externalTerminal.iconPref} />,
      }}
      internalTerminal={{ ...projectInternalTerminalAction, icon: <Terminal aria-hidden="true" /> }}
      worktreeTerminalKeys={project.terminalWorktreeKeys}
    >
      <WorkspaceListItemFrame
        size="project"
        itemRef={setNodeRef}
        itemStyle={{ transform: CSS.Transform.toString(transform), transition }}
        selected={active}
        unavailable={project.unavailable}
        dragging={isDragging}
        leadingIcon={
          <ProjectIcon
            className={active ? 'size-4 text-selected-muted-foreground' : 'size-4 text-muted-foreground'}
            aria-hidden="true"
          />
        }
        dragHandle={{
          label: t('workspace.repository-reorder'),
          setActivatorNodeRef,
          props: { ...attributes, ...listeners },
        }}
        buttonProps={{
          onClick: () => onActivate(project.id),
          'data-project-kind': projectKind,
          'aria-current': active ? 'page' : undefined,
          title: project.unavailable ? t('repo-unavailable.title') : location,
        }}
        actions={
          <WorkspaceListItemActionDock
            editor={editorAction}
            internalTerminal={internalTerminalAction}
            moreMenu={
              <WorkspaceListItemMenu label={t('action.menu')} groups={[[externalTerminalAction], [closeAction]]} />
            }
          />
        }
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className="min-w-0 truncate text-[13px] font-medium leading-4">{project.name}</span>
          <ProjectTerminalStatus
            terminalWorktreeKeys={project.terminalWorktreeKeys}
            branchWorkspaceRootId={project.branchWorkspaceRootId}
          />
        </span>
      </WorkspaceListItemFrame>
    </WorkspaceItemContextMenu>
  )
}
