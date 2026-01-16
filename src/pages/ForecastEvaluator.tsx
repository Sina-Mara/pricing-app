import { useState, useMemo } from 'react'
import { Calculator, Settings2, TrendingUp, Server, Users, Database, Gauge } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'

// Default configuration values from the Excel file
const DEFAULT_CONFIG = {
  takeRatePcsUdr: 0.13,      // 13% - Active Users Concurrent / Total SIMs
  takeRateScsPcs: 1.0,       // 100% - Active Users Concurrent w/ Data Traffic / Active Users Concurrent
  takeRateCcsUdr: 0.9,       // 90% - Active Users Total / Total SIMs
  gbitPerGb: 8,              // Conversion factor
  daysPerMonth: 30,          // Days in month for throughput calculation
  busyHours: 8,              // Busy hours per day
  peakAverageRatio: 3,       // Peak to average throughput ratio
}

interface ForecastResults {
  udr: number                // Total SIMs (User Data Records)
  pcs: number                // Active Users Concurrent (Packet Control Sessions)
  ccs: number                // Active Users Total (Control Channel Sessions)
  scs: number                // Active Users Concurrent with Data Traffic
  dataVolumeGb: number       // Total data volume in GB
  throughputAverage: number  // Average throughput in Gbit/s
  throughputPeak: number     // Peak throughput in Gbit/s
  cos: number                // Concurrent Sessions (same as SCS for TISP-LGW)
}

function calculateForecast(
  totalSims: number,
  gbPerSim: number,
  config: typeof DEFAULT_CONFIG
): ForecastResults {
  // UDR = Total SIMs
  const udr = totalSims

  // PCS = Total SIMs × Take Rate (PCS/UDR)
  const pcs = Math.ceil(totalSims * config.takeRatePcsUdr)

  // CCS = Total SIMs × Take Rate (CCS/UDR)
  const ccs = Math.ceil(totalSims * config.takeRateCcsUdr)

  // SCS = PCS × Take Rate (SCS/PCS)
  const scs = Math.ceil(pcs * config.takeRateScsPcs)

  // CoS = Concurrent Sessions (same as SCS for gateway)
  const cos = scs

  // Data Volume = Total SIMs × GB/SIM
  const dataVolumeGb = totalSims * gbPerSim

  // Throughput Average = DataVolume × 8 / (30 × 8 × 3600) in Gbit/s
  const throughputAverage = (dataVolumeGb * config.gbitPerGb) /
    (config.daysPerMonth * config.busyHours * 3600)

  // Throughput Peak = Average × Peak/Average Ratio
  const throughputPeak = throughputAverage * config.peakAverageRatio

  return {
    udr,
    pcs,
    ccs,
    scs,
    dataVolumeGb,
    throughputAverage,
    throughputPeak,
    cos,
  }
}

function formatNumber(num: number, decimals: number = 0): string {
  if (decimals === 0) {
    return num.toLocaleString()
  }
  return num.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })
}

