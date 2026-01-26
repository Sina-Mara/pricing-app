import { useState, useCallback, useMemo } from 'react'
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
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Plus, Trash2, Save, AlertCircle } from 'lucide-react'
import { cn, formatNumber } from '@/lib/utils'

/**
 * Represents a single row of yearly forecast data
 */
export interface YearlyForecastRow {
  id: string
  year: number
  endOfYearSims: number
  totalDataUsageGB: number
}

/**
 * Validation error for a specific field in a row
 */
export interface ValidationError {
  rowId: string
  field: 'year' | 'endOfYearSims' | 'totalDataUsageGB'
  message: string
}

/**
 * Props for the YearlyForecastInput component
 */
export interface YearlyForecastInputProps {
  /** The current forecast data */
  data: YearlyForecastRow[]
  /** Callback when data changes */
  onChange: (data: YearlyForecastRow[]) => void
  /** Callback when save button is clicked */
  onSave?: (data: YearlyForecastRow[]) => void
  /** Whether the component is in a loading state */
  isLoading?: boolean
  /** Whether save operation is in progress */
  isSaving?: boolean
  /** Title for the card header */
  title?: string
  /** Description for the card header */
  description?: string
  /** Additional CSS classes */
  className?: string
  /** Minimum allowed year */
  minYear?: number
  /** Maximum allowed year */
  maxYear?: number
}

/**
 * Generate a unique ID for a new row
 */
