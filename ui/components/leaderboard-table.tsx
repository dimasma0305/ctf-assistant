"use client"

import { useState, useEffect } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, CachedAvatarImage } from "@/components/ui/avatar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Trophy, Medal, Award, ChevronLeft, ChevronRight, Filter, AlertCircle, Calendar } from "lucide-react"
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

  const getTimePeriodOptions = () => {
    const options = [{ value: "all-time", label: "All Time" }]

    if (leaderboardData?.metadata) {
      const { availableYears, availableMonths } = leaderboardData.metadata

      // Add year options
      if (availableYears && availableYears.length > 0) {
        availableYears.forEach((year) => {
          options.push({
            value: `year-${year}`,
            label: `${year}`,
          })
        })
      }

      // Add month options (most recent first)
      if (availableMonths && availableMonths.length > 0) {
        availableMonths.slice(0, 12).forEach((month) => {
          // Show last 12 months
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
  }

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

      // Handle leaderboard tab with time period
      if (hash === "leaderboard") {
        setTimePeriod("all-time")
        return
      }

      // Handle direct time period hashes
      const validPeriods = ["all-time", "this-month", "last-month", "this-year", "last-year"]
      const isDynamicMonth = hash.startsWith("month-") && hash.match(/^month-\d{4}-\d{2}$/)
      const isDynamicYear = hash.startsWith("year-") && hash.match(/^year-\d{4}$/)

      if (validPeriods.includes(hash) || isDynamicMonth || isDynamicYear) {
        console.log("[v0] Setting initial time period to:", hash)
        setTimePeriod(hash)
        setCurrentPage(1)
      }
    }

    // Initialize from current hash only once
    initializeFromHash()
  }, []) // Remove dependencies to run only once on mount

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1) // Remove the #
      console.log("[v0] Hash changed to:", hash)

      const validPeriods = ["all-time", "this-month", "last-month", "this-year", "last-year"]
      const isDynamicMonth = hash.startsWith("month-") && hash.match(/^month-\d{4}-\d{2}$/)
      const isDynamicYear = hash.startsWith("year-") && hash.match(/^year-\d{4}$/)

      // Check if hash matches a time period (static or dynamic)
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

    // Listen for hash changes
    window.addEventListener("hashchange", handleHashChange)
    return () => window.removeEventListener("hashchange", handleHashChange)
  }, [selectedCtf, pageSize, updateParams]) // Keep dependencies for hash change handler

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

    // Update URL hash
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

    // Legacy support for old format
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
        return {} // all-time
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

    // Legacy support
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

  const totalPages = leaderboardData ? Math.ceil(leaderboardData.metadata.total / pageSize) : 0

  const handleUserClick = (user: LeaderboardEntry) => {
    setSelectedUser(user)
    setShowUserProfile(true)
  }

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
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <SearchLeaderboard onUserClick={handleUserClick} />
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <Select value={timePeriod} onValueChange={handleTimePeriodChange}>
              <SelectTrigger className="w-full sm:w-48">
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
            <Filter className="w-4 h-4 text-muted-foreground" />
            <Select value={selectedCtf} onValueChange={handleCtfChange}>
              <SelectTrigger className="w-full sm:w-48">
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
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            <span>
              Showing rankings for: <strong>{getTimePeriodText(timePeriod)}</strong>
            </span>
          </div>
          <Badge variant="outline" className="text-xs">
            Shareable Link: #{timePeriod}
          </Badge>
        </div>
      )}

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

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-16">Rank</TableHead>
                  <TableHead className="min-w-[200px]">Player</TableHead>
                  <TableHead className="text-right min-w-[80px]">Score</TableHead>
                  <TableHead className="text-right min-w-[70px]">Solves</TableHead>
                  <TableHead className="text-right min-w-[60px] hidden sm:table-cell">CTFs</TableHead>
                  <TableHead className="min-w-[120px] hidden md:table-cell">Categories</TableHead>
                  <TableHead className="min-w-[140px] hidden lg:table-cell">Recent Activity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leaderboardData && leaderboardData.data.length > 0 ? (
                  leaderboardData.data.map((entry) => (
                    <TableRow key={entry.user.userId} className="hover:bg-muted/50">
                      <TableCell className="font-medium">
                        <div className="flex items-center justify-center">{getRankIcon(entry.rank)}</div>
                      </TableCell>
                      <TableCell>
                        <div
                          className="flex items-center gap-3 cursor-pointer hover:bg-muted/30 rounded-md p-2 -m-2 transition-colors"
                          onClick={() => handleUserClick(entry)}
                        >
                          <Avatar className="w-8 h-8 flex-shrink-0">
                            <CachedAvatarImage
                              src={
                                entry.user.avatar ||
                                `/abstract-geometric-shapes.png?height=32&width=32&query=user-${entry.user.userId}`
                              }
                              loadingPlaceholder={
                                <div className="w-3 h-3 border border-muted-foreground border-t-transparent rounded-full animate-spin" />
                              }
                            />
                            <AvatarFallback className="text-xs bg-primary/20 text-foreground font-medium">
                              {getUserInitials(entry.user)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <div className="font-medium hover:text-primary transition-colors truncate">
                              {getUserDisplayName(entry.user)}
                            </div>
                            <div className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
                              <span className="whitespace-nowrap">
                                {entry.rank <= 10 ? "Elite" : entry.rank <= 50 ? "Advanced" : "Intermediate"}
                              </span>
                              <Badge variant="outline" className="text-xs">
                                Top {calculatePercentile(entry.rank, leaderboardData?.metadata.total || 1000)}%
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="font-mono font-bold text-primary text-sm sm:text-base">
                          {formatScore(entry.totalScore)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary" className="font-mono text-foreground text-xs">
                          {entry.solveCount}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right hidden sm:table-cell">
                        <Badge variant="outline" className="font-mono text-xs">
                          {entry.ctfCount}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {entry.categories.slice(0, 2).map((category) => (
                            <Badge key={category} variant="secondary" className="text-xs text-foreground">
                              {category}
                            </Badge>
                          ))}
                          {entry.categories.length > 2 && (
                            <Badge variant="secondary" className="text-xs text-foreground">
                              +{entry.categories.length - 2}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {entry.recentSolves.length > 0 ? (
                          <div className="text-sm">
                            <div className="font-medium truncate max-w-32">{entry.recentSolves[0].challenge}</div>
                            <div className="text-muted-foreground">{entry.recentSolves[0].points} pts</div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">No recent activity</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <div className="text-muted-foreground">
                        <p>No players found</p>
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
