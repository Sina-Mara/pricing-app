import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
import { useToast } from '@/hooks/use-toast'
import { Search, Pencil, Eye, TrendingDown } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { priceFromModel, boundsFromModel } from '@/lib/pricing'
import type { PricingModel, Sku, PricingMode } from '@/types/database'

interface PricingModelWithSku extends PricingModel {
  sku?: Sku
}

export default function PricingModels() {
  const [search, setSearch] = useState('')
  const [modeFilter, setModeFilter] = useState<string>('all')
  const [selectedModel, setSelectedModel] = useState<PricingModelWithSku | null>(null)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showPreviewDialog, setShowPreviewDialog] = useState(false)
  const [editForm, setEditForm] = useState<Partial<PricingModel>>({})
  const { toast } = useToast()
  const queryClient = useQueryClient()

  // Fetch pricing models with SKU info
  const { data: models, isLoading } = useQuery({
    queryKey: ['pricing-models'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pricing_models')
        .select(`
          *,
          sku:skus(*)
        `)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data as PricingModelWithSku[]
    },
  })

  // Update pricing model
  const updateModel = useMutation({
    mutationFn: async (updates: Partial<PricingModel> & { id: string }) => {
      const { id, sku, ...data } = updates as any
      const { error } = await supabase
        .from('pricing_models')
        .update(data)
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pricing-models'] })
      setShowEditDialog(false)
      toast({ title: 'Pricing model updated' })
    },
    onError: (error) => {
      toast({ variant: 'destructive', title: 'Failed to update', description: error.message })
    },
  })

  // Filter models
  const filteredModels = models?.filter((model) => {
    const matchesSearch =
      search === '' ||
      model.sku?.code.toLowerCase().includes(search.toLowerCase()) ||
      model.sku?.description.toLowerCase().includes(search.toLowerCase())

    const matchesMode = modeFilter === 'all' || model.mode === modeFilter

    return matchesSearch && matchesMode
  })

  const openEditDialog = (model: PricingModelWithSku) => {
    setSelectedModel(model)
    setEditForm({
      base_qty: model.base_qty,
      base_unit_price: model.base_unit_price,
      per_double_discount: model.per_double_discount,
      floor_unit_price: model.floor_unit_price,
      steps: model.steps,
      mode: model.mode,
      max_qty: model.max_qty,
      breakpoints: model.breakpoints,
    })
    setShowEditDialog(true)
  }

  const openPreviewDialog = (model: PricingModelWithSku) => {
    setSelectedModel(model)
    setShowPreviewDialog(true)
  }

  const handleSave = () => {
    if (!selectedModel) return
    updateModel.mutate({ id: selectedModel.id, ...editForm })
  }

  // Generate preview tiers
  const generatePreviewTiers = (model: PricingModel) => {
    const bounds = boundsFromModel(model)
    const tiers: { qty: number; price: number }[] = []

    for (const qty of bounds) {
      tiers.push({
        qty: Math.round(qty),
        price: priceFromModel(model, qty),
      })
    }

    return tiers
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Pricing Models</h1>
        <p className="text-muted-foreground">Configure volume discount pricing for SKUs</p>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by SKU code or description..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={modeFilter} onValueChange={setModeFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Modes</SelectItem>
                <SelectItem value="smooth">Smooth</SelectItem>
                <SelectItem value="stepped">Stepped</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Models Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Pricing Models</CardTitle>
          <CardDescription>{filteredModels?.length || 0} models configured</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : filteredModels && filteredModels.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Base Qty</TableHead>
                  <TableHead>Base Price</TableHead>
                  <TableHead>Discount/Double</TableHead>
                  <TableHead>Floor Price</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="w-32">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredModels.map((model) => (
                  <TableRow key={model.id}>
                    <TableCell>
                      <div>
                        <p className="font-mono font-medium">{model.sku?.code}</p>
                        <p className="text-xs text-muted-foreground truncate max-w-xs">
                          {model.sku?.description}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={model.mode === 'smooth' ? 'default' : 'secondary'}>
                        {model.mode}
                      </Badge>
                    </TableCell>
                    <TableCell>{model.base_qty.toLocaleString()}</TableCell>
                    <TableCell>{formatCurrency(model.base_unit_price)}</TableCell>
                    <TableCell>{(model.per_double_discount * 100).toFixed(0)}%</TableCell>
                    <TableCell>{formatCurrency(model.floor_unit_price)}</TableCell>
                    <TableCell>
                      <Switch
                        checked={model.is_active}
                        onCheckedChange={(checked) =>
                          updateModel.mutate({ id: model.id, is_active: checked })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openPreviewDialog(model)}
                          title="Preview tiers"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(model)}
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex h-64 flex-col items-center justify-center text-center">
              <TrendingDown className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-lg font-medium">No pricing models found</p>
              <p className="text-muted-foreground">
                {search || modeFilter !== 'all'
                  ? 'Try adjusting your filters'
                  : 'No pricing models in the system'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Pricing Model</DialogTitle>
            <DialogDescription>
              {selectedModel?.sku?.code} - {selectedModel?.sku?.description}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="mode">Mode</Label>
                <Select
                  value={editForm.mode}
                  onValueChange={(value: PricingMode) =>
                    setEditForm({ ...editForm, mode: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="smooth">Smooth</SelectItem>
                    <SelectItem value="stepped">Stepped</SelectItem>
                    <SelectItem value="manual">Manual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="steps">Steps</Label>
                <Input
                  id="steps"
                  type="number"
                  value={editForm.steps || ''}
                  onChange={(e) =>
                    setEditForm({ ...editForm, steps: parseInt(e.target.value) || 0 })
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="base_qty">Base Quantity</Label>
                <Input
                  id="base_qty"
                  type="number"
                  value={editForm.base_qty || ''}
                  onChange={(e) =>
                    setEditForm({ ...editForm, base_qty: parseInt(e.target.value) || 0 })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="max_qty">Max Quantity</Label>
                <Input
                  id="max_qty"
                  type="number"
                  value={editForm.max_qty || ''}
                  onChange={(e) =>
                    setEditForm({ ...editForm, max_qty: parseInt(e.target.value) || 0 })
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="base_unit_price">Base Unit Price</Label>
                <Input
                  id="base_unit_price"
                  type="number"
                  step="0.01"
                  value={editForm.base_unit_price || ''}
                  onChange={(e) =>
                    setEditForm({ ...editForm, base_unit_price: parseFloat(e.target.value) || 0 })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="floor_unit_price">Floor Price</Label>
                <Input
                  id="floor_unit_price"
                  type="number"
                  step="0.01"
                  value={editForm.floor_unit_price || ''}
                  onChange={(e) =>
                    setEditForm({ ...editForm, floor_unit_price: parseFloat(e.target.value) || 0 })
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="per_double_discount">Discount per Doubling (%)</Label>
              <Input
                id="per_double_discount"
                type="number"
                step="1"
                value={editForm.per_double_discount ? editForm.per_double_discount * 100 : ''}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    per_double_discount: (parseFloat(e.target.value) || 0) / 100,
                  })
                }
              />
            </div>

            {editForm.mode === 'stepped' && (
              <div className="space-y-2">
                <Label htmlFor="breakpoints">Custom Breakpoints (comma-separated)</Label>
                <Input
                  id="breakpoints"
                  placeholder="e.g., 1, 10, 50, 100, 500"
                  value={editForm.breakpoints?.join(', ') || ''}
                  onChange={(e) => {
                    const values = e.target.value
                      .split(',')
                      .map((s) => parseInt(s.trim()))
                      .filter((n) => !isNaN(n))
                    setEditForm({ ...editForm, breakpoints: values.length > 0 ? values : null })
                  }}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={updateModel.isPending}>
              {updateModel.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Price Tier Preview</DialogTitle>
            <DialogDescription>
              {selectedModel?.sku?.code} - {selectedModel?.mode} mode
            </DialogDescription>
          </DialogHeader>

          {selectedModel && (
            <div className="py-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Unit Price</TableHead>
                    <TableHead>Discount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {generatePreviewTiers(selectedModel).map((tier, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{tier.qty.toLocaleString()}</TableCell>
                      <TableCell>{formatCurrency(tier.price)}</TableCell>
                      <TableCell>
                        {selectedModel.base_unit_price > 0
                          ? `${((1 - tier.price / selectedModel.base_unit_price) * 100).toFixed(0)}%`
                          : '0%'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreviewDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
