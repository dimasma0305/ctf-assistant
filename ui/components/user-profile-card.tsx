"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, CachedAvatarImage } from "@/components/ui/avatar"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Trophy, TrendingUp, ExternalLink, Star, Target, AwardIcon } from "lucide-react"
import { useCTFProfile } from "@/hooks/useAPI"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { calculatePercentile, getAchievements, getCategoryColor } from "@/lib/utils"

import type { LeaderboardEntry, UserProfileResponse, Achievement } from "@/lib/types"

interface CategoryStat {
  name: string
  solves: number
  totalScore: number
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

  const calculateCategoryBreakdown = (): CategoryStat[] => {
    if (showCTFProfile && ctfProfileData?.categoryBreakdown) {
      return ctfProfileData.categoryBreakdown
    }

    if (profileData?.categoryBreakdown && profileData.categoryBreakdown.length > 0) {
      return profileData.categoryBreakdown
    }

    const categoryStats = new Map<string, { solves: number; totalScore: number; points: number[] }>()

    user.recentSolves.forEach((solve) => {
      const category = solve.category || "misc"
      if (!categoryStats.has(category)) {
        categoryStats.set(category, { solves: 0, totalScore: 0, points: [] })
      }

      const stats = categoryStats.get(category)!
      stats.solves += 1
      stats.totalScore += solve.points || 0
      stats.points.push(solve.points || 0)
    })

    if (categoryStats.size === 0 && user.categories.length > 0) {
      const avgSolvesPerCategory = user.solveCount / user.categories.length
      const avgPointsPerCategory = user.totalScore / user.categories.length

      return user.categories.map((category, index) => {
        const remainder = index < user.solveCount % user.categories.length ? 1 : 0
        const pointsRemainder =
          index < user.totalScore % user.categories.length ? user.totalScore % user.categories.length : 0

        const solves = avgSolvesPerCategory + remainder
        const totalScore = avgPointsPerCategory + pointsRemainder

        return {
          name: category,
          solves,
          totalScore: Number(totalScore.toFixed(2)),
          avgPoints: solves > 0 ? totalScore / solves : 0,
        }
      })
    }

    return Array.from(categoryStats.entries())
      .map(([name, stats]) => ({
        name,
        solves: stats.solves,
        totalScore: Number(stats.totalScore.toFixed(2)),
        avgPoints: stats.solves > 0 ? stats.totalScore / stats.solves : 0,
      }))
      .filter((stat) => stat.solves > 0)
  }

  const categoryBreakdown: CategoryStat[] = calculateCategoryBreakdown()

