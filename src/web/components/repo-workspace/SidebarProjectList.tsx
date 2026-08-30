import { useContext } from 'react'
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
import {
  ExternalLink,
  Folder,
  FolderGit2,
  FolderSearch,
  FolderTree,
  GitCompareArrows,
  RefreshCw,
  Terminal,
  X,
} from 'lucide-react'
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
import { useWorkspaceConfigurationRecovery } from '#/web/hooks/useWorkspaceConfigurationRecovery.tsx'
import { WorkspaceItemContextMenu } from '#/web/components/repo-workspace/WorkspaceItemContextMenu.tsx'
import { Badge } from '#/web/components/ui/badge.tsx'
import {
  WorkspaceListItemActionDock,
  WorkspaceListItemFrame,
  WorkspaceListItemMenu,
  type WorkspaceListItemAction,
} from '#/web/components/repo-workspace/WorkspaceListItem.tsx'
import { parseRemoteRepoId } from '#/shared/remote-repo.ts'
import { useRepositoryCreationActions } from '#/web/hooks/useRepositoryCreationActions.tsx'
import { useReposStore } from '#/web/stores/repos/store.ts'
import {
  TerminalSessionContext,
  TerminalSessionReadContext,
} from '#/web/components/terminal/terminal-session-context.ts'
import { useBranchWorkspaceQuery } from '#/web/branch-workspace-queries.ts'
import { repoPlainWorkspacePath } from '#/web/stores/repos/capabilities.ts'
import {
  activateWorkspaceParentTerminalTarget,
  resolveWorkspaceParentTerminalTarget,
} from '#/web/components/repo-workspace/workspace-parent-terminal-navigation.ts'
import { fetchWorkspaceRepositories } from '#/web/workspace-repository-fetch.ts'
import {
  showWorkspaceRepositoryFetchError,
  showWorkspaceRepositoryFetchResult,
} from '#/web/components/repo-workspace/workspace-repository-fetch-feedback.ts'

const restrictToVerticalProjectList: Modifier = ({ transform }) => ({ ...transform, x: 0 })

interface SidebarProjectListProps {
  id: string
  projects: ProjectSummary[]
  activeRepoId: string
  onActivate: (id: string) => void
  onClose: (id: string) => void
  onReorder: (fromId: string, toId: string) => void
  onToggleFileArea?: () => void
  onOpenFileArea?: () => void
}

