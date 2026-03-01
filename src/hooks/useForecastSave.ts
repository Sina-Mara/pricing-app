import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  interpolateYearlyToMonthly,
  calculatePeriodForecast,
  DEFAULT_FORECAST_CONFIG,
  type ForecastConfig,
} from '@/lib/timeseries-pricing'
import type { YearlyForecastRow } from '@/components/YearlyForecastInput'

/**
 * Generate a unique ID for a new row
 */
function generateRowId(): string {
  return `row-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Convert YearlyForecastRow array to the format stored in the config field
 */
export function yearlyRowsToConfig(rows: YearlyForecastRow[]): object {
  return {
    yearlyData: rows.map(r => ({
      year: r.year,
      endOfYearSims: r.endOfYearSims,
      totalDataUsageGB: r.totalDataUsageGB,
    }))
  }
}

/**
 * Extract YearlyForecastRow array from the config field
 */
export function configToYearlyRows(config: unknown): YearlyForecastRow[] {
  if (!config || typeof config !== 'object') return []
  const c = config as { yearlyData?: Array<{ year: number; endOfYearSims: number; totalDataUsageGB: number }> }
  if (!c.yearlyData || !Array.isArray(c.yearlyData)) return []

  return c.yearlyData.map(d => ({
    id: generateRowId(),
    year: d.year,
    endOfYearSims: d.endOfYearSims,
    totalDataUsageGB: d.totalDataUsageGB,
  }))
}

interface SaveForecastParams {
  yearlyData: YearlyForecastRow[]
  forecastName: string
  description?: string
  customerId?: string | null
  forecastId?: string | null
  config?: ForecastConfig
}

/**
 * Hook that wraps forecast save/update logic as a useMutation.
 *
 * Returns `{ saveForecast, isPending }`.
 *
 * `saveForecast()` validates inputs, interpolates yearly→monthly,
 * upserts the forecast row, deletes stale data points (on update),
 * and inserts fresh monthly data points.
 */
export function useForecastSave() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async ({
      yearlyData,
      forecastName,
      description,
      customerId,
      forecastId,
      config = DEFAULT_FORECAST_CONFIG,
    }: SaveForecastParams): Promise<{ id: string; name: string }> => {
      if (yearlyData.length === 0) {
        throw new Error('No forecast data to save')
      }

      if (!forecastName.trim()) {
        throw new Error('Please enter a forecast name')
      }

      // Calculate monthly data points for storage
      const yearlyDataPoints = yearlyData
        .filter(r => r.endOfYearSims > 0)
        .map(r => ({
          year: r.year,
          totalSims: r.endOfYearSims,
          totalDataUsageGb: r.totalDataUsageGB,
        }))

      if (yearlyDataPoints.length === 0) {
        throw new Error('At least one year must have valid SIM data')
      }

      const interpolated = interpolateYearlyToMonthly(yearlyDataPoints)

      if (interpolated.length === 0) {
        throw new Error('Failed to interpolate monthly data')
      }

      // Calculate start/end dates
      const startDate = interpolated[0].date
      const endDate = interpolated[interpolated.length - 1].date

      // Prepare forecast data
      const forecastData = {
        customer_id: customerId || null,
        name: forecastName.trim(),
        description: description?.trim() || null,
        granularity: 'yearly' as const,
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        total_periods: interpolated.length,
        take_rate_pcs_udr: config.takeRatePcsUdr,
        take_rate_ccs_udr: config.takeRateCcsUdr,
        take_rate_scs_pcs: config.takeRateScsPcs,
        peak_average_ratio: config.peakAverageRatio,
        busy_hours: config.busyHours,
        days_per_month: config.daysPerMonth,
        original_filename: null,
        config: yearlyRowsToConfig(yearlyData),
      }

      let resultId: string

      if (forecastId) {
        // Update existing forecast
        const { error: forecastError } = await supabase
          .from('timeseries_forecasts')
          .update(forecastData)
          .eq('id', forecastId)

        if (forecastError) throw forecastError
        resultId = forecastId

        // Delete existing data points
        const { error: deleteError } = await supabase
          .from('timeseries_forecast_data')
          .delete()
          .eq('forecast_id', resultId)

        if (deleteError) throw deleteError
      } else {
        // Create new forecast
        const { data: forecast, error: forecastError } = await supabase
          .from('timeseries_forecasts')
          .insert(forecastData)
          .select()
          .single()

        if (forecastError) throw forecastError
        resultId = forecast.id
      }

      // Insert interpolated monthly data points
      const dataPoints = interpolated.map((m, idx) => {
        const gbPerSimMonthly = m.gbPerSim / 12
        const forecast = calculatePeriodForecast(m.totalSims, gbPerSimMonthly, config)

        return {
          forecast_id: resultId,
          period_index: idx + 1,
          period_date: m.date.toISOString().split('T')[0],
          total_sims: m.totalSims,
          gb_per_sim: gbPerSimMonthly,
          output_udr: forecast.udr,
          output_pcs: forecast.pcs,
          output_ccs: forecast.ccs,
          output_scs: forecast.scs,
          output_cos: forecast.cos,
          output_peak_throughput: forecast.peakThroughput,
          output_avg_throughput: forecast.avgThroughput,
          output_data_volume_gb: forecast.dataVolumeGb,
        }
      })

      const { error: dataError } = await supabase
        .from('timeseries_forecast_data')
        .insert(dataPoints)

      if (dataError) throw dataError

      return { id: resultId, name: forecastName }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeseries-forecasts'] })
    },
  })

  return {
    saveForecast: mutation.mutateAsync,
    isPending: mutation.isPending,
  }
}
