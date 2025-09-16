"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, CachedAvatarImage } from "@/components/ui/avatar"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Trophy, TrendingUp, ExternalLink } from "lucide-react"
import { useCTFProfile } from "@/hooks/useAPI"
import Link from "next/link"
import { Button } from "@/components/ui/button"

import type { LeaderboardEntry, UserProfileResponse } from "@/lib/types"

interface Achievement {
  name: string
  description: string
  icon: string
}

interface CategoryStat {
  name: string
  solves: number
  totalPoints: number
  avgPoints: number
  rankInCategory?: number
  percentile?: number
}

interface UserProfileCardProps {
  user: LeaderboardEntry
  profileData?: UserProfileResponse
  ctfId?: string
  showCTFProfile?: boolean
}

export function UserProfileCard({ user, profileData, ctfId, showCTFProfile = false }: UserProfileCardProps) {
  const [selectedTab, setSelectedTab] = useState("overview")

  const { data: ctfProfileData, loading: ctfLoading } = useCTFProfile(
    showCTFProfile && ctfId ? ctfId : null,
    showCTFProfile ? user.user.userId : null,
  )

  const activeProfileData = showCTFProfile && ctfProfileData ? ctfProfileData : profileData

  const calculateCategoryBreakdown = (): CategoryStat[] => {
    if (showCTFProfile && ctfProfileData?.categoryBreakdown) {
      return ctfProfileData.categoryBreakdown
    }

    if (profileData?.categoryBreakdown && profileData.categoryBreakdown.length > 0) {
      return profileData.categoryBreakdown
    }

    const categoryStats = new Map<string, { solves: number; totalPoints: number; points: number[] }>()

    user.recentSolves.forEach((solve) => {
      const category = solve.category || "misc"
      if (!categoryStats.has(category)) {
        categoryStats.set(category, { solves: 0, totalPoints: 0, points: [] })
      }

      const stats = categoryStats.get(category)!
      stats.solves += 1
      stats.totalPoints += solve.points || 0
      stats.points.push(solve.points || 0)
    })

    if (categoryStats.size === 0 && user.categories.length > 0) {
      const avgSolvesPerCategory = Math.floor(user.solveCount / user.categories.length)
      const avgPointsPerCategory = Math.floor(user.totalScore / user.categories.length)

      return user.categories.map((category, index) => {
        const remainder = index < user.solveCount % user.categories.length ? 1 : 0
        const pointsRemainder =
          index < user.totalScore % user.categories.length ? user.totalScore % user.categories.length : 0

        const solves = avgSolvesPerCategory + remainder
        const totalPoints = avgPointsPerCategory + pointsRemainder

        return {
          name: category,
          solves,
          totalPoints,
          avgPoints: solves > 0 ? Math.round(totalPoints / solves) : 0,
        }
      })
    }

    return Array.from(categoryStats.entries())
      .map(([name, stats]) => ({
        name,
        solves: stats.solves,
        totalPoints: stats.totalPoints,
        avgPoints: stats.solves > 0 ? Math.round(stats.totalPoints / stats.solves) : 0,
      }))
      .filter((stat) => stat.solves > 0)
  }

  const categoryBreakdown: CategoryStat[] = calculateCategoryBreakdown()

  const achievements: Achievement[] = [
    ...(showCTFProfile && ctfProfileData?.achievements ? ctfProfileData.achievements : []),
    ...(user.solveCount >= 100 ? [{ name: "Century Solver", description: "Solved 100+ challenges", icon: "🎯" }] : []),
    ...(user.ctfCount >= 10 ? [{ name: "CTF Explorer", description: "Participated in 10+ CTFs", icon: "🗺️" }] : []),
    ...(user.categories.length >= 5
      ? [{ name: "Well Rounded", description: "Solved challenges in 5+ categories", icon: "🌟" }]
      : []),
    ...(user.rank <= 3
      ? [
          {
            name: "Podium Finisher",
            description: `${showCTFProfile && ctfProfileData ? "CTF" : "Global"} rank #${showCTFProfile && ctfProfileData ? ctfProfileData.ctfRank : user.rank}`,
            icon:
              (showCTFProfile && ctfProfileData ? ctfProfileData.ctfRank : user.rank) === 1
                ? "🥇"
                : (showCTFProfile && ctfProfileData ? ctfProfileData.ctfRank : user.rank) === 2
                  ? "🥈"
                  : "🥉",
          },
        ]
      : []),
    ...(user.rank <= 10 ? [{ name: "Elite Player", description: "Top 10 ranking", icon: "⭐" }] : []),
  ]

  const getUserInitials = (user: LeaderboardEntry["user"]) => {
    const name = user.displayName || user.username
    const parts = name.split(" ")
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase()
    }
    return name.slice(0, 2).toUpperCase()
  }

  const getUserDisplayName = (user: LeaderboardEntry["user"]) => {
    return user.displayName || user.username
  }

  const formatScore = (score: number) => {
    return score.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  }

  const getPercentile = (rank: number, total: number) => {
    return Math.round((rank / total) * 100)
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

  const averageScorePerSolve = user.totalScore / user.solveCount
  const averageSolvesPerCTF = user.solveCount / user.ctfCount

  const displayRank = showCTFProfile && ctfProfileData ? ctfProfileData.ctfRank : user.rank
  const displayTotalUsers =
    showCTFProfile && ctfProfileData ? ctfProfileData.totalParticipants : profileData?.totalUsers || 1000
  const displayScore = showCTFProfile && ctfProfileData ? ctfProfileData.stats.score : user.totalScore
  const displaySolves = showCTFProfile && ctfProfileData ? ctfProfileData.stats.solveCount : user.solveCount

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <Avatar className="w-16 h-16 flex-shrink-0">
              <CachedAvatarImage
                src={
                  user.user.avatar ||
                  `/abstract-geometric-shapes.png?key=profile&height=64&width=64&query=${user.user.userId}`
                }
                loadingPlaceholder={
                  <div className="w-4 h-4 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
                }
              />
              <AvatarFallback className="text-lg bg-primary/20 text-foreground font-medium">
                {getUserInitials(user.user)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-2xl font-[family-name:var(--font-playfair)] truncate">
                {getUserDisplayName(user.user)}
              </CardTitle>
              <CardDescription className="flex items-center gap-2 mt-1 flex-wrap">
                <Trophy className="w-4 h-4 flex-shrink-0" />
                <span className="whitespace-nowrap">
                  {showCTFProfile && ctfProfileData ? "CTF " : ""}Rank #{displayRank}
                  {activeProfileData ? ` of ${displayTotalUsers.toLocaleString()}` : ""}
                </span>
                <Badge variant="secondary" className="text-foreground whitespace-nowrap">
                  Top {getPercentile(displayRank, displayTotalUsers)}%
                </Badge>
                {showCTFProfile && ctfProfileData && (
                  <Badge variant="outline" className="text-xs">
                    {ctfProfileData.ctfInfo.title}
                  </Badge>
                )}
              </CardDescription>
            </div>
          </div>
          <Link href={`/profile/${user.user.userId}`}>
            <Button variant="outline" size="sm" className="gap-2 bg-transparent">
              <ExternalLink className="w-3 h-3" />
              Full Profile
            </Button>
          </Link>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {showCTFProfile && ctfLoading && (
          <div className="text-center py-4">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Loading CTF-specific profile...</p>
          </div>
        )}

        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview" className="text-xs sm:text-sm">
              Overview
            </TabsTrigger>
            <TabsTrigger value="categories" className="text-xs sm:text-sm">
              Categories
            </TabsTrigger>
            <TabsTrigger value="achievements" className="text-xs sm:text-sm">
              Achievements
            </TabsTrigger>
            <TabsTrigger value="activity" className="text-xs sm:text-sm">
              Activity
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 mt-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="text-lg sm:text-xl lg:text-2xl font-bold text-primary break-all">
                  {formatScore(displayScore)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">{showCTFProfile ? "CTF Score" : "Total Score"}</div>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="text-xl lg:text-2xl font-bold text-primary">{displaySolves}</div>
                <div className="text-xs text-muted-foreground mt-1">Challenges Solved</div>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="text-xl lg:text-2xl font-bold text-primary">
                  {showCTFProfile && ctfProfileData ? ctfProfileData.stats.categoriesCount : user.ctfCount}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {showCTFProfile ? "Categories" : "CTFs Participated"}
                </div>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="text-xl lg:text-2xl font-bold text-primary">
                  {showCTFProfile && ctfProfileData
                    ? Math.round(ctfProfileData.stats.averagePointsPerSolve)
                    : user.categories.length}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {showCTFProfile ? "Avg Pts/Solve" : "Categories"}
                </div>
              </div>
            </div>

            {showCTFProfile && ctfProfileData?.performanceComparison && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card className="p-4">
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Score vs Average</div>
                    <div className="text-xl font-bold text-primary">
                      {ctfProfileData.performanceComparison.scoreVsAverage.percentageDiff > 0 ? "+" : ""}
                      {ctfProfileData.performanceComparison.scoreVsAverage.percentageDiff}%
                    </div>
                    <div className="flex items-center gap-1 text-sm text-green-600">
                      <TrendingUp className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">
                        {ctfProfileData.performanceComparison.scoreVsAverage.percentageDiff > 0
                          ? "Above average"
                          : "Below average"}
                      </span>
                    </div>
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="space-y-2">
                    <div className="text-sm font-medium">CTF Percentile</div>
                    <div className="text-xl font-bold text-primary">{ctfProfileData.percentile}%</div>
                    <div className="flex items-center gap-1 text-sm text-green-600">
                      <TrendingUp className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">Top {100 - ctfProfileData.percentile}%</span>
                    </div>
                  </div>
                </Card>
              </div>
            )}

            {!showCTFProfile && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card className="p-4">
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Average Score per Solve</div>
                    <div className="text-xl font-bold text-primary">{formatScore(averageScorePerSolve)}</div>
                    <div className="flex items-center gap-1 text-sm text-green-600">
                      <TrendingUp className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{averageScorePerSolve > 15 ? "Above average" : "Improving"}</span>
                    </div>
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Average Solves per CTF</div>
                    <div className="text-xl font-bold text-primary">{averageSolvesPerCTF.toFixed(1)}</div>
                    <div className="flex items-center gap-1 text-sm text-green-600">
                      <TrendingUp className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{averageSolvesPerCTF > 5 ? "Consistent performer" : "Growing"}</span>
                    </div>
                  </div>
                </Card>
              </div>
            )}
          </TabsContent>

          <TabsContent value="categories" className="space-y-4 mt-6">
            <div className="space-y-4">
              {categoryBreakdown.map((category) => (
                <div key={category.name} className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className={`w-3 h-3 rounded-full flex-shrink-0 ${getCategoryColor(category.name)}`} />
                      <span className="font-medium capitalize truncate">{category.name}</span>
                      {showCTFProfile && category.rankInCategory && (
                        <Badge variant="outline" className="text-xs">
                          #{category.rankInCategory}
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground whitespace-nowrap">
                      {category.solves} solves • {category.totalPoints} pts
                    </div>
                  </div>
                  <Progress value={displaySolves > 0 ? (category.solves / displaySolves) * 100 : 0} className="h-2" />
                  <div className="text-xs text-muted-foreground">
                    Average: {category.avgPoints} points per solve
                    {showCTFProfile && category.percentile && (
                      <span> • Top {100 - category.percentile}% in category</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="achievements" className="space-y-4 mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {achievements.map((achievement) => (
                <Card key={achievement.name} className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="text-2xl flex-shrink-0">{achievement.icon}</div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{achievement.name}</div>
                      <div className="text-sm text-muted-foreground">{achievement.description}</div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="activity" className="space-y-4 mt-6">
            <div className="space-y-3">
              {(showCTFProfile && ctfProfileData?.allSolves ? ctfProfileData.allSolves : user.recentSolves).length >
              0 ? (
                (showCTFProfile && ctfProfileData?.allSolves ? ctfProfileData.allSolves : user.recentSolves).map(
                  (activity, index) => (
                    <Card key={index} className="p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div
                            className={`w-2 h-2 rounded-full flex-shrink-0 ${getCategoryColor(activity.category)}`}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="font-medium truncate">{activity.challenge}</div>
                            <div className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className="text-xs">
                                {activity.category}
                              </Badge>
                              <span>{activity.points} points</span>
                              {activity.isTeamSolve && (
                                <Badge variant="secondary" className="text-xs">
                                  Team solve
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="text-sm text-muted-foreground whitespace-nowrap">
                          {formatTimeAgo(activity.solved_at)}
                        </div>
                      </div>
                    </Card>
                  ),
                )
              ) : (
                <div className="text-center py-8 text-muted-foreground">No recent activity available</div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
