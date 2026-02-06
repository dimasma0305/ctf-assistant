"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Window, useWindow } from "@/components/ui/window"
import { Avatar, AvatarFallback, CachedAvatarImage } from "@/components/ui/avatar"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Calendar, Users, Trophy, ExternalLink, Search, MapPin, AlertCircle, Target } from "lucide-react"
import { useCTFs, useCTFDetails } from "@/hooks/useAPI"
import type { CTFResponse, CTFsParams } from "@/lib/types"

function CTFDetailsWindow({
  windowId,
  ctfId,
  ctf,
  onClose,
}: {
  windowId: string
  ctfId: string
  ctf: CTFResponse
  onClose: () => void
}) {
  const { data: ctfDetails, loading: detailLoading, error: detailError } = useCTFDetails(ctfId)
  const { windows } = useWindow()

  return (
    <Window
      id={windowId}
      title={ctf ? `${ctf.title} - Details` : "CTF Details"}
      defaultSize={{ width: 1000, height: 700 }}
      minSize={{ width: 320, height: 400 }}
      onOpenChange={(open) => {
        if (!open) {
          // If the window still exists in the provider, it's minimized, not closed.
          if (windows.some((w) => w.id === windowId)) return
          onClose()
        }
      }}
    >
      <div className="flex flex-col h-full">
        {detailLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <p className="ml-3 text-muted-foreground">Loading CTF details...</p>
          </div>
        ) : detailError ? (
          <div className="p-8 text-center">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>Failed to load CTF details: {detailError}</AlertDescription>
            </Alert>
          </div>
        ) : (
          ctfDetails && (
            <>
              {/* Header */}
              <div className="p-4 sm:p-6 border-b border-primary/20 bg-gradient-to-r from-primary/5 to-transparent flex-shrink-0">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  {/* Left side - CTF info */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <Avatar className="h-16 w-16 sm:h-20 sm:w-20 flex-shrink-0 ring-4 ring-primary/30 shadow-lg">
                      <CachedAvatarImage
                        src={ctfDetails.logo || "/placeholder.svg"}
                        loadingPlaceholder={
                          <div className="w-4 h-4 border border-muted-foreground border-t-transparent rounded-full animate-spin" />
                        }
                      />
                      <AvatarFallback className="bg-primary/20 text-foreground text-lg sm:text-xl">
                        {ctfDetails.title.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-xl sm:text-2xl font-bold text-primary font-[family-name:var(--font-playfair)] mb-2 line-clamp-2">
                        {ctfDetails.title}
                      </h2>
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="text-sm text-muted-foreground">
                          {ctfDetails.organizer} • {ctfDetails.format}
                        </span>
                        <Badge variant="secondary" className="text-foreground bg-primary/10 border-primary/20 text-xs">
                          Weight: {ctfDetails.weight}
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
                        window.open(ctfDetails.url, "_blank")
                      }}
                    >
                      <ExternalLink className="w-3 h-3 sm:w-4 sm:h-4" />
                      <span className="hidden sm:inline">Visit CTF Website</span>
                      <span className="sm:hidden">Website</span>
                    </Button>
                    <div className="text-right text-sm">
                      <div className="font-bold text-xl sm:text-2xl text-primary">
                        {ctfDetails.communityStats.uniqueParticipants}
                      </div>
                      <div className="text-xs text-muted-foreground">Participants</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                <div className="space-y-6">
                  {ctfDetails.description && (
                    <div>
                      <h4 className="font-semibold mb-3 text-primary flex items-center gap-2 text-sm sm:text-base">
                        Description
                      </h4>
                      <p className="text-muted-foreground text-sm bg-gradient-to-r from-muted/50 to-transparent p-4 border border-primary/10">
                        {ctfDetails.description}
                      </p>
                    </div>
                  )}

                  <div>
                    <h4 className="font-semibold mb-3 text-primary flex items-center gap-2 text-sm sm:text-base">
                      <Trophy className="w-4 h-4 sm:w-5 sm:h-5" />
                      Community Participation
                    </h4>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                      <Card className="bg-gradient-to-br from-chart-3/10 to-chart-3/5 border border-chart-3/20">
                        <CardContent className="p-3 sm:p-4 text-center">
                          <div className="text-xl sm:text-2xl font-bold text-chart-3 mb-1">
                            {ctfDetails.communityStats.uniqueParticipants}
                          </div>
                          <div className="text-xs text-muted-foreground">Participants</div>
                        </CardContent>
                      </Card>
                      <Card className="bg-gradient-to-br from-chart-2/10 to-chart-2/5 border border-chart-2/20">
                        <CardContent className="p-3 sm:p-4 text-center">
                          <div className="text-xl sm:text-2xl font-bold text-chart-2 mb-1">
                            {ctfDetails.communityStats.totalSolves}
                          </div>
                          <div className="text-xs text-muted-foreground">Total Solves</div>
                        </CardContent>
                      </Card>
                      <Card className="bg-gradient-to-br from-chart-4/10 to-chart-4/5 border border-chart-4/20">
                        <CardContent className="p-3 sm:p-4 text-center">
                          <div className="text-xl sm:text-2xl font-bold text-chart-4 mb-1">
                            {ctfDetails.communityStats.challengesSolved}
                          </div>
                          <div className="text-xs text-muted-foreground">Challenges</div>
                        </CardContent>
                      </Card>
                      <Card className="bg-gradient-to-br from-chart-1/10 to-chart-1/5 border border-chart-1/20">
                        <CardContent className="p-3 sm:p-4 text-center">
                          <div className="text-xl sm:text-2xl font-bold text-chart-1 mb-1">
                            {ctfDetails.communityStats.categoriesCovered}
                          </div>
                          <div className="text-xs text-muted-foreground">Categories</div>
                        </CardContent>
                      </Card>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-3 text-primary flex items-center gap-2 text-sm sm:text-base">
                      <Badge className="w-4 h-4 sm:w-5 sm:h-5" />
                      Categories
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {ctfDetails.communityStats.categories.map((category) => (
                        <Badge
                          key={category}
                          variant="secondary"
                          className="text-foreground bg-primary/10 border-primary/20"
                        >
                          {category}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-3 text-primary flex items-center gap-2 text-sm sm:text-base">
                      <Trophy className="w-4 h-4 sm:w-5 sm:h-5" />
                      Top Performers
                    </h4>
                    <div className="space-y-3">
                      {ctfDetails.leaderboard.map((player) => (
                        <Card key={player.user.userId} className="p-3 sm:p-4 hover:bg-muted/50 transition-colors">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <div className="flex items-center justify-center w-8 h-8 bg-primary/20 text-primary font-bold text-sm flex-shrink-0">
                                #{player.rank}
                              </div>
                              <span className="font-medium truncate text-foreground">
                                {player.user.displayName || player.user.username}
                              </span>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <div className="font-semibold text-primary">{player.score.toFixed(1)}</div>
                              <div className="text-xs text-muted-foreground">{player.solves} solves</div>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )
        )}
      </div>
    </Window>
  )
}

export function CTFList() {
  const [selectedCTFs, setSelectedCTFs] = useState<Map<string, { ctfId: string; ctf: CTFResponse }>>(new Map())
  const [searchInput, setSearchInput] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | NonNullable<CTFsParams["status"]>>("all")
  const [formatFilter, setFormatFilter] = useState<string>("all")
  const [offset, setOffset] = useState(0)
  const limit = 20

  const debounceTimeoutRef = useRef<NodeJS.Timeout>()

  const { openWindow } = useWindow()

  const {
    data: ctfsData,
    loading,
    error,
    updateParams,
  } = useCTFs({
    limit,
    offset: 0,
    hasParticipation: true,
    sortBy: "start_desc",
  })

  useEffect(() => {
    if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current)

    debounceTimeoutRef.current = setTimeout(() => {
      // Reset pagination when filters/search change.
      setOffset(0)
      updateParams({
        limit,
        offset: 0,
        q: searchInput.trim() ? searchInput.trim() : undefined,
        status: statusFilter === "all" ? undefined : statusFilter,
        format: formatFilter === "all" ? undefined : formatFilter,
      })
    }, 400)

    return () => {
      if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current)
    }
  }, [searchInput, statusFilter, formatFilter, limit, updateParams])

  const pagination = useMemo(() => {
    const total = ctfsData?.metadata?.total ?? 0
    const returned = ctfsData?.metadata?.returned ?? 0
    const hasNext =
      ctfsData?.metadata?.hasNextPage ?? (offset + returned < total && returned > 0)
    const hasPrev = ctfsData?.metadata?.hasPreviousPage ?? offset > 0
    return { total, returned, hasNext, hasPrev }
  }, [ctfsData?.metadata, offset])

  const handleCTFClick = (ctfId: string) => {
    const ctf = (ctfsData?.data || []).find((c) => c.ctf_id === ctfId)
    if (!ctf) return

    const windowId = `ctf-details-${ctfId}-${Date.now()}`
    const windowTitle = `${ctf.title} - Details`

    setSelectedCTFs((prev) => new Map(prev.set(windowId, { ctfId, ctf })))
    openWindow(windowId, windowTitle)
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
        {[...Array(3)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="h-4 bg-muted rounded w-1/3 mb-2"></div>
              <div className="h-3 bg-muted rounded w-2/3 mb-4"></div>
              <div className="flex gap-2">
                <div className="h-6 bg-muted rounded w-16"></div>
                <div className="h-6 bg-muted rounded w-20"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Failed to load CTF data: {error}</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Search CTFs..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="upcoming">Upcoming</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={formatFilter} onValueChange={setFormatFilter}>
            <SelectTrigger className="w-full sm:w-[140px]">
              <SelectValue placeholder="Format" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Formats</SelectItem>
              <SelectItem value="jeopardy">Jeopardy</SelectItem>
              <SelectItem value="attack-defense">Attack-Defense</SelectItem>
              <SelectItem value="mixed">Mixed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {ctfsData?.metadata && (
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <div>
              Showing <span className="font-medium text-foreground">{ctfsData.metadata.returned}</span> of{" "}
              <span className="font-medium text-foreground">{ctfsData.metadata.total}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!pagination.hasPrev || loading}
                onClick={() => {
                  const nextOffset = Math.max(0, offset - limit)
                  setOffset(nextOffset)
                  updateParams({ offset: nextOffset, limit })
                }}
                className="h-7 px-2 text-xs"
              >
                Prev
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!pagination.hasNext || loading}
                onClick={() => {
                  const nextOffset = offset + limit
                  setOffset(nextOffset)
                  updateParams({ offset: nextOffset, limit })
                }}
                className="h-7 px-2 text-xs"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-4">
        {(ctfsData?.data || []).map((ctf) => (
          <Card
            key={ctf.ctf_id}
            className="hover:bg-muted/50 transition-all duration-200 cursor-pointer border-2 border-transparent hover:border-primary/20 shadow-lg hover:shadow-xl"
            onClick={() => handleCTFClick(ctf.ctf_id)}
          >
            <CardContent className="p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row items-start gap-4">
                <div className="flex items-start gap-4 flex-1 min-w-0">
                  <Avatar className="h-12 w-12 flex-shrink-0 ring-2 ring-primary/20 shadow-md">
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

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-1">
                      <h3 className="font-semibold text-lg text-foreground truncate">{ctf.title}</h3>
                      <Badge className={`text-xs ${getStatusColor(ctf.schedule.status)} w-fit`}>
                        {ctf.schedule.status}
                      </Badge>
                    </div>

                    <p className="text-sm text-muted-foreground mb-2">by {ctf.organizer}</p>

                    <div className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center gap-2 sm:gap-4 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        <span className="whitespace-nowrap">
                          {formatDate(ctf.schedule.start)} - {formatDate(ctf.schedule.finish)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        <span className="whitespace-nowrap">{ctf.participants.toLocaleString()} participants</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Trophy className="h-3 w-3" />
                        <span className="whitespace-nowrap">Weight: {ctf.weight}</span>
                      </div>
                      {ctf.location && (
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          <span className="truncate max-w-[150px]">{ctf.location}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-left sm:text-right w-full sm:w-auto">
                  <div className="text-sm font-medium text-primary">
                    {ctf.communityParticipation.uniqueParticipants} players
                  </div>
                  <div className="text-xs text-muted-foreground">{ctf.communityParticipation.totalSolves} solves</div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {!loading && (ctfsData?.data?.length || 0) === 0 && (
        <Card className="p-6">
          <div className="text-center text-muted-foreground">
            <Target className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium mb-2">No results</p>
            <p>Try a different search or filter.</p>
          </div>
        </Card>
      )}

      {Array.from(selectedCTFs.entries()).map(([windowId, { ctfId, ctf }]) => (
        <CTFDetailsWindow
          key={windowId}
          windowId={windowId}
          ctfId={ctfId}
          ctf={ctf}
          onClose={() => {
            setSelectedCTFs((prev) => {
              const newMap = new Map(prev)
              newMap.delete(windowId)
              return newMap
            })
          }}
        />
      ))}
    </div>
  )
}
