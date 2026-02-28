import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, invokeEdgeFunction } from '@/lib/supabase'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { useToast } from '@/hooks/use-toast'
import {
  Plus,
  Trash2,
  Calculator,
  Save,
  ChevronDown,
  ChevronRight,
  Package,
  FileDown,
  Copy,
  GitBranch,
  TrendingUp,
  MoreHorizontal,
  Repeat,
  Lock,
} from 'lucide-react'
import { formatCurrency, formatPercent, getStatusColor } from '@/lib/utils'
import type {
  Quote,
  QuotePackage,
  QuoteItem,
  Customer,
  Sku,
  QuoteStatus,
  QuoteType,
  SolutionWrapper,
  CalculatePricingResponse,
  ForecastSkuMapping,
  ForecastKpiType,
  ForecastScenario,
} from '@/types/database'
import { generateQuotePDF } from '@/lib/pdf'
import { QuickQuantityInput } from '@/components/QuickQuantityInput'
import { CommitmentStrategyPicker, CommitmentModeSelector, PerPeriodPreview } from '@/components/CommitmentStrategyPicker'
import type { CommitmentMode } from '@/components/CommitmentStrategyPicker'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  type CommitmentSizingStrategy,
  type ManualSkuItem,
  generateMultiModeCommitmentQuote,
  generatePerPeriodPayPerUseQuote,
  getTermTierLabel,
  extractYearsFromScenarios,
} from '@/lib/quote-generator'
import { ManualSkuInput } from '@/components/ManualSkuInput'
import { SkuCatalogDialog } from '@/components/SkuCatalogDialog'
import { AlertTriangle, Settings2 } from 'lucide-react'

const statusOptions: QuoteStatus[] = ['draft', 'pending', 'sent', 'accepted', 'rejected', 'expired', 'ordered']
const termOptions = [1, 12, 24, 36, 48, 60]

/** Pay-per-use quotes use 1-month term (no commitment) */
const PAY_PER_USE_TERM = 1
/** Default term for commitment quotes */
const DEFAULT_COMMITMENT_TERM = 36

interface ForecastResults {
  udr: number
  pcs: number
  ccs: number
  scs: number
  cos: number
  throughputPeak: number
  throughputAverage: number
  dataVolumeGb: number
}

interface LocationState {
  fromForecast?: boolean
  scenarioId?: string
  /** Multiple scenario IDs for multi-year/multi-scenario quotes */
  scenarioIds?: string[]
  customerId?: string
  forecastResults?: ForecastResults
  scenarioName?: string
  quoteType?: QuoteType
}

