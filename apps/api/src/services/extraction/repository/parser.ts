import type { RepositoryInfo } from "../../interfaces"

export function parseRepositoryUrl(url: string): RepositoryInfo | null {
  try {
    const cleanUrl = url.trim()
    const patterns = [/^https?:\/\/github\.com\/([^\/]+)\/([^\/]+?)(\/.*)?$/, /^github\.com\/([^\/]+)\/([^\/]+?)(\/.*)?$/]
    for (const pattern of patterns) {
      const match = cleanUrl.match(pattern)
      if (match) {
        const owner = match[1]
        let name = match[2]
        const path = match[3] || ''
        name = name.replace(/\.git$/, '')
        let branch: string | undefined
        let filePath: string | undefined
        if (path) {
          const pathMatch = path.match(/^\/(tree|blob)\/([^\/]+)(.*)$/)
          if (pathMatch) {
            branch = pathMatch[2]
            filePath = pathMatch[3] ? pathMatch[3].substring(1) : undefined
          }
        }
        return { owner, name, branch, filePath, url: `https://github.com/${owner}/${name}` }
      }
    }
    return null
  } catch {
    return null
  }
}

export function isRepositoryUrl(url: string): boolean {
  return parseRepositoryUrl(url) !== null
}

