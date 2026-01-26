import { useState, useMemo, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Save, FileText, FolderOpen, Trash2, Plus, ChevronDown, Pencil, Copy,
  Calendar, TrendingUp, BarChart3, ArrowLeft, Layers, ChevronRight, CheckCircle2
} from 'lucide-react'
import { format } from 'date-fns'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { YearlyForecastInput, type YearlyForecastRow } from '@/components/YearlyForecastInput'
import { CreateScenarioModal, type CreateScenarioOptions } from '@/components/CreateScenarioModal'
import { ScenarioSelectionModal, type QuoteType } from '@/components/ScenarioSelectionModal'
import {
  interpolateYearlyToMonthly,
  calculatePeriodForecast,
  DEFAULT_FORECAST_CONFIG,
  type ForecastConfig,
} from '@/lib/timeseries-pricing'
import { handleCreateScenarios, getScenariosByIds } from '@/lib/scenario-generator'
import type { Customer, TimeseriesForecast, ForecastScenario } from '@/types/database'

/**
 * Workflow steps for the forecast-to-quote flow
 */
type WorkflowStep = 'input' | 'save' | 'scenarios' | 'quote'

interface WorkflowState {
  currentStep: WorkflowStep
  hasData: boolean
  isSaved: boolean
  hasScenarios: boolean
  isCreatingQuote: boolean
}

/**
 * WorkflowIndicator - Shows the user's progress through the forecast-to-quote flow
 */
