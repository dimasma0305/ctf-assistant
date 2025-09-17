"use client"

import { useParams } from "next/navigation"
import { Certificate } from "@/components/certificate"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Share2 } from "lucide-react"
import Link from "next/link"
import { useUserProfile } from "@/hooks/useAPI"
import { useState } from "react"

export default function PublicCertificatePage() {
  const params = useParams()
  const userId = params.userId as string
  const period = params.period as string
  const [shareSuccess, setShareSuccess] = useState(false)

  const { data: profileData, loading, error } = useUserProfile(userId)

  const formatPeriod = (period: string) => {
    // Handle both "2024" and "2024-01" formats
    if (period.includes("-")) {
      const [year, month] = period.split("-")
      const monthName = new Date(Number.parseInt(year), Number.parseInt(month) - 1).toLocaleString("default", {
        month: "long",
      })
      return `${monthName} ${year}`
    }
    return period
  }

  const handleShare = async () => {
    const shareUrl = window.location.href
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${profileData?.user.displayName || profileData?.user.username}'s TCP1P Certificate`,
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

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading certificate...</p>
        </div>
      </div>
    )
  }

  if (error || !profileData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Certificate Not Found</h1>
          <p className="text-muted-foreground mb-4">The requested certificate could not be found.</p>
          <Link href="/">
            <Button>Return to Dashboard</Button>
          </Link>
        </div>
      </div>
    )
  }

  // Check if user is eligible for certificate (top 3)
  if (profileData.globalRank > 3) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Certificate Not Available</h1>
          <p className="text-muted-foreground mb-4">Certificates are only available for top 3 ranked players.</p>
          <Link href="/">
            <Button>Return to Dashboard</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header with navigation and share */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <Link href="/">
            <Button variant="ghost" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </Button>
          </Link>

          <div className="flex gap-2">
            <Button onClick={handleShare} variant="outline" className="gap-2 bg-transparent">
              <Share2 className="w-4 h-4" />
              {shareSuccess ? "Copied!" : "Share Certificate"}
            </Button>
          </div>
        </div>

        {/* Certificate Display */}
        <div className="flex justify-center">
          <Certificate
            username={profileData.user.displayName || profileData.user.username}
            rank={profileData.globalRank}
            totalParticipants={profileData.totalUsers}
            score={profileData.stats.totalScore}
            solves={profileData.stats.solveCount}
            categories={profileData.categoryBreakdown.length}
            period={formatPeriod(period)}
            issuedDate={new Date().toISOString()}
          />
        </div>

        {/* Certificate Info */}
        <div className="mt-8 text-center">
          <p className="text-muted-foreground">
            This certificate recognizes {profileData.user.displayName || profileData.user.username}'s achievement as #
            {profileData.globalRank} in the TCP1P CTF {formatPeriod(period)} leaderboard.
          </p>
        </div>
      </div>
    </div>
  )
}
