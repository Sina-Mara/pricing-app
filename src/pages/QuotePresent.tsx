import type { ReactNode } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Building2, CalendarClock, ArrowLeft, Package, FileQuestion } from 'lucide-react'
import { formatCurrency, formatDate, getStatusColor } from '@/lib/utils'
import type { Quote, QuotePackage, QuoteItem, Customer, Sku } from '@/types/database'

/**
 * Read-only, customer-safe presentation view of a single quote.
 *
 * SPEC-019: this page must never show list price, discount %, volume/term/env
 * factors, the base/usage ratio, commitment-strategy internals, payment-discount
 * override/pct/amount breakdown, or quote.notes — and must never mutate state
 * or call calculate-pricing. It only reads persisted fields already computed
 * and stored on the quote/packages/items by the pricing engine.
 */

type PresentItem = QuoteItem & { sku: Sku }
type PresentPackage = QuotePackage & { quote_items: PresentItem[] }
type PresentQuote = Quote & {
  customer: Customer | null
  quote_packages: PresentPackage[]
}

function useQuotePresentData(id: string | undefined) {
  return useQuery({
    queryKey: ['quote', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quotes')
        .select(`
          *,
          customer:customers(*),
          quote_packages(
            *,
            quote_items(
              *,
              sku:skus(*)
            )
          )
        `)
        .eq('id', id)
        .single()

      if (error) throw error
      return data as PresentQuote
    },
    enabled: !!id,
  })
}

function ItemRow({ item }: { item: PresentItem }) {
  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">{item.sku?.code}</span>
          <span>{item.sku?.description}</span>
        </div>
      </TableCell>
      <TableCell className="text-right tabular-nums">{item.quantity}</TableCell>
      <TableCell className="text-right font-medium tabular-nums">
        {item.monthly_total != null ? formatCurrency(item.monthly_total) : '–'}
      </TableCell>
    </TableRow>
  )
}

function GroupHeaderRow({ label, className }: { label: string; className?: string }) {
  return (
    <TableRow className={`hover:bg-transparent ${className ?? ''}`}>
      <TableCell colSpan={3} className="py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          {label}
        </span>
      </TableCell>
    </TableRow>
  )
}

/**
 * Mirrors the Solution → Application → Component grouping used in QuoteBuilder
 * for layout continuity, but renders static display-only rows (no chrome, no
 * SKU catalog, no edit affordances).
 */
function renderGroupedRows(items: PresentItem[]): ReactNode[] {
  const rows: ReactNode[] = []

  const ccsItems = items.filter((i) => i.sku?.category === 'ccs')
  const appItems = items.filter((i) => i.sku?.application)
  const otherItems = items.filter((i) => !i.sku?.application && i.sku?.category !== 'ccs')

  // 1. Solution anchor (CCS)
  if (ccsItems.length > 0) {
    rows.push(
      <TableRow key="solution-header" className="bg-primary/5 hover:bg-primary/5 border-b-2 border-primary/20">
        <TableCell colSpan={3} className="py-2">
          <span className="text-xs font-semibold uppercase tracking-widest text-primary/70">Solution</span>
        </TableCell>
      </TableRow>
    )
    ccsItems.forEach((item) => rows.push(<ItemRow key={item.id} item={item} />))
  }

  // 2. Application → Component groups
  if (appItems.length > 0) {
    const appOrder = ['Cennso', 'Packet Gateway', 'Local Breakouts']
    const seenApps = new Set<string>()
    const apps = [
      ...appOrder.filter((a) => appItems.some((i) => i.sku?.application === a)),
      ...appItems
        .map((i) => i.sku?.application as string)
        .filter((a) => !appOrder.includes(a) && !seenApps.has(a) && (seenApps.add(a), true)),
    ]

    for (const app of apps) {
      const appGroupItems = appItems.filter((i) => i.sku?.application === app)

      rows.push(
        <TableRow key={`app-${app}`} className="bg-muted/50 hover:bg-muted/50">
          <TableCell colSpan={3} className="py-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{app}</span>
          </TableCell>
        </TableRow>
      )

      const componentOrder = ['Cennso', 'SMC', 'UPG', 'TPOSS', 'LLM', 'HRS']
      const seenComps = new Set<string>()
      const components = [
        ...componentOrder.filter((c) => appGroupItems.some((i) => i.sku?.component === c)),
        ...appGroupItems
          .map((i) => i.sku?.component as string)
          .filter((c) => c && !componentOrder.includes(c) && !seenComps.has(c) && (seenComps.add(c), true)),
      ]

      for (const comp of components) {
        const compItems = appGroupItems.filter((i) => i.sku?.component === comp)
        const compBase = compItems.filter((i) => i.sku?.is_base_charge)
        const compUsage = compItems.filter((i) => !i.sku?.is_base_charge && !i.sku?.is_direct_cost)
        const compDirect = compItems.filter((i) => !i.sku?.is_base_charge && i.sku?.is_direct_cost)

        rows.push(<GroupHeaderRow key={`comp-${app}-${comp}`} label={comp} />)

        compBase.forEach((item) => rows.push(<ItemRow key={item.id} item={item} />))
        compUsage.forEach((item) => rows.push(<ItemRow key={item.id} item={item} />))
        compDirect.forEach((item) => rows.push(<ItemRow key={item.id} item={item} />))
      }
    }
  }

  // 3. Fallback: items with no application (CNO etc.), grouped by category
  if (otherItems.length > 0) {
    const categoryOrder: Array<'cas' | 'cno' | 'default'> = ['cas', 'cno', 'default']
    const categoryLabels: Record<string, string> = { cas: 'CAS', cno: 'CNO', default: 'Other' }

    for (const cat of categoryOrder) {
      const catItems = otherItems.filter((i) => (i.sku?.category || 'default') === cat)
      if (catItems.length === 0) continue

      rows.push(
        <TableRow key={`cat-${cat}`} className="bg-muted/50 hover:bg-muted/50">
          <TableCell colSpan={3} className="py-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {categoryLabels[cat]}
            </span>
          </TableCell>
        </TableRow>
      )

      catItems.forEach((item) => rows.push(<ItemRow key={item.id} item={item} />))
    }
  }

  return rows
}

