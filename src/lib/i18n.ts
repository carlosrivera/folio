export type SupportedLanguage = 'en' | 'es'

export interface I18nTranslations {
  statementOfWork: string
  report: string
  reportLayout: string
  preparedFor: string
  preparedBy: string
  issued: string
  validUntil: string
  client: string
  page: string
  of: string
  tableOfContents: string
  untitledDocument: string
  previewCaption: string
  open: string
  save: string
  saving: string
  exportPdf: string
  exporting: string
  curriculumVitae: string
  layout: string
  sowLayout: string
  cvLayout: string
  invoice: string
  invoiceNumber: string
  invoiceDate: string
  dueDate: string
  billTo: string
  billFrom: string
  simpleLayout: string
  invoiceLayout: string
}

export const translations: Record<SupportedLanguage, I18nTranslations> = {
  en: {
    statementOfWork: 'Statement of Work',
    report: 'Report',
    reportLayout: 'Report',
    preparedFor: 'Prepared for',
    preparedBy: 'Prepared by',
    issued: 'Issued',
    validUntil: 'Valid until',
    client: 'Client',
    page: 'Page',
    of: '/',
    tableOfContents: 'Table of Contents',
    untitledDocument: 'Untitled document',
    previewCaption: 'Editorial',
    open: 'Open',
    save: 'Save',
    saving: 'Saving…',
    exportPdf: 'Export PDF',
    exporting: 'Exporting…',
    curriculumVitae: 'Curriculum Vitae',
    layout: 'Layout',
    sowLayout: 'Statement of Work',
    cvLayout: 'Curriculum Vitae',
    invoice: 'Invoice',
    invoiceNumber: 'Invoice No.',
    invoiceDate: 'Date',
    dueDate: 'Due Date',
    billTo: 'Bill To',
    billFrom: 'From',
    simpleLayout: 'Simple Document',
    invoiceLayout: 'Invoice',
  },
  es: {
    statementOfWork: 'Propuesta de Trabajo',
    report: 'Informe',
    reportLayout: 'Informe',
    preparedFor: 'Preparado para',
    preparedBy: 'Preparado por',
    issued: 'Fecha de emisión',
    validUntil: 'Válido hasta',
    client: 'Cliente',
    page: 'Página',
    of: 'de',
    tableOfContents: 'Índice de Contenido',
    untitledDocument: 'Documento sin título',
    previewCaption: 'Editorial',
    open: 'Abrir',
    save: 'Guardar',
    saving: 'Guardando…',
    exportPdf: 'Exportar PDF',
    exporting: 'Exportando…',
    curriculumVitae: 'Currículum Vitae',
    layout: 'Diseño',
    sowLayout: 'Propuesta de Trabajo',
    cvLayout: 'Currículum Vitae',
    invoice: 'Factura',
    invoiceNumber: 'Nº Factura',
    invoiceDate: 'Fecha',
    dueDate: 'Vencimiento',
    billTo: 'Facturar a',
    billFrom: 'De',
    simpleLayout: 'Documento Simple',
    invoiceLayout: 'Factura',
  },
}

export function getTranslations(lang?: string | null): I18nTranslations {
  const normalized = (lang || '').toLowerCase().trim()
  if (normalized.startsWith('es')) return translations.es
  return translations.en
}
