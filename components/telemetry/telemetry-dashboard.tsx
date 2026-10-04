"use client"

import { useCallback, useMemo, useState, type FormEvent, type ReactNode } from "react"
import useSWR from "swr"
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  Cpu,
  Download,
  RefreshCw,
  Radio,
  Search,
  Signal,
  Wifi,
} from "lucide-react"
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  PAGE_SIZE,
  apiBaseUrl,
  errorMessage,
  fetchMeasurements,
  fetchPdr,
  formatMetric,
  formatTimestamp,
  getMeasurementMetrics,
  metricLabel,
  metricUnit,
  pdrPercentage,
  rangeStart,
  type Measurement,
  type Pdr,
} from "@/lib/telemetry"

type Range = "1h" | "6h" | "12h" | "24h" | "7d" | "all"
type LoadingValueProps = { loading: boolean; children: ReactNode }

function LoadingValue({ loading, children }: LoadingValueProps) {
  return loading ? <Skeleton className="h-8 w-24" /> : children
}

function StatCard({
  icon: Icon,
  label,
  value,
  detail,
  loading = false,
  className = "",
}: {
  icon: typeof Activity
  label: string
  value: ReactNode
  detail: ReactNode
  loading?: boolean
  className?: string
}) {
  return (
    <Card className={`border-border/70 bg-card shadow-none ${className}`}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-medium uppercase tracking-[0.13em] text-muted-foreground">{label}</p>
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="size-4" aria-hidden="true" /></span>
        </div>
        <div className="mt-4 min-h-9 text-2xl font-semibold tracking-tight tabular-nums text-foreground sm:text-[1.7rem]">
          <LoadingValue loading={loading}>{value}</LoadingValue>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
      </CardContent>
    </Card>
  )
}

function MetricChart({
  measurements,
  metric,
  range,
  loading,
}: {
  measurements: Measurement[]
  metric: string
  range: Range
  loading: boolean
}) {
  const points = useMemo(() => {
    const start = rangeStart(range)
    return measurements
      .filter((measurement) => new Date(measurement.timestamp).getTime() >= start)
      .filter((measurement) => typeof measurement[metric] === "number" && Number.isFinite(measurement[metric]))
      .map((measurement) => ({
        timestamp: new Date(measurement.timestamp).getTime(),
        value: measurement[metric] as number,
      }))
  }, [measurements, metric, range])

  const plottedPoints = useMemo(() => {
    if (points.length <= 800) return points
    const bucketSize = Math.ceil(points.length / 400)
    const reduced: typeof points = []
    for (let start = 0; start < points.length; start += bucketSize) {
      const bucket = points.slice(start, start + bucketSize)
      let low = bucket[0]
      let high = bucket[0]
      for (const point of bucket.slice(1)) {
        if (point.value < low.value) low = point
        if (point.value > high.value) high = point
      }
      if (low.timestamp <= high.timestamp) reduced.push(low, ...(low === high ? [] : [high]))
      else reduced.push(high, low)
    }
    return reduced
  }, [points])
  const { min, max } = points.reduce((extent, point) => ({ min: Math.min(extent.min, point.value), max: Math.max(extent.max, point.value) }), { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY })
  const safeMin = points.length ? min : 0
  const safeMax = points.length ? max : 0
  const pad = safeMax === safeMin ? Math.max(Math.abs(safeMax) * 0.08, 1) : (safeMax - safeMin) * 0.14
  const domain: [number, number] = [safeMin - pad, safeMax + pad]
  const tickFormatter = (timestamp: number) => {
    const date = new Date(timestamp)
    return range === "1h" || range === "6h" || range === "12h"
      ? new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date)
      : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit" }).format(date)
  }

  if (loading) return <div className="flex h-[260px] flex-col justify-end gap-3 pb-2"><Skeleton className="h-4 w-28" /><Skeleton className="h-52 w-full" /></div>

  if (!points.length) {
    return <div className="flex h-[260px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/80 text-center">
      <Activity className="size-5 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-medium">No readings in this range</p>
      <p className="max-w-xs text-xs text-muted-foreground">There are no API readings for {metricLabel(metric).toLowerCase()} in the selected time window.</p>
    </div>
  }

  return <ChartContainer config={{ value: { label: metricLabel(metric), color: "var(--chart-1)" } }} className="h-[260px] w-full">
    <LineChart data={plottedPoints} margin={{ top: 12, right: 8, left: 0, bottom: 16 }} accessibilityLayer>
      <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
      <XAxis dataKey="timestamp" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={tickFormatter} minTickGap={36} tickLine={false} axisLine={false} tickMargin={10} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} label={{ value: "Time", position: "insideBottom", offset: -6, fill: "var(--muted-foreground)", fontSize: 10 }} />
      <YAxis domain={domain} tickLine={false} axisLine={false} width={52} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickFormatter={(value: number) => Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 })} label={{ value: `${metricLabel(metric)}${metricUnit(metric) ? ` (${metricUnit(metric)})` : ""}`, angle: -90, position: "insideLeft", fill: "var(--muted-foreground)", fontSize: 10 }} />
      <ChartTooltip cursor={{ stroke: "var(--border)", strokeDasharray: "4 4" }} content={<ChartTooltipContent labelFormatter={(_, payload) => payload?.[0]?.payload?.timestamp ? formatTimestamp(new Date(payload[0].payload.timestamp).toISOString()) : ""} formatter={(value) => [`${formatMetric(Number(value))}${metricUnit(metric) ? ` ${metricUnit(metric)}` : ""}`, metricLabel(metric)]} />} />
      <ReferenceLine y={points.at(-1)?.value} stroke="var(--chart-1)" strokeDasharray="3 4" strokeOpacity={0.4} />
      <Line data={plottedPoints} dataKey="value" type="monotone" stroke="var(--color-value)" strokeWidth={2} dot={plottedPoints.length < 30 ? { r: 3, fill: "var(--color-value)", strokeWidth: 0 } : false} activeDot={{ r: 5, strokeWidth: 0 }} isAnimationActive={false} connectNulls />
    </LineChart>
  </ChartContainer>
}

