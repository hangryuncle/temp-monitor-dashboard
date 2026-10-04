export type Measurement = {
  id: number
  packet_id?: number | string | null
  device_id: string
  timestamp: string
  temperature?: number | null
  humidity?: number | null
  pressure?: number | null
  voltage?: number | null
  current?: number | null
  [key: string]: unknown
}

export type Pdr = {
  device_id: string
  received: number
  expected: number
  lost: number
  pdr_percent: number
}

export type ApiState<T> = {
  data: T | null
  error: string | null
  loading: boolean
}

export const PAGE_SIZE = 15

export function apiBaseUrl() {
  return process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/+$/, "") ?? ""
}

export async function fetchMeasurements(deviceId: string, signal?: AbortSignal) {
  const base = apiBaseUrl()
  if (!base) throw new Error("Set NEXT_PUBLIC_API_URL to connect your FastAPI service.")
  const response = await fetch(`${base}/measurements`, { signal, cache: "no-store" })
  if (!response.ok) throw new Error(`Measurements request failed (${response.status}).`)
  const payload: unknown = await response.json()
  if (!Array.isArray(payload)) throw new Error("The measurements endpoint returned an unexpected response.")
  return (payload as Measurement[])
    .filter((measurement) => String(measurement.device_id) === deviceId)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
}

export async function fetchPdr(deviceId: string, signal?: AbortSignal): Promise<Pdr> {
  const base = apiBaseUrl()
  if (!base) throw new Error("Set NEXT_PUBLIC_API_URL to connect your FastAPI service.")
  const response = await fetch(`${base}/measurements/pdr/${encodeURIComponent(deviceId)}`, { signal, cache: "no-store" })
  if (!response.ok) throw new Error(`PDR request failed (${response.status}).`)
  const payload: unknown = await response.json()
  if (!payload || typeof payload !== "object") throw new Error("The PDR endpoint returned an unexpected response.")
  return payload as Pdr
}

export function formatTimestamp(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date)
}

export function formatMetric(value: unknown, suffix = "") {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—"
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}${suffix}`
}

export function getMeasurementMetrics(measurements: Measurement[]) {
  const seen = new Set<string>()
  return measurements.flatMap((measurement) => ["temperature", "humidity", "rssi", "snr"]
    .filter((key) => typeof measurement[key] === "number" && Number.isFinite(measurement[key]))
    .map((key) => [key, measurement[key]] as const)
    .filter(([key]) => !seen.has(key) && !!seen.add(key))
    .map(([key]) => key))
}

export function metricLabel(key: string) {
  return key.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase())
}

export function metricUnit(key: string) {
  const units: Record<string, string> = { temperature: "°C", humidity: "%", pressure: "hPa", voltage: "V", current: "A", rssi: "dBm", snr: "dB" }
  return units[key.toLowerCase()] ?? ""
}

export function rangeStart(range: "1h" | "6h" | "12h" | "24h" | "7d" | "all", now = Date.now()) {
  if (range === "all") return Number.NEGATIVE_INFINITY
  return now - ({ "1h": 60 * 60_000, "6h": 6 * 60 * 60_000, "12h": 12 * 60 * 60_000, "24h": 24 * 60 * 60_000, "7d": 7 * 24 * 60 * 60_000 }[range])
}

export function pdrPercentage(pdr: Pdr | null) {
  if (!pdr) return null
  if (typeof pdr.pdr_percent !== "number" || !Number.isFinite(pdr.pdr_percent)) return null
  return pdr.pdr_percent
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "An unexpected error occurred."
}
