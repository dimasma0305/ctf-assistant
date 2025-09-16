import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get("userId")
    const username = searchParams.get("username")
    const rank = Number.parseInt(searchParams.get("rank") || "0")
    const period = searchParams.get("period") // 'monthly' or 'yearly'
    const month = searchParams.get("month")
    const year = searchParams.get("year")

    if (!userId || !username || !rank || rank > 3 || rank < 1) {
      return NextResponse.json({ error: "Invalid parameters" }, { status: 400 })
    }

    const rankColors = { 1: "#FFD700", 2: "#C0C0C0", 3: "#CD7F32" }
    const rankText = { 1: "1ST PLACE", 2: "2ND PLACE", 3: "3RD PLACE" }
    const periodText = period === "yearly" ? `Year ${year}` : `${month} ${year}`
    const currentDate = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })

    const svg = `
      <svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <style>
            .title { font: bold 48px Arial, sans-serif; text-anchor: middle; fill: white; }
            .rank { font: bold 36px Arial, sans-serif; text-anchor: middle; fill: ${rankColors[rank as keyof typeof rankColors]}; }
            .username { font: 28px Arial, sans-serif; text-anchor: middle; fill: white; }
            .period { font: 24px Arial, sans-serif; text-anchor: middle; fill: white; }
            .description { font: 20px Arial, sans-serif; text-anchor: middle; fill: #cccccc; }
            .date { font: 20px Arial, sans-serif; text-anchor: middle; fill: #cccccc; }
            .platform { font: 18px Arial, sans-serif; text-anchor: middle; fill: #666666; }
          </style>
        </defs>
        
        <!-- Background -->
        <rect width="800" height="600" fill="#1a1a1a"/>
        
        <!-- Outer border -->
        <rect x="20" y="20" width="760" height="560" fill="none" stroke="${rankColors[rank as keyof typeof rankColors]}" stroke-width="8"/>
        
        <!-- Inner border -->
        <rect x="40" y="40" width="720" height="520" fill="none" stroke="#333333" stroke-width="2"/>
        
        <!-- Certificate content -->
        <text x="400" y="120" class="title">CERTIFICATE OF ACHIEVEMENT</text>
        <text x="400" y="200" class="rank">${rankText[rank as keyof typeof rankText]}</text>
        <text x="400" y="280" class="username">Awarded to: ${username}</text>
        <text x="400" y="330" class="period">CTF Leaderboard - ${periodText}</text>
        <text x="400" y="380" class="description">For outstanding performance in Capture The Flag competitions</text>
        <text x="400" y="450" class="date">Issued on ${currentDate}</text>
        <text x="400" y="520" class="platform">TCP1P CTF Platform</text>
      </svg>
    `

    return new NextResponse(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Content-Disposition": `attachment; filename="certificate-${username}-${period}-${rank}.svg"`,
      },
    })
  } catch (error) {
    console.error("Certificate generation error:", error)
    return NextResponse.json({ error: "Failed to generate certificate" }, { status: 500 })
  }
}
