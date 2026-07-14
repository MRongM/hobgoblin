import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ClipboardEvent, CSSProperties, DragEvent, KeyboardEvent, MouseEvent, ReactNode } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  Download,
  File,
  FileCog,
  FilePlus,
  FileSymlink,
  Folder,
  FolderPlus,
  FolderOpen,
  HardDrive,
  ListCollapse,
  Pencil,
  RefreshCw,
  Terminal,
  Trash2,
  Upload,
} from 'lucide-react'
import { toast } from 'sonner'
import { useStoreWithEqualityFn } from 'zustand/traditional'
import {
  GOBLIN_FILE_PATHS_MIME,
  parseGoblinFilePathDragPayload,
  type RepoFileTransferSource,
  type RepoFileTreeEntry,
  type RepoFileTreeResult,
} from '#/shared/file-tree.ts'
import { isRemoteRepoId } from '#/shared/rpc.ts'
import { openRemoteRepositoryEditor, openRemoteRepositoryTerminal } from '#/web/remote-client.ts'
import {
  createRepositoryFileTreeFile,
  createRepositoryFileTreeDirectory,
  deleteRepositoryFileTreeEntries,
  getRepositoryFileTree,
  getRepositoryWorktreeBootstrapPreview,
  initializeRepositoryWorktreeBootstrapConfig,
  moveRepositoryFileTreeEntries,
  openRepositoryEditor,
  openRepositoryTerminal,
  readRepositoryFileTreeBinaryFile,
  renameRepositoryFileTreeEntry,
  replaceRepositoryFileTreeBinaryFile,
  transferRepositoryFiles,
  exportRepositoryFilesToLocalDirectory,
} from '#/web/repo-client.ts'
import { Button } from '#/web/components/ui/button.tsx'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#/web/components/ui/alert-dialog.tsx'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '#/web/components/ui/context-menu.tsx'
import { Input } from '#/web/components/ui/input.tsx'
import { cn } from '#/web/lib/cn.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { repoPlainWorkspacePath } from '#/web/stores/repos/capabilities.ts'
import { useT } from '#/web/stores/i18n.ts'
import {
  buildFileTreeStatusIndex,
  buildGoblinFilePathDragPayload,
  mergeDirectoryEntries,
  nextFileTreeSelection,
  parentDirectoryPath,
  resolveFileTreePasteTarget,
  visibleFileTreeNodeIds,
  type FileTreeNode,
  type FileTreeSelectionState,
  type FileTreeTone,
} from '#/web/components/file-tree/model.ts'
import {
  isPrimaryShortcut,
  readInternalFileTreeClipboard,
  sourceFromClipboardEvent,
  sourceFromDroppedFiles,
  sourceFromSystemClipboardPaths,
  writeInternalFileTreeClipboard,
} from '#/web/components/file-tree/clipboard.ts'
import { resolveDropTargetDirectory } from '#/web/components/file-tree/drop-target.ts'
import type { WorktreeStatus } from '#/web/types.ts'
import {
  chooseFileTreeDownloadDirectory,
  chooseFileTreeUploadFiles,
  hasNativeFilePicker,
  openInFinder,
  readFileTreeClipboardFile,
  readSystemClipboardFilePaths,
  writeFileTreeClipboardFile,
} from '#/web/app-shell-client.ts'
import { useRuntimeFileAreaSettings } from '#/web/runtime-settings-file-area.ts'
import { useRuntimeChromeSettings } from '#/web/runtime-settings-chrome.ts'
import { fileTreeClipboardMaxBytes as fileTreeClipboardMaxBytesFromMb } from '#/shared/file-tree-clipboard.ts'

const ROOT_DIR = ''

interface DirectoryState {
  entries?: RepoFileTreeEntry[]
  loading: boolean
  error: string | null
}

type CreateEntryKind = 'file' | 'directory'

interface CreateEntryTarget {
  parentRelativePath: string
  parentAbsolutePath: string
}

interface ProjectFileTreeView {
  exists: boolean
  isGitRepo: boolean
  worktreePath: string | null
  status: WorktreeStatus[]
}

type FileTreeUndoAction =
  | {
      kind: 'rename'
      oldName: string
      oldPath: string
      newPath: string
      oldRelativePath: string
      newRelativePath: string
    }
  | {
      kind: 'move'
      entries: Array<{
        originalPath: string
        movedPath: string
        originalRelativePath: string
        movedRelativePath: string
        originalParentDirPath: string
      }>
    }
  | {
      kind: 'paste'
      paths: string[]
      relativePaths: string[]
    }
  | {
      kind: 'replaceBinaryFile'
      path: string
      relativePath: string
      previousBytesBase64: string
    }

export interface FileTreeRevealRequest {
  id: number
  relativePath: string
}

type FileTreeToolbarHeight = 'compact' | 'detail'
type WorktreeBootstrapConfigStatus = 'idle' | 'loading' | 'missing' | 'present' | 'error'

