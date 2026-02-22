"use client"

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Window, useWindow } from "@/components/ui/window"
import { Avatar, AvatarFallback, CachedAvatarImage } from "@/components/ui/avatar"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Calendar, Users, Trophy, ExternalLink, Search, MapPin, AlertCircle, Target, X } from "lucide-react"
import { getStatusColor, formatDate } from "@/lib/format-helpers"
import { useCTFs } from "@/hooks/useAPI"
import type { CTFsParams, CTFResponse } from "@/lib/types"
import { CTFDetailsWindow } from "./ctf-details-window"

const CTFCardItem = React.memo(({ ctf, onClick }: { ctf: CTFResponse; onClick: (id: string) => void }) => (
  <Card
    className="glass-card group hover:scale-[1.01] transition-all duration-300 cursor-pointer border-t-white/5 border-l-white/5 hover:border-primary/40 relative overflow-hidden shadow-lg hover:shadow-xl hover:neon-glow-primary"
    onClick={() => onClick(ctf.ctf_id)}
  >
    <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-2xl -translate-y-10 translate-x-10 group-hover:bg-primary/20 transition-colors duration-500 pointer-events-none" />
    <CardContent className="p-4 sm:p-6 relative z-10">
      <div className="flex flex-col sm:flex-row items-start gap-4">
        <div className="flex items-start gap-4 flex-1 min-w-0">
          <Avatar className="h-12 w-12 flex-shrink-0 ring-2 ring-primary/20 shadow-[0_0_15px_-3px_var(--primary)]">
            <CachedAvatarImage
              src={ctf.logo || "/placeholder.svg"}
              loadingPlaceholder={
                <div className="w-3 h-3 border border-muted-foreground border-t-transparent rounded-full animate-spin" />
              }
            />
            <AvatarFallback className="bg-primary/20 text-foreground font-bold">
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
))
CTFCardItem.displayName = "CTFCardItem"
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
  }, [searchInput, statusFilter, formatFilter, limit])

  const pagination = useMemo(() => {
    const total = ctfsData?.metadata?.total ?? 0
    const returned = ctfsData?.metadata?.returned ?? 0
    const hasNext =
      ctfsData?.metadata?.hasNextPage ?? (offset + returned < total && returned > 0)
    const hasPrev = ctfsData?.metadata?.hasPreviousPage ?? offset > 0
    return { total, returned, hasNext, hasPrev }
  }, [ctfsData?.metadata, offset])

  const handleCTFClick = useCallback((ctfId: string) => {
    const ctf = (ctfsData?.data || []).find((c) => c.ctf_id === ctfId)
    if (!ctf) return

    const windowId = `ctf-details-${ctfId}-${Date.now()}`
    const windowTitle = `${ctf.title} - Details`

    setSelectedCTFs((prev) => new Map(prev.set(windowId, { ctfId, ctf })))
    openWindow(windowId, windowTitle)
  }, [ctfsData?.data, openWindow])

  const closeWindow = useCallback((windowId: string) => {
    setSelectedCTFs((prev) => {
      const newMap = new Map(prev)
      newMap.delete(windowId)
      return newMap
    })
  }, [])



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
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Search CTFs..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-10"
          />
          {loading && searchInput && (
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
          )}
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Select value={statusFilter} onValueChange={(val) => setStatusFilter(val as any)}>
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
        {loading && (ctfsData?.data?.length || 0) === 0 ? (
          // Skeleton loading
          [...Array(3)].map((_, i) => (
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
          ))
        ) : (
          (ctfsData?.data || []).map((ctf) => (
            <CTFCardItem key={ctf.ctf_id} ctf={ctf} onClick={handleCTFClick} />
          ))
        )}
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
          onClose={() => closeWindow(windowId)}
        />
      ))}
    </div>
  )
}
