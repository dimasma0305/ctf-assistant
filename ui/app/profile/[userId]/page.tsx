"use client"
import { useParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, CachedAvatarImage } from "@/components/ui/avatar"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ArrowLeft, Trophy, Star, Users, Clock, Award, Target, Zap, TrendingUp, Crown } from "lucide-react"
import { calculatePercentile, getAchievements, getCategoryColor } from "@/lib/utils"
import { CertificateGenerator } from "@/components/certificate-generator"

import Link from "next/link"
import { useUserProfile } from "@/hooks/useAPI"
import type { Achievement, UserProfileResponse } from "@/lib/types"

export default function UserProfilePage() {
  const params = useParams()
  const userId = params.userId as string

  const { data: profileData, loading, error } = useUserProfile(userId)

  const formatScore = (score: number) => {
    return score.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
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

    if (profileData.globalRank <= 3) {
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
        isPending: true,
        issuedAt: null,
      })

      if (currentDate.getDate() > 7) {
        const monthStr = currentMonth.toString().padStart(2, "0")
        const isCurrentMonth = true
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
          isPending: isCurrentMonth,
          issuedAt: isCurrentMonth
            ? null
            : `${currentYear}-${monthStr}-${new Date(currentYear, currentMonth, 0).getDate()}T23:59:59Z`,
        })
      }
    }

    return certificates
  }

  const achievements: Achievement[] = getAchievements(profileData?.achievementIds || [])

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          <div className="space-y-8">
            <div className="h-8 w-48 bg-muted animate-pulse rounded-lg" />
            <div className="h-48 bg-muted animate-pulse rounded-2xl" />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-32 bg-muted animate-pulse rounded-xl" />
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-6">
          <div className="w-24 h-24 mx-auto bg-destructive/20 rounded-full flex items-center justify-center">
            <Trophy className="w-12 h-12 text-destructive" />
          </div>
          <div>
            <h1 className="text-3xl font-bold mb-2 text-foreground">Error Loading Profile</h1>
            <p className="text-muted-foreground mb-2">HTTP 404</p>
            <p className="text-sm text-muted-foreground mb-6">Debug: {error}</p>
          </div>
          <Link href="/">
            <Button size="lg" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Return to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  if (!profileData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-6">
          <div className="w-24 h-24 mx-auto bg-muted rounded-full flex items-center justify-center">
            <Users className="w-12 h-12 text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold mb-2 text-foreground">Profile Not Found</h1>
            <p className="text-muted-foreground mb-6">The requested user profile could not be found.</p>
          </div>
          <Link href="/">
            <Button size="lg" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Return to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="mb-6">
          <Link href="/">
            <Button variant="ghost" size="lg" className="gap-2 hover:bg-primary/10">
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </Button>
          </Link>
        </div>

        <Card className="mb-8 border-2 border-primary/20 shadow-xl">
          <CardHeader className="pb-4 border-b border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:gap-8">
              <div className="relative mx-auto lg:mx-0 flex-shrink-0">
                <Avatar className="w-24 h-24 lg:w-32 lg:h-32 ring-4 ring-primary/30 shadow-lg">
                  <CachedAvatarImage
                    src={
                      profileData.user.avatar ||
                      `/abstract-geometric-shapes.png?key=profile&height=128&width=128&query=${profileData.user.userId}`
                    }
                    loadingPlaceholder={
                      <div className="w-6 h-6 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
                    }
                  />
                  <AvatarFallback className="text-2xl lg:text-3xl bg-primary/20 text-primary font-bold">
                    {getUserInitials(profileData.user)}
                  </AvatarFallback>
                </Avatar>
                {profileData.globalRank <= 3 && (
                  <div className="absolute -top-2 -right-2">
                    <div className="bg-gradient-to-r from-yellow-400 to-yellow-600 p-2 rounded-full shadow-lg border-2 border-yellow-300">
                      <Crown className="w-5 h-5 text-yellow-900" />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex-1 text-center lg:text-left min-w-0 space-y-4">
                <CardTitle className="text-2xl lg:text-4xl font-bold break-words text-primary">
                  {profileData.user.displayName || profileData.user.username}
                </CardTitle>

                <div className="flex flex-col lg:flex-row lg:flex-wrap items-center lg:items-start gap-3">
                  <div className="flex items-center gap-3 px-4 py-2 bg-primary/15 rounded-lg border border-primary/30">
                    <Trophy className="w-5 h-5 text-primary" />
                    <span className="font-medium text-primary">Global Rank #{profileData.globalRank}</span>
                  </div>

                  <div className="flex items-center gap-3 px-4 py-2 bg-chart-2/15 rounded-lg border border-chart-2/30">
                    <Users className="w-5 h-5 text-chart-2" />
                    <span className="text-chart-2 font-medium">
                      Top {calculatePercentile(profileData.globalRank, profileData.totalUsers)}%
                    </span>
                  </div>

                  <Badge variant="secondary" className="gap-2 px-4 py-2 bg-chart-3/15 text-chart-3 border-chart-3/30">
                    Elite Player
                  </Badge>
                </div>
              </div>
            </div>
          </CardHeader>
        </Card>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card className="border border-primary/20 bg-gradient-to-br from-primary/10 to-primary/5 hover:shadow-lg transition-all duration-300">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-center mb-1">
                <div className="p-2 bg-primary/20 rounded-lg">
                  <Target className="w-4 h-4 text-primary" />
                </div>
              </div>
              <CardTitle className="text-xs text-primary/90 text-center font-medium">Total Score</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-lg font-bold text-primary text-center">
                {formatScore(profileData.stats.totalScore)}
              </div>
            </CardContent>
          </Card>

          <Card className="border border-chart-3/20 bg-gradient-to-br from-chart-3/10 to-chart-3/5 hover:shadow-lg transition-all duration-300">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-center mb-1">
                <div className="p-2 bg-chart-3/20 rounded-lg">
                  <Zap className="w-4 h-4 text-chart-3" />
                </div>
              </div>
              <CardTitle className="text-xs text-chart-3/90 text-center font-medium">Challenges Solved</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-lg font-bold text-chart-3 text-center">{profileData.stats.solveCount}</div>
            </CardContent>
          </Card>

          <Card className="border border-chart-2/20 bg-gradient-to-br from-chart-2/10 to-chart-2/5 hover:shadow-lg transition-all duration-300">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-center mb-1">
                <div className="p-2 bg-chart-2/20 rounded-lg">
                  <Trophy className="w-4 h-4 text-chart-2" />
                </div>
              </div>
              <CardTitle className="text-xs text-chart-2/90 text-center font-medium">CTFs Participated</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-lg font-bold text-chart-2 text-center">{profileData.stats.ctfCount}</div>
            </CardContent>
          </Card>

          <Card className="border border-chart-4/20 bg-gradient-to-br from-chart-4/10 to-chart-4/5 hover:shadow-lg transition-all duration-300">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-center mb-1">
                <div className="p-2 bg-chart-4/20 rounded-lg">
                  <Award className="w-4 h-4 text-chart-4" />
                </div>
              </div>
              <CardTitle className="text-xs text-chart-4/90 text-center font-medium">Categories Mastered</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-lg font-bold text-chart-4 text-center">{profileData.stats.categoriesCount}</div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="categories" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 h-auto bg-muted/50 p-1">
            <TabsTrigger
              value="categories"
              className="text-sm px-4 py-3 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              Categories
            </TabsTrigger>
            <TabsTrigger
              value="ctfs"
              className="text-sm px-4 py-3 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              CTFs
            </TabsTrigger>
            <TabsTrigger
              value="achievements"
              className="text-sm px-4 py-3 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              Awards
            </TabsTrigger>
            <TabsTrigger
              value="certificates"
              className="text-sm px-4 py-3 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              Certificates
            </TabsTrigger>
            <TabsTrigger
              value="activity"
              className="text-sm px-4 py-3 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground col-span-2 sm:col-span-1"
            >
              Activity
            </TabsTrigger>
          </TabsList>

          <TabsContent value="categories">
            <Card className="border border-primary/20 shadow-lg">
              <CardHeader className="bg-gradient-to-r from-primary/5 to-transparent">
                <CardTitle className="text-foreground flex items-center gap-3">
                  <Star className="w-5 h-5" />
                  Category Performance
                </CardTitle>
                <CardDescription>Breakdown of performance across different challenge categories</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 p-6">
                {profileData.categoryBreakdown.map((category) => (
                  <div
                    key={category.name}
                    className="space-y-3 p-4 rounded-lg bg-muted/30 border border-primary/10 hover:shadow-md transition-all duration-300"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-4 h-4 rounded-full ${getCategoryColor(category.name)}`} />
                        <span className="font-medium capitalize text-foreground">{category.name}</span>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-foreground">{category.solves} solves</div>
                        <div className="text-sm text-muted-foreground">{category.totalScore} total score</div>
                      </div>
                    </div>
                    <Progress value={(category.solves / profileData.stats.solveCount) * 100} className="h-3" />
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        {Math.round((category.solves / profileData.stats.solveCount) * 100)}% of total solves
                      </span>
                      <span className="text-muted-foreground">Avg: {category.avgPoints} pts/solve</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ctfs">
            <Card className="border border-chart-3/20 shadow-lg">
              <CardHeader className="bg-gradient-to-r from-chart-3/5 to-transparent">
                <CardTitle className="text-foreground flex items-center gap-3">
                  <Trophy className="w-5 h-5" />
                  CTF Participation History
                </CardTitle>
                <CardDescription>Performance in individual CTF competitions</CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-4">
                  {profileData.ctfBreakdown.map((ctf) => (
                    <Card
                      key={ctf.ctf_id}
                      className="p-4 hover:shadow-md transition-all duration-300 border border-primary/10 bg-muted/20"
                    >
                      <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                        <div className="flex items-center gap-3 lg:flex-col lg:items-center">
                          <Avatar className="w-12 h-12 lg:w-16 lg:h-16 border border-primary/20 flex-shrink-0">
                            <CachedAvatarImage
                              src={ctf.logo || `/placeholder.svg?height=64&width=64&query=CTF+logo+${ctf.ctfTitle}`}
                              loadingPlaceholder={
                                <div className="w-4 h-4 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
                              }
                            />
                            <AvatarFallback className="text-sm font-bold bg-primary/20 text-primary">
                              {ctf.ctfTitle
                                .split(" ")
                                .map((word) => word[0])
                                .join("")
                                .slice(0, 2)
                                .toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 lg:hidden">
                            <h3 className="font-bold text-lg text-foreground">{ctf.ctfTitle}</h3>
                          </div>
                          <div className="text-right lg:hidden flex-shrink-0">
                            <div className="text-xs text-muted-foreground">Score</div>
                            <div className="font-bold text-xl text-foreground">{formatScore(ctf.score)}</div>
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="hidden lg:block mb-3">
                            <h3 className="font-bold text-xl text-foreground mb-1">{ctf.ctfTitle}</h3>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 mb-3">
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-muted-foreground">Weight:</span>
                              <Badge
                                variant="secondary"
                                className="px-2 py-1 bg-primary/15 text-primary border-primary/20"
                              >
                                {ctf.weight}x
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-muted-foreground">Solves:</span>
                              <Badge
                                variant="outline"
                                className="px-2 py-1 border-chart-3/20 text-chart-3 bg-chart-3/10"
                              >
                                {ctf.solves}
                              </Badge>
                            </div>
                            <div className="hidden lg:block ml-auto text-right">
                              <div className="text-sm text-muted-foreground">Score</div>
                              <div className="font-bold text-2xl text-foreground">{formatScore(ctf.score)}</div>
                            </div>
                          </div>
                          <div className="w-full bg-muted rounded-full h-2">
                            <div
                              className="bg-gradient-to-r from-primary to-chart-2 rounded-full h-2 transition-all duration-300"
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
            <Card className="border border-chart-2/20 shadow-lg">
              <CardHeader className="bg-gradient-to-r from-chart-2/5 to-transparent">
                <CardTitle className="text-foreground flex items-center gap-3">
                  <Star className="w-5 h-5" />
                  Achievements & Milestones
                </CardTitle>
                <CardDescription>Recognition for exceptional performance and participation</CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {achievements.map((achievement) => (
                    <Card
                      key={achievement.name}
                      className="p-4 border border-primary/20 bg-gradient-to-br from-primary/10 to-chart-3/5 hover:shadow-md transition-all duration-300"
                    >
                      <div className="flex items-center gap-4">
                        <div className="text-3xl p-3 bg-white/20 rounded-lg">{achievement.icon}</div>
                        <div>
                          <h3 className="font-bold text-foreground mb-1">{achievement.name}</h3>
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
            <Card className="border border-orange-500/20 shadow-lg">
              <CardHeader className="bg-gradient-to-r from-orange-500/5 to-transparent">
                <CardTitle className="text-orange-500 flex items-center gap-3">
                  <Award className="w-5 h-5" />
                  Certificates & Recognition
                </CardTitle>
                <CardDescription>Official certificates for outstanding performance</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {profileData && (
                  <CertificateGenerator
                    user={profileData.user}
                    certificates={generateCertificatesFromProfile(profileData)}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="activity">
            <Card className="border border-chart-4/20 shadow-lg">
              <CardHeader className="bg-gradient-to-r from-chart-4/5 to-transparent">
                <CardTitle className="text-foreground flex items-center gap-3">
                  <TrendingUp className="w-5 h-5" />
                  Recent Activity
                </CardTitle>
                <CardDescription>Latest challenge solves and participation</CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-4">
                  {profileData.recentSolves.map((activity, index) => (
                    <Card
                      key={index}
                      className="p-4 border border-primary/10 bg-muted/20 hover:shadow-md transition-all duration-300"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className={`w-3 h-3 rounded-full ${getCategoryColor(activity.category)}`} />
                          <div>
                            <h3 className="font-semibold text-foreground mb-1">{activity.challenge}</h3>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Badge
                                variant="outline"
                                className="px-2 py-1 border-primary/20 text-primary bg-primary/10"
                              >
                                {activity.category}
                              </Badge>
                              <span className="font-bold text-primary">{activity.points} points</span>
                              {activity.isTeamSolve && (
                                <Badge
                                  variant="secondary"
                                  className="px-2 py-1 bg-chart-3/15 text-chart-3 border-chart-3/20"
                                >
                                  Team solve with {activity.teammates?.length || 0} others
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="text-sm text-muted-foreground flex items-center gap-2">
                          <Clock className="w-4 h-4" />
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
