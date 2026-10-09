import type { ParsedDocument, DocumentTheme } from '../lib/document'
import { getTranslations, type SupportedLanguage } from '../lib/i18n'

interface InvoiceTemplateProps {
  document: ParsedDocument
  overrideTheme?: DocumentTheme
  overrideLang?: SupportedLanguage
}

export function InvoiceTemplate({
  document,
  overrideTheme,
  overrideLang,
}: InvoiceTemplateProps) {
  const { metadata } = document
  const lang = overrideLang || metadata.lang || 'en'
  const theme = overrideTheme || metadata.theme || 'editorial'
  const t = getTranslations(lang)

  const invoiceNumber = metadata.invoiceNumber || metadata.documentId || 'INV-001'
  const fromName = metadata.from || metadata.preparedBy || metadata.name || (lang === 'es' ? 'Su Empresa' : 'Your Company')
  const clientName = metadata.client || metadata.preparedFor || (lang === 'es' ? 'Cliente' : 'Client')
  const date = metadata.date
  const dueDate = metadata.dueDate || metadata.validUntil
  const status = metadata.status

  const hasTotals = Boolean(metadata.subtotal || metadata.total)

  return (
    <article
      className={`invoice-document theme-${theme}`}
      data-theme={theme}
      data-layout="invoice"
    >
      <header className="invoice-header">
        <div className="invoice-header-top">
          <div className="invoice-issuer">
            <h1 className="invoice-issuer-name">{fromName}</h1>
            {metadata.fromAddress && (
              <div className="invoice-address invoice-issuer-address">
                {metadata.fromAddress.split('\n').map((line, idx) => (
                  <span key={idx}>{line}</span>
                ))}
              </div>
            )}
            <div className="invoice-contact-meta">
              {metadata.fromEmail && <span>{metadata.fromEmail}</span>}
              {metadata.fromPhone && <span>{metadata.fromPhone}</span>}
              {metadata.fromWebsite && <span>{metadata.fromWebsite}</span>}
              {metadata.fromTaxId && (
                <span className="invoice-tax-id">
                  <span className="invoice-tax-label">Tax ID: </span>{metadata.fromTaxId}
                </span>
              )}
            </div>
          </div>

          <div className="invoice-badge-block">
            <div className="invoice-title-row">
              <span className="invoice-title">{t.invoice}</span>
              {status && (
                <span className={`invoice-status-pill status-${status.toLowerCase()}`}>
                  {status}
                </span>
              )}
            </div>
            <div className="invoice-number">#{invoiceNumber}</div>
            <dl className="invoice-meta-dl">
              <div className="invoice-meta-row">
                <dt>{t.invoiceDate}</dt>
                <dd>{date}</dd>
              </div>
              {dueDate && (
                <div className="invoice-meta-row invoice-due-row">
                  <dt>{t.dueDate}</dt>
                  <dd className="invoice-due-value">{dueDate}</dd>
                </div>
              )}
              {metadata.poNumber && (
                <div className="invoice-meta-row">
                  <dt>PO #</dt>
                  <dd>{metadata.poNumber}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>

        <div className="invoice-parties-grid">
          <div className="invoice-party-card invoice-bill-to">
            <span className="invoice-party-label">{t.billTo}</span>
            <div className="invoice-party-name">{clientName}</div>
            {metadata.clientAddress && (
              <div className="invoice-address">
                {metadata.clientAddress.split('\n').map((line, idx) => (
                  <span key={idx}>{line}</span>
                ))}
              </div>
            )}
            <div className="invoice-party-meta">
              {metadata.clientEmail && <span>{metadata.clientEmail}</span>}
              {metadata.clientPhone && <span>{metadata.clientPhone}</span>}
              {metadata.clientTaxId && (
                <span className="invoice-tax-id">
                  <span className="invoice-tax-label">Tax ID: </span>{metadata.clientTaxId}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="invoice-rule" />
      </header>

      <section
        className="document-body invoice-body"
        dangerouslySetInnerHTML={{ __html: document.html }}
      />

      {hasTotals && (
        <aside className="invoice-totals-section">
          <div className="invoice-totals-card">
            {metadata.subtotal && (
              <div className="invoice-total-row">
                <span>Subtotal</span>
                <span>{metadata.subtotal}</span>
              </div>
            )}
            {metadata.tax && (
              <div className="invoice-total-row">
                <span>Tax {metadata.taxRate ? `(${metadata.taxRate})` : ''}</span>
                <span>{metadata.tax}</span>
              </div>
            )}
            {metadata.total && (
              <div className="invoice-total-row invoice-grand-total">
                <span>Total Due</span>
                <span>{metadata.total}</span>
              </div>
            )}
            {metadata.amountDue && metadata.amountDue !== metadata.total && (
              <div className="invoice-total-row invoice-amount-due">
                <span>Amount Due</span>
                <span>{metadata.amountDue}</span>
              </div>
            )}
          </div>
        </aside>
      )}

      {(metadata.paymentTerms || metadata.paymentDetails || metadata.notes) && (
        <footer className="invoice-footer-meta">
          {metadata.paymentTerms && (
            <div className="invoice-terms-block">
              <strong>Terms:</strong> {metadata.paymentTerms}
            </div>
          )}
          {metadata.paymentDetails && (
            <div className="invoice-payment-details">
              {metadata.paymentDetails.split('\n').map((line, idx) => (
                <div key={idx}>{line}</div>
              ))}
            </div>
          )}
          {metadata.notes && (
            <div className="invoice-notes-block">
              <em>{metadata.notes}</em>
            </div>
          )}
        </footer>
      )}
    </article>
  )
}
