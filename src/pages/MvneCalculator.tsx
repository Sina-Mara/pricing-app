import { useState, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency } from '@/lib/utils'
import { Save, FolderOpen, Trash2 } from 'lucide-react'
import type { Sku, BaseCharge, MvneCapacityInputs, MvneExternalCosts } from '@/types/database'
import type { PricingModel } from '@/lib/pricing'
import { priceFromModel } from '@/lib/pricing'
import {
  calculateMvnePricing,
  MVNE_USAGE_SKUS,
  MVNE_BASE_SKUS,
  throughputToMonthlyGb,
} from '@/lib/mvne-calculator'
import {
  useMvneConfigs,
  useMvneSaveConfig,
  useMvneDeleteConfig,
} from '@/hooks/useMvneCalculator'

// ============================================================================
// DEFAULT VALUES
// ============================================================================

const DEFAULT_CAPACITY: MvneCapacityInputs = {
  num_mvnos: 5,
  subs_per_mvno: 50000,
  parallel_take_rate: 0.5,
  aggregate_throughput_mbps: 5000,
  num_local_breakouts: 20,
  breakout_capacity_mbps: 1000,
  num_grx_sites: 3,
  apns_per_mvno: 1,
}

const DEFAULT_EXTERNAL: MvneExternalCosts = {
  infrastructure: 0,
  grx: 0,
  esim: 0,
}

const SKU_UNITS: Record<string, string> = {
  Cennso_Sites: 'Sites',
  Cennso_vCores: 'vCores',
  Cennso_CoreCluster: 'Clusters',
  SMC_sessions: 'sessions',
  UPG_Bandwidth: 'Mbit/s',
  TPOSS_UDR: 'UDR',
  TPOSS_PCS: 'PCS',
  TPOSS_CCS: 'CCS',
}

