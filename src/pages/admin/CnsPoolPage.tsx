import { useState, useRef } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useToast } from '@/hooks/use-toast'
import { useCnsPool, useUpsertCnsRow, useDeleteCnsRow, computeSharePct } from '@/hooks/useCnsPool'
import type { CnsPoolRow } from '@/types/database'
import { Plus, Trash2, AlertTriangle } from 'lucide-react'

interface DraftRow {
  id?: string
  name: string
  nodes: number
  share_pct_override: number | null
  is_this_customer: boolean
}

function toDraft(row: CnsPoolRow): DraftRow {
  return {
    id: row.id,
    name: row.name,
    nodes: row.nodes,
    share_pct_override: row.share_pct_override,
    is_this_customer: row.is_this_customer,
  }
}

export default function CnsPoolPage() {
  const { rows, loading } = useCnsPool()
  const { upsert, saving } = useUpsertCnsRow()
  const { deleteRow, deleting } = useDeleteCnsRow()
  const { toast } = useToast()

  const [drafts, setDrafts] = useState<Record<string, DraftRow>>({})
  const [newRow, setNewRow] = useState<DraftRow | null>(null)
  const newRowKey = '__new__'
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const getDraft = (row: CnsPoolRow): DraftRow => drafts[row.id] ?? toDraft(row)

  const updateDraft = (id: string, patch: Partial<DraftRow>) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? toDraft(rows.find((r) => r.id === id)!)), ...patch },
    }))
  }

  const saveRow = async (draft: DraftRow) => {
    if (!draft.name.trim()) {
      toast({ variant: 'destructive', title: 'Name is required' })
      return
    }
    try {
      await upsert({
        ...(draft.id ? { id: draft.id } : {}),
        name: draft.name.trim(),
        nodes: draft.nodes,
        share_pct_override: draft.share_pct_override,
        is_this_customer: draft.is_this_customer,
      })
      if (!draft.id) {
        setNewRow(null)
      } else {
        setDrafts((prev) => {
          const next = { ...prev }
          delete next[draft.id!]
          return next
        })
      }
      toast({ title: draft.id ? 'Row updated' : 'Row added' })
    } catch (err: unknown) {
      toast({
        variant: 'destructive',
        title: 'Save failed',
        description: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const handleDelete = async (row: CnsPoolRow) => {
    if (!confirm(`Delete "${row.name}"? This cannot be undone.`)) return
    try {
      await deleteRow(row.id)
      toast({ title: 'Row deleted' })
    } catch (err: unknown) {
      toast({
        variant: 'destructive',
        title: 'Delete failed',
        description: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const handleThisCustomer = async (row: CnsPoolRow) => {
    try {
      await upsert({
        id: row.id,
        name: row.name,
        nodes: row.nodes,
        share_pct_override: row.share_pct_override,
        is_this_customer: true,
      })
      toast({ title: `"${row.name}" marked as this customer` })
    } catch (err: unknown) {
      toast({
        variant: 'destructive',
        title: 'Failed to update',
        description: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const addNewRow = () => {
    setNewRow({
      name: '',
      nodes: 0,
      share_pct_override: null,
      is_this_customer: false,
    })
    setTimeout(() => {
      inputRefs.current[`${newRowKey}-name`]?.focus()
    }, 50)
  }

  const overrideRows = rows.filter((r) => r.share_pct_override !== null)
  const overrideSum = overrideRows.reduce((s, r) => s + (r.share_pct_override ?? 0), 0)
  const showOverrideWarning =
    overrideRows.length > 0 && Math.abs(overrideSum - 100) > 0.01

  const totalNodes = rows.reduce((s, r) => s + r.nodes, 0)

  const renderOverrideInput = (
    key: string,
    value: number | null,
    onChange: (v: number | null) => void,
    onBlur: () => void
  ) => (
    <Input
      ref={(el) => { inputRefs.current[`${key}-override`] = el }}
      type="number"
      min={0}
      max={100}
      step={0.01}
      placeholder="auto"
      value={value ?? ''}
      className="w-28 h-8 text-sm"
      onChange={(e) => {
        const raw = e.target.value
        onChange(raw === '' ? null : parseFloat(raw))
      }}
      onBlur={onBlur}
      onKeyDown={(e) => { if (e.key === 'Enter') onBlur() }}
    />
  )

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">CNS Pool</h1>
        <p className="text-muted-foreground">
          Manage cost-sharing participants and their node counts
        </p>
      </div>

      {showOverrideWarning && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-yellow-800 dark:border-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-300">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="text-sm">
            Override percentages sum to <strong>{overrideSum.toFixed(2)}%</strong> — adjust them
            to reach 100%.
          </p>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Pool Members</CardTitle>
              <CardDescription>{rows.length} participant{rows.length !== 1 ? 's' : ''}</CardDescription>
            </div>
            <Button onClick={addNewRow} disabled={newRow !== null}>
              <Plus className="mr-2 h-4 w-4" />
              Add Row
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-28">Nodes</TableHead>
                  <TableHead className="w-32">Computed %</TableHead>
                  <TableHead className="w-36">Override %</TableHead>
                  <TableHead className="w-36 text-center">This Customer</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const draft = getDraft(row)
                  const computed = computeSharePct(rows, row)

                  return (
                    <TableRow key={row.id}>
                      <TableCell>
                        <Input
                          ref={(el) => { inputRefs.current[`${row.id}-name`] = el }}
                          value={draft.name}
                          className="h-8 text-sm"
                          onChange={(e) => updateDraft(row.id, { name: e.target.value })}
                          onBlur={() => saveRow(draft)}
                          onKeyDown={(e) => { if (e.key === 'Enter') saveRow(draft) }}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          value={draft.nodes}
                          className="w-24 h-8 text-sm"
                          onChange={(e) =>
                            updateDraft(row.id, { nodes: parseInt(e.target.value) || 0 })
                          }
                          onBlur={() => saveRow(draft)}
                          onKeyDown={(e) => { if (e.key === 'Enter') saveRow(draft) }}
                        />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {computed.toFixed(2)}%
                      </TableCell>
                      <TableCell>
                        {renderOverrideInput(
                          row.id,
                          draft.share_pct_override,
                          (v) => updateDraft(row.id, { share_pct_override: v }),
                          () => saveRow(draft)
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <input
                          type="radio"
                          name="is_this_customer"
                          checked={row.is_this_customer}
                          onChange={() => handleThisCustomer(row)}
                          className="h-4 w-4 accent-primary cursor-pointer"
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={deleting}
                          onClick={() => handleDelete(row)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}

                {newRow && (
                  <TableRow className="bg-muted/30">
                    <TableCell>
                      <Input
                        ref={(el) => { inputRefs.current[`${newRowKey}-name`] = el }}
                        placeholder="Name"
                        value={newRow.name}
                        className="h-8 text-sm"
                        onChange={(e) => setNewRow({ ...newRow, name: e.target.value })}
                        onBlur={() => saveRow(newRow)}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveRow(newRow) }}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        value={newRow.nodes}
                        className="w-24 h-8 text-sm"
                        onChange={(e) =>
                          setNewRow({ ...newRow, nodes: parseInt(e.target.value) || 0 })
                        }
                        onBlur={() => saveRow(newRow)}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveRow(newRow) }}
                      />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">—</TableCell>
                    <TableCell>
                      {renderOverrideInput(
                        newRowKey,
                        newRow.share_pct_override,
                        (v) => setNewRow({ ...newRow, share_pct_override: v }),
                        () => saveRow(newRow)
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <input
                        type="radio"
                        name="is_this_customer"
                        checked={false}
                        onChange={() => {}}
                        disabled
                        className="h-4 w-4 cursor-not-allowed opacity-40"
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setNewRow(null)}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </TableCell>
                  </TableRow>
                )}

                {rows.length === 0 && !newRow && (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                      No pool members yet — add one to get started.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardContent className="pt-4 text-sm text-muted-foreground flex items-center gap-6">
          <span>
            Total nodes: <strong className="text-foreground">{totalNodes}</strong>
          </span>
          <span>Computed shares sum to 100% automatically.</span>
          {saving && <span className="ml-auto text-xs">Saving…</span>}
        </CardContent>
      </Card>
    </div>
  )
}
