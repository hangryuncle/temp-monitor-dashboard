import { TelemetryDashboard } from "@/components/telemetry/telemetry-dashboard"

type DevicePageProps = {
  params: Promise<{ device_id: string }>
}

export default async function DevicePage({ params }: DevicePageProps) {
  const { device_id: deviceId } = await params
  return <TelemetryDashboard initialDeviceId={deviceId} />
}