export function ProjectFileTree({
  repoId,
  revealRequest,
  toolbarHeight = 'compact',
}: {
  repoId: string
  revealRequest?: FileTreeRevealRequest | null
  toolbarHeight?: FileTreeToolbarHeight
}) {
  const t = useT()
  const { fileTreeFontSize, fileTreeClipboardMaxBytesMb } = useRuntimeFileAreaSettings()
  const fileTreeClipboardMaxBytes = fileTreeClipboardMaxBytesFromMb(fileTreeClipboardMaxBytesMb)
  const view = useProjectFileTreeView(repoId)
  const worktreePath = view.worktreePath
  const activeWorktreeRef = useRef<string | null>(worktreePath)
  const directoriesRef = useRef<Record<string, DirectoryState>>({})
  const revealRequestRef = useRef<number | null>(null)
  const undoStackRef = useRef<FileTreeUndoAction[]>([])
  const undoPendingRef = useRef(false)
  const [directories, setDirectories] = useState<Record<string, DirectoryState>>({})
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() => new Set())
  const [selection, setSelection] = useState<FileTreeSelectionState>(() => ({ selected: new Set(), anchor: null }))
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null)
  const [contextNode, setContextNode] = useState<FileTreeNode | null>(null)
  const [contextOpen, setContextOpen] = useState(false)
  const [renameNode, setRenameNode] = useState<FileTreeNode | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [renamePending, setRenamePending] = useState(false)
  const [renameError, setRenameError] = useState<string | null>(null)
  const [deleteTargets, setDeleteTargets] = useState<FileTreeNode[]>([])
  const [deletePending, setDeletePending] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [createEntryTarget, setCreateEntryTarget] = useState<CreateEntryTarget | null>(null)
  const [createEntryKind, setCreateEntryKind] = useState<CreateEntryKind>('directory')
  const [createEntryName, setCreateEntryName] = useState('')
  const [createEntryPending, setCreateEntryPending] = useState(false)
  const [createEntryError, setCreateEntryError] = useState<string | null>(null)
  const [bootstrapConfigStatus, setBootstrapConfigStatus] = useState<WorktreeBootstrapConfigStatus>('idle')
  const [initializingBootstrapConfig, setInitializingBootstrapConfig] = useState(false)

  useEffect(() => {
    activeWorktreeRef.current = worktreePath
  }, [worktreePath])

  useEffect(() => {
    directoriesRef.current = directories
  }, [directories])

  useEffect(() => {
    if (!view.exists || !view.isGitRepo || !worktreePath) {
      setBootstrapConfigStatus('idle')
      return
    }

    const controller = new AbortController()
    setBootstrapConfigStatus('loading')
    void getRepositoryWorktreeBootstrapPreview(repoId, worktreePath, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return
        setBootstrapConfigStatus(result.ok ? (result.preview.hasConfig ? 'present' : 'missing') : 'error')
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        console.warn('[file-tree] worktree bootstrap config preview failed', err)
        setBootstrapConfigStatus('error')
      })
    return () => controller.abort()
  }, [repoId, view.exists, view.isGitRepo, worktreePath])

  const loadDirectory = useCallback(
    async (relativePath: string, absolutePath: string, signal?: AbortSignal): Promise<RepoFileTreeResult | null> => {
      if (!worktreePath) return null
      setDirectories((current) => {
        const next = {
          ...current,
          [relativePath]: { ...current[relativePath], loading: true, error: null },
        }
        directoriesRef.current = next
        return next
      })
      const result = await getRepositoryFileTree(repoId, worktreePath, absolutePath, signal)
      if (signal?.aborted || activeWorktreeRef.current !== worktreePath) return null
      setDirectories((current) => {
        const next = {
          ...current,
          [relativePath]: result.ok
            ? { entries: result.entries, loading: false, error: null }
            : { ...current[relativePath], loading: false, error: result.message },
        }
        directoriesRef.current = next
        return next
      })
      return result
    },
    [repoId, worktreePath],
  )

  useEffect(() => {
    directoriesRef.current = {}
    revealRequestRef.current = null
    undoStackRef.current = []
    undoPendingRef.current = false
    setDirectories({})
    setExpandedDirs(new Set())
    setSelection({ selected: new Set(), anchor: null })
    setFocusedNodeId(null)
    setContextNode(null)
    setContextOpen(false)
    setRenameNode(null)
    setRenameValue('')
    setRenamePending(false)
    setRenameError(null)
    setDeleteTargets([])
    setDeletePending(false)
    setDeleteError(null)
    setCreateEntryTarget(null)
    setCreateEntryKind('directory')
    setCreateEntryName('')
    setCreateEntryPending(false)
    setCreateEntryError(null)
    if (!worktreePath) return
    const controller = new AbortController()
    void loadDirectory(ROOT_DIR, worktreePath, controller.signal)
    return () => controller.abort()
  }, [loadDirectory, worktreePath])

  const statusIndex = useMemo(
    () => (worktreePath ? buildFileTreeStatusIndex(worktreePath, view.status) : null),
    [view.status, worktreePath],
  )
  const rootNodes = useMemo(() => {
    if (!worktreePath || !statusIndex) return []
    const makeNodes = (directoryRelativePath: string): FileTreeNode[] => {
      const entries = directories[directoryRelativePath]?.entries ?? []
      return mergeDirectoryEntries(worktreePath, directoryRelativePath, entries, statusIndex).map((node) => {
        const expanded = expandedDirs.has(node.id)
        if (!isExpandableNode(node)) return node
        return {
          ...node,
          expanded,
          children: expanded && directories[node.relativePath]?.entries ? makeNodes(node.relativePath) : undefined,
        }
      })
    }
    return makeNodes(ROOT_DIR)
  }, [directories, expandedDirs, statusIndex, worktreePath])

  const flatNodes = useMemo(() => flattenNodes(rootNodes), [rootNodes])
  const flatNodeById = useMemo(() => new Map(flatNodes.map((node) => [node.id, node])), [flatNodes])
  const flatNodeByAbsolutePath = useMemo(() => new Map(flatNodes.map((node) => [node.absolutePath, node])), [flatNodes])
  const visibleIds = useMemo(() => visibleFileTreeNodeIds(rootNodes), [rootNodes])
  const rootState = directories[ROOT_DIR]
  const canUploadFiles = hasNativeFilePicker()

  const revealRelativePath = useCallback(
    async (relativePath: string, options: { requestId?: number; cancelled?: () => boolean } = {}): Promise<void> => {
      if (!worktreePath) return
      const activeWorktreePath = worktreePath

      async function ensureDirectory(relativePath: string, absolutePath: string): Promise<RepoFileTreeEntry[] | null> {
        const state = directoriesRef.current[relativePath]
        if (state?.entries) return state.entries
        const result = await loadDirectory(relativePath, absolutePath)
        if (!result?.ok) return null
        return result.entries
      }

      let entries = await ensureDirectory(ROOT_DIR, activeWorktreePath)
      if (!entries) return

      for (const directoryRelativePath of parentRelativePaths(relativePath)) {
        if (options.cancelled?.()) return
        const entry = findEntry(entries, directoryRelativePath)
        if (!entry) return
        setExpandedDirs((current) => new Set(current).add(entry.relativePath))
        entries = await ensureDirectory(entry.relativePath, entry.absolutePath)
        if (!entries) return
      }

      const finalEntry = findEntry(entries, relativePath)
      const targetId = finalEntry ? finalEntry.relativePath : `virtual:${relativePath}`
      if (options.cancelled?.()) return
      if (options.requestId !== undefined) revealRequestRef.current = options.requestId
      setSelection({ selected: new Set([targetId]), anchor: targetId })
      setFocusedNodeId(targetId)
      scheduleFileTreeNodeScroll(targetId)
    },
    [loadDirectory, worktreePath],
  )

  useEffect(() => {
    if (!worktreePath || !revealRequest) return
    const request = revealRequest
    if (revealRequestRef.current === request.id) return
    revealRequestRef.current = request.id
    let cancelled = false
    void revealRelativePath(request.relativePath, { requestId: request.id, cancelled: () => cancelled })
    return () => {
      cancelled = true
    }
  }, [revealRelativePath, revealRequest, worktreePath])

  const canOpenLocally = !!worktreePath && !isRemoteRepoId(repoId)

  const toggleDirectory = useCallback(
    (node: FileTreeNode) => {
      if (!isExpandableNode(node)) return
      const willExpand = !expandedDirs.has(node.id)
      setExpandedDirs((current) => {
        const next = new Set(current)
        if (next.has(node.id)) next.delete(node.id)
        else next.add(node.id)
        return next
      })
      const state = directories[node.relativePath]
      if (willExpand && !state?.entries && !state?.loading) {
        void loadDirectory(node.relativePath, node.absolutePath)
      }
    },
    [directories, expandedDirs, loadDirectory],
  )

  const handleSelect = useCallback(
    (node: FileTreeNode, event: MouseEvent) => {
      setSelection((current) =>
        nextFileTreeSelection(current, visibleIds, node.id, {
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          shiftKey: event.shiftKey,
        }),
      )
    },
    [visibleIds],
  )

  const handleDragStart = useCallback(
    (node: FileTreeNode, event: DragEvent) => {
      const selectedIds = selection.selected.has(node.id) ? selection.selected : new Set([node.id])
      const targets = Array.from(selectedIds)
        .map((id) => flatNodeById.get(id))
        .filter((target): target is FileTreeNode => !!target)
      const paths = targets.map((target) => target.absolutePath)
      event.dataTransfer.setData(GOBLIN_FILE_PATHS_MIME, buildGoblinFilePathDragPayload(paths))
      event.dataTransfer.effectAllowed = 'copyMove'

      const exportable = exportableFileNodes(targets)
      if (exportable.length === 0) {
        event.dataTransfer.setData('text/plain', paths.join(' '))
      }
    },
    [flatNodeById, selection.selected],
  )

  const activateContextNode = useCallback(
    (node: FileTreeNode) => {
      setFocusedNodeId(node.id)
      setContextNode(node)
      if (!selection.selected.has(node.id)) {
        setSelection({ selected: new Set([node.id]), anchor: node.id })
      }
    },
    [selection.selected],
  )

  const handleContextMenu = useCallback(
    (node: FileTreeNode, _event: MouseEvent) => {
      activateContextNode(node)
    },
    [activateContextNode],
  )

  const handleContextMenuOpenChange = useCallback(
    (node: FileTreeNode, open: boolean) => {
      setContextOpen(open)
      if (open) activateContextNode(node)
    },
    [activateContextNode],
  )

  const selectedPaths = useCallback(() => {
    return Array.from(selection.selected)
      .map((id) => flatNodeById.get(id)?.absolutePath)
      .filter((path): path is string => !!path)
  }, [flatNodeById, selection.selected])

  const contextTargets = useCallback(
    (node: FileTreeNode) => {
      if (!selection.selected.has(node.id)) return [node]
      const targets = Array.from(selection.selected)
        .map((id) => flatNodeById.get(id))
        .filter((target): target is FileTreeNode => !!target)
      return targets.length > 0 ? targets : [node]
    },
    [flatNodeById, selection.selected],
  )

  const runDownload = useCallback(
    async (nodes: FileTreeNode[]) => {
      if (!worktreePath) return
      const files = exportableFileNodes(nodes)
      if (files.length === 0) return
      const targetDirPath = await chooseFileTreeDownloadDirectory()
      if (!targetDirPath) return
      await exportRepositoryFilesToLocalDirectory({
        repoId,
        worktreePath,
        targetDirPath,
        paths: files.map((file) => file.absolutePath),
      })
    },
    [repoId, worktreePath],
  )

  const realSelectedNodes = useMemo(
    () =>
      Array.from(selection.selected)
        .map((id) => flatNodeById.get(id))
        .filter((node): node is FileTreeNode => !!node && isWritableNode(node)),
    [flatNodeById, selection.selected],
  )

  const refreshDirectoryForNode = useCallback(
    async (node: FileTreeNode) => {
      if (!worktreePath) return
      await loadDirectory(parentRelativePathForNode(node), parentAbsolutePathForNode(worktreePath, node))
    },
    [loadDirectory, worktreePath],
  )

  const clearCachedRelativePaths = useCallback((relativePaths: string[]) => {
    setDirectories((current) => {
      const next = { ...current }
      for (const relativePath of relativePaths) {
        for (const key of Object.keys(next)) {
          if (key === relativePath || key.startsWith(`${relativePath}/`)) delete next[key]
        }
      }
      directoriesRef.current = next
      return next
    })
    setExpandedDirs((current) => {
      const next = new Set(current)
      for (const relativePath of relativePaths) {
        for (const key of Array.from(next)) {
          if (key === relativePath || key.startsWith(`${relativePath}/`)) next.delete(key)
        }
      }
      return next
    })
  }, [])

  const clearCachedDescendants = useCallback(
    (nodes: FileTreeNode[]) => {
      clearCachedRelativePaths(nodes.map((node) => node.relativePath))
    },
    [clearCachedRelativePaths],
  )

  const refreshDirectoryPath = useCallback(
    async (dirPath: string) => {
      if (!worktreePath) return
      await loadDirectory(relativeDirPath(worktreePath, dirPath), dirPath)
    },
    [loadDirectory, worktreePath],
  )

  const refreshParentDirectoryForPath = useCallback(
    async (absolutePath: string) => {
      await refreshDirectoryPath(parentDirectoryPath(absolutePath))
    },
    [refreshDirectoryPath],
  )

  const rootCreateEntryTarget = useCallback((): CreateEntryTarget | null => {
    if (!worktreePath) return null
    return { parentRelativePath: ROOT_DIR, parentAbsolutePath: worktreePath }
  }, [worktreePath])

  const createEntryTargetForNode = useCallback(
    (node: FileTreeNode | null): CreateEntryTarget | null => {
      if (!worktreePath || !node) return rootCreateEntryTarget()
      if (isExpandableNode(node)) {
        return { parentRelativePath: node.relativePath, parentAbsolutePath: node.absolutePath }
      }
      return {
        parentRelativePath: parentRelativePathForNode(node),
        parentAbsolutePath: parentAbsolutePathForNode(worktreePath, node),
      }
    },
    [rootCreateEntryTarget, worktreePath],
  )

  const selectedCreateEntryTarget = useCallback((): CreateEntryTarget | null => {
    if (selection.selected.size !== 1) return rootCreateEntryTarget()
    const selectedId = Array.from(selection.selected)[0]
    return createEntryTargetForNode(selectedId ? (flatNodeById.get(selectedId) ?? null) : null)
  }, [createEntryTargetForNode, flatNodeById, rootCreateEntryTarget, selection.selected])

  const beginCreateEntry = useCallback(
    (kind: CreateEntryKind, target: CreateEntryTarget | null) => {
      if (!target) return
      setCreateEntryKind(kind)
      setCreateEntryTarget(target)
      setCreateEntryName('')
      setCreateEntryError(null)
      setContextOpen(false)
      if (target.parentRelativePath) {
        setExpandedDirs((current) => new Set(current).add(target.parentRelativePath))
      }
      const state = directoriesRef.current[target.parentRelativePath]
      if (!state?.entries && !state?.loading) {
        void loadDirectory(target.parentRelativePath, target.parentAbsolutePath)
      }
    },
    [loadDirectory],
  )

  const beginCreateFileForNode = useCallback(
    (node: FileTreeNode | null) => {
      beginCreateEntry('file', createEntryTargetForNode(node))
    },
    [beginCreateEntry, createEntryTargetForNode],
  )

  const beginCreateDirectoryForNode = useCallback(
    (node: FileTreeNode | null) => {
      beginCreateEntry('directory', createEntryTargetForNode(node))
    },
    [beginCreateEntry, createEntryTargetForNode],
  )

  const cancelCreateEntry = useCallback(() => {
    if (createEntryPending) return
    setCreateEntryTarget(null)
    setCreateEntryName('')
    setCreateEntryError(null)
  }, [createEntryPending])

  const submitCreateEntry = useCallback(
    async (value = createEntryName) => {
      if (!worktreePath || !createEntryTarget) return
      const name = value.trim()
      if (!name) {
        setCreateEntryError('error.invalid-arguments')
        return
      }
      setCreateEntryPending(true)
      setCreateEntryError(null)
      const result =
        createEntryKind === 'file'
          ? await createRepositoryFileTreeFile(repoId, worktreePath, createEntryTarget.parentAbsolutePath, name)
          : await createRepositoryFileTreeDirectory(repoId, worktreePath, createEntryTarget.parentAbsolutePath, name)
      setCreateEntryPending(false)
      if (!result.ok) {
        setCreateEntryError(result.message)
        return
      }

      const newRelativePath = createEntryTarget.parentRelativePath
        ? `${createEntryTarget.parentRelativePath}/${name}`
        : name
      setCreateEntryTarget(null)
      setCreateEntryName('')
      setCreateEntryError(null)
      await loadDirectory(createEntryTarget.parentRelativePath, createEntryTarget.parentAbsolutePath)
      setSelection({ selected: new Set([newRelativePath]), anchor: newRelativePath })
      setFocusedNodeId(newRelativePath)
    },
    [createEntryKind, createEntryName, createEntryTarget, loadDirectory, repoId, worktreePath],
  )

  const refreshTreeDirectory = useCallback(
    (target: CreateEntryTarget | null) => {
      if (!target) return
      void loadDirectory(target.parentRelativePath, target.parentAbsolutePath)
    },
    [loadDirectory],
  )

  const initializeBootstrapConfig = useCallback(async () => {
    if (!worktreePath || initializingBootstrapConfig || bootstrapConfigStatus !== 'missing') return
    setInitializingBootstrapConfig(true)
    try {
      const result = await initializeRepositoryWorktreeBootstrapConfig(repoId, worktreePath)
      if (result.ok) {
        setBootstrapConfigStatus('present')
        toast.success(t('file-tree.init-worktree-bootstrap-config-created'))
        refreshTreeDirectory(rootCreateEntryTarget())
        return
      }
      if (result.message === 'error.file-exists') setBootstrapConfigStatus('present')
      toast.error(t('file-tree.init-worktree-bootstrap-config-failed'), {
        description: t(result.message),
      })
    } catch (err) {
      console.warn('[file-tree] worktree bootstrap config initialization failed', err)
      toast.error(t('file-tree.init-worktree-bootstrap-config-failed'))
    } finally {
      setInitializingBootstrapConfig(false)
    }
  }, [bootstrapConfigStatus, initializingBootstrapConfig, refreshTreeDirectory, repoId, rootCreateEntryTarget, t, worktreePath])

  const refreshDirectoryForContextNode = useCallback(
    (node: FileTreeNode | null) => {
      refreshTreeDirectory(createEntryTargetForNode(node))
    },
    [createEntryTargetForNode, refreshTreeDirectory],
  )

  const cancelRename = useCallback(() => {
    if (renamePending) return
    setRenameNode(null)
    setRenameValue('')
    setRenameError(null)
  }, [renamePending])

  const beginRename = useCallback((node: FileTreeNode) => {
    if (!isWritableNode(node)) return
    setRenameNode(node)
    setRenameValue(node.name)
    setRenameError(null)
    setContextOpen(false)
  }, [])

  const beginDelete = useCallback(
    (node: FileTreeNode) => {
      if (!isWritableNode(node)) return
      const targets = selection.selected.has(node.id) ? realSelectedNodes : [node]
      setDeleteTargets(targets.filter(isWritableNode))
      setDeleteError(null)
      setContextOpen(false)
    },
    [realSelectedNodes, selection.selected],
  )

  const submitRename = useCallback(
    async (value = renameValue) => {
      if (!worktreePath || !renameNode) return
      const nextName = value.trim()
      if (!nextName) {
        setRenameError('error.invalid-arguments')
        return
      }
      if (nextName === renameNode.name) {
        cancelRename()
        return
      }
      setRenamePending(true)
      setRenameError(null)
      const result = await renameRepositoryFileTreeEntry(repoId, worktreePath, renameNode.absolutePath, nextName)
      setRenamePending(false)
      if (!result.ok) {
        setRenameError(result.message)
        return
      }
      const nextAbsolutePath = renamedAbsolutePath(renameNode, nextName)
      const nextId = renamedRelativePath(renameNode, nextName)
      undoStackRef.current.push({
        kind: 'rename',
        oldName: renameNode.name,
        oldPath: renameNode.absolutePath,
        newPath: nextAbsolutePath,
        oldRelativePath: renameNode.relativePath,
        newRelativePath: nextId,
      })
      clearCachedDescendants([renameNode])
      setSelection({ selected: new Set([nextId]), anchor: nextId })
      setFocusedNodeId(nextId)
      setRenameNode(null)
      setRenameValue('')
      setRenameError(null)
      await refreshDirectoryForNode(renameNode)
    },
    [cancelRename, clearCachedDescendants, refreshDirectoryForNode, renameNode, renameValue, repoId, worktreePath],
  )

  const submitDelete = useCallback(async () => {
    if (!worktreePath || deleteTargets.length === 0) return
    const targets = deleteTargets
    setDeletePending(true)
    setDeleteError(null)
    const result = await deleteRepositoryFileTreeEntries(
      repoId,
      worktreePath,
      targets.map((node) => node.absolutePath),
    )
    setDeletePending(false)
    if (!result.ok) {
      setDeleteError(result.message)
      return
    }
    const deletedIds = new Set(targets.map((node) => node.id))
    clearCachedDescendants(targets)
    setSelection((current) => {
      const selected = new Set(current.selected)
      for (const id of deletedIds) selected.delete(id)
      return { selected, anchor: current.anchor && deletedIds.has(current.anchor) ? null : current.anchor }
    })
    setFocusedNodeId((current) => (current && deletedIds.has(current) ? null : current))
    setDeleteTargets([])
    setDeleteError(null)
    for (const parentSource of uniqueParentNodes(targets)) {
      await refreshDirectoryForNode(parentSource)
    }
  }, [clearCachedDescendants, deleteTargets, refreshDirectoryForNode, repoId, worktreePath])

  const pasteTargetNode = useCallback(() => {
    if (contextOpen && contextNode) return contextNode
    if (focusedNodeId) return flatNodeById.get(focusedNodeId) ?? null
    const firstSelected = Array.from(selection.selected)[0]
    return firstSelected ? (flatNodeById.get(firstSelected) ?? null) : null
  }, [contextNode, contextOpen, flatNodeById, focusedNodeId, selection.selected])

  const uploadTargetForNode = useCallback(
    (node: FileTreeNode | null) => {
      if (!worktreePath) return null
      return resolveFileTreePasteTarget(worktreePath, node)
    },
    [worktreePath],
  )

  const runTransfer = useCallback(
    async (targetDirPath: string, source: RepoFileTransferSource | null = readInternalFileTreeClipboard()) => {
      if (!worktreePath || !source) return
      const result = await transferRepositoryFiles({ repoId, worktreePath, targetDirPath, source })
      if (result.ok) {
        const copiedPaths = result.copied.map((entry) => entry.destinationPath)
        if (copiedPaths.length > 0) {
          undoStackRef.current.push({
            kind: 'paste',
            paths: copiedPaths,
            relativePaths: copiedPaths.map((path) => relativeDirPath(worktreePath, path)),
          })
        }
        void loadDirectory(relativeDirPath(worktreePath, targetDirPath), targetDirPath)
      }
    },
    [loadDirectory, repoId, worktreePath],
  )

  const runUpload = useCallback(
    async (targetDirPath: string) => {
      if (!worktreePath) return
      const paths = await chooseFileTreeUploadFiles()
      if (paths.length === 0) return
      await runTransfer(targetDirPath, {
        kind: 'localPaths',
        items: paths.map((path) => ({ path })),
      })
    },
    [runTransfer, worktreePath],
  )

  const runUploadForNode = useCallback(
    (node: FileTreeNode | null) => {
      const targetDirPath = uploadTargetForNode(node)
      if (!targetDirPath) return
      void runUpload(targetDirPath)
    },
    [runUpload, uploadTargetForNode],
  )

  const runMove = useCallback(
    async (targetDirPath: string, sourcePaths: string[]) => {
      if (!worktreePath || sourcePaths.length === 0) return
      const knownSourceNodes = sourcePaths
        .map((sourcePath) => flatNodeByAbsolutePath.get(sourcePath))
        .filter((node): node is FileTreeNode => !!node)
      if (knownSourceNodes.some((node) => !isWritableNode(node))) return
      const sourceNodes = knownSourceNodes.filter(isWritableNode)
      const paths = sourceNodes.length > 0 ? sourceNodes.map((node) => node.absolutePath) : sourcePaths
      const result = await moveRepositoryFileTreeEntries(repoId, worktreePath, paths, targetDirPath)
      if (!result.ok) return

      const undoEntries = paths
        .map((sourcePath) => {
          const name = basenamePath(sourcePath)
          const movedPath = childPath(targetDirPath, name)
          if (movedPath === sourcePath) return null
          return {
            originalPath: sourcePath,
            movedPath,
            originalRelativePath: relativeDirPath(worktreePath, sourcePath),
            movedRelativePath: relativeDirPath(worktreePath, movedPath),
            originalParentDirPath: parentDirectoryPath(sourcePath),
          }
        })
        .filter((entry): entry is Extract<FileTreeUndoAction, { kind: 'move' }>['entries'][number] => !!entry)
      if (undoEntries.length > 0) {
        undoStackRef.current.push({ kind: 'move', entries: undoEntries })
      }

      clearCachedDescendants(sourceNodes)
      for (const parentSource of uniqueParentNodes(sourceNodes)) {
        await refreshDirectoryForNode(parentSource)
      }
      await loadDirectory(relativeDirPath(worktreePath, targetDirPath), targetDirPath)

      if (sourceNodes.length > 0) {
        const targetRelativePath = relativeDirPath(worktreePath, targetDirPath)
        const movedIds = sourceNodes.map((node) =>
          targetRelativePath ? `${targetRelativePath}/${node.name}` : node.name,
        )
        setSelection({ selected: new Set(movedIds), anchor: movedIds[0] ?? null })
        setFocusedNodeId(movedIds[0] ?? null)
      }
    },
    [clearCachedDescendants, flatNodeByAbsolutePath, loadDirectory, refreshDirectoryForNode, repoId, worktreePath],
  )

  const runUndo = useCallback(async () => {
    if (!worktreePath || undoPendingRef.current) return
    const action = undoStackRef.current.pop()
    if (!action) return
    undoPendingRef.current = true
    try {
      if (action.kind === 'rename') {
        const result = await renameRepositoryFileTreeEntry(repoId, worktreePath, action.newPath, action.oldName)
        if (!result.ok) {
          undoStackRef.current.push(action)
          return
        }
        clearCachedRelativePaths([action.newRelativePath, action.oldRelativePath])
        await refreshParentDirectoryForPath(action.newPath)
        await refreshParentDirectoryForPath(action.oldPath)
        setSelection({ selected: new Set([action.oldRelativePath]), anchor: action.oldRelativePath })
        setFocusedNodeId(action.oldRelativePath)
        return
      }

      if (action.kind === 'move') {
        const groups = groupedMoveUndoEntries(action.entries)
        for (const group of groups) {
          const result = await moveRepositoryFileTreeEntries(
            repoId,
            worktreePath,
            group.entries.map((entry) => entry.movedPath),
            group.originalParentDirPath,
          )
          if (!result.ok) {
            undoStackRef.current.push(action)
            return
          }
        }
        clearCachedRelativePaths(
          action.entries.flatMap((entry) => [entry.movedRelativePath, entry.originalRelativePath]),
        )
        const parentDirs = new Set<string>()
        for (const entry of action.entries) {
          parentDirs.add(parentDirectoryPath(entry.movedPath))
          parentDirs.add(entry.originalParentDirPath)
        }
        for (const parentDir of parentDirs) await refreshDirectoryPath(parentDir)
        const ids = action.entries.map((entry) => entry.originalRelativePath)
        setSelection({ selected: new Set(ids), anchor: ids[0] ?? null })
        setFocusedNodeId(ids[0] ?? null)
        return
      }

      if (action.kind === 'replaceBinaryFile') {
        const result = await replaceRepositoryFileTreeBinaryFile(
          repoId,
          worktreePath,
          action.path,
          action.previousBytesBase64,
          fileTreeClipboardMaxBytes,
        )
        if (!result.ok) {
          undoStackRef.current.push(action)
          toast.error(t(result.message))
          return
        }
        await refreshParentDirectoryForPath(action.path)
        setSelection({ selected: new Set([action.relativePath]), anchor: action.relativePath })
        setFocusedNodeId(action.relativePath)
        return
      }

      const result = await deleteRepositoryFileTreeEntries(repoId, worktreePath, action.paths)
      if (!result.ok) {
        undoStackRef.current.push(action)
        return
      }
      clearCachedRelativePaths(action.relativePaths)
      const parentDirs = new Set(action.paths.map(parentDirectoryPath))
      for (const parentDir of parentDirs) await refreshDirectoryPath(parentDir)
      setSelection((current) => {
        const deletedIds = new Set(action.relativePaths)
        const selected = new Set(current.selected)
        for (const id of deletedIds) selected.delete(id)
        return { selected, anchor: current.anchor && deletedIds.has(current.anchor) ? null : current.anchor }
      })
      setFocusedNodeId((current) => (current && action.relativePaths.includes(current) ? null : current))
    } finally {
      undoPendingRef.current = false
    }
  }, [
    clearCachedRelativePaths,
    fileTreeClipboardMaxBytes,
    refreshDirectoryPath,
    refreshParentDirectoryForPath,
    repoId,
    t,
    worktreePath,
  ])

  const sourceFromSystemClipboard = useCallback(async () => {
    return sourceFromSystemClipboardPaths(await readSystemClipboardFilePaths())
  }, [])

  const singleFocusedFileNode = useCallback(
    (fallback: FileTreeNode): FileTreeNode | null => {
      if (selection.selected.size > 1) return null
      if (selection.selected.size === 1 && !selection.selected.has(fallback.id)) return null
      return isPlainFileNode(fallback) ? fallback : null
    },
    [selection.selected],
  )

  const copyFocusedFileContents = useCallback(
    async (node: FileTreeNode) => {
      if (!worktreePath) return
      const result = await readRepositoryFileTreeBinaryFile(
        repoId,
        worktreePath,
        node.absolutePath,
        fileTreeClipboardMaxBytes,
      )
      if (!result.ok) {
        toast.error(t(result.message))
        return
      }
      const written = await writeFileTreeClipboardFile({
        name: result.name,
        byteLength: result.byteLength,
        bytesBase64: result.bytesBase64,
        ...(result.text !== undefined ? { text: result.text } : {}),
        ...(result.mimeType !== undefined ? { mimeType: result.mimeType } : {}),
      })
      if (!written.ok) {
        toast.error(t(written.message))
        return
      }
      toast.success(t('file-tree.copy-file-contents-ok'))
    },
    [fileTreeClipboardMaxBytes, repoId, t, worktreePath],
  )

  const replaceFocusedFileContents = useCallback(
    async (node: FileTreeNode) => {
      if (!worktreePath) return
      const clipboardFile = await readFileTreeClipboardFile(fileTreeClipboardMaxBytes)
      if (!clipboardFile.ok) {
        toast.error(t(clipboardFile.message))
        return
      }
      const result = await replaceRepositoryFileTreeBinaryFile(
        repoId,
        worktreePath,
        node.absolutePath,
        clipboardFile.file.bytesBase64,
        fileTreeClipboardMaxBytes,
      )
      if (!result.ok) {
        toast.error(t(result.message))
        return
      }
      undoStackRef.current.push({
        kind: 'replaceBinaryFile',
        path: node.absolutePath,
        relativePath: node.relativePath,
        previousBytesBase64: result.previousBytesBase64,
      })
      await refreshParentDirectoryForPath(node.absolutePath)
      setSelection({ selected: new Set([node.relativePath]), anchor: node.relativePath })
      setFocusedNodeId(node.relativePath)
      toast.success(t('file-tree.replace-file-contents-ok'))
    },
    [fileTreeClipboardMaxBytes, refreshParentDirectoryForPath, repoId, t, worktreePath],
  )

  const sourceForPasteEvent = useCallback(
    async (event: ClipboardEvent<HTMLDivElement>) => {
      const system = await sourceFromSystemClipboard()
      if (system) return system
      const internal = readInternalFileTreeClipboard()
      if (internal) return internal
      return await sourceFromClipboardEvent(event.nativeEvent)
    },
    [sourceFromSystemClipboard],
  )

  const handleKeyDown = useCallback(
    (node: FileTreeNode, event: KeyboardEvent) => {
      if (isUndoShortcut(event.nativeEvent)) {
        event.preventDefault()
        void runUndo()
        return
      }
      if (event.key === 'Enter' && isWritableNode(node)) {
        event.preventDefault()
        if (!selection.selected.has(node.id)) {
          setSelection({ selected: new Set([node.id]), anchor: node.id })
        }
        beginRename(node)
        return
      }
      const contentShortcut = fileContentClipboardShortcut(event.nativeEvent)
      if (contentShortcut && !renameNode && !createEntryTarget) {
        const target = singleFocusedFileNode(node)
        if (!target) return
        event.preventDefault()
        event.stopPropagation()
        if (contentShortcut === 'copy') void copyFocusedFileContents(target)
        else void replaceFocusedFileContents(target)
        return
      }
      if (!worktreePath || !isPrimaryShortcut(event.nativeEvent)) return
      const key = event.key.toLowerCase()
      if (key === 'c') {
        event.preventDefault()
        const paths = selectedPaths()
        writeInternalFileTreeClipboard({
          repoId,
          worktreePath,
          paths: paths.length > 0 ? paths : [node.absolutePath],
        })
      } else if (key === 'v') {
        const internal = readInternalFileTreeClipboard()
        if (!internal) return
        event.preventDefault()
        void runTransfer(resolveFileTreePasteTarget(worktreePath, node), internal)
      }
    },
    [
      beginRename,
      copyFocusedFileContents,
      createEntryTarget,
      renameNode,
      replaceFocusedFileContents,
      repoId,
      runTransfer,
      runUndo,
      selectedPaths,
      selection.selected,
      singleFocusedFileNode,
      worktreePath,
    ],
  )

  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      if (!worktreePath) return
      void (async () => {
        const source = await sourceForPasteEvent(event)
        if (!source) return
        event.preventDefault()
        await runTransfer(resolveFileTreePasteTarget(worktreePath, pasteTargetNode()), source)
      })()
    },
    [pasteTargetNode, runTransfer, sourceForPasteEvent, worktreePath],
  )

  const handleDrop = useCallback(
    (node: FileTreeNode | null, event: DragEvent<HTMLDivElement>) => {
      if (!worktreePath) return
      const internalPaths = sourcePathsFromInternalDrop(event.dataTransfer)
      if (internalPaths.length > 0) {
        event.preventDefault()
        event.stopPropagation()
        void runMove(resolveDropTargetDirectory(worktreePath, node), internalPaths)
        return
      }
      if (!event.dataTransfer.types.includes('Files')) return
      const source = sourceFromDroppedFiles(Array.from(event.dataTransfer.files))
      if (!source) return
      event.preventDefault()
      event.stopPropagation()
      void runTransfer(resolveDropTargetDirectory(worktreePath, node), source)
    },
    [runMove, runTransfer, worktreePath],
  )

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (event.dataTransfer.types.includes(GOBLIN_FILE_PATHS_MIME)) {
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
      return
    }
    if (!event.dataTransfer.types.includes('Files')) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }, [])

  const collapseAllDirectories = useCallback(() => {
    setExpandedDirs(new Set())
  }, [])
  const runOpenNodeInEditor = useCallback(
    async (node: FileTreeNode) => {
      const result = await openNodeInEditor(repoId, node)
      if (!result.ok) toast.error(result.message)
    },
    [repoId],
  )
  const openWorktreeLocally = useCallback(async () => {
    if (!canOpenLocally || !worktreePath) return
    const result = await openInFinder(worktreePath)
    if (!result.ok) toast.error(result.message)
  }, [canOpenLocally, worktreePath])

  if (!view.exists) return null
  const fileTreeStyle = {
    '--goblin-file-tree-font-size': `${fileTreeFontSize}px`,
  } as CSSProperties

  return (
    <div
      className="flex min-h-0 flex-1 flex-col bg-sidebar"
      style={fileTreeStyle}
      data-repo-id={repoId}
      onPaste={handlePaste}
      onDrop={(event) => handleDrop(null, event)}
      onDragOver={handleDragOver}
    >
      {!worktreePath ? (
        <div className="flex min-h-0 flex-1 items-center justify-center p-4 text-center">
          <div>
            <div className="text-sm font-medium text-foreground">{t('file-tree.no-worktree-title')}</div>
            <div className="mt-1 text-xs text-muted-foreground">{t('file-tree.no-worktree-body')}</div>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col text-[length:var(--goblin-file-tree-font-size)]">
          <FileTreeToolbar
            height={toolbarHeight}
            onCollapseAll={collapseAllDirectories}
            onCreateFile={() => beginCreateEntry('file', selectedCreateEntryTarget())}
            onCreateDirectory={() => beginCreateEntry('directory', selectedCreateEntryTarget())}
            onRefresh={() => refreshTreeDirectory(rootCreateEntryTarget())}
            canOpenLocally={canOpenLocally}
            onOpenLocal={() => void openWorktreeLocally()}
            showBootstrapConfigInit={bootstrapConfigStatus === 'missing'}
            initializingBootstrapConfig={initializingBootstrapConfig}
            onInitializeBootstrapConfig={() => void initializeBootstrapConfig()}
          />
          <div className="min-h-0 flex-1 overflow-auto py-1">
            {rootState?.loading && !rootState.entries ? (
              <FileTreeMessage>{t('file-tree.loading')}</FileTreeMessage>
            ) : rootState?.error && !rootState.entries ? (
              <FileTreeError message={t(rootState.error)} onRetry={() => void loadDirectory(ROOT_DIR, worktreePath)} />
            ) : (
              <>
                {createEntryTarget?.parentRelativePath === ROOT_DIR ? (
                  <FileTreeCreateEntryRow
                    kind={createEntryKind}
                    depth={0}
                    value={createEntryName}
                    pending={createEntryPending}
                    error={createEntryError}
                    onValueChange={setCreateEntryName}
                    onCancel={cancelCreateEntry}
                    onSubmit={submitCreateEntry}
                  />
                ) : null}
                {rootNodes.map((node) => (
                  <FileTreeRow
                    key={node.id}
                    repoId={repoId}
                    node={node}
                    depth={0}
                    selected={selection.selected.has(node.id)}
                    selectedIds={selection.selected}
                    directories={directories}
                    directoryState={directories[node.relativePath]}
                    onSelect={handleSelect}
                    onToggle={toggleDirectory}
                    onDragStart={handleDragStart}
                    onContextMenu={handleContextMenu}
                    onContextMenuOpenChange={handleContextMenuOpenChange}
                    contextTargets={contextTargets}
                    onBeginRename={beginRename}
                    onBeginDelete={beginDelete}
                    onBeginCreateFile={beginCreateFileForNode}
                    onBeginCreateDirectory={beginCreateDirectoryForNode}
                    onRefresh={refreshDirectoryForContextNode}
                    onDownload={runDownload}
                    canUploadFiles={canUploadFiles}
                    onUpload={runUploadForNode}
                    onOpenInEditor={(node) => void runOpenNodeInEditor(node)}
                    onKeyDown={handleKeyDown}
                    onFocus={setFocusedNodeId}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    renameNodeId={renameNode?.id ?? null}
                    renameValue={renameValue}
                    renamePending={renamePending}
                    renameError={renameError}
                    onRenameValueChange={setRenameValue}
                    onRenameCancel={cancelRename}
                    onRenameSubmit={submitRename}
                    createEntryParentRelativePath={createEntryTarget?.parentRelativePath ?? null}
                    createEntryKind={createEntryKind}
                    createEntryName={createEntryName}
                    createEntryPending={createEntryPending}
                    createEntryError={createEntryError}
                    onCreateEntryNameChange={setCreateEntryName}
                    onCreateEntryCancel={cancelCreateEntry}
                    onCreateEntrySubmit={submitCreateEntry}
                  />
                ))}
                <ContextMenu>
                  <ContextMenuTrigger asChild>
                    <div
                      className="min-h-6 flex-1"
                      data-testid="file-tree-empty-context-target"
                      onDrop={(event) => handleDrop(null, event)}
                      onDragOver={handleDragOver}
                    />
                  </ContextMenuTrigger>
                  <FileTreeEmptyContextMenu
                    canUploadFiles={canUploadFiles}
                    onUpload={() => runUploadForNode(null)}
                    onCreateFile={() => beginCreateEntry('file', rootCreateEntryTarget())}
                    onCreateDirectory={() => beginCreateEntry('directory', rootCreateEntryTarget())}
                    onRefresh={() => refreshTreeDirectory(rootCreateEntryTarget())}
                  />
                </ContextMenu>
              </>
            )}
          </div>
        </div>
      )}
      <FileTreeDeleteDialog
        targets={deleteTargets}
        pending={deletePending}
        error={deleteError}
        onCancel={() => {
          if (deletePending) return
          setDeleteTargets([])
          setDeleteError(null)
        }}
        onConfirm={submitDelete}
      />
    </div>
  )
}

