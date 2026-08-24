/**
 * Shared Solution → Application → Component ordering for quote line items.
 *
 * Mirrors the grouping logic already used inline in QuoteBuilder.tsx (SPEC-009)
 * and QuotePresent.tsx (SPEC-019) — factored out here so the PDF export
 * (SPEC-022) can produce the same item order/structure without a third
 * hand-rolled copy. QuoteBuilder's own inline implementation is intentionally
 * left as-is; this utility is a new shared consumer, not a replacement.
 */

interface GroupableSku {
  category?: string | null
  application?: string | null
  component?: string | null
  is_base_charge?: boolean | null
  is_direct_cost?: boolean | null
}

interface GroupableItem {
  id: string
  sku?: GroupableSku | null
}

export type GroupLevel = 'solution' | 'application' | 'component' | 'category'

export type GroupedRow<T extends GroupableItem> =
  | { type: 'header'; key: string; label: string; level: GroupLevel }
  | { type: 'item'; key: string; item: T }

const APP_ORDER = ['Cennso', 'Packet Gateway', 'Local Breakouts']
const COMPONENT_ORDER = ['Cennso', 'SMC', 'UPG', 'TPOSS', 'LLM', 'HRS']
const CATEGORY_ORDER: Array<'cas' | 'cno' | 'default'> = ['cas', 'cno', 'default']
const CATEGORY_LABELS: Record<string, string> = { cas: 'CAS', cno: 'CNO', default: 'Other' }

export function groupQuoteItems<T extends GroupableItem>(items: T[]): GroupedRow<T>[] {
  const rows: GroupedRow<T>[] = []

  const ccsItems = items.filter((i) => i.sku?.category === 'ccs')
  const appItems = items.filter((i) => i.sku?.application)
  const otherItems = items.filter((i) => !i.sku?.application && i.sku?.category !== 'ccs')

  // 1. Solution anchor (CCS)
  if (ccsItems.length > 0) {
    rows.push({ type: 'header', key: 'solution-header', label: 'Solution', level: 'solution' })
    ccsItems.forEach((item) => rows.push({ type: 'item', key: item.id, item }))
  }

  // 2. Application → Component groups
  if (appItems.length > 0) {
    const seenApps = new Set<string>()
    const apps = [
      ...APP_ORDER.filter((a) => appItems.some((i) => i.sku?.application === a)),
      ...appItems
        .map((i) => i.sku?.application as string)
        .filter((a) => !APP_ORDER.includes(a) && !seenApps.has(a) && (seenApps.add(a), true)),
    ]

    for (const app of apps) {
      const appGroupItems = appItems.filter((i) => i.sku?.application === app)
      rows.push({ type: 'header', key: `app-${app}`, label: app, level: 'application' })

      const seenComps = new Set<string>()
      const components = [
        ...COMPONENT_ORDER.filter((c) => appGroupItems.some((i) => i.sku?.component === c)),
        ...appGroupItems
          .map((i) => i.sku?.component as string)
          .filter((c) => c && !COMPONENT_ORDER.includes(c) && !seenComps.has(c) && (seenComps.add(c), true)),
      ]

      for (const comp of components) {
        const compItems = appGroupItems.filter((i) => i.sku?.component === comp)
        const compBase = compItems.filter((i) => i.sku?.is_base_charge)
        const compUsage = compItems.filter((i) => !i.sku?.is_base_charge && !i.sku?.is_direct_cost)
        const compDirect = compItems.filter((i) => !i.sku?.is_base_charge && i.sku?.is_direct_cost)

        rows.push({ type: 'header', key: `comp-${app}-${comp}`, label: comp, level: 'component' })
        compBase.forEach((item) => rows.push({ type: 'item', key: item.id, item }))
        compUsage.forEach((item) => rows.push({ type: 'item', key: item.id, item }))
        compDirect.forEach((item) => rows.push({ type: 'item', key: item.id, item }))
      }
    }
  }

  // 3. Fallback: items with no application (CNO etc.), grouped by category
  if (otherItems.length > 0) {
    for (const cat of CATEGORY_ORDER) {
      const catItems = otherItems.filter((i) => (i.sku?.category || 'default') === cat)
      if (catItems.length === 0) continue

      rows.push({ type: 'header', key: `cat-${cat}`, label: CATEGORY_LABELS[cat], level: 'category' })

      const baseItems = catItems.filter((i) => i.sku?.is_base_charge)
      const usageItems = catItems.filter((i) => !i.sku?.is_base_charge && !i.sku?.is_direct_cost)
      const directItems = catItems.filter((i) => !i.sku?.is_base_charge && i.sku?.is_direct_cost)
      baseItems.forEach((item) => rows.push({ type: 'item', key: item.id, item }))
      usageItems.forEach((item) => rows.push({ type: 'item', key: item.id, item }))
      directItems.forEach((item) => rows.push({ type: 'item', key: item.id, item }))
    }
  }

  return rows
}
