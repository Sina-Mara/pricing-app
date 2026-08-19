import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatCurrency, formatDate, formatPercent } from './utils'
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

export async function generateQuotePDF(quote: QuoteWithDetails) {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  const marginX = 20
  const rightX = pageWidth - marginX
  let y = 18

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
  let legalY = 16
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

  // ── Customer address (left) + quote metadata (right) ───────────────────
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
  metaRow('Quote', quote.quote_number, true)
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
    ? `Please find below the requested quote for ${quote.title}.`
    : 'Please find below the requested quote.'
  doc.text(introText, marginX, y)
  y += 12

  // ── Quote heading ───────────────────────────────────────────────────────
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.text(`Quote ${quote.quote_number}`, marginX, y)
  y += 8

  // ── Packages ─────────────────────────────────────────────────────────────
  for (const pkg of quote.quote_packages) {
    if (!pkg.include_in_quote) continue

    if (y > 250) {
      doc.addPage()
      y = 20
    }

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

    const tableData = pkg.quote_items.map((item) => [
      item.sku?.code || '',
      item.sku?.description || '',
      item.quantity.toString(),
      item.environment,
      item.unit_price ? formatCurrency(item.unit_price) : '-',
      item.total_discount_pct
        ? item.total_discount_pct > 0
          ? `-${formatPercent(item.total_discount_pct)}`
          : `+${formatPercent(Math.abs(item.total_discount_pct))}`
        : '-',
      item.monthly_total ? formatCurrency(item.monthly_total) : '-',
    ])

    autoTable(doc, {
      startY: y,
      head: [['SKU', 'Description', 'Qty', 'Env', 'Unit Price', 'Discount', 'Monthly']],
      body: tableData,
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
        0: { cellWidth: 25 },
        1: { cellWidth: 45 },
        2: { cellWidth: 15, halign: 'right' },
        3: { cellWidth: 22 },
        4: { cellWidth: 25, halign: 'right' },
        5: { cellWidth: 20, halign: 'right' },
        6: { cellWidth: 25, halign: 'right' },
      },
      didDrawPage: () => {
        // no-op placeholder — kept for parity if page-numbered footers are added later
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

    if (y > 250) {
      doc.addPage()
      y = 20
    }
  }

  // ── Grand Total ──────────────────────────────────────────────────────────
  if (y > 240) {
    doc.addPage()
    y = 20
  }

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
  const hasPaymentDiscount =
    quote.quote_type === 'commitment' &&
    quote.payment_discount_pct != null &&
    quote.payment_discount_pct > 0 &&
    quote.payment_discount_amount != null

  const hasCustomerDiscount =
    quote.customer_discount_amount != null && quote.customer_discount_amount > 0

  if (hasPaymentDiscount || hasCustomerDiscount) {
    const maxTerm = Math.max(...quote.quote_packages.map((p) => p.term_months))
    const contractTotal = quote.total_monthly * maxTerm
    const paymentDiscountAmount = hasPaymentDiscount ? quote.payment_discount_amount! : 0
    const customerDiscountAmount = hasCustomerDiscount ? quote.customer_discount_amount! : 0

    y += 9
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(`Contract Total (${maxTerm} months)`, marginX, y)
    doc.text(formatCurrency(contractTotal), rightX, y, { align: 'right' })

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
      formatCurrency(contractTotal - paymentDiscountAmount - customerDiscountAmount),
      rightX,
      y,
      { align: 'right' }
    )
    doc.setFont('helvetica', 'normal')
  }

  // ── Terms & closing ──────────────────────────────────────────────────────
  y += 20
  if (y > 250) {
    doc.addPage()
    y = 20
  }

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...MUTED)
  doc.text('All prices exclusive of VAT unless stated otherwise.', marginX, y)
  y += 5
  doc.text('Payment terms: Net 30 days.', marginX, y)
  y += 5
  if (quote.valid_until) {
    doc.text(`This quote is valid until ${formatDate(quote.valid_until)}.`, marginX, y)
    y += 5
  }
  doc.setTextColor(...INK)

  y += 10
  doc.setFontSize(10)
  doc.text('Best regards,', marginX, y)
  y += 5
  doc.setFont('helvetica', 'bold')
  doc.text('Cennso Technologies GmbH', marginX, y)
  doc.setFont('helvetica', 'normal')

  y += 15
  if (y > 260) {
    doc.addPage()
    y = 20
  }
  doc.setDrawColor(...INK)
  doc.setLineWidth(0.2)
  doc.line(marginX, y, marginX + 60, y)
  doc.line(110, y, 170, y)
  y += 5
  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  doc.text('Customer Signature', marginX, y)
  doc.text('Date', 110, y)

  doc.save(`Quote-${quote.quote_number}.pdf`)
}
