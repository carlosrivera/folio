import type { ParsedDocument, DocumentTheme } from '../lib/document'
import { getTranslations, type SupportedLanguage } from '../lib/i18n'

interface SimpleTemplateProps {
  document: ParsedDocument
  overrideTheme?: DocumentTheme
  overrideLang?: SupportedLanguage
}

export function SimpleTemplate({
  document,
  overrideTheme,
  overrideLang,
}: SimpleTemplateProps) {
  const { metadata, toc } = document
  const lang = overrideLang || metadata.lang || 'en'
  const theme = overrideTheme || metadata.theme || 'editorial'
  const t = getTranslations(lang)

  const showToc = metadata.toc === true && toc.length > 0

  return (
    <article
      className={`simple-document theme-${theme}`}
      data-theme={theme}
      data-layout="simple"
    >
      {showToc && (
        <section className="folio-toc-page">
          <div className="folio-toc-header">
            <span className="folio-toc-mark">{theme === 'voltage' ? 'TOC_01' : '00'}</span>
            <h2>{t.tableOfContents}</h2>
          </div>
          <nav className="folio-toc-list" aria-label={t.tableOfContents}>
            {toc.map((item) => (
              <div
                key={item.id}
                className={`folio-toc-row folio-toc-level-${item.level}`}
              >
                <a href={`#${item.id}`} className="folio-toc-link">
                  <span className="folio-toc-title">{item.text}</span>
                  <span className="folio-toc-dots" aria-hidden="true" />
                  <span className="folio-toc-page-num" />
                </a>
              </div>
            ))}
          </nav>
        </section>
      )}

      <section
        className="document-body simple-body"
        dangerouslySetInnerHTML={{ __html: document.html }}
      />
    </article>
  )
}
