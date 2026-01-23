import { useState, useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  GitBranch,
  ArrowLeft,
  Plus,
  Minus,
  Equal,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
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
import { supabase } from '@/lib/supabase'
import { formatCurrency, getStatusColor } from '@/lib/utils'
import type { Quote, QuotePackage, QuoteItem, Customer, Sku } from '@/types/database'

type QuoteWithDetails = Quote & {
  customer: Customer | null
  quote_packages: (QuotePackage & { quote_items: (QuoteItem & { sku: Sku })[] })[]
  version_number?: number
  version_name?: string | null
}

interface ComparisonItem {
  sku_code: string
  sku_description: string
  quantities: (number | null)[] // One per quote
  prices: (number | null)[] // Monthly total per quote
  environments: (string | null)[]
  status: 'added' | 'removed' | 'changed' | 'unchanged'
}

export default function QuoteCompare() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const groupId = searchParams.get('group')
  const quoteIds = searchParams.get('quotes')?.split(',') || []

  const [selectedQuoteIds, setSelectedQuoteIds] = useState<string[]>(quoteIds.slice(0, 3))
  const [showDifferencesOnly, setShowDifferencesOnly] = useState(false)
  const [expandedPackages, setExpandedPackages] = useState<Set<string>>(new Set(['all']))

  // Fetch all quotes in version group
  const { data: groupQuotes = [], isLoading: groupLoading } = useQuery({
    queryKey: ['quote-group', groupId],
    queryFn: async () => {
      if (!groupId) return []
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
        .eq('version_group_id', groupId)
        .order('version_number')

      if (error) throw error
      return data as QuoteWithDetails[]
    },
    enabled: !!groupId,
  })

  // Fetch specific quotes if no group
  const { data: specificQuotes = [], isLoading: specificLoading } = useQuery({
    queryKey: ['quotes-compare', quoteIds],
    queryFn: async () => {
      if (quoteIds.length === 0) return []
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
        .in('id', quoteIds)

      if (error) throw error
      return data as QuoteWithDetails[]
    },
    enabled: quoteIds.length > 0 && !groupId,
  })

  const allQuotes = groupId ? groupQuotes : specificQuotes
  const selectedQuotes = allQuotes.filter(q => selectedQuoteIds.includes(q.id))
  const isLoading = groupLoading || specificLoading

  // Initialize selected quotes if not set
  useMemo(() => {
    if (selectedQuoteIds.length === 0 && allQuotes.length > 0) {
      setSelectedQuoteIds(allQuotes.slice(0, Math.min(3, allQuotes.length)).map(q => q.id))
    }
  }, [allQuotes, selectedQuoteIds.length])

  // Build comparison data
  const comparisonData = useMemo(() => {
    if (selectedQuotes.length < 2) return { items: [], packages: new Map() }

    // Collect all unique SKUs across all quotes
    const skuMap = new Map<string, ComparisonItem>()

    selectedQuotes.forEach((quote, quoteIndex) => {
      quote.quote_packages.forEach(pkg => {
        pkg.quote_items?.forEach(item => {
          const key = item.sku_id
          if (!skuMap.has(key)) {
            skuMap.set(key, {
              sku_code: item.sku?.code || '',
              sku_description: item.sku?.description || '',
              quantities: new Array(selectedQuotes.length).fill(null),
              prices: new Array(selectedQuotes.length).fill(null),
              environments: new Array(selectedQuotes.length).fill(null),
              status: 'unchanged',
            })
          }
          const comparison = skuMap.get(key)!
          comparison.quantities[quoteIndex] = (comparison.quantities[quoteIndex] || 0) + item.quantity
          comparison.prices[quoteIndex] = (comparison.prices[quoteIndex] || 0) + (item.monthly_total || 0)
          comparison.environments[quoteIndex] = item.environment
        })
      })
    })

    // Determine status for each item
    skuMap.forEach((item) => {
      const hasValues = item.quantities.map(q => q !== null)
      const allSame = item.quantities.every((q, i) =>
        i === 0 || q === item.quantities[0]
      )

      if (hasValues.filter(Boolean).length === 1) {
        // Only in one quote
        const firstIndex = hasValues.indexOf(true)
        if (firstIndex === 0) {
          item.status = 'removed' // In first quote only = removed in others
        } else {
          item.status = 'added' // Not in first quote = added
        }
      } else if (!allSame) {
        item.status = 'changed'
      } else {
        item.status = 'unchanged'
      }
    })

    // Group by package
    const packageMap = new Map<string, ComparisonItem[]>()
    selectedQuotes.forEach(quote => {
      quote.quote_packages.forEach(pkg => {
        if (!packageMap.has(pkg.package_name)) {
          packageMap.set(pkg.package_name, [])
        }
      })
    })

    // Add items to packages
    skuMap.forEach((item) => {
      // For simplicity, add to first package found with this SKU
      let added = false
      selectedQuotes.forEach(quote => {
        if (added) return
        quote.quote_packages.forEach(pkg => {
          if (added) return
          const hasItem = pkg.quote_items?.some(i => i.sku?.code === item.sku_code)
          if (hasItem) {
            const packageItems = packageMap.get(pkg.package_name) || []
            packageItems.push(item)
            packageMap.set(pkg.package_name, packageItems)
            added = true
          }
        })
      })
      if (!added) {
        // Fallback: add to "Other" package
        const others = packageMap.get('Other Items') || []
        others.push(item)
        packageMap.set('Other Items', others)
      }
    })

    return {
      items: Array.from(skuMap.values()),
      packages: packageMap,
    }
  }, [selectedQuotes])

  // Filter items based on showDifferencesOnly
  const filteredItems = showDifferencesOnly
    ? comparisonData.items.filter(item => item.status !== 'unchanged')
    : comparisonData.items

  // Get status icon
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'added':
        return <Plus className="h-4 w-4 text-green-500" />
      case 'removed':
        return <Minus className="h-4 w-4 text-red-500" />
      case 'changed':
        return <span className="text-amber-500 font-bold">~</span>
      default:
        return <Equal className="h-4 w-4 text-muted-foreground" />
    }
  }

  // Get cell background based on comparison
  const getCellBackground = (value: number | null, allValues: (number | null)[], status: string) => {
    if (value === null) return 'bg-muted/50'
    if (status === 'added') return 'bg-green-50 dark:bg-green-950'
    if (status === 'removed') return 'bg-red-50 dark:bg-red-950'
    if (status === 'changed') {
      const max = Math.max(...allValues.filter((v): v is number => v !== null))
      const min = Math.min(...allValues.filter((v): v is number => v !== null))
      if (value === max) return 'bg-amber-50 dark:bg-amber-950'
      if (value === min) return 'bg-blue-50 dark:bg-blue-950'
    }
    return ''
  }

  const togglePackage = (name: string) => {
    setExpandedPackages(prev => {
      const next = new Set(prev)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
      }
      return next
    })
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (allQuotes.length === 0) {
    return (
      <div className="p-6">
        <div className="flex h-[400px] flex-col items-center justify-center rounded-lg border-2 border-dashed">
          <GitBranch className="mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="text-lg font-medium">No quotes to compare</h3>
          <p className="text-muted-foreground">
            Select quotes from the quotes list or use the version comparison feature.
          </p>
          <Button variant="link" onClick={() => navigate('/quotes')}>
            Go to Quotes
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <GitBranch className="h-8 w-8" />
              Quote Comparison
            </h1>
            <p className="text-muted-foreground">
              Compare {selectedQuotes.length} quote versions side-by-side
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id="differences"
              checked={showDifferencesOnly}
              onCheckedChange={setShowDifferencesOnly}
            />
            <Label htmlFor="differences" className="text-sm">
              {showDifferencesOnly ? <Eye className="h-4 w-4 inline mr-1" /> : <EyeOff className="h-4 w-4 inline mr-1" />}
              Differences only
            </Label>
          </div>
        </div>
      </div>

      {/* Quote Selector */}
      <Card>
        <CardHeader>
          <CardTitle>Select Quotes to Compare</CardTitle>
          <CardDescription>Choose 2-3 quotes to compare side-by-side</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            {[0, 1, 2].map(index => (
              <div key={index} className="flex-1 min-w-[250px]">
                <Label className="text-sm mb-2 block">Quote {index + 1}</Label>
                <Select
                  value={selectedQuoteIds[index] || ''}
                  onValueChange={(v) => {
                    const newIds = [...selectedQuoteIds]
                    if (v) {
                      newIds[index] = v
                    } else {
                      newIds.splice(index, 1)
                    }
                    setSelectedQuoteIds(newIds.filter(Boolean))
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a quote" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {allQuotes.map(q => (
                      <SelectItem
                        key={q.id}
                        value={q.id}
                        disabled={selectedQuoteIds.includes(q.id) && selectedQuoteIds[index] !== q.id}
                      >
                        {q.version_number ? `v${q.version_number}` : q.quote_number}
                        {q.version_name && ` - ${q.version_name}`}
                        <span className="ml-2 text-muted-foreground">
                          ({formatCurrency(q.total_monthly)}/mo)
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {selectedQuotes.length >= 2 && (
        <>
          {/* Summary Comparison */}
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-48">Metric</TableHead>
                    {selectedQuotes.map(q => (
                      <TableHead key={q.id} className="text-center">
                        <div className="font-medium">
                          {q.version_number ? `v${q.version_number}` : q.quote_number}
                          {q.version_name && <span className="font-normal"> - {q.version_name}</span>}
                        </div>
                        <Badge className={`mt-1 ${getStatusColor(q.status)}`}>{q.status}</Badge>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">Monthly Total</TableCell>
                    {selectedQuotes.map(q => (
                      <TableCell key={q.id} className="text-center text-lg font-bold">
                        {formatCurrency(q.total_monthly)}
                      </TableCell>
                    ))}
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Annual Total</TableCell>
                    {selectedQuotes.map(q => (
                      <TableCell key={q.id} className="text-center">
                        {formatCurrency(q.total_annual)}
                      </TableCell>
                    ))}
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Packages</TableCell>
                    {selectedQuotes.map(q => (
                      <TableCell key={q.id} className="text-center">
                        {q.quote_packages.length}
                      </TableCell>
                    ))}
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Line Items</TableCell>
                    {selectedQuotes.map(q => (
                      <TableCell key={q.id} className="text-center">
                        {q.quote_packages.reduce((sum, pkg) => sum + (pkg.quote_items?.length || 0), 0)}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Detailed Comparison */}
          <Card>
            <CardHeader>
              <CardTitle>Scope Comparison</CardTitle>
              <CardDescription>
                {showDifferencesOnly
                  ? `Showing ${filteredItems.length} items with differences`
                  : `Showing all ${comparisonData.items.length} items`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Legend */}
              <div className="mb-4 flex flex-wrap gap-4 text-sm">
                <div className="flex items-center gap-1">
                  <Plus className="h-4 w-4 text-green-500" />
                  <span>Added</span>
                </div>
                <div className="flex items-center gap-1">
                  <Minus className="h-4 w-4 text-red-500" />
                  <span>Removed</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-amber-500 font-bold">~</span>
                  <span>Changed</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 bg-amber-50 border rounded" />
                  <span>Highest value</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 bg-blue-50 border rounded" />
                  <span>Lowest value</span>
                </div>
              </div>

              {/* Items by Package */}
              <div className="space-y-4">
                {Array.from(comparisonData.packages.entries()).map(([packageName, items]) => {
                  const packageItems = showDifferencesOnly
                    ? items.filter((item: ComparisonItem) => item.status !== 'unchanged')
                    : items

                  if (packageItems.length === 0) return null

                  const isExpanded = expandedPackages.has('all') || expandedPackages.has(packageName)

                  return (
                    <div key={packageName} className="border rounded-lg">
                      <div
                        className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50"
                        onClick={() => togglePackage(packageName)}
                      >
                        <div className="flex items-center gap-2">
                          {isExpanded ? (
                            <ChevronDown className="h-5 w-5" />
                          ) : (
                            <ChevronRight className="h-5 w-5" />
                          )}
                          <span className="font-medium">{packageName}</span>
                          <Badge variant="outline">{packageItems.length} items</Badge>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="border-t">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-12"></TableHead>
                                <TableHead>SKU</TableHead>
                                {selectedQuotes.map(q => (
                                  <TableHead key={q.id} className="text-center">
                                    <div className="text-xs">
                                      {q.version_number ? `v${q.version_number}` : q.quote_number}
                                    </div>
                                    <div className="text-xs text-muted-foreground">Qty</div>
                                  </TableHead>
                                ))}
                                {selectedQuotes.map(q => (
                                  <TableHead key={`${q.id}-price`} className="text-center">
                                    <div className="text-xs">
                                      {q.version_number ? `v${q.version_number}` : q.quote_number}
                                    </div>
                                    <div className="text-xs text-muted-foreground">Monthly</div>
                                  </TableHead>
                                ))}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {packageItems.map((item: ComparisonItem, idx: number) => (
                                <TableRow key={`${item.sku_code}-${idx}`}>
                                  <TableCell>{getStatusIcon(item.status)}</TableCell>
                                  <TableCell>
                                    <div className="font-mono text-sm">{item.sku_code}</div>
                                    <div className="text-xs text-muted-foreground">
                                      {item.sku_description}
                                    </div>
                                  </TableCell>
                                  {item.quantities.map((qty: number | null, i: number) => (
                                    <TableCell
                                      key={i}
                                      className={`text-center ${getCellBackground(qty, item.quantities, item.status)}`}
                                    >
                                      {qty !== null ? qty.toLocaleString() : '-'}
                                    </TableCell>
                                  ))}
                                  {item.prices.map((price: number | null, i: number) => (
                                    <TableCell
                                      key={`price-${i}`}
                                      className={`text-center ${getCellBackground(price, item.prices, item.status)}`}
                                    >
                                      {price !== null ? formatCurrency(price) : '-'}
                                    </TableCell>
                                  ))}
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {filteredItems.length === 0 && (
                <div className="flex h-32 flex-col items-center justify-center rounded-lg border-2 border-dashed">
                  <p className="text-muted-foreground">
                    {showDifferencesOnly
                      ? 'No differences found between selected quotes'
                      : 'No items to compare'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Price Difference Summary */}
          {selectedQuotes.length === 2 && (
            <Card>
              <CardHeader>
                <CardTitle>Price Difference</CardTitle>
                <CardDescription>
                  Comparing {selectedQuotes[0].version_number ? `v${selectedQuotes[0].version_number}` : selectedQuotes[0].quote_number}
                  {' '}to{' '}
                  {selectedQuotes[1].version_number ? `v${selectedQuotes[1].version_number}` : selectedQuotes[1].quote_number}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-lg bg-muted p-4">
                    <div className="text-sm text-muted-foreground">Monthly Difference</div>
                    <div className={`text-2xl font-bold ${
                      selectedQuotes[1].total_monthly > selectedQuotes[0].total_monthly
                        ? 'text-red-600'
                        : selectedQuotes[1].total_monthly < selectedQuotes[0].total_monthly
                        ? 'text-green-600'
                        : ''
                    }`}>
                      {selectedQuotes[1].total_monthly >= selectedQuotes[0].total_monthly ? '+' : ''}
                      {formatCurrency(selectedQuotes[1].total_monthly - selectedQuotes[0].total_monthly)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {((selectedQuotes[1].total_monthly - selectedQuotes[0].total_monthly) / selectedQuotes[0].total_monthly * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div className="rounded-lg bg-muted p-4">
                    <div className="text-sm text-muted-foreground">Annual Difference</div>
                    <div className={`text-2xl font-bold ${
                      selectedQuotes[1].total_annual > selectedQuotes[0].total_annual
                        ? 'text-red-600'
                        : selectedQuotes[1].total_annual < selectedQuotes[0].total_annual
                        ? 'text-green-600'
                        : ''
                    }`}>
                      {selectedQuotes[1].total_annual >= selectedQuotes[0].total_annual ? '+' : ''}
                      {formatCurrency(selectedQuotes[1].total_annual - selectedQuotes[0].total_annual)}
                    </div>
                  </div>
                  <div className="rounded-lg bg-muted p-4">
                    <div className="text-sm text-muted-foreground">Items Changed</div>
                    <div className="text-2xl font-bold">
                      {comparisonData.items.filter(i => i.status !== 'unchanged').length}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      of {comparisonData.items.length} total
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
