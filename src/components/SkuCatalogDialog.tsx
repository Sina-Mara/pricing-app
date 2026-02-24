/**
 * SkuCatalogDialog
 *
 * Modal dialog for browsing and bulk-adding SKUs to a quote package.
 * SKUs are grouped by category (CAS, CNO, CCS, Default) with search
 * filtering, multi-select checkboxes, and select-all functionality.
 */

import { useState, useMemo, useEffect } from 'react'
import { CheckSquare, Square, Search, Loader2, ChevronDown, ChevronRight } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import type { Sku, SkuCategory } from '@/types/database'

// =============================================================================
// Types
// =============================================================================

export interface SkuCatalogDialogProps {
  isOpen: boolean
  onClose: () => void
  skus: Sku[]
  existingSkuIds: Set<string>
  onAddSkus: (skuIds: string[]) => void
  isAdding?: boolean
}

// =============================================================================
// Constants
// =============================================================================

const CATEGORY_ORDER: SkuCategory[] = ['cas', 'cno', 'ccs', 'default']

const CATEGORY_LABELS: Record<SkuCategory, string> = {
  cas: 'CAS — Connectivity as a Service',
  cno: 'CNO — Cloud Network Operations',
  ccs: 'CCS — Cloud Core Services',
  default: 'Default',
}

// =============================================================================
// SkuRow Component
// =============================================================================

interface SkuRowProps {
  sku: Sku
  isSelected: boolean
  isExisting: boolean
  onToggle: () => void
}

function SkuRow({ sku, isSelected, isExisting, onToggle }: SkuRowProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-md transition-all',
        isExisting
          ? 'opacity-50 cursor-default'
          : 'cursor-pointer hover:bg-muted/50',
        isSelected && !isExisting && 'bg-primary/5 ring-1 ring-primary/20',
      )}
      onClick={isExisting ? undefined : onToggle}
    >
      {/* Checkbox */}
      <div className="flex-shrink-0">
        {isExisting ? (
          <CheckSquare className="h-4 w-4 text-muted-foreground" />
        ) : isSelected ? (
          <CheckSquare className="h-4 w-4 text-primary" />
        ) : (
          <Square className="h-4 w-4 text-muted-foreground" />
        )}
      </div>

      {/* SKU info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <code className="text-sm font-medium">{sku.code}</code>
          {isExisting && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Added</Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground truncate">{sku.description}</p>
      </div>

      {/* Unit */}
      <span className="text-xs text-muted-foreground flex-shrink-0">{sku.unit}</span>
    </div>
  )
}

// =============================================================================
// Main Component
// =============================================================================

export function SkuCatalogDialog({
  isOpen,
  onClose,
  skus,
  existingSkuIds,
  onAddSkus,
  isAdding = false,
}: SkuCatalogDialogProps) {
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setSearch('')
      setSelectedIds(new Set())
    }
  }, [isOpen])

  // Filter SKUs by search (code or description)
  const filteredSkus = useMemo(() => {
    if (!search.trim()) return skus
    const q = search.toLowerCase()
    return skus.filter(
      (sku) =>
        sku.code.toLowerCase().includes(q) ||
        sku.description.toLowerCase().includes(q),
    )
  }, [skus, search])

  // Group filtered SKUs by category, then split into base vs usage
  const groupedSkus = useMemo(() => {
    const groups = new Map<SkuCategory, { base: Sku[]; usage: Sku[] }>()
    for (const cat of CATEGORY_ORDER) {
      const items = filteredSkus.filter((s) => s.category === cat)
      if (items.length > 0) {
        groups.set(cat, {
          base: items.filter((s) => s.is_base_charge),
          usage: items.filter((s) => !s.is_base_charge),
        })
      }
    }
    return groups
  }, [filteredSkus])

  // Selectable SKUs = filtered minus already-existing
  const selectableSkus = useMemo(
    () => filteredSkus.filter((s) => !existingSkuIds.has(s.id)),
    [filteredSkus, existingSkuIds],
  )

  const allSelectableSelected =
    selectableSkus.length > 0 && selectableSkus.every((s) => selectedIds.has(s.id))

  // Handlers
  const handleToggleSku = (skuId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(skuId)) {
        next.delete(skuId)
      } else {
        next.add(skuId)
      }
      return next
    })
  }

  const handleSelectAll = () => {
    if (allSelectableSelected) {
      // Deselect all visible selectable
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (const s of selectableSkus) next.delete(s.id)
        return next
      })
    } else {
      // Select all visible selectable
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (const s of selectableSkus) next.add(s.id)
        return next
      })
    }
  }

  const handleAdd = () => {
    if (selectedIds.size === 0) return
    onAddSkus(Array.from(selectedIds))
  }

  const handleClose = () => {
    if (!isAdding) onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add SKUs to Package</DialogTitle>
          <DialogDescription>
            Select SKUs from the catalog to add to this package.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-3 py-2">
          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by code or description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Header: Select All + count */}
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSelectAll}
              disabled={selectableSkus.length === 0}
              className="h-8"
            >
              {allSelectableSelected ? (
                <>
                  <CheckSquare className="mr-2 h-4 w-4" />
                  Deselect All
                </>
              ) : (
                <>
                  <Square className="mr-2 h-4 w-4" />
                  Select All ({selectableSkus.length})
                </>
              )}
            </Button>

            {selectedIds.size > 0 && (
              <Badge variant="secondary">
                {selectedIds.size} selected
              </Badge>
            )}
          </div>

          <Separator />

          {/* Category groups */}
          <div className="flex-1 overflow-y-auto space-y-1 pr-1">
            {groupedSkus.size === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm">
                No SKUs match your search.
              </div>
            ) : (
              Array.from(groupedSkus.entries()).map(([category, { base, usage }]) => (
                <Collapsible key={category} defaultOpen>
                  <CollapsibleTrigger className="flex w-full items-center gap-2 px-2 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors group">
                    <ChevronDown className="h-4 w-4 transition-transform group-data-[state=closed]:hidden" />
                    <ChevronRight className="h-4 w-4 transition-transform group-data-[state=open]:hidden" />
                    {CATEGORY_LABELS[category]}
                    <Badge variant="outline" className="ml-auto text-[10px]">
                      {base.length + usage.length}
                    </Badge>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="ml-2 space-y-2">
                    {base.length > 0 && (
                      <div>
                        <div className="px-3 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          Base Charges
                        </div>
                        <div className="space-y-0.5">
                          {base.map((sku) => (
                            <SkuRow
                              key={sku.id}
                              sku={sku}
                              isSelected={selectedIds.has(sku.id)}
                              isExisting={existingSkuIds.has(sku.id)}
                              onToggle={() => handleToggleSku(sku.id)}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    {usage.length > 0 && (
                      <div>
                        <div className="px-3 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          Usage
                        </div>
                        <div className="space-y-0.5">
                          {usage.map((sku) => (
                            <SkuRow
                              key={sku.id}
                              sku={sku}
                              isSelected={selectedIds.has(sku.id)}
                              isExisting={existingSkuIds.has(sku.id)}
                              onToggle={() => handleToggleSku(sku.id)}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </CollapsibleContent>
                </Collapsible>
              ))
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isAdding}>
            Cancel
          </Button>
          <Button
            onClick={handleAdd}
            disabled={selectedIds.size === 0 || isAdding}
          >
            {isAdding ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Adding...
              </>
            ) : (
              <>Add {selectedIds.size} SKU{selectedIds.size !== 1 ? 's' : ''}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default SkuCatalogDialog
