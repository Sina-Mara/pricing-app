/**
 * ScenarioSelectionModal
 *
 * A modal component for selecting forecast scenarios to create quotes.
 * Allows users to:
 * 1. Multi-select scenarios via checkboxes
 * 2. Choose quote type (pay-per-use vs commitment)
 * 3. View scenario summary info
 * 4. Select all / deselect all
 */

import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CheckSquare,
  Square,
  FileText,
  Users,
  Database,
  TrendingUp,
  Loader2,
  ChevronRight,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { ForecastScenario } from '@/types/database'

// =============================================================================
// Types
// =============================================================================

export type QuoteType = 'pay_per_use' | 'commitment'

export interface ScenarioSelectionModalProps {
  isOpen: boolean
  onClose: () => void
  scenarios: ForecastScenario[]
  onCreateQuote: (scenarioIds: string[], quoteType: QuoteType) => void
  /** Pre-selected scenario IDs (e.g., from just-created scenarios) */
  preSelectedIds?: string[]
  /** Loading state for when quote is being created */
  isCreating?: boolean
  /** Title override */
  title?: string
  /** Description override */
  description?: string
}

// =============================================================================
// Helper Functions
// =============================================================================

function formatNumber(num: number | null | undefined, decimals: number = 0): string {
  if (num === null || num === undefined) return '-'
  if (decimals === 0) {
    return num.toLocaleString()
  }
  return num.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function getQuoteTypeLabel(type: QuoteType): string {
  switch (type) {
    case 'pay_per_use':
      return 'Pay-per-Use'
    case 'commitment':
      return 'Commitment'
    default:
      return type
  }
}

function getQuoteTypeDescription(type: QuoteType): string {
  switch (type) {
    case 'pay_per_use':
      return 'Variable pricing based on actual usage each month'
    case 'commitment':
      return 'Fixed monthly pricing with volume discounts'
    default:
      return ''
  }
}

// =============================================================================
// ScenarioRow Component
// =============================================================================

interface ScenarioRowProps {
  scenario: ForecastScenario
  isSelected: boolean
  onToggle: () => void
}

function ScenarioRow({ scenario, isSelected, onToggle }: ScenarioRowProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all',
        isSelected
          ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
          : 'border-border hover:border-primary/50 hover:bg-muted/50'
      )}
      onClick={onToggle}
    >
      {/* Checkbox */}
      <div className="flex-shrink-0">
        {isSelected ? (
          <CheckSquare className="h-5 w-5 text-primary" />
        ) : (
          <Square className="h-5 w-5 text-muted-foreground" />
        )}
      </div>

      {/* Scenario Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{scenario.name}</span>
          {scenario.customer?.name && (
            <Badge variant="outline" className="text-xs flex-shrink-0">
              {scenario.customer.name}
            </Badge>
          )}
        </div>
        {scenario.description && (
          <p className="text-sm text-muted-foreground truncate mt-0.5">
            {scenario.description}
          </p>
        )}
      </div>

      {/* Key Metrics */}
      <div className="flex items-center gap-4 flex-shrink-0 text-sm">
        <div className="text-right">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            <span>SIMs</span>
          </div>
          <div className="font-medium">{formatNumber(scenario.total_sims)}</div>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Database className="h-3.5 w-3.5" />
            <span>GB/SIM</span>
          </div>
          <div className="font-medium">{formatNumber(scenario.gb_per_sim, 2)}</div>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-1 text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5" />
            <span>Peak</span>
          </div>
          <div className="font-medium">
            {formatNumber(scenario.output_peak_throughput, 2)} Gbit/s
          </div>
        </div>
      </div>

      {/* Arrow */}
      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
    </div>
  )
}

// =============================================================================
// Main Component
// =============================================================================

