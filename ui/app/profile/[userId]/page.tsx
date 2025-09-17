"use client"
import { useParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, CachedAvatarImage } from "@/components/ui/avatar"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ArrowLeft, Trophy, Star, Users, Clock } from "lucide-react"
import { CertificateGenerator } from "@/components/certificate-generator"
import { calculatePercentile, getAchievements } from "@/lib/utils"

import Link from "next/link"
import { useUserProfile } from "@/hooks/useAPI"
import type { Achievement, UserProfileResponse } from "@/lib/types"

export default function UserProfilePage() {
  const params = useParams()
  const userId = params.userId as string

  console.log("[v0] Profile page loading for userId:", userId)

  const { data: profileData, loading, error } = useUserProfile(userId)

  console.log("[v0] Profile API response:", { profileData, loading, error })

  const formatScore = (score: number) => {
    return score.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  }

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      web: "bg-blue-500",
      crypto: "bg-purple-500",
      pwn: "bg-red-500",
      reverse: "bg-green-500",
      forensics: "bg-yellow-500",
      misc: "bg-gray-500",
    }
    return colors[category] || "bg-gray-500"
  }

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60))

    if (diffInHours < 24) {
      return `${diffInHours}h ago`
    } else {
      const diffInDays = Math.floor(diffInHours / 24)
      return `${diffInDays}d ago`
    }
  }

  function getUserInitials(user: UserProfileResponse["user"]) {
    const name = user.displayName || user.username
    const parts = name.split(" ")
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase()
    }
    return name.slice(0, 2).toUpperCase()
  }

  const generateCertificatesFromProfile = (profileData: UserProfileResponse) => {
    const certificates = []
    const currentDate = new Date()
    const currentYear = currentDate.getFullYear()
    const currentMonth = currentDate.getMonth() + 1

    // Check if user qualifies for certificates based on their global rank
    // Only top 3 global ranks get certificates
    if (profileData.globalRank <= 3) {
      // Generate yearly certificate for current year
      certificates.push({
        id: `cert-${currentYear}`,
        type: "yearly" as const,
        period: currentYear.toString(),
        rank: profileData.globalRank,
        totalParticipants: profileData.totalUsers,
        score: profileData.stats.totalScore,
        solves: profileData.stats.solveCount,
        categories: profileData.categoryBreakdown.map((cat) => cat.name),
        issuedDate: `${currentYear}-12-31T23:59:59Z`,
        isPending: true, // Yearly certificates are pending until year end
        issuedAt: null, // Will be set when certificate is officially issued
      })

      // Generate monthly certificate for current month if we're past the first week
      if (currentDate.getDate() > 7) {
        const monthStr = currentMonth.toString().padStart(2, "0")
        const isCurrentMonth = true // This month's certificate is always pending
        certificates.push({
          id: `cert-${currentYear}-${monthStr}`,
          type: "monthly" as const,
          period: `${currentYear}-${monthStr}`,
          rank: profileData.globalRank,
          totalParticipants: profileData.totalUsers,
          score: profileData.stats.totalScore,
          solves: profileData.stats.solveCount,
          categories: profileData.categoryBreakdown.map((cat) => cat.name),
          issuedDate: `${currentYear}-${monthStr}-${new Date(currentYear, currentMonth, 0).getDate()}T23:59:59Z`,
          isPending: isCurrentMonth, // Current month certificates are pending
          issuedAt: isCurrentMonth
            ? null
            : `${currentYear}-${monthStr}-${new Date(currentYear, currentMonth, 0).getDate()}T23:59:59Z`,
        })
      }
    }

    return certificates
  }

  const achievements: Achievement[] = getAchievements(profileData?.achievementsIds || [])

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <div className="space-y-6">
            <div className="h-8 w-48 bg-muted animate-pulse rounded" />
            <div className="h-32 bg-muted animate-pulse rounded" />
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-24 bg-muted animate-pulse rounded" />
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    console.log("[v0] Profile error details:", error)
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Error Loading Profile</h1>
          <p className="text-muted-foreground mb-4">HTTP 404</p>
          <p className="text-sm text-muted-foreground mb-4">Debug: {error}</p>
          <Link href="/">
            <Button>Return to Dashboard</Button>
          </Link>
        </div>
      </div>
    )
  }

  if (!profileData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Profile Not Found</h1>
          <p className="text-muted-foreground mb-4">The requested user profile could not be found.</p>
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
        {/* Back Navigation */}
        <div className="mb-6">
          <Link href="/">
            <Button variant="ghost" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </Button>
          </Link>
        </div>

        {/* Profile Header */}
        <Card className="mb-8">
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
              <Avatar className="w-20 h-20 sm:w-24 sm:h-24 mx-auto sm:mx-0 flex-shrink-0">
                <CachedAvatarImage
                  src={
                    profileData.user.avatar ||
                    `/abstract-geometric-shapes.png?key=profile&height=96&width=96&query=${profileData.user.userId}`
                  }
                  loadingPlaceholder={
                    <div className="w-3 h-3 border border-muted-foreground border-t-transparent rounded-full animate-spin" />
                  }
                />
                <AvatarFallback className="text-xl sm:text-2xl bg-primary/10 text-primary">
                  {getUserInitials(profileData.user)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 text-center sm:text-left min-w-0">
                <CardTitle className="text-xl sm:text-2xl lg:text-3xl font-[family-name:var(--font-playfair)] mb-2 break-words hyphens-auto">
                  {profileData.user.displayName || profileData.user.username}
                </CardTitle>
                <div className="flex flex-col sm:flex-row sm:flex-wrap items-center sm:items-start gap-2 sm:gap-4 text-sm sm:text-base text-muted-foreground">
                  <div className="flex items-center gap-2 whitespace-nowrap">
                    <Trophy className="w-4 h-4 flex-shrink-0" />
                    Global Rank #{profileData.globalRank}
                  </div>
                  <div className="flex items-center gap-2 text-center sm:text-left">
                    <Users className="w-4 h-4 flex-shrink-0" />
                    <span className="break-words">
                      Top {calculatePercentile(profileData.globalRank, profileData.totalUsers)}% of{" "}
                      {profileData.totalUsers.toLocaleString()} players
                    </span>
                  </div>
                  <Badge variant="secondary" className="gap-1 whitespace-nowrap">
                    <Star className="w-3 h-3" />
                    Elite Player
                  </Badge>
                </div>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs sm:text-sm text-muted-foreground text-center">Total Score</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-lg sm:text-xl lg:text-2xl font-bold text-primary text-center break-all">
                {formatScore(profileData.stats.totalScore)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs sm:text-sm text-muted-foreground text-center">Challenges Solved</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-lg sm:text-xl lg:text-2xl font-bold text-primary text-center">
                {profileData.stats.solveCount}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs sm:text-sm text-muted-foreground text-center">CTFs Participated</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-lg sm:text-xl lg:text-2xl font-bold text-primary text-center">
                {profileData.stats.ctfCount}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs sm:text-sm text-muted-foreground text-center">
                Categories Mastered
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-lg sm:text-xl lg:text-2xl font-bold text-primary text-center">
                {profileData.stats.categoriesCount}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Detailed Tabs */}
        <Tabs defaultValue="categories" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 h-auto">
            <TabsTrigger value="categories" className="text-xs sm:text-sm px-2 py-2 data-[state=active]:text-primary">
              Categories
            </TabsTrigger>
            <TabsTrigger value="ctfs" className="text-xs sm:text-sm px-2 py-2 data-[state=active]:text-primary">
              CTFs
            </TabsTrigger>
            <TabsTrigger value="achievements" className="text-xs sm:text-sm px-2 py-2 data-[state=active]:text-primary">
              Awards
            </TabsTrigger>
            <TabsTrigger value="certificates" className="text-xs sm:text-sm px-2 py-2 data-[state=active]:text-primary">
              Certificates
            </TabsTrigger>
            <TabsTrigger
              value="activity"
              className="text-xs sm:text-sm px-2 py-2 data-[state=active]:text-primary col-span-2 sm:col-span-1"
            >
              Activity
            </TabsTrigger>
          </TabsList>

          <TabsContent value="categories">
            <Card>
              <CardHeader>
                <CardTitle>Category Performance</CardTitle>
                <CardDescription>Breakdown of performance across different challenge categories</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {profileData.categoryBreakdown.map((category) => (
                  <div key={category.name} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-4 h-4 rounded-full ${getCategoryColor(category.name)}`} />
                        <span className="font-medium capitalize text-lg">{category.name}</span>
                      </div>
                      <div className="text-right">
                        <div className="font-bold">{category.solves} solves</div>
                        <div className="text-sm text-muted-foreground">{category.totalScore} total score</div>
                      </div>
                    </div>
                    <Progress value={(category.solves / profileData.stats.solveCount) * 100} className="h-3" />
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>{Math.round((category.solves / profileData.stats.solveCount) * 100)}% of total solves</span>
                      <span>Avg: {category.avgPoints} pts/solve</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ctfs">
            <Card>
              <CardHeader>
                <CardTitle>CTF Participation History</CardTitle>
                <CardDescription>Performance in individual CTF competitions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {profileData.ctfBreakdown.map((ctf) => (
                    <Card key={ctf.ctf_id} className="p-4 sm:p-6 hover:shadow-md transition-shadow">
                      <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
                        {/* CTF Logo and Title Row for Mobile */}
                        <div className="flex items-center gap-3 sm:flex-col sm:items-center sm:gap-2">
                          <Avatar className="w-10 h-10 sm:w-12 sm:h-12 border-2 border-border flex-shrink-0">
                            <CachedAvatarImage
                              src={ctf.logo || `/placeholder.svg?height=48&width=48&query=CTF+logo+${ctf.ctfTitle}`}
                              loadingPlaceholder={
                                <div className="w-4 h-4 border border-muted-foreground border-t-transparent rounded-full animate-spin" />
                              }
                            />
                            <AvatarFallback className="text-xs sm:text-sm font-semibold bg-primary/10 text-primary">
                              {ctf.ctfTitle
                                .split(" ")
                                .map((word) => word[0])
                                .join("")
                                .slice(0, 2)
                                .toUpperCase()}
                            </AvatarFallback>
                          </Avatar>

                          {/* Mobile: Title next to logo, Desktop: Title below logo */}
                          <div className="flex-1 sm:hidden">
                            <h3 className="font-semibold text-base text-balance leading-tight">{ctf.ctfTitle}</h3>
                          </div>

                          {/* Score - Mobile: Right side, Desktop: Below details */}
                          <div className="text-right sm:hidden flex-shrink-0">
                            <div className="text-xs text-muted-foreground">Score</div>
                            <div className="font-bold text-lg text-primary">{formatScore(ctf.score)}</div>
                          </div>
                        </div>

                        {/* CTF Details */}
                        <div className="flex-1 min-w-0">
                          {/* Desktop Title */}
                          <div className="hidden sm:block mb-3">
                            <h3 className="font-semibold text-lg text-balance leading-tight mb-1">{ctf.ctfTitle}</h3>
                          </div>

                          {/* Stats Row */}
                          <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-3">
                            <div className="flex items-center gap-1">
                              <span className="text-xs sm:text-sm text-muted-foreground">Weight:</span>
                              <Badge variant="secondary" className="text-xs px-2 py-0.5">
                                {ctf.weight}x
                              </Badge>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-xs sm:text-sm text-muted-foreground">Solves:</span>
                              <Badge variant="outline" className="text-xs px-2 py-0.5">
                                {ctf.solves}
                              </Badge>
                            </div>

                            {/* Desktop Score */}
                            <div className="hidden sm:block ml-auto text-right">
                              <div className="text-xs text-muted-foreground">Score</div>
                              <div className="font-bold text-xl text-primary">{formatScore(ctf.score)}</div>
                            </div>
                          </div>

                          {/* Progress Bar */}
                          <div className="w-full bg-muted rounded-full h-1.5 sm:h-2">
                            <div
                              className="bg-primary rounded-full h-1.5 sm:h-2 transition-all duration-300"
                              style={{
                                width: `${Math.min((ctf.score / Math.max(...profileData.ctfBreakdown.map((c) => c.score))) * 100, 100)}%`,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="achievements">
            <Card>
              <CardHeader>
                <CardTitle>Achievements & Milestones</CardTitle>
                <CardDescription>Recognition for exceptional performance and participation</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {achievements.map((achievement) => (
                    <Card key={achievement.name} className="p-4 border-2 border-primary/20">
                      <div className="flex items-center gap-4">
                        <div className="text-3xl">{achievement.icon}</div>
                        <div>
                          <h3 className="font-semibold text-primary">{achievement.name}</h3>
                          <p className="text-sm text-muted-foreground">{achievement.description}</p>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="certificates">
            <CertificateGenerator user={profileData.user} certificates={generateCertificatesFromProfile(profileData)} />
          </TabsContent>

          <TabsContent value="activity">
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Latest challenge solves and participation</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {profileData.recentSolves.map((activity, index) => (
                    <Card key={index} className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className={`w-3 h-3 rounded-full ${getCategoryColor(activity.category)}`} />
                          <div>
                            <h3 className="font-medium">{activity.challenge}</h3>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Badge variant="outline" className="text-xs">
                                {activity.category}
                              </Badge>
                              <span>{activity.points} points</span>
                              {activity.isTeamSolve && (
                                <Badge variant="secondary" className="text-xs">
                                  Team solve with {activity.teammates?.length || 0} others
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="text-sm text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatTimeAgo(activity.solved_at)}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
