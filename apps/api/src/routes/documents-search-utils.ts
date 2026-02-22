export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

export function matchesNormalizedSearch(
  doc: {
    title?: string | null;
    summary?: string | null;
    content?: string | null;
  },
  normalizedQuery: string,
): boolean {
  const candidates = [doc.title, doc.summary, doc.content];
  for (const text of candidates) {
    if (!text) continue;
    if (normalizeSearchText(text).includes(normalizedQuery)) return true;
  }
  return false;
}
