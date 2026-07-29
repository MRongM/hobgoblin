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
import { Folder, FolderGit2, GitCompareArrows, Terminal, X } from 'lucide-react'
import {
  ProjectTerminalStatus,
  projectLocation,
  type ProjectSummary,
} from '#/web/components/repo-workspace/project-switcher-model.tsx'
import { useT } from '#/web/stores/i18n.ts'
import { EditorAppIcon, TerminalAppIcon } from '#/web/components/ExternalAppIcon/index.tsx'
import { useProjectExternalOpenActions } from '#/web/hooks/useProjectExternalOpenActions.ts'
import { useProjectInternalTerminalAction } from '#/web/hooks/useProjectInternalTerminalAction.ts'
import { useAssociatedTmuxCleanup } from '#/web/hooks/useAssociatedTmuxCleanup.tsx'
import { useHostTmuxInventory } from '#/web/hooks/useHostTmuxInventory.tsx'
import { WorkspaceItemContextMenu } from '#/web/components/repo-workspace/WorkspaceItemContextMenu.tsx'
import { Badge } from '#/web/components/ui/badge.tsx'
import {
  WorkspaceListItemActionDock,
  WorkspaceListItemFrame,
  WorkspaceListItemMenu,
  type WorkspaceListItemAction,
} from '#/web/components/repo-workspace/WorkspaceListItem.tsx'
import { parseRemoteRepoId } from '#/shared/remote-repo.ts'

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
  const remote = parseRemoteRepoId(project.id)
  const remotePrefix = remote ? `${remote.alias}:` : null
  const displayName =
    remotePrefix && !project.name.startsWith(remotePrefix) ? `${remotePrefix}${project.name}` : project.name
  const projectKind = project.isGitRepo ? 'git' : 'plain'
  const ProjectIcon = project.isGitRepo ? FolderGit2 : Folder
  const projectExternalActions = useProjectExternalOpenActions(project.id)
  const projectInternalTerminalAction = useProjectInternalTerminalAction(project.id)
  const tmuxCleanup = useAssociatedTmuxCleanup({
    projectRoot: project.id,
    itemPath: remote?.remotePath ?? project.id,
    disabled: false,
  })
  const hostTmuxInventory = useHostTmuxInventory({ projectRoot: project.id, disabled: false })
  const changeCountLabel =
    project.changeCount > 0 ? t('branch-status.worktree-dirty', { n: project.changeCount }) : null
  const editorAction: WorkspaceListItemAction | undefined = projectExternalActions.visible
    ? {
        id: 'editor',
        label: t('worktrees.open-in-editor-label'),
        ariaLabel: `${t('worktrees.open-in-editor-label')} ${displayName}`,
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
  const tmuxTerminalAction: WorkspaceListItemAction = {
    id: 'terminalTmux',
    label: t('terminal.new-with-tmux'),
    icon: <Terminal aria-hidden="true" />,
    disabled: projectInternalTerminalAction.disabled,
    busy: projectInternalTerminalAction.busy,
    onSelect: () => projectInternalTerminalAction.onSelect('tmux-if-available'),
  }
  const closeAction: WorkspaceListItemAction = {
    id: 'closeProject',
    label: t('repo-tabs.close-named', { name: displayName }),
    icon: <X aria-hidden="true" />,
    disabled: false,
    onSelect: () => onClose(project.id),
  }

  return (
    <>
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
        tmuxTerminal={{
          ...projectInternalTerminalAction,
          icon: <Terminal aria-hidden="true" />,
          onSelect: () => projectInternalTerminalAction.onSelect('tmux-if-available'),
        }}
        worktreeTerminalKeys={project.terminalWorktreeKeys}
        additionalActions={[
          ...(hostTmuxInventory.visible ? [hostTmuxInventory.contextAction] : []),
          ...(tmuxCleanup.visible ? [tmuxCleanup.contextAction] : []),
        ]}
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
                <WorkspaceListItemMenu
                  label={t('action.menu')}
                  groups={[
                    [tmuxTerminalAction, externalTerminalAction],
                    [closeAction],
                    ...(tmuxCleanup.visible ? [[tmuxCleanup.action]] : []),
                  ]}
                />
              }
            />
          }
        >
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span className="min-w-0 truncate text-sm font-medium leading-4">{displayName}</span>
            {project.changeCount > 0 ? (
              <Badge
                data-testid="project-change-count-badge"
                aria-label={changeCountLabel ?? undefined}
                title={changeCountLabel ?? undefined}
                variant="attention"
                className="h-4 shrink-0 gap-1 rounded-full px-1.5 text-[10px] font-semibold tabular-nums"
              >
                <GitCompareArrows size={10} aria-hidden="true" />
                {project.changeCount}
              </Badge>
            ) : null}
            <ProjectTerminalStatus
              terminalWorktreeKeys={project.terminalWorktreeKeys}
              branchWorkspaceRootId={project.branchWorkspaceRootId}
            />
          </span>
        </WorkspaceListItemFrame>
      </WorkspaceItemContextMenu>
      {hostTmuxInventory.dialog}
      {tmuxCleanup.dialog}
    </>
  )
}
