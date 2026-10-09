import type { ParsedDocument, DocumentTheme } from '../lib/document'
import { getTranslations, type SupportedLanguage } from '../lib/i18n'
import { transformCvHtml } from '../lib/cv-html'

interface CvTemplateProps {
  document: ParsedDocument
  overrideTheme?: DocumentTheme
  overrideLang?: SupportedLanguage
}

export function CvTemplate({
  document,
  overrideTheme,
  overrideLang,
}: CvTemplateProps) {
  const { metadata, toc } = document
  const lang = overrideLang || metadata.lang || 'en'
  const theme = overrideTheme || metadata.theme || 'editorial'
  const t = getTranslations(lang)

  // Transform raw html: detects leading # Name / Role / Contacts from markdown body,
  // pairs h3 with following dates into .cv-entry-head, and groups sections into .cv-section
  const { header: bodyHeader, bodyHtml } = transformCvHtml(document.html)

  // Candidate Name: extracted from markdown # Name, or frontmatter
  const name = bodyHeader?.name || metadata.name || metadata.title
  // Candidate Role: extracted from markdown subtitle/role, or frontmatter
  const role = bodyHeader?.role || metadata.role || metadata.subtitle || metadata.tagline

  const hasFrontmatterContacts = Boolean(
    metadata.email ||
    metadata.phone ||
    metadata.location ||
    metadata.linkedin ||
    metadata.github ||
    metadata.website ||
    metadata.url
  )

  const hasHeader = Boolean(name || role || hasFrontmatterContacts || bodyHeader?.contactsHtml)
  const showToc = metadata.toc === true && toc.length > 0

  return (
    <article
      className={`cv-document theme-${theme}${hasHeader ? ' cv-has-header' : ''}`}
      data-theme={theme}
      data-layout="cv"
    >
      {hasHeader && (
        <header className="cv-header">
          {name && <h1 className="cv-name">{name}</h1>}
          {role && <p className="cv-role">{role}</p>}

          {bodyHeader?.contactsHtml ? (
            <div dangerouslySetInnerHTML={{ __html: bodyHeader.contactsHtml }} />
          ) : hasFrontmatterContacts ? (
            <div className="cv-contacts">
              {metadata.email && (
                <a
                  href={`mailto:${metadata.email}`}
                  className="cv-contact-item"
                  title="Email"
                >
                  <span className="cv-contact-icon">✉</span>
                  <span>{metadata.email}</span>
                </a>
              )}
              {metadata.phone && (
                <a
                  href={`tel:${metadata.phone}`}
                  className="cv-contact-item"
                  title="Phone"
                >
                  <span className="cv-contact-icon">☎</span>
                  <span>{metadata.phone}</span>
                </a>
              )}
              {metadata.location && (
                <span className="cv-contact-item" title="Location">
                  <span className="cv-contact-icon">📍</span>
                  <span>{metadata.location}</span>
                </span>
              )}
              {metadata.linkedin && (
                <a
                  href={metadata.linkedin.startsWith('http') ? metadata.linkedin : `https://${metadata.linkedin}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cv-contact-item"
                  title="LinkedIn"
                >
                  <span className="cv-contact-icon">in</span>
                  <span>{metadata.linkedin.replace(/^https?:\/\/(www\.)?/, '')}</span>
                </a>
              )}
              {metadata.github && (
                <a
                  href={metadata.github.startsWith('http') ? metadata.github : `https://${metadata.github}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cv-contact-item"
                  title="GitHub"
                >
                  <span className="cv-contact-icon">gh</span>
                  <span>{metadata.github.replace(/^https?:\/\/(www\.)?/, '')}</span>
                </a>
              )}
              {(metadata.website || metadata.url) && (
                <a
                  href={(metadata.website || metadata.url)!.startsWith('http')
                    ? (metadata.website || metadata.url)!
                    : `https://${metadata.website || metadata.url}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cv-contact-item"
                  title="Website"
                >
                  <span className="cv-contact-icon">🌐</span>
                  <span>{(metadata.website || metadata.url)!.replace(/^https?:\/\/(www\.)?/, '')}</span>
                </a>
              )}
            </div>
          ) : null}

          <div className="cv-header-rule" aria-hidden="true">
            <span className="cv-header-rule-accent" />
          </div>
        </header>
      )}

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
        className="document-body cv-body"
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />
    </article>
  )
}
