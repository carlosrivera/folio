import type { DocumentTheme, ParsedDocument } from '../lib/document'
import { renderSelectionFragment } from '../lib/document'
import type { SupportedLanguage } from '../lib/i18n'

/** Hide a repeated opening title, preserving all source positions on the body. */
export function scientificBodyHtml(document: ParsedDocument): string {
  const opening = document.html.match(/^\s*<h1\b[^>]*>([\s\S]*?)<\/h1>\s*/)
  const text = (html: string) => html.replace(/<[^>]*>/g, '').trim()
  return opening && text(opening[1]) === text(renderSelectionFragment(document.metadata.title))
    ? document.html.slice(opening[0].length)
    : document.html
}

export function ScientificTemplate({ document, overrideTheme, overrideLang }: {
  document: ParsedDocument
  overrideTheme?: DocumentTheme
  overrideLang?: SupportedLanguage
}) {
  const { metadata } = document
  const spanish = overrideLang === 'es'
  const theme = overrideTheme || metadata.theme || 'scientific'
  return <article className={`scientific-document theme-${theme}`} data-theme={theme} data-layout="scientific">
    <header className="scientific-title-block">
      {metadata.journal && <p className="scientific-journal">{metadata.journal}</p>}
      <h1>{metadata.title}</h1>
      {metadata.subtitle && <p className="scientific-subtitle">{metadata.subtitle}</p>}
      {(metadata.authors || metadata.preparedBy) && <p className="scientific-authors">{metadata.authors || metadata.preparedBy}</p>}
      {metadata.affiliations && <p className="scientific-affiliations">{metadata.affiliations}</p>}
      {metadata.email && <p className="scientific-contact">{metadata.email}</p>}
      {(metadata.date || metadata.doi) && <p className="scientific-publication">{[metadata.date, metadata.doi && `DOI: ${metadata.doi}`].filter(Boolean).join(' · ')}</p>}
    </header>
    {metadata.abstract && <section className="scientific-abstract" aria-label={spanish ? 'Resumen' : 'Abstract'}>
      <h2>{spanish ? 'Resumen' : 'Abstract'}</h2>
      <div dangerouslySetInnerHTML={{ __html: renderSelectionFragment(metadata.abstract) }} />
    </section>}
    {metadata.keywords && <p className="scientific-keywords"><strong>{spanish ? 'Palabras clave' : 'Keywords'}:</strong> {metadata.keywords}</p>}
    {metadata.toc && document.toc.length > 0 && <nav className="scientific-contents" aria-label={spanish ? 'Contenido' : 'Contents'}>
      {document.toc.filter(item => item.level > 1).map(item => <a key={item.id} href={`#${item.id}`}>{item.text}</a>)}
    </nav>}
    <section className="document-body scientific-body" dangerouslySetInnerHTML={{ __html: scientificBodyHtml(document) }} />
  </article>
}
