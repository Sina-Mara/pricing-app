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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { Search, Pencil, DollarSign } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import type { BaseCharge, Sku, SkuCategory } from '@/types/database'

interface BaseChargeWithSku extends BaseCharge {
  sku?: Sku
}

const categoryColors: Record<SkuCategory, string> = {
  default: 'bg-gray-100 text-gray-800',
  cas: 'bg-blue-100 text-blue-800',
  cno: 'bg-green-100 text-green-800',
  ccs: 'bg-purple-100 text-purple-800',
}

export default function BaseCharges() {
  const [search, setSearch] = useState('')
  const [showDialog, setShowDialog] = useState(false)
  const [editingCharge, setEditingCharge] = useState<BaseChargeWithSku | null>(null)
  const [formData, setFormData] = useState({ base_mrc: 0, apply_term_discount: true })
  const { toast } = useToast()
  const queryClient = useQueryClient()

  // Fetch base charges with SKU info
  const { data: charges, isLoading } = useQuery({
    queryKey: ['base-charges'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('base_charges')
        .select('*, sku:skus(*)')
        .order('created_at', { ascending: false })

      if (error) throw error
      return data as BaseChargeWithSku[]
    },
  })

  // Update base charge
  const updateCharge = useMutation({
    mutationFn: async ({ id, base_mrc, apply_term_discount }: { id: string; base_mrc: number; apply_term_discount: boolean }) => {
      const { error } = await supabase
        .from('base_charges')
        .update({ base_mrc, apply_term_discount })
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['base-charges'] })
      setShowDialog(false)
      toast({ title: 'Base charge updated' })
    },
    onError: (error) => {
      toast({ variant: 'destructive', title: 'Failed to update', description: error.message })
    },
  })

  // Toggle term discount
  const toggleTermDiscount = useMutation({
    mutationFn: async ({ id, apply_term_discount }: { id: string; apply_term_discount: boolean }) => {
      const { error } = await supabase
        .from('base_charges')
        .update({ apply_term_discount })
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['base-charges'] })
    },
    onError: (error) => {
      toast({ variant: 'destructive', title: 'Failed to update', description: error.message })
    },
  })

  // Filter charges
  const filteredCharges = charges?.filter((charge) => {
    const matchesSearch =
      search === '' ||
      charge.sku?.code.toLowerCase().includes(search.toLowerCase()) ||
      charge.sku?.description.toLowerCase().includes(search.toLowerCase())

    return matchesSearch
  })

  const openEditDialog = (charge: BaseChargeWithSku) => {
    setEditingCharge(charge)
    setFormData({
      base_mrc: charge.base_mrc,
      apply_term_discount: charge.apply_term_discount,
    })
    setShowDialog(true)
  }

  const handleSave = () => {
    if (!editingCharge) return
    updateCharge.mutate({
      id: editingCharge.id,
      base_mrc: formData.base_mrc,
      apply_term_discount: formData.apply_term_discount,
    })
  }

  // Calculate discounted price example
  const calculateDiscountedPrice = (baseMrc: number, applyDiscount: boolean) => {
    if (!applyDiscount) return baseMrc
    // Example with 36-month term factor of 0.8
    return baseMrc * 0.8
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Base Charges</h1>
        <p className="text-muted-foreground">Configure fixed monthly recurring charges for base SKUs</p>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by SKU code or description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Charges Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Base Charges</CardTitle>
          <CardDescription>{filteredCharges?.length || 0} base charge SKUs</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : filteredCharges && filteredCharges.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Base MRC</TableHead>
                  <TableHead>Apply Term Discount</TableHead>
                  <TableHead>Example (36mo)</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCharges.map((charge) => (
                  <TableRow key={charge.id}>
                    <TableCell>
                      <div>
                        <p className="font-mono font-medium">{charge.sku?.code}</p>
                        <p className="text-xs text-muted-foreground truncate max-w-xs">
                          {charge.sku?.description}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {charge.sku && (
                        <Badge className={categoryColors[charge.sku.category]}>
                          {charge.sku.category.toUpperCase()}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatCurrency(charge.base_mrc)}/mo
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={charge.apply_term_discount}
                        onCheckedChange={(checked) =>
                          toggleTermDiscount.mutate({ id: charge.id, apply_term_discount: checked })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatCurrency(calculateDiscountedPrice(charge.base_mrc, charge.apply_term_discount))}/mo
                      {charge.apply_term_discount && (
                        <span className="ml-1 text-xs text-green-600">(-20%)</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(charge)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex h-64 flex-col items-center justify-center text-center">
              <DollarSign className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-lg font-medium">No base charges found</p>
              <p className="text-muted-foreground">
                {search ? 'Try adjusting your search' : 'No base charge SKUs in the system'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Help text */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-lg">How Base Charges Work</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            Base charges are fixed monthly recurring fees for solution foundations (e.g., platform access, base licenses).
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>
              <strong>Base MRC</strong>: The standard monthly price at 12-month term
            </li>
            <li>
              <strong>Apply Term Discount</strong>: When enabled, longer terms get discounted using term factors
            </li>
          </ul>
          <p>
            Unlike usage-based SKUs, base charges are typically quantity=1 and don't have volume discounts.
          </p>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Base Charge</DialogTitle>
            <DialogDescription>
              {editingCharge?.sku?.code} - {editingCharge?.sku?.description}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="base_mrc">Base Monthly Recurring Charge (MRC)</Label>
              <Input
                id="base_mrc"
                type="number"
                step="0.01"
                min="0"
                value={formData.base_mrc}
                onChange={(e) =>
                  setFormData({ ...formData, base_mrc: parseFloat(e.target.value) || 0 })
                }
              />
              <p className="text-xs text-muted-foreground">
                This is the price at 12-month term (no term discount)
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="apply_term_discount"
                checked={formData.apply_term_discount}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, apply_term_discount: checked })
                }
              />
              <Label htmlFor="apply_term_discount">Apply term discount for longer commitments</Label>
            </div>

            {formData.apply_term_discount && (
              <div className="bg-muted p-3 rounded-md text-sm">
                <p className="font-medium mb-2">Example pricing:</p>
                <ul className="space-y-1 text-muted-foreground">
                  <li>12 months: {formatCurrency(formData.base_mrc)}/mo (factor 1.0)</li>
                  <li>24 months: {formatCurrency(formData.base_mrc * 0.9)}/mo (factor 0.9)</li>
                  <li>36 months: {formatCurrency(formData.base_mrc * 0.8)}/mo (factor 0.8)</li>
                </ul>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={updateCharge.isPending}>
              {updateCharge.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
