export type FileTreeNode = { path: string; name: string; type: 'directory' | 'file'; size?: number; children?: FileTreeNode[] }

export function buildFileTree(items: Array<{ path: string; type: 'blob' | 'tree'; size?: number }>): FileTreeNode[] {
  const root: FileTreeNode[] = []
  const map = new Map<string, FileTreeNode>()
  const sorted = [...items].sort((a, b) => a.path.split('/').length - b.path.split('/').length)
  for (const item of sorted) {
    const parts = item.path.split('/')
    const name = parts[parts.length - 1]
    const parentPath = parts.slice(0, -1).join('/')
    const node: FileTreeNode = { path: item.path, name, type: item.type === 'tree' ? 'directory' : 'file', size: item.size }
    if (item.type === 'tree') node.children = []
    map.set(item.path, node)
    if (parentPath) {
      const parent = map.get(parentPath)
      if (parent && parent.children) parent.children.push(node)
    } else {
      root.push(node)
    }
  }
  return root
}

export function formatFileTree(nodes: FileTreeNode[], indent = ''): string {
  const lines: string[] = []
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    const last = i === nodes.length - 1
    const prefix = last ? '└── ' : '├── '
    const childIndent = indent + (last ? '    ' : '│   ')
    const icon = node.type === 'directory' ? '📁' : '📄'
    const sizeInfo = node.size ? ` (${formatFileSize(node.size)})` : ''
    lines.push(`${indent}${prefix}${icon} ${node.name}${sizeInfo}`)
    if (node.children && node.children.length > 0) lines.push(formatFileTree(node.children, childIndent))
  }
  return lines.join('\n')
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

export function countFiles(nodes: FileTreeNode[]): number {
  let count = 0
  for (const node of nodes) {
    if (node.type === 'file') count++
    if (node.children) count += countFiles(node.children)
  }
  return count
}

