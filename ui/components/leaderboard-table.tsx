"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, CachedAvatarImage } from "@/components/ui/avatar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Trophy,
  Medal,
  Award,
  ChevronLeft,
  ChevronRight,
  Copy,
  Filter,
  AlertCircle,
  Calendar,
  Users,
  ExternalLink,
  TrendingUp,
  Star,
  Target,
  AwardIcon,
} from "lucide-react"
import { Window, useWindow } from "@/components/ui/window"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { SearchLeaderboard } from "@/components/search-leaderboard"
import { useScoreboard } from "@/hooks/useAPI"
import type { LeaderboardEntry, Achievement } from "@/lib/types"
import { calculatePercentile, getAchievements, getCategoryColor } from "@/lib/utils"
import { ScoreDisplay, formatScore } from "@/components/score-display"
import Link from "next/link"
import { toast } from "sonner"

interface CategoryStat {
  name: string
  solves: number
  totalScore: number
  avgPoints: number
  rankInCategory?: number
  percentile?: number
}

const canonicalizeTimePeriod = (period: string) => {
  const now = new Date()
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, "0")}`

  switch (period) {
    case "leaderboard":
      return "all-time"
    case "this-month":
      return `month-${thisMonth}`
    case "last-month":
      return `month-${lastMonth}`
    case "this-year":
      return `year-${now.getFullYear()}`
    case "last-year":
      return `year-${now.getFullYear() - 1}`
    default:
      return period
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

const UserProfileContent = ({ user, leaderboardTotal }: { user: LeaderboardEntry; leaderboardTotal: number }) => {
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

export function LeaderboardTable() {
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [selectedCtf, setSelectedCtf] = useState<string>("global")
  const [selectedUsers, setSelectedUsers] = useState<Map<string, LeaderboardEntry>>(new Map())
  const [timePeriod, setTimePeriod] = useState<string>(() => {
    const now = new Date()
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
    return `month-${month}`
  })

  const { openWindow } = useWindow()

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

  const memoizedTimePeriodOptions = useMemo(() => {
    const options = [{ value: "all-time", label: "All Time" }]

    if (leaderboardData?.metadata) {
      const { availableYears, availableMonths } = leaderboardData.metadata
      const now = new Date()
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
      const currentYear = now.getFullYear()

      // Always include the current year/month in the UI even if the backend
      // hasn't observed solves yet for that period.
      const years = Array.from(new Set([...(availableYears || []), currentYear])).sort((a, b) => b - a)
      const months = (() => {
        const list = availableMonths ? [...availableMonths] : []
        if (!list.includes(currentMonth)) list.unshift(currentMonth)
        return list
      })()

      if (years.length > 0) {
        years.forEach((year) => {
          options.push({
            value: `year-${year}`,
            label: `${year}`,
          })
        })
      }

      if (months.length > 0) {
        months.slice(0, 12).forEach((month) => {
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

  const handleUserClick = useCallback(
    (user: LeaderboardEntry) => {
      const windowId = `leaderboard-profile-${user.user.userId}-${Date.now()}`
      const windowTitle = `${getUserDisplayName(user.user)} - Profile`

      setSelectedUsers((prev) => new Map(prev.set(windowId, user)))
      openWindow(windowId, windowTitle)
    },
    [openWindow],
  )

  const formattedLeaderboardData = useMemo(() => {
    if (!leaderboardData?.data) return []

    return leaderboardData.data.map((entry) => ({
      ...entry,
      userInitials: getUserInitials(entry.user),
      displayName: getUserDisplayName(entry.user),
      skillLevel: entry.rank <= 10 ? "Elite" : entry.rank <= 50 ? "Advanced" : "Intermediate",
      percentile: calculatePercentile(entry.rank, leaderboardData?.metadata.total || 1000),
    }))
  }, [leaderboardData])

  const shareHash = useMemo(() => {
    return timePeriod === "all-time" ? "#leaderboard" : `#${timePeriod}`
  }, [timePeriod])

  const copyShareLink = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareHash)
      } else {
        // Fallback for older/blocked clipboard environments
        const el = document.createElement("textarea")
        el.value = shareHash
        el.setAttribute("readonly", "true")
        el.style.position = "fixed"
        el.style.left = "-9999px"
        document.body.appendChild(el)
        el.select()
        document.execCommand("copy")
        document.body.removeChild(el)
      }
      toast.success("Copied", { description: shareHash })
    } catch {
      toast.error("Copy failed", { description: "Your browser blocked clipboard access." })
    }
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

      if (hash === "leaderboard") {
        setTimePeriod("all-time")
        return
      }

      const validPeriods = ["all-time", "this-month", "last-month", "this-year", "last-year"]
      const isDynamicMonth = hash.startsWith("month-") && hash.match(/^month-\d{4}-\d{2}$/)
      const isDynamicYear = hash.startsWith("year-") && hash.match(/^year-\d{4}$/)

      if (validPeriods.includes(hash) || isDynamicMonth || isDynamicYear) {
        const canonical = canonicalizeTimePeriod(hash)
        console.log("[v0] Setting initial time period to:", canonical)
        setTimePeriod(canonical)
        setCurrentPage(1)

        // Normalize share URLs so the select always has a matching option.
        if (canonical !== hash) {
          window.history.replaceState(null, "", `#${canonical}`)
        }
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
        const canonical = canonicalizeTimePeriod(hash)
        console.log("[v0] Setting time period to:", canonical)
        setTimePeriod(canonical)
        setCurrentPage(1)
        const timeParams = getTimeParams(canonical)
        updateParams({
          offset: 0,
          limit: pageSize,
          global: selectedCtf === "global",
          ctf_id: selectedCtf !== "global" ? selectedCtf : undefined,
          ...timeParams,
        })

        if (canonical !== hash) {
          window.history.replaceState(null, "", `#${canonical}`)
        }
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={copyShareLink}
              className="h-7 px-2 text-xs border-primary/30 text-primary"
              title={`Copy ${shareHash}`}
            >
              <Copy className="w-3.5 h-3.5 mr-1" />
              Shareable Link: {shareHash}
            </Button>
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

      <div className="overflow-hidden">
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
                      <ScoreDisplay score={entry.totalScore} className="text-primary text-base block" />
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
      </div>

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

      {Array.from(selectedUsers.entries()).map(([windowId, user]) => (
        <Window
          key={windowId}
          id={windowId}
          title={`${getUserDisplayName(user.user)} - Profile`}
          isOpen={true}
          defaultSize={{ width: 1000, height: 700 }}
          minSize={{ width: 320, height: 400 }}
        >
          <UserProfileContent user={user} leaderboardTotal={leaderboardData?.metadata.total || 1000} />
        </Window>
      ))}
    </div>
  )
}
