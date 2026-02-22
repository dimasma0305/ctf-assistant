import React from "react"
import { Trophy, Award, CheckCircle2, Target, BarChart3, Clock, ExternalLink, TrendingUp } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, CachedAvatarImage } from "@/components/ui/avatar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import type { CTFProfileResponse } from "@/lib/types"
import { getAchievements } from "@/lib/utils"

const CTFProfileComponent = ({ selectedUser }: { selectedUser: CTFProfileResponse }) => {
    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="p-4 sm:p-6 border-b border-primary/20 bg-gradient-to-r from-primary/5 to-transparent flex-shrink-0">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    {/* Left side - User info */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                        <Avatar className="h-16 w-16 sm:h-20 sm:w-20 flex-shrink-0 ring-4 ring-primary/30 shadow-lg">
                            <CachedAvatarImage
                                src={
                                    selectedUser.user.avatar ||
                                    `/abstract-geometric-shapes.png?height=80&width=80&query=${selectedUser.user.userId}`
                                }
                                loadingPlaceholder={
                                    <div className="w-4 h-4 border border-muted-foreground border-t-transparent rounded-full animate-spin" />
                                }
                            />
                            <AvatarFallback className="bg-primary/20 text-foreground text-lg sm:text-xl">
                                {(selectedUser.user.displayName || selectedUser.user.username).substring(0, 2).toUpperCase()}
                            </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                            <h2 className="text-xl sm:text-2xl font-bold text-primary font-[family-name:var(--font-outfit)] mb-2 line-clamp-2">
                                {selectedUser.user.displayName || selectedUser.user.username}
                            </h2>
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                                <div className="flex items-center gap-2 text-sm">
                                    <Trophy className="w-4 h-4 text-yellow-500" />
                                    <span className="font-semibold">Rank #{selectedUser.ctfRank}</span>
                                    <span className="text-muted-foreground hidden sm:inline">
                                        of {selectedUser.totalParticipants}
                                    </span>
                                </div>
                                <Badge variant="secondary" className="text-foreground bg-primary/10 border-primary/20 text-xs">
                                    Top {Math.round((selectedUser.ctfRank / selectedUser.totalParticipants) * 100)}%
                                </Badge>
                            </div>
                        </div>
                    </div>

                    {/* Right side - Quick stats and action */}
                    <div className="flex flex-row sm:flex-col items-center sm:items-end gap-3 w-full sm:w-auto">
                        <Button
                            variant="outline"
                            size="sm"
                            className="flex items-center gap-2 hover:bg-primary/10 border-primary/20 bg-transparent text-xs sm:text-sm"
                            onClick={() => {
                                window.open(`/profile/${selectedUser.user.userId}`, "_blank")
                            }}
                        >
                            <ExternalLink className="w-3 h-3 sm:w-4 sm:h-4" />
                            <span className="hidden sm:inline">View Full Profile</span>
                            <span className="sm:hidden">Profile</span>
                        </Button>
                        <div className="text-right text-sm">
                            <div className="font-bold text-xl sm:text-2xl text-primary">
                                {selectedUser.stats.score.toFixed(1)}
                            </div>
                            <div className="text-xs text-muted-foreground">Total Score</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden flex flex-col p-4 sm:p-6">
                <Tabs defaultValue="overview" className="w-full flex flex-col h-full">
                    <div className="flex-shrink-0 overflow-x-auto">
                        <TabsList className="grid w-full grid-cols-4 mb-4 min-w-[400px]">
                            <TabsTrigger value="overview" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
                                <Trophy className="w-4 h-4 sm:w-5 sm:h-5" />
                                <span className="hidden sm:inline">Overview</span>
                                <span className="sm:hidden">Stats</span>
                            </TabsTrigger>
                            <TabsTrigger value="solves" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
                                <CheckCircle2 className="w-3 h-3 sm:w-4 sm:h-4" />
                                Solves
                            </TabsTrigger>
                            <TabsTrigger value="categories" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
                                <Target className="w-3 h-3 sm:w-4 sm:h-4" />
                                <span className="hidden sm:inline">Categories</span>
                                <span className="sm:hidden">Cats</span>
                            </TabsTrigger>
                            <TabsTrigger value="comparison" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
                                <BarChart3 className="w-3 h-3 sm:w-4 sm:h-4" />
                                <span className="hidden sm:inline">Comparison</span>
                                <span className="sm:hidden">Comp</span>
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        <TabsContent value="overview" className="space-y-4 sm:space-y-6 mt-0">
                            {/* Performance Overview */}
                            <div>
                                <h4 className="font-semibold mb-3 sm:mb-4 text-primary flex items-center gap-2 text-sm sm:text-base">
                                    <Trophy className="w-4 h-4 sm:w-5 sm:h-5" />
                                    Performance Overview
                                </h4>
                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                                    <Card className="bg-gradient-to-br from-chart-3/10 to-chart-3/5 border border-chart-3/20">
                                        <CardContent className="p-3 sm:p-4 text-center">
                                            <div className="text-xl sm:text-2xl font-bold text-chart-3 mb-1">
                                                {selectedUser.stats.solveCount}
                                            </div>
                                            <div className="text-xs text-muted-foreground">Challenges</div>
                                        </CardContent>
                                    </Card>
                                    <Card className="bg-gradient-to-br from-chart-2/10 to-chart-2/5 border border-chart-2/20">
                                        <CardContent className="p-3 sm:p-4 text-center">
                                            <div className="text-xl sm:text-2xl font-bold text-chart-2 mb-1">
                                                {selectedUser.stats.categoriesCount}
                                            </div>
                                            <div className="text-xs text-muted-foreground">Categories</div>
                                        </CardContent>
                                    </Card>
                                    <Card className="bg-gradient-to-br from-chart-4/10 to-chart-4/5 border border-chart-4/20">
                                        <CardContent className="p-3 sm:p-4 text-center">
                                            <div className="text-xl sm:text-2xl font-bold text-chart-4 mb-1">
                                                {selectedUser.stats.averagePointsPerSolve.toFixed(0)}
                                            </div>
                                            <div className="text-xs text-muted-foreground">Avg Points</div>
                                        </CardContent>
                                    </Card>
                                    <Card className="bg-gradient-to-br from-chart-1/10 to-chart-1/5 border border-chart-1/20">
                                        <CardContent className="p-3 sm:p-4 text-center">
                                            <div className="text-xl sm:text-2xl font-bold text-chart-1 mb-1">
                                                {selectedUser.stats.contributionToTotal.toFixed(1)}%
                                            </div>
                                            <div className="text-xs text-muted-foreground">Contribution</div>
                                        </CardContent>
                                    </Card>
                                </div>
                            </div>

                            {/* Achievements */}
                            <div>
                                <h4 className="font-semibold mb-3 sm:mb-4 text-primary flex items-center gap-2 text-sm sm:text-base">
                                    <Award className="w-4 h-4 sm:w-5 sm:h-5" />
                                    Achievements ({getAchievements(selectedUser.achievementIds).length})
                                </h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {getAchievements(selectedUser.achievementIds).map((achievement, index) => (
                                        <Card
                                            key={`${achievement.id || achievement.name}-${index}`}
                                            className="p-3 border border-primary/10 hover:border-primary/20 transition-colors bg-gradient-to-br from-primary/5 to-transparent"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="text-lg sm:text-xl flex-shrink-0">{achievement.icon}</div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="font-medium text-sm leading-tight">{achievement.name}</div>
                                                    <div className="text-xs text-muted-foreground line-clamp-2">
                                                        {achievement.description}
                                                    </div>
                                                </div>
                                            </div>
                                        </Card>
                                    ))}
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="solves" className="space-y-4 mt-0">
                            <div>
                                <h4 className="font-semibold mb-3 sm:mb-4 text-primary flex items-center gap-2 text-sm sm:text-base">
                                    <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" />
                                    All Solves ({selectedUser.allSolves.length})
                                </h4>
                                <div className="space-y-3">
                                    {selectedUser.allSolves
                                        .sort((a, b) => new Date(b.solved_at).getTime() - new Date(a.solved_at).getTime())
                                        .map((solve, index) => (
                                            <Card key={index} className="p-3 sm:p-4 hover:bg-muted/50 transition-colors">
                                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                                    <div className="flex items-start gap-3 min-w-0 flex-1">
                                                        <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                                                        <div className="min-w-0 flex-1">
                                                            <div className="font-medium text-sm sm:text-base line-clamp-2">
                                                                {solve.challenge}
                                                            </div>
                                                            <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-xs sm:text-sm text-muted-foreground mt-1">
                                                                <Badge variant="outline" className="capitalize w-fit text-xs">
                                                                    {solve.category}
                                                                </Badge>
                                                                <span className="flex items-center gap-1">
                                                                    <Clock className="w-3 h-3" />
                                                                    <span className="hidden sm:inline">
                                                                        {new Date(solve.solved_at).toLocaleString()}
                                                                    </span>
                                                                    <span className="sm:hidden">
                                                                        {new Date(solve.solved_at).toLocaleDateString()}
                                                                    </span>
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center justify-between sm:justify-end gap-3">
                                                        <div className="text-right">
                                                            <div className="text-lg sm:text-2xl font-bold text-primary">{solve.points}</div>
                                                            <div className="text-sm text-muted-foreground">points</div>
                                                        </div>
                                                        {solve.isTeamSolve && (
                                                            <Badge variant="secondary" className="text-xs">
                                                                Team
                                                            </Badge>
                                                        )}
                                                    </div>
                                                </div>
                                                {solve.teammates && solve.teammates.length > 0 && (
                                                    <div className="mt-3 pt-3 border-t border-muted">
                                                        <div className="text-xs sm:text-sm text-muted-foreground">
                                                            Solved with: {solve.teammates.join(", ")}
                                                        </div>
                                                    </div>
                                                )}
                                            </Card>
                                        ))}
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="categories" className="space-y-4 mt-0">
                            <div>
                                <h4 className="font-semibold mb-3 sm:mb-4 text-primary flex items-center gap-2 text-sm sm:text-base">
                                    <Target className="w-4 h-4 sm:w-5 sm:h-5" />
                                    Category Performance
                                </h4>
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                    {selectedUser.categoryBreakdown.map((category) => (
                                        <Card key={category.name} className="p-4">
                                            <div className="flex items-center justify-between mb-4">
                                                <Badge variant="outline" className="capitalize font-medium px-3 py-1 text-xs sm:text-sm">
                                                    {category.name}
                                                </Badge>
                                                <div className="text-right">
                                                    <div className="text-lg sm:text-2xl font-bold text-chart-3">{category.totalScore}</div>
                                                    <div className="text-sm text-muted-foreground">points</div>
                                                </div>
                                            </div>

                                            <div className="space-y-3">
                                                <div className="flex items-center justify-between text-sm">
                                                    <span className="text-muted-foreground">Rank:</span>
                                                    <span className="font-medium">
                                                        #{category.rankInCategory} of {category.totalInCategory}
                                                    </span>
                                                </div>

                                                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-muted">
                                                    <div className="text-center">
                                                        <div className="text-lg sm:text-2xl font-bold text-chart-3">{category.solves}</div>
                                                        <div className="text-sm text-muted-foreground">Solves</div>
                                                    </div>
                                                    <div className="text-center">
                                                        <div className="text-lg sm:text-2xl font-bold text-chart-2">
                                                            {category.avgPoints.toFixed(1)}
                                                        </div>
                                                        <div className="text-sm text-muted-foreground">Avg Points</div>
                                                    </div>
                                                </div>
                                            </div>
                                        </Card>
                                    ))}
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="comparison" className="space-y-4 mt-0">
                            <div>
                                <h4 className="font-semibold mb-3 sm:mb-4 text-primary flex items-center gap-2 text-sm sm:text-base">
                                    <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" />
                                    Performance Comparison
                                </h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {/* Score vs Average */}
                                    <Card className="p-4">
                                        <div className="flex items-center justify-between mb-3">
                                            <h5 className="font-medium text-sm sm:text-base">Score vs Average</h5>
                                            <Badge
                                                variant={
                                                    selectedUser.performanceComparison.scoreVsAverage.percentageDiff > 0
                                                        ? "default"
                                                        : "secondary"
                                                }
                                                className={
                                                    selectedUser.performanceComparison.scoreVsAverage.percentageDiff > 0
                                                        ? "bg-green-500/20 text-green-400 border-green-500/30"
                                                        : ""
                                                }
                                            >
                                                {selectedUser.performanceComparison.scoreVsAverage.percentageDiff > 0 ? "+" : ""}
                                                {selectedUser.performanceComparison.scoreVsAverage.percentageDiff}%
                                            </Badge>
                                        </div>
                                        <div className="space-y-2">
                                            <div className="flex justify-between text-sm">
                                                <span>Your Score:</span>
                                                <span className="font-bold text-primary">
                                                    {selectedUser.performanceComparison.scoreVsAverage.user}
                                                </span>
                                            </div>
                                            <div className="flex justify-between text-sm text-muted-foreground">
                                                <span>Average:</span>
                                                <span>{selectedUser.performanceComparison.scoreVsAverage.average}</span>
                                            </div>
                                        </div>
                                    </Card>

                                    {/* Score vs Median */}
                                    <Card className="p-4">
                                        <div className="flex items-center justify-between mb-3">
                                            <h5 className="font-medium text-sm sm:text-base">Score vs Median</h5>
                                            <Badge
                                                variant={
                                                    selectedUser.performanceComparison.scoreVsMedian.percentageDiff > 0
                                                        ? "default"
                                                        : "secondary"
                                                }
                                                className={
                                                    selectedUser.performanceComparison.scoreVsMedian.percentageDiff > 0
                                                        ? "bg-green-500/20 text-green-400 border-green-500/30"
                                                        : ""
                                                }
                                            >
                                                {selectedUser.performanceComparison.scoreVsMedian.percentageDiff > 0 ? "+" : ""}
                                                {selectedUser.performanceComparison.scoreVsMedian.percentageDiff}%
                                            </Badge>
                                        </div>
                                        <div className="space-y-2">
                                            <div className="flex justify-between text-sm">
                                                <span>Your Score:</span>
                                                <span className="font-bold text-primary">
                                                    {selectedUser.performanceComparison.scoreVsMedian.user}
                                                </span>
                                            </div>
                                            <div className="flex justify-between text-sm text-muted-foreground">
                                                <span>Median:</span>
                                                <span>{selectedUser.performanceComparison.scoreVsMedian.median}</span>
                                            </div>
                                        </div>
                                    </Card>

                                    {/* Solves vs Average */}
                                    <Card className="p-4 sm:col-span-2">
                                        <div className="flex items-center justify-between mb-3">
                                            <h5 className="font-medium text-sm sm:text-base">Solves vs Average</h5>
                                            <Badge
                                                variant={
                                                    selectedUser.performanceComparison.solvesVsAverage.percentageDiff > 0
                                                        ? "default"
                                                        : "secondary"
                                                }
                                                className={
                                                    selectedUser.performanceComparison.solvesVsAverage.percentageDiff > 0
                                                        ? "bg-green-500/20 text-green-400 border-green-500/30"
                                                        : ""
                                                }
                                            >
                                                {selectedUser.performanceComparison.solvesVsAverage.percentageDiff > 0 ? "+" : ""}
                                                {selectedUser.performanceComparison.solvesVsAverage.percentageDiff}%
                                            </Badge>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="text-center">
                                                <div className="text-xl sm:text-2xl font-bold text-primary">
                                                    {selectedUser.performanceComparison.solvesVsAverage.user}
                                                </div>
                                                <div className="text-sm text-muted-foreground">Your Solves</div>
                                            </div>
                                            <div className="text-center">
                                                <div className="text-xl sm:text-2xl font-bold text-muted-foreground">
                                                    {selectedUser.performanceComparison.solvesVsAverage.average}
                                                </div>
                                                <div className="text-sm text-muted-foreground">Average</div>
                                            </div>
                                        </div>
                                    </Card>
                                </div>
                            </div>
                        </TabsContent>
                    </div>
                </Tabs>
            </div>
        </div>
    )
}

export const CTFProfileContent = React.memo(CTFProfileComponent)
