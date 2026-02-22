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
import { ScoreDisplay } from "@/components/score-display"
import Link from "next/link"
import { toast } from "sonner"
import { getUserInitials, getUserDisplayName, formatTimeAgo, getRankIcon } from "@/lib/format-helpers"

import { UserProfileContent } from "./user-profile-content"

export function LeaderboardTable() {
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 10
  const [selectedCtf, setSelectedCtf] = useState<string>("global")
  const [selectedUsers, setSelectedUsers] = useState<Map<string, LeaderboardEntry>>(new Map())

  // Memoize the "now" values so they are stable across renders
  const today = useMemo(() => {
    const now = new Date()
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, "0")}`
    const thisYear = now.getFullYear()
    const lastYear = now.getFullYear() - 1
    return { now, thisMonth, lastMonth, thisYear, lastYear }
  }, [])

  const canonicalizeTimePeriod = useCallback(
    (period: string) => {
      switch (period) {
        case "leaderboard":
          return "all-time"
        case "this-month":
          return `month-${today.thisMonth}`
        case "last-month":
          return `month-${today.lastMonth}`
        case "this-year":
          return `year-${today.thisYear}`
        case "last-year":
          return `year-${today.lastYear}`
        default:
          return period
      }
    },
    [today],
  )

  const getTimeParams = useCallback(
    (period: string) => {
      if (period.startsWith("month-")) {
        const monthValue = period.replace("month-", "")
        return { month: monthValue, year: undefined }
      } else if (period.startsWith("year-")) {
        const yearValue = Number.parseInt(period.replace("year-", ""))
        return { year: yearValue, month: undefined }
      }

      switch (period) {
        case "this-month":
          return { month: today.thisMonth, year: undefined }
        case "last-month":
          return { month: today.lastMonth, year: undefined }
        case "this-year":
          return { year: today.thisYear, month: undefined }
        case "last-year":
          return { year: today.lastYear, month: undefined }
        default:
          return { month: undefined, year: undefined }
      }
    },
    [today],
  )

  const [timePeriod, setTimePeriod] = useState<string>(() => `month-${today.thisMonth}`)

  const { openWindow, windows } = useWindow()

  const {
    data: leaderboardData,
    loading,
    error,
    updateParams,
  } = useScoreboard({
    limit: pageSize,
    offset: 0,
    global: true,
    ...getTimeParams(timePeriod),
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
    return timePeriod === "all-time" ? "#all-time" : `#${timePeriod}`
  }, [timePeriod])

  const [shareUrl, setShareUrl] = useState<string>("")
  useEffect(() => {
    // Build an absolute URL so users can share/copy a real link, not only the hash fragment.
    if (typeof window === "undefined") return
    setShareUrl(`${window.location.origin}${window.location.pathname}${window.location.search}${shareHash}`)
  }, [shareHash])

  const copyShareLink = async () => {
    const textToCopy = shareUrl || shareHash
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(textToCopy)
      } else {
        // Fallback for older/blocked clipboard environments
        const el = document.createElement("textarea")
        el.value = textToCopy
        el.setAttribute("readonly", "true")
        el.style.position = "fixed"
        el.style.left = "-9999px"
        document.body.appendChild(el)
        el.select()
        document.execCommand("copy")
        document.body.removeChild(el)
      }
      toast.success("Copied", { description: textToCopy })
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


      if (!hash) return

      // "#leaderboard" is used by the dashboard as a tab identifier, not a time filter.
      // Leaving timePeriod untouched keeps the current-month default (or last selection).
      if (hash === "leaderboard") return

      const validPeriods = ["all-time", "this-month", "last-month", "this-year", "last-year"]
      const isDynamicMonth = hash.startsWith("month-") && hash.match(/^month-\d{4}-\d{2}$/)
      const isDynamicYear = hash.startsWith("year-") && hash.match(/^year-\d{4}$/)

      if (validPeriods.includes(hash) || isDynamicMonth || isDynamicYear) {
        const canonical = canonicalizeTimePeriod(hash)

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


      if (hash === "leaderboard") return

      const validPeriods = ["all-time", "this-month", "last-month", "this-year", "last-year"]
      const isDynamicMonth = hash.startsWith("month-") && hash.match(/^month-\d{4}-\d{2}$/)
      const isDynamicYear = hash.startsWith("year-") && hash.match(/^year-\d{4}$/)

      if (validPeriods.includes(hash) || isDynamicMonth || isDynamicYear) {
        const canonical = canonicalizeTimePeriod(hash)

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
    window.location.hash = period
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
              <div className="p-2 bg-primary/10 rounded-lg border border-primary/20">
                <Calendar className="w-4 h-4 text-primary" />
              </div>
              <Select value={timePeriod} onValueChange={handleTimePeriodChange}>
                <SelectTrigger className="w-full sm:w-48 h-10 glass-panel border-white/5">
                  <SelectValue placeholder="Time Period" />
                </SelectTrigger>
                <SelectContent className="glass-card">
                  {getTimePeriodOptions().map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="p-2 bg-chart-3/10 rounded-lg border border-chart-3/20">
                <Filter className="w-4 h-4 text-chart-3" />
              </div>
              <Select value={selectedCtf} onValueChange={handleCtfChange}>
                <SelectTrigger className="w-full sm:w-48 h-10 glass-panel border-white/5">
                  <SelectValue placeholder="Select CTF" />
                </SelectTrigger>
                <SelectContent className="glass-card">
                  <SelectItem value="global">Global Rankings</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {timePeriod !== "all-time" && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4 bg-primary/5 border border-primary/20 rounded-xl backdrop-blur-md shadow-sm">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-primary/20 rounded-md">
                <Calendar className="w-4 h-4 text-primary" />
              </div>
              <span className="text-sm font-medium text-foreground/90">
                Showing rankings for: <strong className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent drop-shadow-sm">{getTimePeriodText(timePeriod)}</strong>
              </span>
            </div>
            <a
              href={shareUrl || shareHash}
              className="inline-flex items-center gap-1.5 text-xs text-primary underline underline-offset-4 hover:opacity-80 cursor-pointer font-medium ml-1"
              title={`Copy ${shareUrl || shareHash}`}
              onClick={(e) => {
                e.preventDefault()
                copyShareLink()
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  copyShareLink()
                }
              }}
            >
              <Copy className="w-3.5 h-3.5" />
              Copy share link
            </a>
          </div>
        )}
      </div>

      {leaderboardData?.metadata &&
        ((leaderboardData.metadata.availableMonths?.length ?? 0) > 0 ||
          (leaderboardData.metadata.availableYears?.length ?? 0) > 0) && (
          <div className="text-xs text-muted-foreground/70 font-medium tracking-wide">
            DATA AVAILABLE FROM{" "}
            {leaderboardData.metadata.availableMonths?.[leaderboardData.metadata.availableMonths.length - 1]?.toUpperCase()}{" "}
            TO {leaderboardData.metadata.availableMonths?.[0]?.toUpperCase()} ({leaderboardData.metadata.availableYears?.length || 0}{" "}
            YEARS, {leaderboardData.metadata.availableMonths?.length || 0} MONTHS)
          </div>
        )}

      <div className="glass-card border-none rounded-2xl overflow-hidden shadow-2xl relative">
        <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
        <div className="overflow-x-auto relative z-10">
          <Table>
            <TableHeader className="bg-black/20">
              <TableRow className="hover:bg-transparent border-b border-white/10">
                <TableHead className="w-16 font-semibold text-muted-foreground">Rank</TableHead>
                <TableHead className="min-w-[200px] font-semibold text-muted-foreground">Player</TableHead>
                <TableHead className="text-right min-w-[80px] font-semibold text-muted-foreground">Score</TableHead>
                <TableHead className="text-right min-w-[70px] font-semibold text-muted-foreground">Solves</TableHead>
                <TableHead className="text-right min-w-[60px] hidden sm:table-cell font-semibold text-muted-foreground">CTFs</TableHead>
                <TableHead className="min-w-[120px] hidden md:table-cell font-semibold text-muted-foreground">Categories</TableHead>
                <TableHead className="min-w-[140px] hidden lg:table-cell font-semibold text-muted-foreground">Recent Activity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {formattedLeaderboardData.length > 0 ? (
                formattedLeaderboardData.map((entry) => (
                  <TableRow
                    key={entry.user.userId}
                    className="hover:bg-primary/5 transition-colors border-b border-white/5 group"
                  >
                    <TableCell className="font-medium py-4">
                      <div className="flex items-center justify-center filter drop-shadow-md">{getRankIcon(entry.rank)}</div>
                    </TableCell>
                    <TableCell className="py-4">
                      <div
                        className="flex items-center gap-3 cursor-pointer hover:bg-white/5 rounded-2xl p-2 -m-2 transition-all duration-300 hover:scale-[1.02] border border-transparent hover:border-primary/20 hover:shadow-[0_4px_20px_-5px_var(--primary)]"
                        onClick={() => handleUserClick(entry)}
                      >
                        <Avatar className="w-12 h-12 flex-shrink-0 ring-2 ring-primary/20 group-hover:ring-primary/50 transition-all shadow-[0_0_10px_-2px_var(--primary)]">
                          <CachedAvatarImage
                            src={
                              entry.user.avatar ||
                              `/abstract-geometric-shapes.png?height=48&width=48&query=user-${entry.user.userId}`
                            }
                            loadingPlaceholder={
                              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                            }
                          />
                          <AvatarFallback className="text-sm bg-primary/20 text-primary font-bold">
                            {entry.userInitials}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="font-bold hover:text-primary transition-colors truncate text-lg tracking-tight">
                            {entry.displayName}
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap uppercase font-semibold tracking-wider">
                            <span className="whitespace-nowrap">{entry.skillLevel}</span>
                            <Badge variant="outline" className="text-[10px] border-primary/30 py-0 h-4">
                              Top {entry.percentile}%
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right py-4">
                      <ScoreDisplay score={entry.totalScore} className="text-primary text-xl font-mono tracking-tighter font-black block" />
                    </TableCell>
                    <TableCell className="text-right py-4">
                      <Badge variant="secondary" className="font-mono text-foreground font-black tracking-tight text-sm">
                        {entry.solveCount}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right hidden sm:table-cell py-4">
                      <Badge variant="outline" className="font-mono font-bold tracking-tight">
                        {entry.ctfCount}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell py-4">
                      <div className="flex flex-wrap gap-1">
                        {entry.categories.slice(0, 2).map((category) => (
                          <div key={category} className="flex items-center gap-1.5">
                            <Badge variant="secondary" className="text-xs text-foreground uppercase tracking-widest px-2 py-0 border border-white/5">
                              {category}
                            </Badge>
                          </div>
                        ))}
                        {entry.categories.length > 2 && (
                          <Badge variant="secondary" className="text-xs text-foreground bg-white/5">
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
          defaultSize={{ width: 1000, height: 700 }}
          minSize={{ width: 320, height: 400 }}
          onOpenChange={(open) => {
            if (!open) {
              // If the window still exists in the provider, it's minimized, not closed.
              if (windows.some((w) => w.id === windowId)) return
              setSelectedUsers((prev) => {
                const next = new Map(prev)
                next.delete(windowId)
                return next
              })
            }
          }}
        >
          <UserProfileContent user={user} leaderboardTotal={leaderboardData?.metadata.total || 1000} />
        </Window>
      ))}
    </div>
  )
}
