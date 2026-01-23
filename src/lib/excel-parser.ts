/**
 * Excel Parser for Time-Series Forecasts
 *
 * Parses Excel files with time periods in columns and KPIs in rows.
 * Supports multiple date formats: YYYY-MM, MMM YYYY, YYYY, Year N
 */

import * as XLSX from 'xlsx'
import type { ParsedTimeseriesData, TimeseriesGranularity } from '@/types/database'

// Known KPI names and their normalized versions
const KPI_ALIASES: Record<string, string> = {
  'total sims': 'Total SIMs',
  'totalsims': 'Total SIMs',
  'sims': 'Total SIMs',
  'total_sims': 'Total SIMs',
  'users': 'Total SIMs',
  'total users': 'Total SIMs',

  'gb per sim': 'GB per SIM',
  'gb/sim': 'GB per SIM',
  'gbpersim': 'GB per SIM',
  'gb_per_sim': 'GB per SIM',
  'data per sim': 'GB per SIM',
  'data usage': 'GB per SIM',

  'udr': 'UDR',
  'user data records': 'UDR',

  'pcs': 'PCS',
  'packet control sessions': 'PCS',
  'concurrent users': 'PCS',

  'ccs': 'CCS',
  'control channel sessions': 'CCS',
  'active users': 'CCS',

  'scs': 'SCS',
  'session control sessions': 'SCS',

  'cos': 'CoS',
  'concurrent sessions': 'CoS',

  'peak throughput': 'Peak Throughput',
  'peakthroughput': 'Peak Throughput',
  'peak_throughput': 'Peak Throughput',

  'avg throughput': 'Avg Throughput',
  'average throughput': 'Avg Throughput',
  'avgthroughput': 'Avg Throughput',
  'avg_throughput': 'Avg Throughput',
}

// Month name mappings
const MONTH_NAMES: Record<string, number> = {
  'jan': 0, 'january': 0,
  'feb': 1, 'february': 1,
  'mar': 2, 'march': 2,
  'apr': 3, 'april': 3,
  'may': 4,
  'jun': 5, 'june': 5,
  'jul': 6, 'july': 6,
  'aug': 7, 'august': 7,
  'sep': 8, 'september': 8,
  'oct': 9, 'october': 9,
  'nov': 10, 'november': 10,
  'dec': 11, 'december': 11,
}

export interface ParseResult {
  success: boolean
  data?: ParsedTimeseriesData
  error?: string
  warnings?: string[]
}

/**
 * Normalize a KPI name to standard format
 */
function normalizeKpiName(name: string): string {
  const lower = name.toLowerCase().trim()
  return KPI_ALIASES[lower] || name.trim()
}

/**
 * Try to parse a column header as a date
 */
function parseColumnDate(header: string): { date: Date; label: string; granularity: TimeseriesGranularity } | null {
  const str = String(header).trim()

  // Try YYYY-MM format (e.g., "2025-01")
  const isoMatch = str.match(/^(\d{4})-(\d{2})$/)
  if (isoMatch) {
    const year = parseInt(isoMatch[1])
    const month = parseInt(isoMatch[2]) - 1
    return {
      date: new Date(year, month, 1),
      label: str,
      granularity: 'monthly'
    }
  }

  // Try MMM YYYY format (e.g., "Jan 2025", "January 2025")
  const monthYearMatch = str.match(/^([a-zA-Z]+)\s*(\d{4})$/)
  if (monthYearMatch) {
    const monthName = monthYearMatch[1].toLowerCase()
    const year = parseInt(monthYearMatch[2])
    const month = MONTH_NAMES[monthName]
    if (month !== undefined) {
      return {
        date: new Date(year, month, 1),
        label: str,
        granularity: 'monthly'
      }
    }
  }

  // Try YYYY MMM format (e.g., "2025 Jan")
  const yearMonthMatch = str.match(/^(\d{4})\s*([a-zA-Z]+)$/)
  if (yearMonthMatch) {
    const year = parseInt(yearMonthMatch[1])
    const monthName = yearMonthMatch[2].toLowerCase()
    const month = MONTH_NAMES[monthName]
    if (month !== undefined) {
      return {
        date: new Date(year, month, 1),
        label: str,
        granularity: 'monthly'
      }
    }
  }

  // Try Year N format (e.g., "Year 1", "Y1")
  const yearNMatch = str.match(/^(?:year|y)\s*(\d+)$/i)
  if (yearNMatch) {
    const yearNum = parseInt(yearNMatch[1])
    // Use current year as base
    const baseYear = new Date().getFullYear()
    return {
      date: new Date(baseYear + yearNum - 1, 0, 1),
      label: str,
      granularity: 'yearly'
    }
  }

  // Try just YYYY format (e.g., "2025")
  const yearMatch = str.match(/^(\d{4})$/)
  if (yearMatch) {
    const year = parseInt(yearMatch[1])
    return {
      date: new Date(year, 0, 1),
      label: str,
      granularity: 'yearly'
    }
  }

  // Try Q1 2025, 2025 Q1 format
  const quarterMatch = str.match(/^(?:Q(\d)\s*(\d{4})|(\d{4})\s*Q(\d))$/i)
  if (quarterMatch) {
    const quarter = parseInt(quarterMatch[1] || quarterMatch[4])
    const year = parseInt(quarterMatch[2] || quarterMatch[3])
    const month = (quarter - 1) * 3
    return {
      date: new Date(year, month, 1),
      label: str,
      granularity: 'monthly' // Treat quarters as monthly for pricing
    }
  }

  return null
}

