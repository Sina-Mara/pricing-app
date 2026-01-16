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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { Search, Package, Eye } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import type { Sku, PricingModel, BaseCharge, SkuCategory } from '@/types/database'

const categoryColors: Record<SkuCategory, string> = {
  default: 'bg-gray-100 text-gray-800',
  cas: 'bg-blue-100 text-blue-800',
  cno: 'bg-green-100 text-green-800',
  ccs: 'bg-purple-100 text-purple-800',
}

interface SkuWithPricing extends Sku {
  pricing_models?: PricingModel[]
  base_charges?: BaseCharge[]
}

export default function SKUs() {
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [selectedSku, setSelectedSku] = useState<SkuWithPricing | null>(null)
  const [showDialog, setShowDialog] = useState(false)
  const { toast } = useToast()
  const queryClient = useQueryClient()

  // Fetch SKUs with pricing info
  const { data: skus, isLoading } = useQuery({
    queryKey: ['skus', 'with-pricing'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('skus')
        .select(`
          *,
          pricing_models(*),
          base_charges(*)
        `)
        .order('code')

      if (error) throw error
      return data as SkuWithPricing[]
    },
  })

  // Update SKU
  const updateSku = useMutation({
    mutationFn: async (updates: Partial<Sku> & { id: string }) => {
      const { id, ...data } = updates
      const { error } = await supabase
        .from('skus')
        .update(data)
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skus'] })
      toast({ title: 'SKU updated' })
    },
    onError: (error) => {
      toast({ variant: 'destructive', title: 'Failed to update', description: error.message })
    },
  })

  // Filter SKUs
  const filteredSkus = skus?.filter((sku) => {
    const matchesSearch =
      search === '' ||
      sku.code.toLowerCase().includes(search.toLowerCase()) ||
      sku.description.toLowerCase().includes(search.toLowerCase())

    const matchesCategory = categoryFilter === 'all' || sku.category === categoryFilter

    return matchesSearch && matchesCategory
  })

  const openSkuDialog = (sku: SkuWithPricing) => {
    setSelectedSku(sku)
    setShowDialog(true)
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold">SKU Management</h1>
        <p className="text-muted-foreground">Manage products and pricing models</p>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search SKUs..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="default">Default</SelectItem>
                <SelectItem value="cas">CAS</SelectItem>
                <SelectItem value="cno">CNO</SelectItem>
                <SelectItem value="ccs">CCS</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* SKUs Table */}
      <Card>
        <CardHeader>
          <CardTitle>All SKUs</CardTitle>
          <CardDescription>{filteredSkus?.length || 0} SKUs found</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : filteredSkus && filteredSkus.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Base Price</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSkus.map((sku) => {
                  const pricingModel = sku.pricing_models?.[0]
                  const baseCharge = sku.base_charges?.[0]

                  return (
                    <TableRow key={sku.id}>
                      <TableCell className="font-mono font-medium">{sku.code}</TableCell>
                      <TableCell className="max-w-xs truncate">{sku.description}</TableCell>
                      <TableCell>{sku.unit}</TableCell>
                      <TableCell>
                        <Badge className={categoryColors[sku.category]}>
                          {sku.category.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {sku.is_base_charge ? (
                          <Badge variant="outline">Base Charge</Badge>
                        ) : (
                          <Badge variant="secondary">Usage</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {sku.is_base_charge && baseCharge
                          ? formatCurrency(baseCharge.base_mrc)
                          : pricingModel
                          ? formatCurrency(pricingModel.base_unit_price)
                          : '-'}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={sku.is_active}
                          onCheckedChange={(checked) =>
                            updateSku.mutate({ id: sku.id, is_active: checked })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openSkuDialog(sku)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="flex h-64 flex-col items-center justify-center text-center">
              <Package className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-lg font-medium">No SKUs found</p>
              <p className="text-muted-foreground">
                {search || categoryFilter !== 'all'
                  ? 'Try adjusting your filters'
                  : 'No SKUs in the system'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* SKU Detail Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedSku?.code}</DialogTitle>
            <DialogDescription>{selectedSku?.description}</DialogDescription>
          </DialogHeader>

          {selectedSku && (
            <Tabs defaultValue="info">
              <TabsList>
                <TabsTrigger value="info">Basic Info</TabsTrigger>
                <TabsTrigger value="pricing">Pricing Model</TabsTrigger>
              </TabsList>

              <TabsContent value="info" className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Code</Label>
                    <p className="font-mono">{selectedSku.code}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Unit</Label>
                    <p>{selectedSku.unit}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Category</Label>
                    <Badge className={categoryColors[selectedSku.category]}>
                      {selectedSku.category.toUpperCase()}
                    </Badge>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Type</Label>
                    <p>{selectedSku.is_base_charge ? 'Base Charge' : 'Usage-based'}</p>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-muted-foreground">Description</Label>
                    <p>{selectedSku.description}</p>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="pricing" className="space-y-4 py-4">
                {selectedSku.is_base_charge && selectedSku.base_charges?.[0] ? (
                  <div className="space-y-4">
                    <h4 className="font-medium">Base Charge Configuration</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-muted-foreground">Monthly Recurring Charge</Label>
                        <p className="text-xl font-bold">
                          {formatCurrency(selectedSku.base_charges[0].base_mrc)}
                        </p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Apply Term Discount</Label>
                        <p>{selectedSku.base_charges[0].apply_term_discount ? 'Yes' : 'No'}</p>
                      </div>
                    </div>
                  </div>
                ) : selectedSku.pricing_models?.[0] ? (
                  <div className="space-y-4">
                    <h4 className="font-medium">Pricing Model</h4>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <Label className="text-muted-foreground">Mode</Label>
                        <p className="capitalize">{selectedSku.pricing_models[0].mode}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Base Quantity</Label>
                        <p>{selectedSku.pricing_models[0].base_qty}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Base Unit Price</Label>
                        <p className="font-bold">
                          {formatCurrency(selectedSku.pricing_models[0].base_unit_price)}
                        </p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Per-Double Discount</Label>
                        <p>{(selectedSku.pricing_models[0].per_double_discount * 100).toFixed(0)}%</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Floor Price</Label>
                        <p>{formatCurrency(selectedSku.pricing_models[0].floor_unit_price)}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Steps</Label>
                        <p>{selectedSku.pricing_models[0].steps}</p>
                      </div>
                    </div>
                    {selectedSku.pricing_models[0].breakpoints && (
                      <div>
                        <Label className="text-muted-foreground">Breakpoints</Label>
                        <p className="font-mono text-sm">
                          {selectedSku.pricing_models[0].breakpoints.join(', ')}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-muted-foreground">No pricing model configured</p>
                )}
              </TabsContent>
            </Tabs>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
