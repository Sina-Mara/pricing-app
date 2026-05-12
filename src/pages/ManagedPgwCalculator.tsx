import React, { useState, useMemo, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Link } from 'react-router-dom'
import { Save, FolderOpen, Trash2, Plus, ChevronDown, ChevronRight, Download, Copy } from 'lucide-react'
import { CAS_REFERENCE_BASE_RATIO } from '@/lib/managed-pgw-calculator'
import type { ManagedPgwTopologyInputs, ManagedPgwExternalCostItem } from '@/types/database'
import {
  calculateManagedPgwTiers,
  createDefaultTopologyInputs,
  createDefaultExternalCosts,
  migrateTopologyInputs,
  MANAGED_PGW_TIERS,
} from '@/lib/managed-pgw-calculator'
import {
  useManagedPgwConfigs,
  useManagedPgwSaveConfig,
  useManagedPgwDeleteConfig,
  useManagedPgwSkuData,
  useCnsPoolShare,
} from '@/hooks/useManagedPgwCalculator'

// ============================================================================
// HELPERS
// ============================================================================

function fmt4(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
}

function fmtSau(n: number): string {
  if (n >= 1_000_000) return `${n / 1_000_000}M`
  if (n >= 1_000) return `${n / 1_000}k`
  return String(n)
}

// ============================================================================
// TOPOLOGY INPUT PANEL
// ============================================================================

interface TopologyInputsProps {
  inputs: ManagedPgwTopologyInputs
  onChange: (inputs: ManagedPgwTopologyInputs) => void
}

