import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { Pencil, FileStack } from 'lucide-react'
import type { PerpetualConfig } from '@/types/database'

// Format parameter names for display
const parameterLabels: Record<string, string> = {
  compensation_term_months: 'Compensation Term (Months)',
  maintenance_reduction_factor: 'Maintenance Reduction Factor',
  maintenance_term_years: 'Maintenance Term (Years)',
  upgrade_protection_percent: 'Upgrade Protection %',
  maintenance_percent_cas: 'Maintenance % (CAS)',
  maintenance_percent_cno: 'Maintenance % (CNO)',
  maintenance_percent_default: 'Maintenance % (Default)',
  exclude_cno_from_perpetual: 'Exclude CNO from Perpetual',
}

const parameterHelp: Record<string, string> = {
  compensation_term_months: 'Number of months of subscription pricing used to calculate the perpetual license value',
  maintenance_reduction_factor: 'Factor to extract license-only price from subscription (e.g., 0.7 means 70% of subscription is license)',
  maintenance_term_years: 'Number of years of maintenance included with perpetual license',
  upgrade_protection_percent: 'Upgrade protection fee as percentage of perpetual license',
  maintenance_percent_cas: 'Annual maintenance percentage for CAS category SKUs',
  maintenance_percent_cno: 'Annual maintenance percentage for CNO category SKUs',
  maintenance_percent_default: 'Default annual maintenance percentage for other SKUs',
  exclude_cno_from_perpetual: 'Set to 1 to exclude CNO SKUs from perpetual model (subscription only)',
}

export default function PerpetualConfigPage() {
  const [showDialog, setShowDialog] = useState(false)
  const [editingConfig, setEditingConfig] = useState<PerpetualConfig | null>(null)
  const [editValue, setEditValue] = useState<number>(0)
  const { toast } = useToast()
  const queryClient = useQueryClient()

  // Fetch perpetual config
  const { data: configs, isLoading } = useQuery({
    queryKey: ['perpetual-config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('perpetual_config')
        .select('*')
        .order('parameter')

      if (error) throw error
      return data as PerpetualConfig[]
    },
  })

  // Update config
  const updateConfig = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: number }) => {
      const { error } = await supabase
        .from('perpetual_config')
        .update({ value })
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['perpetual-config'] })
      setShowDialog(false)
      toast({ title: 'Configuration updated' })
    },
    onError: (error) => {
      toast({ variant: 'destructive', title: 'Failed to update', description: error.message })
    },
  })

  const openEditDialog = (config: PerpetualConfig) => {
    setEditingConfig(config)
    setEditValue(config.value)
    setShowDialog(true)
  }

  const handleSave = () => {
    if (!editingConfig) return
    updateConfig.mutate({ id: editingConfig.id, value: editValue })
  }

  const formatValue = (param: string, value: number) => {
    if (param.includes('percent')) return `${value}%`
    if (param === 'maintenance_reduction_factor') return value.toFixed(2)
    if (param === 'exclude_cno_from_perpetual') return value > 0 ? 'Yes' : 'No'
    return value.toString()
  }

  // Calculate example perpetual pricing
  const getExamplePricing = () => {
    if (!configs) return null

    const getConfigValue = (param: string) => {
      const config = configs.find(c => c.parameter === param)
      return config?.value ?? 0
    }

    const monthlySubscription = 100 // Example: 100/month subscription
    const quantity = 10
    const compensationTerm = getConfigValue('compensation_term_months')
    const reductionFactor = getConfigValue('maintenance_reduction_factor')
    const maintenanceYears = getConfigValue('maintenance_term_years')
    const upgradePercent = getConfigValue('upgrade_protection_percent')
    const maintenancePercent = getConfigValue('maintenance_percent_default')

    const licenseOnly = monthlySubscription * reductionFactor
    const perpetualLicense = licenseOnly * quantity * compensationTerm
    const annualMaintenance = perpetualLicense * (maintenancePercent / 100)
    const totalMaintenance = annualMaintenance * maintenanceYears
    const upgradeProtection = perpetualLicense * (upgradePercent / 100)
    const totalPerpetual = perpetualLicense + totalMaintenance + upgradeProtection

    return {
      monthlySubscription,
      quantity,
      licenseOnly,
      perpetualLicense,
      annualMaintenance,
      totalMaintenance,
      upgradeProtection,
      totalPerpetual,
    }
  }

  const example = getExamplePricing()

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Perpetual License Configuration</h1>
        <p className="text-muted-foreground">
          Configure parameters for perpetual license pricing calculations
        </p>
      </div>

      {/* Config Table */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Configuration Parameters</CardTitle>
          <CardDescription>
            These parameters control how perpetual license prices are calculated from subscription prices
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex h-32 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : configs && configs.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Parameter</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead className="max-w-md">Description</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {configs.map((config) => (
                  <TableRow key={config.id}>
                    <TableCell className="font-medium">
                      {parameterLabels[config.parameter] || config.parameter}
                    </TableCell>
                    <TableCell className="font-mono">
                      {formatValue(config.parameter, config.value)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm max-w-md">
                      {parameterHelp[config.parameter] || config.description}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(config)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex h-32 flex-col items-center justify-center text-center">
              <FileStack className="mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-muted-foreground">No configuration found</p>
              <p className="text-xs text-muted-foreground">
                Run the database migration to create default values
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Example Calculation */}
      {example && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Example Calculation</CardTitle>
            <CardDescription>
              Based on current configuration values
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-muted p-4 rounded-lg font-mono text-sm space-y-2">
              <p className="text-muted-foreground">
                Input: {example.quantity} units @ {example.monthlySubscription}/month subscription
              </p>
              <div className="border-t border-border pt-2 mt-2">
                <p>License-only price: {example.monthlySubscription} x {configs?.find(c => c.parameter === 'maintenance_reduction_factor')?.value} = {example.licenseOnly.toFixed(2)}/month</p>
                <p>Perpetual license: {example.licenseOnly.toFixed(2)} x {example.quantity} x {configs?.find(c => c.parameter === 'compensation_term_months')?.value} = {example.perpetualLicense.toFixed(2)}</p>
                <p>Annual maintenance: {example.perpetualLicense.toFixed(2)} x {configs?.find(c => c.parameter === 'maintenance_percent_default')?.value}% = {example.annualMaintenance.toFixed(2)}</p>
                <p>Total maintenance ({configs?.find(c => c.parameter === 'maintenance_term_years')?.value} years): {example.totalMaintenance.toFixed(2)}</p>
                <p>Upgrade protection: {example.perpetualLicense.toFixed(2)} x {configs?.find(c => c.parameter === 'upgrade_protection_percent')?.value}% = {example.upgradeProtection.toFixed(2)}</p>
              </div>
              <div className="border-t border-border pt-2 mt-2 font-bold">
                <p>Total Perpetual Cost: {example.totalPerpetual.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Configuration</DialogTitle>
            <DialogDescription>
              {editingConfig && (parameterLabels[editingConfig.parameter] || editingConfig.parameter)}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="value">Value</Label>
              <Input
                id="value"
                type="number"
                step={editingConfig?.parameter.includes('factor') ? '0.01' : '1'}
                value={editValue}
                onChange={(e) => setEditValue(parseFloat(e.target.value) || 0)}
              />
              {editingConfig && (
                <p className="text-xs text-muted-foreground">
                  {parameterHelp[editingConfig.parameter]}
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={updateConfig.isPending}>
              {updateConfig.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
