const MENTION_RE = /@(\w+)/g

export function parseMentions(body: string): string[] {
  const matches = [...body.matchAll(MENTION_RE)]
  return [...new Set(matches.map((m) => m[1]))]
}
