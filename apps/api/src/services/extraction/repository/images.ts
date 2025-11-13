import type { RepositoryInfo } from "../../interfaces"

export function extractImagesFromMarkdown(markdown: string, repoInfo: RepositoryInfo): string[] {
  const images: string[] = []
  const markdownImageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g
  let match
  const badgeDomains = [
    'shields.io',
    'img.shields.io',
    'badge.fury.io',
    'badgen.net',
    'developer.stackblitz.com',
    'badge',
    'travis-ci',
    'codecov.io',
    'circleci.com',
    'star-history.com',
    'api.star-history.com',
  ]
  while ((match = markdownImageRegex.exec(markdown)) !== null) {
    const imageUrl = match[2]
    if (imageUrl.startsWith('data:')) continue
    const isBadge = badgeDomains.some((d) => imageUrl.includes(d))
    if (isBadge) continue
    const abs = toAbsoluteImageUrl(imageUrl, repoInfo)
    if (!images.includes(abs)) images.push(abs)
  }
  const htmlImageRegex = /<img[^>]+src=["']([^"']+)["']/gi
  while ((match = htmlImageRegex.exec(markdown)) !== null) {
    const imageUrl = match[1]
    if (imageUrl.startsWith('data:')) continue
    const isBadge = badgeDomains.some((d) => imageUrl.includes(d))
    if (isBadge) continue
    const abs = toAbsoluteImageUrl(imageUrl, repoInfo)
    if (!images.includes(abs)) images.push(abs)
  }
  return images
}

function toAbsoluteImageUrl(imageUrl: string, repoInfo: RepositoryInfo): string {
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) return imageUrl
  const branch = repoInfo.branch || 'main'
  if (imageUrl.startsWith('/')) return `https://raw.githubusercontent.com/${repoInfo.owner}/${repoInfo.name}/${branch}${imageUrl}`
  return `https://raw.githubusercontent.com/${repoInfo.owner}/${repoInfo.name}/${branch}/${imageUrl}`
}

