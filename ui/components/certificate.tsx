"use client"

import Image from "next/image"
import { useState } from "react"

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

export function Certificate({
  username,
  rank,
  totalParticipants,
  score,
  solves,
  categories,
  period,
  issuedDate,
}: CertificateProps) {
  const [shareSuccess, setShareSuccess] = useState(false)

  const handleShare = async () => {
    // Generate shareable URL based on current user and period
    const shareUrl = `${window.location.origin}/certificate/${username}/${period.replace(/\s+/g, "-").toLowerCase()}`

    try {
      if (navigator.share) {
        await navigator.share({
          title: `${username}'s TCP1P Certificate`,
          text: `Check out this TCP1P CTF achievement certificate!`,
          url: shareUrl,
        })
      } else {
        await navigator.clipboard.writeText(shareUrl)
        setShareSuccess(true)
        setTimeout(() => setShareSuccess(false), 2000)
      }
    } catch (error) {
      console.error("Error sharing:", error)
    }
  }

  const rankColors = {
    1: "bg-[color:var(--certificate-gold)] text-black shadow-lg shadow-[color:var(--certificate-gold)]/30",
    2: "bg-[color:var(--certificate-silver)] text-black shadow-lg shadow-[color:var(--certificate-silver)]/30",
    3: "bg-[color:var(--certificate-bronze)] text-white shadow-lg shadow-[color:var(--certificate-bronze)]/30",
  }

  const statColors = {
    1: "text-[color:var(--certificate-gold)]",
    2: "text-[color:var(--certificate-silver)]",
    3: "text-[color:var(--certificate-bronze)]",
  }

  const getCertificatePurpose = () => {
    if (rank === 1) {
      return `TCP1P Best Player - ${period} Champion`
    } else if (rank <= 3) {
      return `TCP1P Top #${rank} Player - ${period} Achievement`
    } else if (rank <= 10) {
      return `TCP1P Top 10 Player - ${period} Recognition`
    } else {
      return `TCP1P ${period} CTF Participant`
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
    <div className="w-full max-w-6xl mx-auto bg-background font-sans">
      <div className="relative w-full aspect-[1.414/1] bg-slate-900 p-8">
        {/* Decorative border frame */}
        <div className="absolute inset-3 border-4 border-primary/30 rounded-2xl" />
        <div className="absolute inset-4 border-2 border-primary/20 rounded-xl" />

        {/* Subtle background pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="w-full h-full bg-[radial-gradient(circle_at_30%_20%,var(--primary)_0%,transparent_50%),radial-gradient(circle_at_70%_80%,var(--primary)_0%,transparent_50%)]" />
        </div>

        <div className="bg-slate-800/90 border-2 border-primary/40 rounded-2xl p-8 h-full flex flex-col relative shadow-2xl backdrop-blur-sm">
          {/* Header Section */}
          <div className="flex flex-col items-center mb-3">
            {/* TCP1P Logo with coral glow */}
            <div className="mb-2 relative">
              <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
              <Image
                src="/tcp1p-main-logo.png"
                alt="TCP1P Logo"
                width={100}
                height={50}
                className="object-contain relative z-10"
              />
            </div>

            {/* Main Title */}
            <h1 className="text-2xl text-primary font-bold mb-1 tracking-wide">CERTIFICATE</h1>
            <div className="w-16 h-1 bg-gradient-to-r from-transparent via-primary to-transparent mb-1" />
            <p className="text-sm text-slate-300 font-medium tracking-wider uppercase">of Achievement</p>
          </div>

          <div className="flex items-center justify-center mb-3">
            <div className="bg-gradient-to-r from-primary/20 via-primary/30 to-primary/20 border-2 border-primary/50 rounded-xl px-4 py-2 shadow-xl">
              <span className="text-sm font-semibold tracking-wide text-white">{getCertificatePurpose()}</span>
            </div>
          </div>

          {/* Award Text */}
          <div className="flex flex-col items-center mb-3">
            <p className="text-xs text-slate-300 mb-2 text-center font-medium">
              This certificate is proudly presented to
            </p>

            <div className="relative mb-2">
              <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-primary/30 to-primary/20 blur-sm rounded-xl" />
              <div className="relative bg-slate-700/80 border-2 border-primary/40 rounded-xl px-5 py-2 backdrop-blur-sm">
                <span className="text-xl font-bold text-white text-center tracking-wide drop-shadow-lg">
                  {username}
                </span>
              </div>
            </div>
          </div>

          {/* Statistics Section */}
          <div className="flex flex-row justify-center items-center gap-3 mb-3">
            {/* Total Score */}
            <div className="bg-slate-700/60 border-2 border-primary/30 rounded-xl px-3 py-2 flex flex-col items-center min-w-20 shadow-lg hover:shadow-xl hover:border-primary/50 transition-all duration-300 backdrop-blur-sm">
              <span className={`text-lg font-bold ${statColors[rank as keyof typeof statColors]} mb-1`}>
                {score.toLocaleString()}
              </span>
              <span className="text-xs text-slate-300 text-center uppercase tracking-wider font-medium">
                Total Score
              </span>
            </div>

            {/* Challenges Solved */}
            <div className="bg-slate-700/60 border-2 border-primary/30 rounded-xl px-3 py-2 flex flex-col items-center min-w-20 shadow-lg hover:shadow-xl hover:border-primary/50 transition-all duration-300 backdrop-blur-sm">
              <span className={`text-lg font-bold ${statColors[rank as keyof typeof statColors]} mb-1`}>{solves}</span>
              <span className="text-xs text-slate-300 text-center uppercase tracking-wider font-medium">
                Challenges
              </span>
            </div>

            {/* Categories */}
            <div className="bg-slate-700/60 border-2 border-primary/30 rounded-xl px-3 py-2 flex flex-col items-center min-w-20 shadow-lg hover:shadow-xl hover:border-primary/50 transition-all duration-300 backdrop-blur-sm">
              <span className={`text-lg font-bold ${statColors[rank as keyof typeof statColors]} mb-1`}>
                {categories}
              </span>
              <span className="text-xs text-slate-300 text-center uppercase tracking-wider font-medium">
                Categories
              </span>
            </div>
          </div>

          {/* Achievement Description */}
          <div className="flex items-center justify-center mb-2">
            <p className="text-xs text-slate-300 text-center font-medium max-w-2xl leading-relaxed">
              For demonstrating exceptional skill, dedication, and outstanding achievement in competitive cybersecurity
              challenges, showcasing mastery of advanced security concepts and problem-solving excellence.
            </p>
          </div>

          {/* Footer */}
          <div className="mt-auto pt-2 border-t-2 border-primary/30 flex flex-row justify-between items-center">
            {/* Issue Date */}
            <div className="flex flex-col">
              <span className="text-xs text-slate-400 mb-1 uppercase tracking-wide font-medium">
                Certificate Issued
              </span>
              <span className="text-xs text-white font-semibold">{getIssuedDate().toLocaleDateString()}</span>
            </div>

            {/* TCP1P Branding */}
            <div className="flex flex-row items-center">
              <div className="relative mr-2">
                <div className="absolute inset-0 bg-primary/20 blur-sm rounded-lg" />
                <Image
                  src="/tcp1p-square-logo.jpeg"
                  alt="TCP1P Square Logo"
                  width={30}
                  height={30}
                  className="rounded-lg border-2 border-primary/30 relative z-10"
                />
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-white font-semibold tracking-wide">TCP1P CTF Platform</span>
                <span className="text-xs text-slate-300 font-medium">TCP1P Community Leaderboard</span>
              </div>
            </div>
          </div>

          {/* Share Button */}
          <div className="flex justify-center mt-4">
            <button
              onClick={handleShare}
              className="bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/80 transition duration-300"
            >
              {shareSuccess ? "Link Copied!" : "Share Certificate"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
