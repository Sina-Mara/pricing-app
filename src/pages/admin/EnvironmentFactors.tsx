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
import { Plus, Pencil, Trash2, Server } from 'lucide-react'
import type { EnvFactor, Sku, EnvironmentType } from '@/types/database'

interface DefaultEnvFactor {
  id: string
  environment: EnvironmentType
  factor: number
}

interface EnvFactorWithSku extends EnvFactor {
  sku?: Sku
}

export default function EnvironmentFactors() {
  const [activeTab, setActiveTab] = useState<'defaults' | 'sku-specific'>('defaults')
  const [showDialog, setShowDialog] = useState(false)
  const [dialogType, setDialogType] = useState<'default' | 'sku'>('default')
  const [editingFactor, setEditingFactor] = useState<any>(null)
  const [formData, setFormData] = useState({
    environment: 'production' as EnvironmentType,
    factor: 1.0,
    sku_id: '',
  })
  const { toast } = useToast()
  const queryClient = useQueryClient()

  // Fetch default env factors
  const { data: defaultFactors, isLoading: loadingDefaults } = useQuery({
    queryKey: ['default-env-factors'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('default_env_factors')
        .select('*')
        .order('environment')

      if (error) throw error
      return data as DefaultEnvFactor[]
    },
  })

  // Fetch SKU-specific env factors
  const { data: skuFactors, isLoading: loadingSkuFactors } = useQuery({
    queryKey: ['env-factors'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('env_factors')
        .select('*, sku:skus(*)')
        .order('environment')

      if (error) throw error
      return data as EnvFactorWithSku[]
    },
  })

  // Fetch SKUs for dropdown
  const { data: skus } = useQuery({
    queryKey: ['skus-active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('skus')
        .select('id, code, description')
        .eq('is_active', true)
        .eq('is_base_charge', false)
        .order('code')

      if (error) throw error
      return data as Pick<Sku, 'id' | 'code' | 'description'>[]
    },
  })

  // Update default factor
  const updateDefaultFactor = useMutation({
    mutationFn: async ({ id, factor }: { id: string; factor: number }) => {
      const { error } = await supabase
        .from('default_env_factors')
        .update({ factor })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['default-env-factors'] })
      setShowDialog(false)
      toast({ title: 'Default factor updated' })
    },
    onError: (error) => {
      toast({ variant: 'destructive', title: 'Failed to update', description: error.message })
    },
  })

  // Create SKU-specific factor
  const createSkuFactor = useMutation({
    mutationFn: async (data: { sku_id: string; environment: EnvironmentType; factor: number }) => {
      const { error } = await supabase.from('env_factors').insert([data])
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['env-factors'] })
      setShowDialog(false)
      toast({ title: 'SKU factor created' })
    },
    onError: (error) => {
      toast({ variant: 'destructive', title: 'Failed to create', description: error.message })
    },
  })

  // Update SKU-specific factor
  const updateSkuFactor = useMutation({
    mutationFn: async ({ id, factor }: { id: string; factor: number }) => {
      const { error } = await supabase.from('env_factors').update({ factor }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['env-factors'] })
      setShowDialog(false)
      toast({ title: 'SKU factor updated' })
    },
    onError: (error) => {
      toast({ variant: 'destructive', title: 'Failed to update', description: error.message })
    },
  })

  // Delete SKU-specific factor
  const deleteSkuFactor = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('env_factors').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['env-factors'] })
      toast({ title: 'SKU factor deleted' })
    },
    onError: (error) => {
      toast({ variant: 'destructive', title: 'Failed to delete', description: error.message })
    },
  })

  const openEditDefaultDialog = (factor: DefaultEnvFactor) => {
    setDialogType('default')
    setEditingFactor(factor)
    setFormData({ environment: factor.environment, factor: factor.factor, sku_id: '' })
    setShowDialog(true)
  }

  const openAddSkuFactorDialog = () => {
    setDialogType('sku')
    setEditingFactor(null)
    setFormData({ environment: 'production', factor: 1.0, sku_id: '' })
    setShowDialog(true)
  }

  const openEditSkuFactorDialog = (factor: EnvFactorWithSku) => {
    setDialogType('sku')
    setEditingFactor(factor)
    setFormData({
      environment: factor.environment,
      factor: factor.factor,
      sku_id: factor.sku_id,
    })
    setShowDialog(true)
  }

  const handleSave = () => {
    if (dialogType === 'default' && editingFactor) {
      updateDefaultFactor.mutate({ id: editingFactor.id, factor: formData.factor })
    } else if (dialogType === 'sku') {
      if (editingFactor) {
        updateSkuFactor.mutate({ id: editingFactor.id, factor: formData.factor })
      } else {
        createSkuFactor.mutate({
          sku_id: formData.sku_id,
          environment: formData.environment,
          factor: formData.factor,
        })
      }
    }
  }

  const handleDeleteSkuFactor = (id: string) => {
    if (confirm('Are you sure you want to delete this SKU-specific factor?')) {
      deleteSkuFactor.mutate(id)
    }
  }

  const formatFactor = (factor: number) => {
    if (factor < 1) return `${((1 - factor) * 100).toFixed(0)}% discount`
    if (factor > 1) return `${((factor - 1) * 100).toFixed(0)}% premium`
    return 'No adjustment'
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Environment Factors</h1>
        <p className="text-muted-foreground">
          Configure pricing adjustments for different environments
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList className="mb-6">
          <TabsTrigger value="defaults">Default Factors</TabsTrigger>
          <TabsTrigger value="sku-specific">SKU-Specific Overrides</TabsTrigger>
        </TabsList>

        {/* Default Factors Tab */}
        <TabsContent value="defaults">
          <Card>
            <CardHeader>
              <CardTitle>Default Environment Factors</CardTitle>
              <CardDescription>
                Applied to all SKUs unless a specific override exists
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingDefaults ? (
                <div className="flex h-32 items-center justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Environment</TableHead>
                      <TableHead>Factor</TableHead>
                      <TableHead>Effect</TableHead>
                      <TableHead className="w-24">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {defaultFactors?.map((factor) => (
                      <TableRow key={factor.id}>
                        <TableCell className="font-medium capitalize">
                          {factor.environment}
                        </TableCell>
                        <TableCell>{factor.factor.toFixed(2)}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatFactor(factor.factor)}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditDefaultDialog(factor)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* SKU-Specific Tab */}
        <TabsContent value="sku-specific">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>SKU-Specific Overrides</CardTitle>
                  <CardDescription>
                    Custom environment factors for specific SKUs
                  </CardDescription>
                </div>
                <Button onClick={openAddSkuFactorDialog}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Override
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loadingSkuFactors ? (
                <div className="flex h-32 items-center justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </div>
              ) : skuFactors && skuFactors.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead>Environment</TableHead>
                      <TableHead>Factor</TableHead>
                      <TableHead>Effect</TableHead>
                      <TableHead className="w-32">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {skuFactors.map((factor) => (
                      <TableRow key={factor.id}>
                        <TableCell>
                          <div>
                            <p className="font-mono font-medium">{factor.sku?.code}</p>
                            <p className="text-xs text-muted-foreground truncate max-w-xs">
                              {factor.sku?.description}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="capitalize">{factor.environment}</TableCell>
                        <TableCell>{factor.factor.toFixed(2)}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatFactor(factor.factor)}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditSkuFactorDialog(factor)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteSkuFactor(factor.id)}
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
                  <Server className="mb-2 h-8 w-8 text-muted-foreground" />
                  <p className="text-muted-foreground">No SKU-specific overrides</p>
                  <Button variant="link" onClick={openAddSkuFactorDialog}>
                    Add one now
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Help text */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-lg">How Environment Factors Work</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            Environment factors adjust pricing based on the deployment environment type.
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>
              <strong>Production</strong>: Typically factor 1.0 (full price)
            </li>
            <li>
              <strong>Reference</strong>: Often factor 0.5-0.7 (discounted for non-production use)
            </li>
          </ul>
          <p>
            SKU-specific overrides take precedence over default factors for that SKU.
          </p>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogType === 'default'
                ? 'Edit Default Factor'
                : editingFactor
                ? 'Edit SKU Override'
                : 'Add SKU Override'}
            </DialogTitle>
            <DialogDescription>
              {dialogType === 'default'
                ? `Editing default factor for ${formData.environment}`
                : editingFactor
                ? `Editing override for ${editingFactor.sku?.code}`
                : 'Create a new SKU-specific environment factor'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {dialogType === 'sku' && !editingFactor && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="sku_id">SKU</Label>
                  <Select
                    value={formData.sku_id}
                    onValueChange={(value) => setFormData({ ...formData, sku_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a SKU" />
                    </SelectTrigger>
                    <SelectContent>
                      {skus?.map((sku) => (
                        <SelectItem key={sku.id} value={sku.id}>
                          {sku.code} - {sku.description}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="environment">Environment</Label>
                  <Select
                    value={formData.environment}
                    onValueChange={(value: EnvironmentType) =>
                      setFormData({ ...formData, environment: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="production">Production</SelectItem>
                      <SelectItem value="reference">Reference</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

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
              <p className="text-xs text-muted-foreground">{formatFactor(formData.factor)}</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={
                updateDefaultFactor.isPending ||
                createSkuFactor.isPending ||
                updateSkuFactor.isPending ||
                (dialogType === 'sku' && !editingFactor && !formData.sku_id)
              }
            >
              {updateDefaultFactor.isPending ||
              createSkuFactor.isPending ||
              updateSkuFactor.isPending
                ? 'Saving...'
                : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
