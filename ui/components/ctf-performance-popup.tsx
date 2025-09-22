"use client"

import type React from "react"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Trophy, Target, Users, Award, TrendingUp, Clock, Star, Medal, BarChart3, Calendar, Hash } from "lucide-react"
import { useCTFProfileDetailed } from "@/hooks/useAPI"
import { formatDistanceToNow } from "date-fns"

interface CTFPerformancePopupProps {
  userId: string
  ctfId: string
  trigger: React.ReactNode
}

export function CTFPerformancePopup({ userId, ctfId, trigger }: CTFPerformancePopupProps) {
  const [open, setOpen] = useState(false)
  const { data, loading, error } = useCTFProfileDetailed(userId, ctfId, open)

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  if (error || !data) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">Error</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">{error || "Failed to load CTF performance data"}</p>
        </DialogContent>
      </Dialog>
    )
  }

  const getRankColor = (rank: number, total: number) => {
    const percentile = (rank / total) * 100
    if (percentile <= 10) return "text-certificate-gold"
    if (percentile <= 25) return "text-certificate-silver"
    if (percentile <= 50) return "text-certificate-bronze"
    return "text-muted-foreground"
  }

  const getPerformanceColor = (percentage: number) => {
    if (percentage >= 50) return "text-green-500"
    if (percentage >= 0) return "text-yellow-500"
    return "text-red-500"
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={data.user.avatar || "/placeholder.svg"} alt={data.user.displayName} />
              <AvatarFallback className="text-lg">{data.user.displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <DialogTitle className="text-2xl font-bold">{data.user.displayName}</DialogTitle>
              <p className="text-muted-foreground">@{data.user.username}</p>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="outline" className="gap-1">
                  <Target className="w-3 h-3" />
                  {data.ctfInfo.title}
                </Badge>
                <Badge variant="secondary">Weight: {data.ctfInfo.weight}</Badge>
              </div>
            </div>
            <div className="text-right">
              <div className={`text-3xl font-bold ${getRankColor(data.ctfRank, data.totalParticipants)}`}>
                #{data.ctfRank}
              </div>
              <p className="text-sm text-muted-foreground">of {data.totalParticipants} participants</p>
              <p className="text-xs text-muted-foreground">{data.percentile}th percentile</p>
            </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="solves">Solves</TabsTrigger>
            <TabsTrigger value="categories">Categories</TabsTrigger>
            <TabsTrigger value="comparison">Comparison</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Score</CardTitle>
                  <Trophy className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">{data.stats.score}</div>
                  <p className="text-xs text-muted-foreground">{data.stats.contributionToTotal}% of team total</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Solves</CardTitle>
                  <Target className="h-4 w-4 text-chart-2" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-chart-2">{data.stats.solveCount}</div>
                  <p className="text-xs text-muted-foreground">Avg {data.stats.averagePointsPerSolve} pts/solve</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Categories</CardTitle>
                  <Hash className="h-4 w-4 text-chart-3" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-chart-3">{data.stats.categoriesCount}</div>
                  <p className="text-xs text-muted-foreground">of {data.ctfOverview.totalCategories} available</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Rank</CardTitle>
                  <Medal className="h-4 w-4 text-chart-4" />
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${getRankColor(data.ctfRank, data.totalParticipants)}`}>
                    #{data.ctfRank}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Top {Math.round((data.ctfRank / data.totalParticipants) * 100)}%
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Achievements */}
            {data.achievementIds.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Award className="h-5 w-5 text-certificate-gold" />
                    Achievements
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {data.achievementIds.map((achievement) => (
                      <Badge key={achievement} variant="outline" className="gap-1">
                        <Star className="w-3 h-3 text-certificate-gold" />
                        {achievement.replace(/_/g, " ")}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* CTF Overview */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  CTF Overview
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Participants</p>
                    <p className="font-semibold">{data.ctfOverview.totalParticipants}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Total Solves</p>
                    <p className="font-semibold">{data.ctfOverview.totalSolves}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Avg Score</p>
                    <p className="font-semibold">{data.ctfOverview.averageScore}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Median Score</p>
                    <p className="font-semibold">{data.ctfOverview.medianScore}</p>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Categories</p>
                  <div className="flex flex-wrap gap-1">
                    {data.ctfOverview.categories.map((category) => (
                      <Badge key={category} variant="secondary" className="text-xs">
                        {category}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="solves" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  All Solves ({data.allSolves.length})
                </CardTitle>
                <CardDescription>Chronological list of all challenge solves</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {data.allSolves.map((solve, index) => (
                    <div key={index} className="flex items-center justify-between p-3 rounded-lg border">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium">{solve.challenge}</h4>
                          <Badge variant="outline">{solve.category}</Badge>
                          {solve.isTeamSolve && (
                            <Badge variant="secondary" className="gap-1">
                              <Users className="w-3 h-3" />
                              Team
                            </Badge>
                          )}
                        </div>
                        {solve.teammates.length > 0 && (
                          <p className="text-xs text-muted-foreground mt-1">With: {solve.teammates.join(", ")}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-primary">{solve.points} pts</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDistanceToNow(new Date(solve.solved_at), { addSuffix: true })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="categories" className="space-y-4">
            <div className="grid gap-4">
              {data.categoryBreakdown.map((category) => (
                <Card key={category.name}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="capitalize">{category.name}</CardTitle>
                      <Badge variant="outline">
                        #{category.rankInCategory} of {category.totalInCategory}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Solves</p>
                        <p className="text-2xl font-bold text-primary">{category.solves}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Total Score</p>
                        <p className="text-2xl font-bold text-chart-2">{category.totalScore}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Avg Points</p>
                        <p className="text-2xl font-bold text-chart-3">{category.avgPoints}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Percentile</p>
                        <p className="text-2xl font-bold text-certificate-gold">{category.percentile}%</p>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span>Category Performance</span>
                        <span>{category.percentile}%</span>
                      </div>
                      <Progress value={category.percentile} className="h-2" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="comparison" className="space-y-4">
            <div className="grid gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Performance vs Average
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Score Comparison</span>
                      <div className="text-right">
                        <div className="font-semibold">
                          {data.performanceComparison.scoreVsAverage.user} vs{" "}
                          {data.performanceComparison.scoreVsAverage.average}
                        </div>
                        <div
                          className={`text-sm ${getPerformanceColor(data.performanceComparison.scoreVsAverage.percentageDiff)}`}
                        >
                          {data.performanceComparison.scoreVsAverage.percentageDiff > 0 ? "+" : ""}
                          {data.performanceComparison.scoreVsAverage.percentageDiff}%
                        </div>
                      </div>
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Solves Comparison</span>
                      <div className="text-right">
                        <div className="font-semibold">
                          {data.performanceComparison.solvesVsAverage.user} vs{" "}
                          {data.performanceComparison.solvesVsAverage.average}
                        </div>
                        <div
                          className={`text-sm ${getPerformanceColor(data.performanceComparison.solvesVsAverage.percentageDiff)}`}
                        >
                          {data.performanceComparison.solvesVsAverage.percentageDiff > 0 ? "+" : ""}
                          {data.performanceComparison.solvesVsAverage.percentageDiff}%
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Performance vs Median
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Score vs Median</span>
                    <div className="text-right">
                      <div className="font-semibold">
                        {data.performanceComparison.scoreVsMedian.user} vs{" "}
                        {data.performanceComparison.scoreVsMedian.median}
                      </div>
                      <div
                        className={`text-sm ${getPerformanceColor(data.performanceComparison.scoreVsMedian.percentageDiff)}`}
                      >
                        {data.performanceComparison.scoreVsMedian.percentageDiff > 0 ? "+" : ""}
                        {data.performanceComparison.scoreVsMedian.percentageDiff}%
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Metadata
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Profile Generated</span>
                  <span>{formatDistanceToNow(new Date(data.metadata.profileGenerated), { addSuffix: true })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Data Source</span>
                  <span>{data.metadata.dataSource}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Scope</span>
                  <span>{data.metadata.scope}</span>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
