"use client"

import { useParams, useRouter } from "next/navigation"
import { Certificate } from "@/components/certificate"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Share2, Clock } from "lucide-react"
import { useCertificate } from "@/hooks/useAPI"
import { useState, useEffect } from "react"

export default function PublicCertificatePage() {
  const params = useParams()
  const router = useRouter()
  const userId = params.userId as string
  const period = params.period as string
  const [shareSuccess, setShareSuccess] = useState(false)
  const [canGoBack, setCanGoBack] = useState(false)

  const { data: certificateData, loading, error } = useCertificate(userId, period)

  useEffect(() => {
    // Check if there's a previous page in history
    setCanGoBack(window.history.length > 1)
  }, [])

  const handleNavigation = () => {
    if (canGoBack) {
      router.back()
    } else {
      router.push("/")
    }
  }

  const isCertificatePending = () => {
    // Check certificate status from API data
    return certificateData?.certificate?.isPending || false
  }

  const handleShare = async () => {
    const shareUrl = window.location.href
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${certificateData?.userInfo?.displayName || certificateData?.userInfo?.username}'s TCP1P Certificate`,
          text: `Check out this TCP1P Community achievement certificate!`,
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
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading certificate...</p>
        </div>
      </div>
    )
  }

  if (error || !certificateData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-xl sm:text-2xl font-bold mb-2">Certificate Not Found</h1>
          <p className="text-muted-foreground mb-4">The requested certificate could not be found.</p>
          <Button onClick={handleNavigation}>{canGoBack ? "Return to Previous Page" : "Return to Dashboard"}</Button>
        </div>
      </div>
    )
  }


  if (certificateData && isCertificatePending()) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center max-w-md mx-auto">
          <Clock className="w-16 h-16 mx-auto mb-6 text-muted-foreground" />
          <h1 className="text-xl sm:text-2xl font-bold mb-4">Certificate Pending</h1>
          <p className="text-muted-foreground mb-6">
            This certificate is still being processed and is not yet available for public viewing. Please check back
            later once it has been officially issued.
          </p>
          <Button onClick={handleNavigation}>{canGoBack ? "Return to Previous Page" : "Return to Dashboard"}</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-4 sm:py-8">
        {/* Header with navigation and share */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 sm:mb-8">
          <Button
            onClick={handleNavigation}
            variant="ghost"
            className="gap-2 hover:bg-muted/50 border border-border/50 hover:border-border transition-all duration-200"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden xs:inline">{canGoBack ? "Back to Previous Page" : "Back to Dashboard"}</span>
            <span className="xs:hidden">Back</span>
          </Button>

          <div className="flex gap-2 w-full sm:w-auto">
            <Button
              onClick={handleShare}
              variant="outline"
              className={`gap-2 flex-1 sm:flex-none transition-all duration-200 ${
                shareSuccess
                  ? "bg-green-500/10 border-green-500/30 text-green-600 hover:bg-green-500/20"
                  : "hover:bg-primary/10 border-primary/20 hover:border-primary/40"
              }`}
            >
              <Share2 className="w-4 h-4" />
              <span className="hidden xs:inline">{shareSuccess ? "Copied!" : "Share Certificate"}</span>
              <span className="xs:hidden">{shareSuccess ? "Copied!" : "Share"}</span>
            </Button>
          </div>
        </div>

        {/* Certificate Display */}
        <div className="flex justify-center mb-6 sm:mb-8">
          <Certificate
            username={certificateData.userInfo.displayName || certificateData.userInfo.username}
            rank={certificateData.certificate.rank}
            totalParticipants={certificateData.certificate.totalParticipants}
            score={certificateData.certificate.score}
            solves={certificateData.certificate.stats.challenges}
            categories={certificateData.certificate.stats.categories}
            period={certificateData.certificate.period}
            issuedDate={certificateData.certificate.issuedDate}
          />
        </div>

        {/* Certificate Info */}
        <div className="text-center px-4">
          <p className="text-sm sm:text-base text-muted-foreground">
            This certificate recognizes {certificateData.userInfo.displayName || certificateData.userInfo.username}
            &apos;s achievement as #
            {certificateData.certificate.rank} in the TCP1P Community {certificateData.certificate.period} leaderboard.
          </p>
        </div>
      </div>
    </div>
  )
}
