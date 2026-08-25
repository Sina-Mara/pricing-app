import jsPDF from 'jspdf'
import autoTable, { type CellHookData } from 'jspdf-autotable'
import { supabase } from './supabase'
import { formatCurrency, formatDate } from './utils'
import { round2 } from './pricing'
import { groupQuoteItems } from './quote-item-grouping'
import type { Quote, QuotePackage, QuoteItem, Customer, Sku } from '@/types/database'
import cennsoLogoUrl from '@/assets/cennso-logo.png'

type QuoteWithDetails = Quote & {
  customer: Customer | null
  quote_packages: (QuotePackage & { quote_items: (QuoteItem & { sku: Sku })[] })[]
}

/** Cennso Technologies GmbH legal entity details — same block used on the company's ERP-issued offers. */
const LEGAL = {
  addressLine: 'Cennso Technologies GmbH  -  Südstr. 6  -  39179 Barleben',
  geschaeftsfuehrung: 'Holger Winkelmann',
  registrierung: 'Amtsgericht Stendal',
  registernummer: 'HRB 5354',
  ustId: 'DE250071497',
  telefon: '+49 (391) 66098-560',
  mail: 'sales@cennso.com',
}

/** Payment-cadence tiers surfaced as full period-by-period schedules — kept to the three
 * billing frequencies a customer actually chooses between; the full tier table
 * (24/36/48/60mo) is a commitment-length concept, not a billing-frequency one, and
 * stays out of scope here. */
const PAYMENT_SCHEDULE_TIERS: { label: string; periodLabel: string; months: number }[] = [
  { label: 'Monthly', periodLabel: 'Month', months: 1 },
  { label: 'Quarterly', periodLabel: 'Quarter', months: 3 },
  { label: 'Annual', periodLabel: 'Year', months: 12 },
]

/** Adds calendar months to a date, clamping the day-of-month at the target month's
 * length instead of overflowing (e.g. Jan 31 + 1 month → Feb 28/29, not Mar 3). */
function addMonthsClamped(date: Date, months: number): Date {
  const day = date.getDate()
  const result = new Date(date.getFullYear(), date.getMonth() + months, 1)
  const lastDayOfTargetMonth = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate()
  result.setDate(Math.min(day, lastDayOfTargetMonth))
  return result
}

/** Item table is sectioned by SKU category, in this fixed display order. */
const CATEGORY_SECTION_ORDER: Array<'ccs' | 'cas' | 'cno'> = ['ccs', 'cas', 'cno']
const CATEGORY_SECTION_LABELS: Record<string, string> = {
  ccs: 'CCS — Cennso Care Service',
  cas: 'CAS — Cennso Application Support',
  cno: 'CNO — Cennso Network Operations',
}

/** Within the CCS section specifically, the 24/7 support SKUs sort last (they're
 * ordinary CCS-category items, not a separate section — just kept at the end of it). */
const CCS_SORT_LAST_CODES = new Set(['ccs-24/7-m1', 'ccs-24/7-add-h1'])

const ITEM_TABLE_COLUMNS = 6 // SKU, Description, Qty, Unit Price, CNS Discount, Monthly

const INK: [number, number, number] = [30, 41, 59]
const MUTED: [number, number, number] = [100, 116, 139]
const ACCENT: [number, number, number] = [27, 95, 168]
const GREEN: [number, number, number] = [22, 163, 74]
const RULE: [number, number, number] = [203, 213, 225]

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load logo image'))
    img.src = url
  })
}

async function loadCadenceFactors(months: number[]): Promise<Map<number, number>> {
  const { data, error } = await supabase
    .from('payment_cadence_factors')
    .select('upfront_months, discount_pct')
    .in('upfront_months', months)

  const factors = new Map<number, number>()
  if (!error && data) {
    for (const row of data) factors.set(row.upfront_months, row.discount_pct)
  }
  return factors
}

function formatCustomerDiscount(item: QuoteItem): string {
  if (item.customer_discount_value == null) return '-'
  return item.customer_discount_type === 'percent'
    ? `-${item.customer_discount_value}%`
    : `-${formatCurrency(item.customer_discount_value)}`
}

/**
 * jspdf-autotable's `columnStyles` only applies to body cells, never head cells
 * (see its internal `colStyles = sectionName === 'body' ? columnStyles : {}`) —
 * so a right-aligned numeric column otherwise ends up with a left-aligned header
 * sitting above it. This forces the given column indices' header cells to match.
 */
function rightAlignHeaderColumns(columnIndexes: number[]) {
  return (data: CellHookData) => {
    if ((data.section === 'head' || data.section === 'foot') && columnIndexes.includes(data.column.index)) {
      data.cell.styles.halign = 'right'
    }
  }
}

