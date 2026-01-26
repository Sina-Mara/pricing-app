/**
 * CommitmentStrategyPicker
 *
 * Component for selecting a commitment sizing strategy when creating
 * quotes from multiple forecast scenarios/years.
 *
 * Strategies:
 * - Peak: Size for maximum values across all scenarios
 * - Average: Size for average values across all scenarios
 * - Specific Year: Size for a single selected year
 */

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { TrendingUp, BarChart2, Calendar, Info } from 'lucide-react'
import type { ForecastScenario } from '@/types/database'
import {
  type CommitmentSizingStrategy,
  type AggregatedKpiValues,
  aggregateScenarioValues,
  extractYearsFromScenarios,
  getStrategyInfo,
} from '@/lib/quote-generator'

interface CommitmentStrategyPickerProps {
  /** Forecast scenarios to choose from */
  scenarios: ForecastScenario[]
  /** Currently selected strategy */
  strategy: CommitmentSizingStrategy
  /** Callback when strategy changes */
  onStrategyChange: (strategy: CommitmentSizingStrategy) => void
  /** Selected year for specific_year strategy */
  specificYear?: number
  /** Callback when specific year changes */
  onSpecificYearChange?: (year: number) => void
  /** Whether to show the preview values */
  showPreview?: boolean
  /** Additional CSS class */
  className?: string
}

/**
 * Format large numbers with K/M suffixes
 */
function formatNumber(value: number): string {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`
  }
  return value.toLocaleString()
}

/**
 * Get icon component for strategy
 */
function StrategyIcon({ strategy }: { strategy: CommitmentSizingStrategy }) {
  switch (strategy) {
    case 'peak':
      return <TrendingUp className="h-5 w-5 text-orange-500" />
    case 'average':
      return <BarChart2 className="h-5 w-5 text-blue-500" />
    case 'specific_year':
      return <Calendar className="h-5 w-5 text-green-500" />
    default:
      return <Info className="h-5 w-5" />
  }
}

/**
 * KPI Preview Table
 */
function KpiPreviewTable({ values }: { values: AggregatedKpiValues }) {
  const kpis = [
    { label: 'UDR (Total SIMs)', value: values.udr },
    { label: 'PCS (Concurrent Users)', value: values.pcs },
    { label: 'CCS (Active Users Total)', value: values.ccs },
    { label: 'SCS (Data Sessions)', value: values.scs },
    { label: 'CoS (Gateway Sessions)', value: values.cos },
    { label: 'Peak Throughput (Gbit/s)', value: values.peakThroughput, format: 'decimal' },
  ]

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>KPI</TableHead>
          <TableHead className="text-right">Value</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {kpis.map((kpi) => (
          <TableRow key={kpi.label}>
            <TableCell className="font-medium text-sm">{kpi.label}</TableCell>
            <TableCell className="text-right font-mono">
              {kpi.format === 'decimal'
                ? kpi.value.toFixed(2)
                : formatNumber(kpi.value)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function CommitmentStrategyPicker({
  scenarios,
  strategy,
  onStrategyChange,
  specificYear,
  onSpecificYearChange,
  showPreview = true,
  className = '',
}: CommitmentStrategyPickerProps) {
  const [previewValues, setPreviewValues] = useState<AggregatedKpiValues | null>(null)

  // Extract available years from scenarios
  const availableYears = extractYearsFromScenarios(scenarios)
  const hasMultipleYears = availableYears.length > 1

  // Update preview when strategy or specific year changes
  useEffect(() => {
    if (scenarios.length === 0) {
      setPreviewValues(null)
      return
    }

    try {
      const values = aggregateScenarioValues(
        scenarios,
        strategy,
        strategy === 'specific_year' ? specificYear : undefined
      )
      setPreviewValues(values)
    } catch (error) {
      console.error('Failed to aggregate values:', error)
      setPreviewValues(null)
    }
  }, [scenarios, strategy, specificYear])

  // If only one scenario, don't show strategy picker
  if (scenarios.length <= 1) {
    return null
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <StrategyIcon strategy={strategy} />
          Commitment Sizing Strategy
        </CardTitle>
        <CardDescription>
          Choose how to size your commitment based on {scenarios.length} scenarios
          {hasMultipleYears && ` (${availableYears[0]}-${availableYears[availableYears.length - 1]})`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Strategy Selection */}
        <RadioGroup
          value={strategy}
          onValueChange={(value: string) => onStrategyChange(value as CommitmentSizingStrategy)}
          className="space-y-3"
        >
          {/* Peak Strategy */}
          <div className="flex items-start space-x-3">
            <RadioGroupItem value="peak" id="strategy-peak" className="mt-1" />
            <Label htmlFor="strategy-peak" className="flex-1 cursor-pointer">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-orange-500" />
                <span className="font-medium">{getStrategyInfo('peak').label}</span>
                <Badge variant="outline" className="text-xs">Recommended</Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {getStrategyInfo('peak').description}
              </p>
            </Label>
          </div>

          {/* Average Strategy */}
          <div className="flex items-start space-x-3">
            <RadioGroupItem value="average" id="strategy-average" className="mt-1" />
            <Label htmlFor="strategy-average" className="flex-1 cursor-pointer">
              <div className="flex items-center gap-2">
                <BarChart2 className="h-4 w-4 text-blue-500" />
                <span className="font-medium">{getStrategyInfo('average').label}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {getStrategyInfo('average').description}
              </p>
            </Label>
          </div>

          {/* Specific Year Strategy (only if multiple years available) */}
          {hasMultipleYears && (
            <div className="flex items-start space-x-3">
              <RadioGroupItem value="specific_year" id="strategy-year" className="mt-1" />
              <Label htmlFor="strategy-year" className="flex-1 cursor-pointer">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-green-500" />
                  <span className="font-medium">{getStrategyInfo('specific_year').label}</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {getStrategyInfo('specific_year').description}
                </p>
              </Label>
            </div>
          )}
        </RadioGroup>

        {/* Year Selector (for specific_year strategy) */}
        {strategy === 'specific_year' && hasMultipleYears && (
          <div className="space-y-2 pl-6">
            <Label>Select Year</Label>
            <Select
              value={specificYear?.toString() || ''}
              onValueChange={(v) => onSpecificYearChange?.(parseInt(v))}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Choose year" />
              </SelectTrigger>
              <SelectContent>
                {availableYears.map((year) => (
                  <SelectItem key={year} value={year.toString()}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Preview Values */}
        {showPreview && previewValues && (
          <div className="space-y-3 pt-4 border-t">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Preview Values</Label>
              <span className="text-xs text-muted-foreground">
                {previewValues.sourceInfo}
              </span>
            </div>
            <KpiPreviewTable values={previewValues} />
          </div>
        )}

        {/* Strategy Comparison Summary */}
        {scenarios.length > 1 && (
          <div className="p-3 bg-muted/50 rounded-lg text-sm">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <div>
                <p className="font-medium">Strategy Impact</p>
                <p className="text-muted-foreground">
                  {strategy === 'peak' &&
                    'Peak sizing ensures capacity for maximum demand but may result in over-provisioning during lower usage periods.'}
                  {strategy === 'average' &&
                    'Average sizing balances cost and capacity, suitable when usage patterns are predictable.'}
                  {strategy === 'specific_year' &&
                    'Specific year sizing is useful when you want to commit based on a particular milestone or year in the forecast.'}
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default CommitmentStrategyPicker
