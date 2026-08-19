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
import { Plus, Pencil, Trash2, CreditCard } from 'lucide-react'
import type { PaymentCadenceFactor } from '@/types/database'

export default function PaymentCadenceFactors() {
  const [showDialog, setShowDialog] = useState(false)
  const [editingFactor, setEditingFactor] = useState<PaymentCadenceFactor | null>(null)
  const [formData, setFormData] = useState({ upfront_months: 12, discount_pct: 0 })
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const { data: factors, isLoading } = useQuery({
    queryKey: ['payment-cadence-factors'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_cadence_factors')
        .select('*')
        .order('upfront_months')
      if (error) throw error
      return data as PaymentCadenceFactor[]
    },
  })

  const createFactor = useMutation({
    mutationFn: async (data: Omit<PaymentCadenceFactor, 'id' | 'created_at' | 'updated_at'>) => {
      const { error } = await supabase.from('payment_cadence_factors').insert([data])
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-cadence-factors'] })
      setShowDialog(false)
      toast({ title: 'Payment cadence factor created' })
    },
    onError: (error) => {
      toast({ variant: 'destructive', title: 'Failed to create', description: error.message })
    },
  })

  const updateFactor = useMutation({
    mutationFn: async ({ id, ...data }: Partial<PaymentCadenceFactor> & { id: string }) => {
      const { error } = await supabase.from('payment_cadence_factors').update(data).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-cadence-factors'] })
      setShowDialog(false)
      toast({ title: 'Payment cadence factor updated' })
    },
    onError: (error) => {
      toast({ variant: 'destructive', title: 'Failed to update', description: error.message })
    },
  })

  const deleteFactor = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('payment_cadence_factors').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-cadence-factors'] })
      toast({ title: 'Payment cadence factor deleted' })
    },
    onError: (error) => {
      toast({ variant: 'destructive', title: 'Failed to delete', description: error.message })
    },
  })

  const openAddDialog = () => {
    setEditingFactor(null)
    setFormData({ upfront_months: 12, discount_pct: 0 })
    setShowDialog(true)
  }

  const openEditDialog = (factor: PaymentCadenceFactor) => {
    setEditingFactor(factor)
    setFormData({ upfront_months: factor.upfront_months, discount_pct: factor.discount_pct })
    setShowDialog(true)
  }

  const handleSave = () => {
    if (editingFactor) {
      updateFactor.mutate({
        id: editingFactor.id,
        upfront_months: formData.upfront_months,
        discount_pct: formData.discount_pct,
      })
    } else {
      createFactor.mutate({
        upfront_months: formData.upfront_months,
        discount_pct: formData.discount_pct,
      })
    }
  }

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this payment cadence factor?')) {
      deleteFactor.mutate(id)
    }
  }

  const labelForMonths = (months: number) => {
    if (months === 1) return 'Monthly'
    if (months === 3) return 'Quarterly (3 months)'
    if (months === 6) return 'Semi-annual (6 months)'
    if (months === 12) return 'Annual (12 months)'
    return `${months} months`
  }

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Payment Cadence Discounts</h1>
        <p className="text-muted-foreground">
          Configure discounts applied to the contract total based on upfront payment term
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Upfront Payment Discounts</CardTitle>
              <CardDescription>
                Discount % is applied to the full contract total (e.g. 3-year sum for a 36-month quote)
              </CardDescription>
            </div>
            <Button onClick={openAddDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Add Factor
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex h-32 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : factors && factors.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Upfront Payment Term</TableHead>
                  <TableHead>Discount %</TableHead>
                  <TableHead className="w-32">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {factors.map((factor) => (
                  <TableRow key={factor.id}>
                    <TableCell className="font-medium">
                      {labelForMonths(factor.upfront_months)}
                    </TableCell>
                    <TableCell>
                      {factor.discount_pct === 0
                        ? '0% (no discount)'
                        : `-${factor.discount_pct}%`}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(factor)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(factor.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex h-32 flex-col items-center justify-center text-center">
              <CreditCard className="mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-muted-foreground">No payment cadence factors configured</p>
              <Button variant="link" onClick={openAddDialog}>
                Add one now
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-lg">How Payment Cadence Discounts Work</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            Payment cadence discounts reward customers who pay a larger portion of their contract upfront.
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>The discount is applied to the <strong>contract total</strong>, not the unit price</li>
            <li>For a 36-month quote, the discount applies to the full 3-year sum</li>
            <li>1 month (monthly billing) = 0% discount — baseline, no change to existing quotes</li>
            <li>Only applies to commitment quotes; Pay-Per-Use quotes are excluded</li>
          </ul>
          <p>
            A per-quote manual override is also available in the quote builder.
          </p>
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingFactor ? 'Edit Payment Cadence Factor' : 'Add Payment Cadence Factor'}
            </DialogTitle>
            <DialogDescription>
              Set the discount % for a given upfront payment term in months.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="upfront_months">Upfront Payment Term (Months)</Label>
              <Input
                id="upfront_months"
                type="number"
                min="1"
                value={formData.upfront_months}
                onChange={(e) =>
                  setFormData({ ...formData, upfront_months: parseInt(e.target.value) || 1 })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="discount_pct">Discount %</Label>
              <Input
                id="discount_pct"
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={formData.discount_pct}
                onChange={(e) =>
                  setFormData({ ...formData, discount_pct: parseFloat(e.target.value) || 0 })
                }
              />
              <p className="text-xs text-muted-foreground">
                {formData.discount_pct > 0
                  ? `Contract total reduced by ${formData.discount_pct}%`
                  : 'No discount'}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={createFactor.isPending || updateFactor.isPending}
            >
              {createFactor.isPending || updateFactor.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