function useProjectFileTreeView(repoId: string): ProjectFileTreeView {
  return useStoreWithEqualityFn(
    useReposStore,
    (state) => {
      const repo = state.repos[repoId]
      if (!repo) return { exists: false, isGitRepo: false, worktreePath: null, status: [] }
      const plainWorkspacePath = repoPlainWorkspacePath(repo)
      if (plainWorkspacePath) return { exists: true, isGitRepo: false, worktreePath: plainWorkspacePath, status: [] }
      const selected = repo.data.branches.find((branch) => branch.name === repo.ui.selectedBranch) ?? null
      return {
        exists: true,
        isGitRepo: repo.isGitRepo,
        worktreePath: selected?.worktree?.path ?? null,
        status: repo.data.status,
      }
    },
    (a, b) =>
      a.exists === b.exists &&
      a.isGitRepo === b.isGitRepo &&
      a.worktreePath === b.worktreePath &&
      a.status === b.status,
  )
}

function FileTreeRow({
  repoId,
  node,
  depth,
  selected,
  selectedIds,
  directories,
  directoryState,
  onSelect,
  onToggle,
  onDragStart,
  onContextMenu,
  onContextMenuOpenChange,
  contextTargets,
  onBeginRename,
  onBeginDelete,
  onBeginCreateFile,
  onBeginCreateDirectory,
  onRefresh,
  onDownload,
  canUploadFiles,
  onUpload,
  onOpenInEditor,
  onKeyDown,
  onFocus,
  onDrop,
  onDragOver,
  renameNodeId,
  renameValue,
  renamePending,
  renameError,
  onRenameValueChange,
  onRenameCancel,
  onRenameSubmit,
  createEntryParentRelativePath,
  createEntryKind,
  createEntryName,
  createEntryPending,
  createEntryError,
  onCreateEntryNameChange,
  onCreateEntryCancel,
  onCreateEntrySubmit,
}: {
  repoId: string
  node: FileTreeNode
  depth: number
  selected: boolean
  selectedIds: Set<string>
  directories: Record<string, DirectoryState>
  directoryState?: DirectoryState
  onSelect: (node: FileTreeNode, event: MouseEvent) => void
  onToggle: (node: FileTreeNode) => void
  onDragStart: (node: FileTreeNode, event: DragEvent) => void
  onContextMenu: (node: FileTreeNode, event: MouseEvent) => void
  onContextMenuOpenChange: (node: FileTreeNode, open: boolean) => void
  contextTargets: (node: FileTreeNode) => FileTreeNode[]
  onBeginRename: (node: FileTreeNode) => void
  onBeginDelete: (node: FileTreeNode) => void
  onBeginCreateFile: (node: FileTreeNode | null) => void
  onBeginCreateDirectory: (node: FileTreeNode | null) => void
  onRefresh: (node: FileTreeNode | null) => void
  onDownload: (nodes: FileTreeNode[]) => void
  canUploadFiles: boolean
  onUpload: (node: FileTreeNode | null) => void
  onOpenInEditor: (node: FileTreeNode) => void
  onKeyDown: (node: FileTreeNode, event: KeyboardEvent) => void
  onFocus: (nodeId: string) => void
  onDrop: (node: FileTreeNode, event: DragEvent<HTMLDivElement>) => void
  onDragOver: (event: DragEvent<HTMLDivElement>) => void
  renameNodeId: string | null
  renameValue: string
  renamePending: boolean
  renameError: string | null
  onRenameValueChange: (value: string) => void
  onRenameCancel: () => void
  onRenameSubmit: (value?: string) => void
  createEntryParentRelativePath: string | null
  createEntryKind: CreateEntryKind
  createEntryName: string
  createEntryPending: boolean
  createEntryError: string | null
  onCreateEntryNameChange: (value: string) => void
  onCreateEntryCancel: () => void
  onCreateEntrySubmit: (value?: string) => void
}) {
  const expandable = isExpandableNode(node)
  const Icon = iconForNode(node, node.expanded === true)
  return (
    <>
      <ContextMenu onOpenChange={(open) => onContextMenuOpenChange(node, open)}>
        <ContextMenuTrigger asChild>
          <div
            role="treeitem"
            data-file-tree-node-id={node.id}
            aria-selected={selected}
            tabIndex={0}
            draggable
            onFocus={() => onFocus(node.id)}
            onKeyDown={(event) => onKeyDown(node, event)}
            onClick={(event) => {
              onFocus(node.id)
              onSelect(node, event)
              if (expandable) onToggle(node)
            }}
            onDoubleClick={(event) => {
              if (!isEditorOpenableFileNode(node)) return
              event.preventDefault()
              event.stopPropagation()
              onOpenInEditor(node)
            }}
            onDragStart={(event) => onDragStart(node, event)}
            onDrop={(event) => onDrop(node, event)}
            onDragOver={onDragOver}
            onContextMenu={(event) => onContextMenu(node, event)}
            className={cn(
              'flex h-6 min-w-0 cursor-default select-none items-center gap-1 px-2 outline-hidden',
              selected
                ? 'bg-list-row-selected text-list-row-selected-foreground'
                : 'text-foreground hover:bg-list-row-hover',
              toneClass(node.tone),
            )}
            style={{ paddingLeft: `${8 + depth * 14}px` }}
          >
            <button
              type="button"
              aria-label={`Toggle ${node.name}`}
              disabled={!expandable}
              onClick={(event) => {
                event.stopPropagation()
                onToggle(node)
              }}
              className={cn(
                'flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground',
                expandable && 'hover:bg-list-row-hover hover:text-foreground',
              )}
            >
              {expandable ? (
                node.expanded ? (
                  <ChevronDown className="size-3" />
                ) : (
                  <ChevronRight className="size-3" />
                )
              ) : null}
            </button>
            <Icon className="size-3.5 shrink-0" />
            {renameNodeId === node.id ? (
              <Input
                aria-label="file-tree.rename-input-label"
                value={renameValue}
                disabled={renamePending}
                autoFocus
                onChange={(event) => onRenameValueChange(event.currentTarget.value)}
                onClick={(event) => event.stopPropagation()}
                onBlur={() => {
                  if (!renamePending) onRenameCancel()
                }}
                onKeyDown={(event) => {
                  event.stopPropagation()
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    onRenameCancel()
                  }
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void onRenameSubmit(event.currentTarget.value)
                  }
                }}
                className="h-5 min-w-0 flex-1 px-1 py-0 text-[length:var(--goblin-file-tree-font-size)]"
              />
            ) : (
              <span className="min-w-0 flex-1 truncate">{node.name}</span>
            )}
            {node.changeCount ? (
              <span
                className="shrink-0 font-mono opacity-80"
                style={{ fontSize: 'max(10px, calc(var(--goblin-file-tree-font-size) - 2px))' }}
              >
                {node.changeCount}
              </span>
            ) : null}
          </div>
        </ContextMenuTrigger>
        <FileTreeContextMenu
          repoId={repoId}
          node={node}
          targets={contextTargets(node)}
          onBeginRename={onBeginRename}
          onBeginDelete={onBeginDelete}
          onBeginCreateFile={onBeginCreateFile}
          onBeginCreateDirectory={onBeginCreateDirectory}
          onRefresh={onRefresh}
          onDownload={onDownload}
          canUploadFiles={canUploadFiles}
          onUpload={onUpload}
        />
      </ContextMenu>
      {renameNodeId === node.id && renameError ? (
        <FileTreeIndentedMessage depth={depth + 1}>{renameError}</FileTreeIndentedMessage>
      ) : null}
      {node.expanded && directoryState?.loading ? (
        <FileTreeIndentedMessage depth={depth + 1}>Loading...</FileTreeIndentedMessage>
      ) : null}
      {node.expanded && directoryState?.error ? (
        <FileTreeIndentedMessage depth={depth + 1}>{directoryState.error}</FileTreeIndentedMessage>
      ) : null}
      {node.expanded && createEntryParentRelativePath === node.relativePath ? (
        <FileTreeCreateEntryRow
          kind={createEntryKind}
          depth={depth + 1}
          value={createEntryName}
          pending={createEntryPending}
          error={createEntryError}
          onValueChange={onCreateEntryNameChange}
          onCancel={onCreateEntryCancel}
          onSubmit={onCreateEntrySubmit}
        />
      ) : null}
      {node.expanded &&
        node.children?.map((child) => (
          <FileTreeRow
            key={child.id}
            repoId={repoId}
            node={child}
            depth={depth + 1}
            selected={selectedIds.has(child.id)}
            selectedIds={selectedIds}
            directories={directories}
            directoryState={directories[child.relativePath]}
            onSelect={onSelect}
            onToggle={onToggle}
            onDragStart={onDragStart}
            onContextMenu={onContextMenu}
            onContextMenuOpenChange={onContextMenuOpenChange}
            contextTargets={contextTargets}
            onBeginRename={onBeginRename}
            onBeginDelete={onBeginDelete}
            onBeginCreateFile={onBeginCreateFile}
            onBeginCreateDirectory={onBeginCreateDirectory}
            onRefresh={onRefresh}
            onDownload={onDownload}
            canUploadFiles={canUploadFiles}
            onUpload={onUpload}
            onOpenInEditor={onOpenInEditor}
            onKeyDown={onKeyDown}
            onFocus={onFocus}
            onDrop={onDrop}
            onDragOver={onDragOver}
            renameNodeId={renameNodeId}
            renameValue={renameValue}
            renamePending={renamePending}
            renameError={renameError}
            onRenameValueChange={onRenameValueChange}
            onRenameCancel={onRenameCancel}
            onRenameSubmit={onRenameSubmit}
            createEntryParentRelativePath={createEntryParentRelativePath}
            createEntryKind={createEntryKind}
            createEntryName={createEntryName}
            createEntryPending={createEntryPending}
            createEntryError={createEntryError}
            onCreateEntryNameChange={onCreateEntryNameChange}
            onCreateEntryCancel={onCreateEntryCancel}
            onCreateEntrySubmit={onCreateEntrySubmit}
          />
        ))}
    </>
  )
}

