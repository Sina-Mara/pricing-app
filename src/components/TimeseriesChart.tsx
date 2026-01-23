import { useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  ComposedChart,
  Bar,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { PeriodForecastResult } from '@/lib/timeseries-pricing'

interface TimeseriesChartProps {
  data: PeriodForecastResult[]
  showPricing?: boolean
  pricingData?: {
    periodLabel: string
    monthlyTotal: number
  }[]
}

function formatNumber(num: number, compact = false): string {
  if (compact) {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
  }
  return num.toLocaleString()
}

function formatCurrency(num: number): string {
  if (num >= 1000000) return `$${(num / 1000000).toFixed(2)}M`
  if (num >= 1000) return `$${(num / 1000).toFixed(1)}K`
  return `$${num.toFixed(0)}`
}

export function TimeseriesChart({
  data,
  showPricing = false,
  pricingData = []
}: TimeseriesChartProps) {
  // Prepare chart data
  const chartData = useMemo(() => {
    return data.map((d, i) => ({
      period: d.periodLabel,
      totalSims: d.totalSims,
      gbPerSim: d.gbPerSim,
      udr: d.udr,
      pcs: d.pcs,
      ccs: d.ccs,
      cos: d.cos,
      peakThroughput: d.peakThroughput,
      avgThroughput: d.avgThroughput,
      dataVolumeGb: d.dataVolumeGb,
      monthlyTotal: pricingData[i]?.monthlyTotal ?? 0,
    }))
  }, [data, pricingData])

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: {
    active?: boolean
    payload?: Array<{ name: string; value: number; color: string }>
    label?: string
  }) => {
    if (!active || !payload) return null

    return (
      <div className="rounded-lg border bg-popover p-3 shadow-md">
        <p className="mb-2 font-medium">{label}</p>
        <div className="space-y-1">
          {payload.map((entry, index) => (
            <div key={index} className="flex items-center gap-2 text-sm">
              <div
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-muted-foreground">{entry.name}:</span>
              <span className="font-medium">
                {entry.name.includes('$') || entry.name.includes('Cost')
                  ? formatCurrency(entry.value)
                  : entry.name.includes('Throughput')
                  ? `${entry.value.toFixed(3)} Gbit/s`
                  : entry.name.includes('GB')
                  ? `${formatNumber(entry.value)} GB`
                  : formatNumber(entry.value)}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardContent className="flex h-64 items-center justify-center">
          <p className="text-muted-foreground">No data to display</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Tabs defaultValue="growth" className="space-y-4">
      <TabsList>
        <TabsTrigger value="growth">SIM Growth</TabsTrigger>
        <TabsTrigger value="licenses">License KPIs</TabsTrigger>
        <TabsTrigger value="throughput">Throughput</TabsTrigger>
        {showPricing && <TabsTrigger value="pricing">Pricing</TabsTrigger>}
      </TabsList>

      {/* SIM Growth Chart */}
      <TabsContent value="growth">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">SIM Growth & Data Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="period"
                    tick={{ fontSize: 11 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    yAxisId="left"
                    tickFormatter={(v) => formatNumber(v, true)}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tickFormatter={(v) => `${v} GB`}
                    tick={{ fontSize: 11 }}
                    domain={['auto', 'auto']}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="totalSims"
                    name="Total SIMs"
                    fill="hsl(var(--primary))"
                    fillOpacity={0.2}
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="gbPerSim"
                    name="GB per SIM"
                    stroke="hsl(var(--chart-2))"
                    strokeWidth={2}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* License KPIs Chart */}
      <TabsContent value="licenses">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">License Requirements Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="period"
                    tick={{ fontSize: 11 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tickFormatter={(v) => formatNumber(v, true)}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="udr"
                    name="UDR"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="pcs"
                    name="PCS"
                    stroke="hsl(var(--chart-2))"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="ccs"
                    name="CCS"
                    stroke="hsl(var(--chart-3))"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="cos"
                    name="CoS"
                    stroke="hsl(var(--chart-4))"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* Throughput Chart */}
      <TabsContent value="throughput">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Throughput & Data Volume</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="period"
                    tick={{ fontSize: 11 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    yAxisId="left"
                    tickFormatter={(v) => `${v.toFixed(2)}`}
                    tick={{ fontSize: 11 }}
                    label={{ value: 'Gbit/s', angle: -90, position: 'insideLeft', fontSize: 11 }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tickFormatter={(v) => formatNumber(v, true)}
                    tick={{ fontSize: 11 }}
                    label={{ value: 'GB', angle: 90, position: 'insideRight', fontSize: 11 }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Bar
                    yAxisId="right"
                    dataKey="dataVolumeGb"
                    name="Data Volume (GB)"
                    fill="hsl(var(--muted))"
                    opacity={0.5}
                  />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="peakThroughput"
                    name="Peak Throughput"
                    stroke="hsl(var(--destructive))"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="avgThroughput"
                    name="Avg Throughput"
                    stroke="hsl(var(--chart-2))"
                    strokeWidth={2}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* Pricing Chart */}
      {showPricing && (
        <TabsContent value="pricing">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Monthly Cost Over Time</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="period"
                      tick={{ fontSize: 11 }}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tickFormatter={(v) => formatCurrency(v)}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Bar
                      dataKey="monthlyTotal"
                      name="Monthly Cost"
                      fill="hsl(var(--primary))"
                      radius={[4, 4, 0, 0]}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      )}
    </Tabs>
  )
}

// Mini chart for summary display
export function MiniTimeseriesChart({
  data,
  dataKey = 'totalSims',
  height = 60,
  color = 'hsl(var(--primary))',
}: {
  data: PeriodForecastResult[]
  dataKey?: keyof PeriodForecastResult
  height?: number
  color?: string
}) {
  const chartData = useMemo(() => {
    return data.map(d => ({
      period: d.periodLabel,
      value: d[dataKey] as number,
    }))
  }, [data, dataKey])

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
