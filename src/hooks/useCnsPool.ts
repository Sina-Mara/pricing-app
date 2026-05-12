import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { CnsPoolRow } from '@/types/database'

const CNS_POOL_KEY = ['cns-pool'] as const

export function computeSharePct(rows: CnsPoolRow[], row: CnsPoolRow): number {
  if (row.share_pct_override !== null) return row.share_pct_override
  const totalNodes = rows.reduce((s, r) => s + r.nodes, 0)
  return totalNodes > 0 ? (row.nodes / totalNodes) * 100 : 0
}

export function useCnsPool() {
  const {
    data: rows,
    isLoading: loading,
    error,
  } = useQuery({
    queryKey: CNS_POOL_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cns_pool')
        .select('*')
        .order('name')

      if (error) throw error
      return data as CnsPoolRow[]
    },
  })

  return { rows: rows ?? [], loading, error }
}

export function useUpsertCnsRow() {
  const queryClient = useQueryClient()

  const {
    mutateAsync: upsert,
    isPending: saving,
    error,
  } = useMutation({
    mutationFn: async (row: Partial<CnsPoolRow> & { name: string; nodes: number }) => {
      if (row.id) {
        const { id, created_at, updated_at, ...rest } = row as CnsPoolRow
        const { error } = await supabase
          .from('cns_pool')
          .update({ ...rest, updated_at: new Date().toISOString() })
          .eq('id', id)
        if (error) throw error
      } else {
        const { id: _id, created_at: _ca, updated_at: _ua, ...rest } = row as Partial<CnsPoolRow>
        const { error } = await supabase.from('cns_pool').insert([rest])
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CNS_POOL_KEY })
    },
  })

  return { upsert, saving, error }
}

export function useDeleteCnsRow() {
  const queryClient = useQueryClient()

  const {
    mutateAsync: deleteRow,
    isPending: deleting,
    error,
  } = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('cns_pool').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CNS_POOL_KEY })
    },
  })

  return { deleteRow, deleting, error }
}