  const achievements: Achievement[] = getAchievements(profileData?.achievementIds || [])

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
    return score.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 2 })
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

  const averageScorePerSolve = user.solveCount > 0 ? user.totalScore / user.solveCount : 0
  const averageSolvesPerCTF = user.ctfCount > 0 ? user.solveCount / user.ctfCount : 0

  const displayRank = showCTFProfile && ctfProfileData ? ctfProfileData.ctfRank : user.rank
  const displayTotalUsers =
    showCTFProfile && ctfProfileData ? ctfProfileData.totalParticipants : profileData?.totalUsers || 1000
  const displayScore = showCTFProfile && ctfProfileData ? ctfProfileData.stats.score : user.totalScore
  const displaySolves = showCTFProfile && ctfProfileData ? ctfProfileData.stats.solveCount : user.solveCount

  return (
    <Card className="w-full max-w-4xl mx-auto max-h-[85vh] overflow-hidden shadow-xl border-2 border-primary/20 flex flex-col">
      <CardHeader className="pb-4 border-b border-primary/20 flex-shrink-0 bg-gradient-to-r from-primary/5 to-transparent">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4 min-w-0 flex-1">
            <div className="relative flex-shrink-0">
              <Avatar className="w-16 h-16 sm:w-20 sm:h-20 ring-4 ring-primary/30 shadow-lg">
                <CachedAvatarImage
                  src={
                    user.user.avatar ||
                    `/abstract-geometric-shapes.png?key=profile&height=80&width=80&query=${user.user.userId}`
                  }
                  loadingPlaceholder={
                    <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  }
                />
                <AvatarFallback className="text-lg font-bold bg-primary/20">
                  {getUserInitials(user.user)}
                </AvatarFallback>
              </Avatar>
              <div className="absolute -bottom-2 -right-2 bg-primary text-primary-foreground rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold shadow-lg border-2 border-background">
                #{displayRank}
              </div>
            </div>

            <div className="min-w-0 flex-1 space-y-3">
              <CardTitle className="text-xl sm:text-2xl font-bold break-words leading-tight text-primary">
                {getUserDisplayName(user.user)}
              </CardTitle>

              <div className="flex flex-col sm:flex-row gap-2">
                <div className="flex items-center gap-2 px-3 py-2 bg-primary/15 rounded-lg text-sm border border-primary/30">
                  <Trophy className="w-4 h-4 text-primary" />
                  <span className="font-medium">
                    {showCTFProfile && ctfProfileData ? "CTF " : ""}Rank #{displayRank}
                  </span>
                </div>
                <Badge variant="secondary" className="w-fit bg-chart-2/20 text-chart-2 border-chart-2/30">
                  Top {calculatePercentile(displayRank, displayTotalUsers)}%
                </Badge>
              </div>

              {showCTFProfile && ctfProfileData && (
                <Badge variant="outline" className="w-fit border-primary/30">
                  {ctfProfileData.ctfInfo.title}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-6 flex-1 overflow-hidden flex flex-col">
        {showCTFProfile && ctfLoading && (
          <div className="text-center py-8">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Loading CTF-specific profile...</p>
          </div>
        )}

        <Tabs
          value={selectedTab}
          onValueChange={setSelectedTab}
          className="w-full flex-1 overflow-hidden flex flex-col"
        >
          <TabsList className="grid w-full grid-cols-4 h-12 mb-6 p-1 flex-shrink-0 bg-muted/50">
            <TabsTrigger
              value="overview"
              className="text-xs px-2 min-w-0 h-10 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <Target className="w-4 h-4 mr-1 flex-shrink-0" />
              <span className="truncate">Stats</span>
            </TabsTrigger>
            <TabsTrigger
              value="categories"
              className="text-xs px-2 min-w-0 h-10 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <Star className="w-4 h-4 mr-1 flex-shrink-0" />
              <span className="truncate">Skills</span>
            </TabsTrigger>
            <TabsTrigger
              value="achievements"
              className="text-xs px-2 min-w-0 h-10 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <AwardIcon className="w-4 h-4 mr-1 flex-shrink-0" />
              <span className="truncate">Awards</span>
            </TabsTrigger>
            <TabsTrigger
              value="activity"
              className="text-xs px-2 min-w-0 h-10 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <TrendingUp className="w-4 h-4 mr-1 flex-shrink-0" />
              <span className="truncate">Recent</span>
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto">
            <TabsContent value="overview" className="space-y-6 mt-0">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                <div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-lg p-3 sm:p-4 text-center">
                  <div className="text-lg sm:text-2xl font-bold text-primary mb-1 break-all">
                    {formatScore(displayScore)}
                  </div>
                  <div className="text-xs text-muted-foreground">{showCTFProfile ? "CTF Score" : "Total Score"}</div>
                </div>

                <div className="bg-gradient-to-br from-chart-3/10 to-chart-3/5 border border-chart-3/20 rounded-lg p-3 sm:p-4 text-center">
                  <div className="text-lg sm:text-2xl font-bold text-chart-3 mb-1">{displaySolves}</div>
                  <div className="text-xs text-muted-foreground">Challenges</div>
                </div>

                <div className="bg-gradient-to-br from-chart-2/10 to-chart-2/5 border border-chart-2/20 rounded-lg p-3 sm:p-4 text-center">
                  <div className="text-lg sm:text-2xl font-bold text-chart-2 mb-1">
                    {showCTFProfile && ctfProfileData ? ctfProfileData.stats.categoriesCount : user.ctfCount}
                  </div>
                  <div className="text-xs text-muted-foreground">{showCTFProfile ? "Categories" : "CTFs"}</div>
                </div>

                <div className="bg-gradient-to-br from-chart-4/10 to-chart-4/5 border border-chart-4/20 rounded-lg p-3 sm:p-4 text-center">
                  <div className="text-lg sm:text-2xl font-bold text-chart-4 mb-1">
                    {showCTFProfile && ctfProfileData
                      ? Number(ctfProfileData.stats.averagePointsPerSolve.toFixed(2))
                      : user.categories.length}
                  </div>
                  <div className="text-xs text-muted-foreground">{showCTFProfile ? "Score" : "Categories"}</div>
                </div>
              </div>

              {showCTFProfile && ctfProfileData?.performanceComparison && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Card className="p-4">
                    <div className="space-y-2">
                      <div className="text-sm font-medium text-muted-foreground">Score vs Average</div>
                      <div className="text-2xl font-bold text-primary">
                        {ctfProfileData.performanceComparison.scoreVsAverage.percentageDiff > 0 ? "+" : ""}
                        {Number(ctfProfileData.performanceComparison.scoreVsAverage.percentageDiff.toFixed(2))}%
                      </div>
                      <div className="text-sm text-green-600">
                        {ctfProfileData.performanceComparison.scoreVsAverage.percentageDiff > 0
                          ? "Above average"
                          : "Below average"}
                      </div>
                    </div>
                  </Card>

                  <Card className="p-4">
                    <div className="space-y-2">
                      <div className="text-sm font-medium text-muted-foreground">CTF Percentile</div>
                      <div className="text-2xl font-bold text-primary">
                        {Number(ctfProfileData.percentile.toFixed(2))}%
                      </div>
                      <div className="text-sm text-green-600">Top {100 - ctfProfileData.percentile}%</div>
                    </div>
                  </Card>
                </div>
              )}

              {!showCTFProfile && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Card className="p-4">
                    <div className="space-y-2">
                      <div className="text-sm font-medium text-muted-foreground">Avg Score per Solve</div>
                      <div className="text-2xl font-bold text-primary">{formatScore(averageScorePerSolve)}</div>
                      <div className="text-sm text-green-600">
                        {averageScorePerSolve > 15 ? "Above average" : "Improving"}
                      </div>
                    </div>
                  </Card>

                  <Card className="p-4">
                    <div className="space-y-2">
                      <div className="text-sm font-medium text-muted-foreground">Avg Solves per CTF</div>
                      <div className="text-2xl font-bold text-primary">{averageSolvesPerCTF.toFixed(0)}</div>
                      <div className="text-sm text-green-600">
                        {averageSolvesPerCTF > 5 ? "Consistent performer" : "Growing"}
                      </div>
                    </div>
                  </Card>
                </div>
              )}
            </TabsContent>

            <TabsContent value="categories" className="space-y-4 mt-0">
              <div className="space-y-3">
                {categoryBreakdown.map((category) => (
                  <Card key={category.name} className="p-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className={`w-3 h-3 rounded-full ${getCategoryColor(category.name)}`} />
                          <span className="font-medium capitalize">{category.name}</span>
                          {showCTFProfile && category.rankInCategory && (
                            <Badge variant="outline" className="text-xs">
                              #{category.rankInCategory}
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {category.solves} solve{category.solves !== 1 ? "s" : ""}
                        </div>
                      </div>
                      <Progress
                        value={displaySolves > 0 ? (category.solves / displaySolves) * 100 : 0}
                        className="h-2"
                      />
                      {showCTFProfile && category.percentile && (
                        <div className="text-sm text-muted-foreground">
                          <span className="text-primary">Top {100 - category.percentile}%</span>
                        </div>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="achievements" className="space-y-4 mt-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {achievements.map((achievement) => (
                  <Card key={achievement.name} className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="text-2xl flex-shrink-0">{achievement.icon}</div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-foreground mb-1">{achievement.name}</div>
                        <div className="text-sm text-muted-foreground">{achievement.description}</div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="activity" className="space-y-3 mt-0">
              <div className="space-y-2">
                {(showCTFProfile && ctfProfileData?.allSolves ? ctfProfileData.allSolves : user.recentSolves).length >
                0 ? (
                  (showCTFProfile && ctfProfileData?.allSolves ? ctfProfileData.allSolves : user.recentSolves).map(
                    (activity, index) => (
                      <Card key={index} className="p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className={`w-2 h-2 rounded-full ${getCategoryColor(activity.category)}`} />
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-sm mb-1 truncate">{activity.challenge}</div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant="outline" className="text-xs">
                                  {activity.category}
                                </Badge>
                                <span className="text-xs text-primary font-medium">{activity.points}</span>
                                {activity.isTeamSolve && (
                                  <Badge variant="secondary" className="text-xs">
                                    Team
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatTimeAgo(activity.solved_at)}
                          </div>
                        </div>
                      </Card>
                    ),
                  )
                ) : (
                  <div className="text-center py-8">
                    <div className="text-muted-foreground">No recent activity available</div>
                  </div>
                )}
              </div>
            </TabsContent>
          </div>
        </Tabs>

        <div className="mt-4 pt-4 border-t flex-shrink-0">
          <Link href={`/profile/${user.user.userId}`} className="block">
            <Button variant="outline" className="w-full gap-2 bg-transparent">
              <ExternalLink className="w-4 h-4" />
              View Full Profile
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
