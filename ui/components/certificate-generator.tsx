"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Trophy, Medal, Award, Eye, Calendar, Star, X, Share2, ExternalLink, Clock } from "lucide-react"
import type { Certificate } from "@/lib/types"
import { Certificate as CertificateComponent } from "@/components/certificate"
import { useState } from "react"
import Link from "next/link"
import { useCertificates } from "@/hooks/useAPI"

interface CertificateGeneratorProps {
  userId: string
}

export function CertificateGenerator({ userId }: CertificateGeneratorProps) {
  const { data: certificateData, loading, error } = useCertificates(userId)
  const [showingCertificate, setShowingCertificate] = useState<Certificate | null>(null)
  const [showPendingOverlay, setShowPendingOverlay] = useState(true)
  
  const displayName = certificateData?.userInfo?.displayName || certificateData?.userInfo?.username || "User"
  const debugMetadata = certificateData?.metadata as { debug?: unknown } | undefined

  // Debug logging
  console.log('CertificateGenerator Debug:', {
    userId,
    loading,
    error,
    certificateData,
    certificatesCount: certificateData?.certificates?.length || 0,
    debug: debugMetadata?.debug
  })

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Trophy className="w-6 h-6 text-yellow-500" />
      case 2:
        return <Medal className="w-6 h-6 text-gray-400" />
      case 3:
        return <Award className="w-6 h-6 text-amber-600" />
      case 4:
      case 5:
      case 6:
      case 7:
      case 8:
      case 9:
      case 10:
        return <Star className="w-6 h-6 text-blue-500" />
      default:
        return null
    }
  }

  const getRankText = (rank: number) => {
    switch (rank) {
      case 1:
        return "First Place"
      case 2:
        return "Second Place"
      case 3:
        return "Third Place"
      case 4:
      case 5:
      case 6:
      case 7:
      case 8:
      case 9:
      case 10:
        return `Top 10 - #${rank}`
      default:
        return `${rank}th Place`
    }
  }

  const getRankColor = (rank: number) => {
    switch (rank) {
      case 1:
        return "from-yellow-400 to-yellow-600"
      case 2:
        return "from-gray-300 to-gray-500"
      case 3:
        return "from-amber-400 to-amber-600"
      case 4:
      case 5:
      case 6:
      case 7:
      case 8:
      case 9:
      case 10:
        return "from-blue-400 to-blue-600"
      default:
        return "from-purple-400 to-purple-600"
    }
  }

  const formatPeriod = (period: string, type: "monthly" | "yearly") => {
    if (type === "yearly") {
      return period
    }
    // Format YYYY-MM to "Month Year"
    const [year, month] = period.split("-")
    const monthName = new Date(Number.parseInt(year), Number.parseInt(month) - 1).toLocaleString("default", {
      month: "long",
    })
    return `${monthName} ${year}`
  }

  const showCertificate = (certificate: Certificate) => {
    setShowingCertificate(certificate)
    setShowPendingOverlay(true)
  }

  const hideCertificate = () => {
    setShowingCertificate(null)
    setShowPendingOverlay(true)
  }

  const getCertificateShareUrl = (certificate: Certificate) => {
    const periodForUrl = certificate.type === "yearly" ? certificate.period : certificate.periodValue
    return `/certificate/${userId}/${periodForUrl}`
  }

  const handleShareCertificate = async (certificate: Certificate) => {
    if (certificate.isPending || !certificate.issuedAt) {
      return
    }

    const shareUrl = `${window.location.origin}${getCertificateShareUrl(certificate)}`

    try {
      if (navigator.share) {
        await navigator.share({
          title: `${displayName}'s TCP1P Certificate`,
          text: `Check out this TCP1P Community achievement certificate!`,
          url: shareUrl,
        })
      } else {
        await navigator.clipboard.writeText(shareUrl)
        // Could add toast notification here
      }
    } catch (error) {
      console.error("Error sharing:", error)
    }
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-6 w-48 bg-muted animate-pulse rounded-lg" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-32 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 text-center space-y-4">
        <div className="w-12 h-12 mx-auto bg-destructive/20 rounded-full flex items-center justify-center">
          <Award className="w-6 h-6 text-destructive" />
        </div>
        <div>
          <h3 className="text-lg font-semibold mb-2">Error Loading Certificates</h3>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    )
  }

  if (!certificateData || certificateData.certificates.length === 0) {
    return (
      <div className="p-6 text-center space-y-4">
        <div className="w-12 h-12 mx-auto bg-muted rounded-full flex items-center justify-center">
          <Award className="w-6 h-6 text-muted-foreground" />
        </div>
        <div>
          <h3 className="text-lg font-semibold mb-2">No Certificates Available</h3>
          <p className="text-sm text-muted-foreground">
            Certificates are only available for top 10 players in the leaderboard.
          </p>
        </div>
      </div>
    )
  }

  const certificates = certificateData.certificates

  if (showingCertificate) {
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
        <div className="relative max-w-4xl w-full max-h-[95vh] overflow-auto">
          <Button
            onClick={hideCertificate}
            size="sm"
            variant="outline"
            className="absolute top-2 right-2 z-10 bg-background/80 backdrop-blur-sm"
          >
            <X className="w-4 h-4" />
          </Button>
          {showingCertificate.isPending && showPendingOverlay && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-5 flex items-center justify-center">
              <div className="bg-background/90 border border-border rounded-lg p-6 text-center max-w-sm mx-4 relative">
                <Button
                  onClick={() => setShowPendingOverlay(false)}
                  size="sm"
                  variant="ghost"
                  className="absolute top-2 right-2 h-6 w-6 p-0"
                >
                  <X className="w-4 h-4" />
                </Button>
                <Clock className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">Certificate Preview</h3>
                <p className="text-sm text-muted-foreground">
                  This certificate is pending issuance. You can preview it but cannot share it yet.
                </p>
              </div>
            </div>
          )}
          <CertificateComponent
            username={displayName}
            rank={showingCertificate.rank}
            totalParticipants={showingCertificate.totalParticipants}
            score={showingCertificate.score}
            solves={showingCertificate.stats.challenges}
            categories={showingCertificate.stats.categories}
            period={showingCertificate.period}
            issuedDate={showingCertificate.issuedDate}
          />
        </div>
      </div>
    )
  }

  if (certificates.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="w-5 h-5" />
            Certificates
          </CardTitle>
          <CardDescription>
            Certificates are awarded for top 3 placements in monthly and yearly rankings
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Star className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium mb-2">No certificates available</p>
            <p className="text-sm">Achieve a top 3 ranking in monthly or yearly leaderboards to earn certificates!</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="w-5 h-5" />
          Certificates ({certificates.length})
        </CardTitle>
        <CardDescription>Achievement certificates for top 3 placements in monthly and yearly rankings</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {certificates.map((certificate) => (
            <Card
              key={certificate.id}
              className={`relative overflow-hidden ${certificate.isPending ? "opacity-60" : ""}`}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${getRankColor(certificate.rank)} opacity-5`} />
              <CardContent className="p-4 sm:p-6 relative">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-4">
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {getRankIcon(certificate.rank)}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-base sm:text-lg truncate">
                            {getRankText(certificate.rank)} Certificate
                          </h3>
                          {certificate.isPending && (
                            <Badge
                              variant="secondary"
                              className="bg-orange-500/10 text-orange-600 border-orange-500/20"
                            >
                              <Clock className="w-3 h-3 mr-1" />
                              Pending
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {formatPeriod(certificate.period, certificate.type)} Rankings
                        </p>
                      </div>
                    </div>
                  </div>
                  <Badge
                    variant="secondary"
                    className={`bg-gradient-to-r ${getRankColor(certificate.rank)} text-white border-0 w-fit`}
                  >
                    #{certificate.rank} of {certificate.totalParticipants}
                  </Badge>
                </div>

                <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-4">
                  <div className="text-center p-2 sm:p-3 bg-muted/50 rounded-lg">
                    <div className="text-lg sm:text-xl font-bold text-primary">
                      {certificate.score.toLocaleString("en-US", {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      })}
                    </div>
                    <div className="text-xs text-muted-foreground">Total Score</div>
                  </div>
                  <div className="text-center p-2 sm:p-3 bg-muted/50 rounded-lg">
                    <div className="text-lg sm:text-xl font-bold text-primary">{certificate.stats.challenges}</div>
                    <div className="text-xs text-muted-foreground">Challenges</div>
                  </div>
                  <div className="text-center p-2 sm:p-3 bg-muted/50 rounded-lg">
                    <div className="text-lg sm:text-xl font-bold text-primary">{certificate.stats.categories}</div>
                    <div className="text-xs text-muted-foreground">Categories</div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="w-4 h-4" />
                    <span>
                      {certificate.isPending
                        ? "Pending issuance"
                        : `Issued: ${new Date(certificate.issuedDate).toLocaleDateString()}`}
                    </span>
                  </div>
                  <div className="flex gap-2 w-full sm:w-auto">
                    <Button
                      onClick={() => handleShareCertificate(certificate)}
                      size="sm"
                      variant="ghost"
                      disabled={certificate.isPending}
                      className={`gap-2 flex-1 sm:flex-none transition-all duration-200 ${
                        certificate.isPending
                          ? "opacity-50 cursor-not-allowed"
                          : "hover:bg-primary/10 border border-primary/20 hover:border-primary/40"
                      }`}
                    >
                      {certificate.isPending ? <X className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
                      <span className="hidden sm:inline">{certificate.isPending ? "Cannot Share" : "Share"}</span>
                    </Button>
                    {certificate.isPending ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled
                        className="gap-2 flex-1 sm:flex-none opacity-50 cursor-not-allowed bg-transparent"
                      >
                        <X className="w-4 h-4" />
                        <span className="hidden sm:inline">Cannot View</span>
                      </Button>
                    ) : (
                      <Link href={getCertificateShareUrl(certificate)} target="_blank" className="flex-1 sm:flex-none">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-2 w-full hover:bg-muted/50 transition-all duration-200 bg-transparent"
                        >
                          <ExternalLink className="w-4 h-4" />
                          <span className="hidden sm:inline">View</span>
                        </Button>
                      </Link>
                    )}
                    <Button
                      onClick={() => showCertificate(certificate)}
                      size="sm"
                      className="gap-2 flex-1 sm:flex-none bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm hover:shadow-md transition-all duration-200"
                    >
                      <Eye className="w-4 h-4" />
                      <span className="hidden sm:inline">{certificate.isPending ? "Preview" : "Show"}</span>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