function FileTreeContextMenu({
  repoId,
  node,
  targets,
  onBeginRename,
  onBeginDelete,
  onBeginCreateFile,
  onBeginCreateDirectory,
  onRefresh,
  onDownload,
  canUploadFiles,
  onUpload,
}: {
  repoId: string
  node: FileTreeNode
  targets: FileTreeNode[]
  onBeginRename: (node: FileTreeNode) => void
  onBeginDelete: (node: FileTreeNode) => void
  onBeginCreateFile: (node: FileTreeNode | null) => void
  onBeginCreateDirectory: (node: FileTreeNode | null) => void
  onRefresh: (node: FileTreeNode | null) => void
  onDownload: (nodes: FileTreeNode[]) => void
  canUploadFiles: boolean
  onUpload: (node: FileTreeNode | null) => void
}) {
  const t = useT()
  const realNode = isWritableNode(node)
  const canRevealInFinder = realNode && !isRemoteRepoId(repoId)
  const downloadTargets = exportableFileNodes(targets)
  return (
    <ContextMenuContent>
      <ContextMenuItem onSelect={() => void copyPaths(targets.map((target) => target.absolutePath))}>
        <Copy className="size-3.5" />
        {t('file-tree.copy-path')}
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => void copyPaths(targets.map((target) => target.relativePath))}>
        <FileSymlink className="size-3.5" />
        {t('file-tree.copy-relative-path')}
      </ContextMenuItem>
      <ContextMenuItem disabled={downloadTargets.length === 0} onSelect={() => void onDownload(downloadTargets)}>
        <Download className="size-3.5" />
        {t('file-tree.download')}
      </ContextMenuItem>
      {canUploadFiles ? (
        <ContextMenuItem onSelect={() => onUpload(node)}>
          <Upload className="size-3.5" />
          {t('file-tree.upload-file')}
        </ContextMenuItem>
      ) : null}
      <ContextMenuItem disabled={!realNode} onSelect={() => onBeginCreateFile(node)}>
        <FilePlus className="size-3.5" />
        {t('file-tree.new-file')}
      </ContextMenuItem>
      <ContextMenuItem disabled={!realNode} onSelect={() => onBeginCreateDirectory(node)}>
        <FolderPlus className="size-3.5" />
        {t('file-tree.new-folder')}
      </ContextMenuItem>
      <ContextMenuItem disabled={!realNode} onSelect={() => onRefresh(node)}>
        <RefreshCw className="size-3.5" />
        {t('file-tree.refresh')}
      </ContextMenuItem>
      <ContextMenuItem disabled={!realNode} onSelect={() => void openNodeInEditor(repoId, node)}>
        <Code2 className="size-3.5" />
        {t('file-tree.open-editor')}
      </ContextMenuItem>
      <ContextMenuItem disabled={!realNode} onSelect={() => void openNodeInTerminal(repoId, node)}>
        <Terminal className="size-3.5" />
        {t('file-tree.open-terminal')}
      </ContextMenuItem>
      {canRevealInFinder ? (
        <ContextMenuItem onSelect={() => void openInFinder(node.absolutePath)}>
          <FolderOpen className="size-3.5" />
          {t('worktrees.reveal-title')}
        </ContextMenuItem>
      ) : null}
      <ContextMenuSeparator />
      <ContextMenuItem disabled={!realNode} onSelect={() => onBeginRename(node)}>
        <Pencil className="size-3.5" />
        {t('file-tree.rename')}
      </ContextMenuItem>
      <ContextMenuItem disabled={!realNode} variant="destructive" onSelect={() => onBeginDelete(node)}>
        <Trash2 className="size-3.5" />
        {t('file-tree.delete')}
      </ContextMenuItem>
    </ContextMenuContent>
  )
}

