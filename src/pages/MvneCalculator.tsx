import { useState, useMemo, useCallback, useEffect, useRef, Fragment } from 'react'
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
import { Save, FolderOpen, Trash2, Plus, Calculator, RotateCcw } from 'lucide-react'
import type { Sku, BaseCharge, MvneCapacityInputs, MvneExternalCosts, MvneExternalCostItem } from '@/types/database'
import type { PricingModel } from '@/lib/pricing'
import { priceFromModel } from '@/lib/pricing'
import {
  calculateMvnePricing,
  createDefaultExternalCosts,
  migrateExternalCosts,
  computeSkuQuantities,
  AUTO_POPULATED_SKUS,
  MVNE_USAGE_SKUS,
  MVNE_BASE_SKUS,
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
  vcores_per_breakout: 0,
  vcores_per_pgw: 0,
  take_rate_pcs_udr: 0,
  take_rate_ccs_udr: 0,
  nodes_per_cno_site: 0,
  gb_per_sub_per_month: 5,
}

const DEFAULT_EXTERNAL: MvneExternalCosts = createDefaultExternalCosts()

const SKU_UNITS: Record<string, string> = {
  Cennso_Sites: 'Sites',
  Cennso_vCores: 'vCores',
  Cennso_CoreCluster: 'Clusters',
  SMC_sessions: 'sessions',
  UPG_Bandwidth: 'Mbit/s',
  TPOSS_UDR: 'UDR',
  TPOSS_PCS: 'PCS',
  TPOSS_CCS: 'CCS',
  CNO_Sites: 'Sites',
  CNO_Nodes: 'Worker Nodes',
  CNO_DB: 'DB Instances',
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
  CNO_Sites: 'CNO Sites',
  CNO_Nodes: 'CNO Worker Nodes',
  CNO_DB: 'CNO Database Instances',
  Cennso_base: 'Cennso Base',
  SMC_base: 'SMC Base',
  UPG_base: 'UPG Base',
  TPOSS_base: 'TPOSS Base',
  CNO_base: 'CNO Management Base',
  CNO_24_7: 'CNO 24/7 Support',
  CNO_central: 'CNO Central Services',
}

// ============================================================================
// CATEGORY GROUPINGS
// ============================================================================

const USAGE_CATEGORIES = [
  { name: 'Cennso', label: 'Cennso (CAS)', skus: ['Cennso_Sites', 'Cennso_vCores', 'Cennso_CoreCluster'], shared: true },
  { name: 'SMC', label: 'SMC', skus: ['SMC_sessions'], shared: false },
  { name: 'UPG', label: 'UPG', skus: ['UPG_Bandwidth'], shared: false },
  { name: 'TPOSS', label: 'TPOSS', skus: ['TPOSS_UDR', 'TPOSS_PCS', 'TPOSS_CCS'], shared: false },
  { name: 'CNO', label: 'CNO', skus: ['CNO_Sites', 'CNO_Nodes', 'CNO_DB'], shared: true },
] as const

const BASE_CATEGORIES = [
  { name: 'Cennso', label: 'Cennso (CAS)', skus: ['Cennso_base'] },
  { name: 'SMC', label: 'SMC', skus: ['SMC_base'] },
  { name: 'UPG', label: 'UPG', skus: ['UPG_base'] },
  { name: 'TPOSS', label: 'TPOSS', skus: ['TPOSS_base'] },
  { name: 'CNO', label: 'CNO', skus: ['CNO_base', 'CNO_24_7', 'CNO_central'] },
] as const

// ============================================================================
// COMPONENT
// ============================================================================

