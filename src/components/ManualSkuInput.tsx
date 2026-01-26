/**
 * ManualSkuInput
 *
 * Collapsible Card that lets users enter quantities for SKUs that have
 * no active forecast-to-KPI mapping (infrastructure items like Cennso Sites,
 * vCores, CoreClusters, CNO SKUs, etc.).
 *
 * Supports "same for all years" (default) with a toggle for per-year overrides.
 */

import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
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
import { ChevronDown, ChevronRight, Info, Wrench } from 'lucide-react'
import type { Sku, ForecastSkuMapping } from '@/types/database'
import type { ManualSkuItem } from '@/lib/quote-generator'
import type { CommitmentMode } from '@/components/CommitmentStrategyPicker'

interface ManualSkuInputProps {
  /** All active SKUs in the system */
  allSkus: Sku[]
  /** Active forecast-to-SKU mappings */
  forecastMappings: (ForecastSkuMapping & { sku: Sku })[]
  /** Available years from scenarios */
  availableYears: number[]
  /** Current commitment mode */
  commitmentMode: CommitmentMode
  /** Current value */
  value: ManualSkuItem[]
  /** Change callback */
  onChange: (items: ManualSkuItem[]) => void
}

export function ManualSkuInput({
  allSkus,
  forecastMappings,
  availableYears,
  commitmentMode,
  value,
  onChange,
}: ManualSkuInputProps) {
  const [expanded, setExpanded] = useState(false)
  const [perYearMode, setPerYearMode] = useState(false)

  // Compute unmapped SKUs: exclude base charges and any SKU that has an active mapping
  const unmappedSkus = useMemo(() => {
    const mappedSkuIds = new Set(forecastMappings.map(m => m.sku_id))
    return allSkus.filter(sku => !sku.is_base_charge && !mappedSkuIds.has(sku.id))
  }, [allSkus, forecastMappings])

  // Initialize value with all unmapped SKUs at quantity=0 when unmapped list changes
  useEffect(() => {
    if (unmappedSkus.length === 0) return
    if (value.length > 0) return // already initialized

    const initial: ManualSkuItem[] = unmappedSkus.map(sku => ({
      skuId: sku.id,
      skuCode: sku.code,
      skuName: sku.description,
      quantity: 0,
      environment: 'production',
    }))
    onChange(initial)
  }, [unmappedSkus, value.length, onChange])

  // If no unmapped SKUs, render nothing
  if (unmappedSkus.length === 0) return null

  const updateItem = (skuId: string, updates: Partial<ManualSkuItem>) => {
    onChange(
      value.map(item =>
        item.skuId === skuId ? { ...item, ...updates } : item
      )
    )
  }

  const updatePerYearQty = (skuId: string, year: number, qty: number) => {
    onChange(
      value.map(item => {
        if (item.skuId !== skuId) return item
        return {
          ...item,
          perYearQuantities: {
            ...(item.perYearQuantities ?? {}),
            [year]: qty,
          },
        }
      })
    )
  }

  const activeCount = value.filter(
    i => i.quantity > 0 || Object.values(i.perYearQuantities ?? {}).some(q => q > 0)
  ).length

  // Per-year toggle is hidden when commitmentMode is 'max' (single package)
  const showPerYearToggle = commitmentMode !== 'max' && availableYears.length > 1

  return (
    <Card className="mb-6">
      {/* Collapsible header */}
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setExpanded(prev => !prev)}
      >
        <CardTitle className="flex items-center gap-2 text-base">
          {expanded ? (
            <ChevronDown className="h-5 w-5" />
          ) : (
            <ChevronRight className="h-5 w-5" />
          )}
          <Wrench className="h-5 w-5 text-muted-foreground" />
          <span>Manual SKU Quantities</span>
          <span className="ml-auto text-sm font-normal text-muted-foreground">
            {unmappedSkus.length} unmapped SKU{unmappedSkus.length !== 1 ? 's' : ''}
            {activeCount > 0 && (
              <span className="ml-2 text-foreground font-medium">
                ({activeCount} with qty &gt; 0)
              </span>
            )}
          </span>
        </CardTitle>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-4">
          {/* Info note */}
          <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg text-sm">
            <Info className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
            <p className="text-muted-foreground">
              Enter quantities for infrastructure SKUs not derived from forecast data.
              Only SKUs with qty &gt; 0 will be added as line items.
            </p>
          </div>

          {/* Per-year toggle */}
          {showPerYearToggle && (
            <div className="flex items-center gap-2">
              <Switch
                id="per-year-toggle"
                checked={perYearMode}
                onCheckedChange={setPerYearMode}
              />
              <Label htmlFor="per-year-toggle" className="text-sm">
                Configure per year
              </Label>
            </div>
          )}

          {/* SKU table */}
          {!perYearMode ? (
            /* Single quantity mode */
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead className="w-32">Quantity</TableHead>
                  <TableHead className="w-36">Environment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {value.map(item => (
                  <TableRow key={item.skuId}>
                    <TableCell>
                      <div>
                        <div className="font-mono text-sm">{item.skuCode}</div>
                        <div className="text-sm text-muted-foreground">{item.skuName}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        value={item.quantity}
                        onChange={e =>
                          updateItem(item.skuId, {
                            quantity: Math.max(0, parseInt(e.target.value) || 0),
                          })
                        }
                        className="w-24"
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={item.environment}
                        onValueChange={v =>
                          updateItem(item.skuId, {
                            environment: v as 'production' | 'reference',
                          })
                        }
                      >
                        <SelectTrigger className="w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="production">Production</SelectItem>
                          <SelectItem value="reference">Reference</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            /* Per-year quantity mode */
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  {availableYears.map(year => (
                    <TableHead key={year} className="w-24 text-center">
                      {year}
                    </TableHead>
                  ))}
                  <TableHead className="w-36">Environment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {value.map(item => (
                  <TableRow key={item.skuId}>
                    <TableCell>
                      <div>
                        <div className="font-mono text-sm">{item.skuCode}</div>
                        <div className="text-sm text-muted-foreground">{item.skuName}</div>
                      </div>
                    </TableCell>
                    {availableYears.map(year => (
                      <TableCell key={year}>
                        <Input
                          type="number"
                          min={0}
                          value={item.perYearQuantities?.[year] ?? item.quantity}
                          onChange={e =>
                            updatePerYearQty(
                              item.skuId,
                              year,
                              Math.max(0, parseInt(e.target.value) || 0),
                            )
                          }
                          className="w-20"
                        />
                      </TableCell>
                    ))}
                    <TableCell>
                      <Select
                        value={item.environment}
                        onValueChange={v =>
                          updateItem(item.skuId, {
                            environment: v as 'production' | 'reference',
                          })
                        }
                      >
                        <SelectTrigger className="w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="production">Production</SelectItem>
                          <SelectItem value="reference">Reference</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      )}
    </Card>
  )
}

export default ManualSkuInput