function TopologyInputs({ inputs, onChange }: TopologyInputsProps) {
  const set = useCallback(
    (field: keyof ManagedPgwTopologyInputs, raw: string) => {
      const val = raw === '' ? 0 : parseFloat(raw)
      if (!isNaN(val)) onChange({ ...inputs, [field]: val })
    },
    [inputs, onChange]
  )

  const fields: { key: keyof ManagedPgwTopologyInputs; label: string; help?: string }[] = [
    { key: 'num_sites',            label: 'Sites' },
    { key: 'vcores_per_site',      label: 'vCores / Site' },
    { key: 'nodes_per_cno_site',   label: 'CNO Nodes / Site' },
    { key: 'cno_db_instances',     label: 'CNO DB Instances' },
    { key: 'tier10_sau_cap',       label: 'Tier 10 SAU Cap', help: 'Max SAU for the 5M+ tier' },
    { key: 'rp_value',             label: 'RP Value (€)', help: 'Realisierungsprojekt total — CCS maintenance = 10% p.a.' },
    { key: 'gb_per_sau_per_month', label: 'GB / SAU / month', help: 'Expected data volume per connection; blended into per-SAU price' },
  ]

  const casRatioPct = Math.round((inputs.cas_ratio ?? CAS_REFERENCE_BASE_RATIO) * 100)

  return (
    <div className="space-y-3">
      {fields.map(({ key, label, help }) => (
        <div key={key}>
          <Label className="text-xs text-muted-foreground">{label}</Label>
          {help && <p className="text-xs text-muted-foreground/70 mb-1">{help}</p>}
          <Input
            type="number"
            min={0}
            value={inputs[key]}
            onChange={(e) => set(key, e.target.value)}
            className="h-8 text-sm"
          />
        </div>
      ))}

      <Separator />

      <div>
        <div className="flex items-center justify-between mb-1">
          <Label className="text-xs text-muted-foreground">CAS Base / Usage Ratio</Label>
          <span className="text-xs font-mono text-muted-foreground">{casRatioPct}% / {100 - casRatioPct}%</span>
        </div>
        <input
          type="range"
          min={10}
          max={90}
          step={5}
          value={casRatioPct}
          onChange={(e) => onChange({ ...inputs, cas_ratio: parseInt(e.target.value) / 100 })}
          className="w-full h-2 accent-primary cursor-pointer"
        />
        <div className="flex justify-between text-xs text-muted-foreground/60 mt-0.5">
          <span>10% base</span>
          <span className="text-muted-foreground/40">ref: 60%</span>
          <span>90% base</span>
        </div>
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">Commitment Length</Label>
        <div className="flex gap-1 mt-1">
          {([1, 12, 24, 36, 48] as const).map((mo) => (
            <button
              key={mo}
              onClick={() => onChange({ ...inputs, commitment_months: mo })}
              className={`flex-1 h-8 rounded text-xs font-medium border transition-colors ${
                inputs.commitment_months === mo
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background border-input text-muted-foreground hover:bg-muted'
              }`}
            >
              {mo === 1 ? 'Mo' : `${mo / 12}yr`}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// EXTERNAL COSTS PANEL
// ============================================================================

interface ExternalCostsProps {
  costs: ManagedPgwExternalCostItem[]
  onChange: (costs: ManagedPgwExternalCostItem[]) => void
}

let _nextId = 100
function nextExtId(): string { return `ext_${_nextId++}` }

function ExternalCosts({ costs, onChange }: ExternalCostsProps) {
  const updateItem = (id: string, field: 'name' | 'fixed_monthly' | 'per_gb', value: string) => {
    onChange(costs.map((c) =>
      c.id === id
        ? { ...c, [field]: field === 'name' ? value : (parseFloat(value) || 0) }
        : c
    ))
  }
  const addItem = () => onChange([...costs, { id: nextExtId(), name: '', fixed_monthly: 0, per_gb: 0 }])
  const removeItem = (id: string) => onChange(costs.filter((c) => c.id !== id))

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_5rem_4.5rem_1.75rem] gap-1 text-xs text-muted-foreground/60 px-0.5">
        <span>Description</span><span className="text-right">€/mo</span><span className="text-right">€/GB</span><span/>
      </div>
      {costs.map((item) => (
        <div key={item.id} className="grid grid-cols-[1fr_5rem_4.5rem_1.75rem] gap-1 items-center">
          <Input
            className="h-7 text-xs"
            placeholder="Description"
            value={item.name}
            onChange={(e) => updateItem(item.id, 'name', e.target.value)}
          />
          <Input
            type="number" min={0}
            className="h-7 text-xs"
            placeholder="0.00"
            value={item.fixed_monthly || ''}
            onChange={(e) => updateItem(item.id, 'fixed_monthly', e.target.value)}
          />
          <Input
            type="number" min={0} step={0.001}
            className="h-7 text-xs"
            placeholder="0.000"
            value={item.per_gb || ''}
            onChange={(e) => updateItem(item.id, 'per_gb', e.target.value)}
          />
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeItem(item.id)}>
            <Trash2 className="h-3 w-3 text-destructive" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" className="h-7 text-xs w-full" onClick={addItem}>
        <Plus className="h-3 w-3 mr-1" /> Add cost item
      </Button>
    </div>
  )
}

// ============================================================================
// BREAKDOWN ROW
// ============================================================================

function TierBreakdownRow({ tierRow }: { tierRow: ReturnType<typeof calculateManagedPgwTiers>['tiers'][0] }) {
  return (
    <div className="px-4 py-3 bg-muted/30 text-xs space-y-1">
      <p className="font-medium text-muted-foreground mb-2">
        Cost breakdown — Tier {tierRow.tier} (at {fmtSau(tierRow.maxSau)} SAU)
      </p>
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-1">
        <span className="text-muted-foreground/70 font-medium">Component</span>
        <span className="text-muted-foreground/70 font-medium text-right">Qty</span>
        <span className="text-muted-foreground/70 font-medium text-right">Cost/mo</span>
        {tierRow.breakdown.map((item) => (
          item.cost > 0 && (
            <React.Fragment key={item.skuCode}>
              <span className="text-muted-foreground">{item.label}</span>
              <span className="text-right text-muted-foreground">
                {item.quantity != null ? item.quantity.toLocaleString() : '—'}
              </span>
              {item.isShared && item.fullCost != null && item.sharePct != null ? (
                <span className="text-right text-muted-foreground">
                  €{item.fullCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  {' × '}
                  {(item.sharePct * 100).toFixed(2)}%
                  {' = '}
                  <span className="text-foreground">€{item.cost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                </span>
              ) : (
                <span className="text-right">€{item.cost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
              )}
            </React.Fragment>
          )
        ))}
        <Separator className="col-span-3 my-1" />
        <span className="font-semibold">Total</span>
        <span />
        <span className="text-right font-semibold">€{tierRow.totalMonthlyCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
      </div>
    </div>
  )
}

// ============================================================================
// SAVE / LOAD DIALOG
// ============================================================================

interface SaveLoadDialogProps {
  open: boolean
  onClose: () => void
  topology: ManagedPgwTopologyInputs
  externalCosts: ManagedPgwExternalCostItem[]
  onLoad: (topology: ManagedPgwTopologyInputs, external: ManagedPgwExternalCostItem[]) => void
}

function SaveLoadDialog({ open, onClose, topology, externalCosts, onLoad }: SaveLoadDialogProps) {
  const [saveName, setSaveName] = useState('')
  const [saveDesc, setSaveDesc] = useState('')
  const { configs, loading, refetch } = useManagedPgwConfigs()
  const { saveConfig, saving } = useManagedPgwSaveConfig()
  const { deleteConfig } = useManagedPgwDeleteConfig()
  const { toast } = useToast()

  const handleSave = async () => {
    if (!saveName.trim()) return
    try {
      await saveConfig({ name: saveName, description: saveDesc, topology_inputs: topology, external_costs: externalCosts })
      toast({ title: 'Config saved' })
      setSaveName('')
      setSaveDesc('')
      refetch()
    } catch {
      toast({ title: 'Save failed', variant: 'destructive' })
    }
  }

  const handleLoad = (config: typeof configs[0] & { topology_inputs?: Record<string, unknown>; external_costs?: ManagedPgwExternalCostItem[] }) => {
    if (config.topology_inputs) onLoad(migrateTopologyInputs(config.topology_inputs), config.external_costs ?? [])
    toast({ title: `Loaded "${config.name}"` })
    onClose()
  }

  const handleDelete = async (id: string, name: string) => {
    await deleteConfig(id)
    toast({ title: `Deleted "${name}"` })
    refetch()
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Save / Load Configuration</DialogTitle>
          <DialogDescription>Save current inputs or load a previous configuration.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Config name</Label>
            <Input className="h-8 text-sm mt-1" value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="e.g. Vodafone RFP v1" />
          </div>
          <div>
            <Label className="text-xs">Description (optional)</Label>
            <Input className="h-8 text-sm mt-1" value={saveDesc} onChange={(e) => setSaveDesc(e.target.value)} />
          </div>
          <Button size="sm" onClick={handleSave} disabled={!saveName.trim() || saving}>
            <Save className="h-4 w-4 mr-2" />{saving ? 'Saving…' : 'Save'}
          </Button>
        </div>

        <Separator className="my-2" />

        <div className="space-y-2 max-h-60 overflow-y-auto">
          {loading && <p className="text-xs text-muted-foreground">Loading…</p>}
          {!loading && configs.length === 0 && (
            <p className="text-xs text-muted-foreground">No saved configurations.</p>
          )}
          {configs.map((cfg) => (
            <div key={cfg.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
              <div>
                <p className="font-medium">{cfg.name}</p>
                {cfg.description && <p className="text-xs text-muted-foreground">{cfg.description}</p>}
              </div>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleLoad(cfg as Parameters<typeof handleLoad>[0])}>
                  Load
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(cfg.id, cfg.name)}>
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function ManagedPgwCalculator() {
  const [topology, setTopology] = useState<ManagedPgwTopologyInputs>(createDefaultTopologyInputs)
  const [externalCosts, setExternalCosts] = useState<ManagedPgwExternalCostItem[]>(createDefaultExternalCosts)
  const [expandedTier, setExpandedTier] = useState<number | null>(null)
  const [showSaveLoad, setShowSaveLoad] = useState(false)
  const [exampleSau, setExampleSau] = useState<string>('')
  const { skuPricingModels, baseCharges, termFactors, loading: skuLoading } = useManagedPgwSkuData()
  const { sharePct, thisCustomer } = useCnsPoolShare()
  const { toast } = useToast()

  const result = useMemo(() => {
    if (skuLoading) return null
    return calculateManagedPgwTiers(topology, skuPricingModels, baseCharges, externalCosts, termFactors, sharePct)
  }, [topology, externalCosts, skuPricingModels, baseCharges, termFactors, skuLoading, sharePct])

  const matchedTier = useMemo(() => {
    const sau = parseFloat(exampleSau.replace(/[^0-9.]/g, ''))
    if (!result || isNaN(sau) || sau <= 0) return null
    return result.tiers.find((t) => sau <= t.maxSau) ?? result.tiers[result.tiers.length - 1]
  }, [exampleSau, result])

  const toggleBreakdown = (tier: number) =>
    setExpandedTier((prev) => (prev === tier ? null : tier))

  // ---- Export helpers ----

  const buildCsvRows = useCallback(() => {
    if (!result) return ''
    const header = ['Tier', 'SAU Range', 'Peak Throughput (Gbps)', 'Y1 €/SAU/mo', 'Y2 €/SAU/mo', 'Y3 €/SAU/mo', 'Y4 €/SAU/mo', 'Y5 €/SAU/mo'].join(',')
    const rows = result.tiers.map((t, i) => {
      const tierDef = MANAGED_PGW_TIERS[i]
      return [
        `Tier ${t.tier}`,
        tierDef.label,
        t.throughputGbps,
        ...t.unitPrices.map((p) => p.toFixed(4)),
      ].join(',')
    })
    return [header, ...rows].join('\n')
  }, [result])

  const handleCopy = useCallback(async () => {
    if (!result) return
    const rows = result.tiers.map((t, i) => {
      const tierDef = MANAGED_PGW_TIERS[i]
      return [
        `Tier ${t.tier}`,
        tierDef.label,
        `${t.throughputGbps} Gbps`,
        ...t.unitPrices.map((p) => p.toFixed(4)),
      ].join('\t')
    })
    const text = ['Tier\tSAU Range\tThroughput\tY1\tY2\tY3\tY4\tY5', ...rows].join('\n')
    await navigator.clipboard.writeText(text)
    toast({ title: 'Copied to clipboard' })
  }, [result, toast])

  const handleDownloadCsv = useCallback(() => {
    const csv = buildCsvRows()
    if (!csv) return
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'managed-pgw-saas-fees.csv'
    a.click()
    URL.revokeObjectURL(url)
  }, [buildCsvRows])

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Managed Service Calculator</h1>
            {thisCustomer && (
              <Link
                to="/admin/cns-pool"
                className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
              >
                Your share: {(sharePct * 100).toFixed(2)}% ({thisCustomer.name})
              </Link>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Per-SAU/month price schedule across 10 tiers with annual price erosion
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowSaveLoad(true)}>
            <FolderOpen className="h-4 w-4 mr-2" /> Save / Load
          </Button>
          {result && (
            <>
              <Button variant="outline" size="sm" onClick={handleCopy}>
                <Copy className="h-4 w-4 mr-2" /> Copy
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownloadCsv}>
                <Download className="h-4 w-4 mr-2" /> CSV
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        {/* ---- Left: Inputs ---- */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Platform Topology</CardTitle>
            </CardHeader>
            <CardContent>
              <TopologyInputs inputs={topology} onChange={setTopology} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">External Infrastructure Costs</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">
                Fixed monthly costs not in the SKU catalog (e.g. VMs, IPs). Spread across all tiers.
              </p>
              <ExternalCosts costs={externalCosts} onChange={setExternalCosts} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Example Calculation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">Expected SAU count</Label>
                <Input
                  type="number"
                  min={1}
                  placeholder="e.g. 1200000"
                  value={exampleSau}
                  onChange={(e) => setExampleSau(e.target.value)}
                  className="h-8 text-sm mt-1"
                />
              </div>
              {matchedTier && (
                <div className="rounded-md bg-muted/40 px-3 py-2 space-y-1.5">
                  <p className="text-xs font-medium">
                    Tier {matchedTier.tier} — {MANAGED_PGW_TIERS[matchedTier.tier - 1].label}
                  </p>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                    {matchedTier.unitPrices.map((price, yi) => {
                      const monthly = price * parseFloat(exampleSau)
                      return (
                        <React.Fragment key={yi}>
                          <span className="text-xs text-muted-foreground">Y{yi + 1}</span>
                          <span className="text-xs font-mono text-right">
                            €{Math.round(monthly).toLocaleString('en-US')}/mo
                          </span>
                        </React.Fragment>
                      )
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ---- Right: Output ---- */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">SaaS Fees — Tier Price Schedule</CardTitle>
            <p className="text-xs text-muted-foreground">
              EUR per licensed connection (SAU) per month. 6% annual erosion from Year 2.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {skuLoading && (
              <p className="text-sm text-muted-foreground px-4 py-6">Loading SKU pricing…</p>
            )}
            {!skuLoading && result && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">Tier</TableHead>
                      <TableHead>SAU Range</TableHead>
                      <TableHead className="text-right">Throughput</TableHead>
                      <TableHead className="text-right">Y1 (€/SAU/mo)</TableHead>
                      <TableHead className="text-right">Y2</TableHead>
                      <TableHead className="text-right">Y3</TableHead>
                      <TableHead className="text-right">Y4</TableHead>
                      <TableHead className="text-right">Y5</TableHead>
                      <TableHead className="w-8" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.tiers.map((tierRow, i) => {
                      const tierDef = MANAGED_PGW_TIERS[i]
                      const isExpanded = expandedTier === tierRow.tier
                      const isMatched = matchedTier?.tier === tierRow.tier
                      return (
                        <React.Fragment key={tierRow.tier}>
                          <TableRow
                            className={`cursor-pointer ${isMatched ? 'bg-primary/10 hover:bg-primary/15' : 'hover:bg-muted/50'}`}
                            onClick={() => toggleBreakdown(tierRow.tier)}
                          >
                            <TableCell className="font-medium">Tier {tierRow.tier}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">{tierDef.label}</TableCell>
                            <TableCell className="text-right text-sm text-muted-foreground">
                              {tierRow.throughputGbps} Gbps
                            </TableCell>
                            {tierRow.unitPrices.map((price, yi) => (
                              <TableCell key={yi} className="text-right font-mono text-sm">
                                {fmt4(price)}
                              </TableCell>
                            ))}
                            <TableCell className="text-right">
                              {isExpanded
                                ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              }
                            </TableCell>
                          </TableRow>
                          {isExpanded && (
                            <TableRow>
                              <TableCell colSpan={9} className="p-0">
                                <TierBreakdownRow tierRow={tierRow} />
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <SaveLoadDialog
        open={showSaveLoad}
        onClose={() => setShowSaveLoad(false)}
        topology={topology}
        externalCosts={externalCosts}
        onLoad={(t, e) => { setTopology(t); setExternalCosts(e) }}
      />
    </div>
  )
}