function FileTreeEmptyContextMenu({
  canUploadFiles,
  onUpload,
  onCreateFile,
  onCreateDirectory,
  onRefresh,
}: {
  canUploadFiles: boolean
  onUpload: () => void
  onCreateFile: () => void
  onCreateDirectory: () => void
  onRefresh: () => void
}) {
  const t = useT()
  return (
    <ContextMenuContent>
      {canUploadFiles ? (
        <ContextMenuItem onSelect={onUpload}>
          <Upload className="size-3.5" />
          {t('file-tree.upload-file')}
        </ContextMenuItem>
      ) : null}
      <ContextMenuItem onSelect={onCreateFile}>
        <FilePlus className="size-3.5" />
        {t('file-tree.new-file')}
      </ContextMenuItem>
      <ContextMenuItem onSelect={onCreateDirectory}>
        <FolderPlus className="size-3.5" />
        {t('file-tree.new-folder')}
      </ContextMenuItem>
      <ContextMenuItem onSelect={onRefresh}>
        <RefreshCw className="size-3.5" />
        {t('file-tree.refresh')}
      </ContextMenuItem>
    </ContextMenuContent>
  )
}

function FileTreeToolbar({
  height,
  onCollapseAll,
  onCreateFile,
  onCreateDirectory,
  onRefresh,
  canOpenLocally,
  onOpenLocal,
  showBootstrapConfigInit,
  initializingBootstrapConfig,
  onInitializeBootstrapConfig,
}: {
  height: FileTreeToolbarHeight
  onCollapseAll: () => void
  onCreateFile: () => void
  onCreateDirectory: () => void
  onRefresh: () => void
  canOpenLocally: boolean
  onOpenLocal: () => void
  showBootstrapConfigInit: boolean
  initializingBootstrapConfig: boolean
  onInitializeBootstrapConfig: () => void
}) {
  const t = useT()
  const { toolbarHeightPx } = useRuntimeChromeSettings()

  return (
    <div
      className={cn(
        'flex shrink-0 items-center gap-1 border-b border-toolbar-border bg-toolbar px-2',
        height === 'detail' ? null : 'min-h-8',
      )}
      style={height === 'detail' ? { height: toolbarHeightPx } : undefined}
    >
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        aria-label={t('file-tree.collapse-all')}
        title={t('file-tree.collapse-all')}
        onClick={onCollapseAll}
      >
        <ListCollapse className="size-3.5" />
      </Button>
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        aria-label={t('file-tree.new-file')}
        title={t('file-tree.new-file')}
        onClick={onCreateFile}
      >
        <FilePlus className="size-3.5" />
      </Button>
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        aria-label={t('file-tree.new-folder')}
        title={t('file-tree.new-folder')}
        onClick={onCreateDirectory}
      >
        <FolderPlus className="size-3.5" />
      </Button>
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        aria-label={t('file-tree.refresh')}
        title={t('file-tree.refresh')}
        onClick={onRefresh}
      >
        <RefreshCw className="size-3.5" />
      </Button>
      {canOpenLocally ? (
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          aria-label={t('file-tree.open-local')}
          title={t('file-tree.open-local')}
          onClick={onOpenLocal}
        >
          <HardDrive className="size-3.5" />
        </Button>
      ) : null}
      {showBootstrapConfigInit ? (
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          aria-label={t('file-tree.init-worktree-bootstrap-config')}
          title={t('file-tree.init-worktree-bootstrap-config')}
          onClick={onInitializeBootstrapConfig}
          disabled={initializingBootstrapConfig}
        >
          <FileCog className="size-3.5" />
        </Button>
      ) : null}
    </div>
  )
}