/**
 * Parse an Excel file and extract time-series forecast data
 */
export function parseExcelFile(file: ArrayBuffer): ParseResult {
  const warnings: string[] = []

  try {
    // Read workbook
    const workbook = XLSX.read(file, { type: 'array' })

    // Get first sheet
    const sheetName = workbook.SheetNames[0]
    if (!sheetName) {
      return { success: false, error: 'No sheets found in workbook' }
    }

    const sheet = workbook.Sheets[sheetName]

    // Convert to array of arrays
    const data = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
      header: 1,
      defval: null
    })

    if (data.length < 2) {
      return { success: false, error: 'File must have at least a header row and one data row' }
    }

    // First row is headers (first cell = "KPI" label, rest = time periods)
    const headerRow = data[0]
    if (!headerRow || headerRow.length < 2) {
      return { success: false, error: 'Header row must have at least 2 columns' }
    }

    // Parse time period columns (skip first column which is KPI names)
    const periods: { date: Date; label: string }[] = []
    let detectedGranularity: TimeseriesGranularity | null = null

    for (let i = 1; i < headerRow.length; i++) {
      const header = headerRow[i]
      if (header === null || header === undefined || String(header).trim() === '') {
        continue
      }

      const parsed = parseColumnDate(String(header))
      if (parsed) {
        periods.push({ date: parsed.date, label: parsed.label })

        // Set or verify granularity
        if (!detectedGranularity) {
          detectedGranularity = parsed.granularity
        } else if (detectedGranularity !== parsed.granularity) {
          warnings.push(`Mixed granularity detected: ${detectedGranularity} and ${parsed.granularity}`)
        }
      } else {
        warnings.push(`Could not parse column header as date: "${header}"`)
      }
    }

    if (periods.length === 0) {
      return {
        success: false,
        error: 'No valid time period columns found. Expected formats: YYYY-MM, Jan 2025, 2025, Year 1'
      }
    }

    // Parse KPI rows (skip header row)
    const kpis: { name: string; values: (number | null)[] }[] = []

    for (let rowIdx = 1; rowIdx < data.length; rowIdx++) {
      const row = data[rowIdx]
      if (!row || row.length === 0) continue

      const kpiName = row[0]
      if (kpiName === null || kpiName === undefined || String(kpiName).trim() === '') {
        continue
      }

      const normalizedName = normalizeKpiName(String(kpiName))
      const values: (number | null)[] = []

      // Extract values for each period
      for (let i = 1; i <= periods.length; i++) {
        const cellValue = row[i]
        if (cellValue === null || cellValue === undefined || cellValue === '') {
          values.push(null)
        } else {
          const num = Number(cellValue)
          values.push(isNaN(num) ? null : num)
        }
      }

      // Only add if at least one value is not null
      if (values.some(v => v !== null)) {
        kpis.push({ name: normalizedName, values })
      }
    }

    if (kpis.length === 0) {
      return { success: false, error: 'No KPI rows with data found' }
    }

    // Validate required KPIs
    const hasSimsData = kpis.some(k => k.name === 'Total SIMs')
    const hasGbData = kpis.some(k => k.name === 'GB per SIM')

    if (!hasSimsData) {
      return {
        success: false,
        error: 'Required KPI "Total SIMs" not found. Please include a row with SIM count data.'
      }
    }

    if (!hasGbData) {
      warnings.push('KPI "GB per SIM" not found. Will use default value of 1.9 GB.')
    }

    // Sort periods by date
    const sortedIndexes = periods
      .map((p, i) => ({ period: p, index: i }))
      .sort((a, b) => a.period.date.getTime() - b.period.date.getTime())

    const sortedPeriods = sortedIndexes.map(item => item.period)
    const sortedKpis = kpis.map(kpi => ({
      name: kpi.name,
      values: sortedIndexes.map(item => kpi.values[item.index])
    }))

    return {
      success: true,
      data: {
        periods: sortedPeriods,
        kpis: sortedKpis,
        granularity: detectedGranularity || 'monthly',
        startDate: sortedPeriods[0].date,
        endDate: sortedPeriods[sortedPeriods.length - 1].date,
      },
      warnings: warnings.length > 0 ? warnings : undefined
    }

  } catch (error) {
    return {
      success: false,
      error: `Failed to parse Excel file: ${error instanceof Error ? error.message : 'Unknown error'}`
    }
  }
}

