import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { supabase } from './supabase'
import { formatCurrency, formatDate, formatPercent } from './utils'
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

/** Payment-cadence tiers surfaced in the bottom-of-document comparison — kept to the three billing
 * frequencies a customer actually chooses between; the full tier table (24/36/48/60mo) is a
 * commitment-length concept, not a billing-frequency one, and stays out of scope here. */
const PAYMENT_OPTION_TIERS: { label: string; months: number }[] = [
  { label: 'Monthly', months: 1 },
  { label: 'Quarterly', months: 3 },
  { label: 'Annual', months: 12 },
]

const INK: [number, number, number] = [30, 41, 59]
const MUTED: [number, number, number] = [100, 116, 139]
const ACCENT: [number, number, number] = [27, 95, 168]
const GREEN: [number, number, number] = [22, 163, 74]
const RULE: [number, number, number] = [203, 213, 225]

const ITEM_TABLE_COLUMNS = 7 // SKU, Description, Qty, Unit Price, Discount, Cust. Discount, Monthly

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

function formatItemDiscount(pct: number | null): string {
  if (!pct) return '-'
  return pct > 0 ? `-${formatPercent(pct)}` : `+${formatPercent(Math.abs(pct))}`
}

function formatCustomerDiscount(item: QuoteItem): string {
  if (item.customer_discount_value == null) return '-'
  return item.customer_discount_type === 'percent'
    ? `-${item.customer_discount_value}%`
    : `-${formatCurrency(item.customer_discount_value)}`
}

