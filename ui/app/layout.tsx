import type React from "react"
import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import { Outfit } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { Suspense } from "react"
import { WindowProvider } from "@/components/ui/window"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import "./globals.css"

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  weight: ["300", "400", "500", "600", "700", "800", "900"],
})

export const metadata: Metadata = {
  title: "TCP1P Community Scoring Dashboard",
  description:
    "Competitive cybersecurity scoring platform — track CTF leaderboards, rankings, and team performance across competitions.",
  keywords: ["CTF", "cybersecurity", "leaderboard", "TCP1P", "capture the flag", "scoring"],
  authors: [{ name: "TCP1P", url: "https://tcp1p.team" }],
  openGraph: {
    title: "TCP1P Community Scoring Dashboard",
    description: "Track CTF leaderboards, rankings, and team performance.",
    type: "website",
    siteName: "TCP1P Scoring",
  },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/tcp1p-logo.png",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`font-sans ${GeistSans.variable} ${GeistMono.variable} ${outfit.variable}`}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <WindowProvider>
            <Suspense fallback={null}>{children}</Suspense>
          </WindowProvider>
          <Toaster position="top-right" />
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}

