"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Trophy, Medal, Award, Download, Calendar, Star } from "lucide-react"
import type { UserInfo } from "@/lib/types"

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

  const generateCertificate = async (certificate: CertificateData) => {
    try {
      const params = new URLSearchParams({
        userId: user.userId,
        username: user.username,
        rank: certificate.rank.toString(),
        period: certificate.type,
        year: certificate.period.split("-")[0],
        ...(certificate.type === "monthly" && {
          month: new Date(
            Number.parseInt(certificate.period.split("-")[0]),
            Number.parseInt(certificate.period.split("-")[1]) - 1,
          ).toLocaleString("default", { month: "long" }),
        }),
      })

      const response = await fetch(`/api/certificate?${params}`)

      if (!response.ok) {
        throw new Error("Failed to generate certificate")
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `certificate-${user.username}-${certificate.type}-${certificate.rank}.png`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error("Certificate generation failed:", error)
      alert("Failed to generate certificate. Please try again.")
    }
  }

  // Filter certificates to only show top 3 placements
  const eligibleCertificates = certificates.filter((cert) => cert.rank <= 3)

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
                  <Button onClick={() => generateCertificate(certificate)} size="sm" className="gap-2">
                    <Download className="w-4 h-4" />
                    Download Certificate
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
