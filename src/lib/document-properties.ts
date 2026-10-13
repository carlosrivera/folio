import { parseDocument, isMap } from 'yaml'

/** Preserve unknown keys and YAML comments while applying document controls. */
export function updateDocumentProperties(source: string, values: Record<string, string | boolean>) {
  const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  const document = parseDocument(frontmatter?.[1] ?? '{}')
  if (document.errors.length || !isMap(document.contents)) throw new Error('Fix the YAML front matter before changing document properties.')
  for (const [key, value] of Object.entries(values)) {
    // Canonical keys supersede supported legacy aliases.
    const camel = key.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())
    if (camel !== key) document.delete(camel)
    if (key === 'toc') document.delete('table-of-contents')
    if (key === 'header' || key === 'footer') { document.delete(`page-${key}`); document.delete(`page${key[0].toUpperCase()}${key.slice(1)}`) }
    if (value === '') document.delete(key)
    else document.set(key, value)
  }
  const ending = frontmatter?.[0].includes('\r\n') ? '\r\n' : '\n'
  const yaml = document.toString().trimEnd().replace(/\n/g, ending)
  const body = frontmatter ? source.slice(frontmatter[0].length) : ending + source
  return `---${ending}${yaml}${ending}---${ending}${body}`
}
