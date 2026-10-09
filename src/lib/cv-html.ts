/**
 * Transforms markdown-it HTML output into a structured CV layout:
 * - Detects # Name, subtitle/role, and contacts directly in Markdown body
 * - Groups major sections (##) into rail (heading) + body (content)
 * - Detects dates in or immediately following ### entry headings and pairs them into flex rows
 */

export interface ExtractedCvHeader {
  name?: string
  role?: string
  contactsHtml?: string
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

const DATE_REGEX =
  /^(?:<em>|<strong>|<b>|\*{1,2}|_{1,2})?\s*(?:(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Ene|Abr|Ago|Dic)[a-z]*\.?\s+)?\d{4}\s*(?:[–\-—]|to|a)\s*(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Ene|Abr|Ago|Dic)[a-z]*\.?\s+)?(?:\d{4}|present|presente|actualidad|current)|\d{4}(?:\s*[–\-—]\s*(?:\d{4}|present|presente|actualidad|current))?)(?:\s*(?:·|\||–|-|,)\s*[^<>\n]{2,35})?\s*(?:<\/em>|<\/strong>|<\/b>|\*{1,2}|_{1,2})?$/i

export function isDateLine(text: string): boolean {
  const stripped = text.replace(/<[^>]+>/g, '').trim()
  if (stripped.length === 0 || stripped.length > 50) return false
  return DATE_REGEX.test(stripped) || DATE_REGEX.test(text.trim())
}

/**
 * Cleanly formats contact items if written as a line separated by · or |
 */
export function formatContactBar(paragraphHtml: string): string {
  const clean = paragraphHtml.replace(/^<p\b[^>]*>|<\/p>$/gi, '').trim()
  const parts = clean.split(/\s*(?:·|\||&bull;)\s*/)
  if (parts.length === 0) return paragraphHtml

  return `<div class="cv-contacts">${parts
    .map((part) => {
      const trimmed = part.trim()
      if (!trimmed) return ''
      if (/<a\b/i.test(trimmed)) {
        return trimmed.replace(/<a\b/i, '<a class="cv-contact-item"')
      }
      const isEmail =
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ||
        (/@/.test(trimmed) && !trimmed.includes(' '))
      if (isEmail) {
        return `<a href="mailto:${trimmed}" class="cv-contact-item">${trimmed}</a>`
      }
      const isUrl =
        /^(https?:\/\/|(?:www\.)?(?:linkedin\.com|github\.com|[a-z0-9-]+\.[a-z]{2,}))/i.test(
          trimmed,
        )
      if (isUrl) {
        const href = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`
        return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="cv-contact-item">${trimmed}</a>`
      }
      return `<span class="cv-contact-item">${trimmed}</span>`
    })
    .filter(Boolean)
    .join('')}</div>`
}

/**
 * Transforms standard HTML from markdown body into structured CV DOM markup.
 */
export function transformCvHtml(rawHtml: string): {
  header?: ExtractedCvHeader
  bodyHtml: string
} {
  const trimmed = rawHtml.trim()
  if (!trimmed) return { bodyHtml: '' }

  let html = trimmed
  let headerName: string | undefined
  let headerRole: string | undefined
  let headerContacts: string | undefined

  // 1. Detect # Name at the very top of the markdown body
  const h1Match = html.match(/^<h1\b[^>]*>(.*?)<\/h1>/i)
  if (h1Match) {
    headerName = decodeHtmlEntities(h1Match[1].replace(/<[^>]+>/g, '').trim())
    html = html.slice(h1Match[0].length).trim()

    // Check if immediately followed by role (h2, h3, h4, h5, or short lead paragraph)
    const nextTagMatch = html.match(/^<(h2|h3|h4|h5|p)\b[^>]*>(.*?)<\/\1>/i)
    if (nextTagMatch) {
      const [fullMatch, tag, inner] = nextTagMatch
      const textOnly = inner.replace(/<[^>]+>/g, '').trim()
      const isSectionHeading =
        (tag === 'h2' || tag === 'h3') &&
        /^(summary|resumen|experience|experiencia|education|educación|expertise|skills|habilidades|awards|premios)/i.test(
          textOnly,
        )

      if (!isSectionHeading) {
        headerRole = decodeHtmlEntities(textOnly)
        html = html.slice(fullMatch.length).trim()

        // Check if next is contact paragraph or links
        const contactMatch = html.match(/^<p\b[^>]*>(.*?)<\/p>/i)
        if (contactMatch) {
          const contactInner = contactMatch[1]
          if (/@|linkedin|github|https?:|·|\|/.test(contactInner)) {
            headerContacts = formatContactBar(contactMatch[0])
            html = html.slice(contactMatch[0].length).trim()
          }
        }
      }
    }

    // Drop any trailing <hr> before the first section
    html = html.replace(/^<hr\s*\/?>/i, '').trim()
  }

  // 2. Pair ### entry headings with following date paragraphs
  // Matches: <h3 id="...">Title</h3> followed by <p>(em)?Date(em)?</p>
  html = html.replace(
    /(<h3\b[^>]*>(.*?)<\/h3>)\s*<p\b[^>]*>(.*?)<\/p>/gi,
    (full, h3Tag, _h3Inner, pInner) => {
      if (isDateLine(pInner)) {
        const cleanDate = pInner.replace(/<[^>]+>/g, '').trim()
        return `<div class="cv-entry-head">${h3Tag}<span class="cv-entry-date">${cleanDate}</span></div>`
      }
      return full
    },
  )

  // Also check if h3 itself contains a date separated by | or — or ·
  html = html.replace(
    /<h3(\b[^>]*)>(.*?)\s*(?:\||—|·)\s*(\d{4}(?:\s*[–\-—]\s*(?:\d{4}|present|presente|actualidad|current))?(?:\s*(?:·|\||–|-|,)\s*[^<>\n]{2,35})?)\s*<\/h3>/gi,
    (_full, attrs, title, date) => {
      return `<div class="cv-entry-head"><h3${attrs}>${title.trim()}</h3><span class="cv-entry-date">${date.trim()}</span></div>`
    },
  )

  // 3. Group major sections (##) into rail + body
  // Split on <h2
  const sections = html.split(/(?=<h2\b)/i)
  const transformedSections = sections.map((sec) => {
    const h2Match = sec.match(/^<h2\b[^>]*>(.*?)<\/h2>/i)
    if (!h2Match) {
      const trimmedSec = sec.trim()
      if (!trimmedSec) return ''
      return `<div class="cv-lead-summary">\n${trimmedSec}\n</div>`
    }

    const h2Tag = h2Match[0]
    const content = sec.slice(h2Tag.length).trim().replace(/<hr\s*\/?>\s*$/i, '')

    return `<section class="cv-section">\n  <div class="cv-section-rail">${h2Tag}</div>\n  <div class="cv-section-body">\n${content}\n  </div>\n</section>`
  })

  return {
    header: headerName
      ? { name: headerName, role: headerRole, contactsHtml: headerContacts }
      : undefined,
    bodyHtml: transformedSections.filter(Boolean).join('\n\n'),
  }
}