/**
 * Generate a sample Excel template for time-series import
 */
export function generateTemplateWorkbook(): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new()

  // Generate 24 months of sample data
  const startYear = new Date().getFullYear()
  const months: string[] = []

  for (let i = 0; i < 24; i++) {
    const year = startYear + Math.floor(i / 12)
    const month = i % 12
    const monthName = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                       'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month]
    months.push(`${monthName} ${year}`)
  }

  // Generate sample SIM growth (starting at 100k, growing ~2% per month)
  const simValues = [100000]
  for (let i = 1; i < 24; i++) {
    simValues.push(Math.round(simValues[i - 1] * 1.02))
  }

  // Generate sample GB/SIM growth (starting at 1.9, growing slightly)
  const gbValues = [1.9]
  for (let i = 1; i < 24; i++) {
    gbValues.push(Math.round((gbValues[i - 1] + 0.02) * 100) / 100)
  }

  // Create data array
  const data: (string | number)[][] = [
    ['KPI', ...months],
    ['Total SIMs', ...simValues],
    ['GB per SIM', ...gbValues],
    ['UDR', ...Array(24).fill('')],
    ['PCS', ...Array(24).fill('')],
    ['CCS', ...Array(24).fill('')],
    ['SCS', ...Array(24).fill('')],
    ['CoS', ...Array(24).fill('')],
    ['Peak Throughput', ...Array(24).fill('')],
    ['Avg Throughput', ...Array(24).fill('')],
  ]

  const sheet = XLSX.utils.aoa_to_sheet(data)

  // Set column widths
  sheet['!cols'] = [
    { wch: 16 }, // KPI column
    ...months.map(() => ({ wch: 12 }))
  ]

  XLSX.utils.book_append_sheet(workbook, sheet, 'Forecast')

  return workbook
}

/**
 * Download the template workbook
 */
export function downloadTemplate() {
  const workbook = generateTemplateWorkbook()
  XLSX.writeFile(workbook, 'timeseries-forecast-template.xlsx')
}

/**
 * Get KPI value from parsed data for a specific period
 */
export function getKpiValue(
  data: ParsedTimeseriesData,
  kpiName: string,
  periodIndex: number
): number | null {
  const kpi = data.kpis.find(k => k.name === kpiName)
  if (!kpi || periodIndex < 0 || periodIndex >= kpi.values.length) {
    return null
  }
  return kpi.values[periodIndex]
}

/**
 * Check if data has all required inputs
 */
export function validateTimeseriesData(data: ParsedTimeseriesData): {
  valid: boolean
  missingKpis: string[]
  warnings: string[]
} {
  const requiredKpis = ['Total SIMs']
  const optionalKpis = ['GB per SIM']

  const missingRequired = requiredKpis.filter(
    kpi => !data.kpis.some(k => k.name === kpi)
  )

  const missingOptional = optionalKpis.filter(
    kpi => !data.kpis.some(k => k.name === kpi)
  )

  const warnings: string[] = []
  if (missingOptional.length > 0) {
    warnings.push(`Optional KPIs not found: ${missingOptional.join(', ')}. Default values will be used.`)
  }

  // Check for gaps in data
  const simsKpi = data.kpis.find(k => k.name === 'Total SIMs')
  if (simsKpi) {
    const nullCount = simsKpi.values.filter(v => v === null).length
    if (nullCount > 0) {
      warnings.push(`${nullCount} periods have missing SIM data. These will need to be interpolated or filled.`)
    }
  }

  return {
    valid: missingRequired.length === 0,
    missingKpis: missingRequired,
    warnings
  }
}
