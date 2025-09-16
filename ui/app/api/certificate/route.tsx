import { ImageResponse } from '@vercel/og'
import { type NextRequest } from 'next/server'

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic'

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
      return new Response(JSON.stringify({ error: "Invalid parameters" }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const rankColors = { 
      1: "#FFD700", // Gold
      2: "#C0C0C0", // Silver  
      3: "#CD7F32"  // Bronze
    }
    
    const rankText = { 
      1: "🥇 FIRST PLACE", 
      2: "🥈 SECOND PLACE", 
      3: "🥉 THIRD PLACE" 
    }
    
    const periodText = period === "yearly" ? `Year ${year}` : `${month} ${year}`
    const currentDate = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long", 
      day: "numeric",
    })

    return new ImageResponse(
      (
        <div
          style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, oklch(0.1 0.01 240), oklch(0.15 0.01 240))',
            fontFamily: 'system-ui',
            position: 'relative',
          }}
        >
          {/* Background pattern */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              opacity: 0.1,
              background: 'radial-gradient(circle at 30% 40%, oklch(0.65 0.2 15) 0%, transparent 50%), radial-gradient(circle at 80% 20%, oklch(0.6 0.2 280) 0%, transparent 50%)',
            }}
          />
          
          {/* Main certificate card */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              width: '90%',
              height: '85%',
              background: 'oklch(0.15 0.01 240)',
              border: `4px solid ${rankColors[rank as keyof typeof rankColors]}`,
              borderRadius: '24px',
              padding: '60px 40px',
              position: 'relative',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            }}
          >
            {/* Inner decorative border */}
            <div
              style={{
                position: 'absolute',
                inset: '20px',
                border: '2px solid oklch(0.25 0.02 240)',
                borderRadius: '16px',
              }}
            />
            
            {/* TCP1P Logo placeholder */}
            <div
              style={{
                width: '80px',
                height: '80px',
                background: 'oklch(0.65 0.2 15)',
                borderRadius: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '30px',
                fontSize: '36px',
                fontWeight: 'bold',
                color: 'white',
              }}
            >
              TCP1P
            </div>

            {/* Certificate title */}
            <h1
              style={{
                fontSize: '56px',
                fontWeight: 'bold',
                color: 'oklch(0.9 0.05 15)',
                marginBottom: '20px',
                textAlign: 'center',
                letterSpacing: '2px',
                fontFamily: 'serif',
              }}
            >
              CERTIFICATE OF ACHIEVEMENT
            </h1>

            {/* Rank badge */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: rankColors[rank as keyof typeof rankColors],
                color: 'black',
                padding: '16px 32px',
                borderRadius: '50px',
                fontSize: '32px',
                fontWeight: 'bold',
                marginBottom: '40px',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
              }}
            >
              {rankText[rank as keyof typeof rankText]}
            </div>

            {/* Recipient */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                marginBottom: '40px',
              }}
            >
              <p
                style={{
                  fontSize: '24px',
                  color: 'oklch(0.7 0.02 240)',
                  marginBottom: '12px',
                  fontWeight: '500',
                }}
              >
                This certificate is proudly awarded to
              </p>
              <h2
                style={{
                  fontSize: '48px',
                  fontWeight: 'bold',
                  color: 'oklch(0.9 0.05 15)',
                  textAlign: 'center',
                  fontFamily: 'serif',
                  textDecoration: 'underline',
                  textDecorationColor: 'oklch(0.65 0.2 15)',
                  textUnderlineOffset: '8px',
                  textDecorationThickness: '3px',
                }}
              >
                {username}
              </h2>
            </div>

            {/* Period and description */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                marginBottom: '40px',
              }}
            >
              <div
                style={{
                  background: 'oklch(0.25 0.02 240)',
                  border: '2px solid oklch(0.65 0.2 15)',
                  padding: '12px 24px',
                  borderRadius: '12px',
                  marginBottom: '20px',
                }}
              >
                <p
                  style={{
                    fontSize: '28px',
                    color: 'oklch(0.65 0.2 15)',
                    fontWeight: 'bold',
                  }}
                >
                  CTF Leaderboard - {periodText}
                </p>
              </div>
              <p
                style={{
                  fontSize: '22px',
                  color: 'oklch(0.7 0.02 240)',
                  textAlign: 'center',
                  maxWidth: '600px',
                  lineHeight: 1.5,
                }}
              >
                For exceptional performance and outstanding skills in cybersecurity challenges
              </p>
            </div>

            {/* Bottom section */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                width: '100%',
                marginTop: 'auto',
                paddingTop: '40px',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <p
                  style={{
                    fontSize: '18px',
                    color: 'oklch(0.7 0.02 240)',
                    marginBottom: '8px',
                  }}
                >
                  Issued on
                </p>
                <p
                  style={{
                    fontSize: '20px',
                    color: 'oklch(0.9 0.05 15)',
                    fontWeight: '600',
                  }}
                >
                  {currentDate}
                </p>
              </div>
              
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    background: 'oklch(0.65 0.2 15)',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '20px',
                    fontWeight: 'bold',
                    color: 'white',
                  }}
                >
                  TCP1P
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <p
                    style={{
                      fontSize: '20px',
                      color: 'oklch(0.9 0.05 15)',
                      fontWeight: 'bold',
                    }}
                  >
                    TCP1P CTF Platform
                  </p>
                  <p
                    style={{
                      fontSize: '16px',
                      color: 'oklch(0.7 0.02 240)',
                    }}
                  >
                    Competitive Cybersecurity
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 800,
      },
    )
  } catch (error) {
    console.error("Certificate generation error:", error)
    return new Response(JSON.stringify({ error: "Failed to generate certificate" }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}