function FileTreeCreateEntryRow({
  kind,
  depth,
  value,
  pending,
  error,
  onValueChange,
  onCancel,
  onSubmit,
}: {
  kind: CreateEntryKind
  depth: number
  value: string
  pending: boolean
  error: string | null
  onValueChange: (value: string) => void
  onCancel: () => void
  onSubmit: (value?: string) => void
}) {
  const t = useT()
  const Icon = kind === 'file' ? File : Folder
  return (
    <>
      <div
        className="flex h-6 min-w-0 cursor-default select-none items-center gap-1 px-2 text-foreground"
        style={{ paddingLeft: `${8 + depth * 14}px` }}
      >
        <span className="flex size-4 shrink-0 items-center justify-center" />
        <Icon className="size-3.5 shrink-0" />
        <Input
          aria-label={t(kind === 'file' ? 'file-tree.new-file-input-label' : 'file-tree.new-folder-input-label')}
          value={value}
          disabled={pending}
          autoFocus
          onChange={(event) => onValueChange(event.currentTarget.value)}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.key === 'Escape') {
              event.preventDefault()
              onCancel()
            }
            if (event.key === 'Enter') {
              event.preventDefault()
              void onSubmit(event.currentTarget.value)
            }
          }}
          className="h-5 min-w-0 flex-1 px-1 py-0 text-[length:var(--goblin-file-tree-font-size)]"
        />
      </div>
      {error ? <FileTreeIndentedMessage depth={depth + 1}>{t(error)}</FileTreeIndentedMessage> : null}
    </>
  )
}

