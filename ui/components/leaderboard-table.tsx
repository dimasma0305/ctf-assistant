"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, CachedAvatarImage } from "@/components/ui/avatar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Trophy, Medal, Award, ChevronLeft, ChevronRight, Filter, AlertCircle, Calendar, Users } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { UserProfileCard } from "@/components/user-profile-card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { SearchLeaderboard } from "@/components/search-leaderboard"
import { useScoreboard } from "@/hooks/useAPI"
import type { LeaderboardEntry } from "@/lib/types"
import { calculatePercentile } from "@/lib/utils"

export function LeaderboardTable() {
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [selectedCtf, setSelectedCtf] = useState<string>("global")
  const [selectedUser, setSelectedUser] = useState<LeaderboardEntry | null>(null)
  const [showUserProfile, setShowUserProfile] = useState(false)
  const [timePeriod, setTimePeriod] = useState<string>("all-time")

  const {
    data: leaderboardData,
    loading,
    error,
    updateParams,
  } = useScoreboard({
    limit: pageSize,
    offset: 0,
    global: true,
  })

  const formatScore = (score: number) => {
    return score.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  }

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

  const memoizedTimePeriodOptions = useMemo(() => {
    const options = [{ value: "all-time", label: "All Time" }]

    if (leaderboardData?.metadata) {
      const { availableYears, availableMonths } = leaderboardData.metadata

      if (availableYears && availableYears.length > 0) {
        availableYears.forEach((year) => {
          options.push({
            value: `year-${year}`,
            label: `${year}`,
          })
        })
      }

      if (availableMonths && availableMonths.length > 0) {
        availableMonths.slice(0, 12).forEach((month) => {
          const [year, monthNum] = month.split("-")
          const monthName = new Date(Number.parseInt(year), Number.parseInt(monthNum) - 1).toLocaleString("default", {
            month: "long",
          })
          options.push({
            value: `month-${month}`,
            label: `${monthName} ${year}`,
          })
        })
      }
    }

    return options
  }, [leaderboardData?.metadata])

  const handleUserClick = useCallback((user: LeaderboardEntry) => {
    setSelectedUser(user)
    setShowUserProfile(true)
  }, [])

  const formattedLeaderboardData = useMemo(() => {
    if (!leaderboardData?.data) return []

    return leaderboardData.data.map((entry) => ({
      ...entry,
      formattedScore: formatScore(entry.totalScore),
      userInitials: getUserInitials(entry.user),
      displayName: getUserDisplayName(entry.user),
      skillLevel: entry.rank <= 10 ? "Elite" : entry.rank <= 50 ? "Advanced" : "Intermediate",
      percentile: calculatePercentile(entry.rank, leaderboardData?.metadata.total || 1000),
    }))
  }, [leaderboardData])

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    const timeParams = getTimeParams(timePeriod)
    updateParams({
      offset: (page - 1) * pageSize,
      limit: pageSize,
      global: selectedCtf === "global",
      ctf_id: selectedCtf !== "global" ? selectedCtf : undefined,
      ...timeParams,
    })
  }

  const handleCtfChange = (ctfId: string) => {
    setSelectedCtf(ctfId)
    setCurrentPage(1)
    const timeParams = getTimeParams(timePeriod)
    updateParams({
      offset: 0,
      limit: pageSize,
      global: ctfId === "global",
      ctf_id: ctfId !== "global" ? ctfId : undefined,
      ...timeParams,
    })
  }

  useEffect(() => {
    const initializeFromHash = () => {
      const hash = window.location.hash.slice(1)
      console.log("[v0] Initializing from hash:", hash)

      if (!hash) return

      if (hash === "leaderboard") {
        setTimePeriod("all-time")
        return
      }

      const validPeriods = ["all-time", "this-month", "last-month", "this-year", "last-year"]
      const isDynamicMonth = hash.startsWith("month-") && hash.match(/^month-\d{4}-\d{2}$/)
      const isDynamicYear = hash.startsWith("year-") && hash.match(/^year-\d{4}$/)

      if (validPeriods.includes(hash) || isDynamicMonth || isDynamicYear) {
        console.log("[v0] Setting initial time period to:", hash)
        setTimePeriod(hash)
        setCurrentPage(1)
      }
    }

    initializeFromHash()
  }, [])

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1)
      console.log("[v0] Hash changed to:", hash)

      const validPeriods = ["all-time", "this-month", "last-month", "this-year", "last-year"]
      const isDynamicMonth = hash.startsWith("month-") && hash.match(/^month-\d{4}-\d{2}$/)
      const isDynamicYear = hash.startsWith("year-") && hash.match(/^year-\d{4}$/)

      if (validPeriods.includes(hash) || isDynamicMonth || isDynamicYear) {
        console.log("[v0] Setting time period to:", hash)
        setTimePeriod(hash)
        setCurrentPage(1)
        const timeParams = getTimeParams(hash)
        updateParams({
          offset: 0,
          limit: pageSize,
          global: selectedCtf === "global",
          ctf_id: selectedCtf !== "global" ? selectedCtf : undefined,
          ...timeParams,
        })
      }
    }

    window.addEventListener("hashchange", handleHashChange)
    return () => window.removeEventListener("hashchange", handleHashChange)
  }, [selectedCtf, pageSize, updateParams])

  useEffect(() => {
    if (timePeriod) {
      console.log("[v0] Time period changed, updating API params:", timePeriod)
      const timeParams = getTimeParams(timePeriod)
      updateParams({
        offset: (currentPage - 1) * pageSize,
        limit: pageSize,
        global: selectedCtf === "global",
        ctf_id: selectedCtf !== "global" ? selectedCtf : undefined,
        ...timeParams,
      })
    }
  }, [timePeriod, currentPage, pageSize, selectedCtf, updateParams])

  const handleTimePeriodChange = (period: string) => {
    setTimePeriod(period)
    setCurrentPage(1)

    if (period === "all-time") {
      window.location.hash = "leaderboard"
    } else {
      window.location.hash = period
    }
  }

  const getTimeParams = (period: string) => {
    if (period.startsWith("month-")) {
      const monthValue = period.replace("month-", "")
      return { month: monthValue }
    } else if (period.startsWith("year-")) {
      const yearValue = Number.parseInt(period.replace("year-", ""))
      return { year: yearValue }
    }

    const now = new Date()
    switch (period) {
      case "this-month":
        return { month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}` }
      case "last-month":
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        return { month: `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}` }
      case "this-year":
        return { year: now.getFullYear() }
      case "last-year":
        return { year: now.getFullYear() - 1 }
      default:
        return {}
    }
  }

  const getTimePeriodText = (period: string) => {
    if (period.startsWith("month-")) {
      const monthValue = period.replace("month-", "")
      const [year, monthNum] = monthValue.split("-")
      const monthName = new Date(Number.parseInt(year), Number.parseInt(monthNum) - 1).toLocaleString("default", {
        month: "long",
      })
      return `${monthName} ${year}`
    } else if (period.startsWith("year-")) {
      const yearValue = period.replace("year-", "")
      return yearValue
    }

    const now = new Date()
    switch (period) {
      case "this-month":
        return `${now.toLocaleString("default", { month: "long" })} ${now.getFullYear()}`
      case "last-month":
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        return `${lastMonth.toLocaleString("default", { month: "long" })} ${lastMonth.getFullYear()}`
      case "this-year":
        return `${now.getFullYear()}`
      case "last-year":
        return `${now.getFullYear() - 1}`
      default:
        return "All Time"
    }
  }

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Trophy className="w-5 h-5 text-yellow-500" />
      case 2:
        return <Medal className="w-5 h-5 text-gray-400" />
      case 3:
        return <Award className="w-5 h-5 text-amber-600" />
      default:
        return (
          <span className="w-5 h-5 flex items-center justify-center text-sm font-bold text-muted-foreground">
            #{rank}
          </span>
        )
    }
  }

  const totalPages = leaderboardData ? Math.ceil(leaderboardData.metadata.total / pageSize) : 0

  const getTimePeriodOptions = () => memoizedTimePeriodOptions

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-8 w-48 bg-muted animate-pulse rounded" />
          <div className="h-8 w-32 bg-muted animate-pulse rounded" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 bg-muted animate-pulse rounded" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Failed to load leaderboard data: {error}</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
          <div className="flex-1 max-w-md">
            <SearchLeaderboard onUserClick={handleUserClick} />
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full lg:w-auto">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Calendar className="w-4 h-4 text-primary" />
              </div>
              <Select value={timePeriod} onValueChange={handleTimePeriodChange}>
                <SelectTrigger className="w-full sm:w-48 h-10">
                  <SelectValue placeholder="Time Period" />
                </SelectTrigger>
                <SelectContent>
                  {getTimePeriodOptions().map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="p-2 bg-chart-3/10 rounded-lg">
                <Filter className="w-4 h-4 text-chart-3" />
              </div>
              <Select value={selectedCtf} onValueChange={handleCtfChange}>
                <SelectTrigger className="w-full sm:w-48 h-10">
                  <SelectValue placeholder="Select CTF" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Global Rankings</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {timePeriod !== "all-time" && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4 bg-primary/5 border border-primary/20 rounded-lg">
            <div className="flex items-center gap-2">
              <div className="p-1 bg-primary/20 rounded">
                <Calendar className="w-4 h-4 text-primary" />
              </div>
              <span className="text-sm font-medium">
                Showing rankings for: <strong className="text-primary">{getTimePeriodText(timePeriod)}</strong>
              </span>
            </div>
            <Badge variant="outline" className="text-xs border-primary/30 text-primary">
              Shareable Link: #{timePeriod}
            </Badge>
          </div>
        )}
      </div>

      {leaderboardData?.metadata &&
        ((leaderboardData.metadata.availableMonths?.length ?? 0) > 0 ||
          (leaderboardData.metadata.availableYears?.length ?? 0) > 0) && (
          <div className="text-xs text-muted-foreground">
            Data available from{" "}
            {leaderboardData.metadata.availableMonths?.[leaderboardData.metadata.availableMonths.length - 1]}
            to {leaderboardData.metadata.availableMonths?.[0]}({leaderboardData.metadata.availableYears?.length || 0}{" "}
            years, {leaderboardData.metadata.availableMonths?.length || 0} months)
          </div>
        )}

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-b-2 border-primary/10">
                  <TableHead className="w-16 font-semibold">Rank</TableHead>
                  <TableHead className="min-w-[200px] font-semibold">Player</TableHead>
                  <TableHead className="text-right min-w-[80px] font-semibold">Score</TableHead>
                  <TableHead className="text-right min-w-[70px] font-semibold">Solves</TableHead>
                  <TableHead className="text-right min-w-[60px] hidden sm:table-cell font-semibold">CTFs</TableHead>
                  <TableHead className="min-w-[120px] hidden md:table-cell font-semibold">Categories</TableHead>
                  <TableHead className="min-w-[140px] hidden lg:table-cell font-semibold">Recent Activity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {formattedLeaderboardData.length > 0 ? (
                  formattedLeaderboardData.map((entry) => (
                    <TableRow
                      key={entry.user.userId}
                      className="hover:bg-muted/50 transition-colors border-b border-border/50"
                    >
                      <TableCell className="font-medium py-4">
                        <div className="flex items-center justify-center">{getRankIcon(entry.rank)}</div>
                      </TableCell>
                      <TableCell className="py-4">
                        <div
                          className="flex items-center gap-3 cursor-pointer hover:bg-muted/30 rounded-md p-2 -m-2 transition-all duration-200 hover:scale-[1.02]"
                          onClick={() => handleUserClick(entry)}
                        >
                          <Avatar className="w-10 h-10 flex-shrink-0 ring-2 ring-primary/20">
                            <CachedAvatarImage
                              src={
                                entry.user.avatar ||
                                `/abstract-geometric-shapes.png?height=40&width=40&query=user-${entry.user.userId}`
                              }
                              loadingPlaceholder={
                                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                              }
                            />
                            <AvatarFallback className="text-sm bg-primary/20 text-foreground font-medium">
                              {entry.userInitials}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <div className="font-medium hover:text-primary transition-colors truncate text-base">
                              {entry.displayName}
                            </div>
                            <div className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
                              <span className="whitespace-nowrap">{entry.skillLevel}</span>
                              <Badge variant="outline" className="text-xs border-primary/30">
                                Top {entry.percentile}%
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right py-4">
                        <div className="font-mono font-bold text-primary text-base">{entry.formattedScore}</div>
                      </TableCell>
                      <TableCell className="text-right py-4">
                        <Badge variant="secondary" className="font-mono text-foreground">
                          {entry.solveCount}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right hidden sm:table-cell py-4">
                        <Badge variant="outline" className="font-mono">
                          {entry.ctfCount}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell py-4">
                        <div className="flex flex-wrap gap-1">
                          {entry.categories.slice(0, 2).map((category) => (
                            <div key={category} className="flex items-center gap-1.5">
                              <Badge variant="secondary" className="text-xs text-foreground">
                                {category}
                              </Badge>
                            </div>
                          ))}
                          {entry.categories.length > 2 && (
                            <Badge variant="secondary" className="text-xs text-foreground">
                              +{entry.categories.length - 2}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell py-4">
                        {entry.recentSolves.length > 0 ? (
                          <div className="text-sm">
                            <div className="font-medium truncate max-w-32">{entry.recentSolves[0].challenge}</div>
                            <div className="text-muted-foreground">{entry.recentSolves[0].points}</div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">No recent activity</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12">
                      <div className="text-muted-foreground">
                        <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p className="text-lg font-medium mb-2">No players found</p>
                        <p className="text-sm">Try adjusting your filters or search terms</p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="text-sm text-muted-foreground text-center sm:text-left">
          Showing {(currentPage - 1) * pageSize + 1} to{" "}
          {Math.min(currentPage * pageSize, leaderboardData?.metadata.total || 0)} of{" "}
          {leaderboardData?.metadata.total || 0} players
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="text-xs sm:text-sm"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden xs:inline">Previous</span>
          </Button>
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(3, totalPages) }, (_, i) => {
              const pageNum = Math.max(1, Math.min(totalPages - 2, currentPage - 1)) + i
              return (
                <Button
                  key={pageNum}
                  variant={pageNum === currentPage ? "default" : "outline"}
                  size="sm"
                  onClick={() => handlePageChange(pageNum)}
                  className="w-8 h-8 p-0 text-xs"
                >
                  {pageNum}
                </Button>
              )
            })}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="text-xs sm:text-sm"
          >
            <span className="hidden xs:inline">Next</span>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <Dialog open={showUserProfile} onOpenChange={setShowUserProfile}>
        <DialogContent className="max-w-5xl max-h-[95vh] p-0 overflow-hidden bg-transparent border-0 shadow-none">
          <DialogHeader className="sr-only">
            <DialogTitle>
              {selectedUser ? `${getUserDisplayName(selectedUser.user)} Profile` : "User Profile"}
            </DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <UserProfileCard
              user={selectedUser}
              profileData={{
                user: selectedUser.user,
                globalRank: selectedUser.rank,
                totalUsers: leaderboardData?.metadata.totalUsers || 1000,
                percentile: calculatePercentile(selectedUser.rank, leaderboardData?.metadata.totalUsers || 1000),
                stats: {
                  totalScore: selectedUser.totalScore,
                  solveCount: selectedUser.solveCount,
                  ctfCount: selectedUser.ctfCount,
                  categoriesCount: selectedUser.categories.length,
                  averagePointsPerSolve: selectedUser.totalScore / selectedUser.solveCount,
                  contributionToTotal: leaderboardData?.metadata.totalSolves
                    ? Math.round((selectedUser.solveCount / leaderboardData.metadata.totalSolves) * 100 * 100) / 100
                    : 0,
                },
                categoryBreakdown: selectedUser.categories.map((category, index) => {
                  const totalCategories = selectedUser.categories.length
                  const avgSolvesPerCategory = Math.floor(selectedUser.solveCount / totalCategories)
                  const avgPointsPerCategory = Math.floor(selectedUser.totalScore / totalCategories)

                  const solveRemainder = index < selectedUser.solveCount % totalCategories ? 1 : 0
                  const pointsRemainder = index === 0 ? selectedUser.totalScore % totalCategories : 0

                  const solves = avgSolvesPerCategory + solveRemainder
                  const totalPoints = avgPointsPerCategory + pointsRemainder

                  return {
                    name: category,
                    solves,
                    totalScore: totalPoints,
                    avgPoints: solves > 0 ? Math.round(totalPoints / solves) : 0,
                  }
                }),
                ctfBreakdown: [],
                recentSolves: selectedUser.recentSolves,
                achievementIds: selectedUser.achievementIds,
                performanceComparison: {
                  scoreVsAverage: { user: selectedUser.totalScore, average: 0, percentageDiff: 0 },
                  scoreVsMedian: { user: selectedUser.totalScore, median: 0, percentageDiff: 0 },
                  solvesVsAverage: { user: selectedUser.solveCount, average: 0, percentageDiff: 0 },
                },
                globalOverview: {
                  totalUsers: leaderboardData?.metadata.totalUsers || 1000,
                  totalSolves: leaderboardData?.metadata.totalSolves || 0,
                  averageScore: 0,
                  medianScore: 0,
                  totalCategories: selectedUser.categories.length,
                  categories: selectedUser.categories,
                },
                metadata: {
                  profileGenerated: new Date().toISOString(),
                  dataSource: "Leaderboard Data",
                  scope: "leaderboard",
                },
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