export default function QuotePresent() {
  const { id } = useParams<{ id: string }>()
  const { data: quote, isLoading, isError } = useQuotePresentData(id)

  if (!id) {
    return <NotFoundState message="No quote specified." />
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (isError || !quote) {
    return <NotFoundState message="This quote could not be found." />
  }

  const sortedPackages = [...(quote.quote_packages ?? [])].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  )

  // Contract total (post-discount): mirrors the final number shown in QuoteBuilder's
  // summary, without exposing the discount-pct/amount breakdown that produced it.
  const maxTermMonths = sortedPackages.length > 0
    ? Math.max(...sortedPackages.map((p) => p.term_months))
    : 0
  const rawContractTotal = quote.total_monthly * maxTermMonths
  const hasPaymentDiscount =
    quote.quote_type === 'commitment' &&
    quote.payment_discount_pct != null &&
    quote.payment_discount_pct > 0
  const paymentDiscountAmount = hasPaymentDiscount ? (quote.payment_discount_amount ?? 0) : 0

  // Special Discount: the customer-facing, negotiated concession (SPEC-020) — shown
  // as its own line since reps want to show the customer they're getting a deal,
  // unlike the internal-only payment-cadence math this view otherwise hides.
  const hasCustomerDiscount = quote.customer_discount_amount != null && quote.customer_discount_amount > 0
  const customerDiscountAmount = hasCustomerDiscount ? quote.customer_discount_amount! : 0
  const customerDiscountLabel = quote.customer_discount_type === 'percent'
    ? `−${quote.customer_discount_value}%`
    : `−${formatCurrency(quote.customer_discount_value ?? 0)}`

  const contractTotal = rawContractTotal - paymentDiscountAmount - customerDiscountAmount

  return (
    <div className="mx-auto max-w-5xl p-6 md:p-10">
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">
              {quote.title || `Rate Sheet ${quote.quote_number}`}
            </h1>
            <Badge className={getStatusColor(quote.status)}>{quote.status}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{quote.quote_number}</p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 pt-2 text-sm text-muted-foreground">
            {quote.customer && (
              <span className="flex items-center gap-1.5">
                <Building2 className="h-4 w-4" />
                {quote.customer.name}
                {quote.customer.company && ` (${quote.customer.company})`}
              </span>
            )}
            {quote.valid_until && (
              <span className="flex items-center gap-1.5">
                <CalendarClock className="h-4 w-4" />
                Valid until {formatDate(quote.valid_until)}
              </span>
            )}
          </div>
        </div>
        <Button variant="outline" asChild>
          <Link to={`/quotes/${quote.id}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to editor
          </Link>
        </Button>
      </div>

      {/* Packages / line items */}
      <div className="space-y-6">
        {sortedPackages.map((pkg) => (
          <Card key={pkg.id}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div className="flex items-center gap-3">
                <Package className="h-5 w-5 text-muted-foreground" />
                <div>
                  <CardTitle className="text-base">{pkg.package_name}</CardTitle>
                  <p className="text-sm text-muted-foreground">{pkg.term_months} months</p>
                </div>
              </div>
              <div className="text-right">
                <div className="font-semibold">{formatCurrency(pkg.subtotal_monthly)}/mo</div>
                <div className="text-sm text-muted-foreground">{formatCurrency(pkg.subtotal_annual)}/yr</div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="w-20 text-right">Qty</TableHead>
                    <TableHead className="w-32 text-right">Monthly</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {renderGroupedRows(
                    [...(pkg.quote_items ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))}

        {sortedPackages.length === 0 && (
          <div className="flex h-32 flex-col items-center justify-center rounded-lg border-2 border-dashed">
            <Package className="mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-muted-foreground">No packages in this quote yet</p>
          </div>
        )}
      </div>

      {/* Summary */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg bg-muted p-4">
              <div className="text-sm text-muted-foreground">Monthly Total</div>
              <div className="text-2xl font-bold">{formatCurrency(quote.total_monthly)}</div>
            </div>
            <div className="rounded-lg bg-muted p-4">
              <div className="text-sm text-muted-foreground">Annual Total</div>
              <div className="text-2xl font-bold">{formatCurrency(quote.total_annual)}</div>
            </div>
            <div className="rounded-lg bg-muted p-4">
              <div className="text-sm text-muted-foreground">
                Contract Total{maxTermMonths > 0 ? ` (${maxTermMonths}mo)` : ''}
              </div>
              <div className="text-2xl font-bold">{formatCurrency(contractTotal)}</div>
            </div>
          </div>

          {hasCustomerDiscount && (
            <div className="mt-4 flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
              <span className="text-sm font-medium">Special Discount ({customerDiscountLabel})</span>
              <span className="text-sm font-semibold">−{formatCurrency(customerDiscountAmount)}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function NotFoundState({ message }: { message: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <FileQuestion className="h-12 w-12 text-muted-foreground" />
      <p className="text-lg text-muted-foreground">{message}</p>
      <Button variant="outline" asChild>
        <Link to="/quotes">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Quotes
        </Link>
      </Button>
    </div>
  )
}