const SKU_DISPLAY: Record<string, string> = {
  Cennso_Sites: 'Cennso Sites',
  Cennso_vCores: 'Cennso vCores',
  Cennso_CoreCluster: 'Cennso Core Cluster',
  SMC_sessions: 'SMC Sessions',
  UPG_Bandwidth: 'UPG Bandwidth',
  TPOSS_UDR: 'TPOSS UDR',
  TPOSS_PCS: 'TPOSS PCS',
  TPOSS_CCS: 'TPOSS CCS',
  Cennso_base: 'Cennso Base',
  SMC_base: 'SMC Base',
  UPG_base: 'UPG Base',
  TPOSS_base: 'TPOSS Base',
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function MvneCalculator() {
  const { toast } = useToast()

  // ---- State ----
  const [capacity, setCapacity] = useState<MvneCapacityInputs>(DEFAULT_CAPACITY)
  const [skuQuantities, setSkuQuantities] = useState<Record<string, number>>({})
  const [externalCosts, setExternalCosts] = useState<MvneExternalCosts>(DEFAULT_EXTERNAL)
  const [configId, setConfigId] = useState<string | null>(null)
  const [configName, setConfigName] = useState('')
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [showLoadDialog, setShowLoadDialog] = useState(false)

  // ---- Data fetching: SKU prices from DB ----
  const { data: skuData } = useQuery({
    queryKey: ['mvne-skus'],
    queryFn: async () => {
      const allSkuCodes = [...MVNE_USAGE_SKUS, ...MVNE_BASE_SKUS]

      const [skusRes, pricingRes, baseChargesRes] = await Promise.all([
        supabase
          .from('skus')
          .select('id, code, description, unit')
          .in('code', allSkuCodes),
        supabase
          .from('pricing_models')
          .select('sku_id, base_qty, base_unit_price, per_double_discount, floor_unit_price, steps, mode, max_qty, breakpoints'),
        supabase
          .from('base_charges')
          .select('sku_id, base_mrc'),
      ])

      if (skusRes.error) throw skusRes.error
      if (pricingRes.error) throw pricingRes.error
      if (baseChargesRes.error) throw baseChargesRes.error

      const skus = skusRes.data as Pick<Sku, 'id' | 'code' | 'description' | 'unit'>[]
      const pricing = pricingRes.data as PricingModel[]
      const charges = baseChargesRes.data as Pick<BaseCharge, 'sku_id' | 'base_mrc'>[]

      // Build lookup maps
      const skuById = new Map(skus.map((s) => [s.id, s]))
      const pricingModels: Record<string, PricingModel> = {}
      const baseMrcs: Record<string, number> = {}

      for (const p of pricing) {
        const sku = skuById.get(p.sku_id)
        if (sku) pricingModels[sku.code] = p
      }

      for (const c of charges) {
        const sku = skuById.get(c.sku_id)
        if (sku) baseMrcs[sku.code] = c.base_mrc
      }

      return { skus, pricingModels, baseMrcs }
    },
  })

  const pricingModels = skuData?.pricingModels ?? {}
  const baseMrcs = skuData?.baseMrcs ?? {}

  // ---- Persistence hooks ----
  const { configs, loading: configsLoading } = useMvneConfigs()
  const { saveConfig, saving } = useMvneSaveConfig()
  const { deleteConfig, deleting } = useMvneDeleteConfig()

  // ---- Calculation (reactive) ----
  const result = useMemo(
    () => calculateMvnePricing(skuQuantities, pricingModels, baseMrcs, externalCosts, capacity),
    [skuQuantities, pricingModels, baseMrcs, externalCosts, capacity]
  )

  // ---- Handlers ----
  const updateCapacity = useCallback(
    (field: keyof MvneCapacityInputs, value: number) => {
      setCapacity((prev) => ({ ...prev, [field]: value }))
    },
    []
  )

  const updateSkuQty = useCallback((code: string, value: number) => {
    setSkuQuantities((prev) => ({ ...prev, [code]: value }))
  }, [])

  const updateExternal = useCallback(
    (field: keyof MvneExternalCosts, value: number) => {
      setExternalCosts((prev) => ({ ...prev, [field]: value }))
    },
    []
  )

  const handleSave = async () => {
    if (!configName.trim()) {
      toast({ variant: 'destructive', title: 'Name required' })
      return
    }
    try {
      const saved = await saveConfig({
        id: configId ?? undefined,
        name: configName,
        capacity_inputs: capacity,
        sku_quantities: skuQuantities,
        external_costs: externalCosts,
      })
      setConfigId(saved.id)
      setShowSaveDialog(false)
      toast({ title: 'Configuration saved' })
    } catch (err) {
      toast({ variant: 'destructive', title: 'Save failed', description: (err as Error).message })
    }
  }

  const handleLoad = async (id: string) => {
    const { data, error } = await supabase
      .from('mvne_calculator_configs')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      toast({ variant: 'destructive', title: 'Load failed', description: error.message })
      return
    }

    setConfigId(data.id)
    setConfigName(data.name)
    setCapacity(data.capacity_inputs as MvneCapacityInputs)
    setSkuQuantities(data.sku_quantities as Record<string, number>)
    setExternalCosts(data.external_costs as MvneExternalCosts)
    setShowLoadDialog(false)
    toast({ title: `Loaded "${data.name}"` })
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteConfig(id)
      if (configId === id) {
        setConfigId(null)
        setConfigName('')
      }
      toast({ title: 'Configuration deleted' })
    } catch (err) {
      toast({ variant: 'destructive', title: 'Delete failed', description: (err as Error).message })
    }
  }

  const totalMonthlyGb = throughputToMonthlyGb(capacity.aggregate_throughput_mbps)

  // ---- Render ----
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">MVNE Calculator</h1>
          <p className="text-muted-foreground">
            Model shared infrastructure costs and derive per-MVNO pricing
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowLoadDialog(true)}>
            <FolderOpen className="h-4 w-4 mr-2" />
            Load
          </Button>
          <Button
            size="sm"
            onClick={() => {
              if (!configName) setConfigName('New Configuration')
              setShowSaveDialog(true)
            }}
          >
            <Save className="h-4 w-4 mr-2" />
            Save
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        {/* ============================================================ */}
        {/* LEFT COLUMN: Inputs */}
        {/* ============================================================ */}
        <div className="xl:col-span-2 space-y-6">
          {/* Capacity Reference */}
          <Card>
            <CardHeader>
              <CardTitle>Capacity Assumptions</CardTitle>
              <CardDescription>
                Reference parameters for the shared MVNE infrastructure
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <NumberField
                  label="# Quick MVNOs"
                  value={capacity.num_mvnos}
                  onChange={(v) => updateCapacity('num_mvnos', v)}
                />
                <NumberField
                  label="Subs per MVNO"
                  value={capacity.subs_per_mvno}
                  onChange={(v) => updateCapacity('subs_per_mvno', v)}
                />
                <NumberField
                  label="Parallel Take Rate"
                  value={capacity.parallel_take_rate}
                  onChange={(v) => updateCapacity('parallel_take_rate', v)}
                  step={0.1}
                />
                <NumberField
                  label="Aggregate Throughput (Mbit/s)"
                  value={capacity.aggregate_throughput_mbps}
                  onChange={(v) => updateCapacity('aggregate_throughput_mbps', v)}
                />
                <NumberField
                  label="# Local Breakouts"
                  value={capacity.num_local_breakouts}
                  onChange={(v) => updateCapacity('num_local_breakouts', v)}
                />
                <NumberField
                  label="Breakout Capacity (Mbit/s)"
                  value={capacity.breakout_capacity_mbps}
                  onChange={(v) => updateCapacity('breakout_capacity_mbps', v)}
                />
                <NumberField
                  label="# GRX/PGW Sites"
                  value={capacity.num_grx_sites}
                  onChange={(v) => updateCapacity('num_grx_sites', v)}
                />
                <NumberField
                  label="APNs per MVNO"
                  value={capacity.apns_per_mvno}
                  onChange={(v) => updateCapacity('apns_per_mvno', v)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Platform Usage SKUs */}
          <Card>
            <CardHeader>
              <CardTitle>Platform Usage Costs</CardTitle>
              <CardDescription>
                Enter quantities — unit prices are pulled from the SKU catalog
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Component</TableHead>
                    <TableHead className="w-32">Quantity</TableHead>
                    <TableHead className="w-24">Unit</TableHead>
                    <TableHead className="w-28 text-right">List Price</TableHead>
                    <TableHead className="w-28 text-right">Vol. Price</TableHead>
                    <TableHead className="w-36 text-right">Monthly Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {MVNE_USAGE_SKUS.map((code) => {
                    const qty = skuQuantities[code] ?? 0
                    const model = pricingModels[code]
                    const listPrice = model?.base_unit_price ?? 0
                    const volPrice = model && qty > 0 ? priceFromModel(model, qty) : listPrice
                    const hasDiscount = qty > 0 && volPrice < listPrice
                    const cost = qty * volPrice
                    return (
                      <TableRow key={code}>
                        <TableCell className="font-medium">{SKU_DISPLAY[code]}</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            value={qty || ''}
                            onChange={(e) => updateSkuQty(code, parseFloat(e.target.value) || 0)}
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {SKU_UNITS[code]}
                        </TableCell>
                        <TableCell className={`text-right font-mono text-sm ${hasDiscount ? 'line-through text-muted-foreground' : ''}`}>
                          {formatCurrency(listPrice)}
                        </TableCell>
                        <TableCell className={`text-right font-mono text-sm ${hasDiscount ? 'text-green-600 font-medium' : ''}`}>
                          {formatCurrency(volPrice)}
                        </TableCell>
                        <TableCell className="text-right font-mono font-medium">
                          {formatCurrency(cost)}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Platform Base Charges */}
          <Card>
            <CardHeader>
              <CardTitle>Platform Base Charges</CardTitle>
              <CardDescription>
                Fixed monthly charges from the SKU catalog (edit in Admin &gt; Base Charges)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Component</TableHead>
                    <TableHead className="text-right">Monthly MRC</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {MVNE_BASE_SKUS.map((code) => (
                    <TableRow key={code}>
                      <TableCell className="font-medium">{SKU_DISPLAY[code]}</TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {formatCurrency(baseMrcs[code] ?? 0)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-bold border-t-2">
                    <TableCell>Total Base Charges</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(result.totalBaseCharges)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* External Costs */}
          <Card>
            <CardHeader>
              <CardTitle>External Costs</CardTitle>
              <CardDescription>
                Manual monthly cost entries for items not in the SKU catalog
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-3">
                <CurrencyField
                  label="Infrastructure (VMs, IPs, Storage)"
                  value={externalCosts.infrastructure}
                  onChange={(v) => updateExternal('infrastructure', v)}
                />
                <CurrencyField
                  label="GRX Costs"
                  value={externalCosts.grx}
                  onChange={(v) => updateExternal('grx', v)}
                />
                <CurrencyField
                  label="eSIM Costs"
                  value={externalCosts.esim}
                  onChange={(v) => updateExternal('esim', v)}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ============================================================ */}
        {/* RIGHT COLUMN: Output */}
        {/* ============================================================ */}
        <div className="space-y-6">
          {/* Per-MVNO Result */}
          <Card className="border-2 border-primary/20">
            <CardHeader>
              <CardTitle>Per-MVNO Pricing</CardTitle>
              <CardDescription>
                Shared costs split equally across {capacity.num_mvnos} MVNOs
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-primary/5 p-4 text-center">
                <p className="text-sm text-muted-foreground mb-1">Base MRC per MVNO</p>
                <p className="text-3xl font-bold">{formatCurrency(result.perMvnoMrc)}</p>
              </div>
              <div className="rounded-lg bg-primary/5 p-4 text-center">
                <p className="text-sm text-muted-foreground mb-1">Per-GB Rate</p>
                <p className="text-3xl font-bold">{formatCurrency(result.perGbRate)}</p>
              </div>
              <Separator />
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Shared Cost</span>
                  <span className="font-mono font-medium">{formatCurrency(result.totalSharedCost)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Platform Cost</span>
                  <span className="font-mono">{formatCurrency(result.totalPlatformCost)}</span>
                </div>
                <div className="flex justify-between pl-4">
                  <span className="text-muted-foreground">Base Charges</span>
                  <span className="font-mono">{formatCurrency(result.totalBaseCharges)}</span>
                </div>
                <div className="flex justify-between pl-4">
                  <span className="text-muted-foreground">Usage Costs</span>
                  <span className="font-mono">{formatCurrency(result.totalUsageCosts)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">External Cost</span>
                  <span className="font-mono">{formatCurrency(result.totalExternalCost)}</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Est. Monthly GB</span>
                  <span className="font-mono">{totalMonthlyGb.toLocaleString()} GB</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Sensitivity Table */}
          <Card>
            <CardHeader>
              <CardTitle>Sensitivity Analysis</CardTitle>
              <CardDescription>
                How per-MVNO cost changes with different MVNO counts
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead># MVNOs</TableHead>
                    <TableHead className="text-right">MRC / MVNO</TableHead>
                    <TableHead className="text-right">Per-GB</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.sensitivityTable.map((row) => (
                    <TableRow
                      key={row.numMvnos}
                      className={row.numMvnos === capacity.num_mvnos ? 'bg-primary/5 font-bold' : ''}
                    >
                      <TableCell>{row.numMvnos}</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(row.perMvnoMrc)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(row.perGbRate)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ============================================================ */}
      {/* SAVE DIALOG */}
      {/* ============================================================ */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Configuration</DialogTitle>
            <DialogDescription>
              Save current inputs so you can reload them later
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Configuration Name</Label>
              <Input
                value={configName}
                onChange={(e) => setConfigName(e.target.value)}
                placeholder="e.g. MWC Base Scenario"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================================ */}
      {/* LOAD DIALOG */}
      {/* ============================================================ */}
      <Dialog open={showLoadDialog} onOpenChange={setShowLoadDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Load Configuration</DialogTitle>
            <DialogDescription>Select a saved configuration to load</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4">
            {configsLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
            {configs.length === 0 && !configsLoading && (
              <p className="text-sm text-muted-foreground">No saved configurations yet</p>
            )}
            {configs.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent/50 cursor-pointer"
                onClick={() => handleLoad(c.id)}
              >
                <div>
                  <p className="font-medium">{c.name}</p>
                  {c.description && (
                    <p className="text-sm text-muted-foreground">{c.description}</p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDelete(c.id)
                  }}
                  disabled={deleting}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

function NumberField({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  step?: number
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        min={0}
        step={step}
        value={value || ''}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="h-8"
      />
    </div>
  )
}

function CurrencyField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          &euro;
        </span>
        <Input
          type="number"
          min={0}
          step={0.01}
          value={value || ''}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="h-8 pl-7"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          /mo
        </span>
      </div>
    </div>
  )
}