export async function generateQuotePDF(quote: QuoteWithDetails, startDate: string) {
  // Built from local date components rather than `new Date(startDate)`: a bare
  // "YYYY-MM-DD" string parses as UTC midnight, which formatDate (rendering in
  // the local timezone) can then display as the previous day in zones ahead of UTC.
  const [startYear, startMonth, startDay] = startDate.split('-').map(Number)
  const scheduleStartDate = new Date(startYear, startMonth - 1, startDay)
  const doc = new jsPDF({ orientation: 'landscape' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const marginX = 20
  const rightX = pageWidth - marginX
  const pageBottom = pageHeight - 20
  let y = 16

  const ensureSpace = (needed: number) => {
    if (y + needed > pageBottom) {
      doc.addPage()
      y = 20
    }
  }

  // ── Letterhead ──────────────────────────────────────────────────────────
  try {
    const logo = await loadImage(cennsoLogoUrl)
    const logoW = 38
    const logoH = logoW * (logo.height / logo.width)
    doc.addImage(logo, 'PNG', marginX, y, logoW, logoH)
  } catch {
    // Fall back to a styled wordmark if the logo asset can't be loaded
    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...ACCENT)
    doc.text('CENNSO', marginX, y + 7)
  }

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...MUTED)
  const legalRows: [string, string][] = [
    ['Geschäftsführung', LEGAL.geschaeftsfuehrung],
    ['Registrierung', LEGAL.registrierung],
    ['Registernummer', LEGAL.registernummer],
    ['UStID-Nr', LEGAL.ustId],
    ['Telefon', LEGAL.telefon],
    ['Mail', LEGAL.mail],
  ]
  let legalY = 14
  for (const [label, value] of legalRows) {
    doc.text(label, rightX - 62, legalY)
    doc.text(value, rightX, legalY, { align: 'right' })
    legalY += 4
  }

  y += 13
  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  doc.text(LEGAL.addressLine, marginX, y)
  doc.setTextColor(...INK)

  y += 12

  // ── Customer address (left) + rate sheet metadata (right) ──────────────
  const blockTopY = y

  if (quote.customer) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...INK)
    doc.text('Firma', marginX, y)
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.text(quote.customer.name, marginX, y)
    y += 4.5
    if (quote.customer.company) {
      doc.text(quote.customer.company, marginX, y)
      y += 4.5
    }
    if (quote.customer.address) {
      doc.text(quote.customer.address, marginX, y)
      y += 4.5
    }
    if (quote.customer.email) {
      doc.text(quote.customer.email, marginX, y)
      y += 4.5
    }
  }

  let metaY = blockTopY
  const metaRow = (label: string, value: string, bold = false) => {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...MUTED)
    doc.text(label, rightX - 45, metaY)
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setTextColor(...INK)
    doc.text(value, rightX, metaY, { align: 'right' })
    metaY += 5
  }
  metaRow('Date', formatDate(quote.created_at), true)
  metaRow('Rate Sheet', quote.quote_number, true)
  if (quote.valid_until) metaRow('Valid Until', formatDate(quote.valid_until))
  metaRow('Status', quote.status.toUpperCase())

  y = Math.max(y, metaY) + 14

  // ── Rate Sheet heading ───────────────────────────────────────────────────
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.text(`Rate Sheet ${quote.quote_number}`, marginX, y)
  y += 8

  // ── Packages ─────────────────────────────────────────────────────────────
  for (const pkg of quote.quote_packages) {
    if (!pkg.include_in_quote) continue

    ensureSpace(30)

    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...INK)
    doc.text(pkg.package_name, marginX, y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...MUTED)
    doc.text(`Term: ${pkg.term_months} months`, rightX, y, { align: 'right' })
    doc.setTextColor(...INK)
    y += 5

    // Solution → Application → Component ordering (groupQuoteItems) gives the item order
    // used *within* each section; the sections themselves are by category, fixed order
    // CCS → CAS → CNO, per review feedback. Within CCS specifically, the 24/7 support
    // SKUs sort last — they're ordinary CCS items, not a section of their own.
    const groupOrderedItems = groupQuoteItems(pkg.quote_items)
      .filter((row) => row.type === 'item')
      .map((row) => row.item)

    const sectionedItems: { label: string; items: typeof groupOrderedItems }[] = []
    const seenCategories = new Set<string>()
    for (const cat of CATEGORY_SECTION_ORDER) {
      seenCategories.add(cat)
      const itemsInCategory = groupOrderedItems.filter((item) => (item.sku?.category ?? 'default') === cat)
      if (itemsInCategory.length === 0) continue
      const items = cat === 'ccs'
        ? [
            ...itemsInCategory.filter((item) => !CCS_SORT_LAST_CODES.has(item.sku?.code ?? '')),
            ...itemsInCategory.filter((item) => CCS_SORT_LAST_CODES.has(item.sku?.code ?? '')),
          ]
        : itemsInCategory
      sectionedItems.push({ label: CATEGORY_SECTION_LABELS[cat], items })
    }
    // Anything outside CCS/CAS/CNO (e.g. category 'default') still needs to render somewhere
    const otherItems = groupOrderedItems.filter((item) => !seenCategories.has(item.sku?.category ?? 'default'))
    if (otherItems.length > 0) sectionedItems.push({ label: 'Other', items: otherItems })

    const tableBody: any[] = []
    for (const section of sectionedItems) {
      tableBody.push([
        {
          content: section.label,
          colSpan: ITEM_TABLE_COLUMNS,
          styles: { fontStyle: 'bold' as const, fillColor: [241, 245, 249] as [number, number, number] },
        },
      ])
      for (const item of section.items) {
        tableBody.push([
          item.sku?.code || '',
          item.sku?.description || '',
          item.quantity.toString(),
          item.unit_price ? formatCurrency(item.unit_price) : '-',
          formatCustomerDiscount(item),
          item.monthly_total ? formatCurrency(item.monthly_total) : '-',
        ])
      }
    }

    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      head: [['SKU', 'Description', 'Qty', 'Unit Price', 'CNS Discount', 'Monthly']],
      body: tableBody,
      theme: 'plain',
      styles: {
        fontSize: 9,
        textColor: INK,
        lineColor: RULE,
      },
      headStyles: {
        fontStyle: 'bold',
        textColor: INK,
        lineWidth: { bottom: 0.4 },
        lineColor: INK,
      },
      columnStyles: {
        // SKU codes now follow a longer <category>-<component>-<metric>-<period>
        // scheme (e.g. "cas-cennso-vcore-m1", 19 chars) — wider column + smaller
        // font than the rest of the table so codes don't wrap mid-word.
        0: { cellWidth: 45, fontSize: 8 },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 18, halign: 'right' },
        3: { cellWidth: 28, halign: 'right' },
        4: { cellWidth: 28, halign: 'right' },
        5: { cellWidth: 28, halign: 'right' },
      },
      didParseCell: rightAlignHeaderColumns([2, 3, 4, 5]),
    })

    y = (doc as any).lastAutoTable.finalY + 2
    doc.setDrawColor(...RULE)
    doc.setLineWidth(0.2)
    doc.line(marginX, y, rightX, y)
    y += 6

    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('Package Subtotal', marginX, y)
    doc.text(`${formatCurrency(pkg.subtotal_monthly)}/month`, rightX, y, { align: 'right' })
    y += 5
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...MUTED)
    doc.text(`Annual: ${formatCurrency(pkg.subtotal_annual)}`, rightX, y, { align: 'right' })
    doc.setTextColor(...INK)
    y += 12

    ensureSpace(1)
  }

  // ── Grand Total ──────────────────────────────────────────────────────────
  ensureSpace(20)

  doc.setDrawColor(...INK)
  doc.setLineWidth(0.4)
  doc.line(marginX, y, rightX, y)
  y += 9

  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.text('Grand Total', marginX, y)
  doc.text(`${formatCurrency(quote.total_monthly)}/month`, rightX, y, { align: 'right' })
  y += 6
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...MUTED)
  doc.text(`Annual: ${formatCurrency(quote.total_annual)}`, rightX, y, { align: 'right' })
  doc.setTextColor(...INK)

  // ── Contract total, payment cadence discount, customer discount ────────
  const maxTerm = quote.quote_packages.length > 0
    ? Math.max(...quote.quote_packages.map((p) => p.term_months))
    : 0
  const rawContractTotal = quote.total_monthly * maxTerm

  const hasCustomerDiscount =
    quote.customer_discount_amount != null && quote.customer_discount_amount > 0

  const customerDiscountAmount = hasCustomerDiscount ? quote.customer_discount_amount! : 0

  if (hasCustomerDiscount) {
    ensureSpace(30)
    y += 9
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(`Contract Total (${maxTerm} months)`, marginX, y)
    doc.text(formatCurrency(rawContractTotal), rightX, y, { align: 'right' })

    y += 6
    const label =
      quote.customer_discount_type === 'percent'
        ? `-${quote.customer_discount_value}%`
        : `-${formatCurrency(quote.customer_discount_value ?? 0)}`
    doc.setTextColor(...GREEN)
    doc.text(`CNS Discount (${label})`, marginX, y)
    doc.text(`-${formatCurrency(customerDiscountAmount)}`, rightX, y, { align: 'right' })
    doc.setTextColor(...INK)

    y += 7
    doc.setDrawColor(...RULE)
    doc.setLineWidth(0.2)
    doc.line(marginX, y - 4, rightX, y - 4)
    doc.setFont('helvetica', 'bold')
    doc.text('Discounted Contract Total', marginX, y)
    doc.text(
      formatCurrency(rawContractTotal - customerDiscountAmount),
      rightX,
      y,
      { align: 'right' }
    )
    doc.setFont('helvetica', 'normal')
  }

  // ── Payment Schedule (Monthly / Quarterly / Annual, full period list) ──
  // Lists every individual payment for each billing frequency, not just a
  // one-line comparison — lets finance/procurement match against invoices.
  if (quote.quote_type === 'commitment' && maxTerm > 0) {
    const cadenceFactors = await loadCadenceFactors(PAYMENT_SCHEDULE_TIERS.map((t) => t.months))

    ensureSpace(20)
    y += 10
    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...INK)
    doc.text('Payment Schedule', marginX, y)
    y += 8

    // Computed up front so every cadence's "Total Saved" line can compare
    // against Monthly's discounted total without recomputing it per tier (D4).
    const discountedTotalsByMonths = new Map<number, number>()
    for (const tier of PAYMENT_SCHEDULE_TIERS) {
      const discountPct = cadenceFactors.get(tier.months) ?? 0
      const discountAmount = round2(rawContractTotal * discountPct / 100)
      discountedTotalsByMonths.set(tier.months, rawContractTotal - discountAmount - customerDiscountAmount)
    }
    const monthlyDiscountedTotal = discountedTotalsByMonths.get(1)!

    for (const tier of PAYMENT_SCHEDULE_TIERS) {
      const discountPct = cadenceFactors.get(tier.months) ?? 0
      const discountedTotal = discountedTotalsByMonths.get(tier.months)!
      const periodCount = Math.round(maxTerm / tier.months)
      const basePerPeriod = round2(discountedTotal / periodCount)

      ensureSpace(20)
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...INK)
      doc.text(
        `${tier.label} (${tier.months} month${tier.months === 1 ? '' : 's'} upfront` +
          `${discountPct > 0 ? `, -${discountPct}%` : ''})`,
        marginX,
        y
      )
      y += 5

      // Monthly is the savings baseline — it has nothing to compare itself against.
      if (tier.months !== 1) {
        const savedAmount = monthlyDiscountedTotal - discountedTotal
        doc.setFontSize(9)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(...GREEN)
        doc.text(`Total Saved (vs. Monthly): ${formatCurrency(savedAmount)}`, marginX, y)
        doc.setTextColor(...INK)
        y += 5
      }

      const scheduleBody = Array.from({ length: periodCount }, (_, i) => {
        // Last period absorbs the rounding remainder so the schedule sums exactly
        // to the discounted total rather than drifting a cent or two off.
        const amount = i === periodCount - 1
          ? round2(discountedTotal - basePerPeriod * (periodCount - 1))
          : basePerPeriod
        const dueDate = addMonthsClamped(scheduleStartDate, i * tier.months)
        return [formatDate(dueDate), formatCurrency(amount)]
      })

      autoTable(doc, {
        startY: y,
        margin: { left: marginX, right: marginX },
        head: [['Due Date', 'Amount']],
        body: scheduleBody,
        foot: [['Total', formatCurrency(discountedTotal)]],
        theme: 'plain',
        styles: {
          fontSize: 9,
          textColor: INK,
          lineColor: RULE,
        },
        headStyles: {
          fontStyle: 'bold',
          textColor: INK,
          lineWidth: { bottom: 0.4 },
          lineColor: INK,
        },
        footStyles: {
          fontStyle: 'bold',
          textColor: INK,
          lineWidth: { top: 0.4 },
          lineColor: INK,
        },
        columnStyles: {
          0: { cellWidth: 60 },
          1: { cellWidth: 60, halign: 'right' },
        },
        didParseCell: rightAlignHeaderColumns([1]),
      })

      y = (doc as any).lastAutoTable.finalY + 10
    }
  }

  // ── Customer approval signature ─────────────────────────────────────────
  ensureSpace(20)
  doc.setDrawColor(...INK)
  doc.setLineWidth(0.2)
  doc.line(marginX, y, marginX + 60, y)
  doc.line(110, y, 170, y)
  y += 5
  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  doc.text('Customer Approval', marginX, y)
  doc.text('Date', 110, y)

  doc.save(`RateSheet-${quote.quote_number}.pdf`)
}
