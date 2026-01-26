import { useState, useMemo, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Calculator, Settings2, TrendingUp, Server, Users, Database, Gauge,
  Save, FolderOpen, Copy, Trash2, Plus, FileText, ChevronDown, Pencil, LineChart, CalendarRange, Layers
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
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
import { ScenarioSelectionModal, type QuoteType } from '@/components/ScenarioSelectionModal'
import {
  generatePayPerUseQuote,
  aggregateScenarioValues,
} from '@/lib/quote-generator'
import type { ForecastScenario, Customer } from '@/types/database'

// Default configuration values from the Excel file
const DEFAULT_CONFIG = {
  takeRatePcsUdr: 0.13,      // 13% - Active Users Concurrent / Total SIMs
  takeRateScsPcs: 1.0,       // 100% - Active Users Concurrent w/ Data Traffic / Active Users Concurrent
  takeRateCcsUdr: 0.9,       // 90% - Active Users Total / Total SIMs
  gbitPerGb: 8,              // Conversion factor
  daysPerMonth: 30,          // Days in month for throughput calculation
  busyHours: 8,              // Busy hours per day
  peakAverageRatio: 3,       // Peak to average throughput ratio
}

interface ForecastResults {
  udr: number                // Total SIMs (User Data Records)
  pcs: number                // Active Users Concurrent (Packet Control Sessions)
  ccs: number                // Active Users Total (Control Channel Sessions)
  scs: number                // Active Users Concurrent with Data Traffic
  dataVolumeGb: number       // Total data volume in GB
  throughputAverage: number  // Average throughput in Gbit/s
  throughputPeak: number     // Peak throughput in Gbit/s
  cos: number                // Concurrent Sessions (same as SCS for TISP-LGW)
}

function calculateForecast(
  totalSims: number,
  gbPerSimYearly: number,
  config: typeof DEFAULT_CONFIG
): ForecastResults {
  // UDR = Total SIMs
  const udr = totalSims

  // PCS = Total SIMs × Take Rate (PCS/UDR)
  const pcs = Math.ceil(totalSims * config.takeRatePcsUdr)

  // CCS = Total SIMs × Take Rate (CCS/UDR)
  const ccs = Math.ceil(totalSims * config.takeRateCcsUdr)

  // SCS = PCS × Take Rate (SCS/PCS)
  const scs = Math.ceil(pcs * config.takeRateScsPcs)

  // CoS = Concurrent Sessions (same as SCS for gateway)
  const cos = scs

  // Data Volume = Total SIMs × GB/SIM/month (convert yearly to monthly)
  const gbPerSimMonthly = gbPerSimYearly / 12
  const dataVolumeGb = totalSims * gbPerSimMonthly

  // Throughput Average = DataVolume × 8 / (30 × 8 × 3600) in Gbit/s
  const throughputAverage = (dataVolumeGb * config.gbitPerGb) /
    (config.daysPerMonth * config.busyHours * 3600)

  // Throughput Peak = Average × Peak/Average Ratio
  const throughputPeak = throughputAverage * config.peakAverageRatio

  return {
    udr,
    pcs,
    ccs,
    scs,
    dataVolumeGb,
    throughputAverage,
    throughputPeak,
    cos,
  }
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

export default function ForecastEvaluator() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  // State for inputs
  const [totalSims, setTotalSims] = useState<number>(100000)
  const [gbPerSim, setGbPerSim] = useState<number>(22.8)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [config, setConfig] = useState(DEFAULT_CONFIG)

  // State for scenario management
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null)
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [scenarioName, setScenarioName] = useState('')
  const [scenarioDescription, setScenarioDescription] = useState('')
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  // State for scenario selection modal
  const [scenarioSelectionModalOpen, setScenarioSelectionModalOpen] = useState(false)
  const [isCreatingQuote, setIsCreatingQuote] = useState(false)

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

  // Fetch forecast scenarios
  const { data: scenarios = [] } = useQuery({
    queryKey: ['forecast-scenarios', selectedCustomerId],
    queryFn: async () => {
      let query = supabase
        .from('forecast_scenarios')
        .select('*, customer:customers(*)')
        .order('updated_at', { ascending: false })

      if (selectedCustomerId) {
        query = query.or(`customer_id.eq.${selectedCustomerId},customer_id.is.null`)
      }

      const { data, error } = await query
      if (error) throw error
      return data as ForecastScenario[]
    }
  })

  // Selected scenario
  const selectedScenario = useMemo(() => {
    return scenarios.find(s => s.id === selectedScenarioId)
  }, [scenarios, selectedScenarioId])

  // Calculate results
  const results = useMemo(() => {
    return calculateForecast(totalSims, gbPerSim, config)
  }, [totalSims, gbPerSim, config])

  // Load scenario into form
  useEffect(() => {
    if (selectedScenario) {
      setTotalSims(selectedScenario.total_sims)
      setGbPerSim(selectedScenario.gb_per_sim * 12)
      setConfig({
        ...DEFAULT_CONFIG,
        takeRatePcsUdr: selectedScenario.take_rate_pcs_udr,
        takeRateCcsUdr: selectedScenario.take_rate_ccs_udr,
        takeRateScsPcs: selectedScenario.take_rate_scs_pcs,
        peakAverageRatio: selectedScenario.peak_average_ratio,
        busyHours: selectedScenario.busy_hours,
        daysPerMonth: selectedScenario.days_per_month,
      })
      setSelectedCustomerId(selectedScenario.customer_id)
      setScenarioName(selectedScenario.name)
      setScenarioDescription(selectedScenario.description || '')
      setHasUnsavedChanges(false)
    }
  }, [selectedScenario])

  // Track changes
  const handleInputChange = (setter: (v: number) => void, value: number) => {
    setter(value)
    setHasUnsavedChanges(true)
  }

  const handleConfigChange = (key: keyof typeof DEFAULT_CONFIG, value: number) => {
    setConfig(prev => ({ ...prev, [key]: value }))
    setHasUnsavedChanges(true)
  }

  const resetConfig = () => {
    setConfig(DEFAULT_CONFIG)
    setHasUnsavedChanges(true)
  }

  // Save scenario mutation
  const saveScenarioMutation = useMutation({
    mutationFn: async (isNew: boolean) => {
      const scenarioData = {
        customer_id: selectedCustomerId,
        name: scenarioName,
        description: scenarioDescription || null,
        total_sims: totalSims,
        gb_per_sim: gbPerSim / 12,
        take_rate_pcs_udr: config.takeRatePcsUdr,
        take_rate_ccs_udr: config.takeRateCcsUdr,
        take_rate_scs_pcs: config.takeRateScsPcs,
        peak_average_ratio: config.peakAverageRatio,
        busy_hours: config.busyHours,
        days_per_month: config.daysPerMonth,
        // Cache calculated outputs
        output_udr: results.udr,
        output_pcs: results.pcs,
        output_ccs: results.ccs,
        output_scs: results.scs,
        output_cos: results.cos,
        output_peak_throughput: results.throughputPeak,
        output_avg_throughput: results.throughputAverage,
        output_data_volume_gb: results.dataVolumeGb,
      }

      if (isNew || !selectedScenarioId) {
        const { data, error } = await supabase
          .from('forecast_scenarios')
          .insert(scenarioData)
          .select()
          .single()
        if (error) throw error
        return data
      } else {
        const { data, error } = await supabase
          .from('forecast_scenarios')
          .update(scenarioData)
          .eq('id', selectedScenarioId)
          .select()
          .single()
        if (error) throw error
        return data
      }
    },
    onSuccess: (data, isNew) => {
      queryClient.invalidateQueries({ queryKey: ['forecast-scenarios'] })
      setSelectedScenarioId(data.id)
      setHasUnsavedChanges(false)
      setSaveDialogOpen(false)
      setEditDialogOpen(false)
      toast({
        title: isNew ? 'Scenario created' : 'Scenario updated',
        description: `"${scenarioName}" has been saved.`,
      })
    },
    onError: (error) => {
      toast({
        title: 'Error saving scenario',
        description: error.message,
        variant: 'destructive',
      })
    }
  })

  // Duplicate scenario mutation
  const duplicateScenarioMutation = useMutation({
    mutationFn: async () => {
      if (!selectedScenario) throw new Error('No scenario selected')

      const { data, error } = await supabase
        .from('forecast_scenarios')
        .insert({
          customer_id: selectedScenario.customer_id,
          name: `${selectedScenario.name} (Copy)`,
          description: selectedScenario.description,
          total_sims: selectedScenario.total_sims,
          gb_per_sim: selectedScenario.gb_per_sim,
          take_rate_pcs_udr: selectedScenario.take_rate_pcs_udr,
          take_rate_ccs_udr: selectedScenario.take_rate_ccs_udr,
          take_rate_scs_pcs: selectedScenario.take_rate_scs_pcs,
          peak_average_ratio: selectedScenario.peak_average_ratio,
          busy_hours: selectedScenario.busy_hours,
          days_per_month: selectedScenario.days_per_month,
          output_udr: selectedScenario.output_udr,
          output_pcs: selectedScenario.output_pcs,
          output_ccs: selectedScenario.output_ccs,
          output_scs: selectedScenario.output_scs,
          output_cos: selectedScenario.output_cos,
          output_peak_throughput: selectedScenario.output_peak_throughput,
          output_avg_throughput: selectedScenario.output_avg_throughput,
          output_data_volume_gb: selectedScenario.output_data_volume_gb,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['forecast-scenarios'] })
      setSelectedScenarioId(data.id)
      setScenarioName(data.name)
      toast({
        title: 'Scenario duplicated',
        description: `Created "${data.name}".`,
      })
    },
    onError: (error) => {
      toast({
        title: 'Error duplicating scenario',
        description: error.message,
        variant: 'destructive',
      })
    }
  })

  // Delete scenario mutation
  const deleteScenarioMutation = useMutation({
    mutationFn: async () => {
      if (!selectedScenarioId) throw new Error('No scenario selected')
      const { error } = await supabase
        .from('forecast_scenarios')
        .delete()
        .eq('id', selectedScenarioId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forecast-scenarios'] })
      setSelectedScenarioId(null)
      setScenarioName('')
      setScenarioDescription('')
      setDeleteDialogOpen(false)
      toast({
        title: 'Scenario deleted',
        description: 'The scenario has been removed.',
      })
    },
    onError: (error) => {
      toast({
        title: 'Error deleting scenario',
        description: error.message,
        variant: 'destructive',
      })
    }
  })

  // Create quote from forecast
  const handleCreateQuote = async () => {
    // Save scenario first if it has unsaved changes or is new
    if (!selectedScenarioId || hasUnsavedChanges) {
      if (!scenarioName.trim()) {
        toast({
          title: 'Save scenario first',
          description: 'Please save the scenario before creating a quote.',
          variant: 'destructive',
        })
        setSaveDialogOpen(true)
        return
      }
    }

    // Navigate to quote builder with scenario data
    navigate('/quotes/new', {
      state: {
        fromForecast: true,
        scenarioId: selectedScenarioId,
        customerId: selectedCustomerId,
        forecastResults: results,
        scenarioName: scenarioName || selectedScenario?.name,
      }
    })
  }

  // New scenario handler
  const handleNewScenario = () => {
    setSelectedScenarioId(null)
    setScenarioName('')
    setScenarioDescription('')
    setTotalSims(100000)
    setGbPerSim(22.8)
    setConfig(DEFAULT_CONFIG)
    setHasUnsavedChanges(false)
  }

  // Open scenario selection modal
  const handleOpenScenarioSelection = () => {
    setScenarioSelectionModalOpen(true)
  }

  // Handle quote creation from scenario selection modal
  const handleCreateQuoteFromScenarios = useCallback(
    async (scenarioIds: string[], quoteType: QuoteType) => {
      if (scenarioIds.length === 0) return

      setIsCreatingQuote(true)

      // Get selected scenarios
      const selectedScenarios = scenarios.filter(s => scenarioIds.includes(s.id))

      if (selectedScenarios.length === 0) {
        toast({
          title: 'Error',
          description: 'No scenarios found',
          variant: 'destructive',
        })
        setIsCreatingQuote(false)
        return
      }

      const primaryScenario = selectedScenarios[0]
      const scenarioName = selectedScenarios.length === 1
        ? primaryScenario.name
        : `${selectedScenarios.length} Scenarios`
      const customerId = primaryScenario.customer_id || selectedCustomerId || undefined

      try {
        // For pay-per-use quotes, generate directly without navigating to the builder first
        // This provides a more streamlined experience for pay-per-use quotes
        if (quoteType === 'pay_per_use') {
          const result = await generatePayPerUseQuote(selectedScenarios, customerId)
          toast({
            title: 'Pay-per-Use quote created',
            description: `Created quote with ${result.itemCount} items (1-month term, no commitment).`,
          })
          navigate(`/quotes/${result.quoteId}`)
        } else {
          // For commitment quotes, still navigate to builder for term selection
          const aggregatedValues = aggregateScenarioValues(selectedScenarios, 'peak')
          const forecastResults = {
            udr: aggregatedValues.udr,
            pcs: aggregatedValues.pcs,
            ccs: aggregatedValues.ccs,
            scs: aggregatedValues.scs,
            cos: aggregatedValues.cos,
            throughputPeak: aggregatedValues.peakThroughput,
            throughputAverage: aggregatedValues.avgThroughput,
            dataVolumeGb: aggregatedValues.dataVolumeGb,
          }

          navigate('/quotes/new', {
            state: {
              fromForecast: true,
              scenarioId: primaryScenario.id,
              scenarioIds: scenarioIds,
              customerId,
              forecastResults,
              scenarioName,
              quoteType,
            },
          })
        }
      } catch (error: any) {
        toast({
          title: 'Error creating quote',
          description: error.message,
          variant: 'destructive',
        })
      } finally {
        setScenarioSelectionModalOpen(false)
        setIsCreatingQuote(false)
      }
    },
    [scenarios, navigate, selectedCustomerId, toast]
  )

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Forecast Evaluator</h1>
          <p className="text-muted-foreground">
            Calculate product license quantities from user and data metrics
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => navigate('/forecast/yearly')}
          >
            <CalendarRange className="mr-2 h-4 w-4" />
            Yearly Input
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate('/forecast/timeseries')}
          >
            <LineChart className="mr-2 h-4 w-4" />
            Time-Series Import
          </Button>
          {scenarios.length > 0 && (
            <Button
              variant="outline"
              onClick={handleOpenScenarioSelection}
            >
              <Layers className="mr-2 h-4 w-4" />
              Select Scenarios
            </Button>
          )}
          <Button
            variant="outline"
            onClick={handleCreateQuote}
          >
            <FileText className="mr-2 h-4 w-4" />
            Create Quote from Forecast
          </Button>
        </div>
      </div>

      {/* Scenario Management Bar */}
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

            {/* Scenario Selector */}
            <div className="flex items-center gap-2">
              <Label className="text-sm whitespace-nowrap">Scenario:</Label>
              <Select
                value={selectedScenarioId || 'new'}
                onValueChange={(v) => {
                  if (v === 'new') {
                    handleNewScenario()
                  } else {
                    setSelectedScenarioId(v)
                  }
                }}
              >
                <SelectTrigger className="w-[250px]">
                  <SelectValue placeholder="Select a scenario" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">
                    <span className="flex items-center gap-2">
                      <Plus className="h-4 w-4" />
                      New Scenario
                    </span>
                  </SelectItem>
                  {scenarios.length > 0 && <Separator className="my-1" />}
                  {scenarios.map((scenario) => (
                    <SelectItem key={scenario.id} value={scenario.id}>
                      <span className="flex items-center gap-2">
                        <FolderOpen className="h-4 w-4" />
                        {scenario.name}
                        {scenario.customer?.name && (
                          <span className="text-xs text-muted-foreground">
                            ({scenario.customer.name})
                          </span>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Scenario Actions */}
            <div className="flex items-center gap-2 ml-auto">
              {hasUnsavedChanges && (
                <span className="text-sm text-amber-600">Unsaved changes</span>
              )}

              {selectedScenarioId ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      Actions
                      <ChevronDown className="ml-2 h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => saveScenarioMutation.mutate(false)}>
                      <Save className="mr-2 h-4 w-4" />
                      Save Changes
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setEditDialogOpen(true)}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => duplicateScenarioMutation.mutate()}>
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
                >
                  <Save className="mr-2 h-4 w-4" />
                  Save Scenario
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Input Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Input Parameters
            </CardTitle>
            <CardDescription>
              Enter your base metrics to calculate license requirements
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="totalSims">Total SIMs / Users</Label>
                <Input
                  id="totalSims"
                  type="number"
                  value={totalSims}
                  onChange={(e) => handleInputChange(setTotalSims, Number(e.target.value) || 0)}
                  min={0}
                />
                <p className="text-xs text-muted-foreground">
                  Total number of SIM cards or users
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="gbPerSim">Data Usage (GB/SIM/year)</Label>
                <Input
                  id="gbPerSim"
                  type="number"
                  step="0.1"
                  value={gbPerSim}
                  onChange={(e) => handleInputChange(setGbPerSim, Number(e.target.value) || 0)}
                  min={0}
                />
                <p className="text-xs text-muted-foreground">
                  Yearly data usage per SIM in GB
                </p>
              </div>
            </div>

            <Separator />

            {/* Advanced Configuration */}
            <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between">
                  <span className="flex items-center gap-2">
                    <Settings2 className="h-4 w-4" />
                    Advanced Configuration
                  </span>
                  <span className="text-muted-foreground text-sm">
                    {showAdvanced ? 'Hide' : 'Show'}
                  </span>
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="takeRatePcsUdr">Take Rate PCS/UDR (%)</Label>
                    <Input
                      id="takeRatePcsUdr"
                      type="number"
                      step="0.01"
                      value={config.takeRatePcsUdr * 100}
                      onChange={(e) => handleConfigChange('takeRatePcsUdr', (Number(e.target.value) || 0) / 100)}
                      min={0}
                      max={100}
                    />
                    <p className="text-xs text-muted-foreground">
                      Concurrent users / Total SIMs
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="takeRateCcsUdr">Take Rate CCS/UDR (%)</Label>
                    <Input
                      id="takeRateCcsUdr"
                      type="number"
                      step="0.01"
                      value={config.takeRateCcsUdr * 100}
                      onChange={(e) => handleConfigChange('takeRateCcsUdr', (Number(e.target.value) || 0) / 100)}
                      min={0}
                      max={100}
                    />
                    <p className="text-xs text-muted-foreground">
                      Active users total / Total SIMs
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="takeRateScsPcs">Take Rate SCS/PCS (%)</Label>
                    <Input
                      id="takeRateScsPcs"
                      type="number"
                      step="0.01"
                      value={config.takeRateScsPcs * 100}
                      onChange={(e) => handleConfigChange('takeRateScsPcs', (Number(e.target.value) || 0) / 100)}
                      min={0}
                      max={100}
                    />
                    <p className="text-xs text-muted-foreground">
                      Users with data traffic / Concurrent users
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="peakAverageRatio">Peak/Average Ratio</Label>
                    <Input
                      id="peakAverageRatio"
                      type="number"
                      step="0.1"
                      value={config.peakAverageRatio}
                      onChange={(e) => handleConfigChange('peakAverageRatio', Number(e.target.value) || 1)}
                      min={1}
                    />
                    <p className="text-xs text-muted-foreground">
                      Peak throughput multiplier
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="busyHours">Busy Hours/Day</Label>
                    <Input
                      id="busyHours"
                      type="number"
                      value={config.busyHours}
                      onChange={(e) => handleConfigChange('busyHours', Number(e.target.value) || 1)}
                      min={1}
                      max={24}
                    />
                    <p className="text-xs text-muted-foreground">
                      Peak traffic hours per day
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="daysPerMonth">Days/Month</Label>
                    <Input
                      id="daysPerMonth"
                      type="number"
                      value={config.daysPerMonth}
                      onChange={(e) => handleConfigChange('daysPerMonth', Number(e.target.value) || 1)}
                      min={1}
                      max={31}
                    />
                    <p className="text-xs text-muted-foreground">
                      Days for monthly calculation
                    </p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={resetConfig}>
                  Reset to Defaults
                </Button>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>

        {/* Results Section */}
        <div className="space-y-6">
          {/* TISP-AAA License Requirements */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                TISP-AAA License Requirements
              </CardTitle>
              <CardDescription>
                Authentication, Authorization, and Accounting licenses
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-lg border p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Database className="h-4 w-4" />
                    UDR
                  </div>
                  <div className="mt-2 text-2xl font-bold">
                    {formatNumber(results.udr)}
                  </div>
                  <p className="text-xs text-muted-foreground">User Data Records</p>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    PCS
                  </div>
                  <div className="mt-2 text-2xl font-bold">
                    {formatNumber(results.pcs)}
                  </div>
                  <p className="text-xs text-muted-foreground">Concurrent Users</p>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    CCS
                  </div>
                  <div className="mt-2 text-2xl font-bold">
                    {formatNumber(results.ccs)}
                  </div>
                  <p className="text-xs text-muted-foreground">Active Users Total</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* TISP-LGW License Requirements */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                TISP-LGW License Requirements
              </CardTitle>
              <CardDescription>
                Gateway throughput and session licenses
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Gauge className="h-4 w-4" />
                    Peak Throughput
                  </div>
                  <div className="mt-2 text-2xl font-bold">
                    {formatNumber(results.throughputPeak, 3)} <span className="text-sm font-normal">Gbit/s</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Avg: {formatNumber(results.throughputAverage, 3)} Gbit/s
                  </p>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    CoS
                  </div>
                  <div className="mt-2 text-2xl font-bold">
                    {formatNumber(results.cos)}
                  </div>
                  <p className="text-xs text-muted-foreground">Concurrent Sessions</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Data Volume Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Data Volume Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Monthly Data Volume</span>
                  <span className="font-medium">{formatNumber(results.dataVolumeGb, 0)} GB</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Data per SIM</span>
                  <span className="font-medium">{formatNumber(gbPerSim, 1)} GB/year</span>
                </div>
                <Separator className="my-2" />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">SCS (Data Sessions)</span>
                  <span className="font-medium">{formatNumber(results.scs)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Formula Reference */}
      <Card>
        <CardHeader>
          <CardTitle>Calculation Formulas</CardTitle>
          <CardDescription>Reference for the license quantity calculations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 text-sm md:grid-cols-2">
            <div className="space-y-2">
              <h4 className="font-medium">TISP-AAA</h4>
              <ul className="space-y-1 text-muted-foreground">
                <li><code className="text-xs bg-muted px-1 py-0.5 rounded">UDR</code> = Total SIMs</li>
                <li><code className="text-xs bg-muted px-1 py-0.5 rounded">PCS</code> = Total SIMs × Take Rate (PCS/UDR)</li>
                <li><code className="text-xs bg-muted px-1 py-0.5 rounded">CCS</code> = Total SIMs × Take Rate (CCS/UDR)</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium">TISP-LGW</h4>
              <ul className="space-y-1 text-muted-foreground">
                <li><code className="text-xs bg-muted px-1 py-0.5 rounded">CoS</code> = PCS × Take Rate (SCS/PCS)</li>
                <li><code className="text-xs bg-muted px-1 py-0.5 rounded">Avg Throughput</code> = (SIMs × GB/SIM/yr / 12 × 8) / (Days × Hours × 3600)</li>
                <li><code className="text-xs bg-muted px-1 py-0.5 rounded">Peak Throughput</code> = Avg × Peak/Avg Ratio</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save Scenario Dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Scenario</DialogTitle>
            <DialogDescription>
              Save this forecast configuration for future use
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="scenarioName">Scenario Name</Label>
              <Input
                id="scenarioName"
                value={scenarioName}
                onChange={(e) => setScenarioName(e.target.value)}
                placeholder="e.g., Conservative Growth 2025"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="scenarioDescription">Description (optional)</Label>
              <Textarea
                id="scenarioDescription"
                value={scenarioDescription}
                onChange={(e) => setScenarioDescription(e.target.value)}
                placeholder="Brief description of this scenario..."
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
              onClick={() => saveScenarioMutation.mutate(true)}
              disabled={!scenarioName.trim() || saveScenarioMutation.isPending}
            >
              {saveScenarioMutation.isPending ? 'Saving...' : 'Save Scenario'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Scenario Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Scenario</DialogTitle>
            <DialogDescription>
              Update scenario name and description
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="editScenarioName">Scenario Name</Label>
              <Input
                id="editScenarioName"
                value={scenarioName}
                onChange={(e) => setScenarioName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editScenarioDescription">Description</Label>
              <Textarea
                id="editScenarioDescription"
                value={scenarioDescription}
                onChange={(e) => setScenarioDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => saveScenarioMutation.mutate(false)}
              disabled={!scenarioName.trim() || saveScenarioMutation.isPending}
            >
              {saveScenarioMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Scenario?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedScenario?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteScenarioMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteScenarioMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Scenario Selection Modal for Quote Creation */}
      <ScenarioSelectionModal
        isOpen={scenarioSelectionModalOpen}
        onClose={() => {
          setScenarioSelectionModalOpen(false)
          setIsCreatingQuote(false)
        }}
        scenarios={scenarios}
        onCreateQuote={handleCreateQuoteFromScenarios}
        preSelectedIds={selectedScenarioId ? [selectedScenarioId] : []}
        isCreating={isCreatingQuote}
        title="Select Scenarios for Quote"
        description="Choose one or more scenarios to create a quote"
      />
    </div>
  )
}