export function ScenarioSelectionModal({
  isOpen,
  onClose,
  scenarios,
  onCreateQuote,
  preSelectedIds = [],
  isCreating = false,
  title = 'Select Scenarios for Quote',
  description = 'Choose one or more scenarios to create a quote from',
}: ScenarioSelectionModalProps) {
  const navigate = useNavigate()

  // State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(preSelectedIds))
  const [quoteType, setQuoteType] = useState<QuoteType>('commitment')

  // Reset selection when modal opens or preSelectedIds change
  useEffect(() => {
    if (isOpen) {
      setSelectedIds(new Set(preSelectedIds))
    }
  }, [isOpen, preSelectedIds])

  // Computed values
  const selectedScenarios = useMemo(() => {
    return scenarios.filter(s => selectedIds.has(s.id))
  }, [scenarios, selectedIds])

  const totalSims = useMemo(() => {
    return selectedScenarios.reduce((sum, s) => sum + (s.total_sims || 0), 0)
  }, [selectedScenarios])

  const allSelected = scenarios.length > 0 && selectedIds.size === scenarios.length
  const someSelected = selectedIds.size > 0 && selectedIds.size < scenarios.length

  // Handlers
  const handleToggleScenario = (scenarioId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(scenarioId)) {
        next.delete(scenarioId)
      } else {
        next.add(scenarioId)
      }
      return next
    })
  }

  const handleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(scenarios.map(s => s.id)))
    }
  }

  const handleCreateQuote = () => {
    if (selectedIds.size === 0) return
    onCreateQuote(Array.from(selectedIds), quoteType)
  }

  const handleClose = () => {
    if (!isCreating) {
      onClose()
    }
  }

  // Empty state
  if (scenarios.length === 0) {
    return (
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="py-8 text-center">
            <FileText className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">No scenarios available</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Create forecast scenarios first, then return here to generate quotes.
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => {
                handleClose()
                navigate('/forecast/yearly')
              }}
            >
              Go to Forecast Input
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4 py-4">
          {/* Select All / Quote Type Row */}
          <div className="flex items-center justify-between gap-4">
            {/* Select All */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSelectAll}
              className="h-8"
            >
              {allSelected ? (
                <>
                  <CheckSquare className="mr-2 h-4 w-4" />
                  Deselect All
                </>
              ) : (
                <>
                  <Square className={cn('mr-2 h-4 w-4', someSelected && 'text-primary')} />
                  Select All ({scenarios.length})
                </>
              )}
            </Button>

            {/* Quote Type Selector */}
            <div className="flex items-center gap-2">
              <Label className="text-sm whitespace-nowrap">Quote Type:</Label>
              <Select
                value={quoteType}
                onValueChange={(v) => setQuoteType(v as QuoteType)}
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="commitment">
                    <div className="flex flex-col items-start">
                      <span>Commitment</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="pay_per_use">
                    <div className="flex flex-col items-start">
                      <span>Pay-per-Use</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Quote Type Description */}
          <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
            <strong>{getQuoteTypeLabel(quoteType)}:</strong>{' '}
            {getQuoteTypeDescription(quoteType)}
          </div>

          <Separator />

          {/* Scenario List */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {scenarios.map(scenario => (
              <ScenarioRow
                key={scenario.id}
                scenario={scenario}
                isSelected={selectedIds.has(scenario.id)}
                onToggle={() => handleToggleScenario(scenario.id)}
              />
            ))}
          </div>

          {/* Summary Footer */}
          {selectedIds.size > 0 && (
            <>
              <Separator />
              <div className="flex items-center justify-between text-sm bg-primary/5 rounded-lg px-3 py-2">
                <div className="flex items-center gap-4">
                  <span className="font-medium">
                    {selectedIds.size} scenario{selectedIds.size !== 1 ? 's' : ''} selected
                  </span>
                  <span className="text-muted-foreground">|</span>
                  <span className="text-muted-foreground">
                    Total SIMs: <span className="font-medium text-foreground">{formatNumber(totalSims)}</span>
                  </span>
                </div>
                <Badge variant="secondary">
                  {getQuoteTypeLabel(quoteType)}
                </Badge>
              </div>
            </>
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
            onClick={handleCreateQuote}
            disabled={selectedIds.size === 0 || isCreating}
          >
            {isCreating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating Quote...
              </>
            ) : (
              <>
                <FileText className="mr-2 h-4 w-4" />
                Create Quote ({selectedIds.size})
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default ScenarioSelectionModal
