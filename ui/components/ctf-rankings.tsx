"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Window, useWindow } from "@/components/ui/window"
import { Avatar, AvatarFallback, CachedAvatarImage } from "@/components/ui/avatar"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import {
  Trophy,
  Medal,
  Award,
  Users,
  Target,
  Calendar,
  ExternalLink,
  Clock,
  TrendingUp,
  BarChart3,
  CheckCircle2,
  Search,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { getCTFProfile } from "@/lib/actions"
import { getAchievements } from "@/lib/utils"
import type { CTFRanking, CTFProfileResponse } from "@/lib/types"
import { useCTFRankings } from "@/hooks/useAPI"

export function CTFRankings() {
  const [selectedCTF, setSelectedCTF] = useState<string>("all")
  const [openWindows, setOpenWindows] = useState<Map<string, CTFProfileResponse>>(new Map())
  const [loadingProfiles, setLoadingProfiles] = useState<Set<string>>(new Set())
  const [profileError, setProfileError] = useState<string | null>(null)

  const [displayLimit, setDisplayLimit] = useState(25)
  const [offset, setOffset] = useState(0)
  const [searchInput, setSearchInput] = useState("")
  const debounceTimeoutRef = useRef<NodeJS.Timeout>()
  
  // Access window management system
  const { windows, restoreWindow } = useWindow()

  const { data: rankingsData, loading, error, updateParams } = useCTFRankings({
    limit: 25,
    offset: 0,
    hasParticipation: true,
  })

  useEffect(() => {
    updateParams({
      limit: displayLimit,
      offset,
      hasParticipation: true,
    })
  }, [displayLimit, offset, updateParams])

  const handleDisplayLimitChange = useCallback((newLimit: string) => {
    const limit = Number.parseInt(newLimit)
    setDisplayLimit(limit)
    setOffset(0)
  }, [])

  useEffect(() => {
    if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current)
    debounceTimeoutRef.current = setTimeout(() => {
      setOffset(0)
      updateParams({
        q: searchInput.trim() ? searchInput.trim() : undefined,
        offset: 0,
        limit: displayLimit,
        hasParticipation: true,
      })
    }, 400)

    return () => {
      if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current)
    }
  }, [searchInput, displayLimit, updateParams])

  const ctfRankings: CTFRanking[] = rankingsData?.data || []
  const totalCTFs = rankingsData?.metadata?.total || 0

  const handleUserClick = useCallback(
    async (ctfId: string, userId: string) => {
      const windowId = `ctf-profile-${userId}-${ctfId}`

      // Check if there's an existing minimized window with the same ID
      const existingWindow = windows.find(w => w.id === windowId)
      if (existingWindow && existingWindow.isMinimized) {
        // Restore the existing minimized window
        restoreWindow(windowId)
        return
      }

      // Check if window is already open or currently loading
      if (openWindows.has(windowId) || loadingProfiles.has(windowId)) {
        return
      }

      // Mark this profile as loading
      setLoadingProfiles(prev => new Set(prev).add(windowId))
      setProfileError(null)

      try {
        const profileData = await getCTFProfile(ctfId, userId)
        
        setOpenWindows(prev => new Map(prev).set(windowId, profileData))
      } catch (err) {
        console.error("Error fetching user profile:", err)
        setProfileError(err instanceof Error ? err.message : "Failed to load user profile")
      } finally {
        setLoadingProfiles(prev => {
          const newSet = new Set(prev)
          newSet.delete(windowId)
          return newSet
        })
      }
    },
    [openWindows, loadingProfiles, windows, restoreWindow],
  )

  const handleWindowOpenChange = useCallback((windowId: string, isOpen: boolean) => {
    if (!isOpen) {
      // Check if window is actually being closed (not just minimized)
      const existingWindow = windows.find(w => w.id === windowId)
      
      // Only clean up if the window is actually being closed, not minimized
      if (!existingWindow) {
        setOpenWindows(prev => {
          const newMap = new Map(prev)
          newMap.delete(windowId)
          return newMap
        })
        
        // Also clean up any loading state for this window
        setLoadingProfiles(prev => {
          const newSet = new Set(prev)
          newSet.delete(windowId)
          return newSet
        })
      }
    }
  }, [windows])

  const filteredRankings = useMemo(() => {
    return selectedCTF === "all" ? ctfRankings : ctfRankings.filter((ctf) => ctf.ctf_id === selectedCTF)
  }, [selectedCTF, ctfRankings])

  const ctfOptions = useMemo(() => {
    const uniqueCTFs = new Map<string, { id: string; title: string }>()
    
    ctfRankings.forEach((ctf) => {
      if (!uniqueCTFs.has(ctf.ctf_id)) {
        uniqueCTFs.set(ctf.ctf_id, {
          id: ctf.ctf_id,
          title: ctf.title,
        })
      }
    })
    
    return Array.from(uniqueCTFs.values()).sort((a, b) => a.title.localeCompare(b.title))
  }, [ctfRankings])

  useEffect(() => {
    if (selectedCTF !== "all" && !ctfRankings.some((c) => c.ctf_id === selectedCTF)) {
      setSelectedCTF("all")
    }
  }, [selectedCTF, ctfRankings])

  const pagination = useMemo(() => {
    const returned = rankingsData?.metadata?.returned ?? ctfRankings.length
    const hasNext = rankingsData?.metadata?.hasNextPage ?? (offset + returned < totalCTFs && returned > 0)
    const hasPrev = rankingsData?.metadata?.hasPreviousPage ?? offset > 0
    return { returned, hasNext, hasPrev }
  }, [rankingsData?.metadata, ctfRankings.length, offset, totalCTFs])

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

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-500/20 text-green-400 border-green-500/30"
      case "upcoming":
        return "bg-blue-500/20 text-blue-400 border-blue-500/30"
      case "completed":
        return "bg-gray-500/20 text-gray-700 dark:text-gray-300 border-gray-500/30"
      default:
        return "bg-gray-500/20 text-gray-700 dark:text-gray-300 border-gray-500/30"
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(2)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="h-6 bg-muted rounded w-1/3 mb-4"></div>
              <div className="space-y-2">
                {[...Array(5)].map((_, j) => (
                  <div key={j} className="h-12 bg-muted rounded"></div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <Card className="p-6">
        <div className="text-center space-y-4">
          <div className="text-red-500 text-lg font-semibold">Failed to load CTF rankings</div>
          <div className="text-muted-foreground">{String(error)}</div>
          <Button onClick={() => updateParams({ offset, limit: displayLimit })}>Try Again</Button>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* CTF Filter and Pagination Controls */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">CTF-Specific Rankings</h3>
          <p className="text-sm text-muted-foreground">
            View leaderboards for individual competitions ({totalCTFs} total)
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search CTF rankings..."
              className="pl-10"
            />
          </div>
          <Select value={selectedCTF} onValueChange={setSelectedCTF} disabled={ctfOptions.length === 0}>
            <SelectTrigger className="w-full sm:w-64">
              <SelectValue placeholder="Select CTF" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All CTFs</SelectItem>
              {ctfOptions.map((ctf) => (
                <SelectItem key={ctf.id} value={ctf.id}>
                  {ctf.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={displayLimit.toString()} onValueChange={handleDisplayLimitChange}>
            <SelectTrigger className="w-full sm:w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">Show 10</SelectItem>
              <SelectItem value="25">Show 25</SelectItem>
              <SelectItem value="50">Show 50</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!pagination.hasPrev || loading}
              onClick={() => setOffset((prev) => Math.max(0, prev - displayLimit))}
              className="w-full sm:w-auto"
            >
              Prev
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!pagination.hasNext || loading}
              onClick={() => setOffset((prev) => prev + displayLimit)}
              className="w-full sm:w-auto"
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      {/* CTF Rankings */}
      <div className="space-y-6">
        {filteredRankings.length === 0 ? (
          <Card className="p-6">
            <div className="text-center text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium mb-2">No CTF rankings available</p>
              <p>No CTF competitions with community participation found.</p>
            </div>
          </Card>
        ) : (
          <Accordion type="single" collapsible className="space-y-4">
            {filteredRankings.map((ctf) => (
              <AccordionItem
                key={ctf.ctf_id}
                value={ctf.ctf_id}
                className="shadow-lg border-2 border-primary/10 hover:border-primary/20 transition-all duration-200 rounded-lg overflow-hidden"
              >
                <AccordionTrigger className="px-4 sm:px-6 bg-gradient-to-r from-primary/5 to-transparent">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 w-full">
                    <div className="flex items-center gap-4 min-w-0 flex-1">
                      <Avatar className="h-12 w-12 flex-shrink-0 ring-2 ring-primary/30 shadow-md">
                        <CachedAvatarImage
                          src={ctf.logo || "/placeholder.svg"}
                          loadingPlaceholder={
                            <div className="w-3 h-3 border border-muted-foreground border-t-transparent rounded-full animate-spin" />
                          }
                        />
                        <AvatarFallback className="bg-primary/20 text-foreground">
                          {ctf.title.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-primary font-[family-name:var(--font-playfair)] truncate">
                          {ctf.title}
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-sm text-muted-foreground">
                          <span className="truncate">by {ctf.organizer}</span>
                          <Badge className={`text-xs ${getStatusColor(ctf.schedule.status)} w-fit`}>
                            {ctf.schedule.status}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="w-full sm:w-auto">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Users className="h-4 w-4" />
                          <span className="whitespace-nowrap">{ctf.communityStats.uniqueParticipants} players</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Target className="h-4 w-4" />
                          <span className="whitespace-nowrap">{ctf.communityStats.totalSolves} solves</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          <span className="whitespace-nowrap">{formatDate(ctf.schedule.start)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 sm:px-6">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="w-16">Rank</TableHead>
                          <TableHead className="min-w-[150px]">Player</TableHead>
                          <TableHead className="text-right min-w-[80px]">Score</TableHead>
                          <TableHead className="text-right min-w-[70px]">Solves</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ctf.leaderboard.map((player) => (
                          <TableRow key={player.user.userId} className="hover:bg-muted/50">
                            <TableCell className="font-medium">
                              <div className="flex items-center justify-center">{getRankIcon(player.rank)}</div>
                            </TableCell>
                            <TableCell>
                              <div
                                className={`flex items-center gap-3 cursor-pointer hover:bg-gradient-to-r hover:from-primary/10 hover:to-transparent rounded-md p-2 -m-2 transition-all duration-200 border border-transparent hover:border-primary/20 ${
                                  loadingProfiles.has(`ctf-profile-${player.user.userId}-${ctf.ctf_id}`)
                                    ? "opacity-60"
                                    : ""
                                }`}
                                onClick={() => handleUserClick(ctf.ctf_id, player.user.userId)}
                              >
                                <div className="relative">
                                  <Avatar className="w-8 h-8 flex-shrink-0 ring-1 ring-primary/20">
                                    <CachedAvatarImage
                                      src={
                                        player.user.avatar ||
                                        `/abstract-geometric-shapes.png?height=32&width=32&query=${player.user.userId}`
                                      }
                                      loadingPlaceholder={
                                        <div className="w-3 h-3 border border-muted-foreground border-t-transparent rounded-full animate-spin" />
                                      }
                                    />
                                    <AvatarFallback className="text-xs bg-primary/20 text-foreground font-medium">
                                      {(player.user.displayName || player.user.username)
                                        .substring(0, 2)
                                        .toUpperCase()}
                                    </AvatarFallback>
                                  </Avatar>
                                  {loadingProfiles.has(`ctf-profile-${player.user.userId}-${ctf.ctf_id}`) && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded-full">
                                      <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                    </div>
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="font-medium hover:text-primary transition-colors truncate">
                                    {player.user.displayName || player.user.username}
                                  </div>
                                  <div className="text-sm text-muted-foreground">
                                    {player.rank <= 3 ? "Elite" : player.rank <= 10 ? "Advanced" : "Intermediate"}
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="font-mono font-bold text-primary text-sm sm:text-base">
                                {player.score.toFixed(1)}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge
                                variant="secondary"
                                className="font-mono text-foreground text-xs bg-primary/10 border-primary/20"
                              >
                                {player.solves}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </div>


      {/* Profile Error Notification */}
      {profileError && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 bg-destructive/20 rounded-full flex items-center justify-center">
                  <span className="text-destructive text-xs">!</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-destructive">Profile Loading Failed</p>
                  <p className="text-xs text-muted-foreground">{profileError}</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setProfileError(null)}
                className="text-xs border-destructive/30"
              >
                Dismiss
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* CTF-Specific User Profile Modals - Multiple windows support */}
      {Array.from(openWindows.entries()).map(([windowId, selectedUser]) => {
        // Check if window exists in window management system and get its current state
        const windowState = windows.find(w => w.id === windowId)
        const isWindowOpen = windowState ? !windowState.isMinimized : true
        
        return (
          <Window
            key={windowId}
            id={windowId}
            title={`${selectedUser.user.displayName || selectedUser.user.username} - ${selectedUser.ctfInfo.title}`}
            defaultSize={{ width: 1000, height: 700 }}
            minSize={{ width: 320, height: 400 }}
            isOpen={isWindowOpen}
            onOpenChange={(isOpen) => handleWindowOpenChange(windowId, isOpen)}
          >
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
                    <h2 className="text-xl sm:text-2xl font-bold text-primary font-[family-name:var(--font-playfair)] mb-2 line-clamp-2">
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
        </Window>
        )
      })}
    </div>
  )
}
