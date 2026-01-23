import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import {
  parseExcelFile,
  generateTemplateWorkbook,
  getKpiValue,
  validateTimeseriesData,
} from '@/lib/excel-parser'
import type { ParsedTimeseriesData } from '@/types/database'

// Helper to create a test Excel file buffer
function createTestExcel(data: (string | number | null)[][]): ArrayBuffer {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet(data)
  XLSX.utils.book_append_sheet(workbook, sheet, 'Test')
  const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
  return buffer
}

describe('excel-parser', () => {
  describe('parseExcelFile', () => {
    it('should parse file with YYYY-MM date format', () => {
      const data = [
        ['KPI', '2025-01', '2025-02', '2025-03'],
        ['Total SIMs', 100000, 110000, 120000],
        ['GB per SIM', 1.9, 2.0, 2.1],
      ]
      const buffer = createTestExcel(data)
      const result = parseExcelFile(buffer)

      expect(result.success).toBe(true)
      expect(result.data?.periods).toHaveLength(3)
      expect(result.data?.kpis).toHaveLength(2)
      expect(result.data?.granularity).toBe('monthly')
    })

    it('should parse file with MMM YYYY date format', () => {
      const data = [
        ['KPI', 'Jan 2025', 'Feb 2025', 'Mar 2025'],
        ['Total SIMs', 100000, 110000, 120000],
      ]
      const buffer = createTestExcel(data)
      const result = parseExcelFile(buffer)

      expect(result.success).toBe(true)
      expect(result.data?.periods).toHaveLength(3)
      expect(result.data?.periods[0].label).toBe('Jan 2025')
    })

    it('should parse file with Year N format', () => {
      const data = [
        ['KPI', 'Year 1', 'Year 2', 'Year 3'],
        ['Total SIMs', 100000, 200000, 300000],
      ]
      const buffer = createTestExcel(data)
      const result = parseExcelFile(buffer)

      expect(result.success).toBe(true)
      expect(result.data?.periods).toHaveLength(3)
      expect(result.data?.granularity).toBe('yearly')
    })

    it('should parse file with YYYY format', () => {
      const data = [
        ['KPI', '2025', '2026', '2027'],
        ['Total SIMs', 100000, 200000, 300000],
      ]
      const buffer = createTestExcel(data)
      const result = parseExcelFile(buffer)

      expect(result.success).toBe(true)
      expect(result.data?.periods).toHaveLength(3)
      expect(result.data?.granularity).toBe('yearly')
    })

    it('should normalize KPI names', () => {
      const data = [
        ['KPI', '2025-01'],
        ['total sims', 100000],
        ['GB/SIM', 1.9],
        ['pcs', 13000],
      ]
      const buffer = createTestExcel(data)
      const result = parseExcelFile(buffer)

      expect(result.success).toBe(true)
      const kpiNames = result.data?.kpis.map(k => k.name)
      expect(kpiNames).toContain('Total SIMs')
      expect(kpiNames).toContain('GB per SIM')
      expect(kpiNames).toContain('PCS')
    })

    it('should handle null/empty cells', () => {
      const data = [
        ['KPI', '2025-01', '2025-02', '2025-03'],
        ['Total SIMs', 100000, null, 120000],
        ['GB per SIM', 1.9, 2.0, ''],
      ]
      const buffer = createTestExcel(data)
      const result = parseExcelFile(buffer)

      expect(result.success).toBe(true)
      expect(result.data?.kpis[0].values).toEqual([100000, null, 120000])
      expect(result.data?.kpis[1].values).toEqual([1.9, 2.0, null])
    })

    it('should sort periods chronologically', () => {
      const data = [
        ['KPI', '2025-03', '2025-01', '2025-02'],
        ['Total SIMs', 300000, 100000, 200000],
      ]
      const buffer = createTestExcel(data)
      const result = parseExcelFile(buffer)

      expect(result.success).toBe(true)
      expect(result.data?.periods[0].label).toBe('2025-01')
      expect(result.data?.periods[1].label).toBe('2025-02')
      expect(result.data?.periods[2].label).toBe('2025-03')
      // Values should be reordered to match
      expect(result.data?.kpis[0].values).toEqual([100000, 200000, 300000])
    })

    it('should fail if no Total SIMs KPI', () => {
      const data = [
        ['KPI', '2025-01', '2025-02'],
        ['Other KPI', 100, 200],
        ['GB per SIM', 1.9, 2.0],
      ]
      const buffer = createTestExcel(data)
      const result = parseExcelFile(buffer)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Total SIMs')
    })

    it('should warn if GB per SIM is missing', () => {
      const data = [
        ['KPI', '2025-01', '2025-02'],
        ['Total SIMs', 100000, 110000],
      ]
      const buffer = createTestExcel(data)
      const result = parseExcelFile(buffer)

      expect(result.success).toBe(true)
      expect(result.warnings).toBeDefined()
      expect(result.warnings?.some(w => w.includes('GB per SIM'))).toBe(true)
    })

    it('should fail if no valid date columns', () => {
      const data = [
        ['KPI', 'Invalid', 'Columns'],
        ['Total SIMs', 100000, 110000],
      ]
      const buffer = createTestExcel(data)
      const result = parseExcelFile(buffer)

      expect(result.success).toBe(false)
      expect(result.error).toContain('No valid time period columns')
    })

    it('should fail for empty workbook', () => {
      const workbook = XLSX.utils.book_new()
      const sheet = XLSX.utils.aoa_to_sheet([])
      XLSX.utils.book_append_sheet(workbook, sheet, 'Empty')
      const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })

      const result = parseExcelFile(buffer)

      expect(result.success).toBe(false)
    })

    it('should handle quarter format Q1 2025', () => {
      const data = [
        ['KPI', 'Q1 2025', 'Q2 2025', 'Q3 2025', 'Q4 2025'],
        ['Total SIMs', 100000, 110000, 120000, 130000],
      ]
      const buffer = createTestExcel(data)
      const result = parseExcelFile(buffer)

      expect(result.success).toBe(true)
      expect(result.data?.periods).toHaveLength(4)
    })

    it('should set correct start and end dates', () => {
      const data = [
        ['KPI', '2025-01', '2025-06', '2025-12'],
        ['Total SIMs', 100000, 150000, 200000],
      ]
      const buffer = createTestExcel(data)
      const result = parseExcelFile(buffer)

      expect(result.success).toBe(true)
      expect(result.data?.startDate.getMonth()).toBe(0) // January
      expect(result.data?.startDate.getFullYear()).toBe(2025)
      expect(result.data?.endDate.getMonth()).toBe(11) // December
      expect(result.data?.endDate.getFullYear()).toBe(2025)
    })
  })

  describe('generateTemplateWorkbook', () => {
    it('should generate a valid workbook', () => {
      const workbook = generateTemplateWorkbook()

      expect(workbook.SheetNames).toHaveLength(1)
      expect(workbook.SheetNames[0]).toBe('Forecast')
    })

    it('should include required KPIs', () => {
      const workbook = generateTemplateWorkbook()
      const sheet = workbook.Sheets['Forecast']
      const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })

      const kpiColumn = data.map(row => row[0])
      expect(kpiColumn).toContain('Total SIMs')
      expect(kpiColumn).toContain('GB per SIM')
    })

    it('should include 24 months of columns', () => {
      const workbook = generateTemplateWorkbook()
      const sheet = workbook.Sheets['Forecast']
      const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })

      const headerRow = data[0]
      // First column is KPI, rest are months
      expect(headerRow.length).toBe(25) // 1 + 24 months
    })
  })

  describe('getKpiValue', () => {
    const mockData: ParsedTimeseriesData = {
      periods: [
        { date: new Date(2025, 0, 1), label: 'Jan 2025' },
        { date: new Date(2025, 1, 1), label: 'Feb 2025' },
      ],
      kpis: [
        { name: 'Total SIMs', values: [100000, 110000] },
        { name: 'GB per SIM', values: [1.9, 2.0] },
      ],
      granularity: 'monthly',
      startDate: new Date(2025, 0, 1),
      endDate: new Date(2025, 1, 1),
    }

    it('should return correct value for valid KPI and index', () => {
      expect(getKpiValue(mockData, 'Total SIMs', 0)).toBe(100000)
      expect(getKpiValue(mockData, 'Total SIMs', 1)).toBe(110000)
      expect(getKpiValue(mockData, 'GB per SIM', 0)).toBe(1.9)
    })

    it('should return null for unknown KPI', () => {
      expect(getKpiValue(mockData, 'Unknown', 0)).toBeNull()
    })

    it('should return null for out of bounds index', () => {
      expect(getKpiValue(mockData, 'Total SIMs', -1)).toBeNull()
      expect(getKpiValue(mockData, 'Total SIMs', 10)).toBeNull()
    })
  })

  describe('validateTimeseriesData', () => {
    it('should pass validation with required KPIs', () => {
      const data: ParsedTimeseriesData = {
        periods: [{ date: new Date(), label: 'P1' }],
        kpis: [
          { name: 'Total SIMs', values: [100000] },
          { name: 'GB per SIM', values: [1.9] },
        ],
        granularity: 'monthly',
        startDate: new Date(),
        endDate: new Date(),
      }

      const result = validateTimeseriesData(data)
      expect(result.valid).toBe(true)
      expect(result.missingKpis).toHaveLength(0)
    })

    it('should fail validation without Total SIMs', () => {
      const data: ParsedTimeseriesData = {
        periods: [{ date: new Date(), label: 'P1' }],
        kpis: [{ name: 'GB per SIM', values: [1.9] }],
        granularity: 'monthly',
        startDate: new Date(),
        endDate: new Date(),
      }

      const result = validateTimeseriesData(data)
      expect(result.valid).toBe(false)
      expect(result.missingKpis).toContain('Total SIMs')
    })

    it('should warn about missing optional KPIs', () => {
      const data: ParsedTimeseriesData = {
        periods: [{ date: new Date(), label: 'P1' }],
        kpis: [{ name: 'Total SIMs', values: [100000] }],
        granularity: 'monthly',
        startDate: new Date(),
        endDate: new Date(),
      }

      const result = validateTimeseriesData(data)
      expect(result.valid).toBe(true)
      expect(result.warnings.length).toBeGreaterThan(0)
    })

    it('should warn about gaps in SIM data', () => {
      const data: ParsedTimeseriesData = {
        periods: [
          { date: new Date(2025, 0), label: 'Jan' },
          { date: new Date(2025, 1), label: 'Feb' },
          { date: new Date(2025, 2), label: 'Mar' },
        ],
        kpis: [{ name: 'Total SIMs', values: [100000, null, 120000] }],
        granularity: 'monthly',
        startDate: new Date(2025, 0),
        endDate: new Date(2025, 2),
      }

      const result = validateTimeseriesData(data)
      expect(result.warnings.some(w => w.includes('missing'))).toBe(true)
    })
  })
})
