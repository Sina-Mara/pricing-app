import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Map, Plus, Trash2, Settings2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
import type { ForecastSkuMapping, Sku, ForecastKpiType } from '@/types/database'

const KPI_TYPES: { value: ForecastKpiType; label: string; description: string }[] = [
  { value: 'udr', label: 'UDR', description: 'User Data Records (Total SIMs)' },
  { value: 'pcs', label: 'PCS', description: 'Packet Control Sessions (Concurrent Users)' },
  { value: 'ccs', label: 'CCS', description: 'Control Channel Sessions (Active Users Total)' },
  { value: 'scs', label: 'SCS', description: 'Session Control Sessions (Data Sessions)' },
  { value: 'cos', label: 'CoS', description: 'Concurrent Sessions (Gateway)' },
  { value: 'peak_throughput', label: 'Peak Throughput', description: 'Peak throughput in Gbit/s' },
  { value: 'avg_throughput', label: 'Avg Throughput', description: 'Average throughput in Gbit/s' },
]

export default function ForecastMapping() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedMapping, setSelectedMapping] = useState<ForecastSkuMapping | null>(null)

  // Form state
  const [formData, setFormData] = useState({
    kpi_type: '' as ForecastKpiType | '',
    sku_id: '',
    multiplier: 1,
    is_active: true,
    notes: '',
  })

  // Fetch mappings
  const { data: mappings = [], isLoading } = useQuery({
    queryKey: ['forecast-sku-mappings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('forecast_sku_mappings')
        .select('*, sku:skus(*)')
        .order('kpi_type')
        .order('sort_order')
      if (error) throw error
      return data as (ForecastSkuMapping & { sku: Sku })[]
    }
  })

  // Fetch SKUs
  const { data: skus = [] } = useQuery({
    queryKey: ['skus'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('skus')
        .select('*')
        .eq('is_active', true)
        .order('code')
      if (error) throw error
      return data as Sku[]
    }
  })

  // Create/Update mapping
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!formData.kpi_type || !formData.sku_id) {
        throw new Error('KPI type and SKU are required')
      }

      const mappingData = {
        kpi_type: formData.kpi_type,
        sku_id: formData.sku_id,
        multiplier: formData.multiplier,
        is_active: formData.is_active,
        notes: formData.notes || null,
        sort_order: selectedMapping?.sort_order || mappings.filter(m => m.kpi_type === formData.kpi_type).length,
      }

      if (selectedMapping) {
        const { error } = await supabase
          .from('forecast_sku_mappings')
          .update(mappingData)
          .eq('id', selectedMapping.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('forecast_sku_mappings')
          .insert(mappingData)
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forecast-sku-mappings'] })
      setDialogOpen(false)
      resetForm()
      toast({
        title: selectedMapping ? 'Mapping updated' : 'Mapping created',
        description: 'The forecast-to-SKU mapping has been saved.',
      })
    },
    onError: (error) => {
      toast({
        title: 'Error saving mapping',
        description: error.message,
        variant: 'destructive',
      })
    }
  })

  // Delete mapping
  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!selectedMapping) throw new Error('No mapping selected')
      const { error } = await supabase
        .from('forecast_sku_mappings')
        .delete()
        .eq('id', selectedMapping.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forecast-sku-mappings'] })
      setDeleteDialogOpen(false)
      setSelectedMapping(null)
      toast({
        title: 'Mapping deleted',
        description: 'The mapping has been removed.',
      })
    },
    onError: (error) => {
      toast({
        title: 'Error deleting mapping',
        description: error.message,
        variant: 'destructive',
      })
    }
  })

  // Toggle active status
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('forecast_sku_mappings')
        .update({ is_active })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forecast-sku-mappings'] })
    }
  })

  const resetForm = () => {
    setFormData({
      kpi_type: '',
      sku_id: '',
      multiplier: 1,
      is_active: true,
      notes: '',
    })
    setSelectedMapping(null)
  }

  const handleEdit = (mapping: ForecastSkuMapping & { sku: Sku }) => {
    setSelectedMapping(mapping)
    setFormData({
      kpi_type: mapping.kpi_type,
      sku_id: mapping.sku_id,
      multiplier: mapping.multiplier,
      is_active: mapping.is_active,
      notes: mapping.notes || '',
    })
    setDialogOpen(true)
  }

  const handleDelete = (mapping: ForecastSkuMapping & { sku: Sku }) => {
    setSelectedMapping(mapping)
    setDeleteDialogOpen(true)
  }

  // Group mappings by KPI type
  const groupedMappings = KPI_TYPES.map(kpiType => ({
    ...kpiType,
    mappings: mappings.filter(m => m.kpi_type === kpiType.value)
  }))

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Forecast SKU Mapping</h1>
          <p className="text-muted-foreground">
            Configure how forecast KPIs map to SKUs for automatic quote generation
          </p>
        </div>
        <Button onClick={() => { resetForm(); setDialogOpen(true) }}>
          <Plus className="mr-2 h-4 w-4" />
          Add Mapping
        </Button>
      </div>

      {/* Info Card */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Settings2 className="h-5 w-5 text-blue-500 mt-0.5" />
            <div className="space-y-1">
              <p className="font-medium">How it works</p>
              <p className="text-sm text-muted-foreground">
                When creating a quote from a forecast, the system uses these mappings to automatically
                populate line items. Each KPI value from the forecast is multiplied by the configured
                multiplier and assigned to the corresponding SKU.
              </p>
              <p className="text-sm text-muted-foreground">
                For example: If UDR = 100,000 and you map UDR to "TISP-AAA-UDR" with multiplier 1.0,
                the quote will include 100,000 units of TISP-AAA-UDR.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Mappings by KPI Type */}
      <div className="space-y-6">
        {groupedMappings.map((group) => (
          <Card key={group.value}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Map className="h-5 w-5" />
                    {group.label}
                    <Badge variant="outline" className="ml-2">
                      {group.mappings.length} mapping{group.mappings.length !== 1 ? 's' : ''}
                    </Badge>
                  </CardTitle>
                  <CardDescription>{group.description}</CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    resetForm()
                    setFormData(prev => ({ ...prev, kpi_type: group.value }))
                    setDialogOpen(true)
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {group.mappings.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead>Multiplier</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead className="text-center">Active</TableHead>
                      <TableHead className="w-24">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.mappings.map((mapping) => (
                      <TableRow key={mapping.id}>
                        <TableCell>
                          <div>
                            <div className="font-mono text-sm">{mapping.sku?.code}</div>
                            <div className="text-sm text-muted-foreground">
                              {mapping.sku?.description}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            x{mapping.multiplier}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {mapping.notes || '-'}
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch
                            checked={mapping.is_active}
                            onCheckedChange={(checked) =>
                              toggleActiveMutation.mutate({ id: mapping.id, is_active: checked })
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(mapping)}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(mapping)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex h-20 items-center justify-center rounded-lg border-2 border-dashed">
                  <p className="text-muted-foreground">
                    No mappings configured for {group.label}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedMapping ? 'Edit Mapping' : 'Add Mapping'}
            </DialogTitle>
            <DialogDescription>
              Configure how a forecast KPI maps to a SKU
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>KPI Type</Label>
              <Select
                value={formData.kpi_type}
                onValueChange={(v) => setFormData(prev => ({ ...prev, kpi_type: v as ForecastKpiType }))}
                disabled={!!selectedMapping}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select KPI type" />
                </SelectTrigger>
                <SelectContent>
                  {KPI_TYPES.map((kpi) => (
                    <SelectItem key={kpi.value} value={kpi.value}>
                      <div className="flex flex-col">
                        <span>{kpi.label}</span>
                        <span className="text-xs text-muted-foreground">{kpi.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>SKU</Label>
              <Select
                value={formData.sku_id}
                onValueChange={(v) => setFormData(prev => ({ ...prev, sku_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select SKU" />
                </SelectTrigger>
                <SelectContent>
                  {skus.map((sku) => (
                    <SelectItem key={sku.id} value={sku.id}>
                      <span className="font-mono">{sku.code}</span>
                      <span className="text-muted-foreground ml-2">- {sku.description}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="multiplier">Multiplier</Label>
              <Input
                id="multiplier"
                type="number"
                step="0.01"
                min="0"
                value={formData.multiplier}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  multiplier: parseFloat(e.target.value) || 0
                }))}
              />
              <p className="text-xs text-muted-foreground">
                The KPI value will be multiplied by this factor. Use 1.0 for direct mapping.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Input
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="e.g., Standard pricing tier"
              />
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
              />
              <Label htmlFor="is_active">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!formData.kpi_type || !formData.sku_id || saveMutation.isPending}
            >
              {saveMutation.isPending ? 'Saving...' : 'Save Mapping'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Mapping?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the mapping for{' '}
              <strong>{selectedMapping?.sku?.code}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
