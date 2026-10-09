import { describe, expect, it } from 'vitest'
import { isDateLine, transformCvHtml } from './cv-html'

describe('cv-html transformer', () => {
  it('identifies date lines accurately', () => {
    expect(isDateLine('2025 – Present')).toBe(true)
    expect(isDateLine('<em>2022 – 2024</em>')).toBe(true)
    expect(isDateLine('2012')).toBe(true)
    expect(isDateLine('Jan 2020 – Dec 2022')).toBe(true)
    expect(isDateLine('2025 – Present | San Francisco, CA')).toBe(true)
    expect(isDateLine('<em>2022 – 2024 · Remote</em>')).toBe(true)
    expect(isDateLine('Not a date line')).toBe(false)
    expect(isDateLine('This is a longer paragraph about engineering in 2025')).toBe(false)
  })

  it('extracts top # Name, role, and contacts from markdown HTML with entity decoding', () => {
    const rawHtml = `
      <h1 id="john-doe">John Doe</h1>
      <p>Technology &amp; Engineering Leader | CTO | Product Architecture &amp; AI</p>
      <p>john@johndoe.dev · linkedin.com/in/johndoe · github.com/johndoe</p>
      <hr>
      <h2 id="summary">Summary</h2>
      <p>Experienced founder and CTO.</p>
    `
    const result = transformCvHtml(rawHtml)
    expect(result.header?.name).toBe('John Doe')
    expect(result.header?.role).toBe('Technology & Engineering Leader | CTO | Product Architecture & AI')
    expect(result.header?.contactsHtml).toContain('cv-contacts')
    expect(result.header?.contactsHtml).toContain('mailto:john@johndoe.dev')
    expect(result.header?.contactsHtml).toContain('https://linkedin.com/in/johndoe')
    expect(result.header?.contactsHtml).toContain('https://github.com/johndoe')
    expect(result.bodyHtml).toContain('cv-section-rail')
    expect(result.bodyHtml).toContain('cv-section-body')
  })

  it('pairs h3 and date paragraphs into cv-entry-head flex row', () => {
    const rawHtml = `
      <h2 id="experience">Experience</h2>
      <h3 id="halcyon">Halcyon | VP of Engineering</h3>
      <p><em>2025 – Present · San Francisco, CA</em></p>
      <p>Led early architecture.</p>
    `
    const result = transformCvHtml(rawHtml)
    expect(result.bodyHtml).toContain(
      '<div class="cv-entry-head"><h3 id="halcyon">Halcyon | VP of Engineering</h3><span class="cv-entry-date">2025 – Present · San Francisco, CA</span></div>'
    )
    expect(result.bodyHtml).toContain('<p>Led early architecture.</p>')
  })

  it('handles h4 roles, bold date lines, lead summary, and strips trailing hr from sections', () => {
    const rawHtml = `
      <h1 id="john-doe">John Doe</h1>
      <h4>AI Platform Architect | AI Strategy Lead</h4>
      <p>Executive AI leader.</p>
      <hr>
      <h2 id="expertise">Technical Expertise</h2>
      <h5>AI Architectures</h5>
      <p>LLMs, MCP, LangGraph.</p>
      <hr>
      <h2 id="experience">Professional Experience</h2>
      <h3 id="halcyon">Halcyon — VP of Engineering</h3>
      <p><strong>Feb 2025 – Present</strong></p>
      <p>Agentic platform.</p>
    `
    const result = transformCvHtml(rawHtml)
    expect(result.header?.name).toBe('John Doe')
    expect(result.header?.role).toBe('AI Platform Architect | AI Strategy Lead')
    expect(result.bodyHtml).toContain('<div class="cv-lead-summary">')
    expect(result.bodyHtml).toContain(
      '<div class="cv-entry-head"><h3 id="halcyon">Halcyon — VP of Engineering</h3><span class="cv-entry-date">Feb 2025 – Present</span></div>'
    )
    // Technical Expertise section should have its trailing hr removed
    expect(result.bodyHtml).not.toMatch(/<h5>AI Architectures<\/h5>[\s\S]*?<hr>\s*<\/div>/)
  })
})