function WorkflowIndicator({ state }: { state: WorkflowState }) {
  const steps: { key: WorkflowStep; label: string; description: string }[] = [
    { key: 'input', label: '1. Enter Data', description: 'Add yearly forecast' },
    { key: 'save', label: '2. Save', description: 'Persist forecast' },
    { key: 'scenarios', label: '3. Create Scenarios', description: 'Generate scenarios' },
    { key: 'quote', label: '4. Generate Quote', description: 'Create pricing quote' },
  ]

  const getStepStatus = (step: WorkflowStep): 'completed' | 'current' | 'upcoming' => {
    if (step === 'input' && state.hasData) return 'completed'
    if (step === 'save' && state.isSaved) return 'completed'
    if (step === 'scenarios' && state.hasScenarios) return 'completed'
    if (step === 'quote' && state.isCreatingQuote) return 'current'
    if (step === state.currentStep) return 'current'
    return 'upcoming'
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 rounded-lg">
      {steps.map((step, index) => {
        const status = getStepStatus(step.key)
        return (
          <div key={step.key} className="flex items-center">
            {index > 0 && (
              <ChevronRight className="h-4 w-4 text-muted-foreground mx-2" />
            )}
            <div className="flex items-center gap-2">
              <div
                className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${
                  status === 'completed'
                    ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                    : status === 'current'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {status === 'completed' ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  index + 1
                )}
              </div>
              <div className="hidden sm:block">
                <span
                  className={`text-sm font-medium ${
                    status === 'current' ? 'text-primary' : 'text-muted-foreground'
                  }`}
                >
                  {step.label}
                </span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function formatNumber(num: number, decimals: number = 0): string {
  if (decimals === 0) {
    return num.toLocaleString()
  }
  return num.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })
}

/**
 * Generate a unique ID for a new row
 */
function generateRowId(): string {
  return `row-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Convert YearlyForecastRow array to the format stored in the config field
 */
function yearlyRowsToConfig(rows: YearlyForecastRow[]): object {
  return {
    yearlyData: rows.map(r => ({
      year: r.year,
      endOfYearSims: r.endOfYearSims,
      totalDataUsageGB: r.totalDataUsageGB,
    }))
  }
}

/**
 * Extract YearlyForecastRow array from the config field
 */
function configToYearlyRows(config: unknown): YearlyForecastRow[] {
  if (!config || typeof config !== 'object') return []
  const c = config as { yearlyData?: Array<{ year: number; endOfYearSims: number; totalDataUsageGB: number }> }
  if (!c.yearlyData || !Array.isArray(c.yearlyData)) return []

  return c.yearlyData.map(d => ({
    id: generateRowId(),
    year: d.year,
    endOfYearSims: d.endOfYearSims,
    totalDataUsageGB: d.totalDataUsageGB,
  }))
}

// The config field from DB can be any JSON, so we use a more permissive type here
type TimeseriesForecastWithConfig = Omit<TimeseriesForecast, 'config'> & {
  config?: unknown
}

export default function YearlyForecastPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  // State for forecast data
  const [yearlyData, setYearlyData] = useState<YearlyForecastRow[]>([])

  // State for forecast management
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [selectedForecastId, setSelectedForecastId] = useState<string | null>(null)
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [forecastName, setForecastName] = useState('')
  const [forecastDescription, setForecastDescription] = useState('')
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [config] = useState<ForecastConfig>(DEFAULT_FORECAST_CONFIG)
  const [createScenariosModalOpen, setCreateScenariosModalOpen] = useState(false)

  // State for scenario selection and quote creation
  const [scenarioSelectionModalOpen, setScenarioSelectionModalOpen] = useState(false)
  const [createdScenarios, setCreatedScenarios] = useState<ForecastScenario[]>([])
  const [preSelectedScenarioIds, setPreSelectedScenarioIds] = useState<string[]>([])
  const [isCreatingQuote, setIsCreatingQuote] = useState(false)

  // Workflow state for progress indicator
  const workflowState: WorkflowState = useMemo(() => ({
    currentStep: !yearlyData.length
      ? 'input'
      : !selectedForecastId
      ? 'save'
      : createdScenarios.length === 0
      ? 'scenarios'
      : 'quote',
    hasData: yearlyData.length > 0,
    isSaved: !!selectedForecastId,
    hasScenarios: createdScenarios.length > 0,
    isCreatingQuote,
  }), [yearlyData.length, selectedForecastId, createdScenarios.length, isCreatingQuote])

  // Check for forecast ID in URL params
  useEffect(() => {
    const forecastId = searchParams.get('id')
    if (forecastId) {
      setSelectedForecastId(forecastId)
    }
  }, [searchParams])

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

  // Fetch yearly forecasts only
  const { data: forecasts = [], isLoading: isLoadingForecasts } = useQuery({
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
    }
  })

  // Selected forecast
  const selectedForecast = useMemo(() => {
    return forecasts.find(f => f.id === selectedForecastId)
  }, [forecasts, selectedForecastId])

  // Load forecast into form when selected
  useEffect(() => {
    if (selectedForecast) {
      const rows = configToYearlyRows(selectedForecast.config)
      setYearlyData(rows)
      setSelectedCustomerId(selectedForecast.customer_id)
      setForecastName(selectedForecast.name)
      setForecastDescription(selectedForecast.description || '')
      setHasUnsavedChanges(false)
    }
  }, [selectedForecast])

  // Calculate interpolated monthly data
  const monthlyData = useMemo(() => {
    if (yearlyData.length === 0) return []

    const yearlyDataPoints = yearlyData
      .filter(r => r.endOfYearSims > 0)
      .map(r => ({
        year: r.year,
        totalSims: r.endOfYearSims,
        totalDataUsageGb: r.totalDataUsageGB,
      }))

    if (yearlyDataPoints.length === 0) return []

    return interpolateYearlyToMonthly(yearlyDataPoints)
  }, [yearlyData])

  // Calculate summary statistics
  const summary = useMemo(() => {
    if (monthlyData.length === 0) {
      return {
        totalPeriods: 0,
        startDate: null,
        endDate: null,
        minSims: 0,
        maxSims: 0,
        avgSims: 0,
        growth: 0,
      }
    }

    const sims = monthlyData.map(m => m.totalSims)
    const firstSims = sims[0]
    const lastSims = sims[sims.length - 1]
    const growth = firstSims > 0 ? ((lastSims - firstSims) / firstSims) * 100 : 0

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

  // Handle data change
  const handleDataChange = useCallback((newData: YearlyForecastRow[]) => {
    setYearlyData(newData)
    setHasUnsavedChanges(true)
  }, [])

  // Save forecast mutation
  const saveForecastMutation = useMutation({
    mutationFn: async (isNew: boolean) => {
      if (yearlyData.length === 0) {
        throw new Error('No forecast data to save')
      }

      if (!forecastName.trim()) {
        throw new Error('Please enter a forecast name')
      }

      // Calculate monthly data points for storage
      const yearlyDataPoints = yearlyData
        .filter(r => r.endOfYearSims > 0)
        .map(r => ({
          year: r.year,
          totalSims: r.endOfYearSims,
          totalDataUsageGb: r.totalDataUsageGB,
        }))

      if (yearlyDataPoints.length === 0) {
        throw new Error('At least one year must have valid SIM data')
      }

      const interpolated = interpolateYearlyToMonthly(yearlyDataPoints)

      if (interpolated.length === 0) {
        throw new Error('Failed to interpolate monthly data')
      }

      // Calculate start/end dates
      const startDate = interpolated[0].date
      const endDate = interpolated[interpolated.length - 1].date

      // Prepare forecast data
      const forecastData = {
        customer_id: selectedCustomerId,
        name: forecastName.trim(),
        description: forecastDescription.trim() || null,
        granularity: 'yearly' as const,
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        total_periods: interpolated.length,
        take_rate_pcs_udr: config.takeRatePcsUdr,
        take_rate_ccs_udr: config.takeRateCcsUdr,
        take_rate_scs_pcs: config.takeRateScsPcs,
        peak_average_ratio: config.peakAverageRatio,
        busy_hours: config.busyHours,
        days_per_month: config.daysPerMonth,
        original_filename: null,
        // Store original yearly data in config for later retrieval
        config: yearlyRowsToConfig(yearlyData),
      }

      let forecastId: string

      if (isNew || !selectedForecastId) {
        // Create new forecast
        const { data: forecast, error: forecastError } = await supabase
          .from('timeseries_forecasts')
          .insert(forecastData)
          .select()
          .single()

        if (forecastError) throw forecastError
        forecastId = forecast.id
      } else {
        // Update existing forecast
        const { error: forecastError } = await supabase
          .from('timeseries_forecasts')
          .update(forecastData)
          .eq('id', selectedForecastId)

        if (forecastError) throw forecastError
        forecastId = selectedForecastId

        // Delete existing data points
        const { error: deleteError } = await supabase
          .from('timeseries_forecast_data')
          .delete()
          .eq('forecast_id', forecastId)

        if (deleteError) throw deleteError
      }

      // Insert interpolated monthly data points
      const dataPoints = interpolated.map((m, idx) => {
        // Calculate forecast outputs using the pricing engine
        const gbPerSimMonthly = m.gbPerSim / 12 // Convert yearly GB/SIM to monthly
        const forecast = calculatePeriodForecast(m.totalSims, gbPerSimMonthly, config)

        return {
          forecast_id: forecastId,
          period_index: idx + 1,
          period_date: m.date.toISOString().split('T')[0],
          total_sims: m.totalSims,
          gb_per_sim: gbPerSimMonthly,
          output_udr: forecast.udr,
          output_pcs: forecast.pcs,
          output_ccs: forecast.ccs,
          output_scs: forecast.scs,
          output_cos: forecast.cos,
          output_peak_throughput: forecast.peakThroughput,
          output_avg_throughput: forecast.avgThroughput,
          output_data_volume_gb: forecast.dataVolumeGb,
        }
      })

      const { error: dataError } = await supabase
        .from('timeseries_forecast_data')
        .insert(dataPoints)

      if (dataError) throw dataError

      return { id: forecastId, name: forecastName }
    },
    onSuccess: (data, isNew) => {
      queryClient.invalidateQueries({ queryKey: ['timeseries-forecasts'] })
      setSelectedForecastId(data.id)
      setHasUnsavedChanges(false)
      setSaveDialogOpen(false)
      setEditDialogOpen(false)
      toast({
        title: isNew ? 'Forecast created' : 'Forecast updated',
        description: `"${data.name}" has been saved.`,
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

  // Duplicate forecast mutation
  const duplicateForecastMutation = useMutation({
    mutationFn: async () => {
      if (!selectedForecast) throw new Error('No forecast selected')

      const rows = configToYearlyRows(selectedForecast.config)
      if (rows.length === 0) throw new Error('No yearly data in forecast')

      // Set up data for new forecast
      setYearlyData(rows)
      setForecastName(`${selectedForecast.name} (Copy)`)
      setForecastDescription(selectedForecast.description || '')
      setSelectedForecastId(null)
      setHasUnsavedChanges(true)

      return { name: `${selectedForecast.name} (Copy)` }
    },
    onSuccess: (data) => {
      toast({
        title: 'Forecast duplicated',
        description: `Created "${data.name}". Save to persist changes.`,
      })
    },
    onError: (error) => {
      toast({
        title: 'Error duplicating forecast',
        description: error.message,
        variant: 'destructive',
      })
    }
  })

  // Delete forecast mutation
  const deleteForecastMutation = useMutation({
    mutationFn: async () => {
      if (!selectedForecastId) throw new Error('No forecast selected')

      // Data points are deleted via cascade
      const { error } = await supabase
        .from('timeseries_forecasts')
        .delete()
        .eq('id', selectedForecastId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeseries-forecasts'] })
      handleNewForecast()
      setDeleteDialogOpen(false)
      toast({
        title: 'Forecast deleted',
        description: 'The forecast has been removed.',
      })
    },
    onError: (error) => {
      toast({
        title: 'Error deleting forecast',
        description: error.message,
        variant: 'destructive',
      })
    }
  })

  // New forecast handler
  const handleNewForecast = () => {
    setSelectedForecastId(null)
    setForecastName('')
    setForecastDescription('')
    setYearlyData([])
    setHasUnsavedChanges(false)
  }

  // Navigate to time-series view
  const handleViewTimeseries = () => {
    if (selectedForecastId) {
      navigate(`/forecast/timeseries?forecastId=${selectedForecastId}`)
    }
  }

  // Handle save from YearlyForecastInput component
  const handleSaveFromComponent = useCallback(() => {
    if (selectedForecastId) {
      saveForecastMutation.mutate(false)
    } else {
      setSaveDialogOpen(true)
    }
  }, [selectedForecastId, saveForecastMutation])

  // Handle creating scenarios from yearly data
  const handleCreateScenariosFromModal = useCallback(
    async (options: CreateScenarioOptions): Promise<string[]> => {
      // Use the handleCreateScenarios utility
      const scenarioIds = await handleCreateScenarios(
        options,
        yearlyData,
        selectedForecastId || undefined
      )
      return scenarioIds
    },
    [yearlyData, selectedForecastId]
  )

  // Handle scenarios created successfully
  const handleScenariosCreated = useCallback(
    async (scenarioIds: string[]) => {
      queryClient.invalidateQueries({ queryKey: ['forecast-scenarios'] })

      // Fetch the newly created scenarios to show in selection modal
      try {
        const scenarios = await getScenariosByIds(scenarioIds)
        setCreatedScenarios(scenarios)
        setPreSelectedScenarioIds(scenarioIds)

        // Close the create modal and show success with option to create quote
        setCreateScenariosModalOpen(false)

        toast({
          title: 'Scenarios created',
          description: `Successfully created ${scenarioIds.length} scenario${scenarioIds.length !== 1 ? 's' : ''}. You can now create a quote.`,
          action: (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setScenarioSelectionModalOpen(true)}
            >
              Create Quote
            </Button>
          ),
        })
      } catch (error) {
        toast({
          title: 'Scenarios created',
          description: `Successfully created ${scenarioIds.length} scenario${scenarioIds.length !== 1 ? 's' : ''}.`,
        })
      }
    },
    [queryClient, toast]
  )

  // Handle quote creation from selected scenarios
  const handleCreateQuoteFromScenarios = useCallback(
    async (scenarioIds: string[], quoteType: QuoteType) => {
      if (scenarioIds.length === 0) return

      setIsCreatingQuote(true)

      try {
        // Get the selected scenarios
        const selectedScenarios = createdScenarios.filter(s => scenarioIds.includes(s.id))

        if (selectedScenarios.length === 0) {
          // Fetch scenarios if not in local state
          const scenarios = await getScenariosByIds(scenarioIds)
          if (scenarios.length === 0) {
            throw new Error('No scenarios found')
          }

          // Navigate to quote builder with scenario data
          navigateToQuoteBuilder(scenarios, quoteType)
        } else {
          navigateToQuoteBuilder(selectedScenarios, quoteType)
        }
      } catch (error) {
        toast({
          title: 'Error',
          description: error instanceof Error ? error.message : 'Failed to create quote',
          variant: 'destructive',
        })
        setIsCreatingQuote(false)
      }
    },
    [createdScenarios, toast]
  )

  // Handle create quote directly from CreateScenarioModal success state
  const handleCreateQuoteFromModal = useCallback(
    async (scenarioIds: string[]) => {
      // Fetch the scenarios and open the selection modal with them pre-selected
      try {
        const scenarios = await getScenariosByIds(scenarioIds)
        setCreatedScenarios(scenarios)
        setPreSelectedScenarioIds(scenarioIds)
        setScenarioSelectionModalOpen(true)
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to load scenarios',
          variant: 'destructive',
        })
      }
    },
    [toast]
  )

  // Navigate to QuoteBuilder with scenario data
  const navigateToQuoteBuilder = useCallback(
    (scenarios: ForecastScenario[], quoteType: QuoteType) => {
      // Use the first scenario for now (or could aggregate for multi-select)
      const primaryScenario = scenarios[0]

      // Calculate aggregated forecast results if multiple scenarios
      let forecastResults
      if (scenarios.length === 1) {
        forecastResults = {
          udr: primaryScenario.output_udr || primaryScenario.total_sims,
          pcs: primaryScenario.output_pcs || 0,
          ccs: primaryScenario.output_ccs || 0,
          scs: primaryScenario.output_scs || 0,
          cos: primaryScenario.output_cos || 0,
          throughputPeak: primaryScenario.output_peak_throughput || 0,
          throughputAverage: primaryScenario.output_avg_throughput || 0,
          dataVolumeGb: primaryScenario.output_data_volume_gb || 0,
        }
      } else {
        // For multiple scenarios, use the maximum values (peak sizing)
        forecastResults = {
          udr: Math.max(...scenarios.map(s => s.output_udr || s.total_sims)),
          pcs: Math.max(...scenarios.map(s => s.output_pcs || 0)),
          ccs: Math.max(...scenarios.map(s => s.output_ccs || 0)),
          scs: Math.max(...scenarios.map(s => s.output_scs || 0)),
          cos: Math.max(...scenarios.map(s => s.output_cos || 0)),
          throughputPeak: Math.max(...scenarios.map(s => s.output_peak_throughput || 0)),
          throughputAverage: Math.max(...scenarios.map(s => s.output_avg_throughput || 0)),
          dataVolumeGb: Math.max(...scenarios.map(s => s.output_data_volume_gb || 0)),
        }
      }

      // Navigate to quote builder
      navigate('/quotes/new', {
        state: {
          fromForecast: true,
          scenarioId: primaryScenario.id,
          scenarioIds: scenarios.map(s => s.id),
          customerId: primaryScenario.customer_id || selectedCustomerId,
          forecastResults,
          scenarioName: scenarios.length === 1
            ? primaryScenario.name
            : `${scenarios.length} Scenarios`,
          quoteType,
        },
      })

      setScenarioSelectionModalOpen(false)
      setIsCreatingQuote(false)
    },
    [navigate, selectedCustomerId]
  )

  return (
    <div className="space-y-6">
      {/* Workflow Progress Indicator */}
      <WorkflowIndicator state={workflowState} />

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/forecast')}
              className="h-8 w-8 p-0"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-3xl font-bold tracking-tight">Yearly Forecast Input</h1>
          </div>
          <p className="text-muted-foreground ml-10">
            Enter yearly forecasts that will be interpolated to monthly data
          </p>
        </div>
        <div className="flex items-center gap-2">
          {yearlyData.length > 0 && (
            <Button
              variant="outline"
              onClick={() => setCreateScenariosModalOpen(true)}
            >
              <Layers className="mr-2 h-4 w-4" />
              Create Scenarios
            </Button>
          )}
          {selectedForecastId && monthlyData.length > 0 && (
            <Button
              variant="outline"
              onClick={handleViewTimeseries}
            >
              <FileText className="mr-2 h-4 w-4" />
              View Monthly Data
            </Button>
          )}
        </div>
      </div>

      {/* Forecast Management Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            {/* Customer Filter */}
            <div className="flex items-center gap-2">
              <Label className="text-sm whitespace-nowrap">Customer:</Label>
              <Select
                value={selectedCustomerId || 'all'}
                onValueChange={(v) => setSelectedCustomerId(v === 'all' ? null : v)}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="All Customers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Customers</SelectItem>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name}{customer.company ? ` (${customer.company})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator orientation="vertical" className="h-8" />

            {/* Forecast Selector */}
            <div className="flex items-center gap-2">
              <Label className="text-sm whitespace-nowrap">Forecast:</Label>
              <Select
                value={selectedForecastId || 'new'}
                onValueChange={(v) => {
                  if (v === 'new') {
                    handleNewForecast()
                  } else {
                    setSelectedForecastId(v)
                  }
                }}
                disabled={isLoadingForecasts}
              >
                <SelectTrigger className="w-[250px]">
                  <SelectValue placeholder="Select a forecast" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">
                    <span className="flex items-center gap-2">
                      <Plus className="h-4 w-4" />
                      New Forecast
                    </span>
                  </SelectItem>
                  {forecasts.length > 0 && <Separator className="my-1" />}
                  {forecasts.map((forecast) => (
                    <SelectItem key={forecast.id} value={forecast.id}>
                      <span className="flex items-center gap-2">
                        <FolderOpen className="h-4 w-4" />
                        {forecast.name}
                        {forecast.customer?.name && (
                          <span className="text-xs text-muted-foreground">
                            ({forecast.customer.name})
                          </span>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Forecast Actions */}
            <div className="flex items-center gap-2 ml-auto">
              {hasUnsavedChanges && (
                <span className="text-sm text-amber-600">Unsaved changes</span>
              )}

              {selectedForecastId ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      Actions
                      <ChevronDown className="ml-2 h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => saveForecastMutation.mutate(false)}>
                      <Save className="mr-2 h-4 w-4" />
                      Save Changes
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setEditDialogOpen(true)}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => duplicateForecastMutation.mutate()}>
                      <Copy className="mr-2 h-4 w-4" />
                      Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setDeleteDialogOpen(true)}
                      className="text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button
                  size="sm"
                  onClick={() => setSaveDialogOpen(true)}
                  disabled={yearlyData.length === 0}
                >
                  <Save className="mr-2 h-4 w-4" />
                  Save Forecast
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column - Yearly Input */}
        <div className="lg:col-span-2">
          <YearlyForecastInput
            data={yearlyData}
            onChange={handleDataChange}
            onSave={handleSaveFromComponent}
            isLoading={isLoadingForecasts}
            isSaving={saveForecastMutation.isPending}
            title="Yearly Forecast Data"
            description="Enter end-of-year SIM counts and total data usage. Monthly values will be interpolated."
          />
        </div>

        {/* Right Column - Summary */}
        <div className="space-y-6">
          {/* Summary Card */}
          {monthlyData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Interpolated Summary</CardTitle>
                <CardDescription>
                  Monthly data derived from yearly inputs
                </CardDescription>
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
                    <p className="text-xs text-muted-foreground">
                      Over {yearlyData.length > 1 ? yearlyData.length - 1 : yearlyData.length} year{yearlyData.length !== 1 ? 's' : ''}
                    </p>
                  </div>

                  <div className="rounded-lg border p-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <BarChart3 className="h-4 w-4" />
                      <span>SIM Range</span>
                    </div>
                    <p className="mt-1 text-xl font-bold">{formatNumber(summary.maxSims)}</p>
                    <p className="text-xs text-muted-foreground">
                      Min: {formatNumber(summary.minSims)}
                    </p>
                  </div>

                  <div className="rounded-lg border p-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <BarChart3 className="h-4 w-4" />
                      <span>Avg SIMs</span>
                    </div>
                    <p className="mt-1 text-xl font-bold">{formatNumber(summary.avgSims)}</p>
                    <p className="text-xs text-muted-foreground">
                      Per month
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Monthly Preview */}
          {monthlyData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Monthly Preview</CardTitle>
                <CardDescription>
                  First 6 months of interpolated data
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {monthlyData.slice(0, 6).map((m, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between text-sm py-1 border-b last:border-0"
                    >
                      <span className="text-muted-foreground">
                        {format(m.date, 'MMM yyyy')}
                      </span>
                      <span className="font-medium">
                        {formatNumber(m.totalSims)} SIMs
                      </span>
                    </div>
                  ))}
                  {monthlyData.length > 6 && (
                    <p className="text-xs text-muted-foreground text-center pt-2">
                      +{monthlyData.length - 6} more months
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Help Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">How It Works</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                1. Enter <strong>end-of-year</strong> SIM counts and total data usage for each year.
              </p>
              <p>
                2. Monthly values are <strong>linearly interpolated</strong> between years.
              </p>
              <p>
                3. GB/SIM is calculated automatically from your inputs.
              </p>
              <p>
                4. Saved forecasts can be used for pricing and quote generation.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Save Forecast Dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Forecast</DialogTitle>
            <DialogDescription>
              Save this yearly forecast for future use
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="forecastName">Forecast Name</Label>
              <Input
                id="forecastName"
                value={forecastName}
                onChange={(e) => setForecastName(e.target.value)}
                placeholder="e.g., Customer Growth 2026-2028"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="forecastDescription">Description (optional)</Label>
              <Textarea
                id="forecastDescription"
                value={forecastDescription}
                onChange={(e) => setForecastDescription(e.target.value)}
                placeholder="Brief description of this forecast..."
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Customer (optional)</Label>
              <Select
                value={selectedCustomerId || 'none'}
                onValueChange={(v) => setSelectedCustomerId(v === 'none' ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a customer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No customer (template)</SelectItem>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name}{customer.company ? ` (${customer.company})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Link to a customer or leave empty to create a reusable template
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => saveForecastMutation.mutate(true)}
              disabled={!forecastName.trim() || saveForecastMutation.isPending}
            >
              {saveForecastMutation.isPending ? 'Saving...' : 'Save Forecast'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Forecast Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Forecast</DialogTitle>
            <DialogDescription>
              Update forecast name and description
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="editForecastName">Forecast Name</Label>
              <Input
                id="editForecastName"
                value={forecastName}
                onChange={(e) => setForecastName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editForecastDescription">Description</Label>
              <Textarea
                id="editForecastDescription"
                value={forecastDescription}
                onChange={(e) => setForecastDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => saveForecastMutation.mutate(false)}
              disabled={!forecastName.trim() || saveForecastMutation.isPending}
            >
              {saveForecastMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Forecast?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedForecast?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteForecastMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteForecastMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create Scenarios Modal */}
      <CreateScenarioModal
        isOpen={createScenariosModalOpen}
        onClose={() => setCreateScenariosModalOpen(false)}
        forecastId={selectedForecastId || ''}
        forecastName={forecastName || 'Untitled Forecast'}
        yearlyData={yearlyData}
        customerId={selectedCustomerId || undefined}
        onCreateScenarios={handleCreateScenariosFromModal}
        onScenariosCreated={handleScenariosCreated}
        onCreateQuote={handleCreateQuoteFromModal}
      />

      {/* Scenario Selection Modal for Quote Creation */}
      <ScenarioSelectionModal
        isOpen={scenarioSelectionModalOpen}
        onClose={() => {
          setScenarioSelectionModalOpen(false)
          setIsCreatingQuote(false)
        }}
        scenarios={createdScenarios}
        onCreateQuote={handleCreateQuoteFromScenarios}
        preSelectedIds={preSelectedScenarioIds}
        isCreating={isCreatingQuote}
        title="Create Quote from Scenarios"
        description="Select scenarios to include in your quote"
      />
    </div>
  )
}
