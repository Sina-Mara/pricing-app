import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ArrowLeft, Calendar, Package, TrendingUp } from 'lucide-react'
import type { Quote, QuotePackage, QuoteItem, Sku, SkuCategory } from '@/types/database'

interface QuoteWithPackages extends Quote {
  quote_packages: (QuotePackage & {
    quote_items: (QuoteItem & { sku: Sku })[]
  })[]
}

interface TimelinePhase {
  startMonth: number
  endMonth: number
  skuQuantities: Map<string, { sku: Sku; totalQty: number; packages: string[] }>
}

const categoryColors: Record<SkuCategory, string> = {
  default: 'bg-gray-500',
  cas: 'bg-blue-500',
  cno: 'bg-green-500',
  ccs: 'bg-purple-500',
}

export default function Timeline() {
  const { id: quoteId } = useParams<{ id: string }>()
  const [viewMode, setViewMode] = useState<'gantt' | 'table'>('gantt')
  const [selectedSku, setSelectedSku] = useState<string>('all')

  // Fetch quote with packages and items
  const { data: quote, isLoading } = useQuery({
    queryKey: ['quote-timeline', quoteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quotes')
        .select(`
          *,
          quote_packages(
            *,
            quote_items(*, sku:skus(*))
          )
        `)
        .eq('id', quoteId)
        .single()

      if (error) throw error
      return data as QuoteWithPackages
    },
    enabled: !!quoteId,
  })

  // Calculate timeline phases
  const { phases, maxMonth, uniqueSkus } = useMemo(() => {
    if (!quote?.quote_packages) {
      return { phases: [], maxMonth: 36, uniqueSkus: [] }
    }

    // Get all unique term end points
    const termEndPoints = new Set<number>([1])
    const skuSet = new Map<string, Sku>()

    for (const pkg of quote.quote_packages) {
      for (const item of pkg.quote_items) {
        const term = item.term_months ?? pkg.term_months
        termEndPoints.add(term + 1)
        if (item.sku) {
          skuSet.set(item.sku_id, item.sku)
        }
      }
    }

    const sortedTerms = Array.from(termEndPoints).sort((a, b) => a - b)
    const phases: TimelinePhase[] = []

    // Calculate phases
    for (let i = 0; i < sortedTerms.length - 1; i++) {
      const startMonth = sortedTerms[i]
      const endMonth = sortedTerms[i + 1] - 1

      const skuQuantities = new Map<string, { sku: Sku; totalQty: number; packages: string[] }>()

      for (const pkg of quote.quote_packages) {
        for (const item of pkg.quote_items) {
          const term = item.term_months ?? pkg.term_months

          // Item is active during this phase if the phase starts within the item's term
          if (startMonth <= term && item.sku) {
            const existing = skuQuantities.get(item.sku_id) || {
              sku: item.sku,
              totalQty: 0,
              packages: [],
            }
            existing.totalQty += item.quantity
            existing.packages.push(pkg.package_name)
            skuQuantities.set(item.sku_id, existing)
          }
        }
      }

      phases.push({ startMonth, endMonth, skuQuantities })
    }

    const maxMonth = sortedTerms[sortedTerms.length - 1] - 1
    const uniqueSkus = Array.from(skuSet.values())

    return { phases, maxMonth, uniqueSkus }
  }, [quote])

  // Filter SKUs based on selection
  const filteredSkus = useMemo(() => {
    if (selectedSku === 'all') return uniqueSkus
    return uniqueSkus.filter((sku) => sku.id === selectedSku)
  }, [uniqueSkus, selectedSku])

  if (!quoteId) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12 text-center">
            <Calendar className="mx-auto h-12 w-12 text-muted-foreground" />
            <p className="mt-4 text-lg font-medium">No Quote Selected</p>
            <p className="text-muted-foreground">
              Open a quote and click "View Timeline" to see the timeline visualization.
            </p>
            <Link to="/quotes">
              <Button className="mt-4">Go to Quotes</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-4 mb-2">
            <Link to={`/quotes/${quoteId}`}>
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Quote
              </Button>
            </Link>
          </div>
          <h1 className="text-3xl font-bold">Timeline Visualization</h1>
          <p className="text-muted-foreground">
            {quote?.title || quote?.quote_number} - Package lifecycle and quantity aggregation
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={selectedSku} onValueChange={setSelectedSku}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter by SKU" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All SKUs</SelectItem>
              {uniqueSkus.map((sku) => (
                <SelectItem key={sku.id} value={sku.id}>
                  {sku.code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={viewMode} onValueChange={(v) => setViewMode(v as 'gantt' | 'table')}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gantt">Gantt View</SelectItem>
              <SelectItem value="table">Table View</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Package Overview */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Packages
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            {quote?.quote_packages.map((pkg) => (
              <div
                key={pkg.id}
                className="flex items-center gap-2 rounded-lg border p-3"
              >
                <div
                  className={`h-3 w-3 rounded-full ${
                    pkg.status === 'new' ? 'bg-green-500' :
                    pkg.status === 'ordered' ? 'bg-blue-500' :
                    pkg.status === 'existing' ? 'bg-gray-500' : 'bg-red-500'
                  }`}
                />
                <div>
                  <p className="font-medium">{pkg.package_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {pkg.term_months} months - {pkg.quote_items.length} items
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Timeline Visualization */}
      {viewMode === 'gantt' ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Timeline View
            </CardTitle>
            <CardDescription>
              Showing aggregated quantities per SKU across contract phases
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              {/* Month headers */}
              <div className="flex mb-2 ml-48">
                {Array.from({ length: Math.ceil(maxMonth / 12) }, (_, i) => (
                  <div
                    key={i}
                    className="flex-1 text-center text-sm font-medium text-muted-foreground border-l px-2"
                    style={{ minWidth: '200px' }}
                  >
                    Year {i + 1}
                  </div>
                ))}
              </div>

              {/* SKU rows */}
              <div className="space-y-2">
                {filteredSkus.map((sku) => {
                  // Get phases where this SKU is active
                  const skuPhases = phases.filter((phase) =>
                    phase.skuQuantities.has(sku.id)
                  )

                  return (
                    <div key={sku.id} className="flex items-center">
                      {/* SKU label */}
                      <div className="w-48 shrink-0 pr-4">
                        <p className="font-mono text-sm font-medium truncate" title={sku.code}>
                          {sku.code}
                        </p>
                        <Badge
                          className={`${categoryColors[sku.category]} text-white text-xs`}
                        >
                          {sku.category.toUpperCase()}
                        </Badge>
                      </div>

                      {/* Timeline bar */}
                      <div
                        className="flex-1 h-10 bg-muted rounded-md relative"
                        style={{ minWidth: `${maxMonth * 8}px` }}
                      >
                        {skuPhases.map((phase, idx) => {
                          const phaseData = phase.skuQuantities.get(sku.id)
                          if (!phaseData) return null

                          const left = ((phase.startMonth - 1) / maxMonth) * 100
                          const width = ((phase.endMonth - phase.startMonth + 1) / maxMonth) * 100

                          return (
                            <div
                              key={idx}
                              className={`absolute h-full ${categoryColors[sku.category]} rounded-md flex items-center justify-center text-white text-xs font-medium transition-all hover:opacity-80`}
                              style={{
                                left: `${left}%`,
                                width: `${width}%`,
                              }}
                              title={`Months ${phase.startMonth}-${phase.endMonth}: ${phaseData.totalQty} units from ${phaseData.packages.join(', ')}`}
                            >
                              {phaseData.totalQty}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Phase dividers */}
              <div className="flex ml-48 mt-4 pt-4 border-t">
                {phases.map((phase, idx) => {
                  const phaseWidth = ((phase.endMonth - phase.startMonth + 1) / maxMonth) * 100

                  return (
                    <div
                      key={idx}
                      className="text-center text-xs text-muted-foreground border-r last:border-r-0"
                      style={{
                        width: `${phaseWidth}%`,
                        minWidth: '60px',
                      }}
                    >
                      M{phase.startMonth}-{phase.endMonth}
                    </div>
                  )
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Phase Details</CardTitle>
            <CardDescription>
              Detailed breakdown of quantities per phase
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Phase</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Total Qty</TableHead>
                  <TableHead>Packages</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {phases.map((phase, phaseIdx) =>
                  Array.from(phase.skuQuantities.entries())
                    .filter(([skuId]) => selectedSku === 'all' || skuId === selectedSku)
                    .map(([skuId, data], itemIdx) => (
                      <TableRow key={`${phaseIdx}-${skuId}`}>
                        {itemIdx === 0 && (
                          <>
                            <TableCell
                              className="font-medium"
                              rowSpan={
                                selectedSku === 'all'
                                  ? phase.skuQuantities.size
                                  : 1
                              }
                            >
                              M{phase.startMonth} - M{phase.endMonth}
                            </TableCell>
                            <TableCell
                              rowSpan={
                                selectedSku === 'all'
                                  ? phase.skuQuantities.size
                                  : 1
                              }
                            >
                              {phase.endMonth - phase.startMonth + 1} months
                            </TableCell>
                          </>
                        )}
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-mono">{data.sku.code}</span>
                            <Badge
                              variant="secondary"
                              className={`${categoryColors[data.sku.category]} text-white text-xs`}
                            >
                              {data.sku.category.toUpperCase()}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">
                          {data.totalQty.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {data.packages.join(', ')}
                        </TableCell>
                      </TableRow>
                    ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Pricing Impact Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-2xl font-bold">{phases.length}</p>
              <p className="text-sm text-muted-foreground">Time Phases</p>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-2xl font-bold">{uniqueSkus.length}</p>
              <p className="text-sm text-muted-foreground">Unique SKUs</p>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-2xl font-bold">{maxMonth}</p>
              <p className="text-sm text-muted-foreground">Max Term (months)</p>
            </div>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Time-phased aggregation combines quantities across packages within each phase,
            allowing volume discounts to be calculated based on the total commitment during
            each period.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
