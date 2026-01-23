import { useState, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Upload, Settings2, TrendingUp, Save, FileText, ChevronDown,
  Calendar, DollarSign, BarChart3, AlertCircle, CheckCircle2,
  Info, Trash2, RefreshCw
} from 'lucide-react'
import { format } from 'date-fns'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
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
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/lib/supabase'
import { ExcelUploader } from '@/components/ExcelUploader'
import { TimeseriesChart } from '@/components/TimeseriesChart'
import { parseExcelFile, downloadTemplate, type ParseResult } from '@/lib/excel-parser'
import {
  calculateAllPeriodForecasts,
  calculateCommittedQuantities,
  generateForecastSummary,
  DEFAULT_FORECAST_CONFIG,
  type ForecastConfig,
} from '@/lib/timeseries-pricing'
import type {
  Customer,
  ParsedTimeseriesData,
  CommitmentStrategy,
  ForecastSkuMapping,
} from '@/types/database'

type PricingMode = 'pay_per_use' | 'fixed_commitment'

const TERM_OPTIONS = [
  { value: 12, label: '12 months' },
  { value: 24, label: '24 months' },
  { value: 36, label: '36 months' },
  { value: 48, label: '48 months' },
  { value: 60, label: '60 months' },
]

const STRATEGY_OPTIONS: { value: CommitmentStrategy; label: string; description: string }[] = [
  { value: 'peak', label: 'Peak', description: 'Maximum value across all periods (safest)' },
  { value: 'average', label: 'Average', description: 'Mean value across all periods' },
  { value: 'p90', label: 'P90', description: '90th percentile (covers 90% of periods)' },
  { value: 'p95', label: 'P95', description: '95th percentile (covers 95% of periods)' },
]

function formatNumber(num: number, decimals: number = 0): string {
  if (decimals === 0) {
    return num.toLocaleString()
  }
  return num.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })
}

