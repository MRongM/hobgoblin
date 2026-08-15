import { Fragment, type ReactNode } from 'react'
import { Folder } from 'lucide-react'
import { cn } from '#/web/lib/cn.ts'

interface FilePathTreeListProps<T> {
  items: T[]
  getPath: (item: T) => string
  renderFile: (row: FilePathTreeFileRow<T>) => ReactNode
  renderDirectory?: (row: FilePathTreeDirectoryRow) => ReactNode
  className?: string
}

export interface FilePathTreeFileRow<T> {
  kind: 'file'
  id: string
  name: string
  path: string
  depth: number
  item: T
}

export interface FilePathTreeDirectoryRow {
  kind: 'directory'
  name: string
  path: string
  depth: number
}

type FilePathTreeRow<T> = FilePathTreeDirectoryRow | FilePathTreeFileRow<T>

interface MutableDirectory<T> {
  kind: 'directory'
  name: string
  path: string
  children: Array<MutableDirectory<T> | MutableFile<T>>
  directories: Map<string, MutableDirectory<T>>
}

interface MutableFile<T> {
  kind: 'file'
  id: string
  name: string
  path: string
  item: T
}

export function buildFilePathTreeRows<T>(items: T[], getPath: (item: T) => string): FilePathTreeRow<T>[] {
  const root: MutableDirectory<T> = {
    kind: 'directory',
    name: '',
    path: '',
    children: [],
    directories: new Map(),
  }

  items.forEach((item, index) => {
    const path = getPath(item)
    const parts = path.split('/').filter(Boolean)
    if (parts.length === 0) {
      root.children.push({ kind: 'file', id: `${index}:`, name: path, path, item })
      return
    }

    let directory = root
    let directoryPath = ''
    for (const part of parts.slice(0, -1)) {
      directoryPath = directoryPath ? `${directoryPath}/${part}` : part
      let next = directory.directories.get(part)
      if (!next) {
        next = {
          kind: 'directory',
          name: part,
          path: directoryPath,
          children: [],
          directories: new Map(),
        }
        directory.directories.set(part, next)
        directory.children.push(next)
      }
      directory = next
    }

    const name = parts.at(-1) ?? path
    directory.children.push({ kind: 'file', id: `${index}:${path}`, name, path, item })
  })

  return flattenTreeRows(root.children, 0)
}

export function FilePathTreeList<T>({
  items,
  getPath,
  renderFile,
  renderDirectory,
  className,
}: FilePathTreeListProps<T>) {
  const rows = buildFilePathTreeRows(items, getPath)

  return (
    <ul className={className}>
      {rows.map((row) =>
        row.kind === 'directory' ? (
          renderDirectory ? (
            <Fragment key={`dir:${row.path}`}>{renderDirectory(row)}</Fragment>
          ) : (
            <li
              key={`dir:${row.path}`}
              data-file-folder-path={row.path}
              className="flex min-h-6 items-center gap-1.5 pr-2 text-xs text-muted-foreground"
              style={{ paddingLeft: `${0.5 + row.depth * 1}rem` }}
            >
              <Folder size={13} className="shrink-0" />
              <span className="min-w-0 truncate font-mono">{row.name}</span>
            </li>
          )
        ) : (
          <Fragment key={`file:${row.id}`}>{renderFile(row)}</Fragment>
        ),
      )}
    </ul>
  )
}

function flattenTreeRows<T>(nodes: Array<MutableDirectory<T> | MutableFile<T>>, depth: number): FilePathTreeRow<T>[] {
  const rows: FilePathTreeRow<T>[] = []
  for (const node of nodes) {
    if (node.kind === 'directory') {
      rows.push({ kind: 'directory', name: node.name, path: node.path, depth })
      rows.push(...flattenTreeRows(node.children, depth + 1))
    } else {
      rows.push({ kind: 'file', id: node.id, name: node.name, path: node.path, depth, item: node.item })
    }
  }
  return rows
}

export function fileTreeRowPadding(depth: number): string {
  return `${0.5 + depth * 1}rem`
}

export const FILE_TREE_FILE_NAME_CLASS = cn('min-w-0 truncate font-mono text-sm text-foreground')
