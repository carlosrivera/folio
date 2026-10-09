import type { ParsedDocument, DocumentTheme } from '../lib/document'
import { getTranslations, type SupportedLanguage } from '../lib/i18n'

interface ReportTemplateProps {
  document: ParsedDocument
  overrideTheme?: DocumentTheme
  overrideLang?: SupportedLanguage
}

export function ReportTemplate({
  document,
  overrideTheme,
  overrideLang,
}: ReportTemplateProps) {
  const { metadata, toc } = document
  const lang = overrideLang || metadata.lang || 'en'
  const theme = overrideTheme || metadata.theme || 'editorial'
  const t = getTranslations(lang)

  const showToc = metadata.toc !== false && toc.length > 0
  const kickerLabel = metadata.kicker || t.report

  return (
    <article className={`report-document sow-document theme-${theme}`} data-theme={theme}>
      <header className="cover-page">
        <div className="cover-kicker">
          {kickerLabel} · {metadata.documentId}
        </div>
        <h1>{metadata.title}</h1>
        <p className="cover-client">
          {t.preparedFor} {metadata.client}
        </p>
        <div className="cover-rule" />
        <dl className="cover-details">
          <div>
            <dt>{t.preparedFor}</dt>
            <dd>{metadata.preparedFor || metadata.client}</dd>
          </div>
          <div>
            <dt>{t.preparedBy}</dt>
            <dd>{metadata.preparedBy}</dd>
          </div>
          <div>
            <dt>{t.issued}</dt>
            <dd>{metadata.date}</dd>
          </div>
          {metadata.validUntil && (
            <div>
              <dt>{t.validUntil}</dt>
              <dd>{metadata.validUntil}</dd>
            </div>
          )}
        </dl>
        <div className="cover-accent" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </header>

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
        className="document-body"
        data-client={metadata.client}
        data-document-id={metadata.documentId}
        dangerouslySetInnerHTML={{ __html: document.html }}
      />
    </article>
  )
}

/** Backwards-compatibility alias */
export const StatementTemplate = ReportTemplate