export async function generateQuotePDF(quote: QuoteWithDetails) {
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

  y = Math.max(y, metaY) + 10

  // ── Greeting + intro ────────────────────────────────────────────────────
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...INK)
  doc.text('Dear Sir or Madam,', marginX, y)
  y += 7
  const introText = quote.title
    ? `Please find below the requested rate sheet for ${quote.title}.`
    : 'Please find below the requested rate sheet.'
  doc.text(introText, marginX, y)
  y += 12

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

    // Solution → Application → Component ordering, matching QuoteBuilder/QuotePresent
    const groupedRows = groupQuoteItems(pkg.quote_items)
    const tableBody = groupedRows.map((row) => {
      if (row.type === 'header') {
        return [
          {
            content: row.label,
            colSpan: ITEM_TABLE_COLUMNS,
            styles: { fontStyle: 'bold' as const, fillColor: [241, 245, 249] as [number, number, number] },
          },
        ]
      }
      const item = row.item
      return [
        item.sku?.code || '',
        item.sku?.description || '',
        item.quantity.toString(),
        item.unit_price ? formatCurrency(item.unit_price) : '-',
        formatItemDiscount(item.total_discount_pct),
        formatCustomerDiscount(item),
        item.monthly_total ? formatCurrency(item.monthly_total) : '-',
      ]
    })

    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      head: [['SKU', 'Description', 'Qty', 'Unit Price', 'Discount', 'Cust. Discount', 'Monthly']],
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
        0: { cellWidth: 30 },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 18, halign: 'right' },
        3: { cellWidth: 28, halign: 'right' },
        4: { cellWidth: 22, halign: 'right' },
        5: { cellWidth: 28, halign: 'right' },
        6: { cellWidth: 28, halign: 'right' },
      },
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

  const hasPaymentDiscount =
    quote.quote_type === 'commitment' &&
    quote.payment_discount_pct != null &&
    quote.payment_discount_pct > 0 &&
    quote.payment_discount_amount != null

  const hasCustomerDiscount =
    quote.customer_discount_amount != null && quote.customer_discount_amount > 0

  const paymentDiscountAmount = hasPaymentDiscount ? quote.payment_discount_amount! : 0
  const customerDiscountAmount = hasCustomerDiscount ? quote.customer_discount_amount! : 0

  if (hasPaymentDiscount || hasCustomerDiscount) {
    ensureSpace(30)
    y += 9
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(`Contract Total (${maxTerm} months)`, marginX, y)
    doc.text(formatCurrency(rawContractTotal), rightX, y, { align: 'right' })

    if (hasPaymentDiscount) {
      y += 6
      doc.setTextColor(...GREEN)
      doc.text(
        `Payment Discount (${quote.payment_upfront_months}m upfront, -${quote.payment_discount_pct}%)`,
        marginX,
        y
      )
      doc.text(`-${formatCurrency(paymentDiscountAmount)}`, rightX, y, { align: 'right' })
      doc.setTextColor(...INK)
    }

    if (hasCustomerDiscount) {
      y += 6
      const label =
        quote.customer_discount_type === 'percent'
          ? `-${quote.customer_discount_value}%`
          : `-${formatCurrency(quote.customer_discount_value ?? 0)}`
      doc.setTextColor(...GREEN)
      doc.text(`Customer Discount (${label})`, marginX, y)
      doc.text(`-${formatCurrency(customerDiscountAmount)}`, rightX, y, { align: 'right' })
      doc.setTextColor(...INK)
    }

    y += 7
    doc.setDrawColor(...RULE)
    doc.setLineWidth(0.2)
    doc.line(marginX, y - 4, rightX, y - 4)
    doc.setFont('helvetica', 'bold')
    doc.text('Discounted Contract Total', marginX, y)
    doc.text(
      formatCurrency(rawContractTotal - paymentDiscountAmount - customerDiscountAmount),
      rightX,
      y,
      { align: 'right' }
    )
    doc.setFont('helvetica', 'normal')
  }

  // ── Terms ────────────────────────────────────────────────────────────────
  ensureSpace(25)
  y += 20

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...MUTED)
  doc.text('All prices exclusive of VAT unless stated otherwise.', marginX, y)
  y += 5
  doc.text('Payment terms: Net 30 days.', marginX, y)
  y += 5
  if (quote.valid_until) {
    doc.text(`This rate sheet is valid until ${formatDate(quote.valid_until)}.`, marginX, y)
    y += 5
  }
  doc.setTextColor(...INK)

  // ── Payment Options (Monthly / Quarterly / Annual comparison) ──────────
  // Very bottom of the document, before the closing/signature — lets the
  // customer compare billing frequencies rather than seeing only the one
  // currently selected in the app.
  if (quote.quote_type === 'commitment' && maxTerm > 0) {
    const cadenceFactors = await loadCadenceFactors(PAYMENT_OPTION_TIERS.map((t) => t.months))

    ensureSpace(35)
    y += 10
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...INK)
    doc.text('Payment Options', marginX, y)
    y += 5

    const optionRows = PAYMENT_OPTION_TIERS.map((tier) => {
      const discountPct = cadenceFactors.get(tier.months) ?? 0
      const discountAmount = round2(rawContractTotal * discountPct / 100)
      const discountedTotal = rawContractTotal - discountAmount - customerDiscountAmount
      return { ...tier, discountPct, discountedTotal }
    })

    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      head: [['', ...optionRows.map((o) => o.label)]],
      body: [
        ['Upfront', ...optionRows.map((o) => `${o.months} month${o.months === 1 ? '' : 's'}`)],
        ['Discount', ...optionRows.map((o) => `${o.discountPct}%`)],
        [
          { content: 'Discounted Contract Total', styles: { fontStyle: 'bold' as const } },
          ...optionRows.map((o) => ({
            content: formatCurrency(o.discountedTotal),
            styles: { fontStyle: 'bold' as const },
          })),
        ],
      ],
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
        0: { cellWidth: 55 },
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'right' },
      },
    })

    y = (doc as any).lastAutoTable.finalY
  }

  // ── Closing ──────────────────────────────────────────────────────────────
  ensureSpace(35)
  y += 12
  doc.setFontSize(10)
  doc.setTextColor(...INK)
  doc.text('Best regards,', marginX, y)
  y += 5
  doc.setFont('helvetica', 'bold')
  doc.text('Cennso Technologies GmbH', marginX, y)
  doc.setFont('helvetica', 'normal')

  y += 15
  ensureSpace(10)
  doc.setDrawColor(...INK)
  doc.setLineWidth(0.2)
  doc.line(marginX, y, marginX + 60, y)
  doc.line(110, y, 170, y)
  y += 5
  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  doc.text('Customer Signature', marginX, y)
  doc.text('Date', 110, y)

  doc.save(`RateSheet-${quote.quote_number}.pdf`)
}
