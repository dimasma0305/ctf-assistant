"use server"

import { Document, Page, Text, View, pdf, Image } from "@react-pdf/renderer"
import createTw from "react-pdf-tailwind"
import { getScoreboard } from "./actions"

const tw = createTw({
  theme: {
    extend: {
      colors: {
        // Dark theme colors converted from oklch to hex
        background: "#0a0a0a", // Darker background for better contrast
        foreground: "#ffffff", // Pure white for primary text
        card: "#1a1a1a", // Dark card with better contrast
        "card-foreground": "#ffffff", // White text on cards
        primary: "#ef4444", // Bright coral red
        "primary-foreground": "#ffffff", // White text on primary
        secondary: "#2a2a2a", // Lighter secondary for better visibility
        "secondary-foreground": "#ffffff", // White text on secondary
        muted: "#404040", // Medium gray for muted backgrounds
        "muted-foreground": "#d1d5db", // Light gray for readable secondary text
        accent: "#404040", // Dark accent
        "accent-foreground": "#ffffff", // White text on accent
        border: "#525252", // Lighter border for visibility
        // Certificate specific colors for dark theme
        "certificate-gold": "#fbbf24", // Bright gold
        "certificate-silver": "#e5e7eb", // Bright silver
        "certificate-bronze": "#f59e0b", // Bright bronze
        "certificate-gradient-start": "#1e293b", // Dark gradient start
        "certificate-gradient-end": "#0f172a", // Dark gradient end
      },
      fontFamily: {
        sans: ["Helvetica"],
        serif: ["Times-Roman"],
      },
    },
  },
})