export default function ForecastEvaluator() {
  const [totalSims, setTotalSims] = useState<number>(100000)
  const [gbPerSim, setGbPerSim] = useState<number>(1.9)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [config, setConfig] = useState(DEFAULT_CONFIG)

  const results = useMemo(() => {
    return calculateForecast(totalSims, gbPerSim, config)
  }, [totalSims, gbPerSim, config])

  const handleConfigChange = (key: keyof typeof DEFAULT_CONFIG, value: number) => {
    setConfig(prev => ({ ...prev, [key]: value }))
  }

  const resetConfig = () => {
    setConfig(DEFAULT_CONFIG)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Forecast Evaluator</h1>
        <p className="text-muted-foreground">
          Calculate product license quantities from user and data metrics
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Input Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Input Parameters
            </CardTitle>
            <CardDescription>
              Enter your base metrics to calculate license requirements
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="totalSims">Total SIMs / Users</Label>
                <Input
                  id="totalSims"
                  type="number"
                  value={totalSims}
                  onChange={(e) => setTotalSims(Number(e.target.value) || 0)}
                  min={0}
                />
                <p className="text-xs text-muted-foreground">
                  Total number of SIM cards or users
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="gbPerSim">Data Usage (GB/SIM)</Label>
                <Input
                  id="gbPerSim"
                  type="number"
                  step="0.1"
                  value={gbPerSim}
                  onChange={(e) => setGbPerSim(Number(e.target.value) || 0)}
                  min={0}
                />
                <p className="text-xs text-muted-foreground">
                  Monthly data usage per SIM in GB
                </p>
              </div>
            </div>

            <Separator />

            {/* Advanced Configuration */}
            <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between">
                  <span className="flex items-center gap-2">
                    <Settings2 className="h-4 w-4" />
                    Advanced Configuration
                  </span>
                  <span className="text-muted-foreground text-sm">
                    {showAdvanced ? 'Hide' : 'Show'}
                  </span>
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="takeRatePcsUdr">Take Rate PCS/UDR (%)</Label>
                    <Input
                      id="takeRatePcsUdr"
                      type="number"
                      step="0.01"
                      value={config.takeRatePcsUdr * 100}
                      onChange={(e) => handleConfigChange('takeRatePcsUdr', (Number(e.target.value) || 0) / 100)}
                      min={0}
                      max={100}
                    />
                    <p className="text-xs text-muted-foreground">
                      Concurrent users / Total SIMs
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="takeRateCcsUdr">Take Rate CCS/UDR (%)</Label>
                    <Input
                      id="takeRateCcsUdr"
                      type="number"
                      step="0.01"
                      value={config.takeRateCcsUdr * 100}
                      onChange={(e) => handleConfigChange('takeRateCcsUdr', (Number(e.target.value) || 0) / 100)}
                      min={0}
                      max={100}
                    />
                    <p className="text-xs text-muted-foreground">
                      Active users total / Total SIMs
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="takeRateScsPcs">Take Rate SCS/PCS (%)</Label>
                    <Input
                      id="takeRateScsPcs"
                      type="number"
                      step="0.01"
                      value={config.takeRateScsPcs * 100}
                      onChange={(e) => handleConfigChange('takeRateScsPcs', (Number(e.target.value) || 0) / 100)}
                      min={0}
                      max={100}
                    />
                    <p className="text-xs text-muted-foreground">
                      Users with data traffic / Concurrent users
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="peakAverageRatio">Peak/Average Ratio</Label>
                    <Input
                      id="peakAverageRatio"
                      type="number"
                      step="0.1"
                      value={config.peakAverageRatio}
                      onChange={(e) => handleConfigChange('peakAverageRatio', Number(e.target.value) || 1)}
                      min={1}
                    />
                    <p className="text-xs text-muted-foreground">
                      Peak throughput multiplier
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="busyHours">Busy Hours/Day</Label>
                    <Input
                      id="busyHours"
                      type="number"
                      value={config.busyHours}
                      onChange={(e) => handleConfigChange('busyHours', Number(e.target.value) || 1)}
                      min={1}
                      max={24}
                    />
                    <p className="text-xs text-muted-foreground">
                      Peak traffic hours per day
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="daysPerMonth">Days/Month</Label>
                    <Input
                      id="daysPerMonth"
                      type="number"
                      value={config.daysPerMonth}
                      onChange={(e) => handleConfigChange('daysPerMonth', Number(e.target.value) || 1)}
                      min={1}
                      max={31}
                    />
                    <p className="text-xs text-muted-foreground">
                      Days for monthly calculation
                    </p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={resetConfig}>
                  Reset to Defaults
                </Button>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>

        {/* Results Section */}
        <div className="space-y-6">
          {/* TISP-AAA License Requirements */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                TISP-AAA License Requirements
              </CardTitle>
              <CardDescription>
                Authentication, Authorization, and Accounting licenses
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-lg border p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Database className="h-4 w-4" />
                    UDR
                  </div>
                  <div className="mt-2 text-2xl font-bold">
                    {formatNumber(results.udr)}
                  </div>
                  <p className="text-xs text-muted-foreground">User Data Records</p>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    PCS
                  </div>
                  <div className="mt-2 text-2xl font-bold">
                    {formatNumber(results.pcs)}
                  </div>
                  <p className="text-xs text-muted-foreground">Concurrent Users</p>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    CCS
                  </div>
                  <div className="mt-2 text-2xl font-bold">
                    {formatNumber(results.ccs)}
                  </div>
                  <p className="text-xs text-muted-foreground">Active Users Total</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* TISP-LGW License Requirements */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                TISP-LGW License Requirements
              </CardTitle>
              <CardDescription>
                Gateway throughput and session licenses
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Gauge className="h-4 w-4" />
                    Peak Throughput
                  </div>
                  <div className="mt-2 text-2xl font-bold">
                    {formatNumber(results.throughputPeak, 3)} <span className="text-sm font-normal">Gbit/s</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Avg: {formatNumber(results.throughputAverage, 3)} Gbit/s
                  </p>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    CoS
                  </div>
                  <div className="mt-2 text-2xl font-bold">
                    {formatNumber(results.cos)}
                  </div>
                  <p className="text-xs text-muted-foreground">Concurrent Sessions</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Data Volume Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Data Volume Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Monthly Data Volume</span>
                  <span className="font-medium">{formatNumber(results.dataVolumeGb, 0)} GB</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Data per SIM</span>
                  <span className="font-medium">{formatNumber(gbPerSim, 1)} GB/month</span>
                </div>
                <Separator className="my-2" />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">SCS (Data Sessions)</span>
                  <span className="font-medium">{formatNumber(results.scs)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Formula Reference */}
      <Card>
        <CardHeader>
          <CardTitle>Calculation Formulas</CardTitle>
          <CardDescription>Reference for the license quantity calculations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 text-sm md:grid-cols-2">
            <div className="space-y-2">
              <h4 className="font-medium">TISP-AAA</h4>
              <ul className="space-y-1 text-muted-foreground">
                <li><code className="text-xs bg-muted px-1 py-0.5 rounded">UDR</code> = Total SIMs</li>
                <li><code className="text-xs bg-muted px-1 py-0.5 rounded">PCS</code> = Total SIMs × Take Rate (PCS/UDR)</li>
                <li><code className="text-xs bg-muted px-1 py-0.5 rounded">CCS</code> = Total SIMs × Take Rate (CCS/UDR)</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium">TISP-LGW</h4>
              <ul className="space-y-1 text-muted-foreground">
                <li><code className="text-xs bg-muted px-1 py-0.5 rounded">CoS</code> = PCS × Take Rate (SCS/PCS)</li>
                <li><code className="text-xs bg-muted px-1 py-0.5 rounded">Avg Throughput</code> = (SIMs × GB/SIM × 8) / (Days × Hours × 3600)</li>
                <li><code className="text-xs bg-muted px-1 py-0.5 rounded">Peak Throughput</code> = Avg × Peak/Avg Ratio</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
