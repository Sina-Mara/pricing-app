import { useState, useMemo, useCallback, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Loader2, ArrowLeft, ArrowRight, Check, Layers,
  SplitSquareVertical, FolderOpen, Plus, Calendar,
  TrendingUp, BarChart3, Users, Database, AlertCircle,
  FileText, Sparkles, Zap,
} from 'lucide-react'
import { format } from 'date-fns'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

import { YearlyForecastInput, type YearlyForecastRow } from '@/components/YearlyForecastInput'
import { WizardStepper, type WizardStep } from '@/components/ui/wizard-stepper'
import {
  CommitmentStrategyPicker,
  CommitmentModeSelector,
  PerPeriodPreview,
  type CommitmentMode,
} from '@/components/CommitmentStrategyPicker'
import { ManualSkuInput } from '@/components/ManualSkuInput'

import { useForecastSave, configToYearlyRows } from '@/hooks/useForecastSave'
import { interpolateYearlyToMonthly } from '@/lib/timeseries-pricing'
import { handleCreateScenarios, getScenariosByIds } from '@/lib/scenario-generator'
import {
  generateMultiModeCommitmentQuote,
  generatePerPeriodPayPerUseQuote,
  generatePayPerUseQuote,
  extractYearsFromScenarios,
  type CommitmentSizingStrategy,
  type ManualSkuItem,
} from '@/lib/quote-generator'
import type { Customer, ForecastScenario, Sku, ForecastSkuMapping } from '@/types/database'
import type { ScenarioType, ConsolidationStrategy } from '@/components/CreateScenarioModal'

// =============================================================================
// Constants
// =============================================================================

const WIZARD_STEPS: WizardStep[] = [
  { id: 'input', label: 'Forecast Input', description: 'Enter yearly data' },
  { id: 'scenarios', label: 'Scenarios', description: 'Configure scenarios' },
  { id: 'quote-config', label: 'Quote Config', description: 'Set quote options' },
  { id: 'generate', label: 'Generate', description: 'Review & create' },
]

// =============================================================================
// Helpers
// =============================================================================

