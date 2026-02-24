import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase, invokeEdgeFunction } from '@/lib/supabase'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatCurrency, formatPercent } from '@/lib/utils'
import { applyBaseUsageRatio, CAS_REFERENCE_BASE_RATIO } from '@/lib/pricing'
import type { Sku, CalculatePricingResponse } from '@/types/database'
import { Calculator as CalcIcon } from 'lucide-react'

export default function Calculator() {
  const [selectedSku, setSelectedSku] = useState<string>('')
  const [quantity, setQuantity] = useState<number>(1)
  const [termMonths, setTermMonths] = useState<number>(12)
  const [environment, setEnvironment] = useState<'production' | 'reference'>('production')
  const [baseUsageRatio, setBaseUsageRatio] = useState<number>(0.60)
  const [result, setResult] = useState<CalculatePricingResponse | null>(null)
  const [calculating, setCalculating] = useState(false)

  // Fetch SKUs
  const { data: skus } = useQuery({
    queryKey: ['skus'],
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

  const handleCalculate = async () => {
    if (!selectedSku) return

    setCalculating(true)
    try {
      const response = await invokeEdgeFunction<CalculatePricingResponse>(
        'calculate-pricing',
        {
          action: 'calculate_items',
          items: [{
            id: 'preview',
            sku_id: selectedSku,
            quantity,
            term_months: termMonths,
            environment,
          }],
        }
      )
      setResult(response)
    } catch (error) {
      console.error('Calculation error:', error)
    } finally {
      setCalculating(false)
    }
  }

  const selectedSkuData = skus?.find(s => s.id === selectedSku)
  const isCasSku = selectedSkuData?.category === 'cas'
  const pricingResult = result?.items?.[0]

  // Apply base/usage ratio adjustment client-side for CAS SKUs
  const adjustedResult = pricingResult && isCasSku && baseUsageRatio !== CAS_REFERENCE_BASE_RATIO
    ? (() => {
        const { adjustedPrice: adjUnitPrice, ratioFactor } = applyBaseUsageRatio(
          pricingResult.unit_price,
          selectedSkuData?.is_base_charge ?? true,
          'cas',
          baseUsageRatio
        )
        const factor = ratioFactor ?? 1
        return {
          ...pricingResult,
          unit_price: adjUnitPrice,
          monthly_total: pricingResult.monthly_total * factor,
          annual_total: pricingResult.annual_total * factor,
          ratioFactor: factor,
        }
      })()
    : pricingResult ? { ...pricingResult, ratioFactor: null as number | null } : null

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Price Calculator</h1>
        <p className="text-muted-foreground">Calculate pricing for individual SKUs</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Input Card */}
        <Card>
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
            <CardDescription>Select SKU and enter parameters</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>SKU</Label>
              <Select value={selectedSku} onValueChange={setSelectedSku}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a SKU" />
                </SelectTrigger>
                <SelectContent>
                  {skus?.map((sku) => (
                    <SelectItem key={sku.id} value={sku.id}>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm">{sku.code}</span>
                        <span className="text-muted-foreground">- {sku.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Quantity</Label>
              <Input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
              />
              {selectedSkuData && (
                <p className="text-sm text-muted-foreground">
                  Unit: {selectedSkuData.unit}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Term (months)</Label>
              <Select
                value={termMonths.toString()}
                onValueChange={(v) => setTermMonths(parseInt(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 month</SelectItem>
                  <SelectItem value="12">12 months</SelectItem>
                  <SelectItem value="24">24 months</SelectItem>
                  <SelectItem value="36">36 months</SelectItem>
                  <SelectItem value="48">48 months</SelectItem>
                  <SelectItem value="60">60 months</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Environment</Label>
              <Select
                value={environment}
                onValueChange={(v) => setEnvironment(v as 'production' | 'reference')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="production">Production</SelectItem>
                  <SelectItem value="reference">Reference / Development</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isCasSku && (
              <div className="space-y-2">
                <Label>Base / Usage Ratio</Label>
                <Select
                  value={baseUsageRatio.toString()}
                  onValueChange={(v) => setBaseUsageRatio(parseFloat(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0.50">50 / 50</SelectItem>
                    <SelectItem value="0.55">55 / 45</SelectItem>
                    <SelectItem value="0.60">60 / 40 (default)</SelectItem>
                    <SelectItem value="0.65">65 / 35</SelectItem>
                    <SelectItem value="0.70">70 / 30</SelectItem>
                    <SelectItem value="0.75">75 / 25</SelectItem>
                    <SelectItem value="0.80">80 / 20</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  Adjusts the split between base charge and usage pricing for CAS SKUs
                </p>
              </div>
            )}

            <Button
              onClick={handleCalculate}
              disabled={!selectedSku || calculating}
              className="w-full"
            >
              {calculating ? (
                'Calculating...'
              ) : (
                <>
                  <CalcIcon className="mr-2 h-4 w-4" />
                  Calculate Price
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Results Card */}
        <Card>
          <CardHeader>
            <CardTitle>Results</CardTitle>
            <CardDescription>Calculated pricing breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            {adjustedResult ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg bg-muted p-4">
                    <p className="text-sm text-muted-foreground">List Price</p>
                    <p className="text-2xl font-bold">
                      {formatCurrency(adjustedResult.list_price)}
                    </p>
                    <p className="text-xs text-muted-foreground">per unit</p>
                  </div>
                  <div className="rounded-lg bg-muted p-4">
                    <p className="text-sm text-muted-foreground">Final Unit Price</p>
                    <p className="text-2xl font-bold text-primary">
                      {formatCurrency(adjustedResult.unit_price)}
                    </p>
                    <p className="text-xs text-muted-foreground">per unit</p>
                  </div>
                </div>

                <div className="space-y-2 rounded-lg border p-4">
                  <h4 className="font-medium">Discount Breakdown</h4>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Volume</p>
                      <p className="font-medium text-green-600">
                        -{formatPercent(adjustedResult.volume_discount_pct)}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Term</p>
                      <p className="font-medium text-green-600">
                        -{formatPercent(adjustedResult.term_discount_pct)}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Env Factor</p>
                      <p className="font-medium">
                        {adjustedResult.env_factor}x
                      </p>
                    </div>
                  </div>
                  {adjustedResult.ratioFactor !== null && (
                    <div className="border-t pt-2">
                      <p className="text-muted-foreground">Ratio Factor</p>
                      <p className="text-lg font-bold text-blue-600">
                        {adjustedResult.ratioFactor.toFixed(4)}x
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {Math.round(baseUsageRatio * 100)}/{Math.round((1 - baseUsageRatio) * 100)} base/usage split
                      </p>
                    </div>
                  )}
                  <div className="border-t pt-2">
                    <p className="text-muted-foreground">Total Discount</p>
                    <p className="text-lg font-bold text-green-600">
                      -{formatPercent(adjustedResult.total_discount_pct)}
                    </p>
                  </div>
                </div>

                <div className="rounded-lg bg-primary/10 p-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Monthly Total</p>
                      <p className="text-2xl font-bold">
                        {formatCurrency(adjustedResult.monthly_total)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Annual Total</p>
                      <p className="text-2xl font-bold">
                        {formatCurrency(adjustedResult.annual_total)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex h-64 flex-col items-center justify-center text-center">
                <CalcIcon className="mb-4 h-12 w-12 text-muted-foreground" />
                <p className="text-muted-foreground">
                  Select a SKU and click Calculate to see pricing
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