function FileTreeDeleteDialog({
  targets,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  targets: FileTreeNode[]
  pending: boolean
  error: string | null
  onCancel: () => void
  onConfirm: () => void
}) {
  const t = useT()
  const open = targets.length > 0
  const hasDirectory = targets.some((node) => node.kind === 'directory' || node.targetKind === 'directory')
  const body =
    targets.length === 1
      ? t('file-tree.delete-confirm-single-body').replace('{name}', targets[0]?.name ?? '')
      : t('file-tree.delete-confirm-multiple-body').replace('{count}', String(targets.length))
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel()
      }}
    >
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{t('file-tree.delete-confirm-title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {body}
            {hasDirectory ? <span className="mt-2 block">{t('file-tree.delete-confirm-directory-note')}</span> : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? <div className="text-sm text-danger">{t(error)}</div> : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{t('dialog.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            variant="destructive"
            onClick={(event) => {
              event.preventDefault()
              void onConfirm()
            }}
          >
            {t('file-tree.delete-confirm-confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function FileTreeMessage({ children }: { children: ReactNode }) {
  return (
    <div className="px-3 py-2 text-[length:var(--goblin-file-tree-font-size)] text-muted-foreground">{children}</div>
  )
}

function FileTreeIndentedMessage({ depth, children }: { depth: number; children: ReactNode }) {
  return (
    <div
      className="h-6 truncate px-2 text-[length:var(--goblin-file-tree-font-size)] text-muted-foreground"
      style={{ paddingLeft: `${24 + depth * 14}px` }}
    >
      {children}
    </div>
  )
}

function FileTreeError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="space-y-2 px-3 py-2 text-[length:var(--goblin-file-tree-font-size)] text-danger">
      <div>{message}</div>
      <Button type="button" size="sm" variant="outline" onClick={onRetry}>
        <RefreshCw className="size-3.5" />
      </Button>
    </div>
  )
}

function iconForNode(node: FileTreeNode, expanded: boolean) {
  if (node.kind === 'directory') return expanded ? FolderOpen : Folder
  if (node.kind === 'symlink') return FileSymlink
  return File
}

function isExpandableNode(node: FileTreeNode): boolean {
  return node.kind === 'directory' || (node.kind === 'symlink' && node.targetKind === 'directory')
}

function toneClass(tone?: FileTreeTone): string | undefined {
  switch (tone) {
    case 'attention':
      return 'text-attention'
    case 'success':
      return 'text-success'
    case 'danger':
      return 'text-danger'
    case 'muted':
      return 'text-muted-foreground'
    default:
      return undefined
  }
}

function flattenNodes(nodes: FileTreeNode[]): FileTreeNode[] {
  const result: FileTreeNode[] = []
  for (const node of nodes) {
    result.push(node)
    if (node.expanded && node.children) result.push(...flattenNodes(node.children))
  }
  return result
}

async function copyText(value: string) {
  if (!value) return
  await navigator.clipboard?.writeText(value)
}

async function copyPaths(paths: string[]) {
  await copyText(paths.join('\n'))
}

async function openNodeInEditor(repoId: string, node: FileTreeNode) {
  const editorPath = editorPathForNode(node)
  if (isRemoteRepoId(repoId)) return await openRemoteRepositoryEditor(repoId, editorPath)
  return await openRepositoryEditor(editorPath)
}

async function openNodeInTerminal(repoId: string, node: FileTreeNode) {
  const terminalPath = node.kind === 'directory' ? node.absolutePath : parentDirectoryPath(node.absolutePath)
  if (isRemoteRepoId(repoId)) await openRemoteRepositoryTerminal(repoId, terminalPath)
  else await openRepositoryTerminal(terminalPath)
}

function editorPathForNode(node: FileTreeNode): string {
  return node.absolutePath
}

function isWritableNode(node: FileTreeNode): boolean {
  return node.kind !== 'virtual'
}

function isEditorOpenableFileNode(node: FileTreeNode): boolean {
  return node.kind === 'file' || (node.kind === 'symlink' && node.targetKind === 'file')
}

function isExportableFileNode(node: FileTreeNode): boolean {
  return node.kind === 'file' && node.targetKind !== 'missing'
}

function isPlainFileNode(node: FileTreeNode): boolean {
  return node.kind === 'file' && !node.targetKind
}

function exportableFileNodes(nodes: FileTreeNode[]): FileTreeNode[] {
  return nodes.filter(isExportableFileNode)
}

function parentRelativePathForNode(node: FileTreeNode): string {
  const index = node.relativePath.lastIndexOf('/')
  return index < 0 ? '' : node.relativePath.slice(0, index)
}

function parentAbsolutePathForNode(worktreePath: string, node: FileTreeNode): string {
  const relativeParent = parentRelativePathForNode(node)
  return relativeParent ? `${worktreePath.replace(/\/$/, '')}/${relativeParent}` : worktreePath
}

function renamedRelativePath(node: FileTreeNode, newName: string): string {
  const parent = parentRelativePathForNode(node)
  return parent ? `${parent}/${newName}` : newName
}

function renamedAbsolutePath(node: FileTreeNode, newName: string): string {
  return childPath(parentDirectoryPath(node.absolutePath), newName)
}

function uniqueParentNodes(nodes: FileTreeNode[]): FileTreeNode[] {
  const seen = new Set<string>()
  const result: FileTreeNode[] = []
  for (const node of nodes) {
    const parent = parentRelativePathForNode(node)
    if (seen.has(parent)) continue
    seen.add(parent)
    result.push(node)
  }
  return result
}

function basenamePath(value: string): string {
  const slash = Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\'))
  return slash < 0 ? value : value.slice(slash + 1)
}

function childPath(dirPath: string, name: string): string {
  const separator = dirPath.includes('\\') && !dirPath.includes('/') ? '\\' : '/'
  return `${dirPath.replace(/[\\/]+$/, '')}${separator}${name}`
}

function relativeDirPath(worktreePath: string, dirPath: string): string {
  const normalizedRoot = worktreePath.replace(/[\\/]+$/, '')
  const normalizedDir = dirPath.replace(/[\\/]+$/, '')
  if (normalizedDir === normalizedRoot) return ROOT_DIR
  return normalizedDir
    .slice(normalizedRoot.length + 1)
    .split('\\')
    .join('/')
}

function sourcePathsFromInternalDrop(dataTransfer: DataTransfer): string[] {
  if (!dataTransfer.types.includes(GOBLIN_FILE_PATHS_MIME)) return []
  return parseGoblinFilePathDragPayload(dataTransfer.getData(GOBLIN_FILE_PATHS_MIME))
}

function groupedMoveUndoEntries(entries: Extract<FileTreeUndoAction, { kind: 'move' }>['entries']) {
  const groups = new Map<string, typeof entries>()
  for (const entry of entries) {
    const group = groups.get(entry.originalParentDirPath) ?? []
    group.push(entry)
    groups.set(entry.originalParentDirPath, group)
  }
  return Array.from(groups, ([originalParentDirPath, groupEntries]) => ({
    originalParentDirPath,
    entries: groupEntries,
  }))
}

function isUndoShortcut(event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>): boolean {
  return event.key.toLowerCase() === 'z' && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey
}

function fileContentClipboardShortcut(
  event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>,
): 'copy' | 'replace' | null {
  if (event.altKey || !event.shiftKey || (!event.metaKey && !event.ctrlKey)) return null
  const key = event.key.toLowerCase()
  if (key === 'c') return 'copy'
  if (key === 'v') return 'replace'
  return null
}

function pathParts(relativePath: string): string[] {
  return relativePath.split('/').filter((part) => part.length > 0)
}

function parentRelativePaths(relativePath: string): string[] {
  const parts = pathParts(relativePath)
  const parents: string[] = []
  for (let i = 1; i < parts.length; i += 1) {
    parents.push(parts.slice(0, i).join('/'))
  }
  return parents
}

function findEntry(entries: RepoFileTreeEntry[] | undefined, relativePath: string): RepoFileTreeEntry | null {
  return entries?.find((entry) => entry.relativePath === relativePath) ?? null
}

function fileTreeNodeSelector(id: string): string {
  const escaped =
    typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(id) : id.replace(/["\\]/g, '\\$&')
  return `[data-file-tree-node-id="${escaped}"]`
}

function scheduleFileTreeNodeScroll(id: string) {
  const scroll = () => {
    document.querySelector<HTMLElement>(fileTreeNodeSelector(id))?.scrollIntoView?.({ block: 'nearest' })
  }
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(scroll)
  else window.setTimeout(scroll, 0)
}