function formatNumber(num: number, decimals: number = 0): string {
  if (decimals === 0) return num.toLocaleString()
  return num.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function calculateGbPerSim(sims: number, totalGb: number): number {
  if (sims <= 0) return 0
  return totalGb / sims
}

// Permissive config type for DB
type TimeseriesForecastWithConfig = {
  id: string
  name: string
  description: string | null
  customer_id: string | null
  config?: unknown
  customer?: Customer | null
}

// =============================================================================
// Main Component
// =============================================================================

export default function ForecastWizardPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { saveForecast, isPending: isSaving } = useForecastSave()

  // ── Wizard state ──────────────────────────────────────────────────────
  const [currentStep, setCurrentStep] = useState(0)
  const [completedSteps, setCompletedSteps] = useState<number[]>([])

  // ── Step 1: Forecast input ────────────────────────────────────────────
  const [yearlyData, setYearlyData] = useState<YearlyForecastRow[]>([])
  const [forecastName, setForecastName] = useState('')
  const [forecastDescription, setForecastDescription] = useState('')
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [selectedForecastId, setSelectedForecastId] = useState<string | null>(null)

  // ── Step 2: Scenarios ─────────────────────────────────────────────────
  const [scenarioType, setScenarioType] = useState<ScenarioType>('per_year')
  const [scenarioNamePrefix, setScenarioNamePrefix] = useState('')
  const [consolidatedName, setConsolidatedName] = useState('')
  const [consolidationStrategy, setConsolidationStrategy] = useState<ConsolidationStrategy>('peak')
  const [customSims, setCustomSims] = useState(0)
  const [customGbPerSim, setCustomGbPerSim] = useState(0)
  const [createdScenarios, setCreatedScenarios] = useState<ForecastScenario[]>([])

  // ── Step 3: Quote config ──────────────────────────────────────────────
  const [quoteType, setQuoteType] = useState<'commitment' | 'pay_per_use'>('commitment')
  const [commitmentMode, setCommitmentMode] = useState<CommitmentMode>('max')
  const [commitmentStrategy, setCommitmentStrategy] = useState<CommitmentSizingStrategy>('peak')
  const [specificYear, setSpecificYear] = useState<number | undefined>(undefined)
  const [termMonths, setTermMonths] = useState(36)
  const [manualSkuItems, setManualSkuItems] = useState<ManualSkuItem[]>([])

  // ── Step 4: Generate ──────────────────────────────────────────────────
  const [isGenerating, setIsGenerating] = useState(false)

  // ── Transition state ──────────────────────────────────────────────────
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [showBackConfirm, setShowBackConfirm] = useState(false)

  // ── Queries ───────────────────────────────────────────────────────────
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
    },
  })

  const { data: forecasts = [] } = useQuery({
    queryKey: ['timeseries-forecasts', 'yearly', selectedCustomerId],
    queryFn: async () => {
      let query = supabase
        .from('timeseries_forecasts')
        .select('*, customer:customers(*)')
        .eq('granularity', 'yearly')
        .order('updated_at', { ascending: false })
      if (selectedCustomerId) {
        query = query.or(`customer_id.eq.${selectedCustomerId},customer_id.is.null`)
      }
      const { data, error } = await query
      if (error) throw error
      return data as TimeseriesForecastWithConfig[]
    },
  })

  const { data: allSkus = [] } = useQuery({
    queryKey: ['skus-active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('skus')
        .select('*')
        .eq('is_active', true)
        .order('code')
      if (error) throw error
      return data as Sku[]
    },
  })

  const { data: forecastMappings = [] } = useQuery({
    queryKey: ['forecast-sku-mappings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('forecast_sku_mappings')
        .select('*, sku:skus(*)')
        .eq('is_active', true)
        .order('sort_order')
      if (error) throw error
      return data as (ForecastSkuMapping & { sku: Sku })[]
    },
  })

  // ── Derived data ──────────────────────────────────────────────────────

  const sortedYearlyData = useMemo(
    () => [...yearlyData].sort((a, b) => a.year - b.year),
    [yearlyData]
  )

  const monthlyData = useMemo(() => {
    if (yearlyData.length === 0) return []
    const points = yearlyData
      .filter(r => r.endOfYearSims > 0)
      .map(r => ({ year: r.year, totalSims: r.endOfYearSims, totalDataUsageGb: r.totalDataUsageGB }))
    if (points.length === 0) return []
    return interpolateYearlyToMonthly(points)
  }, [yearlyData])

  const summary = useMemo(() => {
    if (monthlyData.length === 0) {
      return { totalPeriods: 0, startDate: null as Date | null, endDate: null as Date | null, minSims: 0, maxSims: 0, avgSims: 0, growth: 0 }
    }
    const sims = monthlyData.map(m => m.totalSims)
    const growth = sims[0] > 0 ? ((sims[sims.length - 1] - sims[0]) / sims[0]) * 100 : 0
    return {
      totalPeriods: monthlyData.length,
      startDate: monthlyData[0].date,
      endDate: monthlyData[monthlyData.length - 1].date,
      minSims: Math.min(...sims),
      maxSims: Math.max(...sims),
      avgSims: Math.ceil(sims.reduce((a, b) => a + b, 0) / sims.length),
      growth,
    }
  }, [monthlyData])

  // Consolidation preview values
  const consolidatedValues = useMemo(() => {
    if (sortedYearlyData.length === 0) return { peak: { sims: 0, gbPerSim: 0 }, average: { sims: 0, gbPerSim: 0 } }
    const simsArr = sortedYearlyData.map(d => d.endOfYearSims)
    const gbArr = sortedYearlyData.map(d => calculateGbPerSim(d.endOfYearSims, d.totalDataUsageGB))
    const peakSims = Math.max(...simsArr)
    const peakIdx = simsArr.indexOf(peakSims)
    return {
      peak: { sims: peakSims, gbPerSim: gbArr[peakIdx] },
      average: {
        sims: Math.ceil(simsArr.reduce((a, b) => a + b, 0) / simsArr.length),
        gbPerSim: gbArr.reduce((a, b) => a + b, 0) / gbArr.length,
      },
    }
  }, [sortedYearlyData])

  // Scenario years for commitment config
  const scenarioYears = useMemo(
    () => extractYearsFromScenarios(createdScenarios),
    [createdScenarios]
  )

  // ── Load existing forecast ────────────────────────────────────────────

  const handleLoadForecast = useCallback((forecastId: string) => {
    const forecast = forecasts.find(f => f.id === forecastId)
    if (!forecast) return
    const rows = configToYearlyRows(forecast.config)
    setYearlyData(rows)
    setForecastName(forecast.name)
    setForecastDescription(forecast.description || '')
    setSelectedCustomerId(forecast.customer_id)
    setSelectedForecastId(forecast.id)
  }, [forecasts])

  // Init scenario names from forecast name
  useEffect(() => {
    if (forecastName && !scenarioNamePrefix) {
      setScenarioNamePrefix(forecastName)
    }
    if (forecastName && !consolidatedName) {
      setConsolidatedName(`${forecastName} - Consolidated`)
    }
  }, [forecastName]) // eslint-disable-line react-hooks/exhaustive-deps

  // Update custom sims when strategy changes
  useEffect(() => {
    if (consolidationStrategy === 'peak') {
      setCustomSims(consolidatedValues.peak.sims)
      setCustomGbPerSim(consolidatedValues.peak.gbPerSim)
    } else if (consolidationStrategy === 'average') {
      setCustomSims(consolidatedValues.average.sims)
      setCustomGbPerSim(consolidatedValues.average.gbPerSim)
    }
  }, [consolidationStrategy, consolidatedValues])

  // ── Step transitions ──────────────────────────────────────────────────

  const goToStep = useCallback((step: number) => {
    setCurrentStep(step)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const handleNext = useCallback(async () => {
    if (isTransitioning) return
    setIsTransitioning(true)

    try {
      if (currentStep === 0) {
        // Step 1→2: Validate + auto-save
        if (yearlyData.length === 0) {
          toast({ title: 'No data', description: 'Please enter at least one year of forecast data.', variant: 'destructive' })
          return
        }
        if (!forecastName.trim()) {
          toast({ title: 'Missing name', description: 'Please enter a forecast name.', variant: 'destructive' })
          return
        }

        const result = await saveForecast({
          yearlyData,
          forecastName,
          description: forecastDescription,
          customerId: selectedCustomerId,
          forecastId: selectedForecastId,
        })

        setSelectedForecastId(result.id)
        toast({ title: 'Forecast saved', description: `"${result.name}" saved successfully.` })

        setCompletedSteps(prev => prev.includes(0) ? prev : [...prev, 0])
        goToStep(1)
      } else if (currentStep === 1) {
        // Step 2→3: Generate scenarios
        const validData = yearlyData.filter(r => r.endOfYearSims > 0)
        if (validData.length === 0) {
          toast({ title: 'No valid data', description: 'At least one year must have SIM data.', variant: 'destructive' })
          return
        }

        const names = scenarioType === 'per_year'
          ? sortedYearlyData.filter(r => r.endOfYearSims > 0).map(d => `${scenarioNamePrefix || forecastName} - ${d.year}`)
          : [consolidatedName || `${forecastName} - Consolidated`]

        const scenarioIds = await handleCreateScenarios(
          {
            type: scenarioType,
            consolidationStrategy: scenarioType === 'consolidated' ? consolidationStrategy : undefined,
            customValues: scenarioType === 'consolidated' && consolidationStrategy === 'custom'
              ? { totalSims: customSims, gbPerSim: customGbPerSim / 12 }
              : undefined,
            scenarioNames: names,
            forecastId: selectedForecastId || '',
            customerId: selectedCustomerId || undefined,
          },
          yearlyData,
          selectedForecastId || undefined
        )

        const scenarios = await getScenariosByIds(scenarioIds)
        setCreatedScenarios(scenarios)

        toast({ title: 'Scenarios created', description: `${scenarios.length} scenario(s) created.` })

        setCompletedSteps(prev => prev.includes(1) ? prev : [...prev, 1])
        goToStep(2)
      } else if (currentStep === 2) {
        // Step 3→4: Validate quote config
        if (quoteType === 'commitment' && commitmentMode === 'max' && termMonths < 1) {
          toast({ title: 'Invalid term', description: 'Please select a valid term length.', variant: 'destructive' })
          return
        }
        setCompletedSteps(prev => prev.includes(2) ? prev : [...prev, 2])
        goToStep(3)
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'An unexpected error occurred.',
        variant: 'destructive',
      })
    } finally {
      setIsTransitioning(false)
    }
  }, [
    currentStep, isTransitioning, yearlyData, forecastName, forecastDescription,
    selectedCustomerId, selectedForecastId, saveForecast, scenarioType,
    scenarioNamePrefix, consolidatedName, consolidationStrategy, customSims,
    customGbPerSim, sortedYearlyData, quoteType, commitmentMode, termMonths,
    toast, goToStep,
  ])

  const handleBack = useCallback(() => {
    if (currentStep === 2 && createdScenarios.length > 0) {
      // Going back from Step 3 to 2 discards scenarios
      setShowBackConfirm(true)
    } else if (currentStep > 0) {
      goToStep(currentStep - 1)
    }
  }, [currentStep, createdScenarios.length, goToStep])

  const confirmBackToScenarios = useCallback(() => {
    setCreatedScenarios([])
    setCompletedSteps(prev => prev.filter(s => s < 1))
    setShowBackConfirm(false)
    goToStep(1)
  }, [goToStep])

  const handleGenerate = useCallback(async () => {
    if (isGenerating) return
    setIsGenerating(true)

    try {
      const scenarios = createdScenarios
      if (scenarios.length === 0) {
        throw new Error('No scenarios available')
      }

      let quoteId: string

      if (quoteType === 'commitment') {
        const result = await generateMultiModeCommitmentQuote({
          scenarios,
          customerId: selectedCustomerId || undefined,
          commitmentMode,
          strategy: commitmentStrategy,
          termMonths: commitmentMode === 'max' ? termMonths : undefined,
          manualItems: manualSkuItems.filter(i => i.quantity > 0),
        })
        quoteId = result.quoteId
      } else if (scenarios.length > 1) {
        const result = await generatePerPeriodPayPerUseQuote(
          scenarios,
          selectedCustomerId || undefined,
          undefined,
          undefined,
          manualSkuItems.filter(i => i.quantity > 0),
        )
        quoteId = result.quoteId
      } else {
        const result = await generatePayPerUseQuote(
          scenarios,
          selectedCustomerId || undefined,
        )
        quoteId = result.quoteId
      }

      toast({ title: 'Quote generated', description: 'Redirecting to the Quote Builder...' })
      navigate(`/quotes/${quoteId}`)
    } catch (error) {
      toast({
        title: 'Error generating quote',
        description: error instanceof Error ? error.message : 'Failed to generate quote.',
        variant: 'destructive',
      })
    } finally {
      setIsGenerating(false)
    }
  }, [
    isGenerating, createdScenarios, quoteType, selectedCustomerId,
    commitmentMode, commitmentStrategy, termMonths, manualSkuItems,
    toast, navigate,
  ])

  // ── Stepper click ─────────────────────────────────────────────────────

  const handleStepClick = useCallback((index: number) => {
    if (completedSteps.includes(index) && index < currentStep) {
      if (index < 2 && currentStep >= 2 && createdScenarios.length > 0) {
        setShowBackConfirm(true)
      } else {
        goToStep(index)
      }
    }
  }, [completedSteps, currentStep, createdScenarios.length, goToStep])

  // ── Next button label ─────────────────────────────────────────────────

  const nextLabel = useMemo(() => {
    switch (currentStep) {
      case 0: return 'Save & Continue'
      case 1: return 'Create Scenarios'
      case 2: return 'Review & Generate'
      case 3: return 'Generate Quote'
      default: return 'Next'
    }
  }, [currentStep])

  // =====================================================================
  // RENDER — Step 1: Forecast Input
  // =====================================================================

  const renderStep1 = () => (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Left Column - Input */}
      <div className="lg:col-span-2 space-y-6">
        {/* Forecast Metadata */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Forecast Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="forecastName">Forecast Name *</Label>
                <Input
                  id="forecastName"
                  value={forecastName}
                  onChange={e => setForecastName(e.target.value)}
                  placeholder="e.g., Customer Growth 2026-2028"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customer">Customer</Label>
                <Select
                  value={selectedCustomerId || 'none'}
                  onValueChange={v => setSelectedCustomerId(v === 'none' ? null : v)}
                >
                  <SelectTrigger id="customer">
                    <SelectValue placeholder="Select customer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No customer (template)</SelectItem>
                    {customers.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}{c.company ? ` (${c.company})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="forecastDesc">Description</Label>
              <Textarea
                id="forecastDesc"
                value={forecastDescription}
                onChange={e => setForecastDescription(e.target.value)}
                placeholder="Brief description of this forecast..."
                rows={2}
              />
            </div>

            {/* Load Existing Forecast */}
            <div className="flex items-center gap-2 pt-2 border-t">
              <Label className="text-sm whitespace-nowrap text-muted-foreground">Load Existing:</Label>
              <Select
                value={selectedForecastId || 'new'}
                onValueChange={v => {
                  if (v === 'new') {
                    setSelectedForecastId(null)
                    setForecastName('')
                    setForecastDescription('')
                    setYearlyData([])
                  } else {
                    handleLoadForecast(v)
                  }
                }}
              >
                <SelectTrigger className="w-[280px]">
                  <SelectValue placeholder="New Forecast" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">
                    <span className="flex items-center gap-2">
                      <Plus className="h-4 w-4" />
                      New Forecast
                    </span>
                  </SelectItem>
                  {forecasts.length > 0 && <Separator className="my-1" />}
                  {forecasts.map(f => (
                    <SelectItem key={f.id} value={f.id}>
                      <span className="flex items-center gap-2">
                        <FolderOpen className="h-4 w-4" />
                        {f.name}
                        {f.customer?.name && (
                          <span className="text-xs text-muted-foreground">({f.customer.name})</span>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Yearly data table */}
        <YearlyForecastInput
          data={yearlyData}
          onChange={setYearlyData}
          title="Yearly Forecast Data"
          description="Enter end-of-year SIM counts and total data usage. Monthly values will be interpolated."
        />
      </div>

      {/* Right Column - Summary */}
      <div className="space-y-6">
        {monthlyData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Interpolated Summary</CardTitle>
              <CardDescription>Monthly data derived from yearly inputs</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border p-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>Periods</span>
                  </div>
                  <p className="mt-1 text-xl font-bold">{summary.totalPeriods}</p>
                  {summary.startDate && summary.endDate && (
                    <p className="text-xs text-muted-foreground">
                      {format(summary.startDate, 'MMM yy')} - {format(summary.endDate, 'MMM yy')}
                    </p>
                  )}
                </div>
                <div className="rounded-lg border p-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <TrendingUp className="h-4 w-4" />
                    <span>Growth</span>
                  </div>
                  <p className="mt-1 text-xl font-bold">
                    {summary.growth > 0 ? '+' : ''}{summary.growth.toFixed(0)}%
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <BarChart3 className="h-4 w-4" />
                    <span>SIM Range</span>
                  </div>
                  <p className="mt-1 text-xl font-bold">{formatNumber(summary.maxSims)}</p>
                  <p className="text-xs text-muted-foreground">Min: {formatNumber(summary.minSims)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <BarChart3 className="h-4 w-4" />
                    <span>Avg SIMs</span>
                  </div>
                  <p className="mt-1 text-xl font-bold">{formatNumber(summary.avgSims)}</p>
                  <p className="text-xs text-muted-foreground">Per month</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {monthlyData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Monthly Preview</CardTitle>
              <CardDescription>First 6 months of interpolated data</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {monthlyData.slice(0, 6).map((m, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                    <span className="text-muted-foreground">{format(m.date, 'MMM yyyy')}</span>
                    <span className="font-medium">{formatNumber(m.totalSims)} SIMs</span>
                  </div>
                ))}
                {monthlyData.length > 6 && (
                  <p className="text-xs text-muted-foreground text-center pt-2">+{monthlyData.length - 6} more months</p>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )

  // =====================================================================
  // RENDER — Step 2: Scenarios
  // =====================================================================

  const perYearNames = useMemo(() => {
    return sortedYearlyData
      .filter(r => r.endOfYearSims > 0)
      .map(d => `${scenarioNamePrefix || forecastName || 'Forecast'} - ${d.year}`)
  }, [sortedYearlyData, scenarioNamePrefix, forecastName])

  const renderStep2 = () => (
    <div className="space-y-6 max-w-3xl">
      {/* Scenario Type Cards */}
      <div>
        <Label className="text-base font-semibold">Scenario Type</Label>
        <p className="text-sm text-muted-foreground mb-3">Choose how to create scenarios from your forecast data</p>
        <div className="grid grid-cols-2 gap-4">
          <Card
            className={cn(
              'cursor-pointer transition-all hover:border-primary/50',
              scenarioType === 'per_year' && 'border-primary ring-2 ring-primary/20'
            )}
            onClick={() => setScenarioType('per_year')}
          >
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className={cn('p-2 rounded-lg', scenarioType === 'per_year' ? 'bg-primary/10 text-primary' : 'bg-muted')}>
                  <SplitSquareVertical className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="font-medium">One Per Year</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Create {sortedYearlyData.filter(r => r.endOfYearSims > 0).length} separate scenario{sortedYearlyData.filter(r => r.endOfYearSims > 0).length !== 1 ? 's' : ''}
                  </p>
                </div>
                {scenarioType === 'per_year' && <Check className="h-5 w-5 text-primary" />}
              </div>
            </CardContent>
          </Card>

          <Card
            className={cn(
              'cursor-pointer transition-all hover:border-primary/50',
              scenarioType === 'consolidated' && 'border-primary ring-2 ring-primary/20'
            )}
            onClick={() => setScenarioType('consolidated')}
          >
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className={cn('p-2 rounded-lg', scenarioType === 'consolidated' ? 'bg-primary/10 text-primary' : 'bg-muted')}>
                  <Layers className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="font-medium">Consolidated</div>
                  <p className="text-xs text-muted-foreground mt-1">1 combined scenario using peak/avg values</p>
                </div>
                {scenarioType === 'consolidated' && <Check className="h-5 w-5 text-primary" />}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Separator />

      {/* Configuration */}
      {scenarioType === 'per_year' ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="namePrefix">Scenario Name Prefix</Label>
            <Input
              id="namePrefix"
              value={scenarioNamePrefix}
              onChange={e => setScenarioNamePrefix(e.target.value)}
              placeholder="e.g., Growth Forecast"
            />
            <p className="text-xs text-muted-foreground">
              Year will be appended (e.g., "{scenarioNamePrefix || 'Forecast'} - 2026")
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="consolidatedName">Scenario Name</Label>
            <Input
              id="consolidatedName"
              value={consolidatedName}
              onChange={e => setConsolidatedName(e.target.value)}
              placeholder="e.g., Multi-Year Consolidated"
            />
          </div>
          <div className="space-y-2">
            <Label>Consolidation Strategy</Label>
            <Select
              value={consolidationStrategy}
              onValueChange={v => setConsolidationStrategy(v as ConsolidationStrategy)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="peak">Peak Values ({formatNumber(consolidatedValues.peak.sims)} SIMs)</SelectItem>
                <SelectItem value="average">Average Values ({formatNumber(consolidatedValues.average.sims)} SIMs)</SelectItem>
                <SelectItem value="custom">Custom Values</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {consolidationStrategy === 'custom' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Total SIMs</Label>
                <Input type="number" value={customSims} onChange={e => setCustomSims(Number(e.target.value) || 0)} min={0} />
              </div>
              <div className="space-y-2">
                <Label>GB/SIM (Yearly)</Label>
                <Input type="number" step="0.1" value={customGbPerSim} onChange={e => setCustomGbPerSim(Number(e.target.value) || 0)} min={0} />
              </div>
            </div>
          )}
        </div>
      )}

      <Separator />

      {/* Enhanced Preview */}
      <div>
        <Label className="text-base font-semibold">Preview</Label>
        <p className="text-sm text-muted-foreground mb-3">
          {scenarioType === 'per_year'
            ? `Will create ${perYearNames.length} scenario${perYearNames.length !== 1 ? 's' : ''}`
            : 'Will create 1 consolidated scenario'}
        </p>

        <div className="space-y-2">
          {scenarioType === 'per_year' ? (
            sortedYearlyData
              .filter(r => r.endOfYearSims > 0)
              .map((row, idx) => {
                const gbPerSim = calculateGbPerSim(row.endOfYearSims, row.totalDataUsageGB)
                return (
                  <div key={row.id} className="flex items-center justify-between text-sm py-2 px-3 bg-muted/50 rounded-lg">
                    <span className="font-medium">{perYearNames[idx]}</span>
                    <div className="flex items-center gap-4 text-muted-foreground">
                      <span>{formatNumber(row.endOfYearSims)} SIMs</span>
                      <span>{formatNumber(gbPerSim, 2)} GB/SIM/yr</span>
                    </div>
                  </div>
                )
              })
          ) : (
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <div className="font-medium">{consolidatedName || 'Untitled'}</div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Total SIMs:</span>{' '}
                  <span className="font-medium">
                    {formatNumber(
                      consolidationStrategy === 'custom' ? customSims
                        : consolidationStrategy === 'peak' ? consolidatedValues.peak.sims
                        : consolidatedValues.average.sims
                    )}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">GB/SIM/yr:</span>{' '}
                  <span className="font-medium">
                    {formatNumber(
                      consolidationStrategy === 'custom' ? customGbPerSim
                        : consolidationStrategy === 'peak' ? consolidatedValues.peak.gbPerSim
                        : consolidatedValues.average.gbPerSim
                    , 2)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  // =====================================================================
  // RENDER — Step 3: Quote Config
  // =====================================================================

  const renderStep3 = () => (
    <div className="space-y-6">
      {/* Scenario Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Created Scenarios</CardTitle>
          <CardDescription>{createdScenarios.length} scenario(s) available for quote generation</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {createdScenarios.map(s => (
              <div key={s.id} className="flex items-center justify-between text-sm py-2 px-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{s.name}</span>
                </div>
                <div className="flex items-center gap-4 text-muted-foreground">
                  <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {formatNumber(s.total_sims)}</span>
                  <span className="flex items-center gap-1"><Database className="h-3.5 w-3.5" /> {formatNumber((s.gb_per_sim || 0) * 12, 2)} GB/SIM/yr</span>
                  <span className="flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5" /> {formatNumber(s.output_peak_throughput || 0, 2)} Gbit/s</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Quote Type */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quote Type</CardTitle>
          <CardDescription>Choose pricing model for the quote</CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={quoteType}
            onValueChange={v => setQuoteType(v as 'commitment' | 'pay_per_use')}
            className="space-y-3"
          >
            <div className="flex items-start space-x-3">
              <RadioGroupItem value="commitment" id="qt-commitment" className="mt-1" />
              <Label htmlFor="qt-commitment" className="flex-1 cursor-pointer">
                <div className="flex items-center gap-2">
                  <span className="font-medium">Commitment</span>
                  <Badge variant="outline" className="text-xs">Recommended</Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1">Fixed monthly pricing with volume and term discounts</p>
              </Label>
            </div>
            <div className="flex items-start space-x-3">
              <RadioGroupItem value="pay_per_use" id="qt-ppu" className="mt-1" />
              <Label htmlFor="qt-ppu" className="flex-1 cursor-pointer">
                <span className="font-medium">Pay-per-Use</span>
                <p className="text-sm text-muted-foreground mt-1">Variable pricing based on actual usage each month</p>
              </Label>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Commitment-specific config */}
      {quoteType === 'commitment' && createdScenarios.length > 1 && (
        <>
          <CommitmentModeSelector
            value={commitmentMode}
            onChange={setCommitmentMode}
            yearCount={scenarioYears.length || createdScenarios.length}
          />

          {commitmentMode === 'max' && (
            <>
              <CommitmentStrategyPicker
                scenarios={createdScenarios}
                strategy={commitmentStrategy}
                onStrategyChange={setCommitmentStrategy}
                specificYear={specificYear}
                onSpecificYearChange={setSpecificYear}
              />
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Contract Term</CardTitle>
                </CardHeader>
                <CardContent>
                  <Select value={String(termMonths)} onValueChange={v => setTermMonths(Number(v))}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="12">12 months</SelectItem>
                      <SelectItem value="24">24 months</SelectItem>
                      <SelectItem value="36">36 months</SelectItem>
                      <SelectItem value="48">48 months</SelectItem>
                      <SelectItem value="60">60 months</SelectItem>
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>
            </>
          )}

          {commitmentMode === 'yearly' && (
            <PerPeriodPreview scenarios={createdScenarios} />
          )}
        </>
      )}

      {/* Single scenario commitment: show term selector */}
      {quoteType === 'commitment' && createdScenarios.length === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contract Term</CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={String(termMonths)} onValueChange={v => setTermMonths(Number(v))}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="12">12 months</SelectItem>
                <SelectItem value="24">24 months</SelectItem>
                <SelectItem value="36">36 months</SelectItem>
                <SelectItem value="48">48 months</SelectItem>
                <SelectItem value="60">60 months</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}

      {/* Manual SKU Input */}
      <ManualSkuInput
        allSkus={allSkus}
        forecastMappings={forecastMappings}
        availableYears={scenarioYears}
        commitmentMode={commitmentMode}
        value={manualSkuItems}
        onChange={setManualSkuItems}
      />

      {/* SKU mapping warning */}
      {forecastMappings.length === 0 && (
        <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg text-sm">
          <AlertCircle className="h-4 w-4 mt-0.5 text-amber-600 flex-shrink-0" />
          <div>
            <p className="font-medium text-amber-800 dark:text-amber-200">No SKU Mappings Configured</p>
            <p className="text-amber-700 dark:text-amber-300 mt-1">
              No active forecast-to-SKU mappings found. The generated quote will have no line items from forecast data.
              Configure mappings in Admin &gt; Forecast Mapping.
            </p>
          </div>
        </div>
      )}
    </div>
  )

  // =====================================================================
  // RENDER — Step 4: Summary & Generate
  // =====================================================================

  const renderStep4 = () => (
    <div className="space-y-6 max-w-3xl">
      {/* Forecast Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-5 w-5 text-muted-foreground" />
            Forecast
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Name</span>
            <span className="font-medium">{forecastName}</span>
          </div>
          {selectedCustomerId && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Customer</span>
              <span className="font-medium">{customers.find(c => c.id === selectedCustomerId)?.name || '-'}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Years</span>
            <span className="font-medium">{sortedYearlyData.filter(r => r.endOfYearSims > 0).map(r => r.year).join(', ')}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Monthly Periods</span>
            <span className="font-medium">{summary.totalPeriods}</span>
          </div>
        </CardContent>
      </Card>

      {/* Scenarios */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers className="h-5 w-5 text-muted-foreground" />
            Scenarios ({createdScenarios.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {createdScenarios.map(s => (
              <div key={s.id} className="flex items-center justify-between text-sm py-1.5 px-3 bg-muted/50 rounded">
                <span className="font-medium">{s.name}</span>
                <span className="text-muted-foreground">{formatNumber(s.total_sims)} SIMs</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Quote Config */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="h-5 w-5 text-muted-foreground" />
            Quote Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Quote Type</span>
            <Badge variant="outline">{quoteType === 'commitment' ? 'Commitment' : 'Pay-per-Use'}</Badge>
          </div>
          {quoteType === 'commitment' && createdScenarios.length > 1 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Commitment Mode</span>
              <span className="font-medium">{commitmentMode === 'max' ? 'Max commitment' : 'Yearly commitment'}</span>
            </div>
          )}
          {quoteType === 'commitment' && commitmentMode === 'max' && createdScenarios.length > 1 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Sizing Strategy</span>
              <span className="font-medium capitalize">{commitmentStrategy.replace('_', ' ')}</span>
            </div>
          )}
          {quoteType === 'commitment' && (commitmentMode === 'max' || createdScenarios.length === 1) && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Contract Term</span>
              <span className="font-medium">{termMonths} months</span>
            </div>
          )}
          {manualSkuItems.filter(i => i.quantity > 0).length > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Manual SKUs</span>
              <span className="font-medium">{manualSkuItems.filter(i => i.quantity > 0).length} items</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Generate Button */}
      <Card className="border-primary/50">
        <CardContent className="py-6 text-center">
          <Sparkles className="h-8 w-8 text-primary mx-auto mb-3" />
          <h3 className="text-lg font-semibold">Ready to Generate</h3>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            This will create a draft quote and redirect you to the Quote Builder for review.
          </p>
          <Button size="lg" onClick={handleGenerate} disabled={isGenerating}>
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Generating Quote...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-5 w-5" />
                Generate Quote
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  )

  // =====================================================================
  // MAIN RENDER
  // =====================================================================

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Forecast Wizard</h1>
        <p className="text-muted-foreground">Create a quote from yearly forecast data in 4 simple steps</p>
      </div>

      {/* Stepper */}
      <WizardStepper
        steps={WIZARD_STEPS}
        currentStepIndex={currentStep}
        completedStepIndices={completedSteps}
        onStepClick={handleStepClick}
      />

      {/* Step Content */}
      {currentStep === 0 && renderStep1()}
      {currentStep === 1 && renderStep2()}
      {currentStep === 2 && renderStep3()}
      {currentStep === 3 && renderStep4()}

      {/* Bottom Navigation Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStep === 0 || isTransitioning || isGenerating}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>

          <div className="text-sm text-muted-foreground">
            Step {currentStep + 1} of {WIZARD_STEPS.length}
          </div>

          {currentStep < 3 ? (
            <Button onClick={handleNext} disabled={isTransitioning || isSaving}>
              {isTransitioning || isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {currentStep === 0 ? 'Saving...' : 'Creating...'}
                </>
              ) : (
                <>
                  {nextLabel}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          ) : (
            <Button onClick={handleGenerate} disabled={isGenerating}>
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate Quote
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Back Confirmation Dialog */}
      <AlertDialog open={showBackConfirm} onOpenChange={setShowBackConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Go back to Scenarios?</AlertDialogTitle>
            <AlertDialogDescription>
              Going back will discard the {createdScenarios.length} scenario(s) you created. You'll need to recreate them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmBackToScenarios}>
              Discard & Go Back
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