export function SidebarProjectList({
  id,
  projects,
  activeRepoId,
  onActivate,
  onClose,
  onReorder,
  onToggleFileArea,
  onOpenFileArea,
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
        <ul id={id} className="project-list-scrollbar max-h-72 overflow-y-auto px-1.5 pb-2">
          {projects.map((project) => (
            <SortableProjectRow
              key={project.id}
              project={project}
              active={project.id === activeRepoId}
              onActivate={onActivate}
              onClose={onClose}
              onToggleFileArea={onToggleFileArea}
              onOpenFileArea={onOpenFileArea}
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
  onToggleFileArea,
  onOpenFileArea,
}: {
  project: ProjectSummary
  active: boolean
  onActivate: (id: string) => void
  onClose: (id: string) => void
  onToggleFileArea?: () => void
  onOpenFileArea?: () => void
}) {
  const t = useT()
  const terminalReadContext = useContext(TerminalSessionReadContext)
  const terminalCommands = useContext(TerminalSessionContext)
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
  const repo = useReposStore((state) => state.repos[project.id])
  const workspace = useReposStore((state) => state.workspaceProjects[project.id])
  const activeWorkspaceContext = useReposStore((state) => state.workspaceActiveContextByRoot[project.id])
  const activateBranchWorkspace = useReposStore((state) => state.activateBranchWorkspace)
  const setDetailCollapsed = useReposStore((state) => state.setDetailCollapsed)
  const branchWorkspaceQuery = useBranchWorkspaceQuery(workspace?.configured ? project.id : '')
  const branchWorkspaces = branchWorkspaceQuery.data?.ok ? branchWorkspaceQuery.data.items : []
  const rescanWorkspace = useReposStore((state) => state.rescanWorkspace)
  const creation = useRepositoryCreationActions(repo, { forceDisabled: project.unavailable })
  const tmuxCleanup = useAssociatedTmuxCleanup({
    projectRoot: project.id,
    itemPath: remote?.remotePath ?? project.id,
    disabled: false,
  })
  const hostTmuxInventory = useHostTmuxInventory({ projectRoot: project.id, disabled: false })
  const workspaceRecovery = useWorkspaceConfigurationRecovery({
    rootId: project.id,
    workspace,
    disabled: project.unavailable,
  })
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
  const remoteAction: WorkspaceListItemAction = {
    id: 'remote',
    label: t('action.remote'),
    icon: <ExternalLink aria-hidden="true" />,
    disabled: projectExternalActions.remote.disabled,
    busy: projectExternalActions.remote.busy,
    visible: project.isGitRepo,
    onSelect: projectExternalActions.remote.onSelect,
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
  const detectWorkspaceRepositoriesAction: WorkspaceListItemAction = {
    id: 'detectWorkspaceRepositories',
    label: t('workspace.detect-repositories'),
    icon: <FolderSearch aria-hidden="true" />,
    disabled: project.unavailable,
    onSelect: () => rescanWorkspace(project.id),
  }
  const fetchAllRepositoriesAction: WorkspaceListItemAction = {
    id: 'fetchAllRepositories',
    label: t('workspace.branch-workspace.fetch-all'),
    icon: <RefreshCw aria-hidden="true" />,
    disabled: project.unavailable,
    visible: workspace?.configured === true && workspace.repositoryIds.length > 0,
    onSelect: async () => {
      try {
        showWorkspaceRepositoryFetchResult(t, await fetchWorkspaceRepositories(project.id))
      } catch (error) {
        showWorkspaceRepositoryFetchError(t, workspace?.repositoryIds.length ?? 0, error)
      }
    },
  }
  const handleActivate = () => {
    if (!workspace?.configured || !terminalReadContext || !terminalCommands) {
      onActivate(project.id)
      return
    }
    const target = resolveWorkspaceParentTerminalTarget({
      rootId: project.id,
      rootPath: repoPlainWorkspacePath(repo) ?? project.id,
      activeBranchWorkspaceId:
        activeWorkspaceContext?.kind === 'branch-workspace' ? activeWorkspaceContext.branchWorkspaceId : null,
      branchWorkspaces,
      worktreeSnapshot: terminalReadContext.worktreeSnapshot,
    })
    activateWorkspaceParentTerminalTarget(target, {
      activateOverview: () => onActivate(project.id),
      activateBranchWorkspace: (branchWorkspaceId) => activateBranchWorkspace(project.id, branchWorkspaceId),
      selectTerminal: terminalCommands.selectTerminal,
      focusTerminal: terminalCommands.focusTerminal,
      revealTerminal: () => setDetailCollapsed(false),
    })
  }
  const handleOpenFileArea = onOpenFileArea
    ? () => {
        onActivate(project.id)
        onOpenFileArea()
      }
    : undefined

  return (
    <>
      <WorkspaceItemContextMenu
        fileArea={
          handleOpenFileArea
            ? {
                disabled: project.unavailable,
                icon: <FolderTree aria-hidden="true" />,
                onSelect: handleOpenFileArea,
              }
            : undefined
        }
        editor={{
          ...projectExternalActions.editor,
          icon: <EditorAppIcon pref={projectExternalActions.editor.iconPref} />,
        }}
        remote={
          project.isGitRepo
            ? { ...projectExternalActions.remote, icon: <ExternalLink aria-hidden="true" /> }
            : undefined
        }
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
          ...(workspaceRecovery.visible ? [workspaceRecovery.contextAction] : []),
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
            onClick: handleActivate,
            onDoubleClick: onToggleFileArea,
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
                    project.isGitRepo
                      ? creation.items
                      : workspace
                        ? [fetchAllRepositoriesAction]
                        : [detectWorkspaceRepositoriesAction],
                    [remoteAction, tmuxTerminalAction, externalTerminalAction],
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
      {project.isGitRepo ? creation.dialogs : null}
      {hostTmuxInventory.dialog}
      {tmuxCleanup.dialog}
      {workspaceRecovery.dialog}
    </>
  )
}