function generateRowId(): string {
  return `row-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Calculate GB per SIM from row data
 */
function calculateGbPerSim(row: YearlyForecastRow): number | null {
  if (row.endOfYearSims <= 0) return null
  return row.totalDataUsageGB / row.endOfYearSims
}

/**
 * Get the next suggested year based on existing data
 */
function getNextYear(data: YearlyForecastRow[]): number {
  if (data.length === 0) {
    return new Date().getFullYear()
  }
  const maxYear = Math.max(...data.map((r) => r.year))
  return maxYear + 1
}

/**
 * YearlyForecastInput - A table UI for entering yearly forecast data
 *
 * Features:
 * - Add/remove rows
 * - Input validation (year must be valid, numbers must be positive)
 * - Derived GB/SIM calculation per row
 * - Save functionality
 */
export function YearlyForecastInput({
  data,
  onChange,
  onSave,
  isLoading = false,
  isSaving = false,
  title = 'Yearly Forecast',
  description = 'Enter your forecasted SIM counts and data usage per year',
  className,
  minYear = 2020,
  maxYear = 2050,
}: YearlyForecastInputProps) {
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([])

  /**
   * Validate a single row and return any errors
   */
  const validateRow = useCallback(
    (row: YearlyForecastRow): ValidationError[] => {
      const errors: ValidationError[] = []

      // Validate year
      if (isNaN(row.year) || row.year < minYear || row.year > maxYear) {
        errors.push({
          rowId: row.id,
          field: 'year',
          message: `Year must be between ${minYear} and ${maxYear}`,
        })
      }

      // Validate SIMs
      if (isNaN(row.endOfYearSims) || row.endOfYearSims <= 0) {
        errors.push({
          rowId: row.id,
          field: 'endOfYearSims',
          message: 'SIMs must be a positive number',
        })
      }

      // Validate data usage
      if (isNaN(row.totalDataUsageGB) || row.totalDataUsageGB < 0) {
        errors.push({
          rowId: row.id,
          field: 'totalDataUsageGB',
          message: 'Data usage must be a non-negative number',
        })
      }

      return errors
    },
    [minYear, maxYear]
  )

  /**
   * Validate all rows and update error state
   */
  const validateAllRows = useCallback(
    (rows: YearlyForecastRow[]): boolean => {
      const allErrors: ValidationError[] = []

      // Check for duplicate years
      const years = rows.map((r) => r.year)
      const duplicateYears = years.filter((year, index) => years.indexOf(year) !== index)

      rows.forEach((row) => {
        const rowErrors = validateRow(row)
        allErrors.push(...rowErrors)

        if (duplicateYears.includes(row.year)) {
          const hasDuplicateError = allErrors.some(
            (e) => e.rowId === row.id && e.field === 'year' && e.message.includes('duplicate')
          )
          if (!hasDuplicateError) {
            allErrors.push({
              rowId: row.id,
              field: 'year',
              message: 'Duplicate year',
            })
          }
        }
      })

      setValidationErrors(allErrors)
      return allErrors.length === 0
    },
    [validateRow]
  )

  /**
   * Check if a specific field has an error
   */
  const hasError = useCallback(
    (rowId: string, field: 'year' | 'endOfYearSims' | 'totalDataUsageGB'): boolean => {
      return validationErrors.some((e) => e.rowId === rowId && e.field === field)
    },
    [validationErrors]
  )

  /**
   * Get error message for a specific field
   */
  const getErrorMessage = useCallback(
    (rowId: string, field: 'year' | 'endOfYearSims' | 'totalDataUsageGB'): string | undefined => {
      return validationErrors.find((e) => e.rowId === rowId && e.field === field)?.message
    },
    [validationErrors]
  )

  /**
   * Add a new empty row
   */
  const handleAddRow = useCallback(() => {
    const newRow: YearlyForecastRow = {
      id: generateRowId(),
      year: getNextYear(data),
      endOfYearSims: 0,
      totalDataUsageGB: 0,
    }
    onChange([...data, newRow])
  }, [data, onChange])

  /**
   * Remove a row by ID
   */
  const handleRemoveRow = useCallback(
    (rowId: string) => {
      const newData = data.filter((row) => row.id !== rowId)
      onChange(newData)
      // Clear validation errors for the removed row
      setValidationErrors((prev) => prev.filter((e) => e.rowId !== rowId))
    },
    [data, onChange]
  )

  /**
   * Update a specific field in a row
   */
  const handleFieldChange = useCallback(
    (rowId: string, field: keyof Omit<YearlyForecastRow, 'id'>, value: number) => {
      const newData = data.map((row) => {
        if (row.id === rowId) {
          return { ...row, [field]: value }
        }
        return row
      })
      onChange(newData)

      // Clear validation error for this field when user types
      setValidationErrors((prev) =>
        prev.filter((e) => !(e.rowId === rowId && e.field === field))
      )
    },
    [data, onChange]
  )

  /**
   * Handle save button click
   */
  const handleSave = useCallback(() => {
    if (validateAllRows(data) && onSave) {
      onSave(data)
    }
  }, [data, onSave, validateAllRows])

  /**
   * Format large numbers with commas
   */
  const formatLargeNumber = (num: number): string => {
    return new Intl.NumberFormat('en-US').format(num)
  }

  /**
   * Parse number input, handling locale-specific formatting
   */
  const parseNumberInput = (value: string): number => {
    // Remove commas and parse as float
    const cleanValue = value.replace(/,/g, '')
    const parsed = parseFloat(cleanValue)
    return isNaN(parsed) ? 0 : parsed
  }

  /**
   * Check if save button should be disabled
   */
  const isSaveDisabled = useMemo(() => {
    return (
      isLoading ||
      isSaving ||
      data.length === 0 ||
      validationErrors.length > 0
    )
  }, [isLoading, isSaving, data.length, validationErrors.length])

  /**
   * Sort data by year for display
   */
  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => a.year - b.year)
  }, [data])

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-muted-foreground mb-4">
              No forecast data yet. Add your first year to get started.
            </p>
            <Button onClick={handleAddRow} disabled={isLoading}>
              <Plus className="mr-2 h-4 w-4" />
              Add First Year
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">Year</TableHead>
                  <TableHead className="w-[180px]">End-of-Year SIMs</TableHead>
                  <TableHead className="w-[180px]">Total Data Usage (GB)</TableHead>
                  <TableHead className="w-[140px]">GB/SIM</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedData.map((row) => {
                  const gbPerSim = calculateGbPerSim(row)
                  return (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="relative">
                          <Input
                            type="number"
                            min={minYear}
                            max={maxYear}
                            value={row.year}
                            onChange={(e) =>
                              handleFieldChange(row.id, 'year', parseInt(e.target.value, 10))
                            }
                            className={cn(
                              'w-[100px]',
                              hasError(row.id, 'year') && 'border-red-500 focus-visible:ring-red-500'
                            )}
                            disabled={isLoading}
                          />
                          {hasError(row.id, 'year') && (
                            <div className="absolute top-full left-0 mt-1 flex items-center gap-1 text-xs text-red-500">
                              <AlertCircle className="h-3 w-3" />
                              {getErrorMessage(row.id, 'year')}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="relative">
                          <Input
                            type="text"
                            inputMode="numeric"
                            value={row.endOfYearSims === 0 ? '' : formatLargeNumber(row.endOfYearSims)}
                            onChange={(e) =>
                              handleFieldChange(
                                row.id,
                                'endOfYearSims',
                                parseNumberInput(e.target.value)
                              )
                            }
                            placeholder="100,000"
                            className={cn(
                              'w-[160px]',
                              hasError(row.id, 'endOfYearSims') &&
                                'border-red-500 focus-visible:ring-red-500'
                            )}
                            disabled={isLoading}
                          />
                          {hasError(row.id, 'endOfYearSims') && (
                            <div className="absolute top-full left-0 mt-1 flex items-center gap-1 text-xs text-red-500">
                              <AlertCircle className="h-3 w-3" />
                              {getErrorMessage(row.id, 'endOfYearSims')}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="relative">
                          <Input
                            type="text"
                            inputMode="numeric"
                            value={
                              row.totalDataUsageGB === 0
                                ? ''
                                : formatLargeNumber(row.totalDataUsageGB)
                            }
                            onChange={(e) =>
                              handleFieldChange(
                                row.id,
                                'totalDataUsageGB',
                                parseNumberInput(e.target.value)
                              )
                            }
                            placeholder="1,000,000"
                            className={cn(
                              'w-[160px]',
                              hasError(row.id, 'totalDataUsageGB') &&
                                'border-red-500 focus-visible:ring-red-500'
                            )}
                            disabled={isLoading}
                          />
                          {hasError(row.id, 'totalDataUsageGB') && (
                            <div className="absolute top-full left-0 mt-1 flex items-center gap-1 text-xs text-red-500">
                              <AlertCircle className="h-3 w-3" />
                              {getErrorMessage(row.id, 'totalDataUsageGB')}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-muted-foreground font-mono">
                          {gbPerSim !== null ? formatNumber(gbPerSim, 2) : '-'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveRow(row.id)}
                          disabled={isLoading}
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>

            <Button
              variant="outline"
              size="sm"
              onClick={handleAddRow}
              disabled={isLoading}
              className="w-full"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Year
            </Button>
          </div>
        )}
      </CardContent>
      {data.length > 0 && onSave && (
        <CardFooter className="flex justify-between">
          <div className="text-sm text-muted-foreground">
            {validationErrors.length > 0 ? (
              <span className="text-red-500 flex items-center gap-1">
                <AlertCircle className="h-4 w-4" />
                {validationErrors.length} validation error{validationErrors.length !== 1 ? 's' : ''}
              </span>
            ) : (
              <span>{data.length} year{data.length !== 1 ? 's' : ''} of forecast data</span>
            )}
          </div>
          <Button onClick={handleSave} disabled={isSaveDisabled}>
            {isSaving ? (
              <>
                <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Forecast
              </>
            )}
          </Button>
        </CardFooter>
      )}
    </Card>
  )
}

/**
 * Create empty initial data for the component
 */
export function createEmptyForecastData(): YearlyForecastRow[] {
  return []
}

/**
 * Create sample data for testing/demo purposes
 */
export function createSampleForecastData(): YearlyForecastRow[] {
  return [
    {
      id: generateRowId(),
      year: 2026,
      endOfYearSims: 100000,
      totalDataUsageGB: 1900000,
    },
    {
      id: generateRowId(),
      year: 2027,
      endOfYearSims: 150000,
      totalDataUsageGB: 3000000,
    },
    {
      id: generateRowId(),
      year: 2028,
      endOfYearSims: 200000,
      totalDataUsageGB: 4500000,
    },
  ]
}

export default YearlyForecastInput
