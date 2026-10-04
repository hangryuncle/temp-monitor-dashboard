import type { Metadata, Viewport } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Temperature Monitor | Device Telemetry",
  description: "Monitor API-backed temperature, humidity, RSSI, SNR, and packet delivery across connected devices.",
}

export const viewport: Viewport = {
  themeColor: "#111b20",
  colorScheme: "dark light",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