export function TelemetryDashboard({ initialDeviceId = "" }: { initialDeviceId?: string }) {
  const [deviceId, setDeviceId] = useState(initialDeviceId)
  const [deviceDraft, setDeviceDraft] = useState(initialDeviceId)
  const [range, setRange] = useState<Range>("24h")
  const [page, setPage] = useState(1)
  const [tableQuery, setTableQuery] = useState("")
  const [newestFirst, setNewestFirst] = useState(true)
  const base = apiBaseUrl()

  const measurementKey = useMemo(() => deviceId && base ? ["measurements", deviceId] as const : null, [deviceId, base])
  const pdrKey = useMemo(() => deviceId && base ? ["pdr", deviceId] as const : null, [deviceId, base])
  const { data: measurements, error: measurementsError, isLoading: measurementsLoading, mutate: reloadMeasurements } = useSWR(
    measurementKey,
    ([, id]) => fetchMeasurements(id),
    { revalidateOnFocus: false, keepPreviousData: false, refreshInterval: 60_000 },
  )
  const { data: pdr, error: pdrError, isLoading: pdrLoading, mutate: reloadPdr } = useSWR(
    pdrKey,
    ([, id]) => fetchPdr(id),
    { revalidateOnFocus: false, keepPreviousData: false, refreshInterval: 60_000 },
  )
  const loading = measurementsLoading && !measurements
  const metrics = useMemo(() => getMeasurementMetrics(measurements ?? []), [measurements])
  const latest = measurements?.at(-1)
  const validReadings = useMemo(() => (measurements ?? []).filter((reading) => {
    const query = tableQuery.trim().toLowerCase()
    return !query || Object.entries(reading).some(([key, value]) => `${key} ${value ?? ""}`.toLowerCase().includes(query))
  }), [measurements, tableQuery])
  const sortedReadings = useMemo(() => [...validReadings].sort((a, b) => (newestFirst ? -1 : 1) * (Date.parse(a.timestamp) - Date.parse(b.timestamp))), [validReadings, newestFirst])
  const pageCount = Math.max(1, Math.ceil(validReadings.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pageRows = sortedReadings.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const pdrValue = pdrPercentage(pdr ?? null)
  const pdrHealthy = pdrValue !== null && pdrValue >= 95

  const changeDevice = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const next = deviceDraft.trim()
    if (!next) return
    setDeviceId(next)
    setDeviceDraft(next)
    setPage(1)
    setTableQuery("")
    window.history.pushState({}, "", `/devices/${encodeURIComponent(next)}`)
  }, [deviceDraft])

  const downloadCsv = useCallback(() => {
    if (!measurements?.length) return
    const columns = Object.keys(measurements[0])
    const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`
    const csv = [columns.map(escape).join(","), ...measurements.map((row) => columns.map((column) => escape(row[column])).join(","))].join("\r\n")
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `device-${deviceId}-measurements.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }, [deviceId, measurements])

  const refresh = () => {
    void reloadMeasurements()
    void reloadPdr()
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/70 bg-card/70">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Activity className="size-5" aria-hidden="true" /></div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">Temperature Monitor</p>
              <h1 className="text-lg font-semibold tracking-tight sm:text-xl">Device telemetry</h1>
              <p className="text-xs text-muted-foreground">Current device: {deviceId || "Not selected"}</p>
            </div>
            <Badge variant="outline" className="ml-1 hidden gap-1.5 border-border bg-background text-muted-foreground sm:inline-flex"><span className={`size-1.5 rounded-full ${base ? "bg-emerald-500" : "bg-amber-500"}`} />{base ? "API configured" : "API not configured"}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <form onSubmit={changeDevice} className="flex min-w-0 flex-1 gap-2" aria-label="Select telemetry device">
              <label htmlFor="device-id" className="sr-only">Device ID</label>
              <div className="relative min-w-0 flex-1 sm:w-48 sm:flex-none"><Cpu className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Input id="device-id" autoComplete="off" value={deviceDraft} onChange={(event) => setDeviceDraft(event.target.value)} className="pl-9" placeholder="Device ID" /></div>
              <Button type="submit" variant="default">Load device</Button>
            </form>
            <Button type="button" variant="outline" size="icon" onClick={refresh} disabled={!deviceId || !base} aria-label="Refresh dashboard" title="Refresh dashboard"><RefreshCw className={`size-4 ${measurementsLoading || pdrLoading ? "animate-spin" : ""}`} aria-hidden="true" /></Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1440px] flex-col gap-5 px-4 py-6 sm:px-6 lg:gap-6 lg:px-8 lg:py-8">
        {!base && <Alert className="border-amber-500/30 bg-amber-500/5">
          <AlertTriangle className="size-4 text-amber-600" aria-hidden="true" />
          <AlertTitle>Connect the FastAPI service</AlertTitle>
          <AlertDescription>Set <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">NEXT_PUBLIC_API_URL</code> to the service base URL. Telemetry stays empty until the API is configured; this dashboard does not use sample readings.</AlertDescription>
        </Alert>}

        <section aria-label="Latest device measurements" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {(["temperature", "humidity", "rssi", "snr"] as const).map((key) => {
            const value = latest?.[key]
            const unit = metricUnit(key)
            return <StatCard key={key} icon={key === "rssi" || key === "snr" ? Signal : Activity} label={`Latest ${metricLabel(key)}`} value={formatMetric(value, unit ? ` ${unit}` : "")} detail={latest ? `Updated ${formatTimestamp(latest.timestamp)}` : !deviceId ? "Load a device to begin" : base ? "No reading returned" : "API not configured"} loading={loading} />
          })}
          <StatCard icon={Wifi} label="Packet delivery ratio" value={pdrValue !== null ? `${formatMetric(pdrValue)}%` : "—"} detail={pdr ? `${formatMetric(pdr.received)} received · ${formatMetric(pdr.expected)} expected · ${formatMetric(pdr.lost)} lost` : pdrError ? "PDR data unavailable" : base ? "No packet data available" : "API not configured"} loading={pdrLoading && !pdr && !!deviceId} />
        </section>

        {measurementsError && base && <Alert variant="destructive">
          <AlertTriangle className="size-4" aria-hidden="true" />
          <AlertTitle>Could not load measurements</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">{errorMessage(measurementsError)}<Button type="button" variant="outline" size="sm" onClick={() => void reloadMeasurements()}><RefreshCw data-icon="inline-start" />Retry request</Button></AlertDescription>
        </Alert>}
        {pdrError && base && <Alert className="border-border bg-muted/40">
          <CircleHelp className="size-4" aria-hidden="true" />
          <AlertTitle>Packet delivery data unavailable</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">{errorMessage(pdrError)}<Button type="button" variant="outline" size="sm" onClick={() => void reloadPdr()}><RefreshCw data-icon="inline-start" />Retry PDR</Button></AlertDescription>
        </Alert>}

        <section aria-label="Measurement trends" className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="flex items-center gap-2 text-muted-foreground"><Clock3 className="size-4" aria-hidden="true" /><p className="text-xs font-medium uppercase tracking-[0.14em]">Live signal history</p></div>
              <h2 className="mt-1 text-xl font-semibold tracking-tight">Measurement trends</h2>
              <p className="mt-1 text-sm text-muted-foreground">{deviceId ? `Readings reported by device ${deviceId}` : "Select a device to view telemetry trends"}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap rounded-lg border border-border bg-card p-1" role="group" aria-label="Chart time range">
                {(["1h", "6h", "12h", "24h", "7d", "all"] as Range[]).map((value) => <Button key={value} type="button" variant={range === value ? "secondary" : "ghost"} size="sm" className="h-8 px-2.5 text-xs" aria-pressed={range === value} onClick={() => setRange(value)}>{value === "all" ? "All" : value}</Button>)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {metrics.length ? metrics.map((item) => <Card key={item} className="border-border/70 shadow-none">
              <CardHeader className="flex flex-row items-start justify-between gap-4 pb-2">
                <div><CardTitle className="text-sm font-medium">{metricLabel(item)} vs time{metricUnit(item) ? ` · ${metricUnit(item)}` : ""}</CardTitle><p className="mt-1 text-xs text-muted-foreground">{range === "all" ? "All available readings" : `Past ${range}`}</p></div>
                {latest && <div className="text-right"><p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Latest value</p><p className="mt-1 text-lg font-semibold tabular-nums">{formatMetric(latest[item], metricUnit(item) ? ` ${metricUnit(item)}` : "")}</p></div>}
              </CardHeader>
              <CardContent className="pt-2"><MetricChart measurements={measurements ?? []} metric={item} range={range} loading={loading} /></CardContent>
            </Card>) : <Card className="border-border/70 shadow-none xl:col-span-2"><CardContent className="flex min-h-[310px] flex-col items-center justify-center gap-2 text-center">
              {loading ? <><Skeleton className="h-5 w-40" /><Skeleton className="mt-3 h-56 w-full" /></> : <><span className="flex size-10 items-center justify-center rounded-full bg-muted"><Activity className="size-5 text-muted-foreground" aria-hidden="true" /></span><p className="mt-2 text-sm font-medium">{deviceId ? "No sensor metrics available" : "No device selected"}</p><p className="max-w-md text-xs text-muted-foreground">{!deviceId ? "Enter a device ID to load live sensor trends." : base ? "The API has not returned temperature, humidity, RSSI, or SNR readings for this device." : "Connect the FastAPI service to load live sensor trends."}</p></>}
            </CardContent></Card>}
          </div>
        </section>

        {pdrValue !== null && <Card className="border-border/70 shadow-none">
          <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="flex items-start gap-3"><span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${pdrHealthy ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"}`}><Signal className="size-5" aria-hidden="true" /></span><div><p className="text-sm font-semibold">Packet delivery ratio</p><p className="mt-1 text-xs text-muted-foreground">Device {deviceId} · {formatMetric(pdr?.received)} received / {formatMetric(pdr?.expected)} expected · {formatMetric(pdr?.lost)} lost</p></div></div>
            <div className="flex items-center gap-3 sm:justify-end"><span className="text-2xl font-semibold tabular-nums tracking-tight">{formatMetric(pdrValue)}%</span><Badge variant={pdrHealthy ? "secondary" : "outline"} className={pdrHealthy ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700" : "border-amber-500/30 text-amber-700"}>{pdrHealthy ? "Healthy" : "Needs attention"}</Badge></div>
          </CardContent>
        </Card>}

        <section aria-label="Measurement records" className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div><p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Data explorer</p><h2 className="mt-1 text-xl font-semibold tracking-tight">Recent measurements</h2><p className="mt-1 text-sm text-muted-foreground">{validReadings.length ? `${validReadings.length.toLocaleString()} record${validReadings.length === 1 ? "" : "s"} for device ${deviceId}` : !deviceId ? "Enter a device ID to load records" : base ? `API readings for device ${deviceId}` : "Waiting for API configuration"}</p></div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative sm:w-56"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Input aria-label="Search measurements" placeholder="Filter records" value={tableQuery} onChange={(event) => { setTableQuery(event.target.value); setPage(1) }} className="pl-9" /></div>
              <Button type="button" variant="outline" size="sm" disabled={!measurements?.length} onClick={downloadCsv}><Download data-icon="inline-start" />Export CSV</Button>
            </div>
          </div>
          <Card className="overflow-hidden border-border/70 shadow-none">
            <Table className="min-w-[920px]">
              <TableHeader className="bg-muted/40 text-muted-foreground"><TableRow>
                <TableHead scope="col" aria-sort={newestFirst ? "descending" : "ascending"} className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.13em]"><button type="button" className="inline-flex items-center gap-2" onClick={() => setNewestFirst((current) => !current)}>Timestamp<ArrowDown className={`size-3 transition-transform ${newestFirst ? "" : "rotate-180"}`} aria-hidden="true" /><span className="sr-only">Toggle timestamp sort order</span></button></TableHead>
                <TableHead scope="col" className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.13em]">Packet ID</TableHead>
                <TableHead scope="col" className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.13em]">Device ID</TableHead>
                <TableHead scope="col" className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.13em]">Temperature</TableHead>
                <TableHead scope="col" className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.13em]">Humidity</TableHead>
                <TableHead scope="col" className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.13em]">RSSI</TableHead>
                <TableHead scope="col" className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.13em]">SNR</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {loading ? Array.from({ length: 5 }, (_, row) => <TableRow key={row}>{Array.from({ length: 7 }, (_, column) => <TableCell key={column} className="px-4 py-4"><Skeleton className={`h-4 ${column === 0 ? "w-36" : "ml-auto w-14"}`} /></TableCell>)}</TableRow>) : pageRows.map((reading) => <TableRow key={`${reading.id}-${reading.timestamp}`}><TableCell className="whitespace-nowrap px-4 py-3.5 text-xs text-muted-foreground">{formatTimestamp(reading.timestamp)}</TableCell><TableCell className="px-4 py-3.5 text-right font-mono text-xs tabular-nums">{reading.packet_id ?? "—"}</TableCell><TableCell className="px-4 py-3.5 text-xs">{reading.device_id}</TableCell><TableCell className="px-4 py-3.5 text-right font-mono text-xs tabular-nums">{formatMetric(reading.temperature, " °C")}</TableCell><TableCell className="px-4 py-3.5 text-right font-mono text-xs tabular-nums">{formatMetric(reading.humidity, " %")}</TableCell><TableCell className="px-4 py-3.5 text-right font-mono text-xs tabular-nums">{formatMetric(reading.rssi, " dBm")}</TableCell><TableCell className="px-4 py-3.5 text-right font-mono text-xs tabular-nums">{formatMetric(reading.snr, " dB")}</TableCell></TableRow>)}
                {!loading && !measurementsError && pageRows.length === 0 && <TableRow><TableCell colSpan={7} className="px-4 py-12 text-center"><div className="mx-auto flex max-w-sm flex-col items-center gap-2"><Activity className="size-5 text-muted-foreground" aria-hidden="true" /><p className="text-sm font-medium">{measurements?.length ? "No matching records" : !deviceId ? "Select a device to begin" : base ? "No measurements yet" : "API not configured"}</p><p className="text-xs text-muted-foreground">{measurements?.length ? "Try a different filter." : !deviceId ? "Enter a device ID above to load live measurements." : base ? `The API has not returned measurements for device ${deviceId}.` : "Connect the FastAPI service to load device records."}</p></div></TableCell></TableRow>}
              </TableBody>
            </Table>
            <div className="flex flex-col gap-3 border-t border-border/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">{validReadings.length ? `Showing ${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, validReadings.length)} of ${validReadings.length}` : "No rows to display"}</p>
              <div className="flex items-center gap-2"><Button type="button" variant="outline" size="sm" disabled={currentPage <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}><ChevronLeft data-icon="inline-start" />Previous</Button><span className="min-w-16 text-center text-xs tabular-nums text-muted-foreground">{currentPage} / {pageCount}</span><Button type="button" variant="outline" size="sm" disabled={currentPage >= pageCount || loading} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>Next<ChevronRight data-icon="inline-end" /></Button></div>
            </div>
          </Card>
        </section>

        <footer className="flex flex-col gap-2 border-t border-border/70 pt-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between"><span className="flex items-center gap-2"><span className={`size-1.5 rounded-full ${base ? "bg-emerald-500" : "bg-amber-500"}`} />{base ? "Connected to telemetry API" : "Waiting for API configuration"}</span><span className="flex items-center gap-2"><ArrowDown className="size-3" aria-hidden="true" />Newest records are listed first</span></footer>
      </div>
    </main>
  )
}

export default TelemetryDashboard
