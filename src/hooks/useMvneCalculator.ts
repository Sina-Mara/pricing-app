import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import type {
  MvneCalculatorConfig,
  MvneCapacityInputs,
  MvneExternalCosts,
} from '@/types/database'

// ---------------------------------------------------------------------------
// Query key constants
// ---------------------------------------------------------------------------

const MVNE_CONFIGS_KEY = ['mvne-calculator-configs'] as const
const mvneConfigKey = (id: string) => [...MVNE_CONFIGS_KEY, id] as const

// ---------------------------------------------------------------------------
// useMvneConfigs — list all saved configs (summary fields only)
// ---------------------------------------------------------------------------

export function useMvneConfigs() {
  const {
    data: configs,
    isLoading: loading,
    error,
    refetch,
  } = useQuery({
    queryKey: MVNE_CONFIGS_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mvne_calculator_configs')
        .select('id, name, description, updated_at')
        .order('updated_at', { ascending: false })

      if (error) throw error
      return data as Pick<MvneCalculatorConfig, 'id' | 'name' | 'description' | 'updated_at'>[]
    },
  })

  return { configs: configs ?? [], loading, error, refetch }
}

// ---------------------------------------------------------------------------
// useMvneConfig — load a single config by ID
// ---------------------------------------------------------------------------

export function useMvneConfig(id: string | null | undefined) {
  const {
    data: config,
    isLoading: loading,
    error,
  } = useQuery({
    queryKey: mvneConfigKey(id ?? ''),
    queryFn: async () => {
      if (!id) return null

      const { data, error } = await supabase
        .from('mvne_calculator_configs')
        .select('*')
        .eq('id', id)
        .single()

      if (error) throw error
      return data as MvneCalculatorConfig
    },
    enabled: !!id,
  })

  return { config: config ?? null, loading, error }
}

// ---------------------------------------------------------------------------
// useMvneSaveConfig — upsert (insert if no id, update if id provided)
// ---------------------------------------------------------------------------

interface SaveConfigData {
  id?: string
  name: string
  description?: string | null
  capacity_inputs: MvneCapacityInputs
  sku_quantities: Record<string, number>
  sku_discounts: Record<string, number>
  sku_overrides: Record<string, boolean>
  external_costs: MvneExternalCosts
}

export function useMvneSaveConfig() {
  const queryClient = useQueryClient()
  const [error, setError] = useState<Error | null>(null)

  const mutation = useMutation({
    mutationFn: async (input: SaveConfigData): Promise<MvneCalculatorConfig> => {
      setError(null)

      const payload = {
        name: input.name.trim(),
        description: input.description?.trim() || null,
        capacity_inputs: input.capacity_inputs,
        sku_quantities: input.sku_quantities,
        sku_discounts: input.sku_discounts,
        sku_overrides: input.sku_overrides,
        external_costs: input.external_costs,
      }

      if (!payload.name) {
        throw new Error('Config name is required')
      }

      if (input.id) {
        // Update existing config
        const { data, error } = await supabase
          .from('mvne_calculator_configs')
          .update(payload)
          .eq('id', input.id)
          .select()
          .single()

        if (error) throw error
        return data as MvneCalculatorConfig
      } else {
        // Insert new config
        const { data, error } = await supabase
          .from('mvne_calculator_configs')
          .insert(payload)
          .select()
          .single()

        if (error) throw error
        return data as MvneCalculatorConfig
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: MVNE_CONFIGS_KEY })
      if (data.id) {
        queryClient.invalidateQueries({ queryKey: mvneConfigKey(data.id) })
      }
    },
    onError: (err: Error) => {
      setError(err)
    },
  })

  return {
    saveConfig: mutation.mutateAsync,
    saving: mutation.isPending,
    error: error ?? mutation.error,
  }
}

// ---------------------------------------------------------------------------
// useMvneDeleteConfig — delete a config by ID
// ---------------------------------------------------------------------------

export function useMvneDeleteConfig() {
  const queryClient = useQueryClient()
  const [error, setError] = useState<Error | null>(null)

  const mutation = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      setError(null)

      const { error } = await supabase
        .from('mvne_calculator_configs')
        .delete()
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MVNE_CONFIGS_KEY })
    },
    onError: (err: Error) => {
      setError(err)
    },
  })

  return {
    deleteConfig: mutation.mutateAsync,
    deleting: mutation.isPending,
    error: error ?? mutation.error,
  }
}