export default function TimeSeriesForecast() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  // State
  const [forecastName, setForecastName] = useState('')
  const [forecastDescription, setForecastDescription] = useState('')
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [parsedData, setParsedData] = useState<ParsedTimeseriesData | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [parseWarnings, setParseWarnings] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [showConfig, setShowConfig] = useState(false)
  const [config, setConfig] = useState<ForecastConfig>(DEFAULT_FORECAST_CONFIG)
  const [pricingMode, setPricingMode] = useState<PricingMode>('pay_per_use')
  const [commitmentStrategy, setCommitmentStrategy] = useState<CommitmentStrategy>('peak')
  const [termMonths, setTermMonths] = useState(36)
  const [originalFilename, setOriginalFilename] = useState<string | null>(null)

  // Fetch customers
  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('is_active', true)
        .order('name')
      if (error) throw error
      return data as Customer[]
    }
  })

  // Fetch SKU mappings
  const { data: skuMappings = [] } = useQuery({
    queryKey: ['forecast-sku-mappings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('forecast_sku_mappings')
        .select('*, sku:skus(*)')
        .eq('is_active', true)
        .order('sort_order')
      if (error) throw error
      return data as ForecastSkuMapping[]
    }
  })

  // Calculate period forecasts
  const periodForecasts = useMemo(() => {
    if (!parsedData) return []
    try {
      return calculateAllPeriodForecasts(parsedData, config)
    } catch {
      return []
    }
  }, [parsedData, config])

  // Calculate summary
  const summary = useMemo(() => {
    return generateForecastSummary(periodForecasts)
  }, [periodForecasts])

  // Calculate committed quantities for fixed commitment
  const committedQuantities = useMemo(() => {
    if (periodForecasts.length === 0) return null
    return calculateCommittedQuantities(periodForecasts, commitmentStrategy)
  }, [periodForecasts, commitmentStrategy])

  // Handle file upload
  const handleFileSelect = useCallback(async (file: File) => {
    setIsLoading(true)
    setParseError(null)
    setParseWarnings([])

    try {
      const buffer = await file.arrayBuffer()
      const result: ParseResult = parseExcelFile(buffer)

      if (result.success && result.data) {
        setParsedData(result.data)
        setParseWarnings(result.warnings || [])
        setOriginalFilename(file.name)

        // Auto-set forecast name from filename
        if (!forecastName) {
          const nameWithoutExt = file.name.replace(/\.(xlsx|xls|csv)$/i, '')
          setForecastName(nameWithoutExt)
        }

        toast({
          title: 'File parsed successfully',
          description: `Found ${result.data.periods.length} periods and ${result.data.kpis.length} KPIs`,
        })
      } else {
        setParseError(result.error || 'Unknown error parsing file')
        setParsedData(null)
      }
    } catch (error) {
      setParseError(error instanceof Error ? error.message : 'Failed to read file')
      setParsedData(null)
    } finally {
      setIsLoading(false)
    }
  }, [forecastName, toast])

  // Handle config changes
  const handleConfigChange = (key: keyof ForecastConfig, value: number) => {
    setConfig(prev => ({ ...prev, [key]: value }))
  }

  const resetConfig = () => {
    setConfig(DEFAULT_FORECAST_CONFIG)
  }

  // Save forecast mutation
  const saveForecastMutation = useMutation({
    mutationFn: async () => {
      if (!parsedData || periodForecasts.length === 0) {
        throw new Error('No forecast data to save')
      }

      if (!forecastName.trim()) {
        throw new Error('Please enter a forecast name')
      }

      // Create the forecast record
      const { data: forecast, error: forecastError } = await supabase
        .from('timeseries_forecasts')
        .insert({
          customer_id: selectedCustomerId,
          name: forecastName.trim(),
          description: forecastDescription.trim() || null,
          granularity: parsedData.granularity,
          start_date: parsedData.startDate.toISOString().split('T')[0],
          end_date: parsedData.endDate.toISOString().split('T')[0],
          total_periods: periodForecasts.length,
          take_rate_pcs_udr: config.takeRatePcsUdr,
          take_rate_ccs_udr: config.takeRateCcsUdr,
          take_rate_scs_pcs: config.takeRateScsPcs,
          peak_average_ratio: config.peakAverageRatio,
          busy_hours: config.busyHours,
          days_per_month: config.daysPerMonth,
          original_filename: originalFilename,
        })
        .select()
        .single()

      if (forecastError) throw forecastError

      // Insert all period data points
      const dataPoints = periodForecasts.map(p => ({
        forecast_id: forecast.id,
        period_index: p.periodIndex,
        period_date: p.periodDate.toISOString().split('T')[0],
        total_sims: p.totalSims,
        gb_per_sim: p.gbPerSim,
        output_udr: p.udr,
        output_pcs: p.pcs,
        output_ccs: p.ccs,
        output_scs: p.scs,
        output_cos: p.cos,
        output_peak_throughput: p.peakThroughput,
        output_avg_throughput: p.avgThroughput,
        output_data_volume_gb: p.dataVolumeGb,
      }))

      const { error: dataError } = await supabase
        .from('timeseries_forecast_data')
        .insert(dataPoints)

      if (dataError) throw dataError

      return forecast
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeseries-forecasts'] })
      toast({
        title: 'Forecast saved',
        description: `"${forecastName}" has been saved successfully.`,
      })
    },
    onError: (error) => {
      toast({
        title: 'Error saving forecast',
        description: error.message,
        variant: 'destructive',
      })
    }
  })

  // Create quote mutation
  const createQuoteMutation = useMutation({
    mutationFn: async () => {
      if (!parsedData || periodForecasts.length === 0) {
        throw new Error('No forecast data')
      }

      // First save the forecast if not already saved
      let forecastId: string | null = null

      if (forecastName.trim()) {
        const saveResult = await saveForecastMutation.mutateAsync()
        forecastId = saveResult.id
      }

      // Create quote based on pricing mode
      const title = pricingMode === 'pay_per_use'
        ? `Pay-per-Use - ${forecastName || 'Time-Series Forecast'}`
        : `Fixed Commitment (${commitmentStrategy.toUpperCase()}, ${termMonths}mo) - ${forecastName || 'Time-Series Forecast'}`

      // Create the quote
      const { data: quote, error: quoteError } = await supabase
        .from('quotes')
        .insert({
          customer_id: selectedCustomerId,
          title,
          status: 'draft',
          source_timeseries_id: forecastId,
          timeseries_pricing_mode: pricingMode,
        })
        .select()
        .single()

      if (quoteError) throw quoteError

      // Create packages based on pricing mode
      if (pricingMode === 'pay_per_use') {
        // Create one package per month
        const packages = periodForecasts.map((p, idx) => ({
          quote_id: quote.id,
          package_name: p.periodLabel,
          term_months: 1,
          status: 'new',
          include_in_quote: true,
          sort_order: idx,
        }))

        const { data: createdPackages, error: pkgError } = await supabase
          .from('quote_packages')
          .insert(packages)
          .select()

        if (pkgError) throw pkgError

        // Create items for each package based on SKU mappings
        const items = []
        for (let i = 0; i < createdPackages.length; i++) {
          const pkg = createdPackages[i]
          const forecast = periodForecasts[i]

          const kpiValues: Record<string, number> = {
            udr: forecast.udr,
            pcs: forecast.pcs,
            ccs: forecast.ccs,
            scs: forecast.scs,
            cos: forecast.cos,
            peak_throughput: forecast.peakThroughput,
          }

          for (const mapping of skuMappings) {
            if (!mapping.is_active || !mapping.sku_id) continue
            const kpiValue = kpiValues[mapping.kpi_type]
            if (kpiValue === undefined || kpiValue <= 0) continue

            items.push({
              package_id: pkg.id,
              sku_id: mapping.sku_id,
              quantity: Math.ceil(kpiValue * mapping.multiplier),
              term_months: 1,
              environment: 'production',
              sort_order: items.length,
            })
          }
        }

        if (items.length > 0) {
          const { error: itemError } = await supabase
            .from('quote_items')
            .insert(items)

          if (itemError) throw itemError
        }
      } else {
        // Fixed commitment: Create single package
        if (!committedQuantities) throw new Error('No committed quantities calculated')

        const { data: pkg, error: pkgError } = await supabase
          .from('quote_packages')
          .insert({
            quote_id: quote.id,
            package_name: `${termMonths}-Month Commitment (${commitmentStrategy.toUpperCase()})`,
            term_months: termMonths,
            status: 'new',
            include_in_quote: true,
            sort_order: 0,
          })
          .select()
          .single()

        if (pkgError) throw pkgError

        const kpiValues: Record<string, number> = {
          udr: committedQuantities.udr,
          pcs: committedQuantities.pcs,
          ccs: committedQuantities.ccs,
          scs: committedQuantities.scs,
          cos: committedQuantities.cos,
          peak_throughput: committedQuantities.peakThroughput,
        }

        const items = []
        for (const mapping of skuMappings) {
          if (!mapping.is_active || !mapping.sku_id) continue
          const kpiValue = kpiValues[mapping.kpi_type]
          if (kpiValue === undefined || kpiValue <= 0) continue

          items.push({
            package_id: pkg.id,
            sku_id: mapping.sku_id,
            quantity: Math.ceil(kpiValue * mapping.multiplier),
            term_months: termMonths,
            environment: 'production',
            sort_order: items.length,
          })
        }

        if (items.length > 0) {
          const { error: itemError } = await supabase
            .from('quote_items')
            .insert(items)

          if (itemError) throw itemError
        }
      }

      return quote
    },
    onSuccess: (quote) => {
      toast({
        title: 'Quote created',
        description: 'Redirecting to quote builder...',
      })
      navigate(`/quotes/${quote.id}`)
    },
    onError: (error) => {
      toast({
        title: 'Error creating quote',
        description: error.message,
        variant: 'destructive',
      })
    }
  })

  // Clear data
  const handleClear = () => {
    setParsedData(null)
    setParseError(null)
    setParseWarnings([])
    setOriginalFilename(null)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Time-Series Forecast</h1>
          <p className="text-muted-foreground">
            Import Excel forecasts and generate pricing for multiple periods
          </p>
        </div>
        <div className="flex items-center gap-2">
          {parsedData && (
            <>
              <Button
                variant="outline"
                onClick={() => saveForecastMutation.mutate()}
                disabled={saveForecastMutation.isPending || !forecastName.trim()}
              >
                <Save className="mr-2 h-4 w-4" />
                Save Forecast
              </Button>
              <Button
                onClick={() => createQuoteMutation.mutate()}
                disabled={createQuoteMutation.isPending || skuMappings.length === 0}
              >
                <FileText className="mr-2 h-4 w-4" />
                Generate Quote
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column - Upload & Config */}
        <div className="space-y-6">
          {/* Forecast Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Forecast Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="forecastName">Forecast Name</Label>
                <Input
                  id="forecastName"
                  value={forecastName}
                  onChange={(e) => setForecastName(e.target.value)}
                  placeholder="e.g., Customer Growth 2025-2027"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="customer">Customer (optional)</Label>
                <Select
                  value={selectedCustomerId || 'none'}
                  onValueChange={(v) => setSelectedCustomerId(v === 'none' ? null : v)}
                >
                  <SelectTrigger id="customer">
                    <SelectValue placeholder="Select a customer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No customer</SelectItem>
                    {customers.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.name}{customer.company ? ` (${customer.company})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  value={forecastDescription}
                  onChange={(e) => setForecastDescription(e.target.value)}
                  placeholder="Brief description..."
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>

          {/* Upload Panel */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Upload className="h-4 w-4" />
                Import Data
              </CardTitle>
              <CardDescription>
                Upload an Excel file with time periods in columns
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!parsedData ? (
                <ExcelUploader
                  onFileSelect={handleFileSelect}
                  onTemplateDownload={downloadTemplate}
                  isLoading={isLoading}
                  error={parseError}
                />
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-lg border bg-green-50 p-3 dark:bg-green-950/20">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                      <div>
                        <p className="text-sm font-medium">Data loaded</p>
                        <p className="text-xs text-muted-foreground">
                          {originalFilename}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleClear}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {parseWarnings.length > 0 && (
                    <Alert variant="warning">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Warnings</AlertTitle>
                      <AlertDescription>
                        <ul className="list-inside list-disc text-xs">
                          {parseWarnings.map((w, i) => (
                            <li key={i}>{w}</li>
                          ))}
                        </ul>
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Periods</p>
                      <p className="font-medium">{parsedData.periods.length}</p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Granularity</p>
                      <p className="font-medium capitalize">{parsedData.granularity}</p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Start</p>
                      <p className="font-medium">{format(parsedData.startDate, 'MMM yyyy')}</p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">End</p>
                      <p className="font-medium">{format(parsedData.endDate, 'MMM yyyy')}</p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Config Panel */}
          {parsedData && (
            <Card>
              <Collapsible open={showConfig} onOpenChange={setShowConfig}>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer">
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Settings2 className="h-4 w-4" />
                        Configuration
                      </CardTitle>
                      <ChevronDown className={`h-4 w-4 transition-transform ${showConfig ? 'rotate-180' : ''}`} />
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="space-y-4 pt-0">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">PCS/UDR Rate (%)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={config.takeRatePcsUdr * 100}
                          onChange={(e) => handleConfigChange('takeRatePcsUdr', Number(e.target.value) / 100)}
                          className="h-8"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">CCS/UDR Rate (%)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={config.takeRateCcsUdr * 100}
                          onChange={(e) => handleConfigChange('takeRateCcsUdr', Number(e.target.value) / 100)}
                          className="h-8"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">SCS/PCS Rate (%)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={config.takeRateScsPcs * 100}
                          onChange={(e) => handleConfigChange('takeRateScsPcs', Number(e.target.value) / 100)}
                          className="h-8"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Peak/Avg Ratio</Label>
                        <Input
                          type="number"
                          step="0.1"
                          value={config.peakAverageRatio}
                          onChange={(e) => handleConfigChange('peakAverageRatio', Number(e.target.value))}
                          className="h-8"
                        />
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={resetConfig}>
                      <RefreshCw className="mr-2 h-3 w-3" />
                      Reset Defaults
                    </Button>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          )}
        </div>

        {/* Right Column - Results & Pricing */}
        <div className="lg:col-span-2 space-y-6">
          {!parsedData ? (
            <Card className="flex h-96 items-center justify-center">
              <div className="text-center">
                <Upload className="mx-auto h-12 w-12 text-muted-foreground/50" />
                <p className="mt-4 text-lg font-medium">Upload a forecast file</p>
                <p className="text-sm text-muted-foreground">
                  Import an Excel file to see the forecast preview and pricing options
                </p>
              </div>
            </Card>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Periods</span>
                    </div>
                    <p className="mt-1 text-2xl font-bold">{summary.totalPeriods}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(summary.startDate, 'MMM yy')} - {format(summary.endDate, 'MMM yy')}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">SIM Growth</span>
                    </div>
                    <p className="mt-1 text-2xl font-bold">
                      {summary.sims.growth > 0 ? '+' : ''}{summary.sims.growth.toFixed(0)}%
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatNumber(summary.sims.min)} → {formatNumber(summary.sims.max)}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Avg SIMs</span>
                    </div>
                    <p className="mt-1 text-2xl font-bold">{formatNumber(summary.sims.avg)}</p>
                    <p className="text-xs text-muted-foreground">
                      Peak: {formatNumber(summary.sims.max)}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Data Volume</span>
                    </div>
                    <p className="mt-1 text-2xl font-bold">
                      {formatNumber(summary.dataVolume.total / 1000000, 1)}M
                    </p>
                    <p className="text-xs text-muted-foreground">
                      GB total over {summary.totalPeriods} periods
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Chart */}
              <TimeseriesChart data={periodForecasts} />

              {/* Pricing Mode Selection */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <DollarSign className="h-4 w-4" />
                    Pricing Mode
                  </CardTitle>
                  <CardDescription>
                    Choose how to price this forecast
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Tabs value={pricingMode} onValueChange={(v) => setPricingMode(v as PricingMode)}>
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="pay_per_use">Pay-per-Use</TabsTrigger>
                      <TabsTrigger value="fixed_commitment">Fixed Commitment</TabsTrigger>
                    </TabsList>

                    <TabsContent value="pay_per_use" className="mt-4 space-y-4">
                      <Alert>
                        <Info className="h-4 w-4" />
                        <AlertDescription>
                          Each month is priced independently with a 1-month term.
                          Creates {periodForecasts.length} separate packages in the quote.
                        </AlertDescription>
                      </Alert>

                      <div className="rounded-lg border p-4">
                        <h4 className="font-medium mb-2">Monthly Packages</h4>
                        <p className="text-sm text-muted-foreground">
                          {periodForecasts.length} packages will be created, one for each period from{' '}
                          {periodForecasts[0]?.periodLabel} to {periodForecasts[periodForecasts.length - 1]?.periodLabel}
                        </p>
                      </div>
                    </TabsContent>

                    <TabsContent value="fixed_commitment" className="mt-4 space-y-4">
                      <Alert>
                        <Info className="h-4 w-4" />
                        <AlertDescription>
                          Commit to fixed quantities for the entire term.
                          Volume and term discounts apply.
                        </AlertDescription>
                      </Alert>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Commitment Strategy</Label>
                          <Select
                            value={commitmentStrategy}
                            onValueChange={(v) => setCommitmentStrategy(v as CommitmentStrategy)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {STRATEGY_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  <div>
                                    <span className="font-medium">{opt.label}</span>
                                    <span className="ml-2 text-xs text-muted-foreground">
                                      {opt.description}
                                    </span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>Term Length</Label>
                          <Select
                            value={String(termMonths)}
                            onValueChange={(v) => setTermMonths(Number(v))}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {TERM_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={String(opt.value)}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Committed Quantities */}
                      {committedQuantities && (
                        <div className="rounded-lg border p-4">
                          <h4 className="font-medium mb-3">Committed Quantities ({commitmentStrategy.toUpperCase()})</h4>
                          <div className="grid grid-cols-3 gap-3 text-sm">
                            <div>
                              <p className="text-xs text-muted-foreground">UDR</p>
                              <p className="font-medium">{formatNumber(committedQuantities.udr)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">PCS</p>
                              <p className="font-medium">{formatNumber(committedQuantities.pcs)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">CCS</p>
                              <p className="font-medium">{formatNumber(committedQuantities.ccs)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">SCS</p>
                              <p className="font-medium">{formatNumber(committedQuantities.scs)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">CoS</p>
                              <p className="font-medium">{formatNumber(committedQuantities.cos)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Peak Throughput</p>
                              <p className="font-medium">{committedQuantities.peakThroughput.toFixed(3)} Gbit/s</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>

              {/* Data Preview */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Data Preview</CardTitle>
                  <CardDescription>
                    First 10 periods of calculated forecast data
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-24">Period</TableHead>
                          <TableHead className="text-right">SIMs</TableHead>
                          <TableHead className="text-right">GB/SIM</TableHead>
                          <TableHead className="text-right">UDR</TableHead>
                          <TableHead className="text-right">PCS</TableHead>
                          <TableHead className="text-right">CCS</TableHead>
                          <TableHead className="text-right">CoS</TableHead>
                          <TableHead className="text-right">Peak (Gbit/s)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {periodForecasts.slice(0, 10).map((p) => (
                          <TableRow key={p.periodIndex}>
                            <TableCell className="font-medium">{p.periodLabel}</TableCell>
                            <TableCell className="text-right">{formatNumber(p.totalSims)}</TableCell>
                            <TableCell className="text-right">{p.gbPerSim.toFixed(1)}</TableCell>
                            <TableCell className="text-right">{formatNumber(p.udr)}</TableCell>
                            <TableCell className="text-right">{formatNumber(p.pcs)}</TableCell>
                            <TableCell className="text-right">{formatNumber(p.ccs)}</TableCell>
                            <TableCell className="text-right">{formatNumber(p.cos)}</TableCell>
                            <TableCell className="text-right">{p.peakThroughput.toFixed(4)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {periodForecasts.length > 10 && (
                    <p className="mt-2 text-xs text-muted-foreground text-center">
                      Showing 10 of {periodForecasts.length} periods
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* SKU Mapping Warning */}
              {skuMappings.length === 0 && (
                <Alert variant="warning">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>No SKU Mappings Configured</AlertTitle>
                  <AlertDescription>
                    To generate quotes, you need to configure SKU mappings in{' '}
                    <Button
                      variant="link"
                      className="h-auto p-0"
                      onClick={() => navigate('/admin/forecast-mapping')}
                    >
                      Admin → Forecast Mapping
                    </Button>
                  </AlertDescription>
                </Alert>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
