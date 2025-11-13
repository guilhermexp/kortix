import { safeFetch } from "../../../security/url-validator"
import type { RepositoryInfo } from "../../interfaces"

type GitHubFile = { type: 'file' | 'dir'; content?: string; encoding?: string; download_url?: string | null }

export async function fetchFileContent(repoInfo: RepositoryInfo, filePath: string, apiRequester: (url: string) => Promise<Response>): Promise<string> {
  const branch = repoInfo.branch || 'main'
  const apiUrl = `${repoInfo.url.replace('https://github.com/', 'https://api.github.com/repos/')}/contents/${filePath}?ref=${branch}`
  const response = await apiRequester(apiUrl)
  const data = (await response.json()) as GitHubFile
  if (data.type !== 'file') throw new Error(`${filePath} is not a file`)
  if (!data.content || !data.encoding) {
    if (data.download_url) {
      const contentResponse = await safeFetch(data.download_url)
      return await contentResponse.text()
    }
    throw new Error(`No content available for ${filePath}`)
  }
  if (data.encoding === 'base64') return Buffer.from(data.content, 'base64').toString('utf-8')
  return data.content
}
