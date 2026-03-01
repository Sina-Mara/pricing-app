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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { Plus, Pencil, Trash2, Calendar } from 'lucide-react'
import type { TermFactor, SkuCategory } from '@/types/database'

const categories: SkuCategory[] = ['default', 'cas', 'cno', 'ccs']

const categoryLabels: Record<SkuCategory, string> = {
  default: 'Default',
  cas: 'CAS',
  cno: 'CNO',
  ccs: 'CCS',
}

export default function TermFactors() {
  const [selectedCategory, setSelectedCategory] = useState<SkuCategory>('default')
  const [showDialog, setShowDialog] = useState(false)
  const [editingFactor, setEditingFactor] = useState<TermFactor | null>(null)
  const [formData, setFormData] = useState({ term_months: 12, factor: 1.0 })
  const { toast } = useToast()
  const queryClient = useQueryClient()

  // Fetch term factors
  const { data: factors, isLoading } = useQuery({
    queryKey: ['term-factors'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('term_factors')
        .select('*')
        .order('category')
        .order('term_months')

      if (error) throw error
      return data as TermFactor[]
    },
  })

  // Create term factor
  const createFactor = useMutation({
    mutationFn: async (data: Omit<TermFactor, 'id' | 'created_at' | 'updated_at'>) => {
      const { error } = await supabase.from('term_factors').insert([data])
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['term-factors'] })
      setShowDialog(false)
      toast({ title: 'Term factor created' })
    },
    onError: (error) => {
      toast({ variant: 'destructive', title: 'Failed to create', description: error.message })
    },
  })

  // Update term factor
  const updateFactor = useMutation({
    mutationFn: async ({ id, ...data }: Partial<TermFactor> & { id: string }) => {
      const { error } = await supabase.from('term_factors').update(data).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['term-factors'] })
      setShowDialog(false)
      toast({ title: 'Term factor updated' })
    },
    onError: (error) => {
      toast({ variant: 'destructive', title: 'Failed to update', description: error.message })
    },
  })

  // Delete term factor
  const deleteFactor = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('term_factors').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['term-factors'] })
      toast({ title: 'Term factor deleted' })
    },
    onError: (error) => {
      toast({ variant: 'destructive', title: 'Failed to delete', description: error.message })
    },
  })

  const factorsByCategory = (category: SkuCategory) =>
    factors?.filter((f) => f.category === category) || []

  const openAddDialog = () => {
    setEditingFactor(null)
    setFormData({ term_months: 12, factor: 1.0 })
    setShowDialog(true)
  }

  const openEditDialog = (factor: TermFactor) => {
    setEditingFactor(factor)
    setFormData({ term_months: factor.term_months, factor: factor.factor })
    setShowDialog(true)
  }

  const handleSave = () => {
    if (editingFactor) {
      updateFactor.mutate({
        id: editingFactor.id,
        term_months: formData.term_months,
        factor: formData.factor,
      })
    } else {
      createFactor.mutate({
        category: selectedCategory,
        term_months: formData.term_months,
        factor: formData.factor,
      })
    }
  }

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this term factor?')) {
      deleteFactor.mutate(id)
    }
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Term Factors</h1>
        <p className="text-muted-foreground">
          Configure term-based discount factors by SKU category
        </p>
      </div>

      {/* Tabs for categories */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Term Discount Factors</CardTitle>
              <CardDescription>
                Lower factors = higher discounts. Factor 1.0 = no discount.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs
            value={selectedCategory}
            onValueChange={(v) => setSelectedCategory(v as SkuCategory)}
          >
            <div className="flex items-center justify-between mb-4">
              <TabsList>
                {categories.map((cat) => (
                  <TabsTrigger key={cat} value={cat}>
                    {categoryLabels[cat]}
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({factorsByCategory(cat).length})
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
              <Button onClick={openAddDialog}>
                <Plus className="h-4 w-4 mr-2" />
                Add Factor
              </Button>
            </div>

            {categories.map((cat) => (
              <TabsContent key={cat} value={cat}>
                {isLoading ? (
                  <div className="flex h-32 items-center justify-center">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                  </div>
                ) : factorsByCategory(cat).length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Term (Months)</TableHead>
                        <TableHead>Factor</TableHead>
                        <TableHead>Discount %</TableHead>
                        <TableHead className="w-32">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {factorsByCategory(cat).map((factor) => (
                        <TableRow key={factor.id}>
                          <TableCell className="font-medium">
                            {factor.term_months} months
                          </TableCell>
                          <TableCell>{factor.factor.toFixed(4)}</TableCell>
                          <TableCell>
                            {factor.factor < 1
                              ? `-${((1 - factor.factor) * 100).toFixed(1)}%`
                              : factor.factor > 1
                              ? `+${((factor.factor - 1) * 100).toFixed(1)}%`
                              : '0%'}
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
                    <Calendar className="mb-2 h-8 w-8 text-muted-foreground" />
                    <p className="text-muted-foreground">
                      No term factors for {categoryLabels[cat]}
                    </p>
                    <Button variant="link" onClick={openAddDialog}>
                      Add one now
                    </Button>
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      {/* Help text */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-lg">How Term Factors Work</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            Term factors are multipliers applied to the base price based on contract term length.
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>
              <strong>Factor 1.0</strong> = No discount (base price)
            </li>
            <li>
              <strong>Factor 0.9</strong> = 10% discount
            </li>
            <li>
              <strong>Factor 0.75</strong> = 25% discount
            </li>
          </ul>
          <p>
            If a term falls between defined points, the system will interpolate the factor.
            For terms beyond the highest defined point, extrapolation is applied with caps.
          </p>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingFactor ? 'Edit Term Factor' : 'Add Term Factor'}
            </DialogTitle>
            <DialogDescription>
              {editingFactor
                ? `Editing factor for ${categoryLabels[editingFactor.category]}`
                : `Adding factor for ${categoryLabels[selectedCategory]}`}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="term_months">Term (Months)</Label>
              <Input
                id="term_months"
                type="number"
                min="1"
                value={formData.term_months}
                onChange={(e) =>
                  setFormData({ ...formData, term_months: parseInt(e.target.value) || 1 })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="factor">Factor</Label>
              <Input
                id="factor"
                type="number"
                step="0.01"
                min="0"
                max="2"
                value={formData.factor}
                onChange={(e) =>
                  setFormData({ ...formData, factor: parseFloat(e.target.value) || 1 })
                }
              />
              <p className="text-xs text-muted-foreground">
                Discount: {formData.factor < 1
                  ? `${((1 - formData.factor) * 100).toFixed(1)}%`
                  : formData.factor > 1
                  ? `Premium: +${((formData.factor - 1) * 100).toFixed(1)}%`
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
