import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { FileText, Plus, Clock, CheckCircle, DollarSign } from 'lucide-react'
import { formatCurrency, formatDate, getStatusColor } from '@/lib/utils'
import type { QuoteSummary } from '@/types/database'

export default function Dashboard() {
  // Fetch recent quotes
  const { data: quotes, isLoading: quotesLoading } = useQuery({
    queryKey: ['quotes', 'recent'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quote_summary')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10)

      if (error) throw error
      return data as QuoteSummary[]
    },
  })

  // Calculate metrics
  const metrics = {
    totalQuotes: quotes?.length || 0,
    pendingValue: quotes
      ?.filter(q => q.status === 'pending' || q.status === 'sent')
      .reduce((sum, q) => sum + (q.total_monthly || 0), 0) || 0,
    acceptedThisMonth: quotes?.filter(q => q.status === 'accepted').length || 0,
    draftCount: quotes?.filter(q => q.status === 'draft').length || 0,
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Welcome to your pricing engine</p>
        </div>
        <Button asChild>
          <Link to="/quotes/new">
            <Plus className="mr-2 h-4 w-4" />
            New Quote
          </Link>
        </Button>
      </div>

      {/* Metrics */}
      <div className="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Quotes</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalQuotes}</div>
            <p className="text-xs text-muted-foreground">Recent quotes in system</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(metrics.pendingValue)}</div>
            <p className="text-xs text-muted-foreground">Monthly recurring</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Accepted</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.acceptedThisMonth}</div>
            <p className="text-xs text-muted-foreground">Quotes accepted</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Drafts</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.draftCount}</div>
            <p className="text-xs text-muted-foreground">Quotes in progress</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Quotes */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Recent Quotes</CardTitle>
              <CardDescription>Your most recent quote activity</CardDescription>
            </div>
            <Button variant="outline" asChild>
              <Link to="/quotes">View All</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {quotesLoading ? (
            <div className="flex h-32 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : quotes && quotes.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quote #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Monthly Value</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotes.map((quote) => (
                  <TableRow key={quote.id}>
                    <TableCell>
                      <Link
                        to={`/quotes/${quote.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {quote.quote_number}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{quote.customer_name || 'No customer'}</div>
                        {quote.customer_company && (
                          <div className="text-sm text-muted-foreground">
                            {quote.customer_company}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{quote.title || '-'}</TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(quote.status)}>
                        {quote.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(quote.total_monthly)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(quote.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex h-32 flex-col items-center justify-center text-center">
              <FileText className="mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-muted-foreground">No quotes yet</p>
              <Button asChild variant="link" className="mt-2">
                <Link to="/quotes/new">Create your first quote</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
