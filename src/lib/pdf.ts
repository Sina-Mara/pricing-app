import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatCurrency, formatDate, formatPercent } from './utils'
import type { Quote, QuotePackage, QuoteItem, Customer, Sku } from '@/types/database'

type QuoteWithDetails = Quote & {
  customer: Customer | null
  quote_packages: (QuotePackage & { quote_items: (QuoteItem & { sku: Sku })[] })[]
}

export function generateQuotePDF(quote: QuoteWithDetails) {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  let y = 20

  // Header
  doc.setFontSize(24)
  doc.setFont('helvetica', 'bold')
  doc.text('QUOTE', pageWidth / 2, y, { align: 'center' })
  y += 15

  // Quote Info
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')

  // Left side - Company info
  doc.text('Your Company Name', 20, y)
  doc.text('123 Business Street', 20, y + 5)
  doc.text('City, Country 12345', 20, y + 10)

  // Right side - Quote details
  doc.setFont('helvetica', 'bold')
  doc.text(`Quote #: ${quote.quote_number}`, pageWidth - 20, y, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.text(`Date: ${formatDate(quote.created_at)}`, pageWidth - 20, y + 5, { align: 'right' })
  if (quote.valid_until) {
    doc.text(`Valid Until: ${formatDate(quote.valid_until)}`, pageWidth - 20, y + 10, { align: 'right' })
  }
  doc.text(`Status: ${quote.status.toUpperCase()}`, pageWidth - 20, y + 15, { align: 'right' })

  y += 30

  // Customer Info
  if (quote.customer) {
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('Bill To:', 20, y)
    y += 6
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text(quote.customer.name, 20, y)
    if (quote.customer.company) {
      y += 5
      doc.text(quote.customer.company, 20, y)
    }
    if (quote.customer.email) {
      y += 5
      doc.text(quote.customer.email, 20, y)
    }
    if (quote.customer.address) {
      y += 5
      doc.text(quote.customer.address, 20, y)
    }
    y += 10
  }

  // Quote Title
  if (quote.title) {
    y += 5
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text(quote.title, 20, y)
    y += 10
  }

  // Packages
  for (const pkg of quote.quote_packages) {
    if (!pkg.include_in_quote) continue

    y += 5

    // Package Header
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text(`${pkg.package_name}`, 20, y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text(`Term: ${pkg.term_months} months`, pageWidth - 20, y, { align: 'right' })
    y += 5

    // Package Items Table
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
      theme: 'striped',
      headStyles: { fillColor: [66, 66, 66] },
      styles: { fontSize: 9 },
      columnStyles: {
        0: { cellWidth: 25 },
        1: { cellWidth: 45 },
        2: { cellWidth: 15, halign: 'right' },
        3: { cellWidth: 22 },
        4: { cellWidth: 25, halign: 'right' },
        5: { cellWidth: 20, halign: 'right' },
        6: { cellWidth: 25, halign: 'right' },
      },
    })

    y = (doc as any).lastAutoTable.finalY + 5

    // Package Subtotal
    doc.setFont('helvetica', 'bold')
    doc.text(`Package Subtotal: ${formatCurrency(pkg.subtotal_monthly)}/month`, pageWidth - 20, y, { align: 'right' })
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.text(`Annual: ${formatCurrency(pkg.subtotal_annual)}`, pageWidth - 20, y, { align: 'right' })
    y += 10

    // Check if we need a new page
    if (y > 250) {
      doc.addPage()
      y = 20
    }
  }

  // Grand Total
  y += 10
  doc.setDrawColor(0)
  doc.line(20, y, pageWidth - 20, y)
  y += 10

  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('Grand Total', 20, y)
  doc.text(`${formatCurrency(quote.total_monthly)}/month`, pageWidth - 20, y, { align: 'right' })
  y += 7
  doc.setFontSize(12)
  doc.setFont('helvetica', 'normal')
  doc.text(`Annual: ${formatCurrency(quote.total_annual)}`, pageWidth - 20, y, { align: 'right' })

  // Footer
  y += 20
  if (y > 250) {
    doc.addPage()
    y = 20
  }

  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('Terms & Conditions:', 20, y)
  y += 6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text('1. Prices are valid for the term specified in each package.', 20, y)
  y += 5
  doc.text('2. Payment terms: Net 30 days.', 20, y)
  y += 5
  doc.text('3. This quote is valid until the date specified above.', 20, y)
  y += 15

  // Signature Lines
  doc.line(20, y, 80, y)
  doc.line(110, y, 170, y)
  y += 5
  doc.text('Customer Signature', 20, y)
  doc.text('Date', 110, y)

  // Save the PDF
  doc.save(`Quote-${quote.quote_number}.pdf`)
}
