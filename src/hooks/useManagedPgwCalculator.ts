import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

import type {
  ManagedPgwCalculatorConfig,
  ManagedPgwTopologyInputs,
  ManagedPgwExternalCostItem,
} from '@/types/database'

const PGW_CONFIGS_KEY = ['managed-pgw-configs'] as const
const pgwConfigKey = (id: string) => [...PGW_CONFIGS_KEY, id] as const

// ---------------------------------------------------------------------------
// useManagedPgwConfigs — list all saved configs
// ---------------------------------------------------------------------------

export function useManagedPgwConfigs() {
  const { data: configs, isLoading: loading, error, refetch } = useQuery({
    queryKey: PGW_CONFIGS_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('managed_pgw_configs')
        .select('id, name, description, updated_at')
        .order('updated_at', { ascending: false })
      if (error) throw error
      return data as Pick<ManagedPgwCalculatorConfig, 'id' | 'name' | 'description' | 'updated_at'>[]
    },
  })
  return { configs: configs ?? [], loading, error, refetch }
}

// ---------------------------------------------------------------------------
// useManagedPgwConfig — load a single config by ID
// ---------------------------------------------------------------------------

export function useManagedPgwConfig(id: string | null | undefined) {
  const { data: config, isLoading: loading, error } = useQuery({
    queryKey: pgwConfigKey(id ?? ''),
    queryFn: async () => {
      if (!id) return null
      const { data, error } = await supabase
        .from('managed_pgw_configs')
        .select('*')
        .eq('id', id)
        .single()
      if (error) throw error
      return data as ManagedPgwCalculatorConfig
    },
    enabled: !!id,
  })
  return { config: config ?? null, loading, error }
}

// ---------------------------------------------------------------------------
// useManagedPgwSaveConfig — upsert
// ---------------------------------------------------------------------------

interface SaveConfigData {
  id?: string
  name: string
  description?: string | null
  topology_inputs: ManagedPgwTopologyInputs
  external_costs: ManagedPgwExternalCostItem[]
}

export function useManagedPgwSaveConfig() {
  const queryClient = useQueryClient()
  const [error, setError] = useState<Error | null>(null)

  const mutation = useMutation({
    mutationFn: async (input: SaveConfigData): Promise<ManagedPgwCalculatorConfig> => {
      setError(null)
      const payload = {
        name: input.name.trim(),
        description: input.description?.trim() || null,
        topology_inputs: input.topology_inputs,
        external_costs: input.external_costs,
      }
      if (!payload.name) throw new Error('Config name is required')

      if (input.id) {
        const { data, error } = await supabase
          .from('managed_pgw_configs')
          .update(payload)
          .eq('id', input.id)
          .select()
          .single()
        if (error) throw error
        return data as ManagedPgwCalculatorConfig
      } else {
        const { data, error } = await supabase
          .from('managed_pgw_configs')
          .insert(payload)
          .select()
          .single()
        if (error) throw error
        return data as ManagedPgwCalculatorConfig
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: PGW_CONFIGS_KEY })
      if (data.id) queryClient.invalidateQueries({ queryKey: pgwConfigKey(data.id) })
    },
    onError: (err: Error) => setError(err),
  })

  return { saveConfig: mutation.mutateAsync, saving: mutation.isPending, error: error ?? mutation.error }
}

// ---------------------------------------------------------------------------
// useManagedPgwDeleteConfig — delete by ID
// ---------------------------------------------------------------------------

export function useManagedPgwDeleteConfig() {
  const queryClient = useQueryClient()
  const [error, setError] = useState<Error | null>(null)

  const mutation = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      setError(null)
      const { error } = await supabase.from('managed_pgw_configs').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PGW_CONFIGS_KEY }),
    onError: (err: Error) => setError(err),
  })

  return { deleteConfig: mutation.mutateAsync, deleting: mutation.isPending, error: error ?? mutation.error }
}

// ---------------------------------------------------------------------------
// useManagedPgwSkuData — fetch SKU pricing models + base charges for PGW SKUs
// ---------------------------------------------------------------------------

import type { PricingModel } from '@/lib/pricing'
import {
  PGW_TOPOLOGY_SKUS,
  PGW_TIER_SKUS,
  PGW_BASE_SKUS,
} from '@/lib/managed-pgw-calculator'

const ALL_PGW_SKU_CODES = [...PGW_TOPOLOGY_SKUS, ...PGW_TIER_SKUS, ...PGW_BASE_SKUS]

export function useManagedPgwSkuData() {
  const { data, isLoading: loading, error } = useQuery({
    queryKey: ['managed-pgw-sku-data'],
    queryFn: async () => {
      const { data: skus, error: skuError } = await supabase
        .from('skus')
        .select('id, code')
        .in('code', ALL_PGW_SKU_CODES)
      if (skuError) throw skuError

      const skuIds = skus.map((s) => s.id)
      const skuCodeById = Object.fromEntries(skus.map((s) => [s.id, s.code]))

      const [
        { data: models, error: modelError },
        { data: bases, error: baseError },
        { data: tfRows, error: tfError },
      ] = await Promise.all([
        supabase.from('pricing_models').select('*').in('sku_id', skuIds).eq('is_active', true),
        supabase.from('base_charges').select('*').in('sku_id', skuIds),
        supabase.from('term_factors').select('category, term_months, factor'),
      ])

      if (modelError) throw modelError
      if (baseError) throw baseError
      if (tfError) throw tfError

      const skuPricingModels: Record<string, PricingModel> = {}
      for (const m of models ?? []) {
        const code = skuCodeById[m.sku_id]
        if (code) skuPricingModels[code] = m as PricingModel
      }

      const baseCharges: Record<string, number> = {}
      for (const b of bases ?? []) {
        const code = skuCodeById[b.sku_id]
        if (code) baseCharges[code] = b.base_mrc
      }

      const termFactors: Record<string, Map<number, number>> = {}
      for (const row of tfRows ?? []) {
        if (!termFactors[row.category]) termFactors[row.category] = new Map()
        termFactors[row.category].set(row.term_months, row.factor)
      }

      return { skuPricingModels, baseCharges, termFactors }
    },
  })

  return {
    skuPricingModels: data?.skuPricingModels ?? {},
    baseCharges: data?.baseCharges ?? {},
    termFactors: data?.termFactors ?? {},
    loading,
    error,
  }
}
