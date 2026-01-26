import { useState, useMemo, useEffect } from 'react'
import { Check, Layers, SplitSquareVertical, AlertCircle, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import type { YearlyForecastRow } from '@/components/YearlyForecastInput'

/**
 * Scenario creation type
 */
export type ScenarioType = 'per_year' | 'consolidated'

/**
 * Consolidation strategy for combining multiple years
 */
export type ConsolidationStrategy = 'peak' | 'average' | 'custom'

/**
 * Configuration for scenario creation
 */
export interface CreateScenarioOptions {
  type: ScenarioType
  consolidationStrategy?: ConsolidationStrategy
  customValues?: {
    totalSims: number
    gbPerSim: number
  }
  scenarioNames: string[]
  forecastId: string
  customerId?: string
}

/**
 * Props for the CreateScenarioModal component
 */
export interface CreateScenarioModalProps {
  isOpen: boolean
  onClose: () => void
  forecastId: string
  forecastName: string
  yearlyData: YearlyForecastRow[]
  customerId?: string
  onCreateScenarios?: (options: CreateScenarioOptions) => Promise<string[]>
  onScenariosCreated?: (scenarioIds: string[]) => void
  /** Optional callback to create a quote from the created scenarios */
  onCreateQuote?: (scenarioIds: string[]) => void
}

/**
 * Format number with locale-specific separators
 */
function formatNumber(num: number, decimals: number = 0): string {
  return num.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

/**
 * Calculate GB per SIM from yearly data
 */
function calculateGbPerSim(sims: number, totalGb: number): number {
  if (sims <= 0) return 0
  return totalGb / sims
}

/**
 * CreateScenarioModal - Modal for generating forecast scenarios from yearly forecast data
 *
 * Offers two modes:
 * 1. One scenario per year - Creates N separate scenarios for N years
 * 2. Consolidated scenario - Creates one combined scenario using peak/avg across all years
 */
export function CreateScenarioModal({
  isOpen,
  onClose,
  forecastId,
  forecastName,
  yearlyData,
  customerId,
  onCreateScenarios,
  onScenariosCreated,
  onCreateQuote,
}: CreateScenarioModalProps) {
  // State for scenario configuration
  const [scenarioType, setScenarioType] = useState<ScenarioType>('per_year')
  const [consolidationStrategy, setConsolidationStrategy] = useState<ConsolidationStrategy>('peak')
  const [scenarioNamePrefix, setScenarioNamePrefix] = useState('')
  const [consolidatedName, setConsolidatedName] = useState('')
  const [customSims, setCustomSims] = useState<number>(0)
  const [customGbPerSim, setCustomGbPerSim] = useState<number>(0)

  // State for creation process
  const [isCreating, setIsCreating] = useState(false)
  const [creationError, setCreationError] = useState<string | null>(null)
  const [creationSuccess, setCreationSuccess] = useState(false)
  const [createdScenarioIds, setCreatedScenarioIds] = useState<string[]>([])

  // Sort yearly data by year
  const sortedYearlyData = useMemo(() => {
    return [...yearlyData].sort((a, b) => a.year - b.year)
  }, [yearlyData])

  // Calculate consolidated values
  const consolidatedValues = useMemo(() => {
    if (sortedYearlyData.length === 0) {
      return { peak: { sims: 0, gbPerSim: 0 }, average: { sims: 0, gbPerSim: 0 } }
    }

    const sims = sortedYearlyData.map(d => d.endOfYearSims)
    const gbPerSimValues = sortedYearlyData.map(d => calculateGbPerSim(d.endOfYearSims, d.totalDataUsageGB))

    const peakSims = Math.max(...sims)
    const avgSims = Math.ceil(sims.reduce((a, b) => a + b, 0) / sims.length)

    // For GB/SIM, use the value from the peak SIMs year for peak strategy
    const peakIndex = sims.indexOf(peakSims)
    const peakGbPerSim = gbPerSimValues[peakIndex]
    const avgGbPerSim = gbPerSimValues.reduce((a, b) => a + b, 0) / gbPerSimValues.length

    return {
      peak: { sims: peakSims, gbPerSim: peakGbPerSim },
      average: { sims: avgSims, gbPerSim: avgGbPerSim },
    }
  }, [sortedYearlyData])

  // Initialize default values when modal opens
  useEffect(() => {
    if (isOpen) {
      setScenarioNamePrefix(forecastName)
      setConsolidatedName(`${forecastName} - Consolidated`)
      setCustomSims(consolidatedValues.peak.sims)
      setCustomGbPerSim(consolidatedValues.peak.gbPerSim)
      setCreationError(null)
      setCreationSuccess(false)
      setCreatedScenarioIds([])
    }
  }, [isOpen, forecastName, consolidatedValues])

  // Update custom values when strategy changes
  useEffect(() => {
    if (consolidationStrategy === 'peak') {
      setCustomSims(consolidatedValues.peak.sims)
      setCustomGbPerSim(consolidatedValues.peak.gbPerSim)
    } else if (consolidationStrategy === 'average') {
      setCustomSims(consolidatedValues.average.sims)
      setCustomGbPerSim(consolidatedValues.average.gbPerSim)
    }
  }, [consolidationStrategy, consolidatedValues])

  // Generate scenario names for per-year mode
  const perYearScenarioNames = useMemo(() => {
    return sortedYearlyData.map(d => `${scenarioNamePrefix} - ${d.year}`)
  }, [sortedYearlyData, scenarioNamePrefix])

  // Validate inputs
  const validationError = useMemo(() => {
    if (sortedYearlyData.length === 0) {
      return 'No yearly forecast data available'
    }

    if (scenarioType === 'per_year' && !scenarioNamePrefix.trim()) {
      return 'Please enter a scenario name prefix'
    }

    if (scenarioType === 'consolidated') {
      if (!consolidatedName.trim()) {
        return 'Please enter a scenario name'
      }
      if (consolidationStrategy === 'custom') {
        if (customSims <= 0) {
          return 'Custom SIMs must be greater than 0'
        }
        if (customGbPerSim < 0) {
          return 'Custom GB/SIM cannot be negative'
        }
      }
    }

    return null
  }, [sortedYearlyData, scenarioType, scenarioNamePrefix, consolidatedName, consolidationStrategy, customSims, customGbPerSim])

  // Build scenario options
  const buildScenarioOptions = (): CreateScenarioOptions => {
    if (scenarioType === 'per_year') {
      return {
        type: 'per_year',
        scenarioNames: perYearScenarioNames,
        forecastId,
        customerId,
      }
    } else {
      return {
        type: 'consolidated',
        consolidationStrategy,
        customValues: consolidationStrategy === 'custom'
          ? { totalSims: customSims, gbPerSim: customGbPerSim }
          : undefined,
        scenarioNames: [consolidatedName],
        forecastId,
        customerId,
      }
    }
  }

  // Handle create scenarios
  const handleCreate = async () => {
    if (validationError || !onCreateScenarios) return

    setIsCreating(true)
    setCreationError(null)

    try {
      const options = buildScenarioOptions()
      const scenarioIds = await onCreateScenarios(options)

      setCreatedScenarioIds(scenarioIds)
      setCreationSuccess(true)

      if (onScenariosCreated) {
        onScenariosCreated(scenarioIds)
      }
    } catch (error) {
      setCreationError(error instanceof Error ? error.message : 'Failed to create scenarios')
    } finally {
      setIsCreating(false)
    }
  }

  // Handle close
  const handleClose = () => {
    if (!isCreating) {
      onClose()
    }
  }

  // Preview content for per-year mode
  const renderPerYearPreview = () => (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Will create {sortedYearlyData.length} scenario{sortedYearlyData.length !== 1 ? 's' : ''}:
      </p>
      <div className="space-y-1 max-h-[150px] overflow-y-auto">
        {sortedYearlyData.map((row, idx) => (
          <div
            key={row.id}
            className="flex items-center justify-between text-sm py-1.5 px-2 bg-muted/50 rounded"
          >
            <span className="font-medium">{perYearScenarioNames[idx]}</span>
            <span className="text-muted-foreground">
              {formatNumber(row.endOfYearSims)} SIMs
            </span>
          </div>
        ))}
      </div>
    </div>
  )

  // Preview content for consolidated mode
  const renderConsolidatedPreview = () => {
    const values = consolidationStrategy === 'custom'
      ? { sims: customSims, gbPerSim: customGbPerSim }
      : consolidationStrategy === 'peak'
        ? consolidatedValues.peak
        : consolidatedValues.average

    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Will create 1 consolidated scenario:
        </p>
        <div className="bg-muted/50 rounded p-3 space-y-2">
          <div className="font-medium">{consolidatedName || 'Untitled'}</div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">Total SIMs:</span>
              <span className="ml-2 font-medium">{formatNumber(values.sims)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">GB/SIM:</span>
              <span className="ml-2 font-medium">{formatNumber(values.gbPerSim, 2)}</span>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            Strategy: {consolidationStrategy === 'peak' ? 'Peak values' : consolidationStrategy === 'average' ? 'Average values' : 'Custom values'}
          </div>
        </div>
      </div>
    )
  }

  // Handle create quote from success state
  const handleCreateQuoteFromSuccess = () => {
    if (onCreateQuote && createdScenarioIds.length > 0) {
      onCreateQuote(createdScenarioIds)
    }
    handleClose()
  }

  // Success state content
  if (creationSuccess) {
    return (
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="h-5 w-5 text-green-600" />
              Scenarios Created
            </DialogTitle>
            <DialogDescription>
              Successfully created {createdScenarioIds.length} scenario{createdScenarioIds.length !== 1 ? 's' : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <p className="text-sm text-green-800 dark:text-green-200">
                Your scenarios have been created and saved. You can now use them in the Forecast Evaluator or create a quote.
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={handleClose}>
              View Scenarios
            </Button>
            {onCreateQuote && (
              <Button onClick={handleCreateQuoteFromSuccess}>
                Create Quote
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Create Forecast Scenarios</DialogTitle>
          <DialogDescription>
            Generate scenarios from "{forecastName}" yearly forecast data
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Scenario Type Selection */}
          <div className="grid grid-cols-2 gap-4">
            <Card
              className={cn(
                "cursor-pointer transition-all hover:border-primary/50",
                scenarioType === 'per_year' && "border-primary ring-2 ring-primary/20"
              )}
              onClick={() => setScenarioType('per_year')}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className={cn(
                    "p-2 rounded-lg",
                    scenarioType === 'per_year' ? "bg-primary/10 text-primary" : "bg-muted"
                  )}>
                    <SplitSquareVertical className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">One Per Year</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Create {sortedYearlyData.length} separate scenario{sortedYearlyData.length !== 1 ? 's' : ''}, one for each year
                    </p>
                  </div>
                  {scenarioType === 'per_year' && (
                    <Check className="h-5 w-5 text-primary" />
                  )}
                </div>
              </CardContent>
            </Card>

            <Card
              className={cn(
                "cursor-pointer transition-all hover:border-primary/50",
                scenarioType === 'consolidated' && "border-primary ring-2 ring-primary/20"
              )}
              onClick={() => setScenarioType('consolidated')}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className={cn(
                    "p-2 rounded-lg",
                    scenarioType === 'consolidated' ? "bg-primary/10 text-primary" : "bg-muted"
                  )}>
                    <Layers className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">Consolidated</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Create 1 combined scenario using peak/avg values
                    </p>
                  </div>
                  {scenarioType === 'consolidated' && (
                    <Check className="h-5 w-5 text-primary" />
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <Separator />

          {/* Configuration based on type */}
          {scenarioType === 'per_year' ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="namePrefix">Scenario Name Prefix</Label>
                <Input
                  id="namePrefix"
                  value={scenarioNamePrefix}
                  onChange={(e) => setScenarioNamePrefix(e.target.value)}
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
                  onChange={(e) => setConsolidatedName(e.target.value)}
                  placeholder="e.g., Multi-Year Consolidated"
                />
              </div>

              <div className="space-y-2">
                <Label>Consolidation Strategy</Label>
                <Select
                  value={consolidationStrategy}
                  onValueChange={(v) => setConsolidationStrategy(v as ConsolidationStrategy)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="peak">
                      <div className="flex flex-col items-start">
                        <span>Peak Values</span>
                        <span className="text-xs text-muted-foreground">
                          Use maximum SIMs ({formatNumber(consolidatedValues.peak.sims)})
                        </span>
                      </div>
                    </SelectItem>
                    <SelectItem value="average">
                      <div className="flex flex-col items-start">
                        <span>Average Values</span>
                        <span className="text-xs text-muted-foreground">
                          Use average SIMs ({formatNumber(consolidatedValues.average.sims)})
                        </span>
                      </div>
                    </SelectItem>
                    <SelectItem value="custom">
                      <div className="flex flex-col items-start">
                        <span>Custom Values</span>
                        <span className="text-xs text-muted-foreground">
                          Specify your own values
                        </span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {consolidationStrategy === 'custom' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="customSims">Total SIMs</Label>
                    <Input
                      id="customSims"
                      type="number"
                      value={customSims}
                      onChange={(e) => setCustomSims(Number(e.target.value) || 0)}
                      min={0}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="customGbPerSim">GB/SIM (Monthly)</Label>
                    <Input
                      id="customGbPerSim"
                      type="number"
                      step="0.1"
                      value={customGbPerSim}
                      onChange={(e) => setCustomGbPerSim(Number(e.target.value) || 0)}
                      min={0}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <Separator />

          {/* Preview Section */}
          <div className="space-y-2">
            <Label className="text-base">Preview</Label>
            {scenarioType === 'per_year' ? renderPerYearPreview() : renderConsolidatedPreview()}
          </div>

          {/* Error Display */}
          {(validationError || creationError) && (
            <div className="flex items-center justify-between text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{validationError || creationError}</span>
              </div>
              {creationError && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setCreationError(null)
                  }}
                  className="shrink-0 ml-2"
                >
                  Dismiss
                </Button>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isCreating}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!!validationError || isCreating || !onCreateScenarios}
          >
            {isCreating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                Create {scenarioType === 'per_year' ? sortedYearlyData.length : 1} Scenario{scenarioType === 'per_year' && sortedYearlyData.length !== 1 ? 's' : ''}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default CreateScenarioModal
