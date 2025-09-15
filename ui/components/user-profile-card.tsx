"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Trophy, TrendingUp } from "lucide-react"

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
}

interface UserProfile {
  rank: number
  userId: string
  totalScore: number
  solveCount: number
  ctfCount: number
  categories: string[]
  recentSolves: Array<{
    ctf_id: string
    challenge: string
    category: string
    points: number
    solved_at: string
  }>
}

export function UserProfileCard({ user }: { user: UserProfile }) {
  const [selectedTab, setSelectedTab] = useState("overview")

  const categoryBreakdown: CategoryStat[] = user.categories.map((category) => ({
    name: category,
    solves: Math.floor(user.solveCount / user.categories.length) + Math.floor(Math.random() * 10),
    totalPoints: Math.floor(user.totalScore / user.categories.length) + Math.floor(Math.random() * 100),
    avgPoints: 20 + Math.floor(Math.random() * 15),
  }))

  const achievements: Achievement[] = [
    ...(user.solveCount >= 100 ? [{ name: "Century Solver", description: "Solved 100+ challenges", icon: "🎯" }] : []),
    ...(user.ctfCount >= 10 ? [{ name: "CTF Explorer", description: "Participated in 10+ CTFs", icon: "🗺️" }] : []),
    ...(user.categories.length >= 5
      ? [{ name: "Well Rounded", description: "Solved challenges in 5+ categories", icon: "🌟" }]
      : []),
    ...(user.rank <= 3
      ? [
          {
            name: "Podium Finisher",
            description: `Global rank #${user.rank}`,
            icon: user.rank === 1 ? "🥇" : user.rank === 2 ? "🥈" : "🥉",
          },
        ]
      : []),
    ...(user.rank <= 10 ? [{ name: "Elite Player", description: "Top 10 global ranking", icon: "⭐" }] : []),
  ]

  const getUserInitials = (userId: string) => {
    return userId.replace("user_", "").toUpperCase().slice(0, 2)
  }

  const formatScore = (score: number) => {
    return score.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  }

  const getPercentile = (rank: number, total = 1247) => {
    return Math.round((1 - (rank - 1) / total) * 100)
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

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <Avatar className="w-16 h-16 flex-shrink-0">
              <AvatarImage src={`/abstract-geometric-shapes.png?key=profile&height=64&width=64&query=${user.userId}`} />
              <AvatarFallback className="text-lg bg-primary/20 text-foreground font-medium">
                {getUserInitials(user.userId)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-2xl font-[family-name:var(--font-playfair)] truncate">
                {user.userId.replace("user_", "Player ")}
              </CardTitle>
              <CardDescription className="flex items-center gap-2 mt-1 flex-wrap">
                <Trophy className="w-4 h-4 flex-shrink-0" />
                <span className="whitespace-nowrap">Rank #{user.rank} of 1,247</span>
                <Badge variant="secondary" className="text-foreground whitespace-nowrap">
                  Top {getPercentile(user.rank)}%
                </Badge>
              </CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
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
            {/* Key Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="text-lg sm:text-xl lg:text-2xl font-bold text-primary break-all">
                  {formatScore(user.totalScore)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">Total Score</div>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="text-xl lg:text-2xl font-bold text-primary">{user.solveCount}</div>
                <div className="text-xs text-muted-foreground mt-1">Challenges Solved</div>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="text-xl lg:text-2xl font-bold text-primary">{user.ctfCount}</div>
                <div className="text-xs text-muted-foreground mt-1">CTFs Participated</div>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="text-xl lg:text-2xl font-bold text-primary">{user.categories.length}</div>
                <div className="text-xs text-muted-foreground mt-1">Categories</div>
              </div>
            </div>

            {/* Performance Metrics */}
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
          </TabsContent>

          <TabsContent value="categories" className="space-y-4 mt-6">
            <div className="space-y-4">
              {categoryBreakdown.map((category) => (
                <div key={category.name} className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className={`w-3 h-3 rounded-full flex-shrink-0 ${getCategoryColor(category.name)}`} />
                      <span className="font-medium capitalize truncate">{category.name}</span>
                    </div>
                    <div className="text-sm text-muted-foreground whitespace-nowrap">
                      {category.solves} solves • {category.totalPoints} pts
                    </div>
                  </div>
                  <Progress value={(category.solves / user.solveCount) * 100} className="h-2" />
                  <div className="text-xs text-muted-foreground">Average: {category.avgPoints} points per solve</div>
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
              {user.recentSolves.length > 0 ? (
                user.recentSolves.map((activity, index) => (
                  <Card key={index} className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${getCategoryColor(activity.category)}`} />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate">{activity.challenge}</div>
                          <div className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-xs">
                              {activity.category}
                            </Badge>
                            <span>{activity.points} points</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground whitespace-nowrap">
                        {formatTimeAgo(activity.solved_at)}
                      </div>
                    </div>
                  </Card>
                ))
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
