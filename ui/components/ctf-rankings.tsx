"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { Card, CardContent } from "@/components/ui/card"
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
import { getStatusColor, formatDate, getRankIcon } from "@/lib/format-helpers"
import { Button } from "@/components/ui/button"
import { getCTFProfile } from "@/lib/actions"
import { getAchievements } from "@/lib/utils"
import type { CTFRanking, CTFProfileResponse } from "@/lib/types"
import { useCTFRankings } from "@/hooks/useAPI"
import { CTFProfileContent } from "./ctf-profile-content"

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
  const { windows, openWindow, restoreWindow, bringToFront } = useWindow()

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

  const ctfRankings = useMemo<CTFRanking[]>(() => rankingsData?.data ?? [], [rankingsData?.data])
  const totalCTFs = rankingsData?.metadata?.total || 0

  const handleUserClick = useCallback(
    async (ctfId: string, userId: string) => {
      const windowId = `ctf-profile-${userId}-${ctfId}`

      // Check if there's an existing minimized window with the same ID
      const existingWindow = windows.find((w) => w.id === windowId)
      if (existingWindow) {
        if (existingWindow.isMinimized) restoreWindow(windowId)
        else bringToFront(windowId)
        return
      }

      // Check if window is already open or currently loading
      if (openWindows.has(windowId) || loadingProfiles.has(windowId)) {
        const existingProfile = openWindows.get(windowId)
        if (existingProfile) {
          openWindow(
            windowId,
            `${existingProfile.user.displayName || existingProfile.user.username} - ${existingProfile.ctfInfo.title}`,
          )
        }
        return
      }

      // Mark this profile as loading
      setLoadingProfiles(prev => new Set(prev).add(windowId))
      setProfileError(null)

      try {
        const profileData = await getCTFProfile(ctfId, userId)

        setOpenWindows(prev => new Map(prev).set(windowId, profileData))
        openWindow(
          windowId,
          `${profileData.user.displayName || profileData.user.username} - ${profileData.ctfInfo.title}`,
        )
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
    [openWindows, loadingProfiles, windows, restoreWindow, bringToFront, openWindow],
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
                className="glass-card mb-4 shadow-lg border-t-white/5 border-l-white/5 hover:border-primary/40 transition-all duration-300 rounded-xl overflow-hidden group hover:shadow-[0_0_20px_-5px_var(--primary)] relative"
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-2xl -translate-y-10 translate-x-10 group-hover:bg-primary/20 transition-colors duration-500 pointer-events-none" />
                <AccordionTrigger className="px-4 sm:px-6 bg-transparent relative z-10 hover:no-underline">
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
                        <div className="font-bold text-primary font-[family-name:var(--font-outfit)] truncate">
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
                                className={`flex items-center gap-3 cursor-pointer hover:bg-gradient-to-r hover:from-primary/10 hover:to-transparent rounded-md p-2 -m-2 transition-all duration-200 border border-transparent hover:border-primary/20 ${loadingProfiles.has(`ctf-profile-${player.user.userId}-${ctf.ctf_id}`)
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
        return (
          <Window
            key={windowId}
            id={windowId}
            title={`${selectedUser.user.displayName || selectedUser.user.username} - ${selectedUser.ctfInfo.title}`}
            defaultSize={{ width: 1000, height: 700 }}
            minSize={{ width: 320, height: 400 }}
            onOpenChange={(isOpen) => handleWindowOpenChange(windowId, isOpen)}
          >
            <CTFProfileContent selectedUser={selectedUser} />
          </Window>
        )
      })}
    </div>
  )
}
