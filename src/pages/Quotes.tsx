import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Plus, Search, FileText, Edit, GitBranch, MoreHorizontal, Copy, ChevronRight } from 'lucide-react'
import { formatCurrency, formatDate, getStatusColor } from '@/lib/utils'
import type { QuoteStatus } from '@/types/database'

interface QuoteWithVersion {
  id: string
  quote_number: string
  title: string | null
  status: QuoteStatus
  customer_name: string | null
  customer_company: string | null
  total_monthly: number
  total_annual: number
  valid_until: string | null
  created_at: string
  package_count: number
  item_count: number
  version_group_id: string | null
  version_number: number | null
  version_name: string | null
}

const statusOptions: { value: QuoteStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All Statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'pending', label: 'Pending' },
  { value: 'sent', label: 'Sent' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'expired', label: 'Expired' },
  { value: 'ordered', label: 'Ordered' },
]

export default function Quotes() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [groupVersions, setGroupVersions] = useState(false)

  const { data: quotes, isLoading } = useQuery({
    queryKey: ['quotes-with-versions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quotes')
        .select(`
          id,
          quote_number,
          title,
          status,
          total_monthly,
          total_annual,
          valid_until,
          created_at,
          version_group_id,
          version_number,
          version_name,
          customer:customers(name, company)
        `)
        .order('created_at', { ascending: false })

      if (error) throw error

      // Fetch package and item counts
      const { data: packageCounts } = await supabase
        .from('quote_packages')
        .select('quote_id')

      const { data: itemCounts } = await supabase
        .from('quote_items')
        .select('id, package:quote_packages(quote_id)')

      return data.map(quote => {
        // Supabase returns single relations as arrays with one item
        const customerArr = quote.customer as unknown as { name: string; company: string | null }[] | null
        const customer = Array.isArray(customerArr) ? customerArr[0] : customerArr
        return {
          ...quote,
          customer_name: customer?.name || null,
          customer_company: customer?.company || null,
          package_count: packageCounts?.filter(p => p.quote_id === quote.id).length || 0,
          item_count: itemCounts?.filter(i => {
            const pkgArr = i.package as unknown as { quote_id: string }[] | null
            const pkg = Array.isArray(pkgArr) ? pkgArr[0] : pkgArr
            return pkg?.quote_id === quote.id
          }).length || 0,
        } as QuoteWithVersion
      })
    },
  })

  // Filter quotes
  const filteredQuotes = useMemo(() => {
    return quotes?.filter((quote) => {
      const matchesSearch =
        search === '' ||
        quote.quote_number.toLowerCase().includes(search.toLowerCase()) ||
        quote.title?.toLowerCase().includes(search.toLowerCase()) ||
        quote.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
        quote.customer_company?.toLowerCase().includes(search.toLowerCase())

      const matchesStatus = statusFilter === 'all' || quote.status === statusFilter

      return matchesSearch && matchesStatus
    }) || []
  }, [quotes, search, statusFilter])

  // Group quotes by version_group_id
  const groupedQuotes = useMemo(() => {
    if (!groupVersions) return null

    const groups = new Map<string, QuoteWithVersion[]>()
    const standalone: QuoteWithVersion[] = []

    filteredQuotes.forEach(quote => {
      if (quote.version_group_id) {
        const existing = groups.get(quote.version_group_id) || []
        existing.push(quote)
        groups.set(quote.version_group_id, existing)
      } else {
        standalone.push(quote)
      }
    })

    // Sort each group by version number
    groups.forEach((quoteList, key) => {
      groups.set(key, quoteList.sort((a, b) => (a.version_number || 0) - (b.version_number || 0)))
    })

    return { groups, standalone }
  }, [filteredQuotes, groupVersions])

  // Get version count for a quote
  const getVersionCount = (quote: QuoteWithVersion) => {
    if (!quote.version_group_id) return 0
    return quotes?.filter(q => q.version_group_id === quote.version_group_id).length || 0
  }

  const renderQuoteRow = (quote: QuoteWithVersion, isSubRow = false) => {
    const versionCount = getVersionCount(quote)

    return (
      <TableRow key={quote.id} className={isSubRow ? 'bg-muted/30' : ''}>
        <TableCell>
          <div className="flex items-center gap-2">
            {isSubRow && <ChevronRight className="h-4 w-4 text-muted-foreground ml-4" />}
            <Link
              to={`/quotes/${quote.id}`}
              className="font-medium text-primary hover:underline"
            >
              {quote.quote_number}
            </Link>
            {quote.version_number && (
              <Badge variant="outline" className="text-xs">
                v{quote.version_number}
                {quote.version_name && ` - ${quote.version_name}`}
              </Badge>
            )}
            {!groupVersions && versionCount > 1 && (
              <Badge variant="secondary" className="text-xs">
                <GitBranch className="h-3 w-3 mr-1" />
                {versionCount} versions
              </Badge>
            )}
          </div>
        </TableCell>
        <TableCell>
          <div>
            <div className="font-medium">
              {quote.customer_name || 'No customer'}
            </div>
            {quote.customer_company && (
              <div className="text-sm text-muted-foreground">
                {quote.customer_company}
              </div>
            )}
          </div>
        </TableCell>
        <TableCell className="max-w-xs truncate">
          {quote.title || '-'}
        </TableCell>
        <TableCell>
          <Badge className={getStatusColor(quote.status)}>
            {quote.status}
          </Badge>
        </TableCell>
        <TableCell>{quote.package_count}</TableCell>
        <TableCell className="text-right font-medium">
          {formatCurrency(quote.total_monthly)}
        </TableCell>
        <TableCell className="text-right">
          {formatCurrency(quote.total_annual)}
        </TableCell>
        <TableCell>
          {quote.valid_until ? formatDate(quote.valid_until) : '-'}
        </TableCell>
        <TableCell className="text-muted-foreground">
          {formatDate(quote.created_at)}
        </TableCell>
        <TableCell>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" asChild>
              <Link to={`/quotes/${quote.id}`}>
                <Edit className="h-4 w-4" />
              </Link>
            </Button>
            {versionCount > 1 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => navigate(`/quotes/compare?group=${quote.version_group_id}`)}
                  >
                    <GitBranch className="mr-2 h-4 w-4" />
                    Compare Versions
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => navigate(`/quotes/${quote.id}`, {
                      state: { openVersionDialog: true }
                    })}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Create New Version
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </TableCell>
      </TableRow>
    )
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Quotes</h1>
          <p className="text-muted-foreground">Manage your pricing quotes</p>
        </div>
        <Button asChild>
          <Link to="/quotes/new">
            <Plus className="mr-2 h-4 w-4" />
            New Quote
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search quotes..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Switch
                id="groupVersions"
                checked={groupVersions}
                onCheckedChange={setGroupVersions}
              />
              <Label htmlFor="groupVersions" className="text-sm whitespace-nowrap">
                <GitBranch className="h-4 w-4 inline mr-1" />
                Group versions
              </Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quotes Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Quotes</CardTitle>
          <CardDescription>
            {filteredQuotes?.length || 0} quotes found
            {groupVersions && groupedQuotes && (
              <> ({groupedQuotes.groups.size} groups, {groupedQuotes.standalone.length} standalone)</>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : filteredQuotes && filteredQuotes.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quote #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Packages</TableHead>
                  <TableHead className="text-right">Monthly</TableHead>
                  <TableHead className="text-right">Annual</TableHead>
                  <TableHead>Valid Until</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupVersions && groupedQuotes ? (
                  <>
                    {/* Render version groups */}
                    {Array.from(groupedQuotes.groups.entries()).map(([groupId, quoteList]) => {
                      const latestQuote = quoteList[quoteList.length - 1]
                      return (
                        <TableRow key={groupId} className="bg-muted/50 border-b-0">
                          <TableCell colSpan={10}>
                            <div className="flex items-center justify-between py-2">
                              <div className="flex items-center gap-3">
                                <GitBranch className="h-5 w-5 text-primary" />
                                <div>
                                  <div className="font-medium">
                                    {latestQuote.customer_name || 'No customer'}
                                    {latestQuote.title && ` - ${latestQuote.title}`}
                                  </div>
                                  <div className="text-sm text-muted-foreground">
                                    {quoteList.length} versions | Latest: {formatCurrency(latestQuote.total_monthly)}/mo
                                  </div>
                                </div>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => navigate(`/quotes/compare?group=${groupId}`)}
                              >
                                <GitBranch className="mr-2 h-4 w-4" />
                                Compare
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                    {/* Also show versions in expanded view */}
                    {Array.from(groupedQuotes.groups.entries()).map(([_, quoteList]) =>
                      quoteList.map(quote => renderQuoteRow(quote, true))
                    )}
                    {/* Render standalone quotes */}
                    {groupedQuotes.standalone.map(quote => renderQuoteRow(quote))}
                  </>
                ) : (
                  filteredQuotes.map(quote => renderQuoteRow(quote))
                )}
              </TableBody>
            </Table>
          ) : (
            <div className="flex h-64 flex-col items-center justify-center text-center">
              <FileText className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-lg font-medium">No quotes found</p>
              <p className="text-muted-foreground">
                {search || statusFilter !== 'all'
                  ? 'Try adjusting your filters'
                  : 'Create your first quote to get started'}
              </p>
              {!search && statusFilter === 'all' && (
                <Button asChild className="mt-4">
                  <Link to="/quotes/new">
                    <Plus className="mr-2 h-4 w-4" />
                    New Quote
                  </Link>
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