export default function QuoteBuilder() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const locationState = location.state as LocationState | null
  const isNew = !id || id === 'new'
  const fromForecast = locationState?.fromForecast || false

  const [expandedPackages, setExpandedPackages] = useState<Set<string>>(new Set())
  const [showAddPackage, setShowAddPackage] = useState(false)
  const [showVersionDialog, setShowVersionDialog] = useState(false)
  const [newPackageName, setNewPackageName] = useState('')
  const [newPackageTerm, setNewPackageTerm] = useState(12)
  const [versionName, setVersionName] = useState('')
  const [calculating, setCalculating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [applyingForecast, setApplyingForecast] = useState(false)
  const [autoCalculate, setAutoCalculate] = useState(true)
  const [pendingCalculation, setPendingCalculation] = useState(false)

  // Commitment strategy state (for multi-scenario quotes)
  const [commitmentStrategy, setCommitmentStrategy] = useState<CommitmentSizingStrategy>('peak')
  const [specificYear, setSpecificYear] = useState<number | undefined>(undefined)
  const [selectedTermMonths, setSelectedTermMonths] = useState(DEFAULT_COMMITMENT_TERM)
  const [commitmentMode, setCommitmentMode] = useState<CommitmentMode>('max')

  // Manual SKU quantities for unmapped infrastructure SKUs
  const [manualSkuItems, setManualSkuItems] = useState<ManualSkuItem[]>([])

  // SKU catalog dialog state
  const [skuCatalogPackageId, setSkuCatalogPackageId] = useState<string | null>(null)

  // Check if we have multiple scenarios
  const hasMultipleScenarios = (locationState?.scenarioIds?.length || 0) > 1

  // Fetch quote data
  const { data: quote, isLoading: quoteLoading, refetch: refetchQuote } = useQuery({
    queryKey: ['quote', id],
    queryFn: async () => {
      if (isNew) return null

      const { data, error } = await supabase
        .from('quotes')
        .select(`
          *,
          customer:customers(*),
          quote_packages(
            *,
            quote_items(
              *,
              sku:skus(*)
            )
          )
        `)
        .eq('id', id)
        .single()

      if (error) throw error
      return data as Quote & {
        customer: Customer | null
        quote_packages: (QuotePackage & { quote_items: (QuoteItem & { sku: Sku })[] })[]
        version_group_id?: string | null
        version_number?: number
        version_name?: string | null
        source_scenario_id?: string | null
      }
    },
    enabled: !isNew,
  })

  // Fetch customers
  const { data: customers } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('is_active', true)
        .order('name')

      if (error) throw error
      return data as Customer[]
    },
  })

  // Fetch SKUs
  const { data: skus } = useQuery({
    queryKey: ['skus'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('skus')
        .select('*')
        .eq('is_active', true)
        .order('code')

      if (error) throw error
      return data as Sku[]
    },
  })

  // Fetch forecast SKU mappings
  const { data: forecastMappings = [] } = useQuery({
    queryKey: ['forecast-sku-mappings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('forecast_sku_mappings')
        .select('*, sku:skus(*)')
        .eq('is_active', true)
        .order('sort_order')
      if (error) throw error
      return data as (ForecastSkuMapping & { sku: Sku })[]
    },
    enabled: fromForecast,
  })

  // Fetch scenarios when we have multiple scenario IDs (for strategy picker)
  const { data: scenarios = [] } = useQuery({
    queryKey: ['forecast-scenarios-for-quote', locationState?.scenarioIds],
    queryFn: async () => {
      if (!locationState?.scenarioIds || locationState.scenarioIds.length === 0) return []
      const { data, error } = await supabase
        .from('forecast_scenarios')
        .select('*')
        .in('id', locationState.scenarioIds)
      if (error) throw error
      return data as ForecastScenario[]
    },
    enabled: hasMultipleScenarios,
  })

  // Extract available years from scenarios
  const availableYears = extractYearsFromScenarios(scenarios)

  // Check if SKU mappings are configured (important for forecast-based quotes)
  const hasSkuMappings = forecastMappings.length > 0
  const showSkuMappingWarning = fromForecast && isNew && !hasSkuMappings

  // Fetch other versions of this quote
  const { data: quoteVersions = [] } = useQuery({
    queryKey: ['quote-versions', quote?.version_group_id],
    queryFn: async () => {
      if (!quote?.version_group_id) return []
      const { data, error } = await supabase
        .from('quotes')
        .select('id, quote_number, version_number, version_name, status, total_monthly')
        .eq('version_group_id', quote.version_group_id)
        .order('version_number')
      if (error) throw error
      return data
    },
    enabled: !!quote?.version_group_id,
  })

  // Form state
  const [formData, setFormData] = useState({
    customer_id: '',
    title: '',
    status: 'draft' as QuoteStatus,
    quote_type: (locationState?.quoteType || 'commitment') as QuoteType,
    solution_wrapper: 'standard' as SolutionWrapper,
    valid_until: '',
    use_aggregated_pricing: true,
    base_usage_ratio: 0.60,
    notes: '',
  })

  // Update form when quote loads
  useEffect(() => {
    if (quote) {
      setFormData({
        customer_id: quote.customer_id || '',
        title: quote.title || '',
        status: quote.status,
        quote_type: quote.quote_type || 'commitment',
        solution_wrapper: (quote.solution_wrapper as SolutionWrapper) || 'standard',
        valid_until: quote.valid_until || '',
        use_aggregated_pricing: quote.use_aggregated_pricing,
        base_usage_ratio: quote.base_usage_ratio ?? 0.60,
        notes: quote.notes || '',
      })
      // Expand all packages by default
      setExpandedPackages(new Set(quote.quote_packages.map(p => p.id)))
    }
  }, [quote])

  // Check if quote has any CAS category SKUs (for base/usage ratio control)
  const hasCasSkus = useMemo(() => {
    if (!quote?.quote_packages) return false
    return quote.quote_packages.some(pkg =>
      pkg.quote_items?.some(item => item.sku?.category === 'cas')
    )
  }, [quote?.quote_packages])

  // Pre-fill from forecast when coming from Forecast Evaluator
  useEffect(() => {
    if (fromForecast && locationState?.customerId) {
      setFormData(prev => ({
        ...prev,
        customer_id: locationState.customerId || '',
        title: locationState.scenarioName ? `Quote from ${locationState.scenarioName}` : '',
      }))
    }
  }, [fromForecast, locationState])

  // Create new quote
  const createQuote = useMutation({
    mutationFn: async () => {
      // For multi-scenario commitment quotes, use the generateMultiModeCommitmentQuote function
      console.log('[QuoteBuilder] createQuote called:', {
        hasMultipleScenarios,
        quoteType: formData.quote_type,
        scenariosLength: scenarios.length,
        commitmentMode,
        commitmentStrategy,
        selectedTermMonths,
      })
      // Filter manual items to those with qty > 0
      const activeManualItems = manualSkuItems.filter(
        i => i.quantity > 0 || Object.values(i.perYearQuantities ?? {}).some(q => q > 0)
      )

      if (hasMultipleScenarios && formData.quote_type === 'commitment' && scenarios.length > 0) {
        console.log('[QuoteBuilder] Entering multi-scenario commitment path with mode:', commitmentMode)
        const result = await generateMultiModeCommitmentQuote({
          scenarios,
          customerId: formData.customer_id || undefined,
          commitmentMode,
          strategy: commitmentStrategy,
          termMonths: selectedTermMonths,
          title: formData.title || undefined,
          notes: formData.notes || undefined,
          manualItems: activeManualItems.length > 0 ? activeManualItems : undefined,
        })
        return {
          id: result.quoteId,
          quote_number: result.quoteNumber,
          _multiScenario: true as const,
          _packageCount: result.packageCount,
          _quoteType: 'commitment' as const,
        }
      }

      // For multi-scenario pay-per-use quotes, use generatePerPeriodPayPerUseQuote
      if (hasMultipleScenarios && formData.quote_type === 'pay_per_use' && scenarios.length > 0) {
        const result = await generatePerPeriodPayPerUseQuote(
          scenarios,
          formData.customer_id || undefined,
          formData.title || undefined,
          formData.notes || undefined,
          activeManualItems.length > 0 ? activeManualItems : undefined,
        )
        return {
          id: result.quoteId,
          quote_number: result.quoteNumber,
          _multiScenario: true as const,
          _packageCount: result.packageCount,
          _quoteType: 'pay_per_use' as const,
        }
      }

      // Standard quote creation for single scenario or non-forecast quotes
      const versionGroupId = crypto.randomUUID()
      // For pay-per-use quotes, default to non-aggregated pricing (each period priced independently)
      const useAggregatedPricing = formData.quote_type === 'pay_per_use'
        ? false
        : formData.use_aggregated_pricing
      const { data, error } = await supabase
        .from('quotes')
        .insert({
          customer_id: formData.customer_id || null,
          title: formData.title || null,
          status: formData.status,
          quote_type: formData.quote_type,
          solution_wrapper: formData.solution_wrapper,
          valid_until: formData.valid_until || null,
          use_aggregated_pricing: useAggregatedPricing,
          base_usage_ratio: formData.base_usage_ratio,
          notes: formData.notes || null,
          version_group_id: versionGroupId,
          version_number: 1,
          source_scenario_id: locationState?.scenarioId || null,
        })
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: async (data: any) => {
      // For multi-scenario quotes, the quote is already fully created
      if (data._multiScenario) {
        const pkgCount = data._packageCount as number
        if (data._quoteType === 'commitment') {
          toast({
            title: 'Commitment quote created',
            description: pkgCount === 1
              ? `Created quote with 1 package using ${commitmentStrategy} strategy with ${selectedTermMonths}-month term.`
              : `Created quote with ${pkgCount} yearly packages, each with a 12-month term.`,
          })
        } else {
          toast({
            title: 'Pay-per-use quote created',
            description: `Created quote with ${pkgCount} monthly package${pkgCount !== 1 ? 's' : ''}.`,
          })
        }
        navigate(`/quotes/${data.id}`, { replace: true })
        return
      }

      toast({ title: 'Quote created' })

      // If coming from forecast (single scenario), auto-create package and items
      if (fromForecast && locationState?.forecastResults) {
        await applyForecastToQuote(data.id, locationState.forecastResults, formData.quote_type)
      }

      navigate(`/quotes/${data.id}`, { replace: true })
    },
    onError: (error) => {
      toast({ variant: 'destructive', title: 'Failed to create quote', description: error.message })
    },
  })

  // Apply forecast mappings to quote
  const applyForecastToQuote = async (quoteId: string, results: ForecastResults, quoteType: QuoteType) => {
    setApplyingForecast(true)
    try {
      // Determine term based on quote type
      // Pay-per-use: 1-month term (no commitment, no term discounts)
      // Commitment: use selected term (from term selector)
      const termMonths = quoteType === 'pay_per_use' ? PAY_PER_USE_TERM : selectedTermMonths

      // Create a package for the forecast items
      const { data: pkg, error: pkgError } = await supabase
        .from('quote_packages')
        .insert({
          quote_id: quoteId,
          package_name: locationState?.scenarioName || (quoteType === 'pay_per_use' ? 'Pay-per-Use Package' : 'Forecast-based Package'),
          term_months: termMonths,
          status: 'new',
          sort_order: 1,
        })
        .select()
        .single()

      if (pkgError) throw pkgError

      // Map forecast results to KPI types
      const kpiValues: Record<ForecastKpiType, number> = {
        udr: results.udr,
        pcs: results.pcs,
        ccs: results.ccs,
        scs: results.scs,
        cos: results.cos,
        peak_throughput: results.throughputPeak,
        avg_throughput: results.throughputAverage,
      }

      // Create line items based on active mappings
      const itemsToCreate = forecastMappings
        .filter(m => m.is_active && kpiValues[m.kpi_type] !== undefined)
        .map((mapping, index) => ({
          package_id: pkg.id,
          sku_id: mapping.sku_id,
          quantity: Math.ceil(kpiValues[mapping.kpi_type] * mapping.multiplier),
          environment: 'production' as const,
          sort_order: index + 1,
          notes: `Auto-generated from forecast (${mapping.kpi_type.toUpperCase()})`,
        }))

      if (itemsToCreate.length > 0) {
        const { error: itemsError } = await supabase
          .from('quote_items')
          .insert(itemsToCreate)

        if (itemsError) throw itemsError
      }

      // Trigger pricing calculation immediately for pay-per-use quotes
      if (quoteType === 'pay_per_use') {
        try {
          await invokeEdgeFunction<CalculatePricingResponse>(
            'calculate-pricing',
            { action: 'calculate_quote', quote_id: quoteId }
          )
        } catch (pricingError) {
          console.warn('Initial pricing calculation failed:', pricingError)
        }
      }

      toast({
        title: 'Forecast applied',
        description: `Created ${itemsToCreate.length} line items from forecast data${quoteType === 'pay_per_use' ? ' (Pay-per-Use, 1-month term)' : ` (${termMonths}-month term)`}.`,
      })

      // Refetch quote data
      queryClient.invalidateQueries({ queryKey: ['quote', quoteId] })
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to apply forecast',
        description: error.message,
      })
    } finally {
      setApplyingForecast(false)
    }
  }

  // Update quote
  const updateQuote = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('quotes')
        .update({
          customer_id: formData.customer_id || null,
          title: formData.title || null,
          status: formData.status,
          quote_type: formData.quote_type,
          solution_wrapper: formData.solution_wrapper,
          valid_until: formData.valid_until || null,
          use_aggregated_pricing: formData.use_aggregated_pricing,
          base_usage_ratio: formData.base_usage_ratio,
          notes: formData.notes || null,
        })
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: () => {
      toast({ title: 'Quote saved' })
      refetchQuote()
    },
    onError: (error) => {
      toast({ variant: 'destructive', title: 'Failed to save', description: error.message })
    },
  })

  // Duplicate quote as new version
  const duplicateQuote = useMutation({
    mutationFn: async () => {
      if (!quote) throw new Error('No quote to duplicate')

      // Determine version group and number
      const versionGroupId = quote.version_group_id || quote.id
      const { data: existingVersions } = await supabase
        .from('quotes')
        .select('version_number')
        .eq('version_group_id', versionGroupId)
        .order('version_number', { ascending: false })
        .limit(1)

      const nextVersionNumber = (existingVersions?.[0]?.version_number || 0) + 1

      // Create new quote
      const { data: newQuote, error: quoteError } = await supabase
        .from('quotes')
        .insert({
          customer_id: quote.customer_id,
          title: quote.title,
          status: 'draft',
          quote_type: quote.quote_type || 'commitment',
          valid_until: quote.valid_until,
          use_aggregated_pricing: quote.use_aggregated_pricing,
          base_usage_ratio: quote.base_usage_ratio ?? 0.60,
          notes: quote.notes,
          version_group_id: versionGroupId,
          version_number: nextVersionNumber,
          version_name: versionName || null,
          parent_quote_id: quote.id,
          source_scenario_id: (quote as any).source_scenario_id,
        })
        .select()
        .single()

      if (quoteError) throw quoteError

      // Copy packages
      for (const pkg of quote.quote_packages) {
        const { data: newPkg, error: pkgError } = await supabase
          .from('quote_packages')
          .insert({
            quote_id: newQuote.id,
            package_name: pkg.package_name,
            term_months: pkg.term_months,
            status: pkg.status,
            include_in_quote: pkg.include_in_quote,
            notes: pkg.notes,
            sort_order: pkg.sort_order,
          })
          .select()
          .single()

        if (pkgError) throw pkgError

        // Copy items
        const items = pkg.quote_items?.map(item => ({
          package_id: newPkg.id,
          sku_id: item.sku_id,
          quantity: item.quantity,
          term_months: item.term_months,
          environment: item.environment,
          notes: item.notes,
          sort_order: item.sort_order,
        }))

        if (items && items.length > 0) {
          const { error: itemsError } = await supabase
            .from('quote_items')
            .insert(items)

          if (itemsError) throw itemsError
        }
      }

      // Update original quote's version_group_id if it was null
      if (!quote.version_group_id) {
        await supabase
          .from('quotes')
          .update({ version_group_id: versionGroupId, version_number: 1 })
          .eq('id', quote.id)
      }

      return newQuote
    },
    onSuccess: (data) => {
      setShowVersionDialog(false)
      setVersionName('')
      toast({
        title: 'Version created',
        description: `Created version ${data.version_number}${versionName ? ` - ${versionName}` : ''}`,
      })
      navigate(`/quotes/${data.id}`)
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Failed to create version',
        description: error.message,
      })
    },
  })

  // Add package
  const addPackage = useMutation({
    mutationFn: async () => {
      // For pay-per-use quotes, always use 1-month term
      const termMonths = formData.quote_type === 'pay_per_use' ? PAY_PER_USE_TERM : newPackageTerm
      const { data, error } = await supabase
        .from('quote_packages')
        .insert({
          quote_id: id,
          package_name: newPackageName,
          term_months: termMonths,
          status: 'new',
          sort_order: (quote?.quote_packages.length || 0) + 1,
        })
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      setShowAddPackage(false)
      setNewPackageName('')
      setNewPackageTerm(12)
      setExpandedPackages(prev => new Set([...prev, data.id]))
      refetchQuote()
      toast({ title: 'Package added' })
    },
  })

  // Delete package
  const deletePackage = useMutation({
    mutationFn: async (packageId: string) => {
      const { error } = await supabase
        .from('quote_packages')
        .delete()
        .eq('id', packageId)

      if (error) throw error
    },
    onSuccess: () => {
      refetchQuote()
      toast({ title: 'Package deleted' })
    },
  })

  // Bulk add line items (from SKU catalog dialog)
  const bulkAddLineItems = useMutation({
    mutationFn: async ({ packageId, skuIds }: { packageId: string; skuIds: string[] }) => {
      const pkg = quote?.quote_packages.find(p => p.id === packageId)
      const startSort = (pkg?.quote_items?.length || 0) + 1
      const rows = skuIds.map((skuId, i) => ({
        package_id: packageId,
        sku_id: skuId,
        quantity: 1,
        environment: 'production' as const,
        sort_order: startSort + i,
      }))
      const { error } = await supabase.from('quote_items').insert(rows)
      if (error) throw error
    },
    onSuccess: () => {
      setSkuCatalogPackageId(null)
      refetchQuote()
      toast({ title: 'SKUs added' })
    },
    onError: (error) => {
      toast({ variant: 'destructive', title: 'Failed to add SKUs', description: error.message })
    },
  })

  // Update line item
  const updateLineItem = useMutation({
    mutationFn: async ({ itemId, updates }: { itemId: string; updates: Partial<QuoteItem> }) => {
      const { error } = await supabase
        .from('quote_items')
        .update(updates)
        .eq('id', itemId)

      if (error) throw error
    },
    onSuccess: () => {
      refetchQuote()
      // Trigger auto-calculate if enabled
      if (autoCalculate && id) {
        setPendingCalculation(true)
      }
    },
  })

  // Auto-calculate pricing when changes are pending
  useEffect(() => {
    if (!pendingCalculation || calculating || !id) return

    const timer = setTimeout(async () => {
      setPendingCalculation(false)
      setCalculating(true)
      try {
        const response = await invokeEdgeFunction<CalculatePricingResponse>(
          'calculate-pricing',
          { action: 'calculate_quote', quote_id: id }
        )
        if (response.success) {
          refetchQuote()
        }
      } catch {
        // Silent fail for auto-calculate
      } finally {
        setCalculating(false)
      }
    }, 1500) // Wait 1.5s after last change before auto-calculating

    return () => clearTimeout(timer)
  }, [pendingCalculation, calculating, id, refetchQuote])

  const ratioAutoCalcTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Delete line item
  const deleteLineItem = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase
        .from('quote_items')
        .delete()
        .eq('id', itemId)

      if (error) throw error
    },
    onSuccess: () => {
      refetchQuote()
    },
  })

  // Calculate pricing (saves form data first so edge function reads latest values)
  const calculatePricing = async () => {
    if (!id) return

    setCalculating(true)
    try {
      // Persist form data (including base_usage_ratio) before calculating
      const { error: saveError } = await supabase
        .from('quotes')
        .update({
          customer_id: formData.customer_id || null,
          title: formData.title || null,
          status: formData.status,
          quote_type: formData.quote_type,
          solution_wrapper: formData.solution_wrapper,
          valid_until: formData.valid_until || null,
          use_aggregated_pricing: formData.use_aggregated_pricing,
          base_usage_ratio: formData.base_usage_ratio,
          notes: formData.notes || null,
        })
        .eq('id', id)

      if (saveError) throw saveError

      const response = await invokeEdgeFunction<CalculatePricingResponse>(
        'calculate-pricing',
        { action: 'calculate_quote', quote_id: id }
      )

      if (response.success) {
        toast({ title: 'Pricing calculated', description: `Total: ${formatCurrency(response.total_monthly || 0)}/month` })
        refetchQuote()
      } else {
        throw new Error(response.error)
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Calculation failed', description: error.message })
    } finally {
      setCalculating(false)
    }
  }

  // Handle save
  const handleSave = async () => {
    setSaving(true)
    if (isNew) {
      await createQuote.mutateAsync()
    } else {
      await updateQuote.mutateAsync()
    }
    setSaving(false)
  }

  // Toggle package expansion
  const togglePackage = (packageId: string) => {
    setExpandedPackages(prev => {
      const next = new Set(prev)
      if (next.has(packageId)) {
        next.delete(packageId)
      } else {
        next.add(packageId)
      }
      return next
    })
  }

  // Handle PDF export
  const handleExportPDF = () => {
    if (!quote) return
    generateQuotePDF(quote)
    toast({ title: 'PDF generated' })
  }

  // Navigate to comparison view
  const handleCompare = () => {
    if (!quote?.version_group_id) return
    navigate(`/quotes/compare?group=${quote.version_group_id}`)
  }

  if (quoteLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="flex h-full">
      {/* Main Content */}
      <div className="flex-1 overflow-auto p-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold">
                {isNew ? 'New Quote' : `Quote ${quote?.quote_number}`}
              </h1>
              {quote?.version_number && (
                <Badge variant="outline" className="text-sm">
                  v{quote.version_number}
                  {quote.version_name && ` - ${quote.version_name}`}
                </Badge>
              )}
              {/* Quote Type Badge */}
              <Badge
                variant={formData.quote_type === 'commitment' ? 'default' : 'secondary'}
                className={`text-sm ${
                  formData.quote_type === 'commitment'
                    ? 'bg-blue-600 hover:bg-blue-700'
                    : 'bg-amber-600 hover:bg-amber-700 text-white'
                }`}
              >
                {formData.quote_type === 'commitment' ? (
                  <>
                    <Lock className="mr-1 h-3 w-3" />
                    Commitment
                  </>
                ) : (
                  <>
                    <Repeat className="mr-1 h-3 w-3" />
                    Pay-per-Use
                  </>
                )}
              </Badge>
              {fromForecast && isNew && (
                <Badge variant="secondary" className="text-sm">
                  <TrendingUp className="mr-1 h-3 w-3" />
                  From Forecast
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground">
              {isNew
                ? fromForecast
                  ? 'Creating quote from forecast scenario'
                  : 'Create a new pricing quote'
                : 'Edit quote details and packages'}
            </p>
          </div>
          <div className="flex gap-2">
            {!isNew && (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline">
                      <MoreHorizontal className="mr-2 h-4 w-4" />
                      More
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={handleExportPDF}>
                      <FileDown className="mr-2 h-4 w-4" />
                      Export PDF
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setShowVersionDialog(true)}>
                      <Copy className="mr-2 h-4 w-4" />
                      Create Version
                    </DropdownMenuItem>
                    {quoteVersions.length > 1 && (
                      <DropdownMenuItem onClick={handleCompare}>
                        <GitBranch className="mr-2 h-4 w-4" />
                        Compare Versions
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => navigate(`/quotes/${id}/timeline`)}
                    >
                      View Timeline
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="outline" onClick={calculatePricing} disabled={calculating}>
                  <Calculator className="mr-2 h-4 w-4" />
                  {calculating ? 'Calculating...' : 'Calculate'}
                </Button>
              </>
            )}
            <Button onClick={handleSave} disabled={saving || applyingForecast}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? 'Saving...' : applyingForecast ? 'Applying forecast...' : 'Save'}
            </Button>
          </div>
        </div>

        {/* Version Selector (if quote has versions) */}
        {quoteVersions.length > 1 && (
          <Card className="mb-6">
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <Label className="text-sm whitespace-nowrap">Version:</Label>
                <Select
                  value={id}
                  onValueChange={(v) => navigate(`/quotes/${v}`)}
                >
                  <SelectTrigger className="w-[300px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {quoteVersions.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        v{v.version_number}
                        {v.version_name && ` - ${v.version_name}`}
                        <span className="ml-2 text-muted-foreground">
                          ({v.quote_number} - {formatCurrency(v.total_monthly)}/mo)
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-sm text-muted-foreground">
                  {quoteVersions.length} version{quoteVersions.length !== 1 ? 's' : ''}
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quote Header */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Quote Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <Label>Customer</Label>
                <Select
                  value={formData.customer_id}
                  onValueChange={(v) => setFormData(prev => ({ ...prev, customer_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers?.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.name} {customer.company && `(${customer.company})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Title</Label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Quote title"
                />
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(v) => setFormData(prev => ({ ...prev, status: v as QuoteStatus }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Valid Until</Label>
                <Input
                  type="date"
                  value={formData.valid_until}
                  onChange={(e) => setFormData(prev => ({ ...prev, valid_until: e.target.value }))}
                />
              </div>

              {/* Quote Type Selector */}
              <div className="space-y-2">
                <Label>Quote Type</Label>
                <Select
                  value={formData.quote_type}
                  onValueChange={(v) => setFormData(prev => ({ ...prev, quote_type: v as QuoteType }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="commitment">
                      <div className="flex items-center gap-2">
                        <Lock className="h-4 w-4 text-blue-600" />
                        <span>Commitment</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="pay_per_use">
                      <div className="flex items-center gap-2">
                        <Repeat className="h-4 w-4 text-amber-600" />
                        <span>Pay-per-Use</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Solution Wrapper Selector */}
              <div className="space-y-2">
                <Label>Solution Wrapper</Label>
                <Select
                  value={formData.solution_wrapper}
                  onValueChange={(v) => setFormData(prev => ({ ...prev, solution_wrapper: v as SolutionWrapper }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">Standard</SelectItem>
                    <SelectItem value="lacs">LACS</SelectItem>
                    <SelectItem value="tisp">TISP</SelectItem>
                    <SelectItem value="rpg">RPG</SelectItem>
                    <SelectItem value="mvno">MVNO</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Quote Type Info */}
              <div className="col-span-full">
                <div className={`rounded-lg px-4 py-3 text-sm ${
                  formData.quote_type === 'commitment'
                    ? 'bg-blue-50 border border-blue-200 text-blue-800'
                    : 'bg-amber-50 border border-amber-200 text-amber-800'
                }`}>
                  {formData.quote_type === 'commitment' ? (
                    <div className="flex items-start gap-3">
                      <Lock className="h-5 w-5 mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="font-medium">Commitment Pricing</div>
                        <div className="mt-1 text-sm opacity-90">
                          Fixed monthly pricing with term commitment. Includes volume discounts based on committed quantities
                          and term discounts for longer commitments (12, 24, 36+ months).
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3">
                      <Repeat className="h-5 w-5 mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="font-medium">Pay-per-Use Pricing</div>
                        <div className="mt-1 text-sm opacity-90">
                          Variable monthly pricing based on actual usage. No term commitment required.
                          Monthly rates apply without term discounts.
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="col-span-full flex items-center gap-2">
                <Switch
                  checked={formData.use_aggregated_pricing}
                  onCheckedChange={(v) => setFormData(prev => ({ ...prev, use_aggregated_pricing: v }))}
                />
                <Label>Use aggregated pricing (combine quantities across packages for volume discounts)</Label>
              </div>

            </div>
          </CardContent>
        </Card>

        {/* Base/Usage Ratio Slider — sticky so it stays visible while scrolling through SKUs */}
        {hasCasSkus && (
          <div className="sticky top-0 z-10 bg-background border border-border rounded-lg px-4 py-3 space-y-2 shadow-sm">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Base/Usage Ratio (CAS)</label>
              <Button size="sm" variant="outline" onClick={calculatePricing} disabled={calculating}>
                <Calculator className="mr-2 h-4 w-4" />
                {calculating ? 'Calculating...' : 'Calculate'}
              </Button>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-12">Base</span>
              <input
                type="range"
                min="1"
                max="99"
                step="1"
                value={Math.round(formData.base_usage_ratio * 100)}
                onChange={(e) => {
                  const newRatio = parseInt(e.target.value) / 100
                  setFormData(prev => ({ ...prev, base_usage_ratio: newRatio }))
                  if (autoCalculate) {
                    if (ratioAutoCalcTimer.current) clearTimeout(ratioAutoCalcTimer.current)
                    ratioAutoCalcTimer.current = setTimeout(() => calculatePricing(), 1500)
                  }
                }}
                className="flex-1"
              />
              <span className="text-xs text-muted-foreground w-12 text-right">Usage</span>
            </div>
            <div className="text-center text-sm font-mono">
              {Math.round(formData.base_usage_ratio * 100)}% Base / {Math.round((1 - formData.base_usage_ratio) * 100)}% Usage
            </div>
            <div className="flex gap-2 justify-center">
              {([{ label: 'Commitment (80/20)', value: 0.80, display: 80 }, { label: 'Standard (60/40)', value: 0.60, display: 60 }, { label: 'Pay-per-use (10/90)', value: 0.10, display: 10 }] as const).map(preset => (
                <button
                  key={preset.label}
                  type="button"
                  className={`text-xs px-2 py-1 rounded border ${Math.round(formData.base_usage_ratio * 100) === preset.display ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}`}
                  onClick={() => {
                    setFormData(prev => ({ ...prev, base_usage_ratio: preset.value }))
                    if (autoCalculate) {
                      if (ratioAutoCalcTimer.current) clearTimeout(ratioAutoCalcTimer.current)
                      ratioAutoCalcTimer.current = setTimeout(() => calculatePricing(), 1500)
                    }
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* SKU Mapping Warning */}
        {showSkuMappingWarning && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>No SKU Mappings Configured</AlertTitle>
            <AlertDescription className="flex items-center justify-between">
              <span>
                Forecast-to-quote conversion requires SKU mappings to be configured.
                Without mappings, line items cannot be auto-generated from forecast data.
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/admin/forecast-mapping')}
                className="ml-4 shrink-0"
              >
                <Settings2 className="mr-2 h-4 w-4" />
                Configure Mappings
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Commitment Configuration (for new quotes with multiple scenarios) */}
        {isNew && fromForecast && hasMultipleScenarios && formData.quote_type === 'commitment' && scenarios.length > 1 && (
          <div className="space-y-6 mb-6">
            {/* Commitment Mode Selector */}
            <CommitmentModeSelector
              value={commitmentMode}
              onChange={(mode) => {
                console.log('[QuoteBuilder] CommitmentMode changed to:', mode)
                setCommitmentMode(mode)
              }}
              yearCount={availableYears.length || scenarios.length}
            />

            {/* Max mode: show strategy picker and term selector */}
            {commitmentMode === 'max' && (
              <div className="grid gap-6 md:grid-cols-2">
                {/* Strategy Picker */}
                <CommitmentStrategyPicker
                  scenarios={scenarios}
                  strategy={commitmentStrategy}
                  onStrategyChange={setCommitmentStrategy}
                  specificYear={specificYear}
                  onSpecificYearChange={setSpecificYear}
                  showPreview={true}
                />

                {/* Term Selector Card */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Lock className="h-5 w-5 text-blue-500" />
                      Commitment Term
                    </CardTitle>
                    <CardDescription>
                      Select the contract term length for volume and term discounts
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Term Selection */}
                    <div className="space-y-3">
                      <Label>Term Length</Label>
                      <Select
                        value={selectedTermMonths.toString()}
                        onValueChange={(v) => setSelectedTermMonths(parseInt(v))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {termOptions.filter(t => t > 1).map((term) => (
                            <SelectItem key={term} value={term.toString()}>
                              <div className="flex items-center justify-between w-full gap-4">
                                <span>{term} months</span>
                                <span className="text-xs text-muted-foreground">
                                  ({Math.floor(term / 12)} year{Math.floor(term / 12) !== 1 ? 's' : ''})
                                </span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Term Tier Info */}
                    <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
                      <div className="text-sm font-medium text-blue-800">
                        {getTermTierLabel(selectedTermMonths)}
                      </div>
                      <p className="text-sm text-blue-600 mt-1">
                        Longer commitments typically qualify for higher term discounts.
                      </p>
                    </div>

                    {/* Years covered info */}
                    {availableYears.length > 0 && (
                      <div className="text-sm text-muted-foreground">
                        <span className="font-medium">Forecast years: </span>
                        {availableYears.join(', ')}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Yearly mode: show per-period preview instead of strategy picker */}
            {commitmentMode === 'yearly' && (
              <PerPeriodPreview scenarios={scenarios} />
            )}
          </div>
        )}

        {/* Pay-per-use multi-scenario info section */}
        {isNew && fromForecast && hasMultipleScenarios && formData.quote_type === 'pay_per_use' && scenarios.length > 0 && (
          <Card className="mb-6">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Repeat className="h-5 w-5 mt-0.5 text-amber-600 flex-shrink-0" />
                <div>
                  <div className="font-medium text-sm">Monthly Pay-per-Use Packages</div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Creating monthly packages across the forecast period ({scenarios.length * 12} months estimated).
                    Each month shows forecasted charges without commitment.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Simple Term Selector for commitment quotes without multiple scenarios */}
        {isNew && formData.quote_type === 'commitment' && !hasMultipleScenarios && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5 text-blue-500" />
                Commitment Term
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <Label>Term Length:</Label>
                <Select
                  value={selectedTermMonths.toString()}
                  onValueChange={(v) => setSelectedTermMonths(parseInt(v))}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {termOptions.filter(t => t > 1).map((term) => (
                      <SelectItem key={term} value={term.toString()}>
                        {term} months ({Math.floor(term / 12)} year{Math.floor(term / 12) !== 1 ? 's' : ''})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-sm text-muted-foreground">
                  {getTermTierLabel(selectedTermMonths)}
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Manual SKU Quantities (for unmapped infrastructure SKUs) */}
        {isNew && fromForecast && skus && skus.length > 0 && (
          <ManualSkuInput
            allSkus={skus}
            forecastMappings={forecastMappings}
            availableYears={availableYears}
            commitmentMode={commitmentMode}
            value={manualSkuItems}
            onChange={setManualSkuItems}
          />
        )}

        {/* Packages Section */}
        {!isNew && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Packages</CardTitle>
                  <CardDescription>
                    {quote?.quote_packages.length || 0} packages in this quote
                  </CardDescription>
                </div>
                <Button onClick={() => setShowAddPackage(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Package
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {quote?.quote_packages.map((pkg) => (
                <div key={pkg.id} className="rounded-lg border">
                  {/* Package Header */}
                  <div
                    className="flex cursor-pointer items-center justify-between p-4 hover:bg-muted/50"
                    onClick={() => togglePackage(pkg.id)}
                  >
                    <div className="flex items-center gap-3">
                      {expandedPackages.has(pkg.id) ? (
                        <ChevronDown className="h-5 w-5" />
                      ) : (
                        <ChevronRight className="h-5 w-5" />
                      )}
                      <Package className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <div className="font-medium">{pkg.package_name}</div>
                        <div className="text-sm text-muted-foreground">
                          {pkg.term_months} months | {pkg.quote_items?.length || 0} items
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <Badge className={getStatusColor(pkg.status)}>{pkg.status}</Badge>
                      <div className="text-right">
                        <div className="font-medium">{formatCurrency(pkg.subtotal_monthly)}/mo</div>
                        <div className="text-sm text-muted-foreground">
                          {formatCurrency(pkg.subtotal_annual)}/yr
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (confirm('Delete this package?')) {
                            deletePackage.mutate(pkg.id)
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>

                  {/* Package Content */}
                  {expandedPackages.has(pkg.id) && (
                    <div className="border-t p-4">
                      {/* Line Items Table */}
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>SKU</TableHead>
                            <TableHead className="w-24">Qty</TableHead>
                            <TableHead className="w-32">Environment</TableHead>
                            <TableHead className="text-right">List Price</TableHead>
                            <TableHead className="text-right">Discount</TableHead>
                            <TableHead className="text-right">Unit Price</TableHead>
                            <TableHead className="text-right">Monthly</TableHead>
                            <TableHead className="w-12"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(() => {
                            const items = pkg.quote_items || []
                            const categoryOrder: Array<'cas' | 'cno' | 'ccs' | 'default'> = ['cas', 'cno', 'ccs', 'default']
                            const categoryLabels: Record<string, string> = { cas: 'CAS', cno: 'CNO', ccs: 'CCS', default: 'Default' }
                            const rows: React.ReactNode[] = []

                            for (const cat of categoryOrder) {
                              const catItems = items.filter(i => (i.sku?.category || 'default') === cat)
                              if (catItems.length === 0) continue

                              const baseItems = catItems.filter(i => i.sku?.is_base_charge)
                              const usageItems = catItems.filter(i => !i.sku?.is_base_charge)

                              // Category header
                              rows.push(
                                <TableRow key={`cat-${cat}`} className="bg-muted/50 hover:bg-muted/50">
                                  <TableCell colSpan={8} className="py-1.5">
                                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                      {categoryLabels[cat]}
                                    </span>
                                  </TableCell>
                                </TableRow>
                              )

                              const renderSubGroup = (label: string, subItems: typeof items) => {
                                if (subItems.length === 0) return
                                rows.push(
                                  <TableRow key={`${cat}-${label}`} className="hover:bg-transparent">
                                    <TableCell colSpan={8} className="py-1 pl-6">
                                      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                                        {label}
                                      </span>
                                    </TableCell>
                                  </TableRow>
                                )
                                for (const item of subItems) {
                                  rows.push(
                                    <TableRow key={item.id}>
                                      <TableCell>
                                        <div>
                                          <div className="font-mono text-sm">{item.sku?.code}</div>
                                          <div className="text-sm text-muted-foreground">
                                            {item.sku?.description}
                                          </div>
                                        </div>
                                      </TableCell>
                                      <TableCell>
                                        <QuickQuantityInput
                                          value={item.quantity}
                                          onChange={(qty) =>
                                            updateLineItem.mutate({
                                              itemId: item.id,
                                              updates: { quantity: qty },
                                            })
                                          }
                                          min={1}
                                          step={Math.max(1, Math.round(item.quantity * 0.1))}
                                          debounceMs={800}
                                          showQuickControls={true}
                                        />
                                      </TableCell>
                                      <TableCell>
                                        <Select
                                          value={item.environment}
                                          onValueChange={(v) =>
                                            updateLineItem.mutate({
                                              itemId: item.id,
                                              updates: { environment: v as 'production' | 'reference' },
                                            })
                                          }
                                        >
                                          <SelectTrigger className="w-28">
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="production">Production</SelectItem>
                                            <SelectItem value="reference">Reference</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </TableCell>
                                      <TableCell className="text-right">
                                        {item.list_price ? formatCurrency(item.list_price) : '-'}
                                      </TableCell>
                                      <TableCell className="text-right text-green-600">
                                        {item.total_discount_pct ? `-${formatPercent(item.total_discount_pct)}` : '-'}
                                      </TableCell>
                                      <TableCell className="text-right font-medium">
                                        {item.unit_price ? formatCurrency(item.unit_price) : '-'}
                                      </TableCell>
                                      <TableCell className="text-right font-medium">
                                        {item.monthly_total ? formatCurrency(item.monthly_total) : '-'}
                                      </TableCell>
                                      <TableCell>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          onClick={() => deleteLineItem.mutate(item.id)}
                                        >
                                          <Trash2 className="h-4 w-4 text-destructive" />
                                        </Button>
                                      </TableCell>
                                    </TableRow>
                                  )
                                }
                              }

                              renderSubGroup('Base Charges', baseItems)
                              renderSubGroup('Usage', usageItems)
                            }

                            return rows
                          })()}
                        </TableBody>
                      </Table>

                      {/* Add Line Item */}
                      <div className="mt-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSkuCatalogPackageId(pkg.id)}
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Add SKUs...
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {quote?.quote_packages.length === 0 && (
                <div className="flex h-32 flex-col items-center justify-center rounded-lg border-2 border-dashed">
                  <Package className="mb-2 h-8 w-8 text-muted-foreground" />
                  <p className="text-muted-foreground">No packages yet</p>
                  <Button variant="link" onClick={() => setShowAddPackage(true)}>
                    Add your first package
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Summary Sidebar */}
      {!isNew && quote && (
        <Collapsible defaultOpen className="border-l bg-card">
          <div className="p-6 pb-0">
            <CollapsibleTrigger className="flex w-full items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Quote Summary</h3>
              <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform [[data-state=closed]>&]:rotate-[-90deg]" />
            </CollapsibleTrigger>
          </div>

          <CollapsibleContent className="px-6 pb-6 data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
            <div className="space-y-4">
              <div className="rounded-lg bg-muted p-4">
                <div className="text-sm text-muted-foreground">Monthly Total</div>
                <div className="text-3xl font-bold flex items-center gap-2">
                  {formatCurrency(quote.total_monthly)}
                  {(calculating || pendingCalculation) && (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  )}
                </div>
              </div>

              <div className="rounded-lg bg-muted p-4">
                <div className="text-sm text-muted-foreground">Annual Total</div>
                <div className="text-2xl font-bold">{formatCurrency(quote.total_annual)}</div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Quote Type</span>
                  <Badge
                    variant={formData.quote_type === 'commitment' ? 'default' : 'secondary'}
                    className={
                      formData.quote_type === 'commitment'
                        ? 'bg-blue-600'
                        : 'bg-amber-600 text-white'
                    }
                  >
                    {formData.quote_type === 'commitment' ? (
                      <>
                        <Lock className="mr-1 h-3 w-3" />
                        Commitment
                      </>
                    ) : (
                      <>
                        <Repeat className="mr-1 h-3 w-3" />
                        Pay-per-Use
                      </>
                    )}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Packages</span>
                  <span>{quote.quote_packages.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Line Items</span>
                  <span>
                    {quote.quote_packages.reduce((sum, pkg) => sum + (pkg.quote_items?.length || 0), 0)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge className={getStatusColor(quote.status)}>{quote.status}</Badge>
                </div>
                {quote.version_number && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Version</span>
                    <span>v{quote.version_number}</span>
                  </div>
                )}
              </div>

              {/* Quick Actions */}
              <div className="pt-4 border-t space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="autoCalc" className="text-sm">Auto-calculate</Label>
                  <Switch
                    id="autoCalc"
                    checked={autoCalculate}
                    onCheckedChange={setAutoCalculate}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {autoCalculate
                    ? 'Prices update automatically as you edit'
                    : 'Click Calculate to update prices'}
                </p>
                {pendingCalculation && (
                  <div className="text-xs text-amber-600 flex items-center gap-1">
                    <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                    Calculating...
                  </div>
                )}
              </div>

              {/* Quick Version Action */}
              <div className="pt-4 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setShowVersionDialog(true)}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Create New Version
                </Button>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Add Package Dialog */}
      <Dialog open={showAddPackage} onOpenChange={setShowAddPackage}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Package</DialogTitle>
            <DialogDescription>Create a new package for this quote</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Package Name</Label>
              <Input
                value={newPackageName}
                onChange={(e) => setNewPackageName(e.target.value)}
                placeholder="e.g., Production Environment"
              />
            </div>
            <div className="space-y-2">
              <Label>Term (months)</Label>
              {formData.quote_type === 'pay_per_use' ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 rounded-md border px-3 py-2 bg-muted/50">
                    <Repeat className="h-4 w-4 text-amber-600" />
                    <span className="text-sm">1 month (Pay-per-Use)</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Pay-per-Use quotes use 1-month terms with no commitment. Pricing is recalculated monthly based on actual usage.
                  </p>
                </div>
              ) : (
                <Select
                  value={newPackageTerm.toString()}
                  onValueChange={(v) => setNewPackageTerm(parseInt(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {termOptions.map((term) => (
                      <SelectItem key={term} value={term.toString()}>
                        {term} months
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddPackage(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => addPackage.mutate()}
              disabled={!newPackageName || addPackage.isPending}
            >
              Add Package
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Version Dialog */}
      <Dialog open={showVersionDialog} onOpenChange={setShowVersionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Version</DialogTitle>
            <DialogDescription>
              Duplicate this quote as a new version with an optional name
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Version Name (optional)</Label>
              <Input
                value={versionName}
                onChange={(e) => setVersionName(e.target.value)}
                placeholder="e.g., 3-year commitment, Premium tier"
              />
              <p className="text-xs text-muted-foreground">
                Will be displayed as "v{(quote?.version_number || 0) + 1}
                {versionName ? ` - ${versionName}` : ''}"
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowVersionDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => duplicateQuote.mutate()}
              disabled={duplicateQuote.isPending}
            >
              {duplicateQuote.isPending ? 'Creating...' : 'Create Version'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SKU Catalog Dialog */}
      {skus && (
        <SkuCatalogDialog
          isOpen={skuCatalogPackageId !== null}
          onClose={() => setSkuCatalogPackageId(null)}
          skus={skus}
          existingSkuIds={new Set(
            quote?.quote_packages
              .find(p => p.id === skuCatalogPackageId)
              ?.quote_items?.map(item => item.sku_id) ?? []
          )}
          onAddSkus={(skuIds) => {
            if (skuCatalogPackageId) {
              bulkAddLineItems.mutate({ packageId: skuCatalogPackageId, skuIds })
            }
          }}
          isAdding={bulkAddLineItems.isPending}
        />
      )}
    </div>
  )
}