export default function MvneCalculator() {
  const { toast } = useToast()

  // ---- State ----
  const [capacity, setCapacity] = useState<MvneCapacityInputs>(DEFAULT_CAPACITY)
  const [skuQuantities, setSkuQuantities] = useState<Record<string, number>>({})
  const [skuDiscounts, setSkuDiscounts] = useState<Record<string, number>>({})
  const [externalCosts, setExternalCosts] = useState<MvneExternalCosts>(DEFAULT_EXTERNAL)
  const [skuOverrides, setSkuOverrides] = useState<Record<string, boolean>>({})
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

  // ---- Auto-populate SKU quantities from capacity inputs ----
  const isLoadingConfig = useRef(false)

  useEffect(() => {
    if (isLoadingConfig.current) return
    const computed = computeSkuQuantities(capacity)
    setSkuQuantities((prev) => {
      const next = { ...prev }
      for (const [code, qty] of Object.entries(computed)) {
        if (!skuOverrides[code]) {
          next[code] = qty
        }
      }
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capacity, skuOverrides])

  // ---- Calculation (reactive) ----
  const result = useMemo(
    () => calculateMvnePricing(skuQuantities, pricingModels, baseMrcs, externalCosts, capacity, skuDiscounts),
    [skuQuantities, pricingModels, baseMrcs, externalCosts, capacity, skuDiscounts]
  )

  // ---- Per-category cost breakdown (for the output panel) ----
  // Cennso = umbrella for all CNF SKUs (Cennso, SMC, UPG, TPOSS)
  // CNO = separate platform
  // External = external costs
  const categoryBreakdown = useMemo(() => {
    const CENNSO_PREFIXES = new Set(['Cennso', 'SMC', 'UPG', 'TPOSS'])
    const cats: Record<string, { base: number; shared: number; perMvno: number; extFixed: number; extPerGb: number }> = {
      Cennso: { base: 0, shared: 0, perMvno: 0, extFixed: 0, extPerGb: 0 },
      CNO: { base: 0, shared: 0, perMvno: 0, extFixed: 0, extPerGb: 0 },
      External: { base: 0, shared: 0, perMvno: 0, extFixed: 0, extPerGb: 0 },
    }
    for (const c of result.componentBreakdown) {
      if (c.type === 'external_fixed') {
        cats.External.extFixed += c.cost
      } else if (c.type === 'external_per_gb') {
        cats.External.extPerGb += c.unitPrice ?? 0
      } else {
        const prefix = c.skuCode.split('_')[0]
        const catName = CENNSO_PREFIXES.has(prefix) ? 'Cennso' : 'CNO'
        if (c.type === 'base') cats[catName].base += c.cost
        else if (c.type === 'shared_usage') cats[catName].shared += c.cost
        else if (c.type === 'per_mvno_usage') cats[catName].perMvno += c.cost
      }
    }
    return ['Cennso', 'CNO', 'External'].map((name) => ({
      name,
      ...cats[name]!,
      totalFixed: cats[name]!.base + cats[name]!.shared + cats[name]!.extFixed,
      totalPerMvno: cats[name]!.perMvno,
    }))
  }, [result.componentBreakdown])

  // ---- Handlers ----
  const updateCapacity = useCallback(
    (field: keyof MvneCapacityInputs, value: number) => {
      setCapacity((prev) => ({ ...prev, [field]: value }))
    },
    []
  )

  const updateSkuQty = useCallback((code: string, value: number) => {
    if (AUTO_POPULATED_SKUS.has(code)) {
      setSkuOverrides((prev) => ({ ...prev, [code]: true }))
    }
    setSkuQuantities((prev) => ({ ...prev, [code]: value }))
  }, [])

  const updateSkuDiscount = useCallback((code: string, value: number) => {
    setSkuDiscounts((prev) => ({ ...prev, [code]: Math.min(100, Math.max(0, value)) }))
  }, [])

  const resetSkuOverride = useCallback((code: string) => {
    setSkuOverrides((prev) => {
      const next = { ...prev }
      delete next[code]
      return next
    })
    // Recalculate from current capacity
    const computed = computeSkuQuantities(capacity)
    if (code in computed) {
      setSkuQuantities((prev) => ({ ...prev, [code]: computed[code] }))
    }
  }, [capacity])

  const addExternalCost = useCallback(() => {
    setExternalCosts((prev) => [
      ...prev,
      { id: `ext_${Date.now()}`, name: '', fixed_monthly: 0, per_gb: 0 },
    ])
  }, [])

  const removeExternalCost = useCallback((id: string) => {
    setExternalCosts((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const updateExternalCost = useCallback(
    (id: string, field: keyof Omit<MvneExternalCostItem, 'id'>, value: string | number) => {
      setExternalCosts((prev) =>
        prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
      )
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
        sku_discounts: skuDiscounts,
        sku_overrides: skuOverrides,
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

    isLoadingConfig.current = true
    setConfigId(data.id)
    setConfigName(data.name)

    // Merge loaded capacity with defaults so new fields (e.g. vcores_per_breakout)
    // default to 0 when loading configs saved before those fields existed.
    const loadedCapacity: MvneCapacityInputs = { ...DEFAULT_CAPACITY, ...(data.capacity_inputs as Partial<MvneCapacityInputs>) }
    setCapacity(loadedCapacity)
    setSkuQuantities(data.sku_quantities as Record<string, number>)
    setSkuDiscounts((data.sku_discounts as Record<string, number>) ?? {})
    setExternalCosts(migrateExternalCosts(data.external_costs))

    // Restore SKU overrides: prefer persisted overrides if available (new configs),
    // otherwise infer from quantity differences (backward compat for old configs).
    const savedOverrides = (data.sku_overrides as Record<string, boolean> | null) ?? null
    if (savedOverrides && Object.keys(savedOverrides).length > 0) {
      setSkuOverrides(savedOverrides)
    } else {
      // Legacy configs: infer overrides by comparing stored quantities to computed
      const loadedQtys = data.sku_quantities as Record<string, number>
      const computed = computeSkuQuantities(loadedCapacity)
      const inferred: Record<string, boolean> = {}
      for (const code of AUTO_POPULATED_SKUS) {
        if (code in loadedQtys && loadedQtys[code] !== computed[code]) {
          inferred[code] = true
        }
      }
      setSkuOverrides(inferred)
    }
    // Re-enable auto-population after state updates settle
    requestAnimationFrame(() => { isLoadingConfig.current = false })
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
                  label="GB / Sub / Month"
                  value={capacity.gb_per_sub_per_month}
                  onChange={(v) => updateCapacity('gb_per_sub_per_month', v)}
                  step={0.1}
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
              <Separator className="my-4" />
              <div>
                <p className="text-sm font-medium mb-3">Sizing Parameters</p>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                  <NumberField
                    label="vCores per Breakout"
                    value={capacity.vcores_per_breakout}
                    onChange={(v) => updateCapacity('vcores_per_breakout', v)}
                  />
                  <NumberField
                    label="vCores per PGW/GRX"
                    value={capacity.vcores_per_pgw}
                    onChange={(v) => updateCapacity('vcores_per_pgw', v)}
                  />
                  <NumberField
                    label="PCS/UDR Take Rate"
                    value={capacity.take_rate_pcs_udr}
                    onChange={(v) => updateCapacity('take_rate_pcs_udr', v)}
                    step={0.01}
                  />
                  <NumberField
                    label="CCS/UDR Take Rate"
                    value={capacity.take_rate_ccs_udr}
                    onChange={(v) => updateCapacity('take_rate_ccs_udr', v)}
                    step={0.01}
                  />
                  <NumberField
                    label="CNO Nodes per Site"
                    value={capacity.nodes_per_cno_site}
                    onChange={(v) => updateCapacity('nodes_per_cno_site', v)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Platform Usage SKUs */}
          <Card>
            <CardHeader>
              <CardTitle>Platform Usage Costs</CardTitle>
              <CardDescription>
                Quantities are auto-derived from capacity inputs. Override manually if needed.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Component</TableHead>
                    <TableHead className="w-40">Quantity</TableHead>
                    <TableHead className="w-24">Unit</TableHead>
                    <TableHead className="w-28 text-right">List Price</TableHead>
                    <TableHead className="w-28 text-right">Vol. Price</TableHead>
                    <TableHead className="w-24">Discount %</TableHead>
                    <TableHead className="w-36 text-right">Monthly Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {USAGE_CATEGORIES.map((cat) => (
                    <Fragment key={cat.name}>
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableCell colSpan={7} className="py-2">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">
                              {cat.label}
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                              cat.shared
                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                            }`}>
                              {cat.shared ? 'Shared' : 'Per-MVNO'}
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                      {cat.skus.map((code) => {
                        const isAuto = AUTO_POPULATED_SKUS.has(code)
                        const isOverridden = isAuto && skuOverrides[code]
                        const isAutoActive = isAuto && !isOverridden
                        return (
                          <SkuRow
                            key={code}
                            code={code}
                            qty={skuQuantities[code] ?? 0}
                            model={pricingModels[code]}
                            disc={skuDiscounts[code] ?? 0}
                            isAutoActive={isAutoActive}
                            isOverridden={!!isOverridden}
                            onQtyChange={updateSkuQty}
                            onDiscChange={updateSkuDiscount}
                            onReset={resetSkuOverride}
                          />
                        )
                      })}
                    </Fragment>
                  ))}
                  <TableRow className="border-t font-medium">
                    <TableCell colSpan={6} className="text-muted-foreground">Shared Subtotal</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(result.totalSharedUsageCosts)}</TableCell>
                  </TableRow>
                  <TableRow className="font-medium">
                    <TableCell colSpan={6} className="text-muted-foreground">Per-MVNO Subtotal</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(result.totalPerMvnoUsageCosts)}</TableCell>
                  </TableRow>
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
                    <TableHead className="w-32 text-right">List MRC</TableHead>
                    <TableHead className="w-24">Discount %</TableHead>
                    <TableHead className="w-36 text-right">Monthly MRC</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {BASE_CATEGORIES.map((cat) => (
                    <Fragment key={cat.name}>
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableCell colSpan={4} className="py-2 font-semibold text-xs uppercase tracking-wide text-muted-foreground">
                          {cat.label}
                        </TableCell>
                      </TableRow>
                      {cat.skus.map((code) => {
                        const mrc = baseMrcs[code] ?? 0
                        const disc = skuDiscounts[code] ?? 0
                        const discountedMrc = mrc * (1 - disc / 100)
                        return (
                          <TableRow key={code}>
                            <TableCell className="font-medium">{SKU_DISPLAY[code]}</TableCell>
                            <TableCell className={`text-right font-mono text-sm ${disc > 0 ? 'line-through text-muted-foreground' : 'font-medium'}`}>
                              {formatCurrency(mrc)}
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min={0}
                                max={100}
                                step={1}
                                value={disc || ''}
                                onChange={(e) => updateSkuDiscount(code, parseFloat(e.target.value) || 0)}
                                className="h-8"
                              />
                            </TableCell>
                            <TableCell className={`text-right font-mono font-medium ${disc > 0 ? 'text-green-600' : ''}`}>
                              {formatCurrency(discountedMrc)}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </Fragment>
                  ))}
                  <TableRow className="font-bold border-t-2">
                    <TableCell>Total Base Charges</TableCell>
                    <TableCell />
                    <TableCell />
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
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle>External Costs</CardTitle>
                <CardDescription>
                  Fixed monthly costs are split across MVNOs; per-GB costs are passed through directly
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={addExternalCost}>
                <Plus className="h-4 w-4 mr-1" />
                Add Item
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="w-36">Fixed &euro;/mo</TableHead>
                    <TableHead className="w-36">Per-GB &euro;/GB</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {externalCosts.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Input
                          value={item.name}
                          onChange={(e) => updateExternalCost(item.id, 'name', e.target.value)}
                          placeholder="Cost item name"
                          className="h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          value={item.fixed_monthly || ''}
                          onChange={(e) => updateExternalCost(item.id, 'fixed_monthly', parseFloat(e.target.value) || 0)}
                          className="h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          step={0.0001}
                          value={item.per_gb || ''}
                          onChange={(e) => updateExternalCost(item.id, 'per_gb', parseFloat(e.target.value) || 0)}
                          className="h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeExternalCost(item.id)}
                          className="h-8 w-8"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {externalCosts.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-4">
                        No external costs. Click "Add Item" to add one.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
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
                Fixed costs split across {capacity.num_mvnos} MVNOs + blended per-GB usage rate
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-primary/5 p-4 text-center">
                <p className="text-sm text-muted-foreground mb-1">Base MRC per MVNO</p>
                <p className="text-3xl font-bold">{formatCurrency(result.perMvnoMrc)}</p>
                <p className="text-xs text-muted-foreground mt-1">Shared fixed costs / {capacity.num_mvnos} MVNOs</p>
              </div>
              <div className="rounded-lg bg-primary/5 p-4 text-center">
                <p className="text-sm text-muted-foreground mb-1">Blended Per-GB Rate</p>
                <p className="text-3xl font-bold">{formatCurrency(result.perGbRate)}</p>
                <p className="text-xs text-muted-foreground mt-1">Usage + external per-GB over {result.estimatedGbPerMvno.toLocaleString()} GB/MVNO/mo</p>
              </div>
              <div className="rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900/40 p-4 text-center">
                <p className="text-sm text-muted-foreground mb-1">Cost per Produced GB</p>
                <p className="text-3xl font-bold text-green-700 dark:text-green-400">{formatCurrency(result.costPerProducedGb)}</p>
                <p className="text-xs text-muted-foreground mt-1">All-in: base MRC + usage amortized over {result.estimatedGbPerMvno.toLocaleString()} GB/mo</p>
              </div>
              <Separator />
              <div className="space-y-2 text-sm">
                {/* ---- Base MRC breakdown ---- */}
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Base MRC breakdown</p>
                <div className="flex justify-between font-medium">
                  <span className="text-muted-foreground">Total Fixed Pool</span>
                  <span className="font-mono">{formatCurrency(result.totalFixedPool)}</span>
                </div>
                {categoryBreakdown.map((cat) => {
                  if (cat.totalFixed === 0) return null
                  return (
                    <div key={`fixed-${cat.name}`} className="space-y-0.5">
                      <div className="flex justify-between pl-4">
                        <span className="text-muted-foreground font-medium">{cat.name}</span>
                        <span className="font-mono">{formatCurrency(cat.totalFixed)}</span>
                      </div>
                      {cat.base > 0 && (
                        <div className="flex justify-between pl-8">
                          <span className="text-muted-foreground/70 text-xs">Base charges</span>
                          <span className="font-mono text-xs text-muted-foreground">{formatCurrency(cat.base)}</span>
                        </div>
                      )}
                      {cat.shared > 0 && (
                        <div className="flex justify-between pl-8">
                          <span className="text-muted-foreground/70 text-xs">Shared usage</span>
                          <span className="font-mono text-xs text-muted-foreground">{formatCurrency(cat.shared)}</span>
                        </div>
                      )}
                      {cat.extFixed > 0 && (
                        <div className="flex justify-between pl-8">
                          <span className="text-muted-foreground/70 text-xs">Fixed monthly</span>
                          <span className="font-mono text-xs text-muted-foreground">{formatCurrency(cat.extFixed)}</span>
                        </div>
                      )}
                    </div>
                  )
                })}

                <Separator />

                {/* ---- Per-GB rate breakdown ---- */}
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Per-GB rate breakdown</p>
                <div className="flex justify-between font-medium">
                  <span className="text-muted-foreground">Per-MVNO Usage Costs</span>
                  <span className="font-mono">{formatCurrency(result.totalPerMvnoUsageCosts)}</span>
                </div>
                {categoryBreakdown.map((cat) => {
                  if (cat.totalPerMvno === 0 && cat.extPerGb === 0) return null
                  return (
                    <div key={`usage-${cat.name}`} className="space-y-0.5">
                      {cat.totalPerMvno > 0 && (
                        <div className="flex justify-between pl-4">
                          <span className="text-muted-foreground">{cat.name}</span>
                          <span className="font-mono">{formatCurrency(cat.totalPerMvno)}</span>
                        </div>
                      )}
                      {cat.extPerGb > 0 && (
                        <div className="flex justify-between pl-4">
                          <span className="text-muted-foreground">{cat.name} (per-GB)</span>
                          <span className="font-mono">{formatCurrency(cat.extPerGb)}/GB</span>
                        </div>
                      )}
                    </div>
                  )
                })}
                <div className="flex justify-between pl-4 pt-1">
                  <span className="text-muted-foreground">Est. GB per MVNO</span>
                  <span className="font-mono">{result.estimatedGbPerMvno.toLocaleString()} GB</span>
                </div>
                <div className="flex justify-between pl-4">
                  <span className="text-muted-foreground">Usage cost per GB</span>
                  <span className="font-mono">{result.estimatedGbPerMvno > 0 ? formatCurrency(result.totalPerMvnoUsageCosts / result.estimatedGbPerMvno) : '—'}/GB</span>
                </div>

                <Separator />

                <div className="flex justify-between">
                  <span className="text-muted-foreground">Est. Total Platform Cost</span>
                  <span className="font-mono font-medium">{formatCurrency(result.totalSharedCost)}</span>
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
                    <TableHead className="text-right">Cost / GB</TableHead>
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
                      <TableCell className="text-right font-mono text-green-700 dark:text-green-400">
                        {formatCurrency(row.costPerProducedGb)}
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

function formatWithSeparators(v: number): string {
  if (!v) return ''
  // Integer values: no decimals. Decimal values: preserve up to 4 digits.
  const hasDecimals = v % 1 !== 0
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: hasDecimals ? 4 : 0,
  }).format(v)
}

function parseFormatted(s: string): number {
  // Strip thousand-separator commas, keep decimal dot
  return parseFloat(s.replace(/,/g, '')) || 0
}

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
  const [focused, setFocused] = useState(false)
  const [raw, setRaw] = useState('')

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input
        type={focused ? 'text' : 'text'}
        inputMode="decimal"
        min={0}
        step={step}
        value={focused ? raw : formatWithSeparators(value)}
        onFocus={() => { setFocused(true); setRaw(value ? String(value) : '') }}
        onBlur={() => { setFocused(false); onChange(parseFormatted(raw)) }}
        onChange={(e) => { setRaw(e.target.value); onChange(parseFormatted(e.target.value)) }}
        className="h-8"
      />
    </div>
  )
}

function SkuRow({
  code,
  qty,
  model,
  disc,
  isAutoActive,
  isOverridden,
  onQtyChange,
  onDiscChange,
  onReset,
}: {
  code: string
  qty: number
  model: PricingModel | undefined
  disc: number
  isAutoActive: boolean
  isOverridden: boolean
  onQtyChange: (code: string, value: number) => void
  onDiscChange: (code: string, value: number) => void
  onReset: (code: string) => void
}) {
  const listPrice = model?.base_unit_price ?? 0
  const volPrice = model && qty > 0 ? priceFromModel(model, qty) : listPrice
  const hasVolDiscount = qty > 0 && volPrice < listPrice
  const cost = qty * volPrice * (1 - disc / 100)

  const [focused, setFocused] = useState(false)
  const [raw, setRaw] = useState('')

  return (
    <TableRow key={code}>
      <TableCell className="font-medium">{SKU_DISPLAY[code]}</TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <div className="relative flex-1">
            <Input
              type="text"
              inputMode="decimal"
              value={focused ? raw : formatWithSeparators(qty)}
              onFocus={() => { setFocused(true); setRaw(qty ? String(qty) : '') }}
              onBlur={() => { setFocused(false); onQtyChange(code, parseFormatted(raw)) }}
              onChange={(e) => { setRaw(e.target.value); onQtyChange(code, parseFormatted(e.target.value)) }}
              className={`h-8 ${isAutoActive ? 'bg-muted/50 pr-8' : ''}`}
            />
            {isAutoActive && (
              <Calculator className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
            )}
          </div>
          {isOverridden && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => onReset(code)}
              title="Reset to auto-derived value"
            >
              <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          )}
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground text-sm">
        {SKU_UNITS[code]}
      </TableCell>
      <TableCell className={`text-right font-mono text-sm ${hasVolDiscount ? 'line-through text-muted-foreground' : ''}`}>
        {formatCurrency(listPrice)}
      </TableCell>
      <TableCell className={`text-right font-mono text-sm ${hasVolDiscount ? 'text-green-600 font-medium' : ''}`}>
        {formatCurrency(volPrice)}
      </TableCell>
      <TableCell>
        <Input
          type="number"
          min={0}
          max={100}
          step={1}
          value={disc || ''}
          onChange={(e) => onDiscChange(code, parseFloat(e.target.value) || 0)}
          className="h-8"
        />
      </TableCell>
      <TableCell className={`text-right font-mono font-medium ${disc > 0 ? 'text-green-600' : ''}`}>
        {formatCurrency(cost)}
      </TableCell>
    </TableRow>
  )
}

