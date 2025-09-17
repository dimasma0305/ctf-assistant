"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Trophy, Medal, Award, Eye, Calendar, Star, X, Share2, ExternalLink } from "lucide-react"
import type { UserInfo } from "@/lib/types"
import { Certificate } from "@/components/certificate"
import { useState } from "react"
import Link from "next/link"

interface CertificateData {
  id: string
  type: "monthly" | "yearly"
  period: string
  rank: number
  totalParticipants: number
  score: number
  solves: number
  categories: string[]
  issuedDate: string
}

interface CertificateGeneratorProps {
  user: UserInfo
  certificates: CertificateData[]
}

export function CertificateGenerator({ user, certificates }: CertificateGeneratorProps) {
  const [showingCertificate, setShowingCertificate] = useState<CertificateData | null>(null)

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Trophy className="w-6 h-6 text-yellow-500" />
      case 2:
        return <Medal className="w-6 h-6 text-gray-400" />
      case 3:
        return <Award className="w-6 h-6 text-amber-600" />
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
      default:
        return "from-blue-400 to-blue-600"
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

  const showCertificate = (certificate: CertificateData) => {
    setShowingCertificate(certificate)
  }

  const hideCertificate = () => {
    setShowingCertificate(null)
  }

  const getCertificateShareUrl = (certificate: CertificateData) => {
    const periodForUrl = certificate.type === "yearly" ? certificate.period : certificate.period.replace("-", "-")
    return `/certificate/${user.userId}/${periodForUrl}`
  }

  const handleShareCertificate = async (certificate: CertificateData) => {
    const shareUrl = `${window.location.origin}${getCertificateShareUrl(certificate)}`

    try {
      if (navigator.share) {
        await navigator.share({
          title: `${user.username}'s TCP1P Certificate`,
          text: `Check out this TCP1P CTF achievement certificate!`,
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

  // Filter certificates to only show top 3 placements
  const eligibleCertificates = certificates.filter((cert) => cert.rank <= 3)

  if (showingCertificate) {
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
        <div className="relative max-w-4xl w-full max-h-[90vh] overflow-auto">
          <Button
            onClick={hideCertificate}
            size="sm"
            variant="outline"
            className="absolute top-4 right-4 z-10 bg-background/80 backdrop-blur-sm"
          >
            <X className="w-4 h-4" />
          </Button>
          <Certificate
            username={user.username}
            rank={showingCertificate.rank}
            totalParticipants={showingCertificate.totalParticipants}
            score={showingCertificate.score}
            solves={showingCertificate.solves}
            categories={showingCertificate.categories.length}
            period={formatPeriod(showingCertificate.period, showingCertificate.type)}
            issuedDate={showingCertificate.issuedDate}
          />
        </div>
      </div>
    )
  }

  if (eligibleCertificates.length === 0) {
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
            <p>Achieve a top 3 ranking in monthly or yearly leaderboards to earn certificates!</p>
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
          Certificates ({eligibleCertificates.length})
        </CardTitle>
        <CardDescription>Achievement certificates for top 3 placements in monthly and yearly rankings</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {eligibleCertificates.map((certificate) => (
            <Card key={certificate.id} className="relative overflow-hidden">
              <div className={`absolute inset-0 bg-gradient-to-br ${getRankColor(certificate.rank)} opacity-5`} />
              <CardContent className="p-6 relative">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      {getRankIcon(certificate.rank)}
                      <div>
                        <h3 className="font-semibold text-lg">{getRankText(certificate.rank)} Certificate</h3>
                        <p className="text-sm text-muted-foreground">
                          {formatPeriod(certificate.period, certificate.type)} Rankings
                        </p>
                      </div>
                    </div>
                  </div>
                  <Badge
                    variant="secondary"
                    className={`bg-gradient-to-r ${getRankColor(certificate.rank)} text-white border-0`}
                  >
                    #{certificate.rank} of {certificate.totalParticipants}
                  </Badge>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div className="text-center p-3 bg-muted/50 rounded-lg">
                    <div className="text-xl font-bold text-primary">
                      {certificate.score.toLocaleString("en-US", {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      })}
                    </div>
                    <div className="text-xs text-muted-foreground">Total Score</div>
                  </div>
                  <div className="text-center p-3 bg-muted/50 rounded-lg">
                    <div className="text-xl font-bold text-primary">{certificate.solves}</div>
                    <div className="text-xs text-muted-foreground">Challenges Solved</div>
                  </div>
                  <div className="text-center p-3 bg-muted/50 rounded-lg">
                    <div className="text-xl font-bold text-primary">{certificate.categories.length}</div>
                    <div className="text-xs text-muted-foreground">Categories</div>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="w-4 h-4" />
                    <span>Issued: {new Date(certificate.issuedDate).toLocaleDateString()}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleShareCertificate(certificate)}
                      size="sm"
                      variant="outline"
                      className="gap-2"
                    >
                      <Share2 className="w-4 h-4" />
                      Share
                    </Button>
                    <Link href={getCertificateShareUrl(certificate)} target="_blank">
                      <Button size="sm" variant="outline" className="gap-2 bg-transparent">
                        <ExternalLink className="w-4 h-4" />
                        Public View
                      </Button>
                    </Link>
                    <Button onClick={() => showCertificate(certificate)} size="sm" className="gap-2">
                      <Eye className="w-4 h-4" />
                      Show Certificate
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
