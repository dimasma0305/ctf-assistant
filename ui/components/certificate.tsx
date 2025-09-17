"use client"

import type React from "react"

import Image from "next/image"

interface CertificateProps {
  username: string
  rank: number
  totalParticipants: number
  score: number
  solves: number
  categories: number
  period: string
  issuedDate: string
}

export function Certificate({ username, rank, score, solves, categories, period, issuedDate }: CertificateProps) {
  const rankColors = {
    1: "bg-certificate-gold text-black border-certificate-gold/50",
    2: "bg-certificate-silver text-black border-certificate-silver/50",
    3: "bg-certificate-bronze text-white border-certificate-bronze/50",
    default: "bg-primary text-primary-foreground border-primary/50",
  }

  const statColors = {
    1: "text-certificate-gold",
    2: "text-certificate-silver",
    3: "text-certificate-bronze",
    default: "text-primary",
  }

  const rankBadgeStyles = {
    1: "bg-certificate-gold text-black font-bold border border-certificate-gold/50 shadow-lg",
    2: "bg-certificate-silver text-black font-bold border border-certificate-silver/50 shadow-lg",
    3: "bg-certificate-bronze text-white font-bold border border-certificate-bronze/50 shadow-lg",
    default: "bg-primary text-primary-foreground font-semibold border border-primary/50 shadow-lg",
  }

  const getRankDisplay = () => {
    if (rank === 1) return "1st"
    if (rank === 2) return "2nd"
    if (rank === 3) return "3rd"
    if (rank <= 10) return `#${rank}`
    return `#${rank}`
  }

  const getRankColor = (rank: number) => {
    if (rank === 1) return rankColors[1]
    if (rank === 2) return rankColors[2]
    if (rank === 3) return rankColors[3]
    return rankColors.default
  }

  const getStatColor = (rank: number) => {
    if (rank === 1) return statColors[1]
    if (rank === 2) return statColors[2]
    if (rank === 3) return statColors[3]
    return statColors.default
  }

  const getRankBadgeStyle = (rank: number) => {
    if (rank === 1) return rankBadgeStyles[1]
    if (rank === 2) return rankBadgeStyles[2]
    if (rank === 3) return rankBadgeStyles[3]
    return rankBadgeStyles.default
  }

  const getCertificatePurpose = () => {
    if (rank === 1) {
      return `TCP1P Best Player - ${period} Champion`
    } else if (rank <= 3) {
      return `TCP1P Top Player - ${period} Achievement`
    } else if (rank <= 10) {
      return `TCP1P Top 10 Player - ${period} Recognition`
    } else {
      return `TCP1P ${period} Community Leaderboard Participant`
    }
  }

  const getIssuedDate = () => {
    // Check if period is yearly (just a year like "2024") or monthly (like "January 2024")
    const isYearlyPeriod = /^\d{4}$/.test(period)

    if (isYearlyPeriod) {
      // For yearly competitions, issue certificate in January of next year
      const year = Number.parseInt(period)
      return new Date(year + 1, 0, 1) // January 1st of next year
    } else {
      // For monthly competitions, issue certificate in the next month
      // Parse "January 2024" format
      const monthNames = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
      ]

      const parts = period.split(" ")
      if (parts.length === 2) {
        const monthName = parts[0]
        const year = Number.parseInt(parts[1])
        const monthIndex = monthNames.indexOf(monthName)

        if (monthIndex !== -1) {
          // Get next month
          const nextMonth = monthIndex + 1
          const nextYear = nextMonth > 11 ? year + 1 : year
          const finalMonth = nextMonth > 11 ? 0 : nextMonth

          return new Date(nextYear, finalMonth, 1) // 1st day of next month
        }
      }
    }

    // Fallback to original date if parsing fails
    return new Date(issuedDate)
  }

  return (
    <div className="w-full max-w-4xl mx-auto bg-background font-sans">
      <div className="w-full relative overflow-hidden">
        <div
          className="w-[800px] h-[566px] origin-top-left bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 mx-auto shadow-2xl"
          style={
            {
              transform: "scale(var(--scale-factor, 1))",
              "--scale-factor": "min(calc(100vw - 2rem) / 800px, calc(100vh - 4rem) / 566px, 1)",
            } as React.CSSProperties
          }
        >
          <div className="absolute inset-2 border-2 border-primary/40 rounded-lg shadow-inner" />
          <div className="absolute inset-3 border border-primary/30 rounded-md" />
          <div className="absolute inset-4 border border-primary/20 rounded-sm" />

          <div className="absolute inset-0 opacity-15">
            <div className="w-full h-full bg-[radial-gradient(circle_at_30%_20%,var(--primary)_0%,transparent_50%),radial-gradient(circle_at_70%_80%,var(--chart-2)_0%,transparent_50%),radial-gradient(circle_at_50%_50%,var(--chart-3)_0%,transparent_70%)]" />
          </div>

          <div className="bg-gradient-to-br from-slate-800/95 via-slate-700/90 to-slate-800/95 border-2 border-primary/50 rounded-lg p-6 h-full flex flex-col relative shadow-2xl backdrop-blur-sm">
            {/* Header Section */}
            <div className="flex flex-col items-center mb-4">
              <div className="mb-3 relative">
                <div className="absolute inset-0 bg-primary/30 blur-xl rounded-full scale-150" />
                <div className="absolute inset-0 bg-chart-2/20 blur-2xl rounded-full scale-125" />
                <Image
                  src="/tcp1p-main-logo.png"
                  alt="TCP1P Logo"
                  width={80}
                  height={40}
                  className="object-contain relative z-10 drop-shadow-2xl"
                />
              </div>

              <h1 className="text-2xl bg-gradient-to-r from-primary via-chart-2 to-primary bg-clip-text text-transparent font-bold mb-1 tracking-wide text-center">
                CERTIFICATE
              </h1>
              <div className="w-20 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent mb-1" />
              <p className="text-sm text-slate-300 font-medium tracking-wider uppercase text-center">of Achievement</p>
            </div>

            <div className="flex items-center justify-center mb-4 gap-3">
              <div className={`border-2 rounded-xl px-6 py-3 shadow-xl backdrop-blur-sm ${getRankColor(rank)}`}>
                <span className="text-sm font-bold tracking-wide text-center block">
                  {getRankDisplay()} - {getCertificatePurpose()}
                </span>
              </div>
            </div>

            {/* Award Text */}
            <div className="flex flex-col items-center mb-4">
              <p className="text-sm text-slate-300 mb-3 text-center font-medium">
                This certificate is proudly presented to
              </p>

              <div className="relative mb-3">
                <div className="absolute inset-0 bg-gradient-to-r from-primary/30 via-primary/40 to-primary/30 blur-lg rounded-xl" />
                <div className="absolute inset-0 bg-gradient-to-r from-chart-2/20 via-chart-2/30 to-chart-2/20 blur-sm rounded-xl" />
                <div className="relative bg-gradient-to-r from-slate-700/90 via-slate-600/80 to-slate-700/90 border-2 border-primary/50 rounded-xl px-8 py-4 backdrop-blur-sm shadow-2xl">
                  <span className="text-xl font-bold text-white text-center tracking-wide drop-shadow-lg block">
                    {username}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-row justify-center items-center gap-6 mb-4">
              {/* Total Score */}
              <div className="bg-gradient-to-br from-slate-700/80 via-slate-600/70 to-slate-700/80 border-2 border-primary/40 rounded-xl px-4 py-3 flex flex-col items-center min-w-[90px] shadow-xl backdrop-blur-sm">
                <span className={`text-lg font-bold mb-1 drop-shadow-lg ${getStatColor(rank)}`}>
                  {score.toLocaleString()}
                </span>
                <span className="text-xs text-slate-300 text-center uppercase tracking-wider font-medium">
                  Total Score
                </span>
              </div>

              {/* Challenges Solved */}
              <div className="bg-gradient-to-br from-slate-700/80 via-slate-600/70 to-slate-700/80 border-2 border-primary/40 rounded-xl px-4 py-3 flex flex-col items-center min-w-[90px] shadow-xl backdrop-blur-sm">
                <span className={`text-lg font-bold mb-1 drop-shadow-lg ${getStatColor(rank)}`}>{solves}</span>
                <span className="text-xs text-slate-300 text-center uppercase tracking-wider font-medium">
                  Challenges
                </span>
              </div>

              {/* Categories */}
              <div className="bg-gradient-to-br from-slate-700/80 via-slate-600/70 to-slate-700/80 border-2 border-primary/40 rounded-xl px-4 py-3 flex flex-col items-center min-w-[90px] shadow-xl backdrop-blur-sm">
                <span className={`text-lg font-bold mb-1 drop-shadow-lg ${getStatColor(rank)}`}>{categories}</span>
                <span className="text-xs text-slate-300 text-center uppercase tracking-wider font-medium">
                  Categories
                </span>
              </div>
            </div>

            {/* Achievement Description */}
            <div className="flex items-center justify-center mb-4 flex-1">
              <p className="text-sm text-slate-300 text-center font-medium max-w-[500px] leading-relaxed">
                For demonstrating exceptional skill, dedication, and outstanding achievement in community leaderboard
                competitions, showcasing mastery of advanced problem-solving concepts and competitive excellence.
              </p>
            </div>

            <div className="mt-auto pt-4 border-t-2 border-primary/40 flex flex-row justify-between items-center">
              {/* Issue Date */}
              <div className="flex flex-col items-start">
                <span className="text-xs text-slate-400 mb-1 uppercase tracking-wide font-medium">
                  Certificate Issued
                </span>
                <span className="text-sm text-white font-semibold">{getIssuedDate().toLocaleDateString()}</span>
              </div>

              <div className="flex flex-row items-center">
                <div className="relative mr-3">
                  <div className="absolute inset-0 bg-primary/30 blur-md rounded-lg" />
                  <Image
                    src="/tcp1p-square-logo.jpeg"
                    alt="TCP1P Square Logo"
                    width={28}
                    height={28}
                    className="rounded-lg border-2 border-primary/40 relative z-10 shadow-lg"
                  />
                </div>
                <div className="flex flex-col items-start">
                  <span className="text-sm text-white font-bold tracking-wide">TCP1P Community Platform</span>
                  <span className="text-xs text-slate-300 font-medium">TCP1P Community Leaderboard</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