export async function generateCertificate(
  userId: string,
  period: "monthly" | "yearly",
  month?: string,
  year?: string,
): Promise<{ success: true; pdfBase64: string; filename: string } | { success: false; error: string }> {
  try {
    console.log("[v0] Certificate Server Action called with params:", { userId, period, month, year })

    if (!userId || !period || (period !== "monthly" && period !== "yearly")) {
      console.error("[v0] Invalid parameters:", { userId, period })
      return { success: false, error: "Invalid parameters. Required: userId, period (monthly or yearly)" }
    }

    // Validate required parameters for each period type
    if (period === "monthly" && (!month || !year)) {
      console.error("[v0] Missing month/year for monthly certificate:", { month, year })
      return { success: false, error: "Month and year are required for monthly certificates" }
    }

    if (period === "yearly" && !year) {
      console.error("[v0] Missing year for yearly certificate:", { year })
      return { success: false, error: "Year is required for yearly certificates" }
    }

    // Build parameters for scoreboard query
    const scoreboardParams: any = { limit: 10, global: true }

    // Add time filtering based on period
    if (period === "monthly" && month && year) {
      const monthPadded = month.padStart(2, "0")
      scoreboardParams.month = `${year}-${monthPadded}`
    } else if (period === "yearly" && year) {
      scoreboardParams.year = year
    }

    console.log("[v0] Certificate: Fetching scoreboard with params:", scoreboardParams)

    // Fetch leaderboard data to get user's rank
    const leaderboardData = await getScoreboard(scoreboardParams)
    console.log("Certificate: Leaderboard data received, total entries:", leaderboardData.data?.length)

    const userEntry = leaderboardData.data.find((entry: any) => entry.user.userId === userId)
    console.log("Certificate: User entry found:", userEntry ? `rank ${userEntry.rank}` : "not found")

    if (!userEntry) {
      return { success: false, error: "User not found in leaderboard" }
    }

    const rank = userEntry.rank
    const username = userEntry.user.displayName || userEntry.user.username
    const totalScore = userEntry.totalScore || 0
    const solveCount = userEntry.solveCount || 0
    const ctfCount = userEntry.ctfCount || 0

    // Only generate certificates for top 3 positions
    if (rank > 3 || rank < 1) {
      return { success: false, error: "Certificates are only available for top 3 positions" }
    }

    const rankText = {
      1: "CHAMPION",
      2: "RUNNER-UP",
      3: "THIRD PLACE",
    }

    // Format the period text for display
    let periodText: string
    if (period === "yearly") {
      periodText = `Year ${year}`
    } else {
      const monthName = month
        ? new Date(2024, Number.parseInt(month) - 1).toLocaleString("default", { month: "long" })
        : "Current Month"
      periodText = `${monthName} ${year}`
    }
    const currentDate = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })

    const CertificateDocument = (
      <Document>
        <Page size="A4" orientation="landscape" style={tw("bg-background font-sans")}>
          {/* Main Certificate Container */}
          <View style={tw("w-full h-full p-8 relative")}>
            <View style={tw("absolute inset-0 bg-certificate-gradient-start")} />
            <View style={tw("absolute inset-4 border-2 border-primary/30 rounded-lg")} />

            {/* Certificate Card */}
            <View
              style={tw("bg-card border-2 border-primary/40 rounded-2xl p-12 h-full flex flex-col relative shadow-2xl")}
            >
              {/* Header Section */}
              <View style={tw("flex flex-col items-center mb-8")}>
                {/* TCP1P Logo */}
                <View style={tw("mb-6")}>
                  <Image src="public/tcp1p-main-logo.png" style={tw("w-40 h-20 object-contain")} />
                </View>

                {/* Certificate Title */}
                <Text style={tw("text-5xl text-foreground font-serif mb-2 tracking-widest")}>CERTIFICATE</Text>
                <Text style={tw("text-lg text-muted-foreground font-serif tracking-wide uppercase")}>
                  of Achievement
                </Text>
              </View>

              {/* Achievement Badge */}
              <View style={tw("flex items-center justify-center mb-8")}>
                <View
                  style={tw(
                    `bg-certificate-${rank === 1 ? "gold" : rank === 2 ? "silver" : "bronze"} rounded-full px-10 py-4 shadow-xl border-2 border-primary/20`,
                  )}
                >
                  <Text style={tw("text-2xl font-bold text-center tracking-wide text-black")}>
                    {rankText[rank as keyof typeof rankText]}
                  </Text>
                </View>
              </View>

              {/* Award Text */}
              <View style={tw("flex flex-col items-center mb-8")}>
                <Text style={tw("text-base text-muted-foreground mb-4 text-center font-serif")}>
                  This certificate is proudly presented to
                </Text>

                {/* Username */}
                <View style={tw("bg-primary/10 border-2 border-primary/40 rounded-xl px-8 py-4 mb-6")}>
                  <Text style={tw("text-4xl font-bold text-primary text-center font-serif tracking-wide")}>
                    {username}
                  </Text>
                </View>
              </View>

              {/* Statistics Grid */}
              <View style={tw("flex flex-row justify-center items-center gap-8 mb-8")}>
                {/* Total Score */}
                <View
                  style={tw(
                    "bg-secondary border-2 border-border rounded-xl px-6 py-4 flex flex-col items-center min-w-32",
                  )}
                >
                  <Text
                    style={tw(
                      `text-2xl font-bold text-certificate-${rank === 1 ? "gold" : rank === 2 ? "silver" : "bronze"} mb-1`,
                    )}
                  >
                    {totalScore.toLocaleString()}
                  </Text>
                  <Text style={tw("text-xs text-muted-foreground text-center uppercase tracking-wide")}>
                    Total Score
                  </Text>
                </View>

                {/* Challenges Solved */}
                <View
                  style={tw(
                    "bg-secondary border-2 border-border rounded-xl px-6 py-4 flex flex-col items-center min-w-32",
                  )}
                >
                  <Text
                    style={tw(
                      `text-2xl font-bold text-certificate-${rank === 1 ? "gold" : rank === 2 ? "silver" : "bronze"} mb-1`,
                    )}
                  >
                    {solveCount}
                  </Text>
                  <Text style={tw("text-xs text-muted-foreground text-center uppercase tracking-wide")}>
                    Challenges
                  </Text>
                </View>

                {/* CTFs Participated */}
                <View
                  style={tw(
                    "bg-secondary border-2 border-border rounded-xl px-6 py-4 flex flex-col items-center min-w-32",
                  )}
                >
                  <Text
                    style={tw(
                      `text-2xl font-bold text-certificate-${rank === 1 ? "gold" : rank === 2 ? "silver" : "bronze"} mb-1`,
                    )}
                  >
                    {ctfCount}
                  </Text>
                  <Text style={tw("text-xs text-muted-foreground text-center uppercase tracking-wide")}>CTFs</Text>
                </View>
              </View>

              {/* Period Badge */}
              <View style={tw("flex items-center justify-center mb-8")}>
                <View style={tw("bg-primary/20 border-2 border-primary/50 px-6 py-2 rounded-lg")}>
                  <Text style={tw("text-base text-primary font-semibold text-center")}>
                    CTF Leaderboard • {periodText}
                  </Text>
                </View>
              </View>

              {/* Description */}
              <View style={tw("flex items-center justify-center mb-8")}>
                <Text
                  style={tw("text-sm text-muted-foreground text-center font-serif italic max-w-2xl leading-relaxed")}
                >
                  For demonstrating exceptional skill, dedication, and outstanding achievement in competitive
                  cybersecurity challenges, showcasing mastery of advanced security concepts and problem-solving
                  excellence.
                </Text>
              </View>

              {/* Footer */}
              <View style={tw("mt-auto pt-6 border-t-2 border-border flex flex-row justify-between items-center")}>
                {/* Issue Date */}
                <View style={tw("flex flex-col")}>
                  <Text style={tw("text-xs text-muted-foreground mb-1")}>Certificate Issued</Text>
                  <Text style={tw("text-sm text-foreground font-semibold")}>{currentDate}</Text>
                </View>

                {/* TCP1P Branding */}
                <View style={tw("flex flex-row items-center")}>
                  <Image
                    src="public/tcp1p-square-logo.jpeg"
                    style={tw("w-10 h-10 rounded-lg mr-3 border-2 border-border")}
                  />
                  <View style={tw("flex flex-col")}>
                    <Text style={tw("text-sm text-foreground font-semibold")}>TCP1P Community Platform</Text>
                    <Text style={tw("text-xs text-muted-foreground")}>Elite Cybersecurity Competition</Text>
                  </View>
                </View>
              </View>
            </View>
          </View>
        </Page>
      </Document>
    )

    // Generate PDF blob
    const pdfStream = pdf(CertificateDocument)
    const pdfBlob = await pdfStream.toBlob()
    const pdfBase64 = await pdfBlob.arrayBuffer()
    const pdfBase64String = Buffer.from(pdfBase64).toString("base64")

    const filename = `certificate-${username}-${period}-${year}${month ? `-${month}` : ""}-rank${rank}.pdf`

    return { success: true, pdfBase64: pdfBase64String, filename }
  } catch (error) {
    console.error("Certificate generation error:", error)
    return { success: false, error: error instanceof Error ? error.message : "Unknown error occurred" }
  }
}

export async function validateCertificateEligibility(
  userId: string,
  period: "monthly" | "yearly",
  month?: string,
  year?: string,
): Promise<{ eligible: boolean; rank?: number; error?: string }> {
  return { eligible: false, error: "Not implemented" }
}
