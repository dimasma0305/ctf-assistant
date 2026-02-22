import React, { useState } from "react"
import { Avatar, AvatarFallback, CachedAvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
    Trophy,
    Target,
    Star,
    AwardIcon,
    TrendingUp,
    ExternalLink,
} from "lucide-react"
import type { LeaderboardEntry, Achievement } from "@/lib/types"
import { calculatePercentile, getAchievements, getCategoryColor } from "@/lib/utils"
import { ScoreDisplay } from "@/components/score-display"
import Link from "next/link"
import { getUserInitials, getUserDisplayName, formatTimeAgo } from "@/lib/format-helpers"

interface CategoryStat {
    name: string
    solves: number
    totalScore: number
    avgPoints: number
    rankInCategory?: number
    percentile?: number
}

const UserProfileComponent = ({ user, leaderboardTotal }: { user: LeaderboardEntry; leaderboardTotal: number }) => {
    const [selectedTab, setSelectedTab] = useState("overview")

    const calculateCategoryBreakdown = (): CategoryStat[] => {
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
    const achievements: Achievement[] = getAchievements(user.achievementIds || [])
    const averageScorePerSolve = user.solveCount > 0 ? user.totalScore / user.solveCount : 0
    const averageSolvesPerCTF = user.ctfCount > 0 ? user.solveCount / user.ctfCount : 0

    return (
        <div className="flex flex-col h-full">
            <div className="p-4 sm:p-6 border-b border-primary/20 bg-gradient-to-r from-primary/5 to-transparent flex-shrink-0">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    {/* Left side - User info */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
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
                                #{user.rank}
                            </div>
                        </div>

                        <div className="min-w-0 flex-1 space-y-3">
                            <h2 className="text-xl sm:text-2xl font-bold leading-tight text-primary">
                                {getUserDisplayName(user.user)}
                            </h2>

                            <div className="flex flex-col sm:flex-row gap-2">
                                <div className="flex items-center gap-2 px-3 py-2 bg-primary/15 text-sm">
                                    <Trophy className="w-4 h-4 text-primary" />
                                    <span className="font-medium">Rank #{user.rank}</span>
                                </div>
                                <Badge variant="secondary" className="w-fit bg-chart-2/20 text-chart-2">
                                    Top {calculatePercentile(user.rank, leaderboardTotal)}%
                                </Badge>
                            </div>
                        </div>
                    </div>

                    {/* Right side - View Full Profile button */}
                    <div className="flex flex-row sm:flex-col items-center sm:items-end gap-3 w-full sm:w-auto">
                        <Link href={`/profile/${user.user.userId}`} className="block">
                            <Button
                                variant="outline"
                                size="sm"
                                className="flex items-center gap-2 hover:bg-primary/10 border-primary/20 bg-transparent text-xs sm:text-sm"
                            >
                                <ExternalLink className="w-3 h-3 sm:w-4 sm:h-4" />
                                <span className="hidden sm:inline">View Full Profile</span>
                                <span className="sm:hidden">Profile</span>
                            </Button>
                        </Link>
                        <div className="text-right text-sm">
                            <ScoreDisplay score={user.totalScore} className="text-xl sm:text-2xl text-primary block" />
                            <div className="text-xs text-muted-foreground">Total Score</div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col p-4 sm:p-6">
                <Tabs
                    value={selectedTab}
                    onValueChange={setSelectedTab}
                    className="w-full flex-1 overflow-hidden flex flex-col"
                >
                    <TabsList className="grid w-full grid-cols-4 h-12 mb-6 p-1 flex-shrink-0 bg-muted/50">
                        <TabsTrigger
                            value="overview"
                            className="text-xs px-2 min-w-0 h-10 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                            onClick={(e) => {
                                e.stopPropagation()
                            }}
                        >
                            <Target className="w-4 h-4 mr-1 flex-shrink-0" />
                            <span className="truncate">Stats</span>
                        </TabsTrigger>
                        <TabsTrigger
                            value="categories"
                            className="text-xs px-2 min-w-0 h-10 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                            onClick={(e) => {
                                e.stopPropagation()
                            }}
                        >
                            <Star className="w-4 h-4 mr-1 flex-shrink-0" />
                            <span className="truncate">Skills</span>
                        </TabsTrigger>
                        <TabsTrigger
                            value="achievements"
                            className="text-xs px-2 min-w-0 h-10 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                            onClick={(e) => {
                                e.stopPropagation()
                            }}
                        >
                            <AwardIcon className="w-4 h-4 mr-1 flex-shrink-0" />
                            <span className="truncate">Awards</span>
                        </TabsTrigger>
                        <TabsTrigger
                            value="activity"
                            className="text-xs px-2 min-w-0 h-10 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                            onClick={(e) => {
                                e.stopPropagation()
                            }}
                        >
                            <TrendingUp className="w-4 h-4 mr-1 flex-shrink-0" />
                            <span className="truncate">Recent</span>
                        </TabsTrigger>
                    </TabsList>

                    <div className="flex-1 overflow-y-auto">
                        <TabsContent value="overview" className="space-y-6 mt-0">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                                <div className="bg-gradient-to-br from-primary/10 to-primary/5 p-3 sm:p-4 text-center">
                                    <ScoreDisplay score={user.totalScore} className="text-lg sm:text-2xl text-primary mb-1 block break-all" />
                                    <div className="text-xs text-muted-foreground">Total Score</div>
                                </div>

                                <div className="bg-gradient-to-br from-chart-3/10 to-chart-3/5 p-3 sm:p-4 text-center">
                                    <div className="text-lg sm:text-2xl font-bold text-chart-3 mb-1">{user.solveCount}</div>
                                    <div className="text-xs text-muted-foreground">Challenges</div>
                                </div>

                                <div className="bg-gradient-to-br from-chart-2/10 to-chart-2/5 p-3 sm:p-4 text-center">
                                    <div className="text-lg sm:text-2xl font-bold text-chart-2 mb-1">{user.ctfCount}</div>
                                    <div className="text-xs text-muted-foreground">CTFs</div>
                                </div>

                                <div className="bg-gradient-to-br from-chart-4/10 to-chart-4/5 p-3 sm:p-4 text-center">
                                    <div className="text-lg sm:text-2xl font-bold text-chart-4 mb-1">{user.categories.length}</div>
                                    <div className="text-xs text-muted-foreground">Categories</div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="p-4">
                                    <div className="space-y-2">
                                        <div className="text-sm font-medium text-muted-foreground">Avg Score per Solve</div>
                                        <ScoreDisplay score={averageScorePerSolve} className="text-2xl text-primary block" />
                                        <div className="text-sm text-green-600">
                                            {averageScorePerSolve > 15 ? "Above average" : "Improving"}
                                        </div>
                                    </div>
                                </div>

                                <div className="p-4">
                                    <div className="space-y-2">
                                        <div className="text-sm font-medium text-muted-foreground">Avg Solves per CTF</div>
                                        <div className="text-2xl font-bold text-primary">{averageSolvesPerCTF.toFixed(0)}</div>
                                        <div className="text-sm text-green-600">
                                            {averageSolvesPerCTF > 5 ? "Consistent performer" : "Growing"}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="categories" className="space-y-4 mt-0">
                            <div className="space-y-3">
                                {categoryBreakdown.map((category) => (
                                    <div key={category.name} className="p-4">
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                                    <div className={`w-3 h-3 rounded-full ${getCategoryColor(category.name)}`} />
                                                    <span className="font-medium capitalize">{category.name}</span>
                                                </div>
                                                <div className="text-sm text-muted-foreground">
                                                    {category.solves} solve{category.solves !== 1 ? "s" : ""}
                                                </div>
                                            </div>
                                            <Progress
                                                value={user.solveCount > 0 ? (category.solves / user.solveCount) * 100 : 0}
                                                className="h-2"
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </TabsContent>

                        <TabsContent value="achievements" className="space-y-4 mt-0">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {achievements.map((achievement) => (
                                    <div key={achievement.name} className="p-4">
                                        <div className="flex items-center gap-3">
                                            <div className="text-2xl flex-shrink-0">{achievement.icon}</div>
                                            <div className="min-w-0 flex-1">
                                                <div className="font-medium text-foreground mb-1">{achievement.name}</div>
                                                <div className="text-sm text-muted-foreground">{achievement.description}</div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </TabsContent>

                        <TabsContent value="activity" className="space-y-3 mt-0">
                            <div className="space-y-2">
                                {user.recentSolves.length > 0 ? (
                                    user.recentSolves.map((activity, index) => (
                                        <div key={index} className="p-3">
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
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-center py-8">
                                        <div className="text-muted-foreground">No recent activity available</div>
                                    </div>
                                )}
                            </div>
                        </TabsContent>
                    </div>
                </Tabs>
            </div>
        </div>
    )
}

export const UserProfileContent = React.memo(UserProfileComponent)